/**
 * In-chat platform OAuth for the cloud worker — the zero-local-install path.
 *
 * Flow (fully agent-mediated, works from claude.ai/custom connectors):
 *   1. Agent calls platform_oauth_url("youtube") → returns { handle, url }
 *   2. Human opens url, approves on the platform
 *   3. Platform redirects to the worker's OWN redirect URI — human copies the
 *      full redirected URL and pastes it back to the agent
 *   4. Agent calls platform_oauth_exchange(handle, pasted_url) → tokens are
 *      exchanged server-side and stored encrypted, bound to this vault user
 *
 * Pending flows live in an in-isolate Map with a 10-minute TTL; if the isolate
 * recycles mid-flow the agent simply reissues the URL (cheap retry).
 */
import type { D1Vault } from "./vault.ts";

type Creds = Record<string, string>;

interface PendingFlow {
  platform: string;
  state: string;
  verifier?: string; // PKCE (TikTok)
  createdAt: number;
}

const pending = new Map<string, PendingFlow>();
const TTL_MS = 10 * 60_000;

// Deployment origin (e.g. https://socials-mcp-cloud.workers.dev) — stably cached
// from any request; used to build OAuth redirect URIs.
let DEPLOY_ORIGIN = "";
export function setDeployOrigin(origin: string): void {
  if (origin.startsWith("http")) DEPLOY_ORIGIN = origin;
}
export function getDeployOrigin(): string {
  return DEPLOY_ORIGIN;
}

function sweep(): void {
  const now = Date.now();
  for (const [k, v] of pending) if (now - v.createdAt > TTL_MS) pending.delete(k);
}

export interface OAuthEnvShape {
  SOCIALS_GOOGLE_CLIENT_ID?: string;
  SOCIALS_GOOGLE_CLIENT_SECRET?: string;
  SOCIALS_META_APP_ID?: string;
  SOCIALS_META_APP_SECRET?: string;
  SOCIALS_TIKTOK_CLIENT_KEY?: string;
  SOCIALS_TIKTOK_CLIENT_SECRET?: string;
}

/** A var counts as set only when present and not a CHANGE_ME placeholder (see .env.example). */
export const configured = (v?: string): boolean => !!v && !v.startsWith("CHANGE_ME");

export function platformConfigured(env: OAuthEnvShape, platform: string): boolean {
  switch (platform) {
    case "youtube": return configured(env.SOCIALS_GOOGLE_CLIENT_ID) && configured(env.SOCIALS_GOOGLE_CLIENT_SECRET);
    case "meta": return configured(env.SOCIALS_META_APP_ID) && configured(env.SOCIALS_META_APP_SECRET);
    case "tiktok": return configured(env.SOCIALS_TIKTOK_CLIENT_KEY) && configured(env.SOCIALS_TIKTOK_CLIENT_SECRET);
    default: return false;
  }
}

const GRAPH = "https://graph.facebook.com/v22.0";
const b64url = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function pkcePair(): Promise<{ verifier: string; challenge: string }> {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)).buffer);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: b64url(digest) };
}

/** Build the consent URL. redirectBase = e.g. https://my-worker.workers.dev */
export async function startPlatformOAuth(vault: D1Vault, env: OAuthEnvShape & Record<string, string>, platform: string, requestOrigin: string): Promise<{ handle: string; url: string }> {
  if (!platformConfigured(env, platform)) {
    throw new Error(`${platform} app credentials not configured on this deployment yet — the operator must set them (see /setup).`);
  }
  sweep();
  const state = crypto.randomUUID().replace(/-/g, "");
  const redirectUri = `${requestOrigin}/oauth/${platform}/done`;
  let url: string;

  if (platform === "youtube") {
    const scopes = ["https://www.googleapis.com/auth/youtube.readonly", "https://www.googleapis.com/auth/yt-analytics.readonly"].join(" ");
    url =
      `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(env.SOCIALS_GOOGLE_CLIENT_ID!)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes)}` +
      `&access_type=offline&prompt=consent&state=${state}`;
  } else if (platform === "meta") {
    const scopes = ["instagram_basic", "instagram_manage_insights", "pages_show_list", "pages_read_engagement", "business_management"].join(",");
    url =
      `${GRAPH}/dialog/oauth?client_id=${encodeURIComponent(env.SOCIALS_META_APP_ID!)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes)}&state=${state}`;
  } else {
    const { verifier, challenge } = await pkcePair();
    const scopes = ["user.info.basic", "user.info.stats", "video.list"].join(",");
    url =
      `https://www.tiktok.com/v2/auth/authorize/?client_key=${encodeURIComponent(env.SOCIALS_TIKTOK_CLIENT_KEY!)}` +
      `&scope=${encodeURIComponent(scopes)}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${state}&code_challenge=${challenge}&code_challenge_method=S256`;
    pending.set(state, { platform, state, verifier, createdAt: Date.now() });
    return finishStart(vault, platform, state, url);
  }
  pending.set(state, { platform, state, createdAt: Date.now() });
  return finishStart(vault, platform, state, url);
}

function finishStart(_vault: D1Vault, platform: string, state: string, url: string) {
  const handle = `${platform}-${state.slice(0, 12)}`;
  pending.set(`handle:${handle}`, pending.get(state)!);
  return { handle, url };
}

/** Exchange the pasted redirect URL for tokens and store them on the caller's vault. */
export async function completePlatformOAuth(
  vault: D1Vault,
  env: OAuthEnvShape & Record<string, string>,
  origin: string,
  handle: string,
  pastedUrl: string
): Promise<Record<string, unknown>> {
  sweep();
  const flow = pending.get(`handle:${handle}`);
  if (!flow) throw new Error("Unknown or expired connect handle — call platform_oauth_url again.");
  const u = new URL(pastedUrl);
  const code = u.searchParams.get("code");
  const err = u.searchParams.get("error_description") ?? u.searchParams.get("error");
  if (err || !code) throw new Error(`Authorization failed: ${err ?? "no code in URL"}`);
  const state = u.searchParams.get("state");
  if (!state || state !== flow.state) throw new Error("State mismatch — restart the connect flow.");

  const redirectUri = `${origin}/oauth/${flow.platform}/done`;
  let creds: Creds;

  if (flow.platform === "youtube") {
    const t = await api<{ access_token: string; refresh_token?: string; expires_in: number }>("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code, client_id: env.SOCIALS_GOOGLE_CLIENT_ID!, client_secret: env.SOCIALS_GOOGLE_CLIENT_SECRET!,
        redirect_uri: redirectUri, grant_type: "authorization_code",
      }).toString(),
    });
    const ch = await api<{ items?: Array<{ id: string; snippet: { title: string; customUrl?: string } }> }>(
      `https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true`, { headers: { Authorization: `Bearer ${t.access_token}` } });
    const channel = ch.items?.[0];
    if (!channel) throw new Error("No YouTube channel on this Google account.");
    creds = {
      accessToken: t.access_token, refreshToken: t.refresh_token,
      expiresAt: new Date(Date.now() + t.expires_in * 1000).toISOString(),
      extra_channelId: channel.id, extra_channelTitle: channel.snippet.title,
    };
    const acct = await vault.upsertAccount("youtube", channel.id, channel.snippet.customUrl, creds);
    return { connected: "youtube", account: acct, next: "Run snapshot to pull your analytics." };
  }

  if (flow.platform === "meta") {
    const ex = await api<{ access_token: string }>(
      `${GRAPH}/oauth/access_token?client_id=${env.SOCIALS_META_APP_ID}&client_secret=${env.SOCIALS_META_APP_SECRET}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${encodeURIComponent(code)}`);
    const long = await api<{ access_token: string; expires_in?: number }>(
      `${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${env.SOCIALS_META_APP_ID}&client_secret=${env.SOCIALS_META_APP_SECRET}&fb_exchange_token=${ex.access_token}`);
    const pages = await api<{ data?: Array<{ id: string; name: string; instagram_business_account?: { id: string; username?: string } }> }>(
      `${GRAPH}/me/accounts?fields=id,name,instagram_business_account{id,username}&access_token=${encodeURIComponent(long.access_token)}`);
    const out: Record<string, unknown> = {};
    for (const page of pages.data ?? []) {
      const base: Creds = { accessToken: long.access_token, expiresAt: long.expires_in ? new Date(Date.now() + long.expires_in * 1000).toISOString() : undefined, extra_pageId: page.id };
      out.facebook = await vault.upsertAccount("facebook", page.id, page.name, base);
      if (page.instagram_business_account) {
        out.instagram = await vault.upsertAccount("instagram", page.instagram_business_account.id, page.instagram_business_account.username, { ...base, extra_igUserId: page.instagram_business_account.id });
      }
    }
    return { connected: ["facebook", ...(out.instagram ? ["instagram"] : [])], accounts: out, next: "Run snapshot." };
  }

  // tiktok
  const t = await api<{ access_token: string; refresh_token?: string; open_id: string; expires_in?: number; scope?: string }>("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: env.SOCIALS_TIKTOK_CLIENT_KEY!, client_secret: env.SOCIALS_TIKTOK_CLIENT_SECRET!,
      code, grant_type: "authorization_code", redirect_uri: redirectUri, code_verifier: flow.verifier!,
    }).toString(),
  });
  const ui = await api<{ data?: { user?: { open_id: string; display_name?: string; username?: string } } }>(
    `https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,username`, { headers: { Authorization: `Bearer ${t.access_token}` } });
  const user = ui.data?.user ?? { open_id: t.open_id };
  creds = { accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: t.expires_in ? new Date(Date.now() + t.expires_in * 1000).toISOString() : undefined, extra_open_id: t.open_id };
  const acct = await vault.upsertAccount("tiktok", t.open_id, user.username ?? user.display_name, creds);
  pending.delete(`handle:${handle}`);
  return { connected: "tiktok", account: acct, next: "Run snapshot; import weekly Studio CSVs locally for retention depth." };

  async function api<T>(url2: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url2, init);
    const text = await res.text();
    try {
      const body = JSON.parse(text);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
      return body as T;
    } catch (e) {
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
      throw e;
    }
  }
}

/** Friendly no-CLI setup checklist served at GET /setup. Never echoes secret values. */
export function setupPage(origin: string, env: Record<string, string | undefined>): Response {
  const rows: Array<[string[], string]> = [
    [["GOOGLE_LOGIN_CLIENT_ID"], "MCP sign-in (Google OAuth client)"],
    [["GOOGLE_LOGIN_CLIENT_SECRET"], "MCP sign-in secret"],
    [["TOKEN_ENCRYPTION_KEY"], "Vault token encryption (openssl rand -hex 32)"],
    [["SOCIALS_GOOGLE_CLIENT_ID", "SOCIALS_GOOGLE_CLIENT_SECRET"], "YouTube data app (same client as sign-in works)"],
    [["SOCIALS_META_APP_ID", "SOCIALS_META_APP_SECRET"], "Instagram + Facebook app"],
    [["SOCIALS_TIKTOK_CLIENT_KEY", "SOCIALS_TIKTOK_CLIENT_SECRET"], "TikTok app"],
  ];
  const list = rows
    .map(([keys, d]) => {
      const allSet = keys.every((k) => configured(env[k]));
      const label = keys.join(" / ");
      return `<tr><td><code>${label}</code></td><td>${d}</td><td>${allSet ? "✅ set" : "⬜ <b>Settings → Variables → Add</b> (encrypt secrets)"}</td></tr>`;
    })
    .join("\n");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>socials-mcp — setup</title>
<style>body{font-family:-apple-system,system-ui,sans-serif;max-width:760px;margin:40px auto;padding:0 20px;line-height:1.5;color:#111}
code{background:#f4f4f5;padding:2px 6px;border-radius:4px;font-size:.9em}
table{border-collapse:collapse;width:100%;margin:16px 0}td,th{border:1px solid #e4e4e7;padding:8px;text-align:left;font-size:.95em}
h1{font-size:1.5rem}.step{margin:24px 0;padding:16px;border:1px solid #e4e4e7;border-radius:8px}
.url{background:#0f172a;color:#a5f3fc;padding:10px;border-radius:6px;word-break:break-all;font-family:monospace;font-size:.85em}</style></head><body>
<h1>🛠 socials-mcp — deployment setup</h1>
<p>This is your private deployment. Finish these steps, then your agents connect to the MCP URL below. No local installation required.</p>

<div class="step"><h3>1 · Set variables & secrets</h3><p>Cloudflare dashboard → <b>Workers → socials-mcp-cloud → Settings → Variables</b>. Encrypt anything marked secret.</p>
<table><tr><th>Name(s)</th><th>Purpose</th><th>Status</th></tr>${list}</table>
<p>Generate an encryption key: <code>openssl rand -hex 32</code> — or any 64-char hex string.</p></div>

<div class="step"><h3>1b · Register redirect URIs in each platform app</h3>
<p>This deployment builds consent links that return to <b>this URL</b>. Add these exact values to each platform's developer app (local installs use <code>http://127.0.0.1:8399/callback</code> instead — see docs/onboarding-*).</p>
<table>
<tr><th>Platform app</th><th>Add this authorized redirect URI</th></tr>
<tr><td>Google client used for <b>MCP sign-in</b> (must be type <b>Web application</b>)</td><td><code>${origin}/callback</code></td></tr>
<tr><td>Google client for <b>YouTube data</b> (same client is fine)</td><td><code>${origin}/oauth/youtube/done</code></td></tr>
<tr><td>Meta app → Facebook Login → Valid OAuth Redirect URIs</td><td><code>${origin}/oauth/meta/done</code></td></tr>
<tr><td>TikTok app → Login Kit → Redirect URI</td><td><code>${origin}/oauth/tiktok/done</code></td></tr>
</table>
<p>If a consent screen ever says <i>redirect_uri_mismatch</i>, that platform's URI above is missing or differs byte-for-byte.</p></div>

<div class="step"><h3>2 · Your MCP URL (paste into any agent)</h3>
<div class="url">${origin}/mcp</div>
<p>Claude.ai/web: <b>Settings → Connectors → Add custom connector</b> → paste the URL.<br>
Claude Code: <code>claude mcp add --transport http socials ${origin}/mcp</code><br>
Codex: <code>[mcp_servers.socials] url = "${origin}/mcp"</code> then <code>codex mcp login socials</code>.</p></div>

<div class="step"><h3>3 · Install the skills (optional but recommended)</h3>
<p>Download <code>.skill</code> bundles from <a href="https://github.com/aryaminus/socials-assistant/releases/latest">GitHub Releases</a> → claude.ai <b>Settings → Capabilities → Skills → +</b>. Skills teach the agent the workflows (digest, script review, outreach).</p></div>

<div class="step"><h3>4 · Connect your platforms — inside the chat</h3>
<p>In your agent: ask to <i>"connect my youtube / instagram / tiktok"</i>. The agent issues an approval link (tool: <code>platform_oauth_url</code>); approve it in the browser; paste the redirected URL back (tool: <code>platform_oauth_exchange</code>). Then say <i>"snapshot my accounts"</i>.</p></div>

<p style="color:#71717a;font-size:.85em">Health: <a href="/health">/health</a> · Version: <a href="/version">/version</a> · This page exposes no secret values.</p>
</body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
