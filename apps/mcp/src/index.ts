import { existsSync } from "node:fs";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildServer, openVault, configFilePath, readConfigFile, writeConfigValue, VERSION } from "./server.js";
import { runHttpServer } from "./http.js";

const HELP = `
socials-mcp v${VERSION} — creator analytics MCP server (socials-assistant)

Usage:
  socials-mcp                 Start MCP server on stdio (for agents' stdio config)
  socials-mcp --http [port]   Start MCP server via streamable HTTP (default 3344)
  socials-mcp --version       Print version
  socials-mcp doctor          Environment + config + vault health check with fix hints
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

  if (cmd === "--version" || cmd === "-v" || cmd === "version") {
    process.stdout.write(VERSION + "\n");
    return;
  }

  if (cmd === "--help" || cmd === "-h" || cmd === "help") {
    process.stdout.write(HELP);
    return;
  }

  if (cmd === "doctor") {
    process.exit(runDoctor());
  }

  if (cmd === "onboard") {
    process.stdout.write(ONBOARD);
    return;
  }

  if (cmd === "config") {
    const sub = args[1] ?? "get";
    if (sub === "set") {
      if (args.length < 4) {
        process.stderr.write("Usage: socials-mcp config set <key> <value>\n");
        process.exit(1);
      }
      writeConfigValue(args[2], args[3]);
      process.stdout.write(`saved ${args[2]}\n`);
    } else {
      const keyFilter = args[2];
      const cfg = readConfigFile();
      const redacted: Record<string, string> = {};
      for (const [k, v] of Object.entries(cfg)) {
        if (keyFilter && k !== keyFilter) continue;
        redacted[k] = /secret/i.test(k) ? `${v.slice(0, 6)}…(${v.length} chars)` : v;
      }
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
    const { discoverTiktokCsv } = await import("@socials/vault");
    const file = args[1] ?? discoverTiktokCsv();
    if (!file) {
      console.error("No TikTok Studio CSV found in ~/Downloads. Export from TikTok Studio → Analytics first, or pass a path: socials-mcp import <file.csv>");
      process.exit(1);
    }
    console.error(`[socials] importing: ${file}`);
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

  // handle --http as the primary command (may not be args[0] if --port precedes it)
  const httpIdx = args.indexOf("--http");
  if (httpIdx !== -1) {
    const portIdx = args.indexOf("--port");
    let port: number;
    if (portIdx !== -1 && args[portIdx + 1]) {
      port = Number(args[portIdx + 1]);
    } else {
      // positional after --http: e.g. --http 8080 or --port 8080 --http
      const afterHttp = args[httpIdx + 1];
      const afterPort = portIdx !== -1 ? args[portIdx + 1] : undefined;
      const candidate = afterHttp && !afterHttp.startsWith("--") ? Number(afterHttp) : afterPort ? Number(afterPort) : NaN;
      port = Number.isFinite(candidate) && candidate > 0 ? candidate : Number(process.env.SOCIALS_MCP_PORT ?? 3344);
    }
    if (!Number.isFinite(port) || port <= 0 || port > 65535) {
      process.stderr.write(`Invalid port: ${port}\n`);
      process.exit(1);
    }
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


/** Health check with fix hints — used by setup.sh, CI, and confused humans. */
function runDoctor(): number {
  const lines: Array<[string, string, string]> = []; // [status, check, detail]
  const ok = (c: string, d = "") => lines.push(["✓", c, d]);
  const warn = (c: string, d: string) => lines.push(["!", c, d]);
  const fail = (c: string, d: string) => lines.push(["✗", c, d]);
  let fatal = 0;

  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major > 22 || (major === 22 && minor >= 5)) ok(`Node ${process.versions.node} (>=22.5 for node:sqlite)`);
  else { fail(`Node ${process.versions.node}`, "Install Node >= 22.5 (node:sqlite is built in)"); fatal++; }

  if (existsSync(new URL("../dist/server.js", import.meta.url))) ok("Build present (apps/mcp/dist)");
  else { fail("Build missing", "Run: pnpm build (from repo root)"); fatal++; }

  const cfg = readConfigFile();
  const keys: Array<[string, string]> = [
    ["googleClientId", "YouTube"], ["googleClientSecret", "YouTube"],
    ["metaAppId", "Instagram+FB"], ["metaAppSecret", "Instagram+FB"],
    ["tiktokClientKey", "TikTok"], ["tiktokClientSecret", "TikTok"],
  ];
  const envAlias: Record<string, string | undefined> = {
    googleClientId: process.env.SOCIALS_GOOGLE_CLIENT_ID, googleClientSecret: process.env.SOCIALS_GOOGLE_CLIENT_SECRET,
    metaAppId: process.env.SOCIALS_META_APP_ID, metaAppSecret: process.env.SOCIALS_META_APP_SECRET,
    tiktokClientKey: process.env.SOCIALS_TIKTOK_CLIENT_KEY, tiktokClientSecret: process.env.SOCIALS_TIKTOK_CLIENT_SECRET,
  };
  for (const [key, platform] of keys) {
    if (cfg[key] || envAlias[key]) ok(`${platform} app credentials (${key})`);
    else warn(`${platform} app credentials (${key})`, "Unset — see docs/onboarding-*.md; skip platforms you don't use");
  }

  try {
    const vault = openVault();
    const accounts = vault.listAccounts();
    if (accounts.length) {
      ok(`Vault: ${accounts.length} account(s)`, accounts.map((a: { platform: string; handle: string | null }) => `${a.platform}${a.handle ? "(@" + a.handle + ")" : ""}`).join(", "));
      ok(`Vault history since`, vault.firstSnapshotDate() ?? "no snapshots yet");
    } else {
      warn("Vault empty", "No platforms connected yet — run `onboard`, then connect_* in your agent");
    }
    vault.close();
  } catch (e) {
    fail("Vault open failed", (e as Error).message); fatal++;
  }

  for (const l of lines) console.log(`${l[0]} ${l[1]}${l[2] ? " — " + l[2] : ""}`);
  if (fatal) { console.error(`\n${fatal} fatal issue(s). Fix the ✗ lines above.`); return 1; }
  console.log("\nDoctor: no fatal issues." + (lines.some((l) => l[0] === "!") ? " (! lines are optional platforms.)" : ""));
  return 0;
}

main().catch((e) => {
  console.error("[socials-mcp] fatal:", e);
  process.exit(1);
});
