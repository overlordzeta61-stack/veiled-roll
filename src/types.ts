/**
 * Shared data shapes for the Veiled Rolls module.
 *
 * Pure type declarations only: this file must stay importable from unit tests
 * and never reference Foundry globals at runtime.
 */

/** Roll families handled by the module. */
export type RollType = "skill" | "ability_check" | "saving_throw";

/** How a branch's tiers are turned into a response. */
export type ResolutionMode = "exclusive_range" | "cumulative_threshold";

/** Who is in scope while a block is active. */
export type ParticipantMode =
  | "all_players"
  | "selected_tokens"
  | "selected_actors"
  | "selected_users";

/** What to do when the same actor rolls again during one activation. */
export type DuplicatePolicy =
  | "accept_all"
  | "first_per_actor"
  | "replace_previous"
  | "ask_gm";

/** Optional rule that switches the filter off by itself. */
export type AutoCloseMode = "manual" | "after_roll_count" | "after_each_participant";

/** Dice So Nice handling for veiled rolls. */
export type DiceSoNiceMode = "disabled" | "private";

/** Natural-d20 constraint on a tier. */
export type NaturalRoll = "any" | "natural_1" | "natural_20";

/** How id collisions are handled on import. */
export type ImportConflictStrategy = "duplicate" | "replace" | "skip";

/** One band of totals and the narrative response(s) it yields. */
export interface ResponseTier {
  id: string;
  /** Inclusive lower bound, or `null` for open. */
  minimum: number | null;
  /** Inclusive upper bound, or `null` for open. */
  maximum: number | null;
  /** One or more interchangeable responses (one is picked). */
  responses: string[];
  /** Private reminder for the GM; never sent to players. */
  gm_note: string;
  natural_roll: NaturalRoll;
  weighting: "equal";
}

/**
 * A response reserved for one player. When that player (or a character they
 * own) makes the roll, they receive this text whatever their total, instead of
 * the tier-based response everybody else gets.
 */
export interface PersonalResponse {
  /** Foundry user id of the player. */
  user_id: string;
  /** Narrative text (sanitized on save/import). */
  response: string;
}

/** The set of tiers answering one roll. */
export interface ResponseBranch {
  id: string;
  label: string;
  roll_type: RollType;
  key: string;
  tiers: ResponseTier[];
  /** Per-player overrides; optional for blocks created before 2.0. */
  personal_responses?: PersonalResponse[];
}

/** A roll covered by a block, pointing at the branch that answers it. */
export interface RollSelector {
  roll_type: RollType;
  key: string;
  label: string;
  branch_id: string;
}

/** Per-block behaviour switches. */
export interface EventBlockOptions {
  include_gm_in_whisper: boolean;
  show_total_to_gm: boolean;
  show_result_to_player: boolean;
  color_by_tier: boolean;
  dice_so_nice_mode: DiceSoNiceMode;
  duplicate_policy: DuplicatePolicy;
  participant_mode: ParticipantMode;
  participant_ids: string[];
  auto_close_mode: AutoCloseMode;
  auto_close_roll_count: number | null;
  send_fallback_response: boolean;
  fallback_response: string;
  randomize_equal_tier_responses: boolean;
}

/** Bookkeeping fields. */
export interface EventBlockMetadata {
  created_at: string;
  updated_at: string;
  created_by: string;
  schema_version: number;
}

/** A prepared set of veiled rolls with their secret responses. */
export interface EventBlock {
  id: string;
  name: string;
  folder: string;
  description: string;
  enabled: boolean;
  mode: ResolutionMode;
  selectors: RollSelector[];
  branches: ResponseBranch[];
  options: EventBlockOptions;
  metadata: EventBlockMetadata;
}

/** Versioned export envelope. */
export interface BlockExport {
  schema_version: number;
  exported_at: string;
  blocks: EventBlock[];
}

/** A single validation problem, keyed for localisation. */
export interface ValidationIssue {
  path: string;
  messageKey: string;
  data?: Record<string, string | number>;
}

/** Outcome of a validation pass. */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
}

/** Minimal, validated context of an intercepted roll. */
export interface FilteredRollContext {
  request_id: string;
  user_id: string;
  actor_uuid: string;
  token_uuid: string | null;
  roll_type: RollType;
  key: string;
  total: number;
  natural_result: number | null;
  formula: string | null;
  timestamp: number;
  block_id: string;
  filter_revision: number;
}

/** The response chosen for a roll. */
export interface ResolvedResponse {
  paragraphs: string[];
  tierIds: string[];
  usedFallback: boolean;
  /** True when a per-player response was used instead of the tiers. */
  personal: boolean;
  /** Success tone in [0, 1] for colouring, or `null` when not meaningful. */
  tone: number | null;
}

/** Injectable random source in [0, 1). */
export type RandomSource = () => number;

/** Non-secret projection of the active block, broadcast to every client. */
export interface ActiveFilterDescriptor {
  selectors: Array<{ roll_type: RollType; key: string; label: string }>;
  participantMode: ParticipantMode;
  participantIds: string[];
  duplicatePolicy: DuplicatePolicy;
  diceSoNiceMode: DiceSoNiceMode;
  blockName: string;
}

/** Status of a participant line in the panel. */
export type ParticipantStatus = "accepted" | "duplicate" | "ignored" | "error";

/** One participant line of the active filter. */
export interface ParticipantRecord {
  actorUuid: string;
  actorName: string;
  status: ParticipantStatus;
  lastTotal: number | null;
  lastRollAt: string | null;
}

/** World-setting projection of the active filter (no secrets). */
export interface ActiveFilterState {
  active: boolean;
  blockId: string | null;
  revision: number;
  descriptor: ActiveFilterDescriptor | null;
  participants: ParticipantRecord[];
  processedCount: number;
  activatedAt: string | null;
  activatedBy: string | null;
}

/** GM-only record of one processed roll. */
export interface HistoryEntry {
  id: string;
  timestamp: number;
  userName: string;
  actorName: string;
  actorUuid: string;
  rollType: RollType;
  key: string;
  keyLabel: string;
  total: number;
  naturalResult: number | null;
  blockId: string;
  blockName: string;
  tierIds: string[];
  responseParagraphs: string[];
  usedFallback: boolean;
  /** True when the player received their personal response (2.0+). */
  personal?: boolean;
}

/** A GM request asking players to make a roll. */
export interface RollRequest {
  rollType: RollType;
  key: string;
  keyLabel: string;
  blockId: string;
  blockName: string;
  /** Targeted user ids, or `null` for every connected player. */
  targetUserIds: string[] | null;
  requestId: string;
}
