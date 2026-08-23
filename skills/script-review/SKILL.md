---
name: script-review
description: Reviews and scores a creator's video script against their own proven vault data (top hooks, retention patterns, SEO keywords) before production or brand submission. Use when the user has a script ready, asks to review/score/improve a script, or wants a script checked before sending to a brand for approval.
license: MIT
---

# script-review — vault-evidence script scoring

Score scripts against what has actually worked for THIS creator, not generic advice. Every claim in the review cites vault data or the creator profile.

## Before scoring

1. `socials-mcp:profile_get` — niche, tone, keywords. If empty, build it first (4 questions + auto-fill).
2. `socials-mcp:top_content` (`limit: 10`, `metric: "views"` and once with `metric: "engagement_rate"`) — the proven patterns.
3. If TikTok retention data exists (`vault_query`: `SELECT title, retention_json, traffic_json FROM video_metrics vm JOIN videos v ON v.id = vm.video_id WHERE retention_json IS NOT NULL ORDER BY captured_at DESC LIMIT 5`), read the curves of the top performers.

## Score (0–10 each, weighted total /50)

| Dimension | Evidence source | What earns marks |
|---|---|---|
| **Hook (×2)** | Titles + retention of top_content | First line contains a concrete, searchable noun (a place/object/person) + tension or number — mirrors top titles; not generic ("check this out") |
| **Structure / retention (×1.5)** | Retention curves | Beats arranged so a new hook lands every 5–8s (matches where past videos held viewers); no dead middle |
| **SEO (×1.5)** | Profile keywords + traffic_json search share | Primary keyword in the spoken first line, on-screen text plan, title, and caption; long-tail variant included |
| **Fit (×1)** | Profile niche/tone + audience_overview | On-niche for the audience (country/language/age), tone matches tone_notes |
| **Deliverable safety (×1)** | brief in pipeline item (if sponsored) | Meets brand brief requirements; claims verifiable; disclosure (#ad) planned; nothing that conflicts with the creator's past collaborations |

## Output format

```
## Script review — {title}
**Score: {n}/50** — {one-line verdict: produce as-is / revise / rework hook}

### What earns its marks (cite evidence)
- Hook: "{quoted line}" mirrors the pattern of "{top video title}" ({views} views) ✓

### Fixes, in priority order
1. {line-level edit — quote the line, show the rewrite, say why (evidence)}
2. …

### SEO package (pre-filled)
- Title options: {2–3, keyword-front-loaded}
- Caption skeleton + hashtags: {from profile keywords + proven tags}
```

## After review

- Sponsored script → log/stage it: `socials-mcp:pipeline_update` → `script_review`, save the script file path.
- Offer to draft the brand review-request email (template in brand-outreach skill assets) and move the item to `brand_review` when sent.

## Rules

- Never invent performance claims ("this will hit 50k") — cite ranges from the creator's own history at most.
- If vault is thin (<5 videos), say so and lean on profile + general craft, marking dimensions with weaker evidence.
- The human decides; the review informs.
