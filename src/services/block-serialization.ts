/**
 * Pure serialization helpers for exporting and importing event blocks.
 *
 * Imported JSON is treated strictly as data: it is parsed with `JSON.parse`
 * (never `eval`), re-shaped field by field into a clean `EventBlock`, and every
 * narrative string is passed through the sanitizer. This drops unknown fields
 * and neutralises any executable-looking content before it can reach storage.
 */

import { SCHEMA_VERSION } from "../constants.js";
import type {
  BlockExport,
  EventBlock,
  EventBlockOptions,
  ImportConflictStrategy,
  PersonalResponse,
  ResolutionMode,
  ResponseBranch,
  ResponseTier,
  RollSelector,
  RollType
} from "../types.js";
import { sanitizeHtml } from "./html-sanitizer.js";

/** A function that produces a fresh unique id (injected for testability). */
export type IdFactory = () => string;

/** Wrap blocks in a versioned export envelope. */
export function exportBlocks(blocks: EventBlock[], nowIso: string): BlockExport {
  return {
    schema_version: SCHEMA_VERSION,
    exported_at: nowIso,
    blocks: structuredClone(blocks)
  };
}

/** Coerce an unknown value into a finite number or `null`. */
function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Coerce an unknown value into a plain string (empty on failure). */
function toStr(value: unknown): string {
  return typeof value === "string" ? value : "";
}

const VALID_ROLL_TYPES: RollType[] = ["skill", "ability_check", "saving_throw"];

/** Re-shape one raw tier into a clean, sanitized `ResponseTier`. */
function coerceTier(raw: unknown, idFactory: IdFactory): ResponseTier {
  const r = (raw ?? {}) as Record<string, unknown>;
  const responses = Array.isArray(r.responses)
    ? r.responses.map((x) => sanitizeHtml(toStr(x))).filter((x) => x.length > 0)
    : [];
  const natural = r.natural_roll === "natural_1" || r.natural_roll === "natural_20"
    ? r.natural_roll
    : "any";
  return {
    id: toStr(r.id) || idFactory(),
    minimum: toNullableNumber(r.minimum),
    maximum: toNullableNumber(r.maximum),
    responses,
    gm_note: toStr(r.gm_note),
    natural_roll: natural,
    weighting: "equal"
  };
}

/** Re-shape raw personal responses, dropping unusable entries. */
function coercePersonal(raw: unknown): PersonalResponse[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      const r = (entry ?? {}) as Record<string, unknown>;
      return { user_id: toStr(r.user_id), response: sanitizeHtml(toStr(r.response)) };
    })
    .filter((p) => p.user_id.length > 0 && p.response.trim().length > 0);
}

/** Re-shape one raw branch into a clean `ResponseBranch`. */
function coerceBranch(raw: unknown, idFactory: IdFactory): ResponseBranch {
  const r = (raw ?? {}) as Record<string, unknown>;
  const rollType = VALID_ROLL_TYPES.includes(r.roll_type as RollType)
    ? (r.roll_type as RollType)
    : "skill";
  const tiers = Array.isArray(r.tiers)
    ? r.tiers.map((t) => coerceTier(t, idFactory))
    : [];
  return {
    id: toStr(r.id) || idFactory(),
    label: toStr(r.label),
    roll_type: rollType,
    key: toStr(r.key),
    tiers,
    personal_responses: coercePersonal(r.personal_responses)
  };
}

/** Re-shape one raw selector into a clean `RollSelector`. */
function coerceSelector(raw: unknown): RollSelector {
  const r = (raw ?? {}) as Record<string, unknown>;
  const rollType = VALID_ROLL_TYPES.includes(r.roll_type as RollType)
    ? (r.roll_type as RollType)
    : "skill";
  return {
    roll_type: rollType,
    key: toStr(r.key),
    label: toStr(r.label),
    branch_id: toStr(r.branch_id)
  };
}

/** Build default options, overlaying any recognised raw values. */
function coerceOptions(raw: unknown): EventBlockOptions {
  const r = (raw ?? {}) as Record<string, unknown>;
  const bool = (v: unknown, fallback: boolean): boolean =>
    typeof v === "boolean" ? v : fallback;
  return {
    include_gm_in_whisper: bool(r.include_gm_in_whisper, true),
    show_total_to_gm: bool(r.show_total_to_gm, true),
    show_result_to_player: bool(r.show_result_to_player, true),
    color_by_tier: bool(r.color_by_tier, true),
    // Back-compat: old blocks used hide_dice_animation (true = no animation).
    dice_so_nice_mode:
      r.dice_so_nice_mode === "private" || r.dice_so_nice_mode === "disabled"
        ? r.dice_so_nice_mode
        : r.hide_dice_animation === false
          ? "private"
          : "disabled",
    duplicate_policy:
      r.duplicate_policy === "accept_all" ||
      r.duplicate_policy === "replace_previous" ||
      r.duplicate_policy === "ask_gm"
        ? r.duplicate_policy
        : "first_per_actor",
    participant_mode:
      r.participant_mode === "selected_tokens" ||
      r.participant_mode === "selected_actors" ||
      r.participant_mode === "selected_users"
        ? r.participant_mode
        : "all_players",
    participant_ids: Array.isArray(r.participant_ids)
      ? r.participant_ids.map(toStr).filter((x) => x.length > 0)
      : [],
    auto_close_mode:
      r.auto_close_mode === "after_roll_count" ||
      r.auto_close_mode === "after_each_participant"
        ? r.auto_close_mode
        : "manual",
    auto_close_roll_count: toNullableNumber(r.auto_close_roll_count),
    send_fallback_response: bool(r.send_fallback_response, true),
    fallback_response: sanitizeHtml(toStr(r.fallback_response)),
    randomize_equal_tier_responses: bool(r.randomize_equal_tier_responses, true)
  };
}

/**
 * Convert an untrusted parsed object into a clean `EventBlock`.
 * Unknown fields are dropped and all narrative strings are sanitized.
 * @param raw The untrusted, already-parsed value.
 * @param idFactory Fresh-id source for missing ids.
 * @param nowIso Timestamp for metadata defaults.
 * @param userId Foundry user id recorded as importer.
 */
export function coerceImportedBlock(
  raw: unknown,
  idFactory: IdFactory,
  nowIso: string,
  userId: string
): EventBlock {
  const r = (raw ?? {}) as Record<string, unknown>;
  const mode: ResolutionMode =
    r.mode === "cumulative_threshold" ? "cumulative_threshold" : "exclusive_range";
  const meta = (r.metadata ?? {}) as Record<string, unknown>;
  return {
    id: toStr(r.id) || idFactory(),
    name: toStr(r.name),
    folder: toStr(r.folder),
    description: toStr(r.description),
    enabled: typeof r.enabled === "boolean" ? r.enabled : true,
    mode,
    selectors: Array.isArray(r.selectors) ? r.selectors.map(coerceSelector) : [],
    branches: Array.isArray(r.branches)
      ? r.branches.map((b) => coerceBranch(b, idFactory))
      : [],
    options: coerceOptions(r.options),
    metadata: {
      created_at: toStr(meta.created_at) || nowIso,
      updated_at: nowIso,
      created_by: toStr(meta.created_by) || userId,
      schema_version: SCHEMA_VERSION
    }
  };
}

/** Summary describing how an import affected the library. */
export interface ImportSummary {
  added: number;
  replaced: number;
  skipped: number;
  duplicated: number;
}

/**
 * Merge imported blocks into an existing library according to a conflict strategy.
 * @param existing The current library.
 * @param incoming Already-coerced imported blocks.
 * @param strategy How to resolve id collisions.
 * @param idFactory Fresh-id source for the "duplicate" strategy.
 * @returns The new library plus a summary of what changed.
 */
export function applyImport(
  existing: EventBlock[],
  incoming: EventBlock[],
  strategy: ImportConflictStrategy,
  idFactory: IdFactory
): { blocks: EventBlock[]; summary: ImportSummary } {
  const result = structuredClone(existing);
  const byId = new Map(result.map((b, i) => [b.id, i]));
  const summary: ImportSummary = { added: 0, replaced: 0, skipped: 0, duplicated: 0 };

  for (const block of incoming) {
    const existsAt = byId.get(block.id);
    if (existsAt === undefined) {
      result.push(block);
      byId.set(block.id, result.length - 1);
      summary.added++;
      continue;
    }
    if (strategy === "skip") {
      summary.skipped++;
    } else if (strategy === "replace") {
      result[existsAt] = block;
      summary.replaced++;
    } else {
      const clone = { ...structuredClone(block), id: idFactory() };
      clone.name = `${clone.name} (copie)`;
      result.push(clone);
      byId.set(clone.id, result.length - 1);
      summary.duplicated++;
    }
  }

  return { blocks: result, summary };
}
