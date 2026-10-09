/**
 * WhisperService
 *
 * Creates the private chat messages that carry a resolved response. The player
 * message contains only the narrative (never a total, formula or die face); an
 * optional, separate GM-only diagnostic message carries the technical summary so
 * the player can never see it. All creation happens on the GM authority.
 */

import { FLAG_SCOPE, I18N_PREFIX } from "../constants.js";
import type {
  EventBlock,
  FilteredRollContext,
  ResolvedResponse
} from "../types.js";

/** Localise a key. */
function t(key: string, data?: Record<string, string | number>): string {
  const full = `${I18N_PREFIX}.${key}`;
  return data ? game.i18n.format(full, data) : game.i18n.localize(full);
}

/** Ids of every currently active GM user. */
export function activeGmIds(): string[] {
  return game.users
    .filter((u: AnyObject) => u.isGM && u.active)
    .map((u: AnyObject) => u.id);
}

/** Escape a string for safe insertion as text content. */
function escapeText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Map a tone in [0,1] to a discrete CSS class, green (high) to red (low). */
function toneClass(tone: number | null): string {
  if (tone === null) return "";
  if (tone >= 0.8) return " tone-5";
  if (tone >= 0.6) return " tone-4";
  if (tone >= 0.4) return " tone-3";
  if (tone >= 0.2) return " tone-2";
  return " tone-1";
}

/**
 * Build the player-facing HTML: a discreet title, narrative paragraphs, and —
 * when the block allows it — the player's own numeric total. The card is only
 * ever whispered to the roller and GMs, so showing the total here never exposes
 * it to the rest of the table. An optional tone class tints the background.
 */
function buildPlayerContent(
  block: EventBlock,
  context: FilteredRollContext,
  actorName: string,
  resolved: ResolvedResponse
): string {
  const title = t("Whisper.PlayerTitle", { actor: escapeText(actorName) });
  // Responses were sanitized on save/import, so they may contain safe markup.
  const body = resolved.paragraphs.map((p) => `<p>${p}</p>`).join("");

  let total = "";
  if (block.options.show_result_to_player) {
    const natural =
      context.natural_result !== null
        ? ` (${t("Diag.Natural")} ${context.natural_result})`
        : "";
    total = `<p class="veiled-rolls-whisper-total">${t("Whisper.YourResult", {
      total: context.total
    })}${natural}</p>`;
  }

  const tone = block.options.color_by_tier ? toneClass(resolved.tone) : "";
  return `<div class="veiled-rolls-whisper${tone}"><p class="veiled-rolls-whisper-title">${title}</p>${body}${total}</div>`;
}

/** Build the GM-only diagnostic HTML with the hidden technical details. */
function buildGmContent(
  block: EventBlock,
  context: FilteredRollContext,
  resolved: ResolvedResponse,
  actorName: string,
  userName: string,
  keyLabel: string
): string {
  const rows: Array<[string, string]> = [
    [t("Diag.Block"), escapeText(block.name)],
    [t("Diag.Player"), escapeText(userName)],
    [t("Diag.Actor"), escapeText(actorName)],
    [t("Diag.Roll"), escapeText(keyLabel)],
    [t("Diag.Total"), String(context.total)]
  ];
  if (context.natural_result !== null) {
    rows.push([t("Diag.Natural"), String(context.natural_result)]);
  }
  rows.push([
    t("Diag.Tiers"),
    resolved.personal
      ? t("Diag.Personal")
      : resolved.usedFallback
        ? t("Diag.Fallback")
        : resolved.tierIds.join(", ") || "—"
  ]);
  const list = rows
    .map(([k, v]) => `<li><strong>${k}:</strong> ${v}</li>`)
    .join("");
  return `<div class="veiled-rolls-diag"><p class="veiled-rolls-diag-title">${t(
    "Diag.Title"
  )}</p><ul>${list}</ul></div>`;
}

/** Resolve a speaker object for the player message. */
function speakerFor(actor: AnyObject | null, actorName: string): AnyObject {
  if (actor) return ChatMessage.getSpeaker({ actor });
  return { alias: actorName };
}

/** Parameters for delivering a resolved response. */
export interface WhisperParams {
  block: EventBlock;
  context: FilteredRollContext;
  resolved: ResolvedResponse;
  actor: AnyObject | null;
  actorName: string;
  userName: string;
  keyLabel: string;
  targetUserId: string;
}

/**
 * Deliver a resolved response as private chat message(s).
 * @returns Ids of the created messages (for history/diagnostics).
 */
export async function deliverResponse(params: WhisperParams): Promise<string[]> {
  const { block, context, resolved } = params;
  const gmIds = activeGmIds();
  const includeGm = block.options.include_gm_in_whisper;

  const playerRecipients = Array.from(
    new Set([params.targetUserId, ...(includeGm ? gmIds : [])])
  );

  const created: string[] = [];

  const playerMessage = await ChatMessage.create({
    speaker: speakerFor(params.actor, params.actorName),
    content: buildPlayerContent(block, context, params.actorName, resolved),
    whisper: playerRecipients,
    flags: {
      [FLAG_SCOPE]: {
        kind: "player",
        blockId: block.id,
        requestId: context.request_id,
        tierIds: resolved.tierIds
      }
    }
  });
  if (playerMessage?.id) created.push(playerMessage.id);

  // Separate GM-only diagnostic so the total is never in a player-visible card.
  if (block.options.show_total_to_gm && gmIds.length > 0) {
    const gmMessage = await ChatMessage.create({
      content: buildGmContent(
        block,
        context,
        resolved,
        params.actorName,
        params.userName,
        params.keyLabel
      ),
      whisper: gmIds,
      flags: {
        [FLAG_SCOPE]: {
          kind: "gm",
          blockId: block.id,
          requestId: context.request_id
        }
      }
    });
    if (gmMessage?.id) created.push(gmMessage.id);
  }

  return created;
}

/** Non-GM user ids that own the given actor (personal responses, re-sending). */
export function ownerUserIds(actor: AnyObject | null): string[] {
  const ownership = actor?.ownership ?? {};
  const owners: string[] = [];
  for (const user of game.users ?? []) {
    if (user.isGM) continue;
    const level = ownership[user.id] ?? ownership.default ?? 0;
    if (level >= 3) owners.push(user.id); // 3 = OWNER
  }
  return owners;
}

/**
 * Re-send a previously stored response from the history, GM-side.
 * The narrative is whispered again to the actor's owners and the active GMs.
 * @param entry The history record to resend.
 */
export async function resendHistory(entry: {
  actorUuid: string;
  actorName: string;
  responseParagraphs: string[];
  blockId: string;
}): Promise<void> {
  const actor = (await fromUuid(entry.actorUuid)) as AnyObject | null;
  const recipients = Array.from(new Set([...ownerUserIds(actor), ...activeGmIds()]));
  const body = entry.responseParagraphs.map((p) => `<p>${p}</p>`).join("");
  const title = t("Whisper.PlayerTitle", { actor: escapeText(entry.actorName) });
  await ChatMessage.create({
    speaker: speakerFor(actor, entry.actorName),
    content: `<div class="veiled-rolls-whisper"><p class="veiled-rolls-whisper-title">${title}</p>${body}</div>`,
    whisper: recipients,
    flags: { [FLAG_SCOPE]: { kind: "resend", blockId: entry.blockId } }
  });
}

/**
 * Send a short private note to a player, e.g. when a duplicate roll is rejected,
 * so that a suppressed roll is never silently lost.
 * @param targetUserId The player to notify.
 * @param messageKey i18n key for the note body.
 */
export async function sendPlayerNote(
  targetUserId: string,
  messageKey: string
): Promise<void> {
  // Accept either a bare suffix ("Notify.X") or an already-qualified key.
  const suffix = messageKey.startsWith(`${I18N_PREFIX}.`)
    ? messageKey.slice(I18N_PREFIX.length + 1)
    : messageKey;
  await ChatMessage.create({
    content: `<div class="veiled-rolls-whisper"><p>${t(suffix)}</p></div>`,
    whisper: [targetUserId],
    flags: { [FLAG_SCOPE]: { kind: "note" } }
  });
}
