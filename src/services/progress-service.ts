/**
 * GM-only "done" tracking for prepared rolls.
 *
 * Until 1.4 a roll counted as done whenever the history held an entry for it,
 * so starting a new session had to wipe the history to put rolls back to
 * "to do". The done markers now live in their own flag on the private store
 * journal: history is kept for good, and "new session" only clears the markers.
 */

import { MODULE_ID } from "../constants.js";
import type { HistoryEntry, RollType } from "../types.js";
import { ensureStore } from "./block-repository.js";

/** Flag key holding the done markers on the store journal. */
const DONE_FLAG = "done";

/** Done markers: roll id → epoch ms of the first answer. */
export type DoneMap = Record<string, number>;

/** Stable identity of a prepared roll: block + roll type + system key. */
export function rollId(blockId: string, rollType: RollType, key: string): string {
  return `${blockId}|${rollType}|${key}`;
}

/**
 * Build initial markers from an existing history (migration from ≤ 1.4, where
 * "done" was derived from the history). The oldest answer wins.
 */
export function doneFromHistory(history: readonly HistoryEntry[]): DoneMap {
  const done: DoneMap = {};
  for (const h of history) {
    const id = rollId(h.blockId, h.rollType, h.key);
    if (done[id] === undefined || h.timestamp < done[id]) done[id] = h.timestamp;
  }
  return done;
}

/** Stored form: an array, because Foundry replaces arrays wholesale on update
 * whereas objects are merged (a deleted key would otherwise survive). */
type StoredDone = Array<[string, number]>;

/** Read the done markers, migrating from the history on first use. */
export async function getDone(): Promise<DoneMap> {
  const store = await ensureStore();
  const raw = store.getFlag(MODULE_ID, DONE_FLAG) as StoredDone | undefined;
  if (Array.isArray(raw)) return Object.fromEntries(raw);
  const history = (store.getFlag(MODULE_ID, "history") as HistoryEntry[] | undefined) ?? [];
  const migrated = doneFromHistory(history);
  await writeDone(migrated);
  return migrated;
}

/** Overwrite the whole marker map. */
async function writeDone(done: DoneMap): Promise<void> {
  const store = await ensureStore();
  await store.setFlag(MODULE_ID, DONE_FLAG, Object.entries(done) as StoredDone);
}

/** Mark a roll as done (keeps the first timestamp if already done). */
export async function markDone(blockId: string, rollType: RollType, key: string): Promise<void> {
  const done = await getDone();
  const id = rollId(blockId, rollType, key);
  if (done[id] !== undefined) return;
  done[id] = Date.now();
  await writeDone(done);
}

/** Put one roll back to "to do". */
export async function unmarkDone(blockId: string, rollType: RollType, key: string): Promise<void> {
  const done = await getDone();
  const id = rollId(blockId, rollType, key);
  if (done[id] === undefined) return;
  delete done[id];
  await writeDone(done);
}

/** Put every roll back to "to do" (new session). History is untouched. */
export async function clearDone(): Promise<void> {
  await writeDone({});
}
