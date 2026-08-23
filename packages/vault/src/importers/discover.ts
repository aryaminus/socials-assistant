import { readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

/**
 * Auto-discover the newest TikTok Studio CSV export so the weekly import is
 * one command instead of a path hunt. Scans common drop locations and picks
 * the most recently modified file that looks like a TikTok export.
 *
 * Looks like = name hints (tiktok/video/follower) OR csv content sniff
 * (handled by the importer's kind detection — here we only rank candidates).
 */

const NAME_HINTS = [/tiktok/i, /tik tok/i, /^video/i, /follower/i, /profile.*view/i, /analytics/i];

export function discoverTiktokCsv(extraDirs: string[] = [], opts: { skipDefaults?: boolean } = {}): string | undefined {
  const dirs = [
    ...extraDirs,
    ...(opts.skipDefaults
      ? []
      : [process.env.SOCIALS_CSV_DIR, join(homedir(), "Downloads"), join(homedir(), "Downloads", "tiktok"), process.cwd()]),
  ].filter((d): d is string => !!d && existsSync(d));

  const candidates: Array<{ path: string; mtime: number; score: number }> = [];
  const seen = new Set<string>();
  for (const dir of [...new Set(dirs)]) {
    if (seen.has(dir)) continue;
    seen.add(dir);
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.toLowerCase().endsWith(".csv")) continue;
      const full = join(dir, entry);
      try {
        const st = statSync(full);
        if (!st.isFile()) continue;
        const nameScore = NAME_HINTS.some((re) => re.test(entry)) ? 1 : 0;
        candidates.push({ path: full, mtime: st.mtimeMs, score: nameScore });
      } catch {
        continue;
      }
    }
  }

  if (!candidates.length) return undefined;
  // Prefer name-matched files among those modified in the last 14 days; else newest.
  const fresh = candidates.filter((c) => Date.now() - c.mtime < 14 * 86400_000);
  const pool = fresh.length ? fresh : candidates;
  const named = pool.filter((c) => c.score === 1);
  const ranked = (named.length ? named : pool).sort((a, b) => b.mtime - a.mtime);
  return ranked[0].path;
}
