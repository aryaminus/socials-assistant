# Socials Assistant 📊✉️

**Open-source analytics vault + MCP server + agent skills for nano/micro creators.**
Pull your *own* TikTok, Instagram, Facebook, and YouTube metrics into a local history vault, get weekly digests, and draft brand-outreach emails with your real numbers — from **any** AI agent: Claude Code, Claude Desktop/Cowork, ChatGPT, Codex, Gemini CLI, Antigravity, opencode, Cursor, and more.

- 🧱 **One MCP server, two runtimes** — `npx socials-mcp` locally (stdio/HTTP, SQLite vault) or deploy it to Cloudflare Workers (remote MCP, OAuth 2.1, multi-tenant).
- 🗄️ **History vault** — platforms expire your analytics (TikTok Studio windows roll off in weeks). Snapshots persist forever in SQLite/D1.
- 📥 **TikTok Studio CSV importer** — retention curves, traffic sources, and search terms are Studio-only (no official API exposes them). This is the only ToS-compliant path, and we make it one command.
- ✅ **Official APIs only** — your own OAuth tokens, your own data. No scrapers, no ToS violations, no ban risk.
- ✉️ **Draft-first outreach** — brand pitches are drafted from real vault metrics; sending is explicitly gated.
- 💸 **≈$0/month** to run.

## Quickstart (single setup)

```bash
git clone https://github.com/aryaminus/socials-assistant
cd socials-assistant
./setup.sh                                 # install + build + test + doctor + next steps
node apps/mcp/bin/socials-mcp.js onboard   # guided setup: platform apps + OAuth
node apps/mcp/bin/socials-mcp.js snapshot  # pull analytics into the vault
```

After npm publish: `npx socials-mcp` replaces the clone for end users. All install paths (plugin marketplace, skills CLI, Docker, Render, Cloudflare, per-agent configs): see **AGENTS.md** and **agents/README.md**.

## Where things run

| Surface | How |
|---|---|
| Local stdio (any agent) | `node apps/mcp/bin/socials-mcp.js` |
| Local/LAN HTTP | `--http` + `SOCIALS_MCP_TOKEN` |
| Docker / VPS | `docker compose up --build` |
| Cloud (multi-tenant, OAuth 2.1) | `infra/worker` + `docs/hosting-cloudflare.md` |
| Claude Code plugin | `/plugin marketplace add aryaminus/socials-assistant` |
| Skills (all agents) | `skills/` (+ `.claude/skills/`, `.agents/skills/` symlinks) |

## Scope

Focused on one loop: **own-analytics vault → insight → outreach**. The full capability map — including derived analyses the skills compute (trend anomalies, hook quality from retention, traffic-mix shifts, brand-fit scoring) and explicit non-goals — is in [docs/CAPABILITIES.md](docs/CAPABILITIES.md).

Then add the MCP server to your agent (see [agents/](agents/README.md)) and ask things like:

> *"Snapshot my accounts, then give me this week's digest and draft a pitch to three brands that fit my audience using my real numbers."*

## What's inside

```
packages/
  shared/        normalized metric types + math used everywhere
  vault/         SQLite vault (node:sqlite, zero native deps) + TikTok Studio CSV importer
  connectors/    YouTube (Data+Analytics+Reporting) · Meta (Instagram+Facebook Graph) · TikTok (Display API)
apps/mcp/        socials-mcp — MCP server (stdio + streamable HTTP), CLI entry
skills/          socials-connect · weekly-digest · brand-outreach · media-kit  (portable SKILL.md)
infra/worker/    Cloudflare Worker remote MCP (OAuth 2.1 + DCR, D1 vault, multi-tenant)
agents/          copy-paste config for Claude Code / Claude Desktop / Codex / Gemini / Antigravity / opencode
scripts/         weekly-digest.ts (used by GitHub Actions cron or any scheduler)
docs/            per-platform OAuth onboarding, Cloudflare hosting, automation, deliverability
```

## MCP tools

| Tool | What it does |
|---|---|
| `connect_youtube` / `connect_meta` / `connect_tiktok` | Browser OAuth, stores encrypted tokens (Meta flow covers Instagram + Facebook together) |
| `connection_status` | Which accounts are connected, token health |
| `profile_get` / `profile_set` | The creator profile (niche, tone, rate floor, goals) — how a generic install tunes itself to one creator |
| `snapshot` | Pull all platforms → vault (run weekly; history accrues) |
| `import_tiktok_csv` | Ingest TikTok Studio CSV exports — **auto-discovers the newest export in ~/Downloads; path optional** |
| `pipeline_add` / `pipeline_list` / `pipeline_update` | Production calendar: idea → scripting → script_review → brand_review → approved → posted → measured |
| `vault_query` | Safe read-only SQL over the vault |
| `compare_periods` | Metric deltas: this week vs last, this month vs last |
| `top_content` | Best/worst videos by any metric in a window |
| `audience_overview` | Demographics (age/gender/country/city) latest snapshot |
| `digest_data` | Structured weekly-digest payload for the `weekly-digest` skill |
| `media_kit_data` | Verified numbers for the `media-kit` skill |
| `outreach_log_*` | Track brand pitches: drafted → sent → replied |

## Data we can and can't get (honest table)

| Data | YouTube | Instagram | Facebook | TikTok |
|---|---|---|---|---|
| Views / likes / comments / shares | API | API | API | API |
| Reach, watch time, profile growth | API | API | API | **CSV** |
| Retention curve | API | — | — | **CSV** |
| Traffic sources | API | — | — | **CSV** |
| Audience demographics | API | API | API (Page) | **CSV** (partial) |
| Search terms / followers-by-hour | — | — | — | **CSV** |

TikTok's official APIs never expose Studio-only fields — no connector anywhere can change that. Weekly CSV export from TikTok Studio (≈5 min) is the compliant path, and `import_tiktok_csv` makes it one command: it **auto-finds the newest export in your Downloads folder** (or set `SOCIALS_CSV_DIR`). We deliberately do **not** scrape or automate your logged-in Studio session (ToS + account risk).

## Skills

Each skill in [skills/](skills/) is a portable `SKILL.md` that works in Claude Code, opencode, Codex, and other skill-aware agents. They read **only real vault data** — never invent metrics.

- **socials-connect** — step-by-step OAuth onboarding for all three platform apps + profile bootstrap
- **weekly-digest** — cross-platform scorecard with wins/losses/next actions
- **script-review** — scores scripts against the creator's own proven hooks/retention/SEO before production or brand submission
- **publish-package** — brand green light → title/caption/hashtags/best-time package → post-post measurement vs baseline
- **brand-outreach** — pitch drafting from verified numbers, draft-first, daily send caps
- **media-kit** — always-fresh media kit generated from the vault

## Cloud / multi-tenant

Deploy the same tools as a remote MCP on Cloudflare Workers (free tier: 100k req/day) with OAuth 2.1 + Dynamic Client Registration — so **any** creator can connect *their* agent to *their* vault with one URL. Guide: [docs/hosting-cloudflare.md](docs/hosting-cloudflare.md).

## Automation

Weekly snapshot + digest + (optional) email via GitHub Actions cron — free. See [docs/automation.md](docs/automation.md). Non-technical alternative: Claude Cowork scheduled task prompt in the same doc.

## Security & privacy

- Tokens encrypted at rest (AES-256-GCM, key file `~/.socials-assistant/key`, 0600)
- All API access uses official platform APIs with **your** developer app and **your** OAuth consent
- The vault is local SQLite by default; nothing leaves your machine unless you deploy the worker
- Outreach **never** auto-sends without `SOCIALS_ALLOW_SEND` + a hard daily cap

## Status

- [x] P1 connectors + vault + local MCP (`npx socials-mcp`)
- [x] P2 skills + agent configs
- [x] P3 Cloudflare Worker remote MCP
- [x] P4 GitHub Actions automation
- [x] P5 docs + onboarding guides
- [ ] npm publish (`socials-mcp`) — after first real-world dogfood

MIT © 2026
