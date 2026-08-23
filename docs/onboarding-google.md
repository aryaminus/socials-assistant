# Onboarding: YouTube (Google Cloud) — free, ~20 min, one-time

The YouTube connector uses Google's own free APIs with **your** OAuth consent: YouTube Data API v3, YouTube Analytics API, YouTube Reporting API.

## 1. Create the project

1. https://console.cloud.google.com → project picker → **New project** → name it `socials-assistant`.
2. Billing: NOT required for these APIs at creator scale (free quotas).

## 2. Enable the three APIs

1. APIs & Services → Library → search and **Enable** each:
   - `YouTube Data API v3`
   - `YouTube Analytics API`
   - `YouTube Reporting API` (optional — bulk reports)

## 3. OAuth consent screen

1. APIs & Services → **OAuth consent screen** → User type **External** → Create.
2. App name `socials-assistant`, your email, save.
3. **Test users** → Add your own Google account (the one owning your channel).

> While in "Testing" mode, only listed test users can consent — that's exactly you. No Google verification needed for personal use.

## 4. Create OAuth client

Pick based on where your MCP server runs:

**Local (default):**
1. APIs & Services → **Credentials** → Create credentials → **OAuth client ID**.
2. Application type: **Desktop app** (the local server handles the loopback redirect automatically — no need to type redirect URIs).
3. Copy the **Client ID** and **Client secret**.

**Cloud (Cloudflare Worker):**
1. Same flow, but Application type: **Web application**.
2. Under **Authorized redirect URIs**, add BOTH:
   - `https://<your-worker>.workers.dev/callback` — used by the MCP sign-in
   - `https://<your-worker>.workers.dev/oauth/youtube/done` — used when connecting YouTube data
3. Copy the Client ID and Client secret into the Worker's dashboard Variables (`GOOGLE_LOGIN_CLIENT_ID/SECRET`, and reuse for `SOCIALS_GOOGLE_CLIENT_ID/SECRET`).

## 5. Store credentials

```bash
socials-mcp config set googleClientId 123456789-abc.apps.googleusercontent.com
socials-mcp config set googleClientSecret GOCSPX-...
```

(or env vars `SOCIALS_GOOGLE_CLIENT_ID` / `SOCIALS_GOOGLE_CLIENT_SECRET`)

## 6. Connect

In your agent: call the `connect_youtube` tool → open the printed consent URL → approve → `connection_status` should show `ok: true`.

## Quota notes (creator scale ≈ never an issue)

- Data API: 10k units/day; our snapshot uses ~15 units.
- Analytics API: free, generous.
- First snapshot pulls 28 days; history then accrues in the vault forever — Google only serves ~the last 90 days of some reports, which is exactly why the vault exists.

## Troubleshooting

- `access_denied` → your account isn't in the **Test users** list (step 3.3).
- `unauthorized_client` → wrong application type (must be Desktop app).
- 403 `youtubeAnalyticsApiNotUsed` → Analytics API not enabled (step 2).
