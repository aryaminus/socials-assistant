# Email deliverability for creator outreach

Why brands' replies land in spam — and how to prevent yours from vanishing. Applies to the sending side of the brand-outreach skill (drafts always get a human pass first).

## Setup (one-time, ~1 hour)

1. **Dedicated subdomain.** Buy/use `helloname.com` style: send from `you@hello.yourname.com`, never your personal `@gmail.com` and never your main domain. Isolates reputation — a mistake on the subdomain can't burn your main site's email.
2. **SPF** (DNS TXT on the subdomain): `v=spf1 include:_spf.resend.com ~all` (or your provider's include).
3. **DKIM**: your provider (Resend/Postmark/Google Workspace) gives the CNAME/TXT records — add them.
4. **DMARC** (DNS TXT on `_dmarc.hello.yourname.com`): start with `v=DMARC1; p=none; rua=mailto:you@yourname.com` — monitor via the weekly rua reports for 2–4 weeks, then tighten to `quarantine`.
5. Verify the domain in your sending tool (Resend: Domains → DNS check).

## Warmup (3–4 weeks, cannot skip on a new domain)

- Week 1: 5–10 emails/day to real people who reply (friends, existing contacts).
- Ramp +50%/week. Do not cold-blast on day one — a new domain sending 50 cold emails gets filtered instantly.
- Keep total cold volume ≤25/day per inbox even after warmup.

## Content rules that survive 2026 filters

- Plain-text or minimal HTML, <150 words, one link, no tracking pixels in first emails.
- Personalize the first line (their campaign, their store, their book) — filters and humans both check.
- No attachments in first contact — link the media kit instead.
- A clear opt-out ("if this isn't relevant, tell me and I won't follow up").

## Monitor

- Google Postmaster Tools (free): spam-complaint rate must stay <0.1% (0.3% = catastrophe).
- Bounces >3% → stop, clean the list.
- No replies in 40+ sends from a domain → revisit targeting before volume.

## What this repo does for you

- `brand-outreach` skill drafts + logs; sending is manual or gated by `SOCIALS_ALLOW_SEND` + daily cap 25.
- The optional Resend MCP integration (free 3k/mo) sends only what you explicitly approve.
- Weekly digest self-email (Tier-1 automation) is transactional, not cold — safe from these rules.
