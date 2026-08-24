# Socials Assistant

[![npm version](https://img.shields.io/npm/v/@aryaminus/socials-mcp?logo=npm&color=cb3837)](https://www.npmjs.com/package/@aryaminus/socials-mcp)
[![GitHub Release](https://img.shields.io/github/v/release/aryaminus/socials-assistant?logo=github)](https://github.com/aryaminus/socials-assistant/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![CI](https://github.com/aryaminus/socials-assistant/actions/workflows/ci.yml/badge.svg)](https://github.com/aryaminus/socials-assistant/actions/workflows/ci.yml)
[![Docker](https://img.shields.io/badge/Docker-ghcr.io%2Faryaminus%2Fsocials--assistant-2496ED?logo=docker)](https://github.com/aryaminus/socials-assistant/pkgs/container/socials-assistant)

**MCP server + agent skills for social media creators.** Pull your own TikTok, Instagram, Facebook, and YouTube analytics into a permanent vault, get weekly digests, review scripts, build media kits, and draft brand outreach with real numbers — from any AI agent.

Official APIs only. No scraping. No ToS risk.

## Quick start — pick one

### 1. One prompt (easiest)

Copy the prompt from [docs/SETUP-PROMPT.md](docs/SETUP-PROMPT.md) and paste it into Claude, ChatGPT, Gemini, Codex, Cursor, or any MCP-compatible agent. It asks you one question (cloud or local), then guides you step by step — handing you each link to click, coaching you through platform credentials from the repo's own docs, connecting your agent, and verifying every step before moving on. You stay in control; nothing runs without your go-ahead.

### 2. Cloud, zero install

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/aryaminus/socials-assistant/tree/main/infra/worker)

Then open `https://<your-worker>.workers.dev/setup` for the credential checklist. Full journey: [docs/GET-STARTED-CLOUD.md](docs/GET-STARTED-CLOUD.md).

### 3. npx

```bash
npx @aryaminus/socials-mcp onboard
```

Installs nothing globally — prints guided setup for platform credentials, then serves MCP on stdio/HTTP.

### 4. Local from source

```bash
git clone https://github.com/aryaminus/socials-assistant && cd socials-assistant
./setup.sh && node apps/mcp/bin/socials-mcp.js onboard
```

## What you get

| | |
|--|--|
| **20 MCP tools** | connect · snapshot · vault query · period compare · top content · audience · digest · media kit · pipeline · outreach log |
| **6 skills** | [socials-connect](skills/socials-connect/SKILL.md) · [weekly-digest](skills/weekly-digest/SKILL.md) · [script-review](skills/script-review/SKILL.md) · [publish-package](skills/publish-package/SKILL.md) · [brand-outreach](skills/brand-outreach/SKILL.md) · [media-kit](skills/media-kit/SKILL.md) |
| **History vault** | platforms expire analytics; your SQLite (local) or D1 (cloud) vault doesn't |
| **TikTok CSV import** | retention, traffic sources, search terms — Studio-only data via one command |
| **Draft-first outreach** | real numbers from your vault; nothing sends without your approval |

## Connect your agent

| Agent | How |
|-------|-----|
| Claude.ai / Desktop | Settings → Connectors → custom connector → paste MCP URL |
| Claude Code | `claude mcp add --transport http socials <URL>` |
| Codex | `[mcp_servers.socials] url = "<URL>"` + `codex mcp login socials` |
| Cursor | Settings → MCP Servers → paste URL |
| Gemini CLI | mcpServers block in `~/.gemini/settings.json` |
| Everything else | [agents/README.md](agents/README.md) |

## Docs

| Doc | Read when |
|-----|-----------|
| [docs/SETUP-PROMPT.md](docs/SETUP-PROMPT.md) | you want the one-prompt path |
| [docs/GET-STARTED-CLOUD.md](docs/GET-STARTED-CLOUD.md) | deploying to Cloudflare |
| [docs/onboarding-google.md](docs/onboarding-google.md) / [meta](docs/onboarding-meta.md) / [tiktok](docs/onboarding-tiktok.md) | creating platform apps for OAuth |
| [docs/CAPABILITIES.md](docs/CAPABILITIES.md) | checking what data each platform exposes |
| [docs/hosting-cloudflare.md](docs/hosting-cloudflare.md) | manual cloud deployment details |
| [docs/automation.md](docs/automation.md) | scheduling weekly snapshots + digests |
| [AGENTS.md](AGENTS.md) | env vars, CLI commands, release process |
| [CONTRIBUTING.md](CONTRIBUTING.md) | developing on this repo |

## Security

Tokens encrypted at rest (AES-256-GCM) · official APIs only · vault local by default · outreach never auto-sends. Details: [SECURITY.md](SECURITY.md).

MIT © 2026 [aryaminus](https://github.com/aryaminus)
