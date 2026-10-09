/**
 * Pure response-resolution logic.
 *
 * Given an event block and a validated roll context, these functions decide
 * which narrative paragraph(s) the player should receive. They are deliberately
 * free of Foundry dependencies and side effects so the privacy-critical
 * behaviour can be exhaustively unit-tested.
 */

import type {
  EventBlock,
  FilteredRollContext,
  PersonalResponse,
  RandomSource,
  ResolvedResponse,
  ResponseBranch,
  ResponseTier
} from "../types.js";

/** Default random source; overridable in tests for determinism. */
const defaultRandom: RandomSource = Math.random;

/**
 * Find the branch that answers a given roll selector key/type.
 * @param block The active block.
 * @param rollType The intercepted roll type.
 * @param key The system key (skill/ability abbreviation).
 * @returns The matching branch, or `undefined` if none applies.
 */
export function findBranch(
  block: EventBlock,
  rollType: string,
  key: string
): ResponseBranch | undefined {
  const selector = block.selectors.find(
    (s) => s.roll_type === rollType && s.key === key
  );
  if (!selector) return undefined;
  return block.branches.find((b) => b.id === selector.branch_id);
}

/**
 * Whether a tier's natural-roll constraint is satisfied by the context.
 * A tier restricted to natural_1 / natural_20 only fires when the observed
 * natural d20 face matches; "any" always passes.
 */
function naturalConstraintSatisfied(
  tier: ResponseTier,
  natural: number | null
): boolean {
  if (tier.natural_roll === "any") return true;
  if (natural === null) return false;
  if (tier.natural_roll === "natural_1") return natural === 1;
  if (tier.natural_roll === "natural_20") return natural === 20;
  return true;
}

/** Whether a total sits within a tier's (possibly open) numeric range. */
function totalWithinRange(tier: ResponseTier, total: number): boolean {
  const aboveMin = tier.minimum === null || total >= tier.minimum;
  const belowMax = tier.maximum === null || total <= tier.maximum;
  return aboveMin && belowMax;
}

/** Pick one response from a tier, honouring the randomize option. */
function pickResponse(
  tier: ResponseTier,
  randomize: boolean,
  random: RandomSource
): string {
  const pool = tier.responses.filter((r) => r.trim().length > 0);
  if (pool.length === 0) return "";
  if (pool.length === 1 || !randomize) return pool[0];
  const index = Math.floor(random() * pool.length);
  // Guard against random() returning exactly 1.
  return pool[Math.min(index, pool.length - 1)];
}

/**
 * Resolve in exclusive-range mode: exactly one tier whose range contains the
 * total (and whose natural constraint is met) is selected.
 */
function resolveExclusiveRange(
  branch: ResponseBranch,
  total: number,
  natural: number | null,
  randomize: boolean,
  random: RandomSource
): ResolvedResponse | null {
  // Prefer a natural-specific tier when its face matches, so a natural_20 tier
  // can override the ordinary range tier that also contains the total.
  const candidates = branch.tiers.filter(
    (tier) =>
      totalWithinRange(tier, total) && naturalConstraintSatisfied(tier, natural)
  );
  if (candidates.length === 0) return null;

  const naturalSpecific = candidates.find((t) => t.natural_roll !== "any");
  const chosen = naturalSpecific ?? candidates[0];
  const paragraph = pickResponse(chosen, randomize, random);
  if (!paragraph) return null;
  return {
    paragraphs: [paragraph],
    tierIds: [chosen.id],
    usedFallback: false,
    personal: false,
    tone: rankTone(branch, [chosen.id])
  };
}

/**
 * Map the reached tier(s) to a tone in [0, 1] for colouring the whisper.
 *
 * Tiers are ranked by ascending minimum (open-min counts as lowest); the highest
 * reached tier sets the tone, so a better result trends green and a worse one
 * red. Returns `null` when the branch has fewer than two tiers, where a colour
 * scale would be meaningless.
 */
function rankTone(branch: ResponseBranch, reachedIds: string[]): number | null {
  const ordered = [...branch.tiers].sort(
    (a, b) => (a.minimum ?? -Infinity) - (b.minimum ?? -Infinity)
  );
  if (ordered.length < 2 || reachedIds.length === 0) return null;
  const highest = ordered.reduce((best, tier, index) => {
    return reachedIds.includes(tier.id) ? index : best;
  }, -1);
  if (highest < 0) return null;
  return highest / (ordered.length - 1);
}

/**
 * Resolve in cumulative-threshold mode: every tier whose minimum is reached
 * contributes a paragraph, assembled in ascending minimum order.
 */
function resolveCumulativeThreshold(
  branch: ResponseBranch,
  total: number,
  natural: number | null,
  randomize: boolean,
  random: RandomSource
): ResolvedResponse | null {
  const reached = branch.tiers
    .filter(
      (tier) =>
        (tier.minimum === null || total >= tier.minimum) &&
        naturalConstraintSatisfied(tier, natural)
    )
    .sort((a, b) => (a.minimum ?? -Infinity) - (b.minimum ?? -Infinity));

  if (reached.length === 0) return null;

  const paragraphs: string[] = [];
  const tierIds: string[] = [];
  for (const tier of reached) {
    const paragraph = pickResponse(tier, randomize, random);
    if (paragraph) {
      paragraphs.push(paragraph);
      tierIds.push(tier.id);
    }
  }
  if (paragraphs.length === 0) return null;
  return {
    paragraphs,
    tierIds,
    usedFallback: false,
    personal: false,
    tone: rankTone(branch, tierIds)
  };
}

/**
 * Find the personal response reserved for one of the given players.
 *
 * Candidates are tried in order, so the caller lists the user who actually
 * rolled first and the owners of the rolled character after: a personal answer
 * follows the player even when the GM rolls on their character's behalf.
 * @param branch The branch answering the roll.
 * @param candidateUserIds User ids to look for, in priority order.
 */
export function findPersonalResponse(
  branch: ResponseBranch,
  candidateUserIds: readonly string[]
): PersonalResponse | undefined {
  const usable = (branch.personal_responses ?? []).filter(
    (p) => p.user_id && p.response.trim().length > 0
  );
  for (const userId of candidateUserIds) {
    const match = usable.find((p) => p.user_id === userId);
    if (match) return match;
  }
  return undefined;
}

/**
 * Resolve the narrative response for an intercepted roll.
 *
 * A personal response reserved for the rolling player wins over the tiers: that
 * player receives it whatever their total, while everyone else is answered by
 * the tiers as usual.
 * @param block The active event block.
 * @param context The validated roll context (total, natural face, key, type).
 * @param random Optional deterministic random source (defaults to Math.random).
 * @param candidateUserIds Players to match against personal responses, rolling
 *        user first (omit to ignore personal responses).
 * @returns The resolved response, or the fallback, or `null` when nothing applies
 *          and no fallback is configured.
 */
export function resolveResponse(
  block: EventBlock,
  context: Pick<
    FilteredRollContext,
    "roll_type" | "key" | "total" | "natural_result"
  >,
  random: RandomSource = defaultRandom,
  candidateUserIds: readonly string[] = []
): ResolvedResponse | null {
  const branch = findBranch(block, context.roll_type, context.key);
  if (!branch) return fallbackOrNull(block);

  const personal = findPersonalResponse(branch, candidateUserIds);
  if (personal) {
    return {
      paragraphs: [personal.response],
      tierIds: [],
      usedFallback: false,
      personal: true,
      tone: null
    };
  }

  const randomize = block.options.randomize_equal_tier_responses;
  const resolved =
    block.mode === "cumulative_threshold"
      ? resolveCumulativeThreshold(
          branch,
          context.total,
          context.natural_result,
          randomize,
          random
        )
      : resolveExclusiveRange(
          branch,
          context.total,
          context.natural_result,
          randomize,
          random
        );

  return resolved ?? fallbackOrNull(block);
}

/** Build a fallback response when enabled, otherwise `null`. */
function fallbackOrNull(block: EventBlock): ResolvedResponse | null {
  if (
    block.options.send_fallback_response &&
    block.options.fallback_response.trim().length > 0
  ) {
    return {
      paragraphs: [block.options.fallback_response],
      tierIds: [],
      usedFallback: true,
      personal: false,
      tone: null
    };
  }
  return null;
}
