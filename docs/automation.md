# Automation — weekly snapshot, digest, and email

Three tiers; pick one. All keep the draft-first outreach rule (automation never sends brand pitches).

## Tier 1: GitHub Actions cron (free, recommended)

The repo ships `.github/workflows/digest.yml` (Mondays 09:00 UTC):

1. Push this repo to GitHub (private is fine — free tier includes 2,000 min/mo; a weekly run uses ~2).
2. Repo Settings → Secrets and variables → Actions → add any of:
   - `SOCIALS_GOOGLE_CLIENT_ID` / `SOCIALS_GOOGLE_CLIENT_SECRET`
   - `SOCIALS_META_APP_ID` / `SOCIALS_META_APP_SECRET`
   - `SOCIALS_TIKTOK_CLIENT_KEY` / `SOCIALS_TIKTOK_CLIENT_SECRET`
   - `RESEND_API_KEY`, `DIGEST_TO` (your email), `DIGEST_FROM` (e.g. `digest@yourdomain.com`)
3. One-time: seed the vault locally (`socials-mcp snapshot`), then copy `~/.socials-assistant/vault.db` into the runner via the cache action (first manual run picks it up from `Actions cache`), or simply re-enter tokens via config + connect on the runner — see the workflow comments.

The workflow snapshots → writes `digests/YYYY-WW.md` → commits it → optionally emails you the digest.

## Tier 2: Local cron (zero cloud)

```cron
0 9 * * 1 cd /path/to/socials-assistant && SOCIALS_DATA_DIR=$HOME/.socials-assistant node apps/mcp/bin/socials-mcp.js snapshot >> ~/.socials-assistant/cron.log 2>&1 && npx tsx scripts/weekly-digest.ts >> ~/.socials-assistant/cron.log 2>&1
```

Computer must be on at that time (Mac: use launchd or just run it when you open your laptop — analytics tolerate a drifting schedule).

## Tier 3: Claude Cowork / scheduled agent (no code)

If you're on Claude Pro, a scheduled task can call the MCP tools for you weekly. Paste this as the task prompt:

```
Every Monday: using the socials MCP server tools —
1. Call snapshot (default days).
2. Call digest_data with days=7.
3. Follow the weekly-digest skill to write a markdown digest; save it to the socials-assistant repo digests/ folder with the ISO week as filename.
4. Summarize the digest in 5 bullets and stop. Do NOT send any emails to brands.
If snapshot errors, report which platform failed and the exact error.
```

Requires: the MCP server reachable from Cowork (deploy the Cloudflare worker, then add it as a custom connector — `docs/hosting-cloudflare.md`).

## TikTok CSV in automation

TikTok Studio exports are manual by design (Studio-only data has no API). Weekly habit: export → drop into a folder (e.g. `~/Downloads/tiktok/`) → tell your agent "import the new tiktok csv" or run:

```bash
node apps/mcp/bin/socials-mcp.js import ~/Downloads/tiktok/*.csv
```
