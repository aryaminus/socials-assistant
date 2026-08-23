# Deploy socials-mcp to Cloudflare Workers (free tier, multi-tenant)

## First: which hosting model is right?

This project is **not** a stateless API like a calculator service — every install holds OAuth tokens to someone's social accounts plus their private analytics history. That shapes everything:

| Model | Who it's for | Cost | Notes |
|---|---|---|---|
| **Local only** (`npx` / clone) — the default | Individual creators | $0 forever | Tokens never leave the machine. Most private, zero ops. All 20 tools work via stdio/localhost. |
| **Self-hosted remote MCP** (this guide) | One creator wanting a single URL for all their agents, or a small trusted group — each user gets an isolated, encrypted vault | $0 on Cloudflare free tier | You are the operator; your Google login gates access. |
| **Operator-hosted for the public** | Offering "a link anyone can use" | $0 until heavy traffic | Possible (the Worker is fully multi-tenant), but every user must trust the operator with their platform tokens (encrypted at rest — the operator holds the key). For strangers, self-hosting is the honest recommendation, and this repo makes it a 10-minute job. |

There is deliberately **no shared "our server, everyone's data" instance** advertised in the README: an analytics vault must belong to its creator. Stateless services can host one public endpoint; a token-and-history vault cannot without becoming a data custodian.

## Why Cloudflare

| Provider | Free tier | Cold starts | MCP fit | Verdict |
|---|---|---|---|---|
| **Cloudflare Workers + D1** | 100k req/day, D1 free | **None** | First-class: `@cloudflare/agents` OAuthProvider (OAuth 2.1 + DCR), recommended stateless pattern | ✅ **Best free option — Worker already built here** |

One URL → every agent connects (Claude Code, Claude Desktop/Cowork connectors, ChatGPT plugins, Codex, Gemini CLI, Antigravity, opencode) via OAuth 2.1 + Dynamic Client Registration. Each creator logs in with Google; their vault rows and platform tokens are isolated and encrypted.

**Prereq note:** the worker targets `@cloudflare/agents` and `wrangler` v4; run `pnpm install` in `infra/worker` and `pnpm run typecheck` before deploying — the agents SDK evolves quickly, minor API adjustments may be needed at deploy time.

## 1. Resources (all free tier)

```bash
cd infra/worker
pnpm install
npx wrangler login
npx wrangler d1 create socials-vault          # copy database_id → wrangler.jsonc
npx wrangler kv namespace create OAUTH_KV     # copy id → wrangler.jsonc
npx wrangler d1 execute VAULT --remote --file=./src/schema.ts --experimental-binding 2>/dev/null \
  || npx wrangler d1 execute socials-vault --remote --command="$(node -e "console.log(require('./src/schema.ts'))" 2>/dev/null || true)"
```

> Schema application: simplest reliable path is to copy the SQL from `src/schema.ts` into a `schema.sql` file and run `npx wrangler d1 execute socials-vault --remote --file schema.sql`.

## 2. Google login (for MCP users)

1. Google Cloud Console → new project → OAuth consent (External) → Web app credentials.
2. Authorized redirect: `https://your-worker.workers.dev/callback`
3. Set values:

```bash
npx wrangler secret put GOOGLE_LOGIN_CLIENT_SECRET
npx wrangler secret put TOKEN_ENCRYPTION_KEY     # openssl rand -hex 32
```

Update `GOOGLE_LOGIN_CLIENT_ID` var in `wrangler.jsonc`.

## 3. Deploy

```bash
npx wrangler deploy
```

Verify: `https://your-worker.workers.dev/.well-known/oauth-protected-resource` returns metadata; `npx @modelcontextprotocol/inspector` → connect to `https://your-worker.workers.dev/mcp`.

## 4. Connect agents

```bash
# Claude Code
claude mcp add --transport http socials https://your-worker.workers.dev/mcp
# Codex: [mcp_servers.socials] url = "..." then `codex mcp login socials`
# Claude.ai/Cowork: Settings → Connectors → Add custom connector
# opencode: {"mcp":{"socials":{"type":"remote","url":"..."}}}  (DCR = zero pre-registration)
```

## 5. Creator data onboarding (per user)

1. Agent tool `set_platform_credentials` — store tokens from your local onboarding (`socials-mcp onboard` locally prints them from the vault; or paste from dev consoles). Include refresh extras (`extra_clientId`, etc.) for server-side refresh.
2. `snapshot` weekly — server pulls with automatic token refresh (`refresh_token` tool for manual refresh).
3. TikTok Studio CSV depth stays local-only by design (retention/traffic/search are Studio-only) — run the local server for that, or teach your agent to read exported CSVs directly from a synced folder.

## Limits & costs

Free tier: 100k requests/day, D1 5M reads/100k writes/day — hundreds of creators fit comfortably. First needing more → Workers Paid $5/mo.
