# Hosting on Cloudflare Workers

Deploy your own multi-tenant MCP instance. Each user gets an isolated D1 vault with encrypted platform tokens.

## Quick deploy

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/aryaminus/socials-assistant)

This auto-provisions a Worker, D1 database, and KV namespace. The deploy button clones the repo into your GitHub; you control the instance.

## Manual deploy

```bash
cd infra/worker
npx wrangler d1 create socials-vault     # note the database_id
npx wrangler kv namespace create OAUTH_KV # note the id
# paste IDs into wrangler.jsonc
npx wrangler deploy
```

## Configure secrets

In the Cloudflare dashboard (**Workers → your worker → Settings → Variables**), set:

| Variable | Type | Source |
|----------|------|--------|
| `GOOGLE_LOGIN_CLIENT_ID` | Secret | docs/onboarding-google.md §3 |
| `GOOGLE_LOGIN_CLIENT_SECRET` | Secret | docs/onboarding-google.md §4 |
| `TOKEN_ENCRYPTION_KEY` | Secret | `openssl rand -hex 32` |
| `SOCIALS_GOOGLE_CLIENT_ID` | Secret | Same as GOOGLE_LOGIN or separate YouTube data app |
| `SOCIALS_GOOGLE_CLIENT_SECRET` | Secret | Same as GOOGLE_LOGIN or separate YouTube data app |
| `SOCIALS_META_APP_ID` | Secret | docs/onboarding-meta.md |
| `SOCIALS_META_APP_SECRET` | Secret | docs/onboarding-meta.md |
| `SOCIALS_TIKTOK_CLIENT_KEY` | Secret | docs/onboarding-tiktok.md |
| `SOCIALS_TIKTOK_CLIENT_SECRET` | Secret | docs/onboarding-tiktok.md |

Secrets you don't set keep that platform unconnected; everything else works.

## Post-deploy checklist

1. Visit `https://your-worker.workers.dev/setup` — live checklist of which vars are set
2. Paste `https://your-worker.workers.dev/mcp` into claude.ai as a custom connector
3. Upload skill bundles from [Releases](https://github.com/aryaminus/socials-assistant/releases/latest) (or fetch from `/skills`)
4. Connect platforms inside the chat

## How it works

- **OAuth 2.1 + Dynamic Client Registration** for MCP authentication (Google sign-in)
- **Platform OAuth** via `platform_oauth_url` / `platform_oauth_exchange` tools — agent-mediated consent flow, tokens encrypted at rest per user
- **D1** for vault storage, **KV** for OAuth state
- **No cold starts** — Workers run on the edge, always warm
- Free tier: 100k requests/day, D1 free tier covers personal use

## Architecture

```
Agent (claude.ai / Claude Code / Codex / etc.)
  ↓ OAuth 2.1
Cloudflare Worker (entry.ts → OAuthProvider + SocialsMCP)
  ↓ per-user vault queries
D1 Database (encrypted platform tokens + analytics)
```

## Troubleshooting

- **403 on /mcp**: MCP auth not configured — set GOOGLE_LOGIN_CLIENT_ID/SECRET
- **platform_not_configured**: Set that platform's app credentials in dashboard
- **origin_unknown**: Visit /setup once to warm the deployment
- **Token expired**: Agent calls refresh_token or re-issues platform_oauth_url
