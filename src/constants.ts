/**
 * Immutable identifiers and default values for the Veiled Rolls module.
 *
 * Every literal that is referenced in more than one place lives here so that a
 * rename or a version bump only has to happen once. Nothing in this file may
 * import Foundry globals: it must be importable from unit tests.
 */

/** Canonical module id, matching `module.json#id`. */
export const MODULE_ID = "veiled-rolls" as const;

/** Socket channel name used by Foundry's `game.socket`. */
export const SOCKET_NAME = `module.${MODULE_ID}` as const;

/**
 * Current persisted schema version. Bump when the block shape changes.
 * v2 adds `ResponseBranch.personal_responses` (older payloads import as-is).
 */
export const SCHEMA_VERSION = 2 as const;

/** World/client setting keys. */
export const SETTINGS = {
  eventBlocks: "eventBlocks",
  activeFilter: "activeFilter",
  history: "history",
  notifyUnexpectedRolls: "notifyUnexpectedRolls",
  maxHistoryEntries: "maxHistoryEntries"
} as const;

/** Default cap on stored history entries. */
export const DEFAULT_MAX_HISTORY_ENTRIES = 200 as const;

/** Flags namespace applied to every ChatMessage we create. */
export const FLAG_SCOPE = MODULE_ID;

/** Roll option key used to correlate a pre-roll decision with its post-roll. */
export const ROLL_OPTION_KEY = "veiledRequestId" as const;

/** Supported roll types handled by the MVP. */
export const ROLL_TYPES = ["skill", "ability_check", "saving_throw"] as const;

/** Socket message types exchanged between player and responsible GM. */
export const SOCKET_ACTIONS = {
  filteredRoll: "filteredRoll",
  requestRoll: "requestRoll"
} as const;

/** Localization key prefix. */
export const I18N_PREFIX = "VEILED_ROLLS" as const;
