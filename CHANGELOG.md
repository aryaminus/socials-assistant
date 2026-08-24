# Changelog

All notable changes to this project are documented here. Format: Keep a Changelog; versioning: SemVer.

## [0.4.9] — 2026-08-23

### Fixed
- Deploy button targets the worker subdirectory (`infra/worker`) so Cloudflare detects the wrangler config and provisions D1 + KV correctly
- Worker-scoped deploy-form secrets with `CHANGE_ME` placeholders + in-form binding descriptions; runtime treats placeholders as unset
- Setup prompt: consent-first guided flow, cloud default with npx/local fallbacks, per-agent connector configs, redirect-mismatch self-recovery

## [0.4.8] — 2026-08-23

### Changed
- npm metadata: expanded keywords for search discovery (mcp, model-context-protocol, content-creator, ai-agent, claude, chatgpt, gemini, cursor, opencode, …)
- Sharper package description

## [0.4.7] — 2026-08-23

### Fixed
- npm package now includes README.md + LICENSE on npmjs.com
- Docker build: `CI=true` env var prevents pnpm TTY prompt in container

## [0.4.6] — 2026-08-23

### Added
- Publish to GitHub Packages (`npm.pkg.github.com`) — visible on repo's Packages tab
- Docker build fix: corepack fallback for `node:25-slim` images

### Changed
- README updated with scoped npm name `@aryaminus/socials-mcp` and package links

## [0.4.5] — 2026-08-23

### Fixed
- Release smoke workflow: tarball glob pattern matches scoped package name `aryaminus-socials-mcp-*.tgz`

## [0.4.4] — 2026-08-23

### Changed
- Renamed npm package from `socials-mcp` to `@aryaminus/socials-mcp` (scoped under `@aryaminus` org)
- CLI binary unchanged: `socials-mcp` command works the same

### Fixed
- npm publish: use `npm config set` for auth token instead of `setup-node` registry-url conflict
- CI workflows: updated pnpm filter to match scoped package name

## [0.4.3] — 2026-08-23

### Fixed
- npm publish: use `npm config set` instead of `setup-node` registry-url to avoid token conflict

## [0.4.2] — 2026-08-23

### Fixed
- npm publish: hardcode `.npmrc` auth token in CI workflow (setup-node `.npmrc` generation was not passing token correctly)

## [0.4.1] — 2026-08-23

### Added
- `docs/SETUP-PROMPT.md`: single magic prompt users paste into any AI agent (Claude, ChatGPT, Gemini, Codex, Cursor, DeepSeek, Qwen, Pi, opencode, Claude Desktop, Claude Code, or any MCP-compatible agent) for full end-to-end setup

### Changed
- All docs now agent-agnostic — no longer claude.ai-specific; every agent listed equally (Claude, ChatGPT, Gemini, Codex, Cursor, DeepSeek, Qwen, Pi, opencode, Claude Desktop, Claude Code, Antigravity, Z.ai, and any MCP-compatible agent)
- README.md: one-prompt setup section prominent at top
- AGENTS.md: one-prompt setup reference, all agents listed in install table
- GET-STARTED-CLOUD.md: agent-agnostic connector instructions with per-agent table

### Fixed
- npm publish: removed `--registry` flag that overrode `.npmrc` token from `setup-node`

## [0.4.0] — 2026-08-23

### Added
- Zero-install cloud journey (docs/GET-STARTED-CLOUD.md): Deploy-to-Cloudflare button (root wrangler.jsonc auto-provisions Worker+D1+KV), self-service `/setup` checklist page served by the Worker (no CLI), in-chat platform connections (`platform_oauth_url` / `platform_oauth_exchange` — agent issues consent link, human pastes the redirect back; tokens exchanged server-side, stored encrypted)
- Platform-OAuth landing page (/oauth/*/done) with paste-back instructions
- Release pipeline aligned with controlkeel pattern: `release-smoke.yml` (builds + tests + skill bundles on version-bump commits), `release.yml` (tag-driven, waits for smoke, cosign + checksums, GitHub Release, npm publish with provenance)
- `.env.example` template with all environment variables documented
- `script-review` skill: search demand research, Good/Bad/Ugly summary, on-screen text cues with timestamps, mid-video re-hook suggestions, content-mix fit dimension, plain language rule

### Changed
- README rewritten: concise, no redundant info, points to docs for details
- Removed Render deployment (`render.yaml`) and Smithery marketplace (`smithery.yaml`)
- Removed Render/Fly/Railway from provider comparisons in infra/worker/README.md
- CI (`ci.yml`) skips version-bump commits, concurrency groups, paths-ignore for docs
- `apps/mcp/package.json`: aligned `@modelcontextprotocol/sdk` to `^1.30.0`, `zod` to `^3.25.0`; fixed `main`/`exports` to point to `dist-bundle/`
- AGENTS.md: full setup reference (GitHub secrets, Cloudflare secrets, local env, npm publish), missing env vars added (SOCIALS_CSV_DIR, SOCIALS_OAUTH_PORT, SOCIALS_ALLOWED_ORIGINS)

### Removed
- `render.yaml` (Render deployment)
- `smithery.yaml` (Smithery marketplace listing)

## [0.3.0] — 2026-08-23

### Added
- Creator profile (`profile_get`/`profile_set`): per-installation tuning (niche, tone, series, rate floor, goals, SEO keywords) — the system stays generic but tunes to whoever uses it; skills read it before niche-sensitive work
- Content pipeline (`pipeline_add`/`pipeline_list`/`pipeline_update`): production stages idea → scripting → script_review → brand_review → approved → posted → measured — tracks scripts through brand green lights to post-publish measurement
- `script-review` skill: scores scripts /50 against the creator's own proven hooks, retention curves, and keywords; outputs fixes + SEO package
- `publish-package` skill: green light → title/caption/hashtags/best-time (day-of-week from vault) → 48h velocity check → 7-day verdict vs median → case study for the next pitch
- `import_tiktok_csv` auto-discovery: path optional — finds the newest Studio export in ~/Downloads (SOCIALS_CSV_DIR override); CLI `socials-mcp import` likewise
- brand-outreach: sponsored review-request email template; profile-driven targeting and rate floor
- npm publish readiness: esbuild single-file bundle (`pnpm bundle` / prepack), workspace deps inlined, runtime deps = sdk + zod only; `npm pack` verified (35.9 kB, 6 files, 20 tools live)

### Changed
- All skills read the creator profile first; socials-connect bootstraps it after first snapshot
- Tool surface 15 → 20 (auditor + server.json + docs updated together)

### Removed
- Every creator-identifying reference from fixtures/tests/docs — the repo is fully generic

## [0.2.0] — 2026-08-23

### Added
- One-command setup: `./setup.sh` (install + build + doctor + next steps)
- `socials-mcp doctor` — environment, config, and vault health check with fix hints
- `socials-mcp --version`; HTTP `/health` and `/version` endpoints
- MCP contract audit (`scripts/audit-mcp.ts`) and skills spec lint (`scripts/lint-skills.ts`), wired into CI
- Distribution formats: `server.json` (official MCP Registry), `.claude-plugin/` (Claude Code marketplace), `.agents/plugins/marketplace.json` (skills CLI), `gemini-extension.json`, `smithery.yaml`, `.well-known/mcp/server-card.json`, `llms.txt`
- Self-hosting: Docker/GHCR image for VPS deployments
- Repo standards: AGENTS.md (+CLAUDE.md symlink), CHANGELOG, SECURITY, SUPPORT, CONTRIBUTING, CODEOWNERS, issue/PR templates, Dependabot
- Skills restructured to the agentskills.io spec: 6-field frontmatter, progressive disclosure (`references/`, `assets/`), fully-qualified tool names, fully generic (no creator-specific examples baked in)
- `.claude/skills/` and `.agents/skills/` symlinks for native cross-agent skill discovery

### Changed
- MCP error results now use `isError: true` with actionable `fix:` hints (self-correcting agents)
- `vault_query` caps results at 500 rows (agent context discipline)
- HTTP transport validates `Origin` (DNS-rebinding defense); rejects non-POST to `/mcp` with 405

### Fixed
- `node:sqlite` stale rowid after video upsert (deterministic id resolution)
- Exact N-day comparison windows (strict date boundaries)

## [0.1.0] — 2026-08-23

Initial release: 4 official-API connectors (YouTube, Meta/IG+FB, TikTok), SQLite history vault with encrypted tokens, TikTok Studio CSV importer, 15-tool MCP server (stdio + streamable HTTP), 4 skills, Cloudflare Worker kit, GitHub Actions automation.
