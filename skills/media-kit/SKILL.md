---
name: media-kit
description: Generate or refresh the creator's media kit (one-pager for brands) using live verified vault analytics. Use when the user asks for a media kit, press kit, brand deck, or wants updated numbers before pitching.
---

# media-kit — verified numbers, auto-refreshed

The media kit is the creator's business card. This skill generates it from the vault so every number is real and current. Never estimate; never use stale screenshots.

## Steps

1. Call `media_kit_data` — followers, 30-day views, avg engagement, top videos, audience highlights per platform.
2. If data looks thin (no 30-day views, missing platforms), prompt: run `snapshot` and (for TikTok) `import_tiktok_csv` first.
3. Generate `media-kit.md` in the project root (or refresh the existing one):

```
# {Creator Name} — Media Kit
*{niche one-liner, e.g. "Reading culture & hidden libraries of Kathmandu"}* · Updated {date}

## Snapshot (last 30 days)
| Platform | Handle | Followers | Views (30d) | Avg engagement |
|---|---|---|---|---|
| TikTok | @… | … | … | …% |
| YouTube | … | … | … | …% |
| Instagram | … | … | … | …% |
(Facebook Page row only if it has meaningful numbers.)

## Audience
- {top country} {..}%, {second} {..}% · {top age band} · {gender split if present}

## Proof of concept — top content
1. "{title}" — {views} views, {er}% engagement ({platform})
2. …
3. …

## Past collaborations
{from outreach_log + user's memory — e.g. "Fine Print Nepal (sponsored series episode), Big-5 publisher (book feature)". Ask the user to fill anything missing.}

## Services & rates (indicative)
TikTok video ${…}–{…} · IG reel ${…}–{…} · bundle −20% · usage rights & exclusivity quoted per campaign

## Contact
{email} · {links}
```

4. Export options: leave as markdown, render to PDF via the user's tool of choice, or publish as a Notion/GitHub page for a live link (preferred for cold emails).

## Refresh cadence

Re-run after every weekly `snapshot`. Numbers older than ~10 days in a media kit are how creators get lowballed — keep it fresh.
