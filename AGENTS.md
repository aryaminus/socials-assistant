# Socials Assistant — Agent Integration Guide

One vault, every agent: Claude Code, Claude Desktop, Codex, Gemini CLI, opencode, Cursor, ChatGPT (via remote MCP). Local-first, official APIs only.

## Install

| Host | Method |
|------|--------|
| Claude Code (this repo) | `.mcp.json` auto-loads → approve when prompted |
| Claude Code (any project) | `claude mcp add socials -- node /abs/path/apps/mcp/bin/socials-mcp.js` |
| Claude Code plugin | `/plugin marketplace add aryaminus/socials-assistant` → `/plugin install socials-assistant` |
| Codex / Cursor / Copilot / 50+ hosts | `npx skills add aryaminus/socials-assistant -g` |
| claude.ai (web) | Download `.skill` bundle from releases → Settings → Capabilities → Skills → + |
| Claude Desktop | `claude_desktop_config.json` snippet in `agents/README.md` |
| Gemini CLI | `gemini-extension.json` committed; or MCP block in `~/.gemini/settings.json` |
| ChatGPT | Deploy the Worker (below) → add as plugin/custom connector (Business/Enterprise) or via Responses API `tools: [{type: "mcp"}]` |
| Docker / any VPS | `docker compose up --build` → HTTP MCP at `:3344` |
| Cloud (multi-tenant) | `cd infra/worker && npx wrangler deploy` (guide: `docs/hosting-cloudflare.md`) |

From source (single setup):

```bash
git clone https://github.com/aryaminus/socials-assistant && cd socials-assistant
./setup.sh          # pnpm install + build + doctor + next steps
```

## Dev commands

```bash
pnpm install && pnpm build                 # build all packages
pnpm test                                  # unit tests (17)
pnpm exec tsx scripts/audit-mcp.ts         # MCP contract audit (names, schemas, order, errors)
pnpm exec tsx scripts/lint-skills.ts       # SKILL.md spec compliance
node apps/mcp/bin/socials-mcp.js doctor    # environment + vault health check
node apps/mcp/bin/socials-mcp.js snapshot  # headless snapshot (cron-safe)
npx tsx scripts/weekly-digest.ts           # digest → digests/YYYY-WW.md (+ optional email)
```

Tests, audit, and lint also run in CI (`.github/workflows/ci.yml`).

## Environment variables

| Var | Default | Effect |
|-----|---------|--------|
| `SOCIALS_DATA_DIR` | `~/.socials-assistant` | Vault + config location |
| `SOCIALS_GOOGLE_CLIENT_ID/SECRET` | config file | YouTube app credentials |
| `SOCIALS_META_APP_ID/SECRET` | config file | Instagram+Facebook app credentials |
| `SOCIALS_TIKTOK_CLIENT_KEY/SECRET` | config file | TikTok app credentials |
| `SOCIALS_MCP_PORT` | `3344` | HTTP mode port |
| `SOCIALS_MCP_TOKEN` | unset | Bearer token for HTTP mode (set for non-local use) |
| `SOCIALS_ALLOW_SEND` | unset | **Outreach safety:** must be set before ANY send automation |
| `DIGEST_TO/FROM`, `RESEND_API_KEY` | unset | Weekly digest self-email |

Platform credentials persist (encrypted) in `$SOCIALS_DATA_DIR/config.json` + vault DB; env vars win over the file. Secrets are never written to logs or results.

## MCP server

- Local stdio: `node apps/mcp/bin/socials-mcp.js`
- Local/LAN HTTP: `node apps/mcp/bin/socials-mcp.js --http` → `POST /mcp` (+ `/health`, `/version`)
- Remote: deploy `infra/worker` (Cloudflare, OAuth 2.1 + DCR) — per-user encrypted token store in D1

Tool inventory (15): `connection_status · connect_youtube · connect_meta · connect_tiktok · snapshot · import_tiktok_csv · vault_query · compare_periods · top_content · audience_overview · digest_data · media_kit_data · outreach_log_add · outreach_log_list · outreach_log_update`

Errors return as tool results (`isError: true`) with a `fix:` hint — agents should read and self-correct rather than retry blindly. Results are capped (500 rows) to respect agent context limits.

## Safety rules (enforced, not just documented)

- Official platform APIs only; no scraping, no automation of logged-in TikTok Studio sessions.
- Platform OAuth tokens encrypted at rest (AES-256-GCM), never returned by any tool.
- Outreach is draft-first: no tool sends email; `SOCIALS_ALLOW_SEND` gates any send automation the user wires separately (Resend MCP).
- `vault_query` is read-only SELECT, blocked from writes/DDL.

## Marketplace listings

| Registry | Status |
|----------|--------|
| Official MCP Registry | `server.json` ready (`mcp-publisher publish`) |
| Claude Plugin Marketplace | `.claude-plugin/` committed |
| Smithery | `smithery.yaml` committed |
| Glama / PulseMCP | auto-index once public |

## Repo conventions

- pnpm monorepo; Node ≥ 22.5 (built-in `node:sqlite`); TypeScript strict; ESM only.
- Workspace packages: `@socials/shared`, `@socials/vault`, `@socials/connectors`, app `socials-mcp`.
- Skills live in `skills/<name>/SKILL.md` (agentskills.io spec); `.claude/skills/` and `.agents/skills/` are symlinks for native discovery.
- Version bumps: update `apps/mcp/package.json`, root `package.json`, `server.json`, `.claude-plugin/plugin.json` together; log in `CHANGELOG.md`.
