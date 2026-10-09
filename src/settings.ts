/**
 * Registration of Foundry settings and the settings menu.
 *
 * Design note (privacy-critical): Foundry broadcasts every *world-scope setting*
 * to all connected clients. Storing full event blocks (which contain the secret
 * responses and thresholds) in a world setting would therefore leak them to
 * players. To honour the "players never receive secret data" rule, the secret
 * data (blocks, history) lives in a GM-only JournalEntry (see block-repository /
 * history-service), and only a non-secret *public projection* of the active
 * filter is kept in a world setting so player clients can decide, locally,
 * whether to suppress a roll's public card before it is created.
 */

import { DEFAULT_MAX_HISTORY_ENTRIES, MODULE_ID, SETTINGS } from "./constants.js";
import type { ActiveFilterState } from "./types.js";

/** The empty/idle active-filter state. */
export function emptyActiveState(): ActiveFilterState {
  return {
    active: false,
    blockId: null,
    revision: 0,
    descriptor: null,
    participants: [],
    processedCount: 0,
    activatedAt: null,
    activatedBy: null
  };
}

/**
 * Register all settings and the block-library settings menu.
 * @param openBlockLibrary Callback invoked by the settings menu button.
 */
export function registerSettings(openBlockLibrary: () => void): void {
  // Public projection of the active filter (safe to broadcast; no secrets).
  game.settings.register(MODULE_ID, SETTINGS.activeFilter, {
    scope: "world",
    config: false,
    type: Object,
    default: emptyActiveState()
  });

  // GM-visible toggle: warn when an unexpected roll slips past the filter.
  game.settings.register(MODULE_ID, SETTINGS.notifyUnexpectedRolls, {
    name: "VEILED_ROLLS.Settings.NotifyUnexpected.Name",
    hint: "VEILED_ROLLS.Settings.NotifyUnexpected.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  // Cap on stored history entries.
  game.settings.register(MODULE_ID, SETTINGS.maxHistoryEntries, {
    name: "VEILED_ROLLS.Settings.MaxHistory.Name",
    hint: "VEILED_ROLLS.Settings.MaxHistory.Hint",
    scope: "world",
    config: true,
    type: Number,
    default: DEFAULT_MAX_HISTORY_ENTRIES,
    range: { min: 20, max: 2000, step: 20 }
  });

  // Menu button that opens the block library from the module settings.
  game.settings.registerMenu(MODULE_ID, "blockLibraryMenu", {
    name: "VEILED_ROLLS.Settings.LibraryMenu.Name",
    label: "VEILED_ROLLS.Settings.LibraryMenu.Label",
    hint: "VEILED_ROLLS.Settings.LibraryMenu.Hint",
    icon: "fa-solid fa-mask",
    restricted: true,
    type: buildMenuApp(openBlockLibrary)
  });
}

/**
 * Build a tiny FormApplication-compatible class that simply opens the block
 * library and closes itself. Foundry's settings menu expects a constructable
 * application; we adapt our own window through this shim.
 */
function buildMenuApp(openBlockLibrary: () => void): unknown {
  return class VeiledRollsLibraryMenu extends foundry.applications.api
    .ApplicationV2 {
    static DEFAULT_OPTIONS = { id: "veiled-rolls-library-menu" };
    async _prepareContext(): Promise<Record<string, unknown>> {
      return {};
    }
    async render(): Promise<this> {
      openBlockLibrary();
      await this.close();
      return this;
    }
  };
}

/**
 * Read a registered module setting with a caller-supplied type.
 * @param key One of the {@link SETTINGS} keys.
 */
export function getModuleSetting<T>(key: string): T {
  return game.settings.get(MODULE_ID, key) as T;
}

/** Read the current active-filter projection from the world setting. */
export function readActiveState(): ActiveFilterState {
  const stored = game.settings.get(MODULE_ID, SETTINGS.activeFilter);
  return stored ?? emptyActiveState();
}

/**
 * Persist the active-filter projection. GM clients only — Foundry rejects
 * world-setting writes from non-GM users.
 */
export async function writeActiveState(state: ActiveFilterState): Promise<void> {
  await game.settings.set(MODULE_ID, SETTINGS.activeFilter, state);
}
