#!/usr/bin/env env tsx
/**
 * lint-skills — validate each skills/<name>/SKILL.md against the agentskills.io
 * spec: frontmatter fields, name rules (must match dir), description length,
 * body budget, link integrity, no Windows paths. Exit 1 on failure.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const skillsDir = join(here, "..", "skills");

const SPEC_FIELDS = new Set(["name", "description", "license", "compatibility", "metadata", "allowed-tools"]);
const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

let failures = 0;
const check = (name: string, cond: boolean, detail = "") => {
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
};

const skills = readdirSync(skillsDir, { withFileTypes: true }).filter((d) => d.isDirectory());
check("skills present", skills.length >= 1, skills.map((s) => s.name).join(", "));

for (const skill of skills) {
  const path = join(skillsDir, skill.name, "SKILL.md");
  if (!existsSync(path)) {
    check(`SKILL.md exists: ${skill.name}`, false);
    continue;
  }
  const raw = readFileSync(path, "utf8");

  // frontmatter block
  const fmMatch = /^---\n([\s\S]*?)\n---\n/.exec(raw);
  check(`frontmatter block: ${skill.name}`, !!fmMatch);
  if (!fmMatch) continue;
  const fm: Record<string, string> = {};
  for (const line of fmMatch[1].split("\n")) {
    const m = /^([a-zA-Z-]+):\s*(.*)$/.exec(line);
    if (m) fm[m[1]] = m[2];
  }
  const extraFields = Object.keys(fm).filter((k) => !SPEC_FIELDS.has(k));
  check(`spec-only frontmatter fields: ${skill.name}`, extraFields.length === 0, extraFields.join(", ") || "ok");
  check(`name matches directory: ${skill.name}`, fm.name === skill.name, `frontmatter name: ${fm.name}`);
  check(`name regex (lowercase/hyphen): ${skill.name}`, NAME_RE.test(fm.name ?? ""));
  const descLen = (fm.description ?? "").length;
  check(`description 1–1024 chars: ${skill.name}`, descLen >= 1 && descLen <= 1024, `${descLen} chars`);
  check(`description covers when-to-use: ${skill.name}`, /use when|use if|when the user/i.test(fm.description ?? ""), "needs 'Use when…' trigger phrasing");

  // body budget
  const body = raw.slice(fmMatch[0].length);
  const lines = body.split("\n").length;
  check(`body < 500 lines: ${skill.name}`, lines < 500, `${lines} lines`);

  // link integrity (relative links one level deep)
  const links = [...body.matchAll(/\]\((?!https?:)([^)#]+?)(#[^)]*)?\)/g)].map((m) => m[1]);
  for (const link of links) {
    check(`link resolves: ${skill.name}/${link}`, existsSync(join(skillsDir, skill.name, link)));
  }

  // no Windows-style paths
  check(`no backslash paths: ${skill.name}`, !/[A-Za-z0-9_]\\\\[A-Za-z0-9_]/.test(body));
}

if (failures) {
  console.error(`\nlint-skills: ${failures} failure(s)`);
  process.exit(1);
}
console.log("\nlint-skills: all checks passed");
