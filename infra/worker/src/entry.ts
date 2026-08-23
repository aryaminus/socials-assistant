import OAuthProvider from "@cloudflare/agents/oauth-provider";
import { GoogleHandler } from "@cloudflare/agents/google-handler";
import { SocialsMCP, type Env } from "./src/index.ts";
import { setupPage, setDeployOrigin } from "./src/platform-oauth.ts";

export { SocialsMCP };

const provider = new OAuthProvider({
  apiRoute: "/mcp",
  apiHandler: SocialsMCP.mount("/mcp"),
  // @ts-expect-error — handler signature differs across @cloudflare/agents versions; verify at deploy
  defaultHandler: (req: Request, env: Env, _ctx: unknown) =>
    GoogleHandler(req, {
      clientId: env.GOOGLE_LOGIN_CLIENT_ID,
      clientSecret: env.GOOGLE_LOGIN_CLIENT_SECRET,
      scope: "openid email profile",
    }, env.OAUTH_KV),
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  clientRegistrationEndpoint: "/register",
});

export default {
  fetch(req: Request, env: Env, ctx: unknown): Response | Promise<Response> {
    const url = new URL(req.url);
    // Warm the deployment-origin cache used to build platform-OAuth redirect URIs
    setDeployOrigin(url.origin);

    if (url.pathname === "/setup") {
      return setupPage(url.origin, env as unknown as Record<string, string | undefined>);
    }

    // Platform-OAuth landing page: platforms redirect here after approval;
    // show paste-back instructions (the exchange happens in-chat via tools).
    if (url.pathname.startsWith("/oauth/") && url.pathname.endsWith("/done")) {
      return new Response(
        `<!doctype html><html><body style="font-family:system-ui;max-width:640px;margin:60px auto"><h2>Almost done ✅</h2>
<p>Copy <b>this entire URL</b> from the address bar and paste it back to your agent — it finishes connecting securely.</p>
<p style="background:#0f172a;color:#a5f3fc;padding:10px;border-radius:6px;font-family:monospace;font-size:.8em;word-break:break-all">${req.url}</p></body></html>`,
        { headers: { "content-type": "text/html; charset=utf-8" } }
      );
    }

    return provider.fetch(req, env, ctx);
  },
};
