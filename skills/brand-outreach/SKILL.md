---
name: brand-outreach
description: Drafts brand-pitch and collaboration outreach emails using the creator's real verified vault analytics, selects target brands, and manages the outreach pipeline. Use when the user wants to pitch brands, find sponsorship contacts, reply to brand inquiries, negotiate rates, or track outreach status. Draft-first by design — never sends without explicit human approval.
license: MIT
---

# brand-outreach — pitch with real numbers

## Hard rules

1. **Draft-first.** Always produce a draft for human review. Never send, schedule, or promise sending without the user's explicit go-ahead.
2. **Real numbers only** — from `socials-mcp:media_kit_data`, `socials-mcp:top_content`, `socials-mcp:compare_periods`. Cite the time window of every number ("last 30 days"). If the vault lacks data, run `socials-mcp:snapshot` first; don't guess.
3. Log every draft with `socials-mcp:outreach_log_add`; update status with `socials-mcp:outreach_log_update`.

## Pipeline

### 0. Read the creator profile
Call `socials-mcp:profile_get` first: niche, audience summary, brand_categories, rate_floor, past_collaborations drive targeting and pricing. If empty, build it with the user (audience facts auto-fill from `socials-mcp:audience_overview`).

### 1. Target selection (help the user think)
Rank targets by audience–product fit: brands whose customers look like the creator's audience demographics (country/age from `socials-mcp:audience_overview` + profile brand_categories). Prefer profile.past_collaborations categories — repeat sponsors convert best. Research each brand's marketing contact name before drafting — never "Dear Sir/Madam".

### 2. Pull verified numbers
Call `socials-mcp:media_kit_data`. Extract: followers per platform, 30-day views, avg engagement rate, top 3 videos, audience highlights.

### 3. Draft
Use the template in [assets/pitch-template.md](assets/pitch-template.md) — ≤150 words, plain text, one link, numbers with windows, one clear CTA. Rate guidance lives in [references/rate-card.md](references/rate-card.md); the user sets final rates.

### 4. Log it
`socials-mcp:outreach_log_add` with brand, contact email, subject, and a short pitch-angle note.

### 5. Follow-ups
Check `socials-mcp:outreach_log_list` for drafts 5–7 days old with no reply → draft a 2-line bump. Maximum one bump. Mark `replied`/`rejected`/`closed` honestly.

## Negotiation quick answers

- "What's your rate?" → range with deliverables, anchored mid-high.
- Budget pushback → cut scope (fewer deliverables, shorter usage rights), not price below floor.
- Always define: usage rights (organic vs paid amplification), exclusivity window, deliverable count, timeline, payment terms (50% upfront for new brands).

## Deliverability

When the user sends themselves: send from a custom subdomain with SPF+DKIM+DMARC, ≤25 cold emails/day after 3–4 week warmup, plain-text style, no attachments in first contact. Full checklist: repo `docs/email-deliverability.md`.
