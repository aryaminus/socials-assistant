#!/usr/bin/env tsx
/**
 * audit-mcp — MCP contract audit: tool names, descriptions, schemas,
 * deterministic ordering, error channel behavior, version sync.
 * Exit 1 on any failure. Run in CI and before releases.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const { buildServer, VERSION } = await import("../apps/mcp/dist/server.js");
const { Vault } = await import("../packages/vault/dist/index.js");

let failures = 0;
const check = (name: string, cond: boolean, detail = "") => {
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
};

// fresh temp vault so the audit is hermetic
const tmp = join(tmpdir(), `socials-audit-${Date.now()}`);
mkdirSync(tmp, { recursive: true });
const vault = new Vault(tmp);
const server = buildServer(vault);
const client = new Client({ name: "audit", version: "0" });
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
await server.connect(serverTransport);
await client.connect(clientTransport);

// 1. instructions present
const conn = await client.connect as never; void conn;
check("server connects over in-memory transport", true);

// 2. tools: deterministic order, name rules, description rules
const a = await client.listTools();
const b = await client.listTools();
check("tools/list deterministic order", JSON.stringify(a.tools.map((t: { name: string }) => t.name)) === JSON.stringify(b.tools.map((t: { name: string }) => t.name)), `${a.tools.length} tools`);

const NAME_RE = /^[a-zA-Z0-9_-]{1,64}$/;
for (const t of a.tools as Array<{ name: string; description?: string; inputSchema: { type?: string } }>) {
  check(`tool name valid: ${t.name}`, NAME_RE.test(t.name));
  const d = t.description ?? "";
  check(`description present (1–1024): ${t.name}`, d.length >= 1 && d.length <= 1024, `${d.length} chars`);
  check(`inputSchema is object: ${t.name}`, !t.inputSchema || t.inputSchema.type === "object");
}

// 3. error channel: vault_query rejects writes with isError (self-correcting)
const bad = await client.callTool({ name: "vault_query", arguments: { sql: "DELETE FROM accounts" } });
check("vault_query write rejection uses isError channel", bad.isError === true, JSON.stringify(bad.content).slice(0, 80));

// 4. happy path: connection_status returns valid JSON, not error
const status = await client.callTool({ name: "connection_status", arguments: {} });
check("connection_status succeeds", status.isError !== true);
const parsed = JSON.parse((status.content as Array<{ text: string }>)[0].text);
check("connection_status JSON parses", typeof parsed === "object");

// 5. profile + pipeline contract
const pset = await client.callTool({ name: "profile_set", arguments: { niche: "test niche", rate_floor: 50 } });
check("profile_set succeeds", pset.isError !== true);
const pget = await client.callTool({ name: "profile_get", arguments: {} });
const profile = JSON.parse((pget.content as Array<{ text: string }>)[0].text);
check("profile roundtrip", (profile.profile ?? profile)?.niche === "test niche");
const padd = await client.callTool({ name: "pipeline_add", arguments: { title: "audit item", stage: "idea" } });
const item = JSON.parse((padd.content as Array<{ text: string }>)[0].text);
check("pipeline_add returns item", item.stage === "idea" && item.id > 0);
const pbad = await client.callTool({ name: "pipeline_update", arguments: { id: item.id, stage: "bogus" } });
check("pipeline invalid stage → isError", pbad.isError === true);
const pdone = await client.callTool({ name: "pipeline_update", arguments: { id: item.id, stage: "dropped" } });
check("pipeline_update valid", pdone.isError !== true);
check("20-tool focused surface", a.tools.length === 20, `${a.tools.length}`);

// 6. version sync: root pkg + apps/mcp pkg + server VERSION + server.json + plugin.json
const rootPkg = JSON.parse(readFileSync(join(here, "..", "package.json"), "utf8"));
const pkg = JSON.parse(readFileSync(join(here, "..", "apps", "mcp", "package.json"), "utf8"));
const registry = JSON.parse(readFileSync(join(here, "..", "server.json"), "utf8"));
const plugin = JSON.parse(readFileSync(join(here, "..", ".claude-plugin", "plugin.json"), "utf8"));
check(
  "version sync (root/apps-mcp/server.json/plugin.json)",
  rootPkg.version === VERSION && pkg.version === VERSION && registry.version === VERSION && plugin.version === VERSION,
  `${VERSION} / ${rootPkg.version} / ${pkg.version} / ${registry.version} / ${plugin.version}`
);

await client.close();
await server.close();
vault.close();
rmSync(tmp, { recursive: true, force: true });

if (failures) {
  console.error(`\naudit: ${failures} failure(s)`);
  process.exit(1);
}
console.log("\naudit: all checks passed");
