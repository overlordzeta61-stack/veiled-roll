/**
 * SocketService
 *
 * Routes intercepted-roll contexts from the rolling player's client to the single
 * responsible GM, who is the only client allowed to resolve and whisper. The
 * responsible GM is elected deterministically so that, with several GMs online,
 * a roll is processed exactly once. Incoming request ids are de-duplicated.
 */

import { SOCKET_ACTIONS, SOCKET_NAME } from "../constants.js";
import type { FilteredRollContext, RollRequest } from "../types.js";

/** Handler invoked on the responsible GM for each unique incoming context. */
export type FilteredRollHandler = (context: FilteredRollContext) => Promise<void>;

/** Handler invoked on a targeted player's client for a roll request. */
export type RollRequestHandler = (request: RollRequest) => Promise<void>;

let handler: FilteredRollHandler | null = null;
let requestHandler: RollRequestHandler | null = null;

/** Bounded set of already-processed request ids (guards double delivery). */
const processedIds: string[] = [];
const PROCESSED_CAP = 500;

/** Record a request id as processed, keeping the set bounded. */
function markProcessed(requestId: string): void {
  processedIds.push(requestId);
  if (processedIds.length > PROCESSED_CAP) processedIds.shift();
}

/**
 * The deterministically elected responsible GM id.
 * Prefers Foundry's `activeGM`, falling back to the lowest-id active GM.
 */
export function responsibleGmId(): string | null {
  const active = game.users?.activeGM;
  if (active?.id) return active.id;
  const gms = game.users
    ?.filter((u: AnyObject) => u.isGM && u.active)
    .sort((a: AnyObject, b: AnyObject) => String(a.id).localeCompare(String(b.id)));
  return gms?.[0]?.id ?? null;
}

/** Whether the current client is the responsible GM. */
export function isResponsibleGm(): boolean {
  return Boolean(game.user?.id) && game.user.id === responsibleGmId();
}

/** Register the socket listener and the processing handler. */
export function registerSocket(processingHandler: FilteredRollHandler): void {
  handler = processingHandler;
  game.socket.on(SOCKET_NAME, onSocketMessage);
}

/** Register the handler that reacts to a roll request on player clients. */
export function registerRollRequestHandler(handlerFn: RollRequestHandler): void {
  requestHandler = handlerFn;
}

/** Internal: handle a raw socket payload, dispatching by action. */
function onSocketMessage(data: AnyObject): void {
  if (!data) return;
  if (data.action === SOCKET_ACTIONS.filteredRoll) {
    onFilteredRoll(data.payload as FilteredRollContext | undefined);
  } else if (data.action === SOCKET_ACTIONS.requestRoll) {
    onRollRequest(data.payload as RollRequest | undefined);
  }
}

/** Process an intercepted-roll context on the responsible GM only. */
function onFilteredRoll(context: FilteredRollContext | undefined): void {
  if (!isResponsibleGm()) return;
  if (!context?.request_id || processedIds.includes(context.request_id)) return;
  markProcessed(context.request_id);
  void handler?.(context).catch((error: unknown) => {
    console.error("[veiled-rolls] failed to process filtered roll", error);
    ui.notifications?.error(game.i18n.localize("VEILED_ROLLS.Notify.ProcessError"));
  });
}

/** React to a roll request on a targeted player's client (GMs ignore it). */
function onRollRequest(request: RollRequest | undefined): void {
  if (!request?.requestId) return;
  if (game.user?.isGM) return;
  const targets = request.targetUserIds;
  if (targets !== null && !targets.includes(game.user?.id ?? "")) return;
  void requestHandler?.(request).catch((error: unknown) => {
    console.error("[veiled-rolls] failed to handle roll request", error);
  });
}

/**
 * Emit an intercepted-roll context to the responsible GM. If the current client
 * is already the responsible GM, the caller handles it locally instead.
 */
export function emitFilteredRoll(context: FilteredRollContext): void {
  game.socket.emit(SOCKET_NAME, {
    action: SOCKET_ACTIONS.filteredRoll,
    payload: context
  });
}

/** Locally register a request id as processed (GM self-processing path). */
export function markLocallyProcessed(requestId: string): void {
  markProcessed(requestId);
}

/**
 * Emit a roll request from the GM to targeted players. Delivery is broadcast;
 * each client decides whether it is a target. GMs never act on it.
 */
export function emitRollRequest(request: RollRequest): void {
  game.socket.emit(SOCKET_NAME, {
    action: SOCKET_ACTIONS.requestRoll,
    payload: request
  });
}
