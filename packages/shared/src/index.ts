/** Platforms supported by the vault. */
export type Platform = "youtube" | "instagram" | "facebook" | "tiktok";

export const PLATFORMS: Platform[] = ["youtube", "instagram", "facebook", "tiktok"];

export function isPlatform(x: string): x is Platform {
  return (PLATFORMS as string[]).includes(x);
}

/** A normalized video/post record, platform-agnostic. */
export interface VideoRecord {
  platform: Platform;
  platformVideoId: string;
  title: string;
  url?: string;
  publishedAt?: string; // ISO
  kind?: string; // "video" | "short" | "reel" | "post" | "carousel"
  metrics: VideoMetrics;
  /** Free-form platform extras (e.g. TikTok hashtags, YT traffic source breakdown). */
  extras?: Record<string, unknown>;
}

/** Metrics captured at a point in time for one video. `undefined` = not available. */
export interface VideoMetrics {
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  reach?: number;
  /** Average watch time per view, in seconds. */
  avgWatchSeconds?: number;
  /** Total watch time in minutes (TikTok CSV reports minutes). */
  watchTimeMinutes?: number;
  /** 0–100 normalized retention curve buckets, if available: [{secondsElapsed, ratio}] */
  retention?: RetentionPoint[];
  /** Traffic source breakdown, if available: { "for_you": 0.62, "search": 0.11, ... } */
  trafficSources?: Record<string, number>;
}

export interface RetentionPoint {
  /** Seconds (or fraction of duration for YT elapsedVideoTimeRatio * duration) */
  seconds: number;
  /** 0..1 fraction of viewers still watching */
  ratio: number;
}

/** One audience slice, e.g. dimension="country" key="Exampleland" value=0.68 */
export interface AudienceSlice {
  dimension: string; // age | gender | country | city | source | hour
  key: string;
  /** Fraction of audience (0..1) or absolute count depending on metric — we store fractions. */
  value: number;
}

/** Account-level daily metric, e.g. date=2026-08-20 metric="followers" value=1234 */
export interface DailyMetric {
  date: string; // YYYY-MM-DD
  metric: string;
  value: number;
}

/** Account-level lifetime/cumulative metric at snapshot time. */
export interface LifetimeMetric {
  metric: string;
  value: number;
}

/** Everything one platform snapshot yields, already normalized. */
export interface NormalizedSnapshot {
  platform: Platform;
  handle?: string;
  displayName?: string;
  takenAt: string; // ISO
  lifetime: LifetimeMetric[];
  daily: DailyMetric[];
  videos: VideoRecord[];
  audience: AudienceSlice[];
  /** Non-fatal issues (quota, missing permissions, partial data). */
  warnings: string[];
}

export interface AccountStatus {
  platform: Platform;
  handle?: string;
  connectedAt?: string;
  tokenExpiresAt?: string;
  ok: boolean;
  issue?: string;
}

/** Engagement rate = (likes + comments + shares) / views, as 0..1 */
export function engagementRate(m: VideoMetrics): number | undefined {
  const l = m.likes ?? NaN,
    c = m.comments ?? NaN,
    s = m.shares ?? NaN;
  if (!m.views || [l, c, s].some(Number.isNaN)) return undefined;
  return (l + c + s) / m.views;
}

/** Percent change between two numbers; undefined when prior is 0. */
export function pctChange(current: number, prior: number): number | undefined {
  if (prior === 0) return undefined;
  return (current - prior) / prior;
}

export function snakeCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function safeNumber(v: unknown): number | undefined {
  if (v === null || v === undefined) return undefined;
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "string") {
    const cleaned = v.replace(/[, %]/g, "").trim();
    if (cleaned === "" || cleaned === "-" || cleaned === "—") return undefined;
    // durations like "0:42" or "1:03:22" → seconds
    if (/^\d+:\d{1,2}(:\d{2})?$/.test(cleaned)) return hmsToSeconds(cleaned);
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

export function hmsToSeconds(s: string): number {
  const parts = s.split(":").map(Number);
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

export function isoDate(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function daysAgoISO(n: number): string {
  const d = new Date(Date.now() - n * 86400_000);
  return isoDate(d);
}

export function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

export function mean(xs: number[]): number | undefined {
  return xs.length ? sum(xs) / xs.length : undefined;
}

/** ISO week label like 2026-W34 */
export function isoWeekLabel(d: Date = new Date()): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}
