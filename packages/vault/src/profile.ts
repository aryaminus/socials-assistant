import type { Vault } from "./db.js";

/**
 * Creator profile — the per-installation tuning that makes the generic system
 * fit one specific creator. Stored as JSON in vault meta. Everything is
 * optional; skills auto-fill what they can from vault data and ask the human
 * only for what data can't answer (niche, tone, goals, rate floor).
 */

export interface CreatorProfile {
  name?: string;
  niche?: string;                    // e.g. "cooking short-form" — free text
  tone_notes?: string;               // voice/style the agent should match
  content_series?: Array<{ name: string; note?: string }>;
  audience_summary?: string;         // auto-derivable from audience_overview
  brand_categories?: string[];       // categories that fit (auto-suggested, human confirms)
  past_collaborations?: Array<{ brand: string; note?: string }>;
  rate_floor?: number;               // never go below this in negotiations
  goals?: string[];                  // e.g. "3 paid collabs per quarter"
  keywords?: string[];               // SEO seeds for titles/captions (script-review, publish-package)
  updated_at?: string;
}

const KEY = "creator_profile";

export function getProfile(vault: Vault): CreatorProfile {
  const raw = vault.metaGet(KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as CreatorProfile;
  } catch {
    return {};
  }
}

/** Deep-merge partial updates into the stored profile. */
export function setProfile(vault: Vault, patch: CreatorProfile): CreatorProfile {
  const current = getProfile(vault);
  const merged: CreatorProfile = { ...current };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined) continue;
    (merged as Record<string, unknown>)[k] = v;
  }
  merged.updated_at = new Date().toISOString();
  vault.metaSet(KEY, JSON.stringify(merged));
  return merged;
}

// ---------------- content pipeline ----------------

export type PipelineStage =
  | "idea" | "scripting" | "script_review" | "brand_review"
  | "approved" | "posted" | "measured" | "on_hold" | "dropped";

export const PIPELINE_STAGES: PipelineStage[] = [
  "idea", "scripting", "script_review", "brand_review",
  "approved", "posted", "measured", "on_hold", "dropped",
];

export interface PipelineItem {
  id: number;
  title: string;
  platform: string | null;
  brand: string | null;
  outreach_id: number | null;
  stage: string;
  due_date: string | null;
  script_path: string | null;
  post_url: string | null;
  posted_at: string | null;
  brief: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export function pipelineAdd(
  vault: Vault,
  input: { title: string; platform?: string; brand?: string; outreach_id?: number; stage?: PipelineStage; due_date?: string; script_path?: string; brief?: string; notes?: string }
): PipelineItem {
  const now = new Date().toISOString();
  const valid = input.stage && PIPELINE_STAGES.includes(input.stage) ? input.stage : "idea";
  const r = vault.db
    .prepare(
      `INSERT INTO content_pipeline (title, platform, brand, outreach_id, stage, due_date, script_path, brief, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(input.title, input.platform ?? null, input.brand ?? null, input.outreach_id ?? null, valid, input.due_date ?? null, input.script_path ?? null, input.brief ?? null, input.notes ?? null, now, now);
  return pipelineGet(vault, Number(r.lastInsertRowid))!;
}

export function pipelineGet(vault: Vault, id: number): PipelineItem | undefined {
  return vault.db.prepare("SELECT * FROM content_pipeline WHERE id = ?").get(id) as unknown as PipelineItem | undefined;
}

export function pipelineList(vault: Vault, stage?: string): PipelineItem[] {
  const sql = stage
    ? "SELECT * FROM content_pipeline WHERE stage = ? ORDER BY due_date IS NULL, due_date, id DESC"
    : "SELECT * FROM content_pipeline ORDER BY due_date IS NULL, due_date, id DESC";
  const stmt = stage ? vault.db.prepare(sql).all(stage) : vault.db.prepare(sql).all();
  return stmt as unknown as PipelineItem[];
}

export function pipelineUpdate(
  vault: Vault,
  id: number,
  patch: { stage?: PipelineStage; due_date?: string; script_path?: string; post_url?: string; posted_at?: string; brief?: string; notes?: string; brand?: string }
): PipelineItem | undefined {
  const cur = pipelineGet(vault, id);
  if (!cur) return undefined;
  if (patch.stage && !PIPELINE_STAGES.includes(patch.stage)) throw new Error(`Invalid stage '${patch.stage}'. Valid: ${PIPELINE_STAGES.join(", ")}`);
  const postedAt = patch.stage === "posted" ? (patch.posted_at ?? new Date().toISOString()) : (patch.posted_at ?? null);
  vault.db
    .prepare(
      `UPDATE content_pipeline SET
         stage = coalesce(?, stage), due_date = coalesce(?, due_date), script_path = coalesce(?, script_path),
         post_url = coalesce(?, post_url), posted_at = coalesce(?, posted_at),
         brief = coalesce(?, brief), notes = coalesce(?, notes), brand = coalesce(?, brand),
         updated_at = ?
       WHERE id = ?`
    )
    .run(patch.stage ?? null, patch.due_date ?? null, patch.script_path ?? null, patch.post_url ?? null, postedAt, patch.brief ?? null, patch.notes ?? null, patch.brand ?? null, new Date().toISOString(), id);
  return pipelineGet(vault, id);
}
