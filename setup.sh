#!/usr/bin/env bash
# Single setup: install → build → doctor → next steps.
# Works from a fresh clone. Node >= 22.5 required (built-in node:sqlite).
set -euo pipefail
cd "$(dirname "$0")"

echo "▸ Checking Node…"
if ! node -e 'const [M,m]=process.versions.node.split(".").map(Number); process.exit(M>22||(M===22&&m>=5)?0:1)'; then
  echo "✗ Node >= 22.5 required (found $(node --version)). Install from https://nodejs.org or: brew install node"
  exit 1
fi
echo "✓ Node $(node --version)"

echo "▸ Installing dependencies (pnpm)…"
if command -v pnpm >/dev/null 2>&1 && pnpm --version | grep -q '^10\|^11'; then
  pnpm install
else
  npx -y pnpm@10 install
fi

echo "▸ Building…"
npx -y pnpm@10 exec tsc -b packages/shared packages/vault packages/connectors apps/mcp || { echo "✗ Build failed"; exit 1; }
echo "✓ Build complete"

echo "▸ Running tests…"
npx tsx --test packages/shared/test/*.test.ts packages/vault/test/*.test.ts

echo "▸ Doctor…"
node apps/mcp/bin/socials-mcp.js doctor || true

cat <<'EOF'

Setup done. Next steps:

1. Onboard platform apps (free, one-time):
     node apps/mcp/bin/socials-mcp.js onboard
2. Add the MCP server to your agent — config snippets: agents/README.md
   (Claude Code in this repo: .mcp.json auto-loads on next start)
3. In your agent: connect_youtube / connect_meta / connect_tiktok → snapshot
4. Weekly: snapshot + import_tiktok_csv (docs/automation.md can automate it)

Full docs: README.md · docs/ · AGENTS.md
EOF
