# Contributing

## Setup

```bash
git clone https://github.com/aryaminus/socials-assistant && cd socials-assistant
./setup.sh              # install + build + doctor
pnpm test               # unit tests
pnpm exec tsx scripts/audit-mcp.ts && pnpm exec tsx scripts/lint-skills.ts
```

## Ground rules

1. **Official APIs only.** Any PR adding scraping or automation of logged-in platform sessions will be closed.
2. **Data discipline.** Tools return verified vault data only; skills never instruct estimation. Keep results under context caps (500-row query cap).
3. **Skills follow the agentskills.io spec** — 6-field frontmatter, name matches directory, description says what + when, progressive disclosure via `references/`/`assets/`. Run the lint before committing.
4. **MCP surface is deliberate** — few, high-leverage tools over many wrappers. New tools must justify themselves against the capability map (`docs/CAPABILITIES.md`).
5. TypeScript strict, ESM, Node ≥22.5 built-ins (`node:sqlite`) — avoid native deps.

## Conventions

- Conventional commits (`feat:`, `fix:`, `docs:` …). Version bumps touch: root `package.json`, `apps/mcp/package.json`, `server.json`, `.claude-plugin/plugin.json`, plus `CHANGELOG.md`.
- Tests colocated in `packages/*/test/`; fixtures over live APIs (no credentials in CI).
- Docs changes are PRs too.

## Adding a connector

Implement the snapshot contract in `packages/connectors/src/` (see an existing connector): `connect<Platform>()` (OAuth + token refresh) and `snapshot<Platform>()` returning a `NormalizedSnapshot`. Add fixture tests, a `docs/onboarding-<platform>.md`, and extend `socials-connect` skill only if the flow differs.
