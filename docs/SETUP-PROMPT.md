# Socials Assistant — One-Prompt Setup

Paste the prompt below into any AI agent — Claude, ChatGPT, Gemini, Codex, Cursor, Pi, opencode, or anything MCP-compatible. The agent becomes your setup guide: it does everything it can do directly (commands, config, verification), and for anything that needs your hands — clicking deploy, approving OAuth, entering credentials — it hands you the exact link, tells you what to click, and waits.

One question up front (cloud or local), then a single linear path. No method-hopping.

---

## The Prompt

```
Help me set up Socials Assistant — an open-source MCP server + agent skills that pull my
TikTok, Instagram, Facebook, and YouTube analytics into a private vault, then power weekly
digests, script reviews, media kits, and brand-outreach drafts on that data.

Repo: https://github.com/aryaminus/socials-assistant (MIT license).
First skim its README.md and SECURITY.md and flag anything concerning before we proceed.

How to work with me: do every step YOU can do directly. When a step needs my browser or my
credentials, give me the exact URL, tell me precisely what to click, and WAIT for my
confirmation before continuing. Verify each step succeeded before moving to the next.

START with one question: "Cloud or local?" Explain the tradeoff in two lines:
cloud = zero install, vault lives in my Cloudflare D1; local = git clone, vault stays
on this machine. Then follow ONLY that one path.

── CLOUD PATH ─────────────────────────────────────────────
1. Give me this link to click and walk me through what the Cloudflare screen will ask:
   https://deploy.workers.cloudflare.com/?url=https://github.com/aryaminus/socials-assistant
   Wait until I tell you my worker URL (ends in .workers.dev).
2. Send me to https://<my-worker>/setup and have me paste you the checklist — which
   credential groups show ⬜ missing.
3. Coach me through each missing platform app, one at a time, using the repo's own guides:
   docs/onboarding-google.md · docs/onboarding-meta.md · docs/onboarding-tiktok.md
   While coaching, remind me to add the authorized redirect URIs listed on the /setup page
   to each platform app — skipping this causes redirect_uri_mismatch errors later.
   If I use TikTok: start that developer-app application FIRST (approval takes days).
4. Have me enter each credential in the Cloudflare dashboard
   (Workers → socials-mcp-cloud → Settings → Variables, encrypting secrets),
   then reload /setup and confirm every row shows ✅ before moving on.

── LOCAL PATH ─────────────────────────────────────────────
1. Show me what scripts/setup.sh does, then run: git clone
   https://github.com/aryaminus/socials-assistant && cd socials-assistant && ./setup.sh
2. Run node apps/mcp/bin/socials-mcp.js onboard and coach me through the same platform
   credentials (same three guides apply).
3. My MCP endpoint is stdio (bin/socials-mcp.js) or http://localhost:3344/mcp.

── EITHER PATH ────────────────────────────────────────────
CONNECT THIS CHAT: give me the exact connector configuration for THIS agent
(Claude.ai custom connector / `claude mcp add` / codex config.toml / Cursor settings /
Gemini settings.json — pick mine). After I add it, call connection_status to prove the
tools are live before going further.

SKILLS: do not fetch or install any files. Read the six skill instructions directly from
https://github.com/aryaminus/socials-assistant/tree/main/skills and simply follow them
when relevant. If you support `npx skills add aryaminus/socials-assistant`, offer that
as an option and let me decide.

FIRST DATA RUN (as soon as at least one platform is connected):
snapshot → report per-platform row counts → profile_get; if empty, auto-fill
audience_summary and content_series from the snapshot, then ask me ONLY the four human
questions (niche, tone, goals, rate floor) and save via profile_set → finish with
digest_data + top_content and give me my first weekly digest in plain language.

Weekly habit from now on: I say "snapshot please" (and drop my TikTok Studio CSV when
I have one — Studio-only data like retention has no official API).

Ground rules: official APIs only, never scrape. Nothing is ever sent to anyone without
my explicit approval. Tokens stay encrypted; my vault is mine.
```

---

## Why it's shaped this way

Real assistants won't bulk-execute deploys, credential flows, and third-party installs on a "don't ask permission" instruction — and they shouldn't. This prompt works **with** that judgment instead of against it: the agent guides, you act where hands are needed, and it verifies between every step so nothing silently fails. One path is chosen up front, so there's no method-hopping or half-finished setups.

Typical human time: ~5 minutes active for cloud (plus TikTok app approval if you use TikTok).

## Quick reference

| What | Where |
|------|-------|
| Deploy button | <https://deploy.workers.cloudflare.com/?url=https://github.com/aryaminus/socials-assistant> |
| Setup checklist | `https://<your-worker>.workers.dev/setup` |
| MCP endpoint | `https://<your-worker>.workers.dev/mcp` |
| Agent configs | [agents/README.md](../agents/README.md) |
| Skills (read inline, no install needed) | [skills/](../skills/) · optional bundles on the [latest release](https://github.com/aryaminus/socials-assistant/releases/latest) |
| npm alternative | `npx @aryaminus/socials-mcp onboard` |
| Full docs | [docs/](.) |
