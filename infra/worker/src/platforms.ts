/**
 * Server-side platform pulls for the cloud worker. Mirrors packages/connectors
 * logic with Workers-compatible primitives (fetch, URLSearchParams, WebCrypto).
 * Credentials come from the encrypted D1 store.
 */
import type { D1Vault, CloudSnapshot } from "./vault.ts";

type Creds = Record<string, string>;

export async function snapshotAll(vault: D1Vault, _tokenKey: string, days: number): Promise<Record<string, unknown>> {
  const results: Record<string, unknown> = {};
  for (const acct of await vault.listAccounts()) {
    try {
      const creds = await vault.getCredentials(acct.id);
      if (!creds) throw new Error("no stored credentials — use set_platform_credentials");
      let snap: CloudSnapshot | undefined;
      if (acct.platform === "youtube") snap = await snapshotYoutube(creds, days);
      else if (acct.platform === "instagram") snap = await snapshotInstagram(creds, days);
      else if (acct.platform === "facebook") snap = await snapshotFacebook(creds, days);
      else if (acct.platform === "tiktok") snap = await snapshotTiktok(creds);
      if (snap) results[acct.platform] = await vault.storeSnapshot(acct.id, snap, "api:cloud");
    } catch (e) {
      results[acct.platform] = { error: (e as Error).message };
    }
  }
  return results;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${String(text).slice(0, 300)}`);
  return body as T;
}

// ---------------- YouTube ----------------

async function snapshotYoutube(creds: Creds, days: number): Promise<CloudSnapshot> {
  const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const at = creds.accessToken;
  const auth = { Authorization: `Bearer ${at}` };
  const snap: CloudSnapshot = { platform: "youtube", takenAt: new Date().toISOString(), lifetime: [], daily: [], videos: [], audience: [], warnings: [] };

  const ch = await api<{ items?: Array<{ id: string; snippet: { title: string; customUrl?: string }; statistics: { viewCount?: string; subscriberCount?: string; videoCount?: string }; contentDetails: { relatedPlaylists: { uploads: string } } }> }>(
    `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&mine=true`,
    { headers: auth }
  );
  const channel = ch.items?.[0];
  if (!channel) throw new Error("no channel");
  snap.handle = channel.snippet.customUrl;
  snap.lifetime.push(
    { metric: "subscriber_count", value: Number(channel.statistics.subscriberCount ?? 0) },
    { metric: "channel_views", value: Number(channel.statistics.viewCount ?? 0) }
  );

  const daily = await api<{ rows?: unknown[][] }>(
    `https://youtubeanalytics.googleapis.com/v2/reports?ids=channel%3D%3DMINE&startDate=${since}&endDate=${today}&metrics=views,likes,comments,shares,estimatedMinutesWatched,subscribersGained&dimensions=day`,
    { headers: auth }
  );
  for (const r of daily.rows ?? []) {
    const [day, views, likes, comments, shares, minutes, subs] = r as [string, ...number[]];
    snap.daily.push(
      { date: day, metric: "views", value: views },
      { date: day, metric: "likes", value: likes },
      { date: day, metric: "comments", value: comments },
      { date: day, metric: "shares", value: shares },
      { date: day, metric: "watch_minutes", value: minutes },
      { date: day, metric: "followers_gained", value: subs }
    );
  }
  return snap;
}

// ---------------- Instagram ----------------

async function snapshotInstagram(creds: Creds, days: number): Promise<CloudSnapshot> {
  const ig = String(creds.extra_igUserId ?? "");
  if (!ig) throw new Error("missing igUserId in credentials.extra");
  const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  const token = creds.accessToken;
  const snap: CloudSnapshot = { platform: "instagram", takenAt: new Date().toISOString(), lifetime: [], daily: [], videos: [], audience: [], warnings: [] };

  const me = await api<{ followers_count?: number; media_count?: number; username?: string }>(
    `https://graph.facebook.com/v22.0/${ig}?fields=followers_count,media_count,username&access_token=${encodeURIComponent(token)}`
  );
  snap.handle = me.username;
  snap.lifetime.push({ metric: "followers", value: me.followers_count ?? 0 });

  const ins = await api<{ data?: Array<{ name: string; period: string; values: Array<{ value: number; end_time: string }> }> }>(
    `https://graph.facebook.com/v22.0/${ig}/insights?metric=views,reach,profile_views&period=day&since=${since}&access_token=${encodeURIComponent(token)}`
  );
  const seen = new Set<string>();
  for (const m of ins.data ?? []) {
    for (const v of m.values) {
      const k = `${v.end_time.slice(0, 10)}|${m.name}`;
      if (seen.has(k)) continue;
      seen.add(k);
      snap.daily.push({ date: v.end_time.slice(0, 10), metric: m.name, value: Number(v.value) });
    }
  }
  return snap;
}

// ---------------- Facebook ----------------

async function snapshotFacebook(creds: Creds, days: number): Promise<CloudSnapshot> {
  const page = String(creds.extra_pageId ?? "");
  if (!page) throw new Error("missing pageId in credentials.extra");
  const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  const token = creds.accessToken;
  const snap: CloudSnapshot = { platform: "facebook", takenAt: new Date().toISOString(), lifetime: [], daily: [], videos: [], audience: [], warnings: [] };

  const pg = await api<{ name?: string; fan_count?: number; followers_count?: number }>(
    `https://graph.facebook.com/v22.0/${page}?fields=name,fan_count,followers_count&access_token=${encodeURIComponent(token)}`
  );
  snap.lifetime.push({ metric: "followers", value: pg.followers_count ?? pg.fan_count ?? 0 });

  const ins = await api<{ data?: Array<{ name: string; values: Array<{ value: number; end_time: string }> }> }>(
    `https://graph.facebook.com/v22.0/${page}/insights?metric=page_impressions,page_impressions_unique,page_engaged_users&period=day&since=${since}&access_token=${encodeURIComponent(token)}`
  );
  for (const m of ins.data ?? []) {
    for (const v of m.values) snap.daily.push({ date: v.end_time.slice(0, 10), metric: m.name, value: Number(v.value) });
  }
  return snap;
}

// ---------------- TikTok ----------------

async function snapshotTiktok(creds: Creds): Promise<CloudSnapshot> {
  const snap: CloudSnapshot = { platform: "tiktok", takenAt: new Date().toISOString(), lifetime: [], daily: [], videos: [], audience: [], warnings: [] };
  const user = await api<{ data?: { user?: { open_id: string; display_name?: string; username?: string; follower_count?: number; likes_count?: number; video_count?: number } } }>(
    `https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,username,follower_count,likes_count,video_count`,
    { headers: { Authorization: `Bearer ${creds.accessToken}` } }
  );
  const u = user.data?.user;
  if (!u) throw new Error("TikTok user info empty");
  snap.handle = u.username;
  snap.lifetime.push(
    { metric: "followers", value: u.follower_count ?? 0 },
    { metric: "likes", value: u.likes_count ?? 0 },
    { metric: "video_count", value: u.video_count ?? 0 }
  );

  const vids = await api<{ data?: { videos?: Array<{ id: number | string; title?: string; video_description?: string; create_time?: number; share_url?: string; view_count?: number; like_count?: number; comment_count?: number; share_count?: number }> } }>(
    "https://open.tiktokapis.com/v2/video/list/",
    {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${creds.accessToken}` },
      body: JSON.stringify({ fields: ["id", "title", "video_description", "create_time", "share_url", "view_count", "like_count", "comment_count", "share_count"], max_count: 20 }),
    }
  );
  snap.videos = (vids.data?.videos ?? []).map((v) => ({
    platformVideoId: String(v.id),
    title: (v.title || v.video_description || "Untitled").slice(0, 160),
    url: v.share_url,
    publishedAt: v.create_time ? new Date(v.create_time * 1000).toISOString() : undefined,
    kind: "video",
    metrics: { views: v.view_count, likes: v.like_count, comments: v.comment_count, shares: v.share_count },
  }));
  snap.warnings.push("Studio-only metrics need CSV import (local server) — cloud TikTok covers API-level counts only.");
  return snap;
}

// ---------------- token refresh ----------------

export async function refreshPlatformToken(vault: D1Vault, platform: string, _tokenKey: string): Promise<unknown> {
  void _tokenKey;
  const accounts = (await vault.listAccounts()).filter((a) => a.platform === platform);
  const out: unknown[] = [];
  for (const acct of accounts) {
    const creds = await vault.getCredentials(acct.id);
    if (!creds?.refreshToken) {
      out.push({ platform, id: acct.id, error: "no refresh token stored" });
      continue;
    }
    try {
      let refreshed: Creds;
      if (platform === "youtube") {
        const body = new URLSearchParams({
          refresh_token: creds.refreshToken,
          client_id: creds.extra_clientId ?? "",
          client_secret: creds.extra_clientSecret ?? "",
          grant_type: "refresh_token",
        });
        if (!body.get("client_id")) throw new Error("store extra_clientId/extra_clientSecret in credentials for refresh");
        const t = await api<{ access_token: string; expires_in: number }>("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
        refreshed = { ...creds, accessToken: t.access_token, expiresAt: new Date(Date.now() + t.expires_in * 1000).toISOString() };
      } else if (platform === "tiktok") {
        const body = new URLSearchParams({
          client_key: creds.extra_clientKey ?? "",
          client_secret: creds.extra_clientSecret ?? "",
          grant_type: "refresh_token",
          refresh_token: creds.refreshToken,
        });
        if (!body.get("client_key")) throw new Error("store extra_clientKey/extra_clientSecret in credentials for refresh");
        const t = await api<{ access_token: string; refresh_token?: string; expires_in?: number }>("https://open.tiktokapis.com/v2/oauth/token/", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
        refreshed = { ...creds, accessToken: t.access_token, refreshToken: t.refresh_token ?? creds.refreshToken, expiresAt: t.expires_in ? new Date(Date.now() + t.expires_in * 1000).toISOString() : undefined };
      } else {
        // Meta: exchange to long-lived again
        const t = await api<{ access_token: string; expires_in?: number }>(
          `https://graph.facebook.com/v22.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${creds.extra_appId ?? ""}&client_secret=${creds.extra_appSecret ?? ""}&fb_exchange_token=${creds.accessToken}`
        );
        if (!creds.extra_appId) throw new Error("store extra_appId/extra_appSecret in credentials for refresh");
        refreshed = { ...creds, accessToken: t.access_token, expiresAt: t.expires_in ? new Date(Date.now() + t.expires_in * 1000).toISOString() : undefined };
      }
      await vault.setCredentials(acct.id, refreshed);
      out.push({ platform, id: acct.id, refreshed: true });
    } catch (e) {
      out.push({ platform, id: acct.id, error: (e as Error).message });
    }
  }
  return out;
}
