import { jsonFetch, pkce, waitForCallback } from "./oauth.js";
import { OAUTH_PORT, redirectUri, type PlatformAppConfig } from "./config.js";
import type { NormalizedSnapshot, VideoRecord, VideoMetrics, RetentionPoint } from "@socials/shared";

/**
 * YouTube connector — official Google APIs only:
 *   - OAuth 2.0 installed-app flow (accounts.google.com)
 *   - YouTube Data API v3        (channel + videos metadata)
 *   - YouTube Analytics API v2   (views, watch time, traffic sources, retention, demographics)
 *   - YouTube Reporting API      (optional bulk reports — documented, not pulled by snapshot)
 */

export interface GoogleTokens {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  token_type?: string;
  expires_at?: string; // ISO, added by us
}

const SCOPES = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
].join(" ");

export async function connectYoutube(cfg: PlatformAppConfig): Promise<{ tokens: GoogleTokens; channel: { id: string; title: string; handle?: string } }> {
  if (!cfg.googleClientId || !cfg.googleClientSecret) {
    throw new Error("Missing Google OAuth credentials. Set SOCIALS_GOOGLE_CLIENT_ID / SOCIALS_GOOGLE_CLIENT_SECRET (see docs/onboarding-google.md).");
  }
  const tokens = await runGoogleOAuth(cfg);
  const channel = await fetchMyChannel(tokens.access_token);
  return { tokens, channel };
}

async function runGoogleOAuth(cfg: PlatformAppConfig): Promise<GoogleTokens> {
  const { verifier, challenge } = pkce();
  const state = verifier.slice(0, 24);
  const ru = redirectUri(OAUTH_PORT);
  const authorizeUrl =
    `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(cfg.googleClientId!)}` +
    `&redirect_uri=${encodeURIComponent(ru)}&response_type=code&scope=${encodeURIComponent(SCOPES)}` +
    `&access_type=offline&prompt=consent&state=${state}&code_challenge=${challenge}&code_challenge_method=S256`;

  console.error("[socials] Open this URL to connect YouTube:\n" + authorizeUrl + "\n");
  const { code } = await waitForCallback({ authorizeUrl, port: OAUTH_PORT, state });
  const tokens = await jsonFetch<GoogleTokens>("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: cfg.googleClientId!,
      client_secret: cfg.googleClientSecret!,
      redirect_uri: ru,
      grant_type: "authorization_code",
      code_verifier: verifier,
    }).toString(),
  });
  tokens.expires_at = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  return tokens;
}

export async function refreshGoogle(cfg: PlatformAppConfig, refreshToken: string): Promise<GoogleTokens> {
  const tokens = await jsonFetch<GoogleTokens>("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: cfg.googleClientId!,
      client_secret: cfg.googleClientSecret!,
      grant_type: "refresh_token",
    }).toString(),
  });
  return { ...tokens, refresh_token: refreshToken, expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString() };
}

async function fetchMyChannel(accessToken: string): Promise<{ id: string; title: string; handle?: string }> {
  const data = await jsonFetch<{
    items?: Array<{ id: string; snippet: { title: string; customUrl?: string } }>;
  }>(
    `https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true&access_token=${encodeURIComponent(accessToken)}`
  );
  const item = data.items?.[0];
  if (!item) throw new Error("No YouTube channel found on this Google account.");
  return { id: item.id, title: item.snippet.title, handle: item.snippet.customUrl };
}

export async function snapshotYoutube(
  cfg: PlatformAppConfig,
  tokens: GoogleTokens,
  onTokenRefresh?: (t: GoogleTokens) => void,
  days = 28
): Promise<NormalizedSnapshot> {
  // refresh if expired or expiring within 60s
  let at = tokens.access_token;
  if (!tokens.expires_at || new Date(tokens.expires_at).getTime() - 60_000 < Date.now()) {
    if (!tokens.refresh_token) throw new Error("YouTube token expired and no refresh token stored — re-connect.");
    const refreshed = await refreshGoogle(cfg, tokens.refresh_token);
    at = refreshed.access_token;
    onTokenRefresh?.(refreshed);
  }
  const auth = { Authorization: `Bearer ${at}` };
  const warnings: string[] = [];
  const takenAt = new Date().toISOString();

  const snap: NormalizedSnapshot = { platform: "youtube", takenAt, lifetime: [], daily: [], videos: [], audience: [], warnings };

  // ---- channel + stats ----
  const channel = await jsonFetch<{
    items?: Array<{
      id: string;
      snippet: { title: string; customUrl?: string; publishedAt?: string };
      statistics: { viewCount?: string; subscriberCount?: string; videoCount?: string };
      contentDetails: { relatedPlaylists: { uploads: string } };
    }>;
  }>(`https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&mine=true`, { headers: auth });
  const ch = channel.items?.[0];
  if (!ch) throw new Error("No channel on account.");
  snap.displayName = ch.snippet.title;
  snap.handle = ch.snippet.customUrl;
  const num = (x?: string) => (x === undefined ? undefined : Number(x));
  snap.lifetime.push(
    { metric: "subscriber_count", value: num(ch.statistics.subscriberCount) ?? 0 },
    { metric: "channel_views", value: num(ch.statistics.viewCount) ?? 0 },
    { metric: "video_count", value: num(ch.statistics.videoCount) ?? 0 }
  );

  // ---- recent uploads ----
  const uploads = await jsonFetch<{
    items?: Array<{ snippet: { resourceId: { videoId: string }; title: string; publishedAt: string } }>;
  }>(
    `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=25&playlistId=${ch.contentDetails.relatedPlaylists.uploads}`,
    { headers: auth }
  );
  const videoIds = (uploads.items ?? []).map((i) => i.snippet.resourceId.videoId);

  // ---- per-video statistics ----
  const videos: VideoRecord[] = [];
  if (videoIds.length) {
    const stats = await jsonFetch<{
      items?: Array<{
        id: string;
        snippet: { title: string; publishedAt: string };
        statistics: { viewCount?: string; likeCount?: string; commentCount?: string; favoriteCount?: string };
        contentDetails: { duration?: string };
      }>;
    }>(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${videoIds.join(",")}`, {
      headers: auth,
    });
    // ---- per-video analytics (avgViewDuration, shares, subscribersGained) ----
    const perVideo = new Map<string, { avgViewDuration?: number; shares?: number; subscribersGained?: number; likes?: number }>();
    try {
      const start = isoDaysAgo(days);
      const va = await jsonFetch<{ rows?: unknown[][] }>(
        `https://youtubeanalytics.googleapis.com/v2/reports?ids=channel%3D%3DMINE&startDate=${start}&endDate=${todayIso()}` +
          `&metrics=views,likes,estimatedMinutesWatched,averageViewDuration,shares,subscribersGained&sort=-views&maxResults=25&filters=video==${videoIds.join(",")}`,
        { headers: auth }
      );
      (va.rows ?? []).forEach((r) => {
        const [vid, views, likes, minutes, avgDur, shares, subsGained] = r as [string, number, number, number, number, number, number];
        void views;
        perVideo.set(vid, { avgViewDuration: avgDur, shares, subscribersGained: subsGained, likes });
      });
    } catch (e) {
      warnings.push(`Video-level analytics unavailable: ${(e as Error).message}`);
    }

    for (const v of stats.items ?? []) {
      const a = perVideo.get(v.id);
      const m: VideoMetrics = {
        views: num(v.statistics.viewCount),
        likes: num(v.statistics.likeCount) ?? a?.likes,
        comments: num(v.statistics.commentCount),
        shares: a?.shares,
        avgWatchSeconds: a?.avgViewDuration,
      };
      videos.push({
        platform: "youtube",
        platformVideoId: v.id,
        title: v.snippet.title,
        url: `https://youtu.be/${v.id}`,
        publishedAt: v.snippet.publishedAt,
        kind: v.snippet.title.toLowerCase().includes("#shorts") ? "short" : "video",
        metrics: m,
      });
    }
  }
  snap.videos = videos;

  // ---- daily channel metrics ----
  try {
    const start = isoDaysAgo(days);
    const daily = await jsonFetch<{ rows?: unknown[][] }>(
      `https://youtubeanalytics.googleapis.com/v2/reports?ids=channel%3D%3DMINE&startDate=${start}&endDate=${todayIso()}` +
        `&metrics=views,likes,comments,shares,estimatedMinutesWatched,subscribersGained&dimensions=day`,
      { headers: auth }
    );
    (daily.rows ?? []).forEach((r) => {
      const [day, views, likes, comments, shares, minutes, subs] = r as [string, ...number[]];
      snap.daily.push(
        { date: day, metric: "views", value: views },
        { date: day, metric: "likes", value: likes },
        { date: day, metric: "comments", value: comments },
        { date: day, metric: "shares", value: shares },
        { date: day, metric: "watch_minutes", value: minutes },
        { date: day, metric: "followers_gained", value: subs }
      );
    });
  } catch (e) {
    warnings.push(`Daily analytics unavailable: ${(e as Error).message}`);
  }

  // ---- traffic sources ----
  try {
    const start = isoDaysAgo(days);
    const traffic = await jsonFetch<{ rows?: unknown[][] }>(
      `https://youtubeanalytics.googleapis.com/v2/reports?ids=channel%3D%3DMINE&startDate=${start}&endDate=${todayIso()}` +
        `&metrics=views&dimensions=insightTrafficSourceType`,
      { headers: auth }
    );
    const totalViews = (traffic.rows ?? []).reduce((s, r) => s + Number((r as unknown[])[1]), 0);
    if (totalViews > 0) {
      for (const r of traffic.rows ?? []) {
        const [src, views] = r as [string, number];
        snap.audience.push({ dimension: "source", key: String(src), value: views / totalViews });
      }
    }
  } catch (e) {
    warnings.push(`Traffic sources unavailable: ${(e as Error).message}`);
  }

  // ---- demographics ----
  try {
    const start = isoDaysAgo(days);
    const demo = await jsonFetch<{ rows?: unknown[][] }>(
      `https://youtubeanalytics.googleapis.com/v2/reports?ids=channel%3D%3DMINE&startDate=${start}&endDate=${todayIso()}` +
        `&metrics=viewerPercentage&dimensions=ageGroup,gender`,
      { headers: auth }
    );
    for (const r of demo.rows ?? []) {
      const [age, gender, pct] = r as [string, string, number];
      snap.audience.push({ dimension: "age", key: age.replace("age", ""), value: pct / 100 });
      void gender;
    }
  } catch (e) {
    warnings.push(`Demographics unavailable: ${(e as Error).message}`);
  }

  // ---- retention for the most recent video (curve sample) ----
  try {
    const latest = videoIds[0];
    if (latest) {
      const start = isoDaysAgo(days);
      const ret = await jsonFetch<{ rows?: unknown[][] }>(
        `https://youtubeanalytics.googleapis.com/v2/reports?ids=channel%3D%3DMINE&startDate=${start}&endDate=${todayIso()}` +
          `&metrics=audienceWatchRatio,relativeRetentionPolicyPerformance&dimensions=elapsedVideoTimeRatio&filters=video==${latest}`,
        { headers: auth }
      );
      const curve: RetentionPoint[] = (ret.rows ?? []).map((r) => {
        const [ratio, watchRatio] = r as [number, number];
        // NOTE: `seconds` is actually a 0..1 ratio of video duration (elapsedVideoTimeRatio),
        // NOT actual seconds. Consumers should multiply by video duration for real timestamps.
        // Kept as `seconds` for backwards compatibility with RetentionPoint type.
        return { seconds: ratio, ratio: watchRatio };
      });
      if (curve.length && snap.videos[0]) snap.videos[0].metrics.retention = curve;
    }
  } catch (e) {
    warnings.push(`Retention unavailable: ${(e as Error).message}`);
  }

  return snap;
}

function isoDaysAgo(n: number): string {
  return new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10);
}
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
