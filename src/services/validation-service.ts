/**
 * Pure business validation for event blocks.
 *
 * Validation is separated from Foundry so it can run identically in the editor,
 * on import, and in unit tests. It returns structured issues (with i18n keys)
 * rather than throwing, so the UI can render each problem next to its field.
 */

import type {
  EventBlock,
  ResolutionMode,
  ResponseBranch,
  RollType,
  ValidationIssue,
  ValidationResult
} from "../types.js";
import { containsDangerousHtml } from "./html-sanitizer.js";
import { SCHEMA_VERSION } from "../constants.js";

/** Known D&D5e skill keys. */
export const KNOWN_SKILL_KEYS = new Set([
  "acr", "ani", "arc", "ath", "dec", "his", "ins", "itm", "inv",
  "med", "nat", "prc", "prf", "per", "rel", "slt", "ste", "sur"
]);

/** Known D&D5e ability keys (used for ability checks and saving throws). */
export const KNOWN_ABILITY_KEYS = new Set([
  "str", "dex", "con", "int", "wis", "cha"
]);

/** Whether a key is valid for a given roll type. */
export function isKnownKey(rollType: RollType, key: string): boolean {
  if (rollType === "skill") return KNOWN_SKILL_KEYS.has(key);
  return KNOWN_ABILITY_KEYS.has(key);
}

/**
 * Detect overlapping ranges among a branch's tiers (exclusive-range mode only).
 * Open bounds are treated as ±Infinity. Tiers that carry a natural-roll
 * constraint are excluded from the overlap check because they are conditional.
 */
function hasOverlappingRanges(branch: ResponseBranch): boolean {
  const ranges = branch.tiers
    .filter((t) => t.natural_roll === "any")
    .map((t) => ({
      min: t.minimum ?? Number.NEGATIVE_INFINITY,
      max: t.maximum ?? Number.POSITIVE_INFINITY
    }))
    .sort((a, b) => a.min - b.min);

  for (let i = 1; i < ranges.length; i++) {
    if (ranges[i].min <= ranges[i - 1].max) return true;
  }
  return false;
}

/**
 * Validate an event block against every MVP rule.
 * @param block The block to check.
 * @returns A structured result listing every issue found.
 */
export function validateBlock(block: EventBlock): ValidationResult {
  const errors: ValidationIssue[] = [];

  if (!block.name || block.name.trim().length === 0) {
    errors.push({ path: "name", messageKey: "VEILED_ROLLS.Validation.NameRequired" });
  }

  if (!Array.isArray(block.selectors) || block.selectors.length === 0) {
    errors.push({ path: "selectors", messageKey: "VEILED_ROLLS.Validation.SelectorRequired" });
  }

  const branchIds = new Set((block.branches ?? []).map((b) => b.id));

  (block.selectors ?? []).forEach((selector, index) => {
    if (!branchIds.has(selector.branch_id)) {
      errors.push({
        path: `selectors.${index}.branch_id`,
        messageKey: "VEILED_ROLLS.Validation.BranchMissing",
        data: { branch: selector.branch_id }
      });
    }
    if (!isKnownKey(selector.roll_type, selector.key)) {
      errors.push({
        path: `selectors.${index}.key`,
        messageKey: "VEILED_ROLLS.Validation.UnknownKey",
        data: { key: selector.key, type: selector.roll_type }
      });
    }
  });

  (block.branches ?? []).forEach((branch, bIndex) => {
    const personal = branch.personal_responses ?? [];
    // A roll answered only by personal responses is allowed: everyone else then
    // gets the fallback response (or nothing).
    if ((!Array.isArray(branch.tiers) || branch.tiers.length === 0) && personal.length === 0) {
      errors.push({
        path: `branches.${bIndex}.tiers`,
        messageKey: "VEILED_ROLLS.Validation.TierRequired",
        data: { branch: branch.label ?? branch.id }
      });
    }

    (branch.tiers ?? []).forEach((tier, tIndex) => {
      const nonEmpty = (tier.responses ?? []).filter((r) => r.trim().length > 0);
      if (nonEmpty.length === 0) {
        errors.push({
          path: `branches.${bIndex}.tiers.${tIndex}.responses`,
          messageKey: "VEILED_ROLLS.Validation.EmptyResponse"
        });
      }
      for (const response of tier.responses ?? []) {
        if (containsDangerousHtml(response)) {
          errors.push({
            path: `branches.${bIndex}.tiers.${tIndex}.responses`,
            messageKey: "VEILED_ROLLS.Validation.DangerousHtml"
          });
          break;
        }
      }
    });

    const seenUsers = new Set<string>();
    personal.forEach((entry, pIndex) => {
      const path = `branches.${bIndex}.personal_responses.${pIndex}`;
      if (!entry.user_id) {
        errors.push({ path, messageKey: "VEILED_ROLLS.Validation.PersonalUserRequired" });
      } else if (seenUsers.has(entry.user_id)) {
        errors.push({ path, messageKey: "VEILED_ROLLS.Validation.PersonalDuplicate" });
      }
      seenUsers.add(entry.user_id);
      if (!entry.response || entry.response.trim().length === 0) {
        errors.push({ path, messageKey: "VEILED_ROLLS.Validation.PersonalEmpty" });
      } else if (containsDangerousHtml(entry.response)) {
        errors.push({ path, messageKey: "VEILED_ROLLS.Validation.DangerousHtml" });
      }
    });

    if (block.mode === "exclusive_range" && hasOverlappingRanges(branch)) {
      errors.push({
        path: `branches.${bIndex}.tiers`,
        messageKey: "VEILED_ROLLS.Validation.OverlappingRanges",
        data: { branch: branch.label ?? branch.id }
      });
    }
  });

  return { valid: errors.length === 0, errors };
}

/** Allowed resolution modes, for import validation. */
const VALID_MODES: ResolutionMode[] = ["exclusive_range", "cumulative_threshold"];

/**
 * Validate the top-level shape of a parsed import payload before trusting it.
 * @param payload An already `JSON.parse`d, untrusted value.
 * @returns A result; when valid, callers may proceed to per-block validation.
 */
export function validateImportShape(payload: unknown): ValidationResult {
  const errors: ValidationIssue[] = [];
  if (typeof payload !== "object" || payload === null) {
    errors.push({ path: "", messageKey: "VEILED_ROLLS.Import.Malformed" });
    return { valid: false, errors };
  }
  const record = payload as Record<string, unknown>;
  if (typeof record.schema_version !== "number") {
    errors.push({ path: "schema_version", messageKey: "VEILED_ROLLS.Import.MissingVersion" });
  } else if (record.schema_version > SCHEMA_VERSION) {
    errors.push({
      path: "schema_version",
      messageKey: "VEILED_ROLLS.Import.UnsupportedVersion",
      data: { found: record.schema_version, supported: SCHEMA_VERSION }
    });
  }
  if (!Array.isArray(record.blocks)) {
    errors.push({ path: "blocks", messageKey: "VEILED_ROLLS.Import.NoBlocks" });
  }
  return { valid: errors.length === 0, errors };
}

/** Whether a raw string names a supported resolution mode. */
export function isValidMode(mode: unknown): mode is ResolutionMode {
  return typeof mode === "string" && VALID_MODES.includes(mode as ResolutionMode);
}
