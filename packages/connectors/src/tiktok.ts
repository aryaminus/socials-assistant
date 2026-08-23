import { createHash } from "node:crypto";
import { jsonFetch, pkce, waitForCallback } from "./oauth.js";
import { OAUTH_PORT, redirectUri, type PlatformAppConfig } from "./config.js";
import type { NormalizedSnapshot, VideoRecord } from "@socials/shared";

/**
 * TikTok connector — official Display API only (OAuth v2 + PKCE):
 *   - user info + stats (follower_count, likes_count, video_count)
 *   - video.list with engagement counts (views, likes, comments, shares)
 *
 * IMPORTANT — what official APIs can NEVER give (Studio-only, by design):
 *   retention curves, traffic sources (FYP vs search vs profile), search terms,
 *   follower demographics, followers-by-hour. Those come from the creator's
 *   weekly TikTok Studio CSV export via `import_tiktok_csv`.
 * We deliberately do not scrape or automate the logged-in Studio session
 * (TikTok ToS prohibits automated access; account risk).
 */

export interface TiktokTokens {
  access_token: string;
  refresh_token?: string;
  open_id: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  expires_at?: string;
}

const SCOPES = ["user.info.basic", "user.info.stats", "video.list"].join(",");

export async function connectTiktok(cfg: PlatformAppConfig): Promise<{ tokens: TiktokTokens; user: TiktokUser }> {
  if (!cfg.tiktokClientKey || !cfg.tiktokClientSecret) {
    throw new Error("Missing TikTok app credentials. Set SOCIALS_TIKTOK_CLIENT_KEY / SOCIALS_TIKTOK_CLIENT_SECRET (see docs/onboarding-tiktok.md).");
  }
  const { verifier, challenge } = pkce();
  const state = createHash("sha256").update(verifier).digest("hex").slice(0, 24);
  const ru = redirectUri(OAUTH_PORT);
  const authorizeUrl =
    `https://www.tiktok.com/v2/auth/authorize/?client_key=${encodeURIComponent(cfg.tiktokClientKey)}` +
    `&scope=${encodeURIComponent(SCOPES)}&response_type=code&redirect_uri=${encodeURIComponent(ru)}` +
    `&state=${state}&code_challenge=${challenge}&code_challenge_method=S256`;

  console.error("[socials] Open this URL to connect TikTok:\n" + authorizeUrl + "\n");
  const { code } = await waitForCallback({ authorizeUrl, port: OAUTH_PORT, state });

  const tokens = await jsonFetch<TiktokTokens>("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: cfg.tiktokClientKey,
      client_secret: cfg.tiktokClientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: ru,
      code_verifier: verifier,
    }).toString(),
  });
  tokens.expires_at = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    : undefined;

  const user = await fetchUserInfo(tokens.access_token, tokens.open_id);
  return { tokens, user };
}

export interface TiktokUser {
  open_id: string;
  display_name?: string;
  username?: string;
  follower_count?: number;
  following_count?: number;
  likes_count?: number;
  video_count?: number;
}

async function fetchUserInfo(accessToken: string, expectOpenId: string): Promise<TiktokUser> {
  const res = await jsonFetch<{
    data?: {
      user?: {
        open_id: string;
        display_name?: string;
        username?: string;
        follower_count?: number;
        following_count?: number;
        likes_count?: number;
        video_count?: number;
      };
    };
  }>(
    `https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,username,follower_count,following_count,likes_count,video_count`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const u = res.data?.user;
  if (!u) throw new Error("TikTok user info empty (did you grant user.info scopes?).");
  return { ...u, open_id: u.open_id || expectOpenId };
}

export async function refreshTiktok(cfg: PlatformAppConfig, refreshToken: string): Promise<TiktokTokens> {
  const t = await jsonFetch<TiktokTokens>("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: cfg.tiktokClientKey!,
      client_secret: cfg.tiktokClientSecret!,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }).toString(),
  });
  return {
    ...t,
    refresh_token: t.refresh_token ?? refreshToken,
    expires_at: t.expires_in ? new Date(Date.now() + t.expires_in * 1000).toISOString() : undefined,
  };
}

export async function snapshotTiktok(
  cfg: PlatformAppConfig,
  tokens: TiktokTokens,
  onTokenRefresh?: (t: TiktokTokens) => void,
  maxVideos = 20
): Promise<NormalizedSnapshot> {
  let at = tokens.access_token;
  if (!tokens.expires_at || new Date(tokens.expires_at).getTime() - 60_000 < Date.now()) {
    if (!tokens.refresh_token) throw new Error("TikTok token expired and no refresh token stored — re-connect.");
    const refreshed = await refreshTiktok(cfg, tokens.refresh_token);
    at = refreshed.access_token;
    onTokenRefresh?.(refreshed);
  }

  const warnings: string[] = [];
  const snap: NormalizedSnapshot = {
    platform: "tiktok",
    takenAt: new Date().toISOString(),
    lifetime: [],
    daily: [],
    videos: [],
    audience: [],
    warnings,
  };

  const user = await fetchUserInfo(at, tokens.open_id);
  snap.displayName = user.display_name;
  snap.handle = user.username;
  snap.lifetime.push(
    { metric: "followers", value: user.follower_count ?? 0 },
    { metric: "following", value: user.following_count ?? 0 },
    { metric: "likes", value: user.likes_count ?? 0 },
    { metric: "video_count", value: user.video_count ?? 0 }
  );

  // video.list returns most recent videos with stats
  try {
    const res = await jsonFetch<{
      data?: { videos?: Array<TiktokVideo> };
      error?: { code?: string; message?: string };
    }>("https://open.tiktokapis.com/v2/video/list/", {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${at}` },
      body: JSON.stringify({
        fields: ["id", "title", "video_description", "create_time", "share_url", "like_count", "comment_count", "share_count", "view_count"],
        max_count: Math.min(maxVideos, 20),
      }),
    });
    if (res.error?.code && res.error.code !== "ok") warnings.push(`TikTok video.list: ${res.error.code} ${res.error.message ?? ""}`);
    const videos: VideoRecord[] = (res.data?.videos ?? []).map((v) => ({
      platform: "tiktok",
      platformVideoId: String(v.id),
      title: (v.title || v.video_description || "Untitled").slice(0, 160),
      url: v.share_url,
      publishedAt: v.create_time ? new Date(v.create_time * 1000).toISOString() : undefined,
      kind: "video",
      metrics: {
        views: v.view_count ?? undefined,
        likes: v.like_count ?? undefined,
        comments: v.comment_count ?? undefined,
        shares: v.share_count ?? undefined,
      },
    }));
    snap.videos = videos;
  } catch (e) {
    warnings.push(`TikTok video list unavailable (app may need video.list scope approved): ${(e as Error).message}`);
  }

  warnings.push(
    "Studio-only metrics (retention, traffic sources, search terms, follower demographics) are NOT in TikTok's API — import weekly Studio CSV exports via import_tiktok_csv."
  );

  return snap;
}

interface TiktokVideo {
  id: number | string;
  title?: string;
  video_description?: string;
  create_time?: number;
  share_url?: string;
  like_count?: number;
  comment_count?: number;
  share_count?: number;
  view_count?: number;
}
