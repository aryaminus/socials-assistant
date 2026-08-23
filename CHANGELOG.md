# Changelog

All notable changes to this project are documented here. Format: Keep a Changelog; versioning: SemVer.

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
- Self-hosting: `Dockerfile`, `docker-compose.yml`, `render.yaml` blueprint
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
