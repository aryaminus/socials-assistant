import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildServer, openVault, configFilePath, readConfigFile, writeConfigValue, VERSION } from "./server.js";
import { runHttpServer } from "./http.js";

const HELP = `
socials-mcp v${VERSION} — creator analytics MCP server (socials-assistant)

Usage:
  socials-mcp                 Start MCP server on stdio (for agents' stdio config)
  socials-mcp --http [port]   Start MCP server via streamable HTTP (default 3344)
  socials-mcp onboard         Print guided onboarding (platform apps + OAuth)
  socials-mcp config set K V  Store a config value (persisted, see path below)
  socials-mcp config get [K]  Read config values (secrets redacted)
  socials-mcp snapshot        Headless snapshot of all connected platforms
  socials-mcp status          Show connected accounts + vault summary
  socials-mcp import FILE     Import a TikTok Studio CSV into the vault

Config keys: googleClientId googleClientSecret metaAppId metaAppSecret tiktokClientKey tiktokClientSecret
Config file: ${configFilePath()}
Vault/data:  $SOCIALS_DATA_DIR (default ~/.socials-assistant)
Docs:        docs/ in the repo — onboarding per platform, hosting, automation
`;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const cmd = args[0] ?? "";

  if (cmd === "--help" || cmd === "-h" || cmd === "help") {
    process.stdout.write(HELP);
    return;
  }

  if (cmd === "onboard") {
    process.stdout.write(ONBOARD);
    return;
  }

  if (cmd === "config") {
    const sub = args[1] ?? "get";
    if (sub === "set" && args.length >= 4) {
      writeConfigValue(args[2], args[3]);
      process.stdout.write(`saved ${args[2]}\n`);
    } else {
      const cfg = readConfigFile();
      const redacted: Record<string, string> = {};
      for (const [k, v] of Object.entries(cfg)) redacted[k] = /secret/i.test(k) ? `${v.slice(0, 6)}…(${v.length} chars)` : v;
      process.stdout.write(JSON.stringify(redacted, null, 2) + "\n");
    }
    return;
  }

  if (cmd === "status") {
    const vault = openVault();
    console.log(JSON.stringify({ accounts: vault.status(), historySince: vault.firstSnapshotDate() }, null, 2));
    vault.close();
    return;
  }

  if (cmd === "snapshot") {
    const vault = openVault();
    const { snapshotAll } = await import("./snapshot.js");
    const result = await snapshotAll(vault);
    console.log(JSON.stringify(result, null, 2));
    vault.close();
    return;
  }

  if (cmd === "import") {
    const file = args[1];
    if (!file) {
      console.error("usage: socials-mcp import <tiktok-studio.csv>");
      process.exit(1);
    }
    const vault = openVault();
    const { importTiktokCsv } = await import("@socials/vault");
    const result = importTiktokCsv(file, { fromFile: true });
    const existing = vault.findAccount("tiktok");
    const accountId = existing ? existing.id : vault.upsertAccount({ platform: "tiktok", platformAccountId: "studio-csv", displayName: "TikTok (Studio CSV)" });
    const stored = vault.storeSnapshot(accountId, result.snapshot, `csv:${file.split("/").pop()}`);
    vault.recordCsvImport(file.split("/").pop() ?? "csv", result.kind, result.rows);
    console.log(JSON.stringify({ kind: result.kind, rows: result.rows, videos: result.videos, dailyMetrics: result.dailyMetrics, stored }, null, 2));
    vault.close();
    return;
  }

  if (cmd === "--http") {
    const portIdx = args.indexOf("--port");
    const port = portIdx !== -1 ? Number(args[portIdx + 1]) : Number(process.env.SOCIALS_MCP_PORT ?? 3344);
    await runHttpServer(port);
    return; // runHttpServer keeps the process alive
  }

  // default: stdio MCP server
  const vault = openVault();
  const server = buildServer(vault);
  await server.connect(new StdioServerTransport());
}

const ONBOARD = `
╔══════════════════════════════════════════════════════════════════╗
║  socials-assistant onboarding                                    ║
╚══════════════════════════════════════════════════════════════════╝
Three free developer apps (one-time, ~10 min each). Full walkthroughs
in docs/onboarding-*.md.

1) YOUTUBE (Google Cloud)
   a. console.cloud.google.com → new project (free)
   b. Enable APIs: YouTube Data API v3, YouTube Analytics API, YouTube Reporting API
   c. OAuth consent screen → External → add yourself as test user
   d. Credentials → OAuth client ID → Desktop app
   e. socials-mcp config set googleClientId <id>.apps.googleusercontent.com
      socials-mcp config set googleClientSecret <secret>

2) INSTAGRAM + FACEBOOK (Meta)
   a. developers.facebook.com → Create App (Business type)
   b. Add products: Instagram Graph API, Facebook Login
   c. Valid OAuth redirect URI: http://127.0.0.1:8399/callback
   d. Your IG account must be Business/Creator AND linked to a FB Page
   e. socials-mcp config set metaAppId <app_id>
      socials-mcp config set metaAppSecret <app_secret>

3) TIKTOK (TikTok for Developers)
   a. developers.tiktok.com → Create app (free)
   b. Add product: Login Kit → scopes: user.info.basic, user.info.stats, video.list
   c. Login Kit → Redirect URI: http://127.0.0.1:8399/callback
      (verification + audit may take days; your own account works in sandbox immediately)
   d. socials-mcp config set tiktokClientKey <client_key>
      socials-mcp config set tiktokClientSecret <client_secret>

Then, in your agent:
   • connect_youtube → open the printed URL → done
   • connect_meta   → open the printed URL → done
   • connect_tiktok → open the printed URL → done
   • snapshot (weekly — history accrues in the vault)
   • import_tiktok_csv with weekly TikTok Studio exports
     (retention/traffic/search data is Studio-only; CSV is the compliant path)

Optional: docs/automation.md (weekly email digest), docs/hosting-cloudflare.md
(multi-tenant remote MCP for other creators).
`;

main().catch((e) => {
  console.error("[socials-mcp] fatal:", e);
  process.exit(1);
});
