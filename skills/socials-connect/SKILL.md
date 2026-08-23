---
name: socials-connect
description: Connect the creator's TikTok, Instagram, Facebook, and YouTube accounts to the socials-assistant vault. Use when the user wants to connect/link/add social accounts, fix broken connections, or set up the vault for the first time.
---

# socials-connect — guided onboarding

Goal: get all of the creator's platforms connected to the `socials-mcp` vault with official OAuth flows, plus weekly TikTok Studio CSV imports for Studio-only data.

## Prerequisites check

1. Call `connection_status`. If any platform is already connected and `ok: true`, skip it.
2. If connect tools return `missing_app_credentials`, walk the user through the matching guide:
   - YouTube → `docs/onboarding-google.md` (Google Cloud project, 3 APIs, OAuth desktop client)
   - Instagram + Facebook → `docs/onboarding-meta.md` (Meta app; requires IG Business/Creator account linked to a FB Page)
   - TikTok → `docs/onboarding-tiktok.md` (TikTok developer app, Login Kit scopes: user.info.basic, user.info.stats, video.list)
3. Have them store credentials:
   `socials-mcp config set googleClientId <id>` (etc.) — or env vars SOCIALS_GOOGLE_CLIENT_ID etc.

## Connect flow (per platform)

1. Tell the user: "I'll open a consent screen in your browser; approve it and come back."
2. Call `connect_youtube` / `connect_meta` / `connect_tiktok`. The consent URL prints to the MCP server log; the tool replies immediately — either ✅ done or ⏳ pending.
3. After the user finishes in the browser, call `connection_status` to confirm `ok: true`.
4. Repeat for the next platform. `connect_meta` connects Instagram AND Facebook in one flow.

## First data pull

1. Call `snapshot` (default 28-day lookback). Report per-platform row counts.
2. For TikTok depth, tell the user: "TikTok Studio → Analytics → export video stats CSV (last 7 days)" and get the file path, then call `import_tiktok_csv` with it. Explain WHY: retention curves, traffic sources, search terms, and follower-hours are Studio-only — no official API exposes them; CSV is the compliant path.
3. Verify data landed: `top_content` with `days: 7`.

## Weekly rhythm to set up

- `snapshot` once a week (history accrues forever in the vault)
- `import_tiktok_csv` with the fresh Studio export (≈5 min/week)
- The `weekly-digest` skill does the reading

## Rules

- Never ask for passwords or to automate the TikTok logged-in session (ToS + ban risk).
- If a token expired, prefer re-running the connect tool (refresh tokens usually self-renew via snapshot).
