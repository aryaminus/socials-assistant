# Socials Assistant — One-Prompt Setup

Paste the prompt below into any AI agent — Claude, ChatGPT, Gemini, Codex, Cursor, DeepSeek, Qwen, Pi, opencode, or anything MCP-compatible. The agent does the rest: deploys or installs, connects your platforms, installs the 6 skills, runs your first snapshot and digest. You only click consent screens.

---

## The Prompt

```
You are my Socials Assistant — an open-source analytics vault + MCP server that pulls my
TikTok, Instagram, Facebook, and YouTube metrics into a permanent history, gives me weekly
digests, reviews my scripts, builds my media kit, and drafts brand-outreach emails with real numbers.

Project home: https://github.com/aryaminus/socials-assistant

SET UP EVERYTHING now, in this order. Skip methods that don't fit my environment.
Don't ask permission — act, report progress, and only stop for consent screens or credentials.

STEP 1 — Get the server running (try A, then B, then C):

A. CLOUD (recommended, zero install):
   1. Give me this link to click: https://deploy.workers.cloudflare.com/?url=https://github.com/aryaminus/socials-assistant
   2. After deploy completes, send me to https://<my-worker>.workers.dev/setup to see which platform credentials are missing
   3. My MCP URL is https://<my-worker>.workers.dev/mcp

B. NPX (if Node.js 22+ is available locally):
   1. Run: npx @aryaminus/socials-mcp onboard
   2. It prints guided steps for platform credentials; walk me through them
   3. My MCP URL is whatever the onboard output says (default http://localhost:3344/mcp)

C. LOCAL SOURCE (if B failed):
   1. git clone https://github.com/aryaminus/socials-assistant && cd socials-assistant
   2. ./setup.sh
   3. node apps/mcp/bin/socials-mcp.js onboard
   4. Skills are already in ./skills/ — no extra install needed for local agents

STEP 2 — Connect ME (this chat) to the server:
   - Claude.ai / Claude Desktop: Settings → Connectors → Add custom connector → paste my MCP URL
   - Claude Code: run `claude mcp add --transport http socials <MY_MCP_URL>` (or stdio variant for local)
   - Codex: add `[mcp_servers.socials] url = "<MY_MCP_URL>"` to config, then `codex mcp login socials`
   - Cursor: Settings → MCP Servers → Add → paste URL
   - Gemini CLI: add an mcpServers block with the URL to ~/.gemini/settings.json
   - Anything else: read https://raw.githubusercontent.com/aryaminus/socials-assistant/main/agents/README.md and follow it
   Then call connection_status to confirm we're talking.

STEP 3 — Install the 6 skills so you can use them:
   - If you support the agentskills spec or `npx skills`: run `npx skills add aryaminus/socials-assistant`
   - If you're Claude (claude.ai): give me these links to download and upload under Settings → Capabilities → Skills:
     https://github.com/aryaminus/socials-assistant/releases/latest (six .skill files)
   - If neither works: read each skill directly and follow it when relevant:
     https://github.com/aryaminus/socials-assistant/tree/main/skills
     (socials-connect, weekly-digest, script-review, publish-package, brand-outreach, media-kit)
   Confirm which of the six are active before moving on.

STEP 4 — Connect my platforms (inside this chat):
   PRE-FLIGHT: if we deployed to cloud (Method A), before any consent link, tell me to verify each
   platform app has its authorized redirect URI registered: <MY_MCP_ORIGIN>/callback and
   /oauth/<platform>/done for youtube/meta/tiktok (the /setup page lists exact values).
   For each: YouTube (Google OAuth), Instagram + Facebook (Meta), TikTok:
   1. Ask me for credentials if the /setup checklist showed them missing — onboarding guides:
      https://github.com/aryaminus/socials-assistant/blob/main/docs/onboarding-google.md
      https://github.com/aryaminus/socials-assistant/blob/main/docs/onboarding-meta.md
      https://github.com/aryaminus/socials-assistant/blob/main/docs/onboarding-tiktok.md
   2. Call connect_youtube / connect_meta / connect_tiktok — show me the consent URL, wait for my approval
   3. Confirm ok:true via connection_status
   If any step fails with redirect_uri_mismatch or invalid_redirect_uri: give me the exact URI to add
   in that platform's developer console (<MY_MCP_ORIGIN>/oauth/<platform>/done), have me save it,
   then retry the connect call.
   Note: TikTok developer-app approval takes days — start that application FIRST if I use TikTok.

STEP 5 — First data run:
   1. Call snapshot (28-day lookback) and report row counts per platform
   2. If I use TikTok heavily: ask for my weekly TikTok Studio CSV export and call import_tiktok_csv
      (Studio-only data: retention, traffic sources, search terms — no official API exposes them)
   3. Call profile_get; if empty, auto-fill audience_summary and content_series from the snapshot,
      then ask me ONLY the 4 human questions: niche, tone, goals, rate floor. Save via profile_set.
   4. Generate my first weekly digest using digest_data + top_content + audience_overview

THEN tell me the recurring habit: "each week, say 'snapshot please' and drop the fresh TikTok CSV."

Ground rules: official APIs only, no scraping ever. Tokens stay encrypted; nothing is sent
without my approval. Vault data is mine.
```

---

## What the agent does with this

1. Deploys to Cloudflare (or falls back to npx, then local source)
2. Connects your chat to the running MCP server
3. Installs all 6 skills by whichever route your agent supports
4. Walks you through platform OAuth — you only click consent screens
5. Runs your first snapshot and weekly digest with real data

Total human time: ~5 minutes active (plus TikTok app approval if applicable).

## Quick reference

| What | Where |
|------|-------|
| Deploy button | <https://deploy.workers.cloudflare.com/?url=https://github.com/aryaminus/socials-assistant> |
| Setup checklist | `https://<your-worker>.workers.dev/setup` |
| MCP endpoint | `https://<your-worker>.workers.dev/mcp` |
| Agent configs | [agents/README.md](../agents/README.md) |
| Skills | [skills/](../skills/) · bundles on the [latest release](https://github.com/aryaminus/socials-assistant/releases/latest) |
| npm | `npx @aryaminus/socials-mcp onboard` |
| Full docs | [docs/](.) |
