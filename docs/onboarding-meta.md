# Onboarding: Instagram + Facebook (Meta) — free, ~15 min, one-time

One Meta developer app covers both platforms via the official Graph API. The single hard requirement: **your Instagram account must be Business or Creator type AND linked to a Facebook Page** (Instagram's rule, not ours — it's what unlocks insights).

## 0. Prepare your accounts (if not already)

1. Instagram app → Settings → Account type → **Switch to Business/Creator account** (free).
2. Facebook: create a Page (any name; "hidden" unpublished Pages work) if you don't have one.
3. Instagram → Settings → Business/Enterprise → **Link Facebook Page**.

## 1. Create the Meta app

1. https://developers.facebook.com → My Apps → **Create App**.
2. Use case: **Other** → type **Business** → name it `socials-assistant`.

## 2. Add products

1. Dashboard → Add product → **Facebook Login** → Set up → Web.
2. **Valid OAuth Redirect URIs**: add BOTH of these, then Save:
   - Local server: `http://127.0.0.1:8399/callback`
   - Cloud worker (if deploying to Cloudflare): `https://<your-worker>.workers.dev/oauth/meta/done`
3. Add product → **Instagram Graph API** (automatic for Business apps).

No App Review needed yet: while your app is in **Development mode**, the roles listed under Roles (you, admins, testers) can grant all these permissions. App Review is only needed if OTHER creators use YOUR app id (the cloud worker's multi-tenant mode).

## 3. Store credentials

```bash
socials-mcp config set metaAppId 1234567890123456
socials-mcp config set metaAppSecret <app-secret-from-settings/basic>
```

## 4. Connect

Agent tool: `connect_meta` → open the consent URL → approve both Facebook + Instagram prompts → `connection_status` confirms `instagram` and `facebook`.

## What you get

- IG: followers, daily reach/views/profile views, per-post plays/reach/saves/shares, **follower demographics** (age/gender/city/country — the field most other tools miss)
- FB Page: impressions, reach, engaged users, fan count

## Token lifetimes

First connect exchanges to a **long-lived token (~60 days)**. Every `snapshot` auto-refreshes Meta tokens when nearing expiry — for reliable refresh just snapshot weekly (which you're doing anyway). If a token ever lapses: re-run `connect_meta`.

## Troubleshooting

- "No Facebook Page found" → IG account not Page-linked (step 0.3), or you didn't grant `pages_show_list`.
- `(#10) Not granted permission` → your app is Live but permissions unreviewed; switch to Development mode in App settings → Basic.
- IG demographics 403 → follower_demographics needs the IG account to have ≥100 followers (Meta's threshold).
