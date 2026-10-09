/**
 * Public module API, exposed at `game.modules.get('veiled-rolls').api` on ready.
 *
 * Every method is GM-gated and returns deep copies rather than live references,
 * so a macro can never mutate internal state or read secret data as a player.
 */

import { activate, disable, getState } from "./controllers/activation-controller.js";
import { getBlock, getBlocks } from "./services/block-repository.js";
import { validateBlock } from "./services/validation-service.js";
import type { ActiveFilterState, EventBlock } from "./types.js";

/** Openers are injected from `main.ts` to avoid importing the apps here. */
export interface ApiHooks {
  openControlPanel: () => void;
  openBlockLibrary: () => void;
}

/** The stable, documented surface returned to macro authors. */
export interface VeiledRollsApi {
  openControlPanel(): void;
  openBlockLibrary(): void;
  activate(blockId: string): Promise<ActiveFilterState>;
  disable(): Promise<ActiveFilterState>;
  getActiveState(): ActiveFilterState;
  getBlocks(): Promise<EventBlock[]>;
}

/** Throw a localized error if the current user is not a GM. */
function assertGm(): void {
  if (!game.user?.isGM) {
    throw new Error(game.i18n.localize("VEILED_ROLLS.Api.GmOnly"));
  }
}

/** Deep copy helper (structuredClone is available in the Foundry runtime). */
function clone<T>(value: T): T {
  return structuredClone(value);
}

/**
 * Build the public API object.
 * @param hooks UI openers wired at initialization.
 */
export function createApi(hooks: ApiHooks): VeiledRollsApi {
  return {
    openControlPanel(): void {
      assertGm();
      hooks.openControlPanel();
    },
    openBlockLibrary(): void {
      assertGm();
      hooks.openBlockLibrary();
    },
    async activate(blockId: string): Promise<ActiveFilterState> {
      assertGm();
      const block = await getBlock(blockId);
      if (!block) throw new Error(game.i18n.localize("VEILED_ROLLS.Api.BlockNotFound"));
      const validation = validateBlock(block);
      if (!validation.valid) {
        throw new Error(game.i18n.localize("VEILED_ROLLS.Api.BlockInvalid"));
      }
      return activate(block);
    },
    async disable(): Promise<ActiveFilterState> {
      assertGm();
      return disable();
    },
    getActiveState(): ActiveFilterState {
      assertGm();
      return clone(getState());
    },
    async getBlocks(): Promise<EventBlock[]> {
      assertGm();
      const blocks = await getBlocks();
      return blocks.map(clone);
    }
  };
}
