# Onboarding: TikTok (official Display API) — free, one-time

TikTok is the strictest platform — and the only one whose developer app takes days to approve. Plan accordingly: your own account works immediately in practice while the app is in review, because you (the app owner) are an allowed tester.

## What the official API gives (and what it can't)

| Via `video.list` + `user.info.stats` | Studio-only — needs weekly CSV export |
|---|---|
| views, likes, comments, shares per video | retention curves, avg watch time |
| follower/following/likes/video counts | traffic sources (FYP vs search vs profile) |
| video metadata (title, time, share URL) | search terms, follower demographics, followers-by-hour |

TikTok does not expose Studio-only fields through ANY official API. The CSV import is the compliant path for those (5 min/week from TikTok Studio → Analytics → export). We deliberately don't automate the logged-in Studio session — TikTok ToS forbids automated access; account risk isn't worth it.

## 1. Create the app

1. https://developers.tiktok.com → **Manage apps** → **Connect an app** (or Create).
2. Verify a domain you control (any static page is fine — TikTok needs a privacy policy URL: put a short privacy note on that page mentioning your own use).
3. Note **Client key** and **Client secret**.

## 2. Add Login Kit with the right scopes

1. Add product → **Login Kit**.
2. Redirect URI — add both if you might use either mode:
   - Local server: `http://127.0.0.1:8399/callback`
   - Cloud worker (if deploying to Cloudflare): `https://<your-worker>.workers.dev/oauth/tiktok/done`
3. Scopes: enable `user.info.basic`, `user.info.stats`, `video.list`.
4. Submit for review (approval commonly takes 2–7 days). Meanwhile, the app owner's own account can authorize in sandbox/dev mode.

## 3. Store credentials

```bash
socials-mcp config set tiktokClientKey <client_key>
socials-mcp config set tiktokClientSecret <client_secret>
```

## 4. Connect + snapshot

Agent tools: `connect_tiktok` → open URL → approve → `connection_status`, then `snapshot`.

## 5. Weekly Studio CSV (the deep data)

1. TikTok app → **TikTok Studio** → Analytics → **Export data** (video stats, last 7 days) — also grab the Follower export when offered.
2. Save the file, then in your agent: `import_tiktok_csv` with the path.
3. The importer handles the standard export shapes; unrecognized columns are preserved, never dropped.

The vault stitches API counts + CSV depth into one history — that combined record is what digests, top_content, and media kits read.

## Troubleshooting

- `scope_not_authorized` → scope not enabled on the app (step 2.3) or your account isn't an owner/tester while in review.
- Redirect mismatch error at consent → URI must match byte-for-byte (use `http://127.0.0.1:8399/callback`, not localhost).
- `video.list` empty → new apps sometimes need first-party use for a day before data flows; re-snapshot after 24h.
