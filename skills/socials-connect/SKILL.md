---
name: socials-connect
description: Connects a creator's TikTok, Instagram, Facebook, and YouTube accounts to the socials-assistant analytics vault via official OAuth. Use when the user wants to connect, link, or add social accounts, set up the vault for the first time, fix broken or expired connections, or store platform developer-app credentials.
license: MIT
---

# socials-connect — guided onboarding

Goal: all of the user's platforms connected to the `socials-mcp` vault through official OAuth flows, plus the weekly TikTok Studio CSV habit for Studio-only data. The agent drives every step; the human only approves browser consent screens.

## Prerequisites check

1. Call `socials-mcp:connection_status`. Skip any platform already `ok: true`.
2. If a connect tool returns `missing_app_credentials`, walk the user through the matching guide (repo `docs/`):
   - YouTube → `docs/onboarding-google.md` (Google Cloud project, 3 APIs, OAuth desktop client)
   - Instagram + Facebook → `docs/onboarding-meta.md` (Meta app; IG Business/Creator account linked to a FB Page)
   - TikTok → `docs/onboarding-tiktok.md` (TikTok developer app, Login Kit scopes)
3. Have them store credentials (they paste; never ask them to email or DM secrets):
   `socials-mcp config set googleClientId <id>` — or env vars (see AGENTS.md).

## Connect flow (per platform)

1. Tell the user: "A consent screen will open — approve it and come back."
2. Call `socials-mcp:connect_youtube` / `socials-mcp:connect_meta` / `socials-mcp:connect_tiktok`. Each replies immediately: ✅ done, or ⏳ pending with the consent URL in the server log.
3. After they finish in the browser, call `socials-mcp:connection_status` to confirm `ok: true`.
4. `connect_meta` connects Instagram AND Facebook in one flow.

## First data pull

1. Call `socials-mcp:snapshot` (default 28-day lookback). Report per-platform row counts.
2. For TikTok depth: ask for their weekly TikTok Studio export (Studio → Analytics → export video-stats CSV), then call `socials-mcp:import_tiktok_csv` with the path. Explain why: retention, traffic sources, search terms, and follower-hours are Studio-only — no official API exposes them; CSV is the compliant path.
3. Verify with `socials-mcp:top_content` (`days: 7`).

## Finish: build the creator profile

After the first snapshot, offer to build the tuning profile (`socials-mcp:profile_get` → if empty): auto-fill audience_summary from `socials-mcp:audience_overview` and content_series from `socials-mcp:top_content` patterns, then ask only the 4 human-only questions — niche, tone, goals, rate floor — and save with `socials-mcp:profile_set`. This is what makes every other skill sound like it knows the creator.

## Weekly rhythm to establish

- `socials-mcp:snapshot` once a week — history accrues forever in the vault
- `socials-mcp:import_tiktok_csv` with the fresh Studio export (≈5 min/week)
- The `weekly-digest` skill reads it all

## Gotchas

- Never ask for passwords; never automate the logged-in TikTok Studio session (ToS + account risk).
- Expired tokens usually self-heal on the next `snapshot` (auto-refresh); if not, re-run the connect tool.
- TikTok app review can take days — the app owner's own account works immediately.
