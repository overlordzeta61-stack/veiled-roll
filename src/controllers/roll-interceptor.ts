/**
 * RollInterceptor
 *
 * Orchestrates the whole life of a potentially-filtered roll across two roles:
 *
 *  - On the rolling client (`handlePreRoll` / `handlePostRoll`): decide whether
 *    the roll is in scope, suppress its public card *before* creation, let the
 *    system compute the Roll normally, then forward a minimal validated context
 *    to the responsible GM (or process locally if we are that GM).
 *
 *  - On the responsible GM (`processFilteredRoll`): resolve the narrative
 *    response from the secret block and whisper it privately.
 *
 * Every failure path favours the fail-safe rule: a roll is never silently lost;
 * on error the player still receives a note and the GM is notified.
 */

import {
  extractPostRollInfo,
  extractPreRollInfo,
  getKeyLabel,
  isSkillOrToolConfig,
  markRollForInterception,
  resolvePlayerActor,
  showDicePrivately,
  suppressPublicMessage,
  triggerActorRoll
} from "../adapters/dnd5e-roll-adapter.js";
import { SETTINGS } from "../constants.js";
import {
  disable,
  getState,
  incrementProcessed,
  makeParticipant,
  recordParticipant
} from "./activation-controller.js";
import { decideDuplicate } from "../services/duplicate-policy.js";
import { getModuleSetting } from "../settings.js";
import { addHistory } from "../services/history-service.js";
import { getBlock } from "../services/block-repository.js";
import { matchesParticipant } from "../services/participant-matcher.js";
import { markRequestProgress } from "../services/roll-request-service.js";
import { resolveResponse } from "../services/response-resolver.js";
import {
  activeGmIds,
  deliverResponse,
  ownerUserIds,
  sendPlayerNote
} from "../services/whisper-service.js";
import { markDone } from "../services/progress-service.js";
import {
  emitFilteredRoll,
  isResponsibleGm,
  markLocallyProcessed
} from "../services/socket-service.js";
import type {
  EventBlock,
  FilteredRollContext,
  RollRequest,
  RollType
} from "../types.js";

/** Data captured at pre-roll and consumed by the same client's post-roll. */
interface PendingRoll {
  rollType: RollType;
  key: string;
  actorUuid: string;
  tokenUuid: string | null;
  userId: string;
  actorName: string;
  blockId: string;
  filterRevision: number;
}

/**
 * Correlates a pre-roll decision with its completed roll on the same client.
 * Keyed by the correlation id written onto the roll's options.
 */
const pending = new Map<string, PendingRoll>();

/** Accepted actor uuids for the current activation (authoritative dedup input). */
function acceptedActorUuids(): string[] {
  return getState()
    .participants.filter((p) => p.status === "accepted")
    .map((p) => p.actorUuid);
}

/**
 * PRE-ROLL (rolling client). Decide interception and suppress the public card.
 * Never returns `false`: the system must still compute the roll normally.
 * @param rollType The roll family this hook covers.
 * @param config The dnd5e roll config (first hook argument).
 * @param message The message config (third hook argument); `create=false` hides it.
 */
export function handlePreRoll(
  rollType: RollType,
  config: AnyObject,
  message: AnyObject
): void {
  // The ability-check hook also fires for skills/tools; defer to the skill hook.
  if (rollType === "ability_check" && isSkillOrToolConfig(config)) return;

  const state = getState();
  if (!state.active || !state.descriptor || !state.blockId) return;

  const info = extractPreRollInfo(rollType, config);
  if (!info) return;

  const descriptor = state.descriptor;
  const keyMatches = descriptor.selectors.some(
    (s) => s.roll_type === rollType && s.key === info.key
  );

  const participates = matchesParticipant(
    { mode: descriptor.participantMode, participantIds: descriptor.participantIds },
    { userId: info.userId, actorUuid: info.actorUuid, tokenUuid: info.tokenUuid }
  );

  if (!keyMatches) {
    // Non-matching roll: proceed normally. Optionally inform a GM roller only.
    if (
      participates &&
      game.user?.isGM &&
      getModuleSetting<boolean>(SETTINGS.notifyUnexpectedRolls)
    ) {
      ui.notifications?.info(
        game.i18n.format("VEILED_ROLLS.Notify.UnexpectedRoll", {
          key: getKeyLabel(rollType, info.key)
        })
      );
    }
    return;
  }

  if (!participates) return;

  // Duplicate policy (client-side fast path; the GM re-checks authoritatively).
  const action = decideDuplicate(
    descriptor.duplicatePolicy,
    info.actorUuid,
    acceptedActorUuids()
  );
  // "reject" → let the subsequent roll proceed as a normal (public) roll.
  if (action === "reject") return;

  const requestId = foundry.utils.randomID();
  markRollForInterception(config, requestId);
  // Suppress the public chat card before it is ever created (core privacy rule).
  // With no ChatMessage, Dice So Nice does not animate this roll either.
  suppressPublicMessage(message);

  pending.set(requestId, {
    rollType,
    key: info.key,
    actorUuid: info.actorUuid,
    tokenUuid: info.tokenUuid,
    userId: info.userId,
    actorName: typeof info.actor.name === "string" ? info.actor.name : "?",
    blockId: state.blockId,
    filterRevision: state.revision
  });
}

/**
 * POST-ROLL (rolling client). Read the computed total and forward it.
 * @param rolls The rolls array (first hook argument).
 * @param _data The hook data payload (unused; actor is resolved GM-side).
 */
export async function handlePostRoll(
  rolls: AnyObject[],
  _data: AnyObject
): Promise<void> {
  const post = extractPostRollInfo(rolls);
  if (!post?.requestId) return;
  const p = pending.get(post.requestId);
  if (!p) return;
  pending.delete(post.requestId);

  // The private Dice So Nice animation is played by the GM once the response is
  // known (see processFilteredRoll): a player with a personal response must not
  // see their die face. The serialized roll travels with the context for that.
  const descriptor = getState().descriptor;
  const rollData =
    descriptor?.diceSoNiceMode === "private" ? rolls[0]?.toJSON?.() ?? null : null;

  const context: FilteredRollContext = {
    request_id: post.requestId,
    user_id: p.userId,
    actor_uuid: p.actorUuid,
    token_uuid: p.tokenUuid,
    roll_type: p.rollType,
    key: p.key,
    total: post.total,
    natural_result: post.natural,
    formula: post.formula,
    timestamp: Date.now(),
    block_id: p.blockId,
    filter_revision: p.filterRevision,
    roll_data: rollData
  };

  // If we are the responsible GM, process locally; otherwise hand off by socket.
  if (isResponsibleGm()) {
    markLocallyProcessed(context.request_id);
    await processFilteredRoll(context);
  } else {
    emitFilteredRoll(context);
  }
}

/** Fail-safe: notify the GM and leave the player a note so nothing is lost. */
async function failSafe(userId: string, gmKey: string, playerKey: string): Promise<void> {
  ui.notifications?.warn(game.i18n.localize(gmKey));
  try {
    await sendPlayerNote(userId, playerKey);
  } catch (error) {
    console.error("[veiled-rolls] fail-safe note could not be sent", error);
  }
}

/**
 * GM AUTHORITY. Resolve and privately deliver the response for one roll.
 * Trusts nothing from the socket: the block is reloaded and the key re-checked.
 * @param context The validated intercepted-roll context.
 */
export async function processFilteredRoll(context: FilteredRollContext): Promise<void> {
  try {
    const block = await getBlock(context.block_id);
    if (!block) {
      await failSafe(
        context.user_id,
        "VEILED_ROLLS.Notify.BlockMissing",
        "VEILED_ROLLS.Notify.NoResultPlayer"
      );
      return;
    }

    // Re-validate that the key/type truly belongs to this block.
    const keyBelongs = block.selectors.some(
      (s) => s.roll_type === context.roll_type && s.key === context.key
    );
    if (!keyBelongs) {
      await failSafe(
        context.user_id,
        "VEILED_ROLLS.Notify.KeyMismatch",
        "VEILED_ROLLS.Notify.NoResultPlayer"
      );
      return;
    }

    // Authoritative duplicate handling against the live participant list.
    const action = decideDuplicate(
      block.options.duplicate_policy,
      context.actor_uuid,
      acceptedActorUuids()
    );
    const actor = (await fromUuid(context.actor_uuid)) as AnyObject | null;
    const actorName =
      typeof actor?.name === "string" ? actor.name : context.actor_uuid;

    if (action === "reject") {
      // Not silent: the player is told the extra roll was ignored.
      await sendPlayerNote(context.user_id, "VEILED_ROLLS.Notify.DuplicatePlayer");
      await recordParticipant(
        makeParticipant(context.actor_uuid, actorName, "duplicate", context.total)
      );
      return;
    }

    // The rolling user first, then the character's owners, so a personal
    // response still reaches its player when the GM rolls for them.
    const candidates = Array.from(new Set([context.user_id, ...ownerUserIds(actor)]));
    const resolved = resolveResponse(block, context, undefined, candidates);
    const userName = game.users?.get(context.user_id)?.name ?? "?";
    const keyLabel = getKeyLabel(context.roll_type, context.key);

    if (!resolved) {
      // No tier matched and no usable fallback. The player is acknowledged, but
      // the GM must also be told and the roll must still appear in the history:
      // an unanswered roll that leaves no trace is indistinguishable from a bug.
      await sendPlayerNote(context.user_id, "VEILED_ROLLS.Notify.NoResultPlayer");
      ui.notifications?.warn(
        game.i18n.format("VEILED_ROLLS.Notify.NoTierMatched", {
          actor: actorName,
          total: context.total
        })
      );
      await addHistory({
        id: foundry.utils.randomID(),
        // GM clock, consistent with the done markers set right after.
        timestamp: Date.now(),
        userName: game.users?.get(context.user_id)?.name ?? "?",
        actorName,
        actorUuid: context.actor_uuid,
        rollType: context.roll_type,
        key: context.key,
        keyLabel: getKeyLabel(context.roll_type, context.key),
        total: context.total,
        naturalResult: context.natural_result,
        blockId: block.id,
        blockName: block.name,
        tierIds: [],
        responseParagraphs: [game.i18n.localize("VEILED_ROLLS.Panel.NoResponseSent")],
        usedFallback: false,
        personal: false
      });
      await markDone(block.id, context.roll_type, context.key);
      await recordParticipant(
        makeParticipant(context.actor_uuid, actorName, "accepted", context.total)
      );
      await incrementProcessed();
      await markRequestProgress(candidates, context.roll_type, context.key);
      return;
    }

    // Private dice animation (roller + GMs), except for a personal response:
    // that player only ever learns that their answer is personal.
    if (block.options.dice_so_nice_mode === "private" && !resolved.personal && context.roll_data) {
      const audience = Array.from(new Set([context.user_id, ...activeGmIds()]));
      await showDicePrivately(context.roll_data, audience, context.user_id);
    }

    await deliverResponse({
      block,
      context,
      resolved,
      actor,
      actorName,
      userName,
      keyLabel,
      targetUserId: context.user_id
    });

    await addHistory({
      id: foundry.utils.randomID(),
      // GM clock, consistent with the done markers set right after.
      timestamp: Date.now(),
      userName,
      actorName,
      actorUuid: context.actor_uuid,
      rollType: context.roll_type,
      key: context.key,
      keyLabel,
      total: context.total,
      naturalResult: context.natural_result,
      blockId: block.id,
      blockName: block.name,
      tierIds: resolved.tierIds,
      responseParagraphs: resolved.paragraphs,
      usedFallback: resolved.usedFallback,
      personal: resolved.personal
    });
    await markDone(block.id, context.roll_type, context.key);

    await recordParticipant(
      makeParticipant(context.actor_uuid, actorName, "accepted", context.total)
    );
    const processed = await incrementProcessed();
    await maybeAutoClose(block, processed);
    // Advance roll-request tracking; may auto-disable when all requests are done.
    await markRequestProgress(candidates, context.roll_type, context.key);
  } catch (error) {
    console.error("[veiled-rolls] processing failed", error);
    await failSafe(
      context.user_id,
      "VEILED_ROLLS.Notify.ProcessError",
      "VEILED_ROLLS.Notify.PlayerError"
    );
  }
}

/**
 * Apply the block's optional auto-close rule after a processed roll.
 * @param block The active block.
 * @param processedCount The updated processed-roll count.
 */
async function maybeAutoClose(block: EventBlock, processedCount: number): Promise<void> {
  const { auto_close_mode, auto_close_roll_count } = block.options;
  if (
    auto_close_mode === "after_roll_count" &&
    typeof auto_close_roll_count === "number" &&
    auto_close_roll_count > 0 &&
    processedCount >= auto_close_roll_count
  ) {
    await disable();
    return;
  }

  // "after_each_participant" is only decidable when the participant set is known
  // (selected_* modes). For all_players we cannot know the total, so we skip.
  if (auto_close_mode === "after_each_participant") {
    const descriptor = getState().descriptor;
    const ids = descriptor?.participantIds ?? [];
    if (ids.length > 0) {
      const accepted = new Set(acceptedActorUuids());
      const allDone = ids.every((id) => accepted.has(id));
      if (allDone) await disable();
    }
  }
}

/**
 * PLAYER SIDE. React to a GM roll request: prompt the player, and on confirmation
 * trigger the requested roll on their character. The roll then flows through the
 * normal pre-roll interception, so the veiling behaviour is unchanged.
 * @param request The roll request received over the socket.
 */
export async function handleRollRequest(request: RollRequest): Promise<void> {
  const actor = resolvePlayerActor();
  if (!actor) {
    ui.notifications?.warn(game.i18n.localize("VEILED_ROLLS.Request.NoActor"));
    return;
  }

  const confirmed = await foundry.applications.api.DialogV2.wait({
    window: { title: game.i18n.localize("VEILED_ROLLS.Request.Title") },
    content: `<p>${game.i18n.format("VEILED_ROLLS.Request.Body", {
      roll: request.keyLabel,
      actor: actor.name ?? "?"
    })}</p>`,
    buttons: [
      {
        action: "roll",
        label: game.i18n.localize("VEILED_ROLLS.Request.Roll"),
        default: true
      },
      { action: "later", label: game.i18n.localize("VEILED_ROLLS.Request.Later") }
    ]
  }).catch(() => "later");

  if (confirmed !== "roll") return;

  const ok = await triggerActorRoll(actor, request.rollType, request.key);
  if (!ok) {
    ui.notifications?.warn(game.i18n.localize("VEILED_ROLLS.Request.Failed"));
  }
}
