import { McpAgent } from "@cloudflare/agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { initVault, type D1Vault } from "./vault.ts";
import { snapshotAll, refreshPlatformToken } from "./platforms.ts";
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
};

function userIdFromProps(props: { sessionId?: string; clientId?: string; userId?: string }): string {
  return props.userId ?? props.sessionId ?? props.clientId ?? "anonymous";
}

export class SocialsMCP extends McpAgent<Env> {
  server = new McpServer(
    { name: "socials-mcp-cloud", version: "0.1.0" },
    {
      instructions:
        "Socials Assistant (cloud). Same tools as the local server: store platform credentials, snapshot analytics into your D1 vault, query, digest, media-kit. Draft-first outreach.",
    }
  );

  async init() {
    const vault: D1Vault = initVault(this.env.VAULT, userIdFromProps(this.props as never));
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
      async ({ days }) => text(await snapshotAll(vault, this.env.TOKEN_ENCRYPTION_KEY, days))
    );

    this.server.tool("refresh_token", "Force-refresh stored tokens for a platform (Meta long-lived / Google / TikTok).", { platform: z.enum(["youtube", "instagram", "facebook", "tiktok"]) }, async ({ platform }) =>
      text(await refreshPlatformToken(vault, platform, this.env.TOKEN_ENCRYPTION_KEY))
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
  }
}
