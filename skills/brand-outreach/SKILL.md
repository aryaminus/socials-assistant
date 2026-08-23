---
name: brand-outreach
description: Draft brand-pitch and collaboration outreach emails using the creator's REAL verified analytics from the vault, find the right contacts, and manage the outreach pipeline. Use when the user wants to pitch brands, reply to brand inquiries, negotiate rates, or track outreach. DRAFT-FIRST: never send without explicit human approval.
---

# brand-outreach — pitch with real numbers

## Hard rules

1. **Draft-first.** Always produce a draft for review. Sending requires the user's explicit approval AND (if automation is wired) `SOCIALS_ALLOW_SEND` is set. One bad auto-sent pitch costs more than a day's delay.
2. **Real numbers only** — from `media_kit_data`, `top_content`, `compare_periods`. Cite the time window of every number ("last 30 days"). If the vault lacks data, run `snapshot` first; don't guess.
3. **Rate guidance** (nano/micro, adjust by market): TikTok video $50–300 (exceptional up to $800), IG reel $75–400, YT integration $100–500, bundle deals +30–50%. The creator sets final rates.
4. Log every draft with `outreach_log_add`; update with `outreach_log_update` when sent/replied.

## Pipeline

### 1. Target selection (help the user think)
Strong fits for book/niche creators: local bookstores, publishers (regional + Big-5 imprints), stationery/reading-accessory brands, edtech, tourism boards, culturally aligned lifestyle brands. Segment: domestic (68% Nepal audience in the sample case → Nepali brands) vs market-entry international. Research each brand's marketing contact (first name!) before drafting — never "Dear Sir/Madam".

### 2. Pull verified numbers
Call `media_kit_data`. Extract: followers per platform, 30-day views, avg engagement rate, top 3 videos, audience highlights (country/age). 

### 3. Draft structure (≤150 words, plain text, one link)
```
Subject: {Creator} × {Brand}: {specific content idea}

Hi {FirstName},

I'm {Creator} ({handle}) — {one-line niche: e.g. "I make videos about Kathmandu's libraries and reading culture; 68% of my audience is in Nepal, and my Exploring-Libraries series averages {avg} views with {er}% engagement}.

Specific idea for {Brand}: {1–2 sentences — a concrete video concept featuring their product/venue, referencing a proven format from top_content}.

Recent proof: "{top video title}" reached {views} views, {engagement}% engagement ({window} window).

Rate card and full media kit attached — happy to tailor deliverables (TikTok + IG reel bundle available).

Worth a chat?
{Name}
{media kit link}
```
Rules: no attachments in first cold email unless asked — link instead; mention numbers with their window; one clear CTA.

### 4. Log it
`outreach_log_add` with brand, contact email, subject, and a short pitch-angle note.

### 5. Follow-ups
Check `outreach_log_list` for drafts older than 5–7 days with no reply → draft a 2-line bump. Never more than one bump. Mark `replied`/`rejected`/`closed` honestly.

## Deliverability (when the user sends themselves)

Send from a custom subdomain (not personal Gmail), SPF+DKIM+DMARC set, ≤25 cold emails/day, warm up new domains 3–4 weeks, plain-text style. Full checklist: `docs/email-deliverability.md`. Sending automation (optional): Resend MCP — but still draft-first.

## Rate negotiation quick answers

- "What's your rate?" → give a range with deliverables, anchor mid-high.
- Budget pushback → cut scope (1 platform, shorter usage rights), not price below floor.
- Always define: usage rights (organic only vs paid amplification), exclusivity window, deliverable count, timeline, payment terms (50% upfront for new brands).
