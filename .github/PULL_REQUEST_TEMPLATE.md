## Summary

<!-- What + why. -->

## Changes

-

## Checklist

- [ ] `pnpm build` clean
- [ ] `pnpm test` passing; new behavior has tests
- [ ] `pnpm exec tsx scripts/audit-mcp.ts` passing (if MCP surface changed)
- [ ] `pnpm exec tsx scripts/lint-skills.ts` passing (if skills changed)
- [ ] Official APIs only — no scraping, no logged-in session automation
- [ ] CHANGELOG.md updated (user-facing changes)
- [ ] Version files bumped together (root + apps/mcp + apps/mcp/src/server.ts VERSION + server.json + .claude-plugin) with a CHANGELOG.md entry
