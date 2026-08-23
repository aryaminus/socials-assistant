# Socials Assistant

Open-source analytics vault + MCP server + agent skills for creators. Pull your own TikTok, Instagram, Facebook, and YouTube metrics into a permanent history vault, get weekly digests, and draft brand-outreach emails with real numbers — from any AI agent.

**Official APIs only. No scraping. No ToS risk.**

## Quickstart

**Cloud (zero install):** [![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/aryaminus/socials-assistant) → follow [docs/GET-STARTED-CLOUD.md](docs/GET-STARTED-CLOUD.md)

**Local:**
```bash
git clone https://github.com/aryaminus/socials-assistant && cd socials-assistant
./setup.sh && node apps/mcp/bin/socials-mcp.js onboard
```

## How it works

```
Platform APIs (YouTube · Instagram · Facebook · TikTok)
  ↓ OAuth + snapshots
SQLite Vault (local) or D1 (Cloudflare)
  ↓ agent reads
Skills: digest · outreach · media-kit · script-review · publish-package
```

| Surface | Command |
|---------|---------|
| Local stdio | `node apps/mcp/bin/socials-mcp.js` |
| Local HTTP | `--http` + `SOCIALS_MCP_TOKEN` |
| Cloud (multi-tenant) | Deploy Worker → one URL for all agents |

## What you get

- **20 MCP tools** — connect, snapshot, query, compare, digest, outreach
- **6 skills** — socials-connect, weekly-digest, script-review, publish-package, brand-outreach, media-kit
- **TikTok CSV importer** — retention, traffic sources, search terms (Studio-only data, one command)
- **History vault** — platforms expire analytics; this doesn't
- **Draft-first outreach** — real numbers, no auto-send

## Capabilities & limits

Full capability map, derived analyses, and honest data-availability table: [docs/CAPABILITIES.md](docs/CAPABILITIES.md)

## Deploy

| Path | Guide |
|------|-------|
| Cloudflare Workers (recommended) | [docs/hosting-cloudflare.md](docs/hosting-cloudflare.md) |
| Docker / VPS | `docker compose up --build` |
| Local | `./setup.sh` |

## Agent configs

Copy-paste MCP config for Claude Code, Claude Desktop, Codex, Gemini CLI, opencode, Cursor: [agents/README.md](agents/README.md)

## Docs

| Doc | What |
|-----|------|
| [docs/GET-STARTED-CLOUD.md](docs/GET-STARTED-CLOUD.md) | Zero-install cloud journey |
| [docs/hosting-cloudflare.md](docs/hosting-cloudflare.md) | Cloudflare deploy guide |
| [docs/CAPABILITIES.md](docs/CAPABILITIES.md) | Full capability map |
| [docs/automation.md](docs/automation.md) | Weekly snapshot + digest cron |
| [docs/onboarding-*.md](docs/) | Per-platform OAuth setup |
| [AGENTS.md](AGENTS.md) | Install, env vars, operations |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Dev setup, ground rules |

## Security

Tokens encrypted at rest. Official APIs only. Vault is local by default. Outreach never auto-sends. Details: [SECURITY.md](SECURITY.md)

MIT © 2026
