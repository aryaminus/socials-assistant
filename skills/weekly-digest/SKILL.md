---
name: weekly-digest
description: Generates a cross-platform weekly analytics digest (TikTok, Instagram, Facebook, YouTube) from real vault data with wins, losses, and next actions. Use when the user asks for a digest, weekly report, scorecard, performance summary, "how did I do this week", or what to do next with their content.
license: MIT
---

# weekly-digest — cross-platform scorecard

Reads ONLY real vault data via `socials-mcp` tools. Never invent or estimate numbers. If data is missing, say what's missing and suggest `socials-mcp:snapshot` / `socials-mcp:import_tiktok_csv`.

## Steps

1. Call `socials-mcp:digest_data` with `days: 7`. Add `socials-mcp:compare_periods` for metrics the user cares about (views, followers_gained, reach).
2. Call `socials-mcp:top_content` (`days: 14`, limit 10) and `socials-mcp:audience_overview` for color.
3. Compose the digest:

```
## 📊 Week {week} — {start} → {end}

### Headline
One sentence: the single most important change (biggest % move, or best/worst content).

### Per platform
- **TikTok** — views {cur} ({+/-x%}), followers gained {n}, top video: "{title}" ({views} views)
- **YouTube** — views {…}, watch time {…}, traffic-mix shifts (if present)
- **Instagram** — reach {…}, top reel: "{title}" ({views} plays)
- **Facebook** — impressions {…}
Include only platforms that returned data. Never pad missing metrics with zeros.

### What worked / what died
- Best content (title, platform, views, engagement rate) + the *why* when retention/traffic data exists (e.g. "held 70% at 3s — strong hook")
- Flop content — same, plus one concrete hypothesis (hook too slow? off-niche? posting time?)

### Audience notes
Top country/age splits that changed vs prior week (if available).

### Do next week
2–3 specific, data-backed actions tied to numbers above.
```

4. Offer follow-ups: save to `digests/`, email it (self only), or hand targets to the `brand-outreach` skill.

## Interpretation rules

- `changePct: null` means no prior baseline — say "no baseline yet"; never compute one.
- Engagement rate = (likes+comments+shares)/views. Benchmark context lives in [references/benchmarks.md](references/benchmarks.md) — read it when comparing rates.
- Viral outliers distort averages: call them out explicitly instead of averaging them away.
- TikTok retention/traffic exist only if CSVs were imported; if absent, remind about the weekly export → `import_tiktok_csv`.
- Keep the whole digest under ~400 words; link or offer detail rather than dumping tables.
