---
name: weekly-digest
description: Generate the creator's cross-platform weekly analytics digest (TikTok, Instagram, Facebook, YouTube) from real vault data, with wins, losses, and next actions. Use when the user asks for a digest, weekly report, scorecard, "how did I do this week", or performance summary.
---

# weekly-digest — cross-platform scorecard

Reads ONLY real vault data via the `socials-mcp` tools. Never invent or estimate numbers. If data is missing, say what's missing and suggest `snapshot` / `import_tiktok_csv`.

## Steps

1. Call `digest_data` with `days: 7`. Optionally `compare_periods` for specific metrics the user cares about (views, followers_gained, reach).
2. Call `top_content` (`days: 14`, limit 10) and `audience_overview` for color.
3. Compose the digest in this structure:

```
## 📊 Week {week} — {start} → {end}

### Headline
One sentence: the single most important thing this week (biggest % move, or best/worst content).

### Per platform
- **TikTok** — views {cur} ({+/-x%}), followers gained {n}, top video: "{title}" ({views} views)
- **YouTube** — views {…}, watch time {…}, traffic mix shifts (if present)
- **Instagram** — reach {…}, top reel: "{title}" ({views} plays)
- **Facebook** — impressions {…}
Only include platforms that returned data. Skip missing metrics silently — never pad with zeros unless the metric is genuinely 0.

### What worked / what died
- Best content (title, platform, views, engagement rate) — and the *why* if retention/traffic data exists (e.g. "held 70% at 3s — strong hook")
- Flop content — same, plus one concrete hypothesis (hook too slow? off-niche? posting time?)

### Audience notes
Top country/age splits that changed vs prior week (if available).

### Do next week
2–3 specific, data-backed actions. Examples:
- "Series engagement decaying (Ep7 8.5K vs series avg 88K) — rotate format per the 4 content buckets"
- "Search is 11% of TikTok traffic — keyword-load titles like the Ep2 pattern"
- "Post timing: followers active 7–9pm NPT; last 3 posts went out at noon"
```

4. Offer follow-ups: save as markdown to `digests/`, email it (draft only), or log outreach targets.

## Interpretation guidance

- `changePct` null means prior period had no data — say "no baseline yet", don't compute.
- Engagement rate = (likes+comments+shares)/views. Nano-creator TikTok benchmark ≈ 4–10%; treat anything >8% as strong.
- Viral outliers distort averages — call them out explicitly rather than averaging them away (the user's history: two videos drove most growth).
- TikTok retention/traffic only exists if CSVs were imported. If absent, remind: weekly Studio export → `import_tiktok_csv`.
