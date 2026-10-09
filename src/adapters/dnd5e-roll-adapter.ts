/**
 * Dnd5eRollAdapter
 *
 * Every access to D&D5e's internal roll structures is confined to this file so
 * the rest of the module never depends on system internals directly. The V2 roll
 * refactor passes `(config, dialog, message)` to the `dnd5e.preRoll*V2` hooks and
 * `(rolls, data)` to the `dnd5e.roll*V2` hooks. Field access here is defensive
 * (multiple fallbacks) because exact shapes can differ between 5.x patch
 * releases, and we would rather let a roll proceed normally than crash.
 */

import { ROLL_OPTION_KEY } from "../constants.js";
import type { RollType } from "../types.js";

/** Actor/token/user identity extracted from a pending roll. */
export interface PreRollInfo {
  actor: AnyObject;
  actorUuid: string;
  tokenUuid: string | null;
  userId: string;
  key: string;
}

/** Result data extracted from a completed roll. */
export interface PostRollInfo {
  requestId: string | null;
  total: number;
  natural: number | null;
  formula: string | null;
}

/**
 * Whether an ability-check config was actually produced by a skill or tool roll.
 * D&D5e fires `preRollAbilityCheckV2` for skills and tools too, so the ability
 * handler must defer to the dedicated skill/tool handling to avoid double work.
 */
export function isSkillOrToolConfig(config: AnyObject): boolean {
  return Boolean(config?.skill || config?.tool);
}

/** Read the system key (skill/ability abbreviation) for a roll type. */
export function getRollKey(rollType: RollType, config: AnyObject): string | null {
  if (rollType === "skill") return config?.skill ?? null;
  // Ability checks and saving throws are both keyed on the ability id.
  return config?.ability ?? null;
}

/**
 * Extract the actor, token, user and key behind a pending roll.
 * @returns The identity, or `null` when it cannot be determined (roll proceeds).
 */
export function extractPreRollInfo(
  rollType: RollType,
  config: AnyObject
): PreRollInfo | null {
  const actor: AnyObject | undefined = config?.subject ?? config?.actor;
  if (!actor?.uuid) return null;
  const key = getRollKey(rollType, config);
  if (!key) return null;

  const tokenUuid: string | null =
    actor.token?.uuid ?? actor.getActiveTokens?.()?.[0]?.document?.uuid ?? null;

  return {
    actor,
    actorUuid: actor.uuid,
    tokenUuid,
    userId: game.user?.id ?? "unknown",
    key
  };
}

/**
 * Tag the first roll of a config with a correlation id so the completed roll can
 * be matched back to this interception decision in the post-roll hook.
 * @returns True when the tag was applied.
 */
export function markRollForInterception(config: AnyObject, requestId: string): boolean {
  const roll = config?.rolls?.[0];
  if (!roll) return false;
  roll.options = roll.options ?? {};
  roll.options[ROLL_OPTION_KEY] = requestId;
  return true;
}

/**
 * Prevent the public chat card for this roll from being created.
 * Setting `message.create = false` in a `preRoll*V2` hook stops D&D5e from
 * broadcasting any ChatMessage for the roll (verified for skill/ability/save).
 */
export function suppressPublicMessage(message: AnyObject): void {
  if (message) message.create = false;
}

/** Safely read a finite total from a roll. */
function readTotal(roll: AnyObject): number | null {
  const total = Number(roll?.total);
  return Number.isFinite(total) ? total : null;
}

/** Safely read the kept natural d20 face, if this is a d20-based roll. */
function readNatural(roll: AnyObject): number | null {
  const die = roll?.dice?.find?.((d: AnyObject) => d?.faces === 20) ?? roll?.dice?.[0];
  const value = Number(die?.total);
  return Number.isFinite(value) ? value : null;
}

/**
 * Extract results from a completed roll produced by a `dnd5e.roll*V2` hook.
 * @param rolls The rolls array passed to the hook.
 * @returns The correlation id, total, natural face and formula.
 */
export function extractPostRollInfo(rolls: AnyObject[]): PostRollInfo | null {
  const roll = rolls?.[0];
  if (!roll) return null;
  const total = readTotal(roll);
  if (total === null) return null;
  return {
    requestId: roll.options?.[ROLL_OPTION_KEY] ?? null,
    total,
    natural: readNatural(roll),
    formula: typeof roll.formula === "string" ? roll.formula : null
  };
}

/**
 * Read the actor uuid from a `dnd5e.roll*V2` hook's data payload.
 * @param data The second argument of the post-roll hook.
 */
export function extractPostActorUuid(data: AnyObject): string | null {
  const actor = data?.subject ?? data?.actor;
  return actor?.uuid ?? null;
}

/** A selectable roll key with its human-readable label. */
export interface RollKeyChoice {
  value: string;
  label: string;
}

/**
 * List every selectable key for a roll type, labelled in the user's language.
 *
 * Keys are read from the system's CONFIG tables when available (so they follow
 * the active language and any homebrew additions) and fall back to the standard
 * D&D5e sets otherwise. Skills and abilities use different tables: a skill roll
 * takes a skill key such as `acr`, while ability checks and saving throws take
 * an ability key such as `dex`.
 */
export function listRollKeys(rollType: RollType): RollKeyChoice[] {
  const config = CONFIG?.DND5E ?? {};
  const table = rollType === "skill" ? config.skills : config.abilities;
  const fallback = rollType === "skill" ? FALLBACK_SKILL_KEYS : FALLBACK_ABILITY_KEYS;
  const keys = table && typeof table === "object" ? Object.keys(table) : fallback;

  return keys
    .map((value) => ({ value, label: getKeyLabel(rollType, value) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** Standard D&D5e skill keys, used when CONFIG is unavailable. */
const FALLBACK_SKILL_KEYS = [
  "acr", "ani", "arc", "ath", "dec", "his", "ins", "itm", "inv",
  "med", "nat", "prc", "prf", "per", "rel", "slt", "ste", "sur"
];

/** Standard D&D5e ability keys, used when CONFIG is unavailable. */
const FALLBACK_ABILITY_KEYS = ["str", "dex", "con", "int", "wis", "cha"];

export function isDiceSoNiceActive(): boolean {
  return Boolean(game.modules?.get?.("dice-so-nice")?.active);
}

/**
 * Show a roll's 3D dice animation privately, to the given users only.
 *
 * Because the veiled roll never creates a public chat card, Dice So Nice would
 * otherwise not animate at all. This drives it directly so the roller (and GMs)
 * get the animation while the rest of the table sees nothing. Best-effort: any
 * failure is swallowed so it can never break the roll.
 * @param roll The evaluated Roll instance.
 * @param whisperUserIds Users allowed to see the animation.
 */
export async function showDicePrivately(
  roll: AnyObject,
  whisperUserIds: string[]
): Promise<void> {
  const dice3d = (game as AnyObject).dice3d;
  if (!dice3d?.showForRoll) return;
  try {
    // Signature: showForRoll(roll, user, synchronize, users, blind, messageID, speaker)
    await dice3d.showForRoll(roll, game.user, true, whisperUserIds, false, null, null);
  } catch (error) {
    console.warn("[veiled-rolls] Dice So Nice private animation failed", error);
  }
}

/** The actor a player would roll for: their assigned character, else a controlled token. */
export function resolvePlayerActor(): AnyObject | null {
  const assigned = game.user?.character as AnyObject | null;
  if (assigned) return assigned;
  const controlled = (canvas as AnyObject)?.tokens?.controlled ?? [];
  return controlled[0]?.actor ?? null;
}

/**
 * Trigger a skill/ability/save roll on an actor through the D&D5e 5.x API.
 *
 * Method names differ slightly across the system's history, so each call falls
 * back to older equivalents. The resulting roll flows through the normal pre-roll
 * hooks, and is therefore intercepted by the active filter like any manual roll.
 * @param actor The actor to roll for.
 * @param rollType The roll family requested.
 * @param key The system key (skill or ability abbreviation).
 * @returns True if a roll method was found and invoked.
 */
export async function triggerActorRoll(
  actor: AnyObject,
  rollType: RollType,
  key: string
): Promise<boolean> {
  try {
    if (rollType === "skill") {
      if (typeof actor.rollSkill === "function") {
        await actor.rollSkill({ skill: key });
        return true;
      }
    } else if (rollType === "saving_throw") {
      if (typeof actor.rollSavingThrow === "function") {
        await actor.rollSavingThrow({ ability: key });
        return true;
      }
      if (typeof actor.rollAbilitySave === "function") {
        await actor.rollAbilitySave(key);
        return true;
      }
    } else {
      if (typeof actor.rollAbilityCheck === "function") {
        await actor.rollAbilityCheck({ ability: key });
        return true;
      }
      if (typeof actor.rollAbilityTest === "function") {
        await actor.rollAbilityTest(key);
        return true;
      }
    }
  } catch (error) {
    console.error("[veiled-rolls] triggered roll failed", error);
  }
  return false;
}

/**
 * Resolve a human-readable, localised label for a roll key using the system's
 * CONFIG tables, falling back to the raw key when unavailable.
 */
export function getKeyLabel(rollType: RollType, key: string): string {
  const config = CONFIG?.DND5E ?? {};
  const table = rollType === "skill" ? config.skills : config.abilities;
  const entry = table?.[key];
  const label = entry?.label ?? entry?.name ?? key;
  return typeof label === "string" ? label : key;
}
