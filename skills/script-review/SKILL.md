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
4. **Research search demand** — web-search the specific topic, place, product, or person named in the script. Report High / Medium / Low demand and what it implies:
   - High demand (well-known subject): can be a "big swing" piece — expect it to carry reach
   - Low demand (obscure, hyper-local): fine to shoot, often converts viewers into followers well, but raw view count will likely stay modest regardless of quality

## Score (0–10 each, weighted total /50)

| Dimension | Evidence source | What earns marks |
|---|---|---|
| **Hook (×2)** | Titles + retention of top_content | First line contains a concrete, searchable noun (a place/object/person) + tension or number — mirrors top titles; not generic ("check this out"); lands in first 2–3 seconds as a pattern-interrupt |
| **Search demand (×1)** | Web research (Step 4) | Topic has pre-existing name recognition or search interest; if low-demand, score honestly and adjust reach expectations |
| **Structure / retention (×1.5)** | Retention curves | Beats arranged so a new visual or verbal change lands every 5–8s (matches where past videos held viewers); specific re-hook around the 8–10s mark before natural drop-off; no dead middle |
| **SEO (×1.5)** | Profile keywords + traffic_json search share | Primary keyword spoken aloud, shown as on-screen text, AND leading the caption — all three, not just one (triple-mention measurably outperforms single); long-tail variant included |
| **Fit (×1)** | Profile niche/tone + audience_overview | On-niche for the audience (country/language/age), tone matches tone_notes; balances the account's ratio of discovery/story vs. educational/promotional content (roughly 2–3 discovery per 1 straight-explainer is a reasonable default) |
| **Deliverable safety (×1)** | brief in pipeline item (if sponsored) | Meets brand brief requirements; claims verifiable; disclosure (#ad) planned; nothing that conflicts with the creator's past collaborations |

## Good / Bad / Ugly summary

Before the scorecard table, produce three short groups in plain language:
- **Good** — what's already working, cite the specific line/shot/idea
- **Bad** — fixable weaknesses, name the fix plainly
- **Ugly** — anything that risks real underperformance (low-demand topic treated as big-swing, missing keyword entirely, generic title)

Don't manufacture criticism. If a script nails most categories, say so and keep the rewrite section short.

## Output format

```
## Script review — {title}
**Score: {n}/50** — {one-line verdict: produce as-is / revise / rework hook}

### Good / Bad / Ugly
- **Good**: {what works, cite specific line}
- **Bad**: {fixable issue + fix}
- **Ugly**: {real risk, if any}

### Scorecard
| Dimension | Grade | Why | Fix |
|---|---|---|---|
| Hook | {0–10} | {one line} | {concrete fix} |
| Search demand | {0–10} | High/Med/Low + implication | {adjust expectations or lean in} |
| Structure | {0–10} | {one line} | {concrete fix} |
| SEO | {0–10} | {one line} | {concrete fix} |
| Fit | {0–10} | {one line} | {concrete fix} |
| Deliverable safety | {0–10} | {one line} | {concrete fix} |

### Rewrite deliverables (ready to use)
- **Titles**: {2–3, keyword-front-loaded, specific not generic}
- **Caption**: {keyword leading first line, not a vague category tag}
- **Hashtags**: {1 broad + 1 niche + 1 exact-name tag; flag stuffing or zero tags}
- **On-screen text cues**: {hook text at 0s, mid-video callout at ~8–10s, closing CTA}
- **Mid-video re-hook**: {timestamp + what changes on screen or what gets said}
- **Posting time**: {use account data if available, otherwise label as general best-practice}
```

## After review

- Sponsored script → log/stage it: `socials-mcp:pipeline_update` → `script_review`, save the script file path.
- Offer to draft the brand review-request email (template in brand-outreach skill assets) and move the item to `brand_review` when sent.

## Rules

- Never invent performance claims ("this will hit 50k") — cite ranges from the creator's own history at most.
- If vault is thin (<5 videos), say so and lean on profile + general craft, marking dimensions with weaker evidence.
- Use plain language — no jargon (CTR, SERP, algorithmic distribution) without immediately explaining it in words a non-technical creator understands.
- The human decides; the review informs.
