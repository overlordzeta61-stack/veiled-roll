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

/** Tracking of one outstanding request: who was asked, who is still awaited. */
interface PendingRequest {
  expected: string[];
  waiting: Set<string>;
}

/** Outstanding requests by selector ("rollType|key"). */
const outstanding = new Map<string, PendingRequest>();

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
  return [...(outstanding.get(selectorId(rollType, key))?.waiting ?? [])];
}

/** Who was asked for a roll and who is still awaited, or null if not requested. */
export function requestProgress(
  rollType: RollType,
  key: string
): { expected: string[]; waiting: string[] } | null {
  const pending = outstanding.get(selectorId(rollType, key));
  return pending ? { expected: [...pending.expected], waiting: [...pending.waiting] } : null;
}

/** Clear all outstanding-request tracking (on load / disable / reset). */
export function resetRequests(): void {
  outstanding.clear();
}

/** Build and broadcast a request for the active block. */
function emitFor(rollType: RollType, key: string, targetUserIds: string[] | null): RollRequest | null {
  const state = getState();
  if (!state.active || !state.blockId || !state.descriptor) {
    ui.notifications?.warn(game.i18n.localize("VEILED_ROLLS.Request.NeedActive"));
    return null;
  }
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
  return request;
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
  const request = emitFor(rollType, key, targetUserIds);
  if (!request) return false;

  // Record who we expect to answer, so the roll can move to "done" and the
  // filter can auto-close once everyone targeted has rolled.
  const audience = request.targetUserIds ?? connectedPlayers().map((p) => p.id);
  if (audience.length > 0) {
    outstanding.set(selectorId(rollType, key), { expected: [...audience], waiting: new Set(audience) });
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
 * Send the invitation again to the players who have not rolled yet, without
 * touching the progress already made.
 * @returns The number of players reminded.
 */
export function remindRoll(rollType: RollType, key: string): number {
  const waiting = outstandingUsers(rollType, key);
  if (waiting.length === 0) return 0;
  if (!emitFor(rollType, key, waiting)) return 0;
  ui.notifications?.info(
    game.i18n.format("VEILED_ROLLS.Request.Reminded", {
      roll: getKeyLabel(rollType, key),
      scope: waiting.map((id) => game.users?.get(id)?.name ?? id).join(", ")
    })
  );
  return waiting.length;
}

/** Turn the filter off once nothing is awaited any more. */
async function closeIfIdle(): Promise<void> {
  if (outstanding.size > 0) return;
  await disable();
  resetRequests();
  ui.notifications?.info(game.i18n.localize("VEILED_ROLLS.Request.AllDone"));
}

/**
 * Stop waiting for a requested roll (the GM moves on without the latecomers).
 * Like a complete answer, closing the last open request turns the filter off.
 */
export async function closeRequest(rollType: RollType, key: string): Promise<void> {
  if (!outstanding.delete(selectorId(rollType, key))) return;
  await closeIfIdle();
}

/**
 * Record that a roll was answered, advancing request tracking. The first
 * candidate still awaited is ticked off: the roller, or else an owner of the
 * rolled character (when the GM rolls on a player's behalf). When the last
 * outstanding request clears, the filter disables itself so it never lingers
 * between prepared rolls.
 * @param candidateUserIds The roller first, then the character's owners.
 * @param rollType The roll family answered.
 * @param key The system key answered.
 */
export async function markRequestProgress(
  candidateUserIds: readonly string[],
  rollType: RollType,
  key: string
): Promise<void> {
  const id = selectorId(rollType, key);
  const pending = outstanding.get(id);
  if (!pending) return;

  const answered = candidateUserIds.find((u) => pending.waiting.has(u));
  if (answered === undefined) return;
  pending.waiting.delete(answered);
  if (pending.waiting.size === 0) outstanding.delete(id);

  await closeIfIdle();
}
