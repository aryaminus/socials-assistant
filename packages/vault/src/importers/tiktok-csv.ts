import { readFileSync } from "node:fs";
import { safeNumber, snakeCase, hmsToSeconds, type NormalizedSnapshot, type Platform } from "@socials/shared";

/**
 * TikTok Studio CSV importer.
 *
 * TikTok never exposes retention/traffic/follower-hour data via official APIs —
 * the only compliant path is the creator's own export from TikTok Studio
 * (Analytics → Export data, or per-video "Download data"). This importer
 * understands the common export shapes:
 *
 *  - video_stats : "Date, Video title, Video post time, Video ID, Views, Watch time (minutes),
 *                   Average watch time, Reach, Likes, Comments, Shares, Saves, ..."
 *  - follower    : "Date, Followers, Total followers"
 *  - profile     : "Date, Profile views" (+ variants)
 *  - unknown     : rows are snake_cased and preserved as extras so nothing is lost
 *
 * Header names drift between Studio versions and locales; we match on fuzzy
 * header keywords and keep every unmapped column in `extras`.
 */

export type TiktokCsvKind = "video_stats" | "follower" | "profile" | "unknown";

export interface TiktokCsvImportResult {
  kind: TiktokCsvKind;
  rows: number;
  videos?: number;
  dailyMetrics?: number;
  snapshot: NormalizedSnapshot;
  unmappedHeaders: string[];
}

// ---------- CSV parsing ----------

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const s = text.replace(/^\uFEFF/, ""); // strip BOM
  while (i < s.length) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (c === "\r") {
      i++;
      continue;
    }
    if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

// ---------- kind detection & header mapping ----------

const HAS = (headers: string[], ...needles: string[]) => needles.some((n) => headers.includes(n));

export function detectTiktokCsvKind(headers: string[]): TiktokCsvKind {
  if (HAS(headers, "video_id") || HAS(headers, "video_title")) return "video_stats";
  if (HAS(headers, "total_followers") || HAS(headers, "followers")) return "follower";
  if (HAS(headers, "profile_views") || HAS(headers, "profile_total_views")) return "profile";
  return "unknown";
}

/** Map a snake_cased TikTok export header to a canonical metric field. */
function mapVideoHeader(h: string): string | null {
  if (h === "views" || h.endsWith("_views") || h === "video_views") return "views";
  if (h.includes("watch_time") && h.includes("minute")) return "watchTimeMinutes";
  if (h === "average_watch_time" || h === "avg_watch_time") return "avgWatchSeconds";
  if (h.includes("average_watch")) return "avgWatchSeconds";
  if (h === "reach") return "reach";
  if (h === "likes" || h.startsWith("total_likes")) return "likes";
  if (h === "comments" || h.startsWith("total_comments")) return "comments";
  if (h === "shares" || h.startsWith("total_shares")) return "shares";
  if (h === "saves" || h.startsWith("total_saves") || h.includes("favorite")) return "saves";
  if (h.includes("watch_time")) return "watchTimeSecondsRaw"; // seconds variant
  return null;
}

function parseTiktokDatetime(v: string | undefined): string | undefined {
  if (!v) return undefined;
  // Studio formats: "2026-08-14 18:30", "2026-08-14 18:30:45", "8/14/2026, 6:30 PM"
  const iso = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::(\d{2}))?$/.exec(v.trim());
  if (iso) return `${iso[1]}T${iso[2]}:${iso[3] ?? "00"}.000Z`.replace(/Z$/, "Z");
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s*(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(v.trim());
  if (us) {
    let hh = Number(us[4]) % 12;
    if (us[6].toUpperCase() === "PM") hh += 12;
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${us[3]}-${pad(Number(us[1]))}-${pad(Number(us[2]))}T${pad(hh)}:${us[5]}:00.000Z`;
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

// ---------- main entry ----------

export function importTiktokCsv(textOrPath: string, opts: { fromFile?: boolean } = {}): TiktokCsvImportResult {
  const text = opts.fromFile ? readFileSync(textOrPath, "utf8") : textOrPath;
  const table = parseCsv(text);
  if (table.length < 2) throw new Error("CSV appears empty (need a header row + at least one data row)");

  const rawHeaders = table[0].map((h) => h.trim());
  const headers = rawHeaders.map(snakeCase);
  const kind = detectTiktokCsvKind(headers);
  const takenAt = new Date().toISOString();

  const rows: Array<Record<string, string>> = table.slice(1).map((cells) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => (obj[h] = (cells[idx] ?? "").trim()));
    return obj;
  });

  const snap: NormalizedSnapshot = {
    platform: "tiktok" as Platform,
    takenAt,
    lifetime: [],
    daily: [],
    videos: [],
    audience: [],
    warnings: [],
  };

  const unmapped = new Set<string>();
  let dailyCount = 0;

  if (kind === "video_stats") {
    // Keep only the most recent row per video (exports may contain daily rows per video)
    const byVideo = new Map<string, Record<string, string>>();
    for (const r of rows) {
      const id = r.video_id || `${r.video_title}__${r.video_post_time ?? ""}`;
      const prev = byVideo.get(id);
      if (!prev || (r.date ?? "") >= (prev.date ?? "")) byVideo.set(id, r);
    }
    for (const r of byVideo.values()) {
      const metrics: Record<string, number | undefined> = {};
      const extras: Record<string, unknown> = {};
      let avgWatchRaw: string | undefined;
      for (const [h, v] of Object.entries(r)) {
        if (["date", "video_title", "video_post_time", "video_id", "video_link", "video_duration"].includes(h)) continue;
        const canonical = mapVideoHeader(h);
        const num = safeNumber(v);
        if (canonical === "avgWatchSeconds" && v.includes(":")) avgWatchRaw = v;
        if (canonical && num !== undefined) metrics[canonical] = num;
        else if (h === "average_watch_time" && avgWatchRaw) metrics.avgWatchSeconds = hmsToSeconds(avgWatchRaw);
        else if (num !== undefined && canonical) metrics[canonical] = num;
        else extras[h] = v;
        if (!canonical) unmapped.add(h);
      }
      if (avgWatchRaw && metrics.avgWatchSeconds === undefined) metrics.avgWatchSeconds = hmsToSeconds(avgWatchRaw);
      if (metrics.watchTimeSecondsRaw !== undefined) {
        metrics.watchTimeMinutes = metrics.watchTimeSecondsRaw / 60;
        delete metrics.watchTimeSecondsRaw;
      }
      snap.videos.push({
        platform: "tiktok",
        platformVideoId: r.video_id || `csv-${snakeCase(r.video_title).slice(0, 48)}`,
        title: r.video_title || "Untitled",
        url: r.video_link || undefined,
        publishedAt: parseTiktokDatetime(r.video_post_time),
        kind: "video",
        metrics: metrics as never,
        extras: Object.keys(extras).length ? extras : undefined,
      });
    }
  } else if (kind === "follower" || kind === "profile") {
    for (const r of rows) {
      const date = /^\d{4}-\d{2}-\d{2}/.test(r.date ?? "") ? (r.date as string).slice(0, 10) : parseTiktokDatetime(r.date)?.slice(0, 10);
      if (!date) continue;
      for (const [h, v] of Object.entries(r)) {
        if (h === "date") continue;
        const num = safeNumber(v);
        if (num === undefined) {
          unmapped.add(h);
          continue;
        }
        const metric = h === "followers" ? "followers_gained" : h === "total_followers" ? "followers" : h;
        snap.daily.push({ date, metric, value: num });
        dailyCount++;
      }
    }
  } else {
    // unknown shape: preserve everything as extras on the snapshot + count rows
    snap.warnings.push(
      `Unrecognized TikTok CSV shape (headers: ${rawHeaders.join(", ")}). Rows preserved raw in extras.`
    );
    for (const r of rows) {
      snap.videos.push({
        platform: "tiktok",
        platformVideoId: `csv-raw-${Math.random().toString(36).slice(2, 10)}`,
        title: r[Object.keys(r)[0] ?? ""] || "Unknown row",
        metrics: {},
        extras: r,
      });
    }
  }

  return {
    kind,
    rows: rows.length,
    videos: snap.videos.length,
    dailyMetrics: dailyCount,
    snapshot: snap,
    unmappedHeaders: [...unmapped],
  };
}
