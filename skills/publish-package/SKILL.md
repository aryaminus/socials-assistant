---
name: publish-package
description: Prepares everything needed to publish an approved video (title options, caption, hashtags, best posting time from vault data) and measures its performance against the creator's baseline after it goes live. Use when a brand gives the green light, when the user is about to post, or when checking how a recent post performed.
license: MIT
---

# publish-package — green light → ready to post → measured

The agent owns packaging and measurement; the human posts (posting automation is deliberately out of scope — see docs/CAPABILITIES.md).

## Step 1 — Assemble the package (stage: approved)

1. `socials-mcp:profile_get` (tone, keywords) + `socials-mcp:pipeline_list` (`stage: "approved"`) to find the item.
2. Generate the package:
   - **Title options (3)** — keyword-front-loaded, ≤80 chars, pattern-matched to the creator's top_content titles.
   - **Caption** — hook line + 1–2 lines of context + CTA matching tone_notes; disclosure (#ad / #sponsored) FIRST if branded, per brief.
   - **Hashtags (5–8)** — mix: 2 niche keywords from profile, 2 proven (appear in past top titles/captions), 2 broad-reach; check they're real words, no ban-list tags.
   - **Best posting window** — data-driven: `vault_query` day-of-week views
     `SELECT strftime('%w', date) AS dow, sum(value) AS v FROM account_metrics am JOIN snapshots s ON s.id=am.snapshot_id JOIN accounts a ON a.id=s.account_id WHERE a.platform=? AND am.metric='views' AND am.date IS NOT NULL GROUP BY dow ORDER BY v DESC`
     → recommend top day(s) + evening preference if the creator's audience skews after-work hours (note when data is thin: say "no strong signal; default to your usual slot").
3. Present the package for approval; on go-ahead, `socials-mcp:pipeline_update` → keep `approved`, attach package in `notes`.

## Step 2 — At posting time (human posts)

Hand over the final copy-paste block (title / caption / tags). After they confirm it's live: `pipeline_update` → `stage: "posted"` with `post_url` and `posted_at`.

## Step 3 — Measure (the part nobody does)

- **48h check-in**: find the video via `top_content` (`days: 2`) or `vault_query` on title match; report early velocity vs the creator's median (`top_content` `days: 30`, `limit: 20` → median views). Flag if it's tracking below half the median at 48h so there's time to fix the title/cover.
- **7-day verdict**: views, ER, watch time vs median → append a one-line outcome to the pipeline item notes (`pipeline_update`), set `stage: "measured"`.
- If sponsored: mirror the outcome to the linked outreach entry (`outreach_log_update` notes) — that's the case study for the next pitch (media-kit skill picks it up).

## Rules

- Every recommendation cites its data ("Tuesday is your strongest day: 31% of views").
- No posting automation, ever — the human presses the button.
- If the platform lacks data for a step, say so and default to the creator's usual pattern rather than inventing.
