# Zero-install setup — your MCP in the cloud, used from claude.ai

No local installation. No terminal required (one optional command). Total time: ~20 minutes, mostly waiting for platform app approvals.

## The journey

```
① Deploy button → ② /setup checklist → ③ paste URL into claude.ai →
④ upload skills → ⑤ connect platforms inside the chat → done
```

### ① Deploy your own instance (one click)

Click the **Deploy to Cloudflare** button on the repo README (or open
`https://deploy.workers.cloudflare.com/?url=https://github.com/aryaminus/socials-assistant`).

Cloudflare clones the repo, provisions the Worker + D1 vault + KV namespace, and gives you a URL like `https://socials-mcp-cloud.<your-subdomain>.workers.dev`.

<details><summary>If the button can't provision resources (rare)</summary>
Create them manually: <code>npx wrangler d1 create socials-vault</code>, <code>npx wrangler kv namespace create OAUTH_KV</code>, paste IDs into <code>wrangler.jsonc</code>, redeploy. Full manual path: <a href="../infra/worker/README.md">infra/worker/README.md</a>.
</details>

### ② Finish configuration at `/setup`

Visit `https://your-worker.workers.dev/setup`. It's a live checklist showing exactly which variables/secrets are set. Set them in the Cloudflare dashboard (**Workers → your worker → Settings → Variables**) — encrypt anything secret:

| What | Where the values come from |
|---|---|
| MCP sign-in (Google OAuth client) | docs/onboarding-google.md §3–4 (~10 min, one client covers sign-in AND YouTube data) |
| Encryption key | any `openssl rand -hex 32` output |
| Meta app | docs/onboarding-meta.md |
| TikTok app | docs/onboarding-tiktok.md (approval takes days — do it first) |

Each platform you skip simply stays unconnected; everything else works.

### ③ Connect claude.ai

Claude.ai → **Settings → Connectors → Add custom connector** → paste:

```
https://your-worker.workers.dev/mcp
```

Sign in with Google when prompted (that's the MCP-level auth). Claude Code users: `claude mcp add --transport http socials https://your-worker.workers.dev/mcp`. Codex: `[mcp_servers.socials] url = "…"` + `codex mcp login socials`.

### ④ Install the skills (recommended)

Skills teach the agent the workflows. Download `.skill` bundles from [GitHub Releases](https://github.com/aryaminus/socials-assistant/releases/latest) → claude.ai **Settings → Capabilities → Skills → +** (upload each). Claude Code instead: `/plugin marketplace add aryaminus/socials-assistant`.

### ⑤ Connect your platforms — inside the chat

In claude.ai, just ask: *"Connect my YouTube account."* The agent:

1. Calls `platform_oauth_url` → shows you a consent link
2. You approve in the browser → platform redirects to a page saying "copy this URL"
3. Paste that URL back → agent calls `platform_oauth_exchange` → tokens stored encrypted, bound to your vault

Then: *"Snapshot my accounts"* → weekly *"digest please"* → script reviews, publish packages, outreach drafts all work from chat.

## One-line setup prompt (paste into claude.ai)

After step ③, paste this prompt and the agent handles the rest:

> Set up my Socials Assistant. Check connection_status, then connect my YouTube, Instagram, and TikTok accounts one at a time. After each is connected, run a snapshot. When all snapshots are done, build my creator profile from the data and run a weekly digest.

The agent will: check what's connected → issue platform_oauth_url for each platform → show consent links → wait for you to paste redirects back → exchange tokens → snapshot each platform → auto-build your creator profile from audience/content data → generate your first digest.

## Why this architecture

- Your deployment = your data. Tokens are encrypted at rest under YOUR encryption key; the operator of a deployment is its trust root.
- The MCP layer authenticates via Google (OAuth 2.1 + dynamic registration), so agents never hold platform credentials.
- Posting automation remains out of scope by design (docs/CAPABILITIES.md).

## Costs

Cloudflare free tier covers this comfortably for individuals and small groups (100k requests/day, D1 free). No credit card required.
