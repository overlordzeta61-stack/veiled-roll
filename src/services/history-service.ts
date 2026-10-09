/**
 * GM-only processing history.
 *
 * History records include totals and full responses, so — like the blocks — they
 * are kept on the private store JournalEntry rather than a broadcast world
 * setting. The list is capped to `maxHistoryEntries` (most-recent kept).
 */

import { MODULE_ID, SETTINGS, DEFAULT_MAX_HISTORY_ENTRIES } from "../constants.js";
import type { HistoryEntry } from "../types.js";
import { ensureStore } from "./block-repository.js";

/** Flag key holding the history array on the store journal. */
const HISTORY_FLAG = "history";

/** Read the configured maximum number of history entries. */
function maxEntries(): number {
  const value = game.settings.get(MODULE_ID, SETTINGS.maxHistoryEntries);
  return typeof value === "number" && value > 0 ? value : DEFAULT_MAX_HISTORY_ENTRIES;
}

/**
 * Read the full history (most-recent last), as a deep copy.
 */
export async function getHistory(): Promise<HistoryEntry[]> {
  const store = await ensureStore();
  const raw = store.getFlag(MODULE_ID, HISTORY_FLAG) as HistoryEntry[] | undefined;
  return raw ? structuredClone(raw) : [];
}

/**
 * Append an entry and trim to the configured maximum.
 * @param entry The history entry to record.
 */
export async function addHistory(entry: HistoryEntry): Promise<void> {
  const store = await ensureStore();
  const history = await getHistory();
  history.push(entry);
  const trimmed = history.slice(-maxEntries());
  await store.setFlag(MODULE_ID, HISTORY_FLAG, trimmed);
}

/** Remove all history entries. */
export async function clearHistory(): Promise<void> {
  const store = await ensureStore();
  await store.setFlag(MODULE_ID, HISTORY_FLAG, []);
}

/**
 * Return the most recent entries, newest first.
 * @param limit Maximum number of entries to return.
 */
export async function getRecentHistory(limit = 20): Promise<HistoryEntry[]> {
  const history = await getHistory();
  return history.slice(-limit).reverse();
}
