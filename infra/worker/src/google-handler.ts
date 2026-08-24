// Google sign-in handler for the MCP OAuth provider.
// Pattern follows Cloudflare's official examples: a Hono app that the
// OAuthProvider forwards /authorize (and other non-API routes) to.
// The upstream Google leg redirects back to <worker-origin>/callback.
import type { AuthRequest, OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { Hono } from "hono";
import { configured } from "./platform-oauth.ts";

interface Env {
  OAUTH_PROVIDER: OAuthHelpers;
  OAUTH_KV: KVNamespace;
  GOOGLE_LOGIN_CLIENT_ID?: string;
  GOOGLE_LOGIN_CLIENT_SECRET?: string;
}

const STATE_TTL = 600; // seconds
const SCOPES = "openid email profile";

const app = new Hono<{ Bindings: Env }>();

async function sha256(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
    return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function errorPage(title: string, hint: string): Response {
  return new Response(
    `<!doctype html><html><body style="font-family:system-ui;max-width:560px;margin:60px auto;padding:0 20px">
<h2>${title}</h2><p>${hint}</p>
<p style="color:#71717a;font-size:.9em">Setup checklist: <a href="/setup">/setup</a></p></body></html>`,
    { status: 400, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

// Step 1: MCP client hit /authorize → send the human to Google
app.get("/authorize", async (c) => {
  const clientId = c.env.GOOGLE_LOGIN_CLIENT_ID;
  const clientSecret = c.env.GOOGLE_LOGIN_CLIENT_SECRET;
  if (!configured(clientId) || !configured(clientSecret)) {
    return errorPage(
      "Sign-in not configured",
      "This deployment has no Google sign-in credentials yet. The operator must set <code>GOOGLE_LOGIN_CLIENT_ID</code> and <code>GOOGLE_LOGIN_CLIENT_SECRET</code> (Google OAuth client, <b>Web application</b> type) in the Cloudflare dashboard — see the checklist at /setup.",
    );
  }

  const oauthReqInfo: AuthRequest = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);
  const clientInfo = await c.env.OAUTH_PROVIDER.lookupClient(oauthReqInfo.clientId);
  if (!clientInfo) return errorPage("Invalid client", "Unknown MCP client_id in the authorization request.");

  // CSRF state: random token in an HttpOnly cookie, mirrored in KV bound to the OAuth request
  const state = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  await c.env.OAUTH_KV.put(
    `google-oauth-state:${await sha256(state)}`,
    JSON.stringify({ oauthReqInfo, ts: Date.now() }),
    { expirationTtl: STATE_TTL },
  );

  const redirectUri = new URL("/callback", c.req.url).href;
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId!);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", SCOPES);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("prompt", "select_account");

  const res = c.redirect(authUrl.toString(), 302);
  res.headers.append(
    "set-cookie",
    `socials_oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${STATE_TTL}`,
  );
  return res;
});

// Step 2: Google sends the human back with ?code → exchange, identify, complete the MCP grant
app.get("/callback", async (c) => {
  const clientId = c.env.GOOGLE_LOGIN_CLIENT_ID;
  const clientSecret = c.env.GOOGLE_LOGIN_CLIENT_SECRET;
  if (!configured(clientId) || !configured(clientSecret)) {
    return errorPage("Sign-in not configured", "Set GOOGLE_LOGIN_CLIENT_ID/SECRET in the dashboard (see /setup), then retry connecting your agent.");
  }

  const code = c.req.query("code");
  const state = c.req.query("state");
  const cookieState = c.req.header("cookie")
    ?.split(";").map((s) => s.trim()).find((s) => s.startsWith("socials_oauth_state="))
    ?.slice("socials_oauth_state=".length);

  if (!code || !state || !cookieState || state !== cookieState) {
    return errorPage("Expired or invalid sign-in", "The sign-in link expired or was opened in a different browser. Close this page and retry the connection from your agent.");
  }

  const kvKey = `google-oauth-state:${await sha256(state)}`;
  const stored = await c.env.OAUTH_KV.get(kvKey);
  if (!stored) return errorPage("Expired or invalid sign-in", "Sign-in state expired (10-minute window). Retry the connection from your agent.");
  await c.env.OAUTH_KV.delete(kvKey);
  const { oauthReqInfo } = JSON.parse(stored) as { oauthReqInfo: AuthRequest };

  // Exchange the code (redirect_uri must match the /authorize leg byte-for-byte)
  const redirectUri = new URL("/callback", c.req.url).href;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId!,
      client_secret: clientSecret!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) {
    const detail = await tokenRes.text();
    return errorPage(
      "Google rejected the sign-in",
      tokenRes.status === 400 && detail.includes("redirect_uri_mismatch")
        ? "The Google OAuth client is missing the authorized redirect URI <code>" + redirectUri + "</code>. Add it in Google Cloud Console → Credentials → your Web-application client, then retry. (Full list on /setup.)"
        : "Google returned an error during sign-in. Check that the client secret matches the dashboard, then retry.",
    );
  }
  const tokens = (await tokenRes.json()) as { access_token: string };
  const userinfoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { authorization: `Bearer ${tokens.access_token}` },
  });
  if (!userinfoRes.ok) return errorPage("Sign-in failed", "Could not read your Google profile. Retry in a moment.");
  const user = (await userinfoRes.json()) as { sub: string; email?: string; name?: string; picture?: string };

  const clientInfo = await c.env.OAUTH_PROVIDER.lookupClient(oauthReqInfo.clientId);
  const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
    request: oauthReqInfo,
    userId: `google:${user.sub}`,
    metadata: {
      label: user.email ?? "Socials Assistant user",
      clientName: clientInfo?.clientName ?? "MCP Client",
    },
    scope: oauthReqInfo.scope,
    props: { userId: user.sub, email: user.email, name: user.name, picture: user.picture },
  });

  return c.redirect(redirectTo, 302);
});

app.get("/", (c) => c.redirect("/setup", 302));

export { app as GoogleHandler };
