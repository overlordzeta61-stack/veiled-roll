/**
 * Pure duplicate-handling logic.
 *
 * Decides what to do when the same actor rolls again while a filter is active,
 * based on the block's duplicate policy and the actors that have already been
 * recorded. No Foundry dependency, so every branch is unit-testable.
 */

import type { DuplicatePolicy } from "../types.js";

/** The action the interceptor should take for an incoming roll. */
export type DuplicateAction = "accept" | "reject" | "replace" | "ask";

/**
 * Decide how to treat an incoming roll given the policy and prior participants.
 * @param policy The block's duplicate policy.
 * @param actorUuid The actor performing the incoming roll.
 * @param seenActorUuids Actor uuids already accepted during this activation.
 * @returns The action to apply.
 */
export function decideDuplicate(
  policy: DuplicatePolicy,
  actorUuid: string,
  seenActorUuids: readonly string[]
): DuplicateAction {
  const alreadySeen = seenActorUuids.includes(actorUuid);

  switch (policy) {
    case "accept_all":
      return "accept";
    case "first_per_actor":
      return alreadySeen ? "reject" : "accept";
    case "replace_previous":
      return alreadySeen ? "replace" : "accept";
    case "ask_gm":
      return alreadySeen ? "ask" : "accept";
    default:
      return "accept";
  }
}
