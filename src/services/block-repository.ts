/**
 * Persistence layer for event blocks.
 *
 * Blocks are stored on a dedicated JournalEntry whose default ownership is NONE,
 * so Foundry never transmits it (or its secret responses) to player clients.
 * All methods here are GM-only; player clients must not call them.
 */

import { MODULE_ID, SCHEMA_VERSION } from "../constants.js";
import type {
  BlockExport,
  EventBlock,
  ImportConflictStrategy,
  ValidationResult
} from "../types.js";
import {
  applyImport,
  coerceImportedBlock,
  exportBlocks,
  type ImportSummary
} from "./block-serialization.js";
import { validateBlock, validateImportShape } from "./validation-service.js";

/** Flag key holding the blocks array on the store journal. */
const BLOCKS_FLAG = "blocks";
/** Flag marking a JournalEntry as our private store. */
const STORE_FLAG = "store";
/** Name of the auto-created store journal. */
const STORE_NAME = "Jets voilés — données privées";

/** Cached reference to the store journal within a session. */
let storeJournal: AnyObject | null = null;

/** Generate a fresh unique id using Foundry's helper. */
function newId(): string {
  return foundry.utils.randomID();
}

/**
 * Find or create the private store JournalEntry. GM-only.
 * @returns The store document.
 */
export async function ensureStore(): Promise<AnyObject> {
  if (storeJournal) return storeJournal;
  const existing = game.journal?.find(
    (j: AnyObject) => j.getFlag(MODULE_ID, STORE_FLAG) === true
  );
  if (existing) {
    storeJournal = existing;
    return existing;
  }
  const created = await getJournalEntryClass().create({
    name: STORE_NAME,
    ownership: { default: 0 },
    flags: { [MODULE_ID]: { [STORE_FLAG]: true, [BLOCKS_FLAG]: [], history: [] } }
  });
  storeJournal = created;
  return created;
}

/** Resolve the JournalEntry document class across Foundry versions. */
function getJournalEntryClass(): AnyObject {
  return (
    (globalThis as AnyObject).JournalEntry ??
    foundry.documents?.JournalEntry ??
    CONFIG.JournalEntry.documentClass
  );
}

/**
 * Read every stored block (deep copy).
 * @returns The block library, or an empty array if uninitialised.
 */
export async function getBlocks(): Promise<EventBlock[]> {
  const store = await ensureStore();
  const raw = store.getFlag(MODULE_ID, BLOCKS_FLAG) as EventBlock[] | undefined;
  return raw ? structuredClone(raw) : [];
}

/**
 * Read a single block by id.
 * @param id Block id.
 */
export async function getBlock(id: string): Promise<EventBlock | undefined> {
  const blocks = await getBlocks();
  return blocks.find((b) => b.id === id);
}

/** Overwrite the entire library flag. */
async function persist(blocks: EventBlock[]): Promise<void> {
  const store = await ensureStore();
  await store.setFlag(MODULE_ID, BLOCKS_FLAG, blocks);
}

/**
 * Create or update a block after validating it.
 * @param block The block to save.
 * @returns The validation result; on failure nothing is persisted.
 */
export async function upsertBlock(block: EventBlock): Promise<ValidationResult> {
  const validation = validateBlock(block);
  if (!validation.valid) return validation;

  const blocks = await getBlocks();
  const now = new Date().toISOString();
  block.metadata = {
    ...block.metadata,
    updated_at: now,
    schema_version: SCHEMA_VERSION
  };
  const index = blocks.findIndex((b) => b.id === block.id);
  if (index >= 0) blocks[index] = block;
  else blocks.push(block);
  await persist(blocks);
  return validation;
}

/**
 * Duplicate a block under a new id.
 * @param id Source block id.
 * @returns The new block, or `undefined` if the source is missing.
 */
export async function duplicateBlock(id: string): Promise<EventBlock | undefined> {
  const blocks = await getBlocks();
  const source = blocks.find((b) => b.id === id);
  if (!source) return undefined;
  const copy = structuredClone(source);
  copy.id = newId();
  copy.name = `${source.name} (copie)`;
  const now = new Date().toISOString();
  copy.metadata = { ...copy.metadata, created_at: now, updated_at: now };
  blocks.push(copy);
  await persist(blocks);
  return copy;
}

/**
 * Delete a block by id.
 * @param id Block id.
 */
export async function deleteBlock(id: string): Promise<void> {
  const blocks = await getBlocks();
  await persist(blocks.filter((b) => b.id !== id));
}

/**
 * Export a subset (or all) of the library to a versioned envelope.
 * @param ids Block ids to export; omit for the whole library.
 */
export async function exportLibrary(ids?: string[]): Promise<BlockExport> {
  const blocks = await getBlocks();
  const selected = ids ? blocks.filter((b) => ids.includes(b.id)) : blocks;
  return exportBlocks(selected, new Date().toISOString());
}

/** Outcome of an import attempt. */
export interface ImportResult {
  ok: boolean;
  summary?: ImportSummary;
  errors?: ValidationResult["errors"];
}

/**
 * Import blocks from raw JSON text. The payload is parsed as data only (never
 * executed), shape-validated, coerced field-by-field, per-block validated, then
 * merged according to the chosen conflict strategy.
 * @param json Raw JSON string.
 * @param strategy How to resolve id collisions.
 */
export async function importLibrary(
  json: string,
  strategy: ImportConflictStrategy
): Promise<ImportResult> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, errors: [{ path: "", messageKey: "VEILED_ROLLS.Import.Malformed" }] };
  }

  const shape = validateImportShape(parsed);
  if (!shape.valid) return { ok: false, errors: shape.errors };

  const now = new Date().toISOString();
  const userId = game.user?.id ?? "unknown";
  const rawBlocks = (parsed as { blocks: unknown[] }).blocks;
  const coerced = rawBlocks.map((b) => coerceImportedBlock(b, newId, now, userId));

  const invalid = coerced.flatMap((b) => validateBlock(b).errors);
  if (invalid.length > 0) return { ok: false, errors: invalid };

  const existing = await getBlocks();
  const { blocks, summary } = applyImport(existing, coerced, strategy, newId);
  await persist(blocks);
  return { ok: true, summary };
}

/** Clear the session cache (used on setup and by tests). */
export function resetCache(): void {
  storeJournal = null;
}
