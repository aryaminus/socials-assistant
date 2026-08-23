# Changelog

All notable changes to this project are documented here. Format: Keep a Changelog; versioning: SemVer.

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
