/**
 * ActivationController
 *
 * Owns reads/writes of the active-filter world setting. Only a GM client may
 * write it (Foundry rejects world-setting writes from players), so all mutating
 * methods are intended to run on the GM. Player clients call `getState()` to read
 * the broadcast projection for their local suppression decision.
 */

import { emptyActiveState, readActiveState, writeActiveState } from "../settings.js";
import type {
  ActiveFilterDescriptor,
  ActiveFilterState,
  EventBlock,
  ParticipantRecord,
  ParticipantStatus
} from "../types.js";

/** Read the current active-filter state (safe on any client). */
export function getState(): ActiveFilterState {
  return readActiveState();
}

/** Whether a filter is currently active. */
export function isActive(): boolean {
  return getState().active === true;
}

/** Build the non-secret matching projection from a block. */
function buildDescriptor(block: EventBlock): ActiveFilterDescriptor {
  return {
    selectors: block.selectors.map((s) => ({
      roll_type: s.roll_type,
      key: s.key,
      label: s.label?.trim() || s.key
    })),
    participantMode: block.options.participant_mode,
    participantIds: [...block.options.participant_ids],
    duplicatePolicy: block.options.duplicate_policy,
    diceSoNiceMode: block.options.dice_so_nice_mode,
    blockName: block.name
  };
}

/**
 * Activate a block: publish its non-secret descriptor and reset participants.
 * @param block The validated block to activate.
 */
export async function activate(block: EventBlock): Promise<ActiveFilterState> {
  const previous = getState();
  const state: ActiveFilterState = {
    active: true,
    blockId: block.id,
    revision: previous.revision + 1,
    descriptor: buildDescriptor(block),
    participants: [],
    processedCount: 0,
    activatedAt: new Date().toISOString(),
    activatedBy: game.user?.id ?? null
  };
  await writeActiveState(state);
  return state;
}

/** Disable the filter immediately, bumping the revision. */
export async function disable(): Promise<ActiveFilterState> {
  const previous = getState();
  const state = { ...emptyActiveState(), revision: previous.revision + 1 };
  await writeActiveState(state);
  return state;
}

/** Clear the participant list without disabling the filter. */
export async function resetParticipants(): Promise<void> {
  const state = getState();
  if (!state.active) return;
  await writeActiveState({ ...state, participants: [], processedCount: 0 });
}

/**
 * Record or update a participant after a roll has been processed.
 * @param record The participant line to upsert.
 */
export async function recordParticipant(record: ParticipantRecord): Promise<void> {
  const state = getState();
  if (!state.active) return;
  const participants = [...state.participants];
  const index = participants.findIndex((p) => p.actorUuid === record.actorUuid);
  if (index >= 0) participants[index] = record;
  else participants.push(record);
  await writeActiveState({ ...state, participants });
}

/** Increment the processed-roll counter and return the new count. */
export async function incrementProcessed(): Promise<number> {
  const state = getState();
  if (!state.active) return 0;
  const processedCount = state.processedCount + 1;
  await writeActiveState({ ...state, processedCount });
  return processedCount;
}

/** Convenience: build a participant record for the current moment. */
export function makeParticipant(
  actorUuid: string,
  actorName: string,
  status: ParticipantStatus,
  lastTotal: number | null = null
): ParticipantRecord {
  return {
    actorUuid,
    actorName,
    status,
    lastTotal,
    lastRollAt: new Date().toISOString()
  };
}
