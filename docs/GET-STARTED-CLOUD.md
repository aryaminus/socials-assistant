# Zero-install setup — your MCP in the cloud

No local installation. No terminal required (one optional command). Total time: ~20 minutes, mostly waiting for platform app approvals.

## The journey

```
Deploy button → /setup checklist → paste MCP URL into your agent →
upload skills → connect platforms inside the chat → done
```

### 1. Deploy your own instance (one click)

Click the **Deploy to Cloudflare** button on the repo README (or open
`https://deploy.workers.cloudflare.com/?url=https://github.com/aryaminus/socials-assistant/tree/main/infra/worker`).

**What the deploy form asks** (all of it skippable except clicking Deploy):
- Git account — required, one-time: connect GitHub/GitLab and authorize Cloudflare; it creates a small repo holding the worker code (no secrets in it) so future pushes auto-deploy. **Check "Create private Git repository"** — the box defaults to off
- Project name — anything you like
- KV namespace + D1 database — names prefilled (`socials-mcp-cloud`, `socials-vault`); defaults are fine
- Three secrets — Google sign-in client ID/secret and `TOKEN_ENCRYPTION_KEY` (`openssl rand -hex 32`). Each field has a `CHANGE_ME` placeholder: **you can click Deploy immediately and set real values later from the `/setup` checklist.** Platform app credentials are never needed at deploy time.
- Build/deploy commands — left empty; Cloudflare runs `wrangler deploy` inside the worker directory

Cloudflare clones the worker (it lives in `infra/worker/`), provisions D1 + KV, and gives you a URL like `https://socials-mcp-cloud.<your-subdomain>.workers.dev`.

<details><summary>If the button can't provision resources (rare)</summary>
Create them manually: <code>npx wrangler d1 create socials-vault</code>, <code>npx wrangler kv namespace create OAUTH_KV</code>, paste IDs into <code>wrangler.jsonc</code>, redeploy. Full manual path: <a href="../infra/worker/README.md">infra/worker/README.md</a>.
</details>

### 2. Finish configuration at `/setup`

Visit `https://your-worker.workers.dev/setup`. It's a live checklist showing exactly which variables/secrets are set. Set them in the Cloudflare dashboard (**Workers → your worker → Settings → Variables**) — encrypt anything secret:

| What | Where the values come from |
|---|---|
| MCP sign-in (Google OAuth client) | docs/onboarding-google.md ~10 min — **Web application** type; add `<your-worker>/callback` as authorized redirect |
| Encryption key | any `openssl rand -hex 32` output |
| Meta app | docs/onboarding-meta.md — also add redirect URI `<your-worker>/oauth/meta/done` |
| TikTok app | docs/onboarding-tiktok.md (approval takes days — do it first) — add redirect URI `<your-worker>/oauth/tiktok/done` |

The `/setup` page lists every redirect URI with your real origin — copy them into each platform app exactly.

Each platform you skip simply stays unconnected; everything else works.

### 3. Connect your agent

Paste your MCP URL (`https://your-worker.workers.dev/mcp`) into your agent's MCP connector settings. Here's how for each agent:

| Agent | How to connect |
|-------|---------------|
| Claude (claude.ai) | Settings → Connectors → Add custom connector → paste URL |
| Claude Desktop | Add to `claude_desktop_config.json` — see [agents/README.md](../agents/README.md) |
| Claude Code | `claude mcp add --transport http socials https://your-worker.workers.dev/mcp` |
| Codex | `[mcp_servers.socials] url = "…"` + `codex mcp login socials` |
| Cursor | Settings → MCP Servers → Add → paste URL |
| Gemini CLI | Add MCP block to `~/.gemini/settings.json` |
| ChatGPT | Deploy the Worker → add as custom connector (Business/Enterprise) |
| Any MCP-compatible agent | See [agents/README.md](../agents/README.md) for agent-specific configs |

### 4. Install the skills (recommended)

Skills teach the agent the workflows. Download `.skill` bundles from [GitHub Releases](https://github.com/aryaminus/socials-assistant/releases/latest) and upload to your agent's skill settings. Claude Code users: `/plugin marketplace add aryaminus/socials-assistant`.

### 5. Connect your platforms — inside the chat

In your agent, just ask: *"Connect my YouTube account."* The agent:

1. Calls `platform_oauth_url` → shows you a consent link
2. You approve in the browser → platform redirects to a page saying "copy this URL"
3. Paste that URL back → agent calls `platform_oauth_exchange` → tokens stored encrypted, bound to your vault

Then: *"Snapshot my accounts"* → weekly *"digest please"* → script reviews, publish packages, outreach drafts all work from chat.

## One-line setup prompt

After step 3, paste this prompt into your agent and it handles the rest:

> Set up my Socials Assistant. Check connection_status, then connect my YouTube, Instagram, and TikTok accounts one at a time. After each is connected, run a snapshot. When all snapshots are done, build my creator profile from the data and run a weekly digest.

The agent will: check what's connected → issue platform_oauth_url for each platform → show consent links → wait for you to paste redirects back → exchange tokens → snapshot each platform → auto-build your creator profile from audience/content data → generate your first digest.

**Full setup prompt** (works from zero, agent-agnostic): see [docs/SETUP-PROMPT.md](SETUP-PROMPT.md)

## Why this architecture

- Your deployment = your data. Tokens are encrypted at rest under YOUR encryption key; the operator of a deployment is its trust root.
- The MCP layer authenticates via Google (OAuth 2.1 + dynamic registration), so agents never hold platform credentials.
- Posting automation remains out of scope by design (docs/CAPABILITIES.md).

## Costs

Cloudflare free tier covers this comfortably for individuals and small groups (100k requests/day, D1 free). No credit card required.
