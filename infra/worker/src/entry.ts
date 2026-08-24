import { OAuthProvider } from "@cloudflare/workers-oauth-provider";
import { SocialsMCP, type Env } from "./index.ts";
import { setupPage, setDeployOrigin } from "./platform-oauth.ts";
import { GoogleHandler } from "./google-handler.ts";

export { SocialsMCP };

const SKILLS = ["socials-connect", "weekly-digest", "brand-outreach", "media-kit", "script-review", "publish-package"] as const;
const REPO = "aryaminus/socials-assistant";

const provider = new OAuthProvider({
  apiRoute: "/mcp",
  apiHandler: SocialsMCP.mount("/mcp"),
  // Everything that isn't /mcp or an OAuth endpoint goes to the Google
  // sign-in handler (Hono app) — it implements /authorize and /callback.
  defaultHandler: {
    fetch: (req: Request, env: Env, ctx: ExecutionContext) =>
      GoogleHandler.fetch(req, env as never, ctx as never),
  },
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  clientRegistrationEndpoint: "/register",
});

function setupPageResponse(origin: string, env: Record<string, string | undefined>): Response {
  return setupPage(origin, env);
}

function oauthDonePage(originalUrl: string): Response {
  return new Response(
    `<!doctype html><html><body style="font-family:system-ui;max-width:640px;margin:60px auto"><h2>Almost done</h2>
<p>Copy <b>this entire URL</b> from the address bar and paste it back to your agent — it finishes connecting securely.</p>
<p style="background:#0f172a;color:#a5f3fc;padding:10px;border-radius:6px;font-family:monospace;font-size:.8em;word-break:break-all">${originalUrl}</p></body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } }
  );
}

function skillsIndex(origin: string): Response {
  return Response.json(
    {
      description: "Skills available from this deployment. Each skill's SKILL.md is served directly from the repo.",
      local_install: "Download .skill bundles from https://github.com/aryaminus/socials-assistant/releases/latest",
      skills: SKILLS.map((s) => ({
        name: s,
        skill_md_url: `https://raw.githubusercontent.com/${REPO}/main/skills/${s}/SKILL.md`,
        description_url: `${origin}/skills/${s}`,
      })),
    },
    { headers: { "access-control-allow-origin": "*", "content-type": "application/json" } }
  );
}

function skillRedirect(skillName: string): Response {
  if (!SKILLS.includes(skillName as typeof SKILLS[number])) {
    return new Response(
      JSON.stringify({ error: "skill_not_found", available: [...SKILLS] }),
      { status: 404, headers: { "content-type": "application/json" } }
    );
  }
  // Redirect to the raw SKILL.md on GitHub — no need to embed in the worker
  return Response.redirect(
    `https://raw.githubusercontent.com/${REPO}/main/skills/${skillName}/SKILL.md`,
    302
  );
}

export default {
  fetch(req: Request, env: Env, ctx: unknown): Response | Promise<Response> {
    const url = new URL(req.url);
    setDeployOrigin(url.origin);

    // Self-service setup checklist
    if (url.pathname === "/setup") {
      return setupPageResponse(url.origin, env as unknown as Record<string, string | undefined>);
    }

    // Platform-OAuth landing page
    if (url.pathname.startsWith("/oauth/") && url.pathname.endsWith("/done")) {
      return oauthDonePage(req.url);
    }

    // Skills index + individual skill redirect
    if (url.pathname === "/skills") {
      return skillsIndex(url.origin);
    }
    if (url.pathname.startsWith("/skills/")) {
      const skillName = url.pathname.split("/").pop() ?? "";
      return skillRedirect(skillName);
    }

    // Liveness + version (referenced by the /setup footer and troubleshooting docs)
    if (url.pathname === "/health") {
      return Response.json({ ok: true });
    }
    if (url.pathname === "/version") {
      return Response.json({ name: "socials-mcp-cloud", version: "0.1.0", node: "workers" });
    }

    return provider.fetch(req, env, ctx);
  },
};
