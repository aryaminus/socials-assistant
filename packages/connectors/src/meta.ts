import { jsonFetch, pkce, waitForCallback } from "./oauth.js";
import { OAUTH_PORT, redirectUri, type PlatformAppConfig } from "./config.js";
import type { AudienceSlice, DailyMetric, LifetimeMetric, NormalizedSnapshot, VideoRecord } from "@socials/shared";

/**
 * Meta connector — Instagram *and* Facebook Page in one OAuth flow, via the
 * official Graph API. Requirements (one-time, free):
 *   - Instagram Business/Creator account linked to a Facebook Page
 *   - A Meta developer app with these OAuth scopes
 *
 * Covers: IG account insights (reach/views/followers), per-media insights
 * (plays, likes, comments, shares, saves), IG follower demographics
 * (age/gender/city/country), FB Page insights (impressions, engagement, fans).
 */

const GRAPH = "https://graph.facebook.com/v22.0";
const SCOPES = [
  "instagram_basic",
  "instagram_manage_insights",
  "pages_show_list",
  "pages_read_engagement",
  "business_management",
].join(",");

export interface MetaTokens {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  expires_at?: string; // ISO for short-lived; long-lived ~60d
}

export interface MetaIdentity {
  pageId: string;
  pageName: string;
  igUserId?: string;
  igUsername?: string;
}

export async function connectMeta(cfg: PlatformAppConfig): Promise<{ tokens: MetaTokens; identity: MetaIdentity }> {
  if (!cfg.metaAppId || !cfg.metaAppSecret) {
    throw new Error("Missing Meta app credentials. Set SOCIALS_META_APP_ID / SOCIALS_META_APP_SECRET (see docs/onboarding-meta.md).");
  }
  const { verifier } = pkce();
  const state = verifier.slice(0, 24);
  const ru = redirectUri(OAUTH_PORT);
  const authorizeUrl =
    `${GRAPH}/dialog/oauth?client_id=${encodeURIComponent(cfg.metaAppId)}&redirect_uri=${encodeURIComponent(ru)}` +
    `&response_type=code&scope=${encodeURIComponent(SCOPES)}&state=${state}`;

  console.error("[socials] Open this URL to connect Instagram + Facebook:\n" + authorizeUrl + "\n");
  const { code } = await waitForCallback({ authorizeUrl, port: OAUTH_PORT, state });

  // exchange code → short-lived, then → long-lived (~60 days, refreshable)
  const exchanged = await jsonFetch<{ access_token: string; expires_in?: number }>(
    `${GRAPH}/oauth/access_token?client_id=${encodeURIComponent(cfg.metaAppId)}&client_secret=${encodeURIComponent(cfg.metaAppSecret)}&redirect_uri=${encodeURIComponent(ru)}&code=${encodeURIComponent(code)}`,
    { method: "GET" }
  );
  const long = await jsonFetch<{ access_token: string; expires_in?: number }>(
    `${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(cfg.metaAppId)}&client_secret=${encodeURIComponent(cfg.metaAppSecret)}&fb_exchange_token=${encodeURIComponent(exchanged.access_token)}`
  );
  const tokens: MetaTokens = {
    access_token: long.access_token,
    token_type: "bearer",
    expires_in: long.expires_in,
    expires_at: long.expires_in ? new Date(Date.now() + long.expires_in * 1000).toISOString() : undefined,
  };
  const identity = await resolveIdentity(tokens.access_token);
  return { tokens, identity };
}

export async function refreshMetaToken(cfg: PlatformAppConfig, current: string): Promise<MetaTokens> {
  const long = await jsonFetch<{ access_token: string; expires_in?: number }>(
    `${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(cfg.metaAppId!)}&client_secret=${encodeURIComponent(cfg.metaAppSecret!)}&fb_exchange_token=${encodeURIComponent(current)}`
  );
  return {
    access_token: long.access_token,
    expires_in: long.expires_in,
    expires_at: long.expires_in ? new Date(Date.now() + long.expires_in * 1000).toISOString() : undefined,
  };
}

async function resolveIdentity(token: string): Promise<MetaIdentity> {
  const pages = await jsonFetch<{
    data?: Array<{
      id: string;
      name: string;
      access_token?: string;
      instagram_business_account?: { id: string; username?: string };
    }>;
  }>(`${GRAPH}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&access_token=${encodeURIComponent(token)}`);
  const page = pages.data?.find((p) => p.instagram_business_account) ?? pages.data?.[0];
  if (!page) throw new Error("No Facebook Page found. Instagram insights require a Page-linked Business/Creator account (see docs/onboarding-meta.md).");
  return {
    pageId: page.id,
    pageName: page.name,
    igUserId: page.instagram_business_account?.id,
    igUsername: page.instagram_business_account?.username,
  };
}

/** Two snapshots: instagram + facebook. Returns [] pieces that aren't available. */
export async function snapshotMeta(
  cfg: PlatformAppConfig,
  tokens: MetaTokens,
  identity: MetaIdentity,
  onTokenRefresh?: (t: MetaTokens) => void,
  days = 28
): Promise<{ instagram?: NormalizedSnapshot; facebook?: NormalizedSnapshot }> {
  let token = tokens.access_token;
  if (tokens.expires_at && new Date(tokens.expires_at).getTime() - 300_000 < Date.now()) {
    const refreshed = await refreshMetaToken(cfg, token);
    token = refreshed.access_token;
    onTokenRefresh?.(refreshed);
  }
  const out: { instagram?: NormalizedSnapshot; facebook?: NormalizedSnapshot } = {};
  const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);

  // ---------------- Instagram ----------------
  if (identity.igUserId) {
    const warnings: string[] = [];
    const ig: NormalizedSnapshot = {
      platform: "instagram",
      handle: identity.igUsername,
      displayName: identity.igUsername,
      takenAt: new Date().toISOString(),
      lifetime: [],
      daily: [],
      videos: [],
      audience: [],
      warnings,
    };
    try {
      const me = await jsonFetch<{ followers_count?: number; media_count?: number; name?: string }>(
        `${GRAPH}/${identity.igUserId}?fields=followers_count,media_count,name&access_token=${encodeURIComponent(token)}`
      );
      ig.lifetime.push({ metric: "followers", value: me.followers_count ?? 0 });
      ig.lifetime.push({ metric: "media_count", value: me.media_count ?? 0 });
    } catch (e) {
      warnings.push(`IG profile: ${(e as Error).message}`);
    }

    // account-level daily insights
    try {
      const ins = await jsonFetch<{ data?: Array<{ name: string; period: string; values: Array<{ value: number; end_time: string }> }> }>(
        `${GRAPH}/${identity.igUserId}/insights?metric=views,reach,profile_views,follower_count&period=day&since=${since}&access_token=${encodeURIComponent(token)}`
      );
      const daily: DailyMetric[] = [];
      for (const m of ins.data ?? []) {
        for (const v of m.values) {
          daily.push({ date: v.end_time.slice(0, 10), metric: m.name === "follower_count" ? "followers" : m.name, value: Number(v.value) });
        }
      }
      ig.daily = dedupeDaily(daily);
    } catch (e) {
      warnings.push(`IG account insights: ${(e as Error).message}`);
    }

    // per-media insights
    try {
      const media = await jsonFetch<{
        data?: Array<{
          id: string;
          caption?: string;
          media_type?: string;
          media_product_type?: string;
          media_url?: string;
          permalink?: string;
          timestamp?: string;
          like_count?: number;
          comments_count?: number;
        }>;
      }>(
        `${GRAPH}/${identity.igUserId}/media?fields=id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count&limit=25&access_token=${encodeURIComponent(token)}`
      );
      const videos: VideoRecord[] = [];
      for (const item of media.data ?? []) {
        const metrics: Record<string, number | undefined> = {
          likes: item.like_count,
          comments: item.comments_count,
        };
        try {
          const metricNames =
            item.media_type === "VIDEO" ? "plays,reach,saved,shares,total_interactions" : "reach,saved,shares,total_interactions";
          const mi = await jsonFetch<{ data?: Array<{ name: string; total_value?: { value?: number }; values?: Array<{ value: number }> }> }>(
            `${GRAPH}/${item.id}/insights?metric=${metricNames}&access_token=${encodeURIComponent(token)}`
          );
          for (const m of mi.data ?? []) {
            const v = m.total_value?.value ?? m.values?.[0]?.value;
            if (v !== undefined) {
              if (m.name === "plays" || m.name === "views") metrics.views = v;
              else if (m.name === "reach") metrics.reach = v;
              else if (m.name === "saved") metrics.saves = v;
              else if (m.name === "shares") metrics.shares = v;
            }
          }
        } catch {
          // per-media insights can 403 for some types — fine, keep public counts
        }
        videos.push({
          platform: "instagram",
          platformVideoId: item.id,
          title: (item.caption ?? "Untitled").slice(0, 120),
          url: item.permalink,
          publishedAt: item.timestamp,
          kind: item.media_product_type === "REELS" ? "reel" : (item.media_type?.toLowerCase() as string | undefined),
          metrics: metrics as never,
        });
      }
      ig.videos = videos;
    } catch (e) {
      warnings.push(`IG media insights: ${(e as Error).message}`);
    }

    // follower demographics — the field every other IG MCP misses
    try {
      const audience: AudienceSlice[] = [];
      for (const breakdown of ["age,gender", "city", "country"] as const) {
        const demo = await jsonFetch<{
          data?: Array<{ name: string; period: string; total_value?: { breakdowns?: Array<{ results?: Array<{ dimension_values: string[]; value: number }> }> } }>;
        }>(
          `${GRAPH}/${identity.igUserId}/insights?metric=follower_demographics&period=lifetime&breakdown=${encodeURIComponent(breakdown)}&access_token=${encodeURIComponent(token)}`
        );
        const results = demo.data?.[0]?.total_value?.breakdowns?.[0]?.results ?? [];
        const total = results.reduce((s, r) => s + r.value, 0) || 1;
        const [dim1, dim2] = breakdown.split(",");
        for (const r of results) {
          if (dim1 === "age") audience.push({ dimension: "age", key: r.dimension_values.join("/"), value: r.value / total });
          else audience.push({ dimension: dim1 === "city" ? "city" : "country", key: r.dimension_values[0], value: r.value / total });
          void dim2;
        }
      }
      ig.audience = audience;
    } catch (e) {
      warnings.push(`IG follower demographics: ${(e as Error).message}`);
    }

    out.instagram = ig;
  }

  // ---------------- Facebook Page ----------------
  {
    const warnings: string[] = [];
    const fb: NormalizedSnapshot = {
      platform: "facebook",
      displayName: identity.pageName,
      takenAt: new Date().toISOString(),
      lifetime: [],
      daily: [],
      videos: [],
      audience: [],
      warnings,
    };
    try {
      const page = await jsonFetch<{ fan_count?: number; followers_count?: number; name?: string }>(
        `${GRAPH}/${identity.pageId}?fields=fan_count,followers_count,name&access_token=${encodeURIComponent(token)}`
      );
      fb.lifetime.push({ metric: "followers", value: page.followers_count ?? page.fan_count ?? 0 });
      fb.lifetime.push({ metric: "fan_count", value: page.fan_count ?? 0 });
    } catch (e) {
      warnings.push(`FB page: ${(e as Error).message}`);
    }
    try {
      const metrics = "page_impressions,page_impressions_unique,page_post_engagements,page_engaged_users";
      const ins = await jsonFetch<{ data?: Array<{ name: string; period: string; values: Array<{ value: number; end_time: string }> }> }>(
        `${GRAPH}/${identity.pageId}/insights?metric=${metrics}&period=day&since=${since}&access_token=${encodeURIComponent(token)}`
      );
      const daily: DailyMetric[] = [];
      for (const m of ins.data ?? []) {
        for (const v of m.values) daily.push({ date: v.end_time.slice(0, 10), metric: m.name, value: Number(v.value) });
      }
      fb.daily = dedupeDaily(daily);
    } catch (e) {
      warnings.push(`FB insights: ${(e as Error).message}`);
    }
    out.facebook = fb;
  }

  return out;
}

function dedupeDaily(daily: DailyMetric[]): DailyMetric[] {
  const seen = new Map<string, DailyMetric>();
  for (const d of daily) seen.set(`${d.date}|${d.metric}`, d);
  return [...seen.values()];
}

export type { LifetimeMetric };
