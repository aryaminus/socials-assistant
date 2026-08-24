import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { initVault, type D1Vault } from "./vault.ts";
import { snapshotAll, refreshPlatformToken } from "./platforms.ts";
import { startPlatformOAuth, completePlatformOAuth, platformConfigured, getDeployOrigin, configured } from "./platform-oauth.ts";
import { comparePeriods, topContent, digestRows, mediaKitRows } from "./analytics.ts";

/**
 * socials-mcp cloud — remote MCP server (streamable HTTP) for multi-tenant use:
 * any creator's agent (Claude Code/Desktop/ChatGPT/Codex/Gemini/Antigravity/opencode)
 * connects with OAuth 2.1 + DCR (see entry.ts). Each MCP user gets an isolated
 * row-space in D1 keyed by their login identity; platform tokens are encrypted at rest.
 */

export type Env = {
  VAULT: D1Database;
  OAUTH_KV: KVNamespace;
  GOOGLE_LOGIN_CLIENT_ID: string;
  GOOGLE_LOGIN_CLIENT_SECRET: string;
  TOKEN_ENCRYPTION_KEY: string;
  // platform data apps (set via dashboard; see /setup)
  SOCIALS_GOOGLE_CLIENT_ID?: string;
  SOCIALS_GOOGLE_CLIENT_SECRET?: string;
  SOCIALS_META_APP_ID?: string;
  SOCIALS_META_APP_SECRET?: string;
  SOCIALS_TIKTOK_CLIENT_KEY?: string;
  SOCIALS_TIKTOK_CLIENT_SECRET?: string;
};

function userIdFromProps(props: { sessionId?: string; clientId?: string; userId?: string }): string {
  return props.userId ?? props.sessionId ?? props.clientId ?? "anonymous";
}

export class SocialsMCP extends McpAgent<Env> {
  server = new McpServer(
    { name: "socials-mcp-cloud", version: "0.4.0" },
    {
      instructions:
        "Socials Assistant (cloud). Same tools as the local server: store platform credentials, snapshot analytics into your D1 vault, query, digest, media-kit. Draft-first outreach.",
    }
  );

  async init() {
    const vault: D1Vault = initVault(this.env.VAULT, userIdFromProps(this.props as never), configured(this.env.TOKEN_ENCRYPTION_KEY) ? this.env.TOKEN_ENCRYPTION_KEY : undefined);
    const text = (t: unknown) => ({ content: [{ type: "text" as const, text: typeof t === "string" ? t : JSON.stringify(t, null, 2) }] });

    this.server.tool("connection_status", "Connected platform accounts + token health.", {}, async () =>
      text(await vault.status())
    );

    this.server.tool(
      "set_platform_credentials",
      "Store OAuth credentials for a platform (from your developer app / local onboarding). Tokens are encrypted at rest. Credentials shape: { accessToken, refreshToken?, expiresAt?, extra?: { pageId, igUserId, open_id, channel } }",
      {
        platform: z.enum(["youtube", "instagram", "facebook", "tiktok"]),
        platform_account_id: z.string(),
        handle: z.string().optional(),
        credentials: z.record(z.string(), z.unknown()),
      },
      async ({ platform, platform_account_id, handle, credentials }) =>
        text(await vault.upsertAccount(platform, platform_account_id, handle, credentials as Record<string, string>))
    );

    this.server.tool(
      "snapshot",
      "Pull fresh analytics from all connected platforms into your cloud vault (server-side fetches with token refresh).",
      { days: z.number().int().min(1).max(90).default(28) },
      async ({ days }) => text(await snapshotAll(vault, configured(this.env.TOKEN_ENCRYPTION_KEY) ? this.env.TOKEN_ENCRYPTION_KEY : undefined, days))
    );

    this.server.tool("refresh_token", "Force-refresh stored tokens for a platform (Meta long-lived / Google / TikTok).", { platform: z.enum(["youtube", "instagram", "facebook", "tiktok"]) }, async ({ platform }) =>
      text(await refreshPlatformToken(vault, platform, configured(this.env.TOKEN_ENCRYPTION_KEY) ? this.env.TOKEN_ENCRYPTION_KEY : undefined))
    );

    this.server.tool(
      "vault_query",
      "Read-only SELECT against your vault tables (accounts, snapshots, account_metrics, videos, video_metrics, audience, outreach_log).",
      { sql: z.string() },
      async ({ sql }) => text(await vault.query(sql))
    );

    this.server.tool(
      "compare_periods",
      "Metric deltas: last N days vs prior N days.",
      { metric: z.string().default("views"), days: z.number().int().min(1).max(90).default(7) },
      async ({ metric, days }) => text(await comparePeriods(vault, metric, days))
    );

    this.server.tool(
      "top_content",
      "Best content by metric.",
      {
        metric: z.enum(["views", "likes", "comments", "shares", "engagement_rate"]).default("views"),
        limit: z.number().int().min(1).max(50).default(10),
        days: z.number().int().min(0).max(365).default(0),
        platform: z.string().optional(),
      },
      async (o) => text(await topContent(vault, o))
    );

    this.server.tool("digest_data", "Weekly digest payload.", { days: z.number().int().min(1).max(30).default(7) }, async ({ days }) =>
      text(await digestRows(vault, days))
    );

    this.server.tool("media_kit_data", "Verified numbers for media kits.", {}, async () => text(await mediaKitRows(vault)));

    this.server.tool(
      "outreach_log_add",
      "Log a drafted brand pitch.",
      { brand: z.string(), contact_email: z.string().optional(), subject: z.string().optional(), notes: z.string().optional() },
      async (a) => text(await vault.outreachAdd(a))
    );
    this.server.tool("outreach_log_list", "List outreach attempts.", { status: z.string().optional() }, async ({ status }) =>
      text(await vault.outreachList(status))
    );

    this.server.tool(
      "outreach_log_update",
      "Update an outreach attempt (mark sent/replied, add notes or a thread reference).",
      {
        id: z.number().int(),
        status: z.enum(["drafted", "sent", "replied", "rejected", "closed"]).optional(),
        notes: z.string().optional(),
        thread_ref: z.string().optional(),
      },
      async ({ id, status, notes, thread_ref }) => text(await vault.outreachUpdate(id, { status, notes, thread_ref }))
    );

    this.server.tool("audience_overview", "Audience demographics (age/gender/country/city/source) from the latest snapshot of each platform.", {}, async () => {
      const accounts = await vault.listAccounts();
      if (!accounts.length) return text({ audience: {}, hint: "No connected accounts. Connect a platform first." });
      const audiences: Record<string, unknown> = {};
      for (const acct of accounts) {
        const rows = await vault.query(
          `SELECT a.dimension, a.key, a.value FROM audience a
           JOIN snapshots s ON a.snapshot_id = s.id
           WHERE s.account_id = ${acct.id}
           ORDER BY s.taken_at DESC`
        );
        audiences[acct.platform] = rows;
      }
      return text(audiences);
    });

    this.server.tool(
      "profile_get",
      "Read the creator profile (niche, tone, series, rate floor, goals, keywords) that tunes all skills to this specific creator.",
      {},
      async () => {
        const profile = await vault.getProfile();
        const hasAny = Object.keys(profile).some((k) => k !== "updated_at");
        return text(hasAny ? profile : { profile, hint: "Profile is empty. Ask the creator 4 questions (niche? tone? goals? rate floor?) and set with profile_set." });
      }
    );

    this.server.tool(
      "profile_set",
      "Create or update the creator profile (partial merge — only provided fields change).",
      {
        name: z.string().optional(),
        niche: z.string().optional().describe("What the creator makes content about, free text"),
        tone_notes: z.string().optional().describe("Voice/style scripts and pitches should match"),
        content_series: z.array(z.object({ name: z.string(), note: z.string().optional() })).optional(),
        audience_summary: z.string().optional(),
        brand_categories: z.array(z.string()).optional().describe("Brand categories that fit this audience"),
        past_collaborations: z.array(z.object({ brand: z.string(), note: z.string().optional() })).optional(),
        rate_floor: z.number().optional().describe("Minimum acceptable rate — pitches never go below"),
        goals: z.array(z.string()).optional(),
        keywords: z.array(z.string()).optional().describe("SEO seed words for titles/captions"),
      },
      async (patch) => text(await vault.setProfile(patch))
    );

    this.server.tool(
      "pipeline_add",
      "Add a content idea or deliverable to the creator's pipeline (idea → scripting → script_review → brand_review → approved → posted → measured).",
      {
        title: z.string(),
        platform: z.string().optional().describe("youtube | instagram | facebook | tiktok"),
        brand: z.string().optional().describe("Sponsoring brand, if this is a paid deliverable"),
        outreach_id: z.number().int().optional().describe("Linked outreach_log entry"),
        stage: z.enum(["idea", "scripting", "script_review", "brand_review", "approved", "posted", "measured", "on_hold", "dropped"]).default("idea"),
        due_date: z.string().optional().describe("YYYY-MM-DD"),
        script_path: z.string().optional(),
        brief: z.string().optional().describe("Requirements / what this deliverable is"),
        notes: z.string().optional(),
      },
      async (a) => text(await vault.pipelineAdd(a))
    );

    this.server.tool(
      "pipeline_list",
      "List pipeline items (the creator's production calendar), optionally filtered by stage.",
      { stage: z.string().optional() },
      async ({ stage }) => text(await vault.pipelineList(stage))
    );

    this.server.tool(
      "pipeline_update",
      "Move a pipeline item along or edit fields. After posting, set stage=posted with post_url.",
      {
        id: z.number().int(),
        stage: z.enum(["idea", "scripting", "script_review", "brand_review", "approved", "posted", "measured", "on_hold", "dropped"]).optional(),
        due_date: z.string().optional(),
        script_path: z.string().optional(),
        post_url: z.string().optional(),
        posted_at: z.string().optional(),
        brief: z.string().optional(),
        notes: z.string().optional(),
        brand: z.string().optional(),
      },
      async ({ id, ...patch }) => {
        const item = await vault.pipelineUpdate(id, patch);
        if (!item) return text({ error: "not_found", fix: "pipeline_list to find the id.", id });
        return text(item);
      }
    );

    // ------------------- in-chat platform connect (zero-local-install path) -------------------

    this.server.tool(
      "platform_oauth_url",
      "Start connecting a platform for THIS vault user: returns a consent URL for the human to open and a handle. After approving on the platform, the human pastes the redirected URL back; pass it + the handle to platform_oauth_exchange. Requires the operator to have configured this platform's app credentials (/setup).",
      { platform: z.enum(["youtube", "meta", "tiktok"]) },
      async ({ platform }) => {
        try {
          if (!platformConfigured(this.env as unknown as Record<string, string>, platform)) {
            return text({ error: "platform_not_configured", fix: `The operator must add ${platform} app credentials in the Cloudflare dashboard — checklist at <deployment-url>/setup.` });
          }
          const reqOrigin = getDeployOrigin();
          if (!reqOrigin) {
            return text({ error: "origin_unknown", fix: "Visit <your-worker-url>/setup once (warms the deployment), then retry." });
          }
          const started = await startPlatformOAuth(vault, this.env as unknown as Record<string, string>, platform, reqOrigin);
          return text({
            handle: started.handle,
            instructions: "Open this URL, approve access, then copy the FULL redirected URL from the browser address bar and give it back with platform_oauth_exchange.",
            url: started.url,
          });
        } catch (e) {
          return text({ error: (e as Error).message });
        }
      }
    );

    this.server.tool(
      "platform_oauth_exchange",
      "Complete a platform connection: pass the handle from platform_oauth_url plus the full redirected URL the human copied after approving.",
      { handle: z.string(), redirect_url: z.string().describe("The full URL the browser was redirected to after approval") },
      async ({ handle, redirect_url }) => {
        const reqOrigin = getDeployOrigin();
        try {
          const result = await completePlatformOAuth(vault, this.env as unknown as Record<string, string>, reqOrigin, handle, redirect_url);
          return text(result);
        } catch (e) {
          return text({ error: (e as Error).message, fix: "Reissue platform_oauth_url and retry the paste (state expires after ~10 minutes)." });
        }
      }
    );
  }
}
