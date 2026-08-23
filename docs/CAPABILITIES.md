# Capabilities — what the system does (and deliberately doesn't)

Focused scope: **own-analytics vault → insight → outreach**. Every capability below runs on vault data only — no third-party account analysis, no posting automation, no scraping.

## Core loop (tools, always available)

| Capability | Tools used |
|---|---|
| Connect platforms (official OAuth) | `connect_youtube` · `connect_meta` · `connect_tiktok` · `connection_status` |
| Permanent history capture | `snapshot` (weekly; platforms' own windows expire, the vault doesn't) |
| TikTok Studio depth (retention/traffic/search) | `import_tiktok_csv` — the only compliant source |
| Cross-platform comparison | `compare_periods` (any metric, any window) |
| Content performance | `top_content` (any metric, best or worst, per platform) |
| Audience understanding | `audience_overview` (age/gender/country/city/source) |
| Free-form analysis | `vault_query` (read-only SQL, 500-row cap) |

## Skill-driven workflows (skills compose the tools)

| Workflow | Skill | What the agent produces |
|---|---|---|
| Weekly digest | `weekly-digest` | Scorecard: deltas, best/flop content with hypotheses, audience shifts, next actions |
| Media kit | `media-kit` | Always-current one-pager for brands, from verified numbers |
| Brand outreach | `brand-outreach` | Target selection → pitch drafts (≤150 words, real numbers) → pipeline tracking |
| Onboarding | `socials-connect` | Guided setup of all platforms + profile bootstrap + the weekly CSV habit |
| Script review | `script-review` | Evidence-scored script review (/50) against the creator's own hooks, retention curves, keywords + SEO package |
| Publish package | `publish-package` | Green light → titles/caption/hashtags/best-time (data-driven) → post-live measurement vs baseline |

## The creator workflow the system owns (production loop)

`idea → scripting → script_review → brand_review → approved → posted → measured`

The **content pipeline** tools track every deliverable through these stages; the skills drive each transition:
1. **script-review** scores the script before recording (evidence: the creator's own top hooks + retention curves + SEO keywords from the profile).
2. **brand-outreach** drafts the review-request email; stage moves to `brand_review`.
3. Green light → **publish-package** assembles title/caption/hashtags/best posting window from vault data; the creator posts (a human always presses publish); stage `posted`.
4. 48h + 7d checks measure vs their median automatically; outcome lands in `measured` + feeds the next media kit as a case study.

## Derived analyses (skills can compute from existing vault data)

These need **no new tools** — they're queries + interpretation the skills run on demand:

- **Trend & anomaly detection** — `compare_periods` over rolling windows; flag metrics moving >2σ from the 4-week trend.
- **Hook quality** — TikTok retention curves (from CSV imports): 3-second retention per video, bucket drops.
- **Traffic-mix shifts** — YouTube `insightTrafficSourceType` + TikTok CSV sources: search share rising = SEO working.
- **Best posting cadence** — daily metrics vs publish dates in the vault; no external data needed.
- **Brand-fit scoring** — audience geo/demographics vs a target brand's market, for outreach prioritization.
- **Campaign outcome tracking** — `outreach_log` status flow + content posted around send dates.
- **Self-benchmarking** — current performance vs the creator's own trailing 4-week baseline (the only honest benchmark).

## Explicit non-goals (rejected by design)

- Scraping or automating logged-in platform sessions (ToS/ban risk)
- Third-party/competitor account analytics (brand-side vetting is a different product)
- Posting/scheduling automation (analytics + outreach only; use Metricool/Buffer)
- Auto-sending outreach (draft-first, human-approved, `SOCIALS_ALLOW_SEND` gate)
- Fabricated estimates (every number carries a window and a source)

## Deliberately not borrowed from scheduling tools (Postiz etc.)

Postiz (open-source scheduler) solves posting automation with a dashboard — its concepts we took: best-time analytics (day-of-week from the vault), caption/hashtag generation (publish-package skill), approval workflow states (content_pipeline stages), and its compliance stance (official APIs only). Posting itself stays out of scope: if the creator ever wants scheduled posting, self-hosted Postiz is the right tool and socials-assistant's publish packages hand off cleanly to it.

## Extension points

- **New platform**: implement `connect<Platform>` + `snapshot<Platform>` in `packages/connectors` (see CONTRIBUTING.md) — the vault, tools, and skills pick it up automatically.
- **New workflow**: a SKILL.md composing existing tools; prefer this over new tools.
- **New tool**: must justify itself against this map — few, high-leverage tools beat many wrappers.
