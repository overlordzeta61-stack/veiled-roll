/**
 * Pure conversion between an EventBlock and the editor's "roll cards".
 *
 * The stored block keeps its historical shape (selectors pointing at branches),
 * but the GM never sees that indirection any more: the single-page editor shows
 * one self-contained card per roll, holding its tiers and its personal
 * responses. Each card maps to exactly one selector and one branch on save.
 * No Foundry dependency, so the mapping is unit-tested.
 */

import type {
  EventBlock,
  PersonalResponse,
  ResponseTier,
  RollType
} from "../types.js";
import { sanitizeHtml } from "./html-sanitizer.js";

/** A function that produces a fresh unique id (injected for testability). */
export type IdFactory = () => string;

/** One roll as edited in the single-page editor. */
export interface RollCard {
  /** Branch id to reuse on save, or `null` to mint a new one. */
  branchId: string | null;
  roll_type: RollType;
  key: string;
  label: string;
  tiers: ResponseTier[];
  personal: PersonalResponse[];
}

/** Build an empty tier. */
export function emptyTier(
  idFactory: IdFactory,
  minimum: number | null = null,
  maximum: number | null = null
): ResponseTier {
  return {
    id: idFactory(),
    minimum,
    maximum,
    responses: [],
    gm_note: "",
    natural_roll: "any",
    weighting: "equal"
  };
}

/**
 * The three tiers a new roll starts with (failure / partial / success), so the
 * GM only has to type the texts. Tiers left without text are dropped on save.
 */
export function defaultTiers(idFactory: IdFactory): ResponseTier[] {
  return [emptyTier(idFactory, null, 9), emptyTier(idFactory, 10, 14), emptyTier(idFactory, 15, null)];
}

/** A fresh card for a new roll. */
export function newCard(idFactory: IdFactory, rollType: RollType = "skill", key = ""): RollCard {
  return {
    branchId: null,
    roll_type: rollType,
    key,
    label: "",
    tiers: defaultTiers(idFactory),
    personal: []
  };
}

/**
 * Split a block into one card per selector. A branch shared by several
 * selectors (possible in blocks made before 2.0) is copied into each card; only
 * the first card keeps the original branch id.
 */
export function blockToCards(block: EventBlock): RollCard[] {
  const used = new Set<string>();
  return block.selectors.map((selector) => {
    const branch = block.branches.find((b) => b.id === selector.branch_id);
    const reuse = branch && !used.has(branch.id) ? branch.id : null;
    if (reuse) used.add(reuse);
    return {
      branchId: reuse,
      roll_type: selector.roll_type,
      key: selector.key,
      label: selector.label ?? "",
      tiers: structuredClone(branch?.tiers ?? []),
      personal: structuredClone(branch?.personal_responses ?? [])
    };
  });
}

/** Whether a tier carries at least one non-blank response. */
function hasText(tier: ResponseTier): boolean {
  return tier.responses.some((r) => r.trim().length > 0);
}

/**
 * Rebuild a block's selectors and branches from cards.
 *
 * Tiers without any text are dropped (the default tiers a GM did not fill), and
 * personal rows with neither a player nor a text are ignored; half-filled rows
 * are kept so validation can point at them. Narrative text is sanitized the
 * same way as on import.
 * @returns A new block; the input is not mutated.
 */
export function cardsToBlock(
  block: EventBlock,
  cards: readonly RollCard[],
  idFactory: IdFactory
): EventBlock {
  const next = structuredClone(block);
  next.selectors = [];
  next.branches = [];
  for (const card of cards) {
    const branchId = card.branchId ?? idFactory();
    const label = card.label.trim();
    next.selectors.push({
      roll_type: card.roll_type,
      key: card.key,
      label,
      branch_id: branchId
    });
    next.branches.push({
      id: branchId,
      label: label || card.key,
      roll_type: card.roll_type,
      key: card.key,
      tiers: card.tiers.filter(hasText).map((t) => ({
        ...t,
        responses: t.responses.map((r) => sanitizeHtml(r.trim())).filter((r) => r.length > 0)
      })),
      personal_responses: card.personal
        .map((p) => ({ user_id: p.user_id.trim(), response: sanitizeHtml(p.response.trim()) }))
        .filter((p) => p.user_id.length > 0 || p.response.length > 0)
    });
  }
  return next;
}
