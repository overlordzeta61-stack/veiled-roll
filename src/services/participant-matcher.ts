/**
 * Pure participant-eligibility matching.
 *
 * The Foundry layer resolves the concrete ids of the selected tokens/actors/users
 * at activation time and stores them on the active state. This function then
 * decides — with no Foundry dependency — whether a given roll belongs to an
 * eligible participant, which keeps the rule fully unit-testable.
 */

import type { ParticipantMode } from "../types.js";

/** The participant configuration captured on the active filter. */
export interface ParticipantConfig {
  mode: ParticipantMode;
  /** User ids, actor uuids or token uuids depending on `mode`. */
  participantIds: string[];
}

/** Identifying data for the roll being evaluated. */
export interface ParticipantCandidate {
  userId: string;
  actorUuid: string | null;
  tokenUuid: string | null;
}

/**
 * Decide whether a candidate roll is performed by an eligible participant.
 * @param config The participant mode and the ids captured at activation.
 * @param candidate The user/actor/token behind the current roll.
 * @returns True when the roll should be intercepted for this participant.
 */
export function matchesParticipant(
  config: ParticipantConfig,
  candidate: ParticipantCandidate
): boolean {
  switch (config.mode) {
    case "all_players":
      // Every roll is in scope, including a GM rolling for a character.
      return true;
    case "selected_users":
      return config.participantIds.includes(candidate.userId);
    case "selected_actors":
      return (
        candidate.actorUuid !== null &&
        config.participantIds.includes(candidate.actorUuid)
      );
    case "selected_tokens":
      return (
        candidate.tokenUuid !== null &&
        config.participantIds.includes(candidate.tokenUuid)
      );
    default:
      return false;
  }
}
