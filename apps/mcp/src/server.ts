import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { openVault, Vault, importTiktokCsv, digestData, mediaKitData, comparePeriods, topContent, audienceOverview, vaultQuery, getProfile, setProfile, pipelineAdd, pipelineList, pipelineUpdate, PIPELINE_STAGES, discoverTiktokCsv } from "@socials/vault";
import {
  loadAppConfig, connectYoutube, connectMeta, connectTiktok,
  snapshotYoutube, snapshotMeta, snapshotTiktok,
  type GoogleTokens, type MetaIdentity, type TiktokTokens,
} from "@socials/connectors";
import { isPlatform, type NormalizedSnapshot, type Platform } from "@socials/shared";

export const VERSION = "0.4.2";

// ---------------------------------------------------------------------------
// config file (env vars win over file)
// ---------------------------------------------------------------------------

export function configFilePath(): string {
  return join(process.env.SOCIALS_DATA_DIR ?? join(homedir(), ".socials-assistant"), "config.json");
}

export function readConfigFile(): Record<string, string> {
  try {
    return JSON.parse(readFileSync(configFilePath(), "utf8")) as Record<string, string>;
  } catch {
    return {};
  }
}

export function writeConfigValue(key: string, value: string): void {
  mkdirSync(join(configFilePath(), ".."), { recursive: true });
  const cfg = readConfigFile();
  cfg[key] = value;
  writeFileSync(configFilePath(), JSON.stringify(cfg, null, 2) + "\n");
}

function mergedConfig() {
  const file = readConfigFile();
  const env = loadAppConfig();
  return {
    googleClientId: env.googleClientId ?? file.googleClientId,
    googleClientSecret: env.googleClientSecret ?? file.googleClientSecret,
    metaAppId: env.metaAppId ?? file.metaAppId,
    metaAppSecret: env.metaAppSecret ?? file.metaAppSecret,
    tiktokClientKey: env.tiktokClientKey ?? file.tiktokClientKey,
    tiktokClientSecret: env.tiktokClientSecret ?? file.tiktokClientSecret,
  };
}

/** Kick off a promise in the background; report its settled result via connection_status. */
const bgResults = new Map<string, Promise<string>>();
const BG_TTL_MS = 5 * 60_000; // auto-clean results after 5 minutes

function raceWithPending<T>(key: string, flow: Promise<T>, pendingMsg: (m: string) => string, ms = 15_000): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const settled = flow
    .then((v) => ({ ok: true as const, v }))
    .catch((e: Error) => ({ ok: false as const, e }));
  const resultPromise = settled.then((r) =>
    r.ok ? pendingMsg("done") : `❌ ${key} connect failed: ${r.e.message}`
  );
  bgResults.set(key, resultPromise);
  // Auto-clean after TTL to prevent memory accumulation
  void resultPromise.then(() => {
    setTimeout(() => bgResults.delete(key), BG_TTL_MS);
  });
  return Promise.race([
    settled.then((r) => ({
      content: [{ type: "text" as const, text: r.ok ? pendingMsg("done") : `❌ ${key} connect failed: ${r.e.message}` }],
    })),
    new Promise<{ content: Array<{ type: "text"; text: string }> }>((resolve) =>
      setTimeout(() => resolve({ content: [{ type: "text" as const, text: pendingMsg("pending") }] }), ms)
    ),
  ]);
}

// ---------------------------------------------------------------------------
// server builder
// ---------------------------------------------------------------------------

export function buildServer(vault: Vault): McpServer {
  const server = new McpServer(
    { name: "socials-mcp", version: VERSION },
    {
      instructions:
        "Socials Assistant: your creator analytics vault. Connect platforms once (connect_youtube / connect_meta / connect_tiktok), run `snapshot` weekly (history accrues), import_tiktok_csv weekly for TikTok retention/traffic data. Read profile_get FIRST so niche-sensitive work (scripts, pitches, media kits) matches this creator. Track production in pipeline_* and pitches in outreach_log_*; outreach is draft-first — never send without explicit human approval. Never fabricate metrics — if the vault lacks data, say so and suggest snapshot/import.",
    }
  );

  const text = (t: unknown) => ({ content: [{ type: "text" as const, text: typeof t === "string" ? t : JSON.stringify(t, null, 2) }] });
  /** Error-channel results: actionable, self-correcting (isError per MCP guidance). */
  const err = (payload: Record<string, unknown>) => ({
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    isError: true as const,
  });

  // ------------------- connection tools -------------------

  server.tool("connection_status", "Show connected social accounts, token health, vault history depth, and results of any background OAuth flows.", {}, async () => {
    const statuses = vault.status();
    const flows: Record<string, string> = {};
    for (const [k, p] of bgResults) {
      flows[k] = await p;
    }
    return text({ accounts: statuses, flows, historySince: vault.firstSnapshotDate() });
  });

  server.tool(
    "connect_youtube",
    "Connect YouTube via Google OAuth. The consent URL is printed to the server log immediately; finish in the browser (localhost callback). Tokens store encrypted. Requires google app credentials (docs/onboarding-google.md).",
    {},
    async () => {
      const cfg = mergedConfig();
      if (!cfg.googleClientId || !cfg.googleClientSecret) {
        return err({
          error: "missing_app_credentials",
          fix: "Create a free Google Cloud OAuth client (docs/onboarding-google.md), then:\n  socials-mcp config set googleClientId <id>\n  socials-mcp config set googleClientSecret <secret>",
        });
      }
      const flow = (async () => {
        const { tokens, channel } = await connectYoutube(cfg);
        const creds = { accessToken: tokens.access_token, refreshToken: tokens.refresh_token, expiresAt: tokens.expires_at };
        vault.upsertAccount({ platform: "youtube", platformAccountId: channel.id, handle: channel.handle, displayName: channel.title, credentials: creds });
        return channel;
      })();
      return raceWithPending(
        "youtube",
        flow,
        (m) =>
          m === "done"
            ? "✅ YouTube connected. Run `snapshot` to pull your first analytics."
            : "⏳ YouTube OAuth started — the consent URL is in the server log. Complete it in your browser, then check `connection_status`."
      );
    }
  );

  server.tool(
    "connect_meta",
    "Connect Instagram + Facebook Page via one Meta OAuth flow. Needs an IG Business/Creator account linked to a FB Page. Requires meta app credentials (docs/onboarding-meta.md).",
    {},
    async () => {
      const cfg = mergedConfig();
      if (!cfg.metaAppId || !cfg.metaAppSecret) {
        return err({
          error: "missing_app_credentials",
          fix: "Create a free Meta developer app (docs/onboarding-meta.md), then:\n  socials-mcp config set metaAppId <id>\n  socials-mcp config set metaAppSecret <secret>",
        });
      }
      const flow = (async () => {
        const { tokens, identity } = await connectMeta(cfg);
        const creds = { accessToken: tokens.access_token, expiresAt: tokens.expires_at, extra: { pageId: identity.pageId, igUserId: identity.igUserId } };
        if (identity.igUserId) {
          const igId = vault.upsertAccount({ platform: "instagram", platformAccountId: identity.igUserId, handle: identity.igUsername, displayName: identity.igUsername, credentials: creds });
          vault.metaSet(`identity:instagram:${igId}`, JSON.stringify(identity));
        }
        const fbId = vault.upsertAccount({ platform: "facebook", platformAccountId: identity.pageId, handle: identity.pageName, displayName: identity.pageName, credentials: creds });
        vault.metaSet(`identity:facebook:${fbId}`, JSON.stringify(identity));
        return identity;
      })();
      return raceWithPending(
        "meta",
        flow,
        (m) =>
          m === "done"
            ? "✅ Instagram + Facebook connected. Run `snapshot` to pull your first analytics."
            : "⏳ Meta OAuth started — the consent URL is in the server log. Complete it in your browser, then check `connection_status`."
      );
    }
  );

  server.tool(
    "connect_tiktok",
    "Connect TikTok via official Display API OAuth (video.list + user stats — engagement counts on your own videos). Studio-only data (retention/traffic) still needs weekly CSV imports. Requires tiktok app credentials (docs/onboarding-tiktok.md).",
    {},
    async () => {
      const cfg = mergedConfig();
      if (!cfg.tiktokClientKey || !cfg.tiktokClientSecret) {
        return err({
          error: "missing_app_credentials",
          fix: "Create a free TikTok developer app with Login Kit (user.info.basic, user.info.stats, video.list) — docs/onboarding-tiktok.md — then:\n  socials-mcp config set tiktokClientKey <key>\n  socials-mcp config set tiktokClientSecret <secret>",
        });
      }
      const flow = (async () => {
        const { tokens, user } = await connectTiktok(cfg);
        const creds = {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresAt: tokens.expires_at,
          extra: { open_id: tokens.open_id },
        };
        vault.upsertAccount({ platform: "tiktok", platformAccountId: tokens.open_id, handle: user.username, displayName: user.display_name, credentials: creds });
        return user;
      })();
      return raceWithPending(
        "tiktok",
        flow,
        (m) =>
          m === "done"
            ? "✅ TikTok connected. Run `snapshot`, and import weekly Studio CSVs for retention/traffic data."
            : "⏳ TikTok OAuth started — the consent URL is in the server log. Complete it in your browser, then check `connection_status`."
      );
    }
  );

  // ------------------- snapshot -------------------

  server.tool(
    "snapshot",
    "Pull fresh analytics from every connected platform into the vault (run weekly — history accrues forever). YouTube: views/watch/traffic/demographics/retention. Instagram+FB: insights + follower demographics. TikTok: profile + per-video engagement counts (Studio-only fields come from CSV imports).",
    { days: z.number().int().min(1).max(90).default(28).describe("Lookback window for API pulls") },
    async ({ days }) => {
      const cfg = mergedConfig();
      const results: Record<string, unknown> = {};
      const accounts = vault.listAccounts();
      if (accounts.length === 0) {
        return err({ error: "no_accounts", fix: "Connect a platform first (connect_youtube / connect_meta / connect_tiktok), or import_tiktok_csv for Studio exports." });
      }
      for (const acct of accounts) {
        try {
          const creds = vault.getCredentials(acct.id);
          if (!creds) throw new Error("no stored credentials — re-connect");
          if (acct.platform === "youtube") {
            const gt: GoogleTokens = {
              access_token: creds.accessToken,
              refresh_token: creds.refreshToken,
              expires_at: creds.expiresAt,
              expires_in: 0,
            };
            const snap = await snapshotYoutube(cfg, gt, (t) =>
              vault.setCredentials(acct.id, { accessToken: t.access_token, refreshToken: t.refresh_token ?? creds.refreshToken, expiresAt: t.expires_at })
            , days);
            results.youtube = vault.storeSnapshot(acct.id, snap, "api:youtube");
          } else if (acct.platform === "instagram" || acct.platform === "facebook") {
            const identityRaw = vault.metaGet(`identity:${acct.platform}:${acct.id}`);
            const identity: MetaIdentity = identityRaw
              ? (JSON.parse(identityRaw) as MetaIdentity)
              : { pageId: String(creds.extra?.pageId ?? acct.platformAccountId), pageName: acct.displayName ?? "Page", igUserId: creds.extra?.igUserId ? String(creds.extra.igUserId) : undefined };
            const snaps = await snapshotMeta(
              cfg,
              { access_token: creds.accessToken, expires_at: creds.expiresAt },
              identity,
              (t) => vault.setCredentials(acct.id, { ...creds, accessToken: t.access_token, expiresAt: t.expires_at }),
              days
            );
            const snap: NormalizedSnapshot | undefined = acct.platform === "instagram" ? snaps.instagram : snaps.facebook;
            if (snap) results[acct.platform] = vault.storeSnapshot(acct.id, snap, "api:meta");
            else results[acct.platform] = { skipped: "no data for this leg" };
          } else if (acct.platform === "tiktok") {
            const tt: TiktokTokens = {
              access_token: creds.accessToken,
              refresh_token: creds.refreshToken,
              open_id: String(creds.extra?.open_id ?? acct.platformAccountId),
              expires_at: creds.expiresAt,
            };
            const snap = await snapshotTiktok(cfg, tt, (t) =>
              vault.setCredentials(acct.id, { ...creds, accessToken: t.access_token, refreshToken: t.refresh_token ?? creds.refreshToken, expiresAt: t.expires_at })
            );
            results.tiktok = vault.storeSnapshot(acct.id, snap, "api:tiktok");
          }
        } catch (e) {
          results[acct.platform] = { error: (e as Error).message };
        }
      }
      return text(results);
    }
  );

  // ------------------- CSV import -------------------

  server.tool(
    "import_tiktok_csv",
    "Import a TikTok Studio CSV export (video stats / follower / profile views). This is the ONLY compliant source of retention, watch time, reach, and traffic data for TikTok — export weekly from TikTok Studio → Analytics. Omit path to auto-discover the newest export in ~/Downloads.",
    { path: z.string().optional().describe("Path to the exported CSV (omit to auto-discover the newest in ~/Downloads)") },
    async ({ path: rawPath }) => {
      const path = rawPath ?? discoverTiktokCsv();
      if (!path) return err({ error: "no_csv_found", fix: "Export from TikTok Studio → Analytics (video stats, last 7 days), save it, then call again — or pass the path explicitly." });
      if (!existsSync(path)) return err({ error: "file_not_found", fix: "Check the absolute path to the TikTok Studio export.", path });
      let result;
      try {
        result = importTiktokCsv(path, { fromFile: true });
      } catch (e) {
        return err({ error: "parse_failed", fix: "Ensure this is a TikTok Studio CSV export (video stats / follower / profile).", message: (e as Error).message });
      }
      const existing = vault.findAccount("tiktok");
      const accountId = existing
        ? existing.id
        : vault.upsertAccount({ platform: "tiktok" as Platform, platformAccountId: "studio-csv", displayName: "TikTok (Studio CSV)" });
      const stored = vault.storeSnapshot(accountId, result.snapshot, `csv:${path.split("/").pop()}`);
      vault.recordCsvImport(path.split("/").pop() ?? "csv", result.kind, result.rows);
      return text({
        kind: result.kind,
        rows: result.rows,
        videos: result.videos,
        dailyMetrics: result.dailyMetrics,
        stored,
        unmappedHeaders: result.unmappedHeaders,
        warnings: result.snapshot.warnings,
      });
    }
  );

  // ------------------- queries -------------------

  server.tool(
    "vault_query",
    "Run a read-only SELECT against the analytics vault (tables: accounts, snapshots, account_metrics, videos, video_metrics, audience, csv_imports, outreach_log). Example: SELECT metric, value FROM account_metrics WHERE date >= date('now','-7 days').",
    { sql: z.string().describe("Single SELECT statement") },
    async ({ sql }) => {
      try {
        const rows = vaultQuery(vault, sql);
        if (rows.length > 500) {
          return text({ rows: rows.slice(0, 500), count: 500, total: rows.length, truncated: true, fix: "Narrow with WHERE/LIMIT — results are capped to protect agent context." });
        }
        return text({ rows, count: rows.length });
      } catch (e) {
        return err({ error: (e as Error).message, fix: "vault_query accepts a single read-only SELECT against vault tables (accounts, snapshots, account_metrics, videos, video_metrics, audience, csv_imports, outreach_log)." });
      }
    }
  );

  server.tool(
    "compare_periods",
    "Compare a daily metric (views, reach, likes, comments, shares, followers...) between the last N days and the N days before — per platform and overall.",
    {
      metric: z.string().default("views").describe("Daily metric name, e.g. views / likes / followers / followers_gained"),
      days: z.number().int().min(1).max(90).default(7),
    },
    async ({ metric, days }) => text(comparePeriods(vault, metric, days))
  );

  server.tool(
    "top_content",
    "Best (or worst) content by a metric across all platforms — latest captured metrics per video.",
    {
      metric: z.enum(["views", "likes", "comments", "shares", "engagement_rate", "avgWatchSeconds", "watchTimeMinutes"]).default("views"),
      limit: z.number().int().min(1).max(100).default(10),
      days: z.number().int().min(0).max(365).default(0).describe("Only content published in the last N days (0 = all time)"),
      platform: z.string().optional().describe("youtube | instagram | facebook | tiktok"),
    },
    async ({ metric, limit, days, platform }) =>
      text(topContent(vault, { metric, limit, sinceDays: days, platform: platform && isPlatform(platform) ? platform : undefined }))
  );

  server.tool("audience_overview", "Audience demographics (age/gender/country/city/source) from the latest snapshot of each platform.", {}, async () =>
    text(audienceOverview(vault))
  );

  server.tool(
    "digest_data",
    "Structured weekly-digest payload: per-platform deltas, top/flop content, audience shifts. Feed this to the weekly-digest skill or read it directly.",
    { days: z.number().int().min(1).max(30).default(7) },
    async ({ days }) => text(digestData(vault, days))
  );

  server.tool("media_kit_data", "Verified numbers (followers, 30-day views, average engagement, top videos, audience highlights) for media kits and brand pitches. Never estimate — vault data only.", {}, async () =>
    text(mediaKitData(vault))
  );

  // ------------------- outreach log -------------------

  server.tool(
    "outreach_log_add",
    "Log a drafted brand pitch (draft-first workflow: emails are drafted for human review; this records the attempt).",
    {
      brand: z.string().describe("Brand / company name"),
      contact_email: z.string().optional(),
      subject: z.string().optional(),
      notes: z.string().optional().describe("Context: what was pitched, rate discussed, follow-up plan..."),
    },
    async (a) => text(vault.outreachAdd(a))
  );

  server.tool(
    "outreach_log_list",
    "List outreach attempts, optionally filtered by status (drafted/sent/replied/rejected/closed).",
    { status: z.string().optional() },
    async ({ status }) => text(vault.outreachList(status))
  );

  server.tool(
    "outreach_log_update",
    "Update an outreach attempt (mark sent/replied, add notes or a thread reference).",
    {
      id: z.number().int(),
      status: z.enum(["drafted", "sent", "replied", "rejected", "closed"]).optional(),
      notes: z.string().optional(),
      thread_ref: z.string().optional(),
    },
    async ({ id, status, notes, thread_ref }) => {
      const result = vault.outreachUpdate(id, { status, notes, thread_ref });
      if (!result.updated) return err({ error: "not_found", fix: "List first with outreach_log_list to find the id.", id });
      return text(result);
    }
  );


  // ------------------- creator profile (per-installation tuning) -------------------

  server.tool(
    "profile_get",
    "Read the creator profile (niche, tone, series, rate floor, goals, keywords) that tunes all skills to this specific creator. Skills MUST read this before niche-sensitive work (scripts, pitches, media kits). Empty profile → offer to build it: auto-fill from vault data + a few questions.",
    {},
    async () => {
      const profile = getProfile(vault);
      const hasAny = Object.keys(profile).some((k) => k !== "updated_at");
      return text(hasAny ? profile : { profile, hint: "Profile is empty. Ask the creator 4 questions (niche? tone? goals? rate floor?) and set with profile_set; audience/series facts can be auto-derived from audience_overview and top_content." });
    }
  );

  server.tool(
    "profile_set",
    "Create or update the creator profile (partial merge — only provided fields change). This is how a generic install becomes tuned to one creator.",
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
    async (patch) => text(setProfile(vault, patch))
  );

  // ------------------- content pipeline (script → review → green light → post → measured) -------------------

  server.tool(
    "pipeline_add",
    "Add a content idea or deliverable to the creator's pipeline (idea → scripting → script_review → brand_review → approved → posted → measured). Use for anything moving through production, especially sponsored deliverables awaiting a brand green light.",
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
    async (a) => text(pipelineAdd(vault, a))
  );

  server.tool(
    "pipeline_list",
    "List pipeline items (the creator's production calendar), optionally filtered by stage. Ordered by due date.",
    { stage: z.string().optional() },
    async ({ stage }) => {
      if (stage && !PIPELINE_STAGES.includes(stage as never)) {
        return err({ error: "invalid_stage", fix: `Valid stages: ${PIPELINE_STAGES.join(", ")}` });
      }
      return text(pipelineList(vault, stage));
    }
  );

  server.tool(
    "pipeline_update",
    "Move a pipeline item along (e.g. script_review → brand_review → approved → posted → measured) or edit fields. After posting, set stage=posted with post_url; the weekly rhythm later marks measured.",
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
      try {
        const item = pipelineUpdate(vault, id, patch);
        if (!item) return err({ error: "not_found", fix: "pipeline_list to find the id.", id });
        return text(item);
      } catch (e) {
        return err({ error: (e as Error).message });
      }
    }
  );

  return server;
}

export { openVault };
