# Socials Assistant — Agent Integration Guide

One vault, every agent: Claude, ChatGPT, Gemini, Codex, Cursor, DeepSeek, Qwen, Pi, opencode, Claude Desktop, Claude Code, and any MCP-compatible agent. Local-first, official APIs only.

## One-prompt setup

**Paste this into any agent** — it handles everything: [docs/SETUP-PROMPT.md](docs/SETUP-PROMPT.md)

## Install

| Host | Method |
|------|--------|
| Claude Code (this repo) | `.mcp.json` auto-loads → approve when prompted |
| Claude Code (any project) | `claude mcp add socials -- node /abs/path/apps/mcp/bin/socials-mcp.js` |
| Claude Code plugin | `/plugin marketplace add aryaminus/socials-assistant` → `/plugin install socials-assistant` |
| Codex / Cursor / Copilot / 50+ hosts | `npx skills add aryaminus/socials-assistant -g` |
| claude.ai (web) | Download `.skill` bundle from releases → Settings → Capabilities → Skills → + |
| Claude Desktop | `claude_desktop_config.json` snippet in [agents/README.md](agents/README.md) |
| Gemini CLI | `gemini-extension.json` committed; or MCP block in `~/.gemini/settings.json` |
| ChatGPT | Deploy the Worker → add as plugin/custom connector (Business/Enterprise) or via Responses API `tools: [{type: "mcp"}]` |
| Cloud (multi-tenant) | `cd infra/worker && npx wrangler deploy` (guide: [docs/hosting-cloudflare.md](docs/hosting-cloudflare.md)) |
| npm (any agent with Node.js) | `npx @aryaminus/socials-mcp onboard` — walks through credential setup |

Zero-install cloud journey (deploy button → /setup checklist → agent connector): **[docs/GET-STARTED-CLOUD.md](docs/GET-STARTED-CLOUD.md)**

From source:

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

Tests, audit, lint, CodeQL also run in CI (`.github/workflows/ci.yml`, `codeql.yml`).

## Release process (astro-style, tag-driven)

1. Bump version together: root `package.json` · `apps/mcp/package.json` · `server.json` · `.claude-plugin/plugin.json` (+ `CHANGELOG.md`)
2. Commit: `git commit -m "chore(release): bump version to X.Y.Z"` — the exact prefix triggers the Release Smoke workflow
3. Tag + push: `git tag vX.Y.Z && git push origin main --follow-tags`
4. `.github/workflows/release-smoke.yml`: builds + tests + uploads artifact (skipped on non-version-bump commits)
5. `.github/workflows/release.yml`: waits for smoke, downloads artifact, cosign signs, creates GitHub Release, npm publish with provenance, verifies channels
6. `.github/workflows/docker.yml`: publishes `ghcr.io/aryaminus/socials-assistant:<tag>` (+ latest)

CI (`ci.yml`) skips `chore(release):` commits to avoid duplicate runs.

Stable asset URLs after any release: `releases/latest/download/socials-mcp-X.Y.Z.tgz` pattern + per-skill `.skill` for upload.

Note: `apps/mcp/dist-bundle/` is gitignored (built by prepack/publish); never commit vaults (`*.db*`), `.socials-data/`, or `controlkeel/` governance DBs.

## Environment variables

| Var | Default | Effect |
|-----|---------|--------|
| `SOCIALS_DATA_DIR` | `~/.socials-assistant` | Vault + config location |
| `SOCIALS_GOOGLE_CLIENT_ID/SECRET` | config file | YouTube app credentials |
| `SOCIALS_META_APP_ID/SECRET` | config file | Instagram+Facebook app credentials |
| `SOCIALS_TIKTOK_CLIENT_KEY/SECRET` | config file | TikTok app credentials |
| `SOCIALS_MCP_PORT` | `3344` | HTTP mode port |
| `SOCIALS_MCP_TOKEN` | unset | Bearer token for HTTP mode (set for non-local use) |
| `SOCIALS_ALLOWED_ORIGINS` | unset | Comma-separated allowed origins for HTTP mode |
| `SOCIALS_OAUTH_PORT` | `8399` | Local OAuth callback port |
| `SOCIALS_CSV_DIR` | `~/Downloads` | TikTok CSV auto-discovery search path |
| `SOCIALS_ALLOW_SEND` | unset | **Outreach safety:** must be set before ANY send automation |
| `DIGEST_TO/FROM`, `RESEND_API_KEY` | unset | Weekly digest self-email |

Platform credentials persist (encrypted) in `$SOCIALS_DATA_DIR/config.json` + vault DB; env vars win over the file. Secrets are never written to logs or results.

## MCP server

- Local stdio: `node apps/mcp/bin/socials-mcp.js`
- Local/LAN HTTP: `node apps/mcp/bin/socials-mcp.js --http` → `POST /mcp` (+ `/health`, `/version`)
- Remote: deploy `infra/worker` (Cloudflare, OAuth 2.1 + DCR) — per-user encrypted token store in D1

Tool inventory (20): `connection_status · connect_youtube · connect_meta · connect_tiktok · snapshot · import_tiktok_csv · vault_query · compare_periods · top_content · audience_overview · digest_data · media_kit_data · profile_get · profile_set · pipeline_add · pipeline_list · pipeline_update · outreach_log_add · outreach_log_list · outreach_log_update`

Errors return as tool results (`isError: true`) with a `fix:` hint — agents should read and self-correct rather than retry blindly. Results are capped (500 rows) to respect agent context limits.

## Safety rules (enforced, not just documented)

- Official platform APIs only; no scraping, no automation of logged-in TikTok Studio sessions.
- Platform OAuth tokens encrypted at rest (AES-256-GCM), never returned by any tool.
- Outreach is draft-first: no tool sends email; `SOCIALS_ALLOW_SEND` gates any send automation the user wires separately (Resend MCP).
- `vault_query` is read-only SELECT, blocked from writes/DDL.

## Setup reference

### GitHub Actions secrets (for CI/CD)

Set in GitHub → Settings → Secrets and variables → Actions:

| Secret | Required for | How to get |
|--------|-------------|------------|
| `NPM_TOKEN` | npm publish (`release.yml`) | npmjs.com → Access Tokens → Generate New Token (Classic) → Automation scope |
| `GITHUB_TOKEN` | GHCR push, releases | Auto-provided by GitHub Actions — no setup needed |

**After first npm publish**, switch to Trusted Publishing (OIDC) — no token needed:

1. Go to npmjs.com → `@aryaminus/socials-mcp` → Settings → Publishing access → **Add trusted publisher**
2. Provider: **GitHub Actions**
3. Owner: `aryaminus`, Repository: `socials-assistant`, Workflow: `release.yml`
4. Delete `NPM_TOKEN` from GitHub secrets — the workflow uses `id-token: write` for OIDC automatically

### Cloudflare Worker secrets (for cloud deployment)

Set in Cloudflare dashboard → Workers → your worker → Settings → Variables:

| Variable | Type | Source |
|----------|------|--------|
| `GOOGLE_LOGIN_CLIENT_ID` | Plain text | Google Cloud Console → OAuth client (for MCP sign-in) |
| `GOOGLE_LOGIN_CLIENT_SECRET` | Encrypted | Same OAuth client |
| `TOKEN_ENCRYPTION_KEY` | Encrypted | `openssl rand -hex 32` |
| `SOCIALS_GOOGLE_CLIENT_ID` | Encrypted | Same as GOOGLE_LOGIN or separate YouTube data app |
| `SOCIALS_GOOGLE_CLIENT_SECRET` | Encrypted | Same as GOOGLE_LOGIN or separate YouTube data app |
| `SOCIALS_META_APP_ID` | Encrypted | Meta developer app (docs/onboarding-meta.md) |
| `SOCIALS_META_APP_SECRET` | Encrypted | Same Meta app |
| `SOCIALS_TIKTOK_CLIENT_KEY` | Encrypted | TikTok developer app (docs/onboarding-tiktok.md) |
| `SOCIALS_TIKTOK_CLIENT_SECRET` | Encrypted | Same TikTok app |

Plus D1 database + KV namespace (provisioned by deploy button or manually).

### Local development

Platform credentials: set env vars OR run `socials-mcp onboard` / `socials-mcp config set <key> <value>` (persists to `~/.socials-assistant/config.json`). Env vars win over the file.

```bash
# required (for any platform you use)
export SOCIALS_GOOGLE_CLIENT_ID="..."
export SOCIALS_GOOGLE_CLIENT_SECRET="..."
export SOCIALS_META_APP_ID="..."
export SOCIALS_META_APP_SECRET="..."
export SOCIALS_TIKTOK_CLIENT_KEY="..."
export SOCIALS_TIKTOK_CLIENT_SECRET="..."

# optional
export SOCIALS_DATA_DIR="~/.socials-assistant"  # default
export SOCIALS_MCP_TOKEN="..."                   # protect HTTP mode
export SOCIALS_MCP_PORT=3344                     # default
export SOCIALS_OAUTH_PORT=8399                   # default
export SOCIALS_CSV_DIR="~/Downloads"             # TikTok CSV search path
export SOCIALS_ALLOWED_ORIGINS="https://..."     # HTTP mode origin allowlist
export SOCIALS_ALLOW_SEND="1"                    # enable send automation (with daily cap)
export DIGEST_TO="you@example.com"               # weekly digest email
export DIGEST_FROM="sender@example.com"
export RESEND_API_KEY="re_..."                   # Resend API key for email
```

### npm publish (local)

```bash
npm login                          # authenticate with npmjs.com
pnpm install && pnpm build        # build all packages
pnpm --filter @aryaminus/socials-mcp run prepack  # bundle for npm
cd apps/mcp && npm pack           # verify tarball contents
cd apps/mcp && npm publish --access public --provenance  # publish
```

The CI release flow does this automatically on tag push: `release-smoke.yml` builds + tests → `release.yml` waits for smoke → cosign signs → GitHub Release → npm publish with provenance → verifies channels.

## Repo conventions

- pnpm monorepo; Node >= 22.5 (built-in `node:sqlite`); TypeScript strict; ESM only.
- Workspace packages: `@socials/shared`, `@socials/vault`, `@socials/connectors`, app `@aryaminus/socials-mcp`.
- Skills live in `skills/<name>/SKILL.md` (agentskills.io spec); `.claude/skills/` and `.agents/skills/` symlinks for native discovery.
- Version bumps: update `apps/mcp/package.json`, root `package.json`, `server.json`, `.claude-plugin/plugin.json` together; log in `CHANGELOG.md`.
