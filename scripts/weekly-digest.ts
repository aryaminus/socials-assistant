#!/usr/bin/env tsx
/**
 * weekly-digest — run by GitHub Actions cron (or any scheduler / local cron).
 * 1. (optional, if tokens present) headless snapshot of all platforms
 * 2. builds markdown digest from the vault
 * 3. writes digests/YYYY-WW.md
 * 4. (optional) emails the digest to the creator via Resend API
 *    env: RESEND_API_KEY + DIGEST_TO + DIGEST_FROM (never brand outreach — self-email only)
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Vault, digestData } from "../packages/vault/dist/index.js";

const DATA_DIR = process.env.SOCIALS_DATA_DIR ?? join(homedir(), ".socials-assistant");
const DAYS = Number(process.env.DIGEST_DAYS ?? 7);

async function main() {
  const vault = new Vault(DATA_DIR);

  // optional headless snapshot first
  if (process.env.DIGEST_SNAPSHOT !== "0" && vault.listAccounts().length > 0) {
    try {
      const { snapshotAll } = await import("../apps/mcp/dist/snapshot.js");
      const result = await snapshotAll(vault);
      console.log("[digest] snapshot:", JSON.stringify(result));
    } catch (e) {
      console.warn("[digest] snapshot skipped:", (e as Error).message);
    }
  }

  const data = digestData(vault, DAYS);
  const md = renderMarkdown(data);
  mkdirSync("digests", { recursive: true });
  const file = `digests/${data.week}.md`;
  writeFileSync(file, md);
  console.log(`[digest] wrote ${file}`);

  if (process.env.RESEND_API_KEY && process.env.DIGEST_TO && process.env.DIGEST_FROM) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: process.env.DIGEST_FROM,
        to: process.env.DIGEST_TO.split(","),
        subject: `📊 Week ${data.week} — socials digest`,
        text: md,
      }),
    });
    console.log("[digest] email:", res.status, res.ok ? "sent" : await res.text());
  } else {
    console.log("[digest] email skipped (set RESEND_API_KEY, DIGEST_TO, DIGEST_FROM to enable)");
  }
  vault.close();
}

function renderMarkdown(d: ReturnType<typeof digestData>): string {
  const pct = (x: number | null | undefined) => (x === null || x === undefined ? "—" : `${x >= 0 ? "+" : ""}${(x * 100).toFixed(0)}%`);
  const fmt = (n: number | undefined) => (n === undefined ? "—" : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n)));
  const lines: string[] = [];
  lines.push(`# 📊 Week ${d.week} — socials digest`);
  lines.push("");
  lines.push(`_Generated ${d.generatedAt} · vault history since ${d.historySince ?? "first run"}_`);
  lines.push("");

  for (const p of d.platforms) {
    lines.push(`## ${p.platform}${p.handle ? ` (@${p.handle})` : ""}`);
    lines.push("");
    lines.push("| metric | last 7d | prior 7d | change |");
    lines.push("|---|---|---|---|");
    for (const c of p.comparisons) {
      lines.push(`| ${c.metric} | ${fmt(c.current)} | ${fmt(c.prior)} | ${pct(c.changePct)} |`);
    }
    if (p.topVideos.length) {
      lines.push("");
      lines.push("**Top content:**");
      for (const v of p.topVideos.slice(0, 3)) {
        lines.push(`- "${v.title}" — ${fmt(v.views ?? 0)} views${v.engagementRate ? `, ${(v.engagementRate * 100).toFixed(1)}% ER` : ""}`);
      }
    }
    lines.push("");
  }

  if (d.bestContent.length) {
    lines.push("## 🏆 Best across platforms");
    for (const v of d.bestContent) lines.push(`- **${v.platform}** · "${v.title}" — ${fmt(v.views ?? 0)} views`);
    lines.push("");
  }
  const countries = d.audience.filter((a) => a.dimension === "country").slice(0, 3);
  if (countries.length) {
    lines.push("## 🌍 Audience");
    for (const c of countries) lines.push(`- ${c.key}: ${(c.value * 100).toFixed(0)}% (${c.platform})`);
    lines.push("");
  }
  if (d.warnings.length) {
    lines.push("## ⚠️ Warnings");
    for (const w of d.warnings) lines.push(`- ${w}`);
  }
  return lines.join("\n") + "\n";
}

main().catch((e) => {
  console.error("[digest] fatal:", e);
  process.exit(1);
});
void existsSync; void readFileSync;
