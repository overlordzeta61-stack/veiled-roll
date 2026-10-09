/**
 * RollRequestService (GM side)
 *
 * Builds and broadcasts a request asking targeted players to make a specific
 * roll from the active block, and tracks which requests are still outstanding so
 * the panel can show a todo / requested / done status and the filter can turn
 * itself off once every requested roll has been answered.
 *
 * The outstanding state lives on the requesting GM's client. With a single GM
 * (the common case) that is also the responsible GM who processes rolls, so the
 * progress tracking and auto-close work end to end. This has not been verified
 * live in a multi-GM session.
 */

import { getKeyLabel } from "../adapters/dnd5e-roll-adapter.js";
import { disable, getState } from "../controllers/activation-controller.js";
import { emitRollRequest } from "./socket-service.js";
import type { RollRequest, RollType } from "../types.js";

/** Build the "rollType|key" identity used to track a selector. */
function selectorId(rollType: RollType, key: string): string {
  return `${rollType}|${key}`;
}

/** Expected responders per outstanding selector (user ids not yet answered). */
const outstanding = new Map<string, Set<string>>();

/** Non-GM users currently connected, as targeting candidates. */
export function connectedPlayers(): Array<{ id: string; name: string }> {
  return (game.users ?? [])
    .filter((u: AnyObject) => !u.isGM && u.active)
    .map((u: AnyObject) => ({ id: u.id, name: u.name }));
}

/** Selector ids ("rollType|key") still awaiting at least one answer. */
export function outstandingSelectorIds(): Set<string> {
  return new Set(outstanding.keys());
}

/** User ids still expected to answer a requested roll (empty when none). */
export function outstandingUsers(rollType: RollType, key: string): string[] {
  return [...(outstanding.get(selectorId(rollType, key)) ?? [])];
}

/** Clear all outstanding-request tracking (on load / disable / reset). */
export function resetRequests(): void {
  outstanding.clear();
}

/**
 * Ask targeted players to make a given roll from the active block.
 * @param rollType The roll family to request.
 * @param key The system key (skill/ability).
 * @param targetUserIds Target user ids, or null for every connected player.
 * @returns True if the request was emitted (a matching filter is active).
 */
export function requestRoll(
  rollType: RollType,
  key: string,
  targetUserIds: string[] | null
): boolean {
  const state = getState();
  if (!state.active || !state.blockId || !state.descriptor) {
    ui.notifications?.warn(game.i18n.localize("VEILED_ROLLS.Request.NeedActive"));
    return false;
  }

  // Resolve the concrete audience so completion can be tracked.
  const audience =
    targetUserIds && targetUserIds.length > 0
      ? targetUserIds
      : connectedPlayers().map((p) => p.id);

  const request: RollRequest = {
    rollType,
    key,
    keyLabel: getKeyLabel(rollType, key),
    blockId: state.blockId,
    blockName: state.descriptor.blockName,
    targetUserIds: targetUserIds && targetUserIds.length > 0 ? targetUserIds : null,
    requestId: foundry.utils.randomID()
  };

  emitRollRequest(request);

  // Record who we expect to answer, so the roll can move to "done" and the
  // filter can auto-close once everyone targeted has rolled.
  if (audience.length > 0) {
    outstanding.set(selectorId(rollType, key), new Set(audience));
  }

  const scope =
    request.targetUserIds === null
      ? game.i18n.localize("VEILED_ROLLS.Request.ScopeAll")
      : request.targetUserIds
          .map((id: string) => game.users?.get(id)?.name ?? id)
          .join(", ");
  ui.notifications?.info(
    game.i18n.format("VEILED_ROLLS.Request.Sent", { roll: request.keyLabel, scope })
  );
  return true;
}

/**
 * Record that a player answered a roll, advancing request tracking. When the
 * last outstanding request clears, the filter disables itself so it never
 * lingers between prepared rolls.
 * @param userId The player who rolled.
 * @param rollType The roll family answered.
 * @param key The system key answered.
 */
export async function markRequestProgress(
  userId: string,
  rollType: RollType,
  key: string
): Promise<void> {
  const id = selectorId(rollType, key);
  const expected = outstanding.get(id);
  if (!expected) return;

  expected.delete(userId);
  if (expected.size === 0) outstanding.delete(id);

  if (outstanding.size === 0) {
    // Every requested roll has been answered: turn the filter off by itself.
    await disable();
    resetRequests();
    ui.notifications?.info(game.i18n.localize("VEILED_ROLLS.Request.AllDone"));
  }
}
