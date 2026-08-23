---
name: media-kit
description: Generates or refreshes a creator's media kit (one-page brand deck) from live verified vault analytics. Use when the user asks for a media kit, press kit, brand deck, rate sheet backup, or wants updated numbers before pitching brands.
license: MIT
---

# media-kit — verified numbers, auto-refreshed

The media kit is the creator's business card. Generate it from the vault so every number is real and current. Never estimate; never use stale screenshots.

## Steps

1. Call `socials-mcp:profile_get` — name, niche positioning, past_collaborations feed the header and case-study sections (ask the user to fill gaps; never invent brand names).
2. Call `socials-mcp:media_kit_data` — followers, 30-day views, avg engagement, top videos, audience highlights per platform.
3. If data is thin (no 30-day views, missing platforms), prompt the user to run `socials-mcp:snapshot` and (TikTok) `socials-mcp:import_tiktok_csv` first.
4. Generate `media-kit.md` from the template in [assets/media-kit-template.md](assets/media-kit-template.md).
4. Fill "Past collaborations" from `socials-mcp:outreach_log_list` plus anything the user recalls — ask, don't invent.
5. Export options: leave as markdown, render to PDF, or publish as a live link (GitHub page / Notion) — a live link is preferred for cold emails.

## Refresh cadence

Re-run after every weekly `snapshot`. Numbers older than ~10 days in a media kit are how creators get lowballed.

## Rules

- Every metric carries its window ("last 30 days").
- Omit platforms with meaningless data rather than showing zeros.
- Audience section: top 3 facts maximum — brands skim.
