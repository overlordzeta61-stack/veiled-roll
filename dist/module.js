const MODULE_ID = "veiled-rolls";
const SOCKET_NAME = `module.${MODULE_ID}`;
const SCHEMA_VERSION = 2;
const SETTINGS = {
  activeFilter: "activeFilter",
  notifyUnexpectedRolls: "notifyUnexpectedRolls",
  maxHistoryEntries: "maxHistoryEntries"
};
const DEFAULT_MAX_HISTORY_ENTRIES = 200;
const FLAG_SCOPE = MODULE_ID;
const ROLL_OPTION_KEY = "veiledRequestId";
const ROLL_TYPES = ["skill", "ability_check", "saving_throw"];
const SOCKET_ACTIONS = {
  filteredRoll: "filteredRoll",
  requestRoll: "requestRoll"
};
const I18N_PREFIX = "VEILED_ROLLS";
function emptyActiveState() {
  return {
    active: false,
    blockId: null,
    revision: 0,
    descriptor: null,
    participants: [],
    processedCount: 0,
    activatedAt: null,
    activatedBy: null
  };
}
function registerSettings(openBlockLibrary2) {
  game.settings.register(MODULE_ID, SETTINGS.activeFilter, {
    scope: "world",
    config: false,
    type: Object,
    default: emptyActiveState()
  });
  game.settings.register(MODULE_ID, SETTINGS.notifyUnexpectedRolls, {
    name: "VEILED_ROLLS.Settings.NotifyUnexpected.Name",
    hint: "VEILED_ROLLS.Settings.NotifyUnexpected.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });
  game.settings.register(MODULE_ID, SETTINGS.maxHistoryEntries, {
    name: "VEILED_ROLLS.Settings.MaxHistory.Name",
    hint: "VEILED_ROLLS.Settings.MaxHistory.Hint",
    scope: "world",
    config: true,
    type: Number,
    default: DEFAULT_MAX_HISTORY_ENTRIES,
    range: { min: 20, max: 2e3, step: 20 }
  });
  game.settings.registerMenu(MODULE_ID, "blockLibraryMenu", {
    name: "VEILED_ROLLS.Settings.LibraryMenu.Name",
    label: "VEILED_ROLLS.Settings.LibraryMenu.Label",
    hint: "VEILED_ROLLS.Settings.LibraryMenu.Hint",
    icon: "fa-solid fa-mask",
    restricted: true,
    type: buildMenuApp(openBlockLibrary2)
  });
}
function buildMenuApp(openBlockLibrary2) {
  return class VeiledRollsLibraryMenu extends foundry.applications.api.ApplicationV2 {
    static DEFAULT_OPTIONS = { id: "veiled-rolls-library-menu" };
    async _prepareContext() {
      return {};
    }
    async render() {
      openBlockLibrary2();
      await this.close();
      return this;
    }
  };
}
function getModuleSetting(key) {
  return game.settings.get(MODULE_ID, key);
}
function readActiveState() {
  const stored = game.settings.get(MODULE_ID, SETTINGS.activeFilter);
  return stored ?? emptyActiveState();
}
async function writeActiveState(state) {
  await game.settings.set(MODULE_ID, SETTINGS.activeFilter, state);
}
function getState() {
  return readActiveState();
}
function buildDescriptor(block) {
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
async function activate(block) {
  const previous = getState();
  const state = {
    active: true,
    blockId: block.id,
    revision: previous.revision + 1,
    descriptor: buildDescriptor(block),
    participants: [],
    processedCount: 0,
    activatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    activatedBy: game.user?.id ?? null
  };
  await writeActiveState(state);
  return state;
}
async function disable() {
  const previous = getState();
  const state = { ...emptyActiveState(), revision: previous.revision + 1 };
  await writeActiveState(state);
  return state;
}
async function resetParticipants() {
  const state = getState();
  if (!state.active) return;
  await writeActiveState({ ...state, participants: [], processedCount: 0 });
}
async function recordParticipant(record) {
  const state = getState();
  if (!state.active) return;
  const participants = [...state.participants];
  const index = participants.findIndex((p) => p.actorUuid === record.actorUuid);
  if (index >= 0) participants[index] = record;
  else participants.push(record);
  await writeActiveState({ ...state, participants });
}
async function incrementProcessed() {
  const state = getState();
  if (!state.active) return 0;
  const processedCount = state.processedCount + 1;
  await writeActiveState({ ...state, processedCount });
  return processedCount;
}
function makeParticipant(actorUuid, actorName, status, lastTotal = null) {
  return {
    actorUuid,
    actorName,
    status,
    lastTotal,
    lastRollAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
const ALLOWED_TAGS = /* @__PURE__ */ new Set([
  "b",
  "i",
  "em",
  "strong",
  "u",
  "s",
  "br",
  "p",
  "span",
  "ul",
  "ol",
  "li",
  "blockquote"
]);
const STRIP_ELEMENT_REGEX = /<(script|style|iframe|object|embed|link|meta)\b[\s\S]*?<\/\1\s*>/gi;
const STRIP_OPENER_REGEX = /<(script|style|iframe|object|embed|link|meta)\b[^>]*>/gi;
const TAG_REGEX = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g;
function sanitizeHtml(input) {
  if (!input) return "";
  let output = input.replace(STRIP_ELEMENT_REGEX, "");
  output = output.replace(STRIP_OPENER_REGEX, "");
  output = output.replace(TAG_REGEX, (match, rawName) => {
    const name = rawName.toLowerCase();
    if (!ALLOWED_TAGS.has(name)) return "";
    const isClosing = match.startsWith("</");
    if (isClosing) return `</${name}>`;
    const isSelfClosing = /\/>$/.test(match) || name === "br";
    return isSelfClosing ? `<${name}>` : `<${name}>`;
  });
  return output;
}
function containsDangerousHtml(input) {
  if (!input) return false;
  return /<\s*script\b/i.test(input) || /\bon[a-z]+\s*=/i.test(input) || /javascript\s*:/i.test(input);
}
function exportBlocks(blocks, nowIso) {
  return {
    schema_version: SCHEMA_VERSION,
    exported_at: nowIso,
    blocks: structuredClone(blocks)
  };
}
function toNullableNumber(value) {
  if (value === null || value === void 0) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function toStr(value) {
  return typeof value === "string" ? value : "";
}
const VALID_ROLL_TYPES = ["skill", "ability_check", "saving_throw"];
function coerceTier(raw, idFactory) {
  const r = raw ?? {};
  const responses = Array.isArray(r.responses) ? r.responses.map((x) => sanitizeHtml(toStr(x))).filter((x) => x.length > 0) : [];
  const natural = r.natural_roll === "natural_1" || r.natural_roll === "natural_20" ? r.natural_roll : "any";
  return {
    id: toStr(r.id) || idFactory(),
    minimum: toNullableNumber(r.minimum),
    maximum: toNullableNumber(r.maximum),
    responses,
    gm_note: toStr(r.gm_note),
    natural_roll: natural,
    weighting: "equal"
  };
}
function coercePersonal(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    const r = entry ?? {};
    return { user_id: toStr(r.user_id), response: sanitizeHtml(toStr(r.response)) };
  }).filter((p) => p.user_id.length > 0 && p.response.trim().length > 0);
}
function coerceBranch(raw, idFactory) {
  const r = raw ?? {};
  const rollType = VALID_ROLL_TYPES.includes(r.roll_type) ? r.roll_type : "skill";
  const tiers = Array.isArray(r.tiers) ? r.tiers.map((t2) => coerceTier(t2, idFactory)) : [];
  return {
    id: toStr(r.id) || idFactory(),
    label: toStr(r.label),
    roll_type: rollType,
    key: toStr(r.key),
    tiers,
    personal_responses: coercePersonal(r.personal_responses)
  };
}
function coerceSelector(raw) {
  const r = raw ?? {};
  const rollType = VALID_ROLL_TYPES.includes(r.roll_type) ? r.roll_type : "skill";
  return {
    roll_type: rollType,
    key: toStr(r.key),
    label: toStr(r.label),
    branch_id: toStr(r.branch_id)
  };
}
function coerceOptions(raw) {
  const r = raw ?? {};
  const bool = (v, fallback) => typeof v === "boolean" ? v : fallback;
  return {
    include_gm_in_whisper: bool(r.include_gm_in_whisper, true),
    show_total_to_gm: bool(r.show_total_to_gm, true),
    show_result_to_player: bool(r.show_result_to_player, true),
    color_by_tier: bool(r.color_by_tier, true),
    // Back-compat: old blocks used hide_dice_animation (true = no animation).
    dice_so_nice_mode: r.dice_so_nice_mode === "private" || r.dice_so_nice_mode === "disabled" ? r.dice_so_nice_mode : r.hide_dice_animation === false ? "private" : "disabled",
    duplicate_policy: r.duplicate_policy === "accept_all" || r.duplicate_policy === "replace_previous" || r.duplicate_policy === "ask_gm" ? r.duplicate_policy : "first_per_actor",
    participant_mode: r.participant_mode === "selected_tokens" || r.participant_mode === "selected_actors" || r.participant_mode === "selected_users" ? r.participant_mode : "all_players",
    participant_ids: Array.isArray(r.participant_ids) ? r.participant_ids.map(toStr).filter((x) => x.length > 0) : [],
    auto_close_mode: r.auto_close_mode === "after_roll_count" || r.auto_close_mode === "after_each_participant" ? r.auto_close_mode : "manual",
    auto_close_roll_count: toNullableNumber(r.auto_close_roll_count),
    send_fallback_response: bool(r.send_fallback_response, true),
    fallback_response: sanitizeHtml(toStr(r.fallback_response)),
    randomize_equal_tier_responses: bool(r.randomize_equal_tier_responses, true)
  };
}
function coerceImportedBlock(raw, idFactory, nowIso, userId) {
  const r = raw ?? {};
  const mode = r.mode === "cumulative_threshold" ? "cumulative_threshold" : "exclusive_range";
  const meta = r.metadata ?? {};
  return {
    id: toStr(r.id) || idFactory(),
    name: toStr(r.name),
    folder: toStr(r.folder),
    description: toStr(r.description),
    enabled: typeof r.enabled === "boolean" ? r.enabled : true,
    mode,
    selectors: Array.isArray(r.selectors) ? r.selectors.map(coerceSelector) : [],
    branches: Array.isArray(r.branches) ? r.branches.map((b) => coerceBranch(b, idFactory)) : [],
    options: coerceOptions(r.options),
    metadata: {
      created_at: toStr(meta.created_at) || nowIso,
      updated_at: nowIso,
      created_by: toStr(meta.created_by) || userId,
      schema_version: SCHEMA_VERSION
    }
  };
}
function applyImport(existing, incoming, strategy, idFactory) {
  const result = structuredClone(existing);
  const byId = new Map(result.map((b, i) => [b.id, i]));
  const summary = { added: 0, replaced: 0, skipped: 0, duplicated: 0 };
  for (const block of incoming) {
    const existsAt = byId.get(block.id);
    if (existsAt === void 0) {
      result.push(block);
      byId.set(block.id, result.length - 1);
      summary.added++;
      continue;
    }
    if (strategy === "skip") {
      summary.skipped++;
    } else if (strategy === "replace") {
      result[existsAt] = block;
      summary.replaced++;
    } else {
      const clone2 = { ...structuredClone(block), id: idFactory() };
      clone2.name = `${clone2.name} (copie)`;
      result.push(clone2);
      byId.set(clone2.id, result.length - 1);
      summary.duplicated++;
    }
  }
  return { blocks: result, summary };
}
const KNOWN_SKILL_KEYS = /* @__PURE__ */ new Set([
  "acr",
  "ani",
  "arc",
  "ath",
  "dec",
  "his",
  "ins",
  "itm",
  "inv",
  "med",
  "nat",
  "prc",
  "prf",
  "per",
  "rel",
  "slt",
  "ste",
  "sur"
]);
const KNOWN_ABILITY_KEYS = /* @__PURE__ */ new Set([
  "str",
  "dex",
  "con",
  "int",
  "wis",
  "cha"
]);
function isKnownKey(rollType, key) {
  if (rollType === "skill") return KNOWN_SKILL_KEYS.has(key);
  return KNOWN_ABILITY_KEYS.has(key);
}
function hasOverlappingRanges(branch) {
  const ranges = branch.tiers.filter((t2) => t2.natural_roll === "any").map((t2) => ({
    min: t2.minimum ?? Number.NEGATIVE_INFINITY,
    max: t2.maximum ?? Number.POSITIVE_INFINITY
  })).sort((a, b) => a.min - b.min);
  for (let i = 1; i < ranges.length; i++) {
    if (ranges[i].min <= ranges[i - 1].max) return true;
  }
  return false;
}
function validateBlock(block) {
  const errors = [];
  if (!block.name || block.name.trim().length === 0) {
    errors.push({ path: "name", messageKey: "VEILED_ROLLS.Validation.NameRequired" });
  }
  if (!Array.isArray(block.selectors) || block.selectors.length === 0) {
    errors.push({ path: "selectors", messageKey: "VEILED_ROLLS.Validation.SelectorRequired" });
  }
  const branchIds = new Set((block.branches ?? []).map((b) => b.id));
  (block.selectors ?? []).forEach((selector, index) => {
    if (!branchIds.has(selector.branch_id)) {
      errors.push({
        path: `selectors.${index}.branch_id`,
        messageKey: "VEILED_ROLLS.Validation.BranchMissing",
        data: { branch: selector.branch_id }
      });
    }
    if (!isKnownKey(selector.roll_type, selector.key)) {
      errors.push({
        path: `selectors.${index}.key`,
        messageKey: "VEILED_ROLLS.Validation.UnknownKey",
        data: { key: selector.key, type: selector.roll_type }
      });
    }
  });
  (block.branches ?? []).forEach((branch, bIndex) => {
    const personal = branch.personal_responses ?? [];
    if ((!Array.isArray(branch.tiers) || branch.tiers.length === 0) && personal.length === 0) {
      errors.push({
        path: `branches.${bIndex}.tiers`,
        messageKey: "VEILED_ROLLS.Validation.TierRequired",
        data: { branch: branch.label ?? branch.id }
      });
    }
    (branch.tiers ?? []).forEach((tier, tIndex) => {
      const nonEmpty = (tier.responses ?? []).filter((r) => r.trim().length > 0);
      if (nonEmpty.length === 0) {
        errors.push({
          path: `branches.${bIndex}.tiers.${tIndex}.responses`,
          messageKey: "VEILED_ROLLS.Validation.EmptyResponse"
        });
      }
      for (const response of tier.responses ?? []) {
        if (containsDangerousHtml(response)) {
          errors.push({
            path: `branches.${bIndex}.tiers.${tIndex}.responses`,
            messageKey: "VEILED_ROLLS.Validation.DangerousHtml"
          });
          break;
        }
      }
    });
    const seenUsers = /* @__PURE__ */ new Set();
    personal.forEach((entry, pIndex) => {
      const path = `branches.${bIndex}.personal_responses.${pIndex}`;
      if (!entry.user_id) {
        errors.push({ path, messageKey: "VEILED_ROLLS.Validation.PersonalUserRequired" });
      } else if (seenUsers.has(entry.user_id)) {
        errors.push({ path, messageKey: "VEILED_ROLLS.Validation.PersonalDuplicate" });
      }
      seenUsers.add(entry.user_id);
      if (!entry.response || entry.response.trim().length === 0) {
        errors.push({ path, messageKey: "VEILED_ROLLS.Validation.PersonalEmpty" });
      } else if (containsDangerousHtml(entry.response)) {
        errors.push({ path, messageKey: "VEILED_ROLLS.Validation.DangerousHtml" });
      }
    });
    if (block.mode === "exclusive_range" && hasOverlappingRanges(branch)) {
      errors.push({
        path: `branches.${bIndex}.tiers`,
        messageKey: "VEILED_ROLLS.Validation.OverlappingRanges",
        data: { branch: branch.label ?? branch.id }
      });
    }
  });
  return { valid: errors.length === 0, errors };
}
function validateImportShape(payload) {
  const errors = [];
  if (typeof payload !== "object" || payload === null) {
    errors.push({ path: "", messageKey: "VEILED_ROLLS.Import.Malformed" });
    return { valid: false, errors };
  }
  const record = payload;
  if (typeof record.schema_version !== "number") {
    errors.push({ path: "schema_version", messageKey: "VEILED_ROLLS.Import.MissingVersion" });
  } else if (record.schema_version > SCHEMA_VERSION) {
    errors.push({
      path: "schema_version",
      messageKey: "VEILED_ROLLS.Import.UnsupportedVersion",
      data: { found: record.schema_version, supported: SCHEMA_VERSION }
    });
  }
  if (!Array.isArray(record.blocks)) {
    errors.push({ path: "blocks", messageKey: "VEILED_ROLLS.Import.NoBlocks" });
  }
  return { valid: errors.length === 0, errors };
}
const BLOCKS_FLAG = "blocks";
const STORE_FLAG = "store";
const STORE_NAME = "Jets voilés — données privées";
let storeJournal = null;
function newId$1() {
  return foundry.utils.randomID();
}
async function ensureStore() {
  if (storeJournal) return storeJournal;
  const existing = game.journal?.find(
    (j) => j.getFlag(MODULE_ID, STORE_FLAG) === true
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
function getJournalEntryClass() {
  return globalThis.JournalEntry ?? foundry.documents?.JournalEntry ?? CONFIG.JournalEntry.documentClass;
}
async function getBlocks() {
  const store = await ensureStore();
  const raw = store.getFlag(MODULE_ID, BLOCKS_FLAG);
  return raw ? structuredClone(raw) : [];
}
async function getBlock(id) {
  const blocks = await getBlocks();
  return blocks.find((b) => b.id === id);
}
async function persist(blocks) {
  const store = await ensureStore();
  await store.setFlag(MODULE_ID, BLOCKS_FLAG, blocks);
}
async function upsertBlock(block) {
  const validation = validateBlock(block);
  if (!validation.valid) return validation;
  const blocks = await getBlocks();
  const now = (/* @__PURE__ */ new Date()).toISOString();
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
async function duplicateBlock(id) {
  const blocks = await getBlocks();
  const source = blocks.find((b) => b.id === id);
  if (!source) return void 0;
  const copy = structuredClone(source);
  copy.id = newId$1();
  copy.name = `${source.name} (copie)`;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  copy.metadata = { ...copy.metadata, created_at: now, updated_at: now };
  blocks.push(copy);
  await persist(blocks);
  return copy;
}
async function deleteBlock(id) {
  const blocks = await getBlocks();
  await persist(blocks.filter((b) => b.id !== id));
}
async function exportLibrary(ids) {
  const blocks = await getBlocks();
  const selected = ids ? blocks.filter((b) => ids.includes(b.id)) : blocks;
  return exportBlocks(selected, (/* @__PURE__ */ new Date()).toISOString());
}
async function importLibrary(json, strategy) {
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, errors: [{ path: "", messageKey: "VEILED_ROLLS.Import.Malformed" }] };
  }
  const shape = validateImportShape(parsed);
  if (!shape.valid) return { ok: false, errors: shape.errors };
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const userId = game.user?.id ?? "unknown";
  const rawBlocks = parsed.blocks;
  const coerced = rawBlocks.map((b) => coerceImportedBlock(b, newId$1, now, userId));
  const invalid = coerced.flatMap((b) => validateBlock(b).errors);
  if (invalid.length > 0) return { ok: false, errors: invalid };
  const existing = await getBlocks();
  const { blocks, summary } = applyImport(existing, coerced, strategy, newId$1);
  await persist(blocks);
  return { ok: true, summary };
}
function assertGm() {
  if (!game.user?.isGM) {
    throw new Error(game.i18n.localize("VEILED_ROLLS.Api.GmOnly"));
  }
}
function clone(value) {
  return structuredClone(value);
}
function createApi(hooks) {
  return {
    openControlPanel() {
      assertGm();
      hooks.openControlPanel();
    },
    openBlockLibrary() {
      assertGm();
      hooks.openBlockLibrary();
    },
    async activate(blockId) {
      assertGm();
      const block = await getBlock(blockId);
      if (!block) throw new Error(game.i18n.localize("VEILED_ROLLS.Api.BlockNotFound"));
      const validation = validateBlock(block);
      if (!validation.valid) {
        throw new Error(game.i18n.localize("VEILED_ROLLS.Api.BlockInvalid"));
      }
      return activate(block);
    },
    async disable() {
      assertGm();
      return disable();
    },
    getActiveState() {
      assertGm();
      return clone(getState());
    },
    async getBlocks() {
      assertGm();
      const blocks = await getBlocks();
      return blocks.map(clone);
    }
  };
}
function isSkillOrToolConfig(config) {
  return Boolean(config?.skill || config?.tool);
}
function getRollKey(rollType, config) {
  if (rollType === "skill") return config?.skill ?? null;
  return config?.ability ?? null;
}
function extractPreRollInfo(rollType, config) {
  const actor = config?.subject ?? config?.actor;
  if (!actor?.uuid) return null;
  const key = getRollKey(rollType, config);
  if (!key) return null;
  const tokenUuid = actor.token?.uuid ?? actor.getActiveTokens?.()?.[0]?.document?.uuid ?? null;
  return {
    actor,
    actorUuid: actor.uuid,
    tokenUuid,
    userId: game.user?.id ?? "unknown",
    key
  };
}
function markRollForInterception(config, requestId) {
  const roll = config?.rolls?.[0];
  if (!roll) return false;
  roll.options = roll.options ?? {};
  roll.options[ROLL_OPTION_KEY] = requestId;
  return true;
}
function suppressPublicMessage(message) {
  if (message) message.create = false;
}
function readTotal(roll) {
  const total = Number(roll?.total);
  return Number.isFinite(total) ? total : null;
}
function readNatural(roll) {
  const die = roll?.dice?.find?.((d) => d?.faces === 20) ?? roll?.dice?.[0];
  const value = Number(die?.total);
  return Number.isFinite(value) ? value : null;
}
function extractPostRollInfo(rolls) {
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
function listRollKeys(rollType) {
  const config = CONFIG?.DND5E ?? {};
  const table = rollType === "skill" ? config.skills : config.abilities;
  const fallback = rollType === "skill" ? FALLBACK_SKILL_KEYS : FALLBACK_ABILITY_KEYS;
  const keys = table && typeof table === "object" ? Object.keys(table) : fallback;
  return keys.map((value) => ({ value, label: getKeyLabel(rollType, value) })).sort((a, b) => a.label.localeCompare(b.label));
}
const FALLBACK_SKILL_KEYS = [
  "acr",
  "ani",
  "arc",
  "ath",
  "dec",
  "his",
  "ins",
  "itm",
  "inv",
  "med",
  "nat",
  "prc",
  "prf",
  "per",
  "rel",
  "slt",
  "ste",
  "sur"
];
const FALLBACK_ABILITY_KEYS = ["str", "dex", "con", "int", "wis", "cha"];
async function showDicePrivately(roll, whisperUserIds) {
  const dice3d = game.dice3d;
  if (!dice3d?.showForRoll) return;
  try {
    await dice3d.showForRoll(roll, game.user, true, whisperUserIds, false, null, null);
  } catch (error) {
    console.warn("[veiled-rolls] Dice So Nice private animation failed", error);
  }
}
function resolvePlayerActor() {
  const assigned = game.user?.character;
  if (assigned) return assigned;
  const controlled = canvas?.tokens?.controlled ?? [];
  return controlled[0]?.actor ?? null;
}
async function triggerActorRoll(actor, rollType, key) {
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
function getKeyLabel(rollType, key) {
  const config = CONFIG?.DND5E ?? {};
  const table = rollType === "skill" ? config.skills : config.abilities;
  const entry = table?.[key];
  const label = entry?.label ?? entry?.name ?? key;
  return typeof label === "string" ? label : key;
}
function decideDuplicate(policy, actorUuid, seenActorUuids) {
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
const HISTORY_FLAG = "history";
function maxEntries() {
  const value = game.settings.get(MODULE_ID, SETTINGS.maxHistoryEntries);
  return typeof value === "number" && value > 0 ? value : DEFAULT_MAX_HISTORY_ENTRIES;
}
async function getHistory() {
  const store = await ensureStore();
  const raw = store.getFlag(MODULE_ID, HISTORY_FLAG);
  return raw ? structuredClone(raw) : [];
}
async function addHistory(entry) {
  const store = await ensureStore();
  const history = await getHistory();
  history.push(entry);
  const trimmed = history.slice(-maxEntries());
  await store.setFlag(MODULE_ID, HISTORY_FLAG, trimmed);
}
async function clearHistory() {
  const store = await ensureStore();
  await store.setFlag(MODULE_ID, HISTORY_FLAG, []);
}
function matchesParticipant(config, candidate) {
  switch (config.mode) {
    case "all_players":
      return true;
    case "selected_users":
      return config.participantIds.includes(candidate.userId);
    case "selected_actors":
      return candidate.actorUuid !== null && config.participantIds.includes(candidate.actorUuid);
    case "selected_tokens":
      return candidate.tokenUuid !== null && config.participantIds.includes(candidate.tokenUuid);
    default:
      return false;
  }
}
let handler = null;
let requestHandler = null;
const processedIds = [];
const PROCESSED_CAP = 500;
function markProcessed(requestId) {
  processedIds.push(requestId);
  if (processedIds.length > PROCESSED_CAP) processedIds.shift();
}
function responsibleGmId() {
  const active = game.users?.activeGM;
  if (active?.id) return active.id;
  const gms = game.users?.filter((u) => u.isGM && u.active).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return gms?.[0]?.id ?? null;
}
function isResponsibleGm() {
  return Boolean(game.user?.id) && game.user.id === responsibleGmId();
}
function registerSocket(processingHandler) {
  handler = processingHandler;
  game.socket.on(SOCKET_NAME, onSocketMessage);
}
function registerRollRequestHandler(handlerFn) {
  requestHandler = handlerFn;
}
function onSocketMessage(data) {
  if (!data) return;
  if (data.action === SOCKET_ACTIONS.filteredRoll) {
    onFilteredRoll(data.payload);
  } else if (data.action === SOCKET_ACTIONS.requestRoll) {
    onRollRequest(data.payload);
  }
}
function onFilteredRoll(context) {
  if (!isResponsibleGm()) return;
  if (!context?.request_id || processedIds.includes(context.request_id)) return;
  markProcessed(context.request_id);
  void handler?.(context).catch((error) => {
    console.error("[veiled-rolls] failed to process filtered roll", error);
    ui.notifications?.error(game.i18n.localize("VEILED_ROLLS.Notify.ProcessError"));
  });
}
function onRollRequest(request) {
  if (!request?.requestId) return;
  if (game.user?.isGM) return;
  const targets = request.targetUserIds;
  if (targets !== null && !targets.includes(game.user?.id ?? "")) return;
  void requestHandler?.(request).catch((error) => {
    console.error("[veiled-rolls] failed to handle roll request", error);
  });
}
function emitFilteredRoll(context) {
  game.socket.emit(SOCKET_NAME, {
    action: SOCKET_ACTIONS.filteredRoll,
    payload: context
  });
}
function markLocallyProcessed(requestId) {
  markProcessed(requestId);
}
function emitRollRequest(request) {
  game.socket.emit(SOCKET_NAME, {
    action: SOCKET_ACTIONS.requestRoll,
    payload: request
  });
}
function selectorId(rollType, key) {
  return `${rollType}|${key}`;
}
const outstanding = /* @__PURE__ */ new Map();
function connectedPlayers() {
  return (game.users ?? []).filter((u) => !u.isGM && u.active).map((u) => ({ id: u.id, name: u.name }));
}
function outstandingSelectorIds() {
  return new Set(outstanding.keys());
}
function outstandingUsers(rollType, key) {
  return [...outstanding.get(selectorId(rollType, key)) ?? []];
}
function resetRequests() {
  outstanding.clear();
}
function requestRoll(rollType, key, targetUserIds) {
  const state = getState();
  if (!state.active || !state.blockId || !state.descriptor) {
    ui.notifications?.warn(game.i18n.localize("VEILED_ROLLS.Request.NeedActive"));
    return false;
  }
  const audience = targetUserIds && targetUserIds.length > 0 ? targetUserIds : connectedPlayers().map((p) => p.id);
  const request = {
    rollType,
    key,
    keyLabel: getKeyLabel(rollType, key),
    blockId: state.blockId,
    blockName: state.descriptor.blockName,
    targetUserIds: targetUserIds && targetUserIds.length > 0 ? targetUserIds : null,
    requestId: foundry.utils.randomID()
  };
  emitRollRequest(request);
  if (audience.length > 0) {
    outstanding.set(selectorId(rollType, key), new Set(audience));
  }
  const scope = request.targetUserIds === null ? game.i18n.localize("VEILED_ROLLS.Request.ScopeAll") : request.targetUserIds.map((id) => game.users?.get(id)?.name ?? id).join(", ");
  ui.notifications?.info(
    game.i18n.format("VEILED_ROLLS.Request.Sent", { roll: request.keyLabel, scope })
  );
  return true;
}
async function markRequestProgress(userId, rollType, key) {
  const id = selectorId(rollType, key);
  const expected = outstanding.get(id);
  if (!expected) return;
  expected.delete(userId);
  if (expected.size === 0) outstanding.delete(id);
  if (outstanding.size === 0) {
    await disable();
    resetRequests();
    ui.notifications?.info(game.i18n.localize("VEILED_ROLLS.Request.AllDone"));
  }
}
const defaultRandom = Math.random;
function findBranch(block, rollType, key) {
  const selector = block.selectors.find(
    (s) => s.roll_type === rollType && s.key === key
  );
  if (!selector) return void 0;
  return block.branches.find((b) => b.id === selector.branch_id);
}
function naturalConstraintSatisfied(tier, natural) {
  if (tier.natural_roll === "any") return true;
  if (natural === null) return false;
  if (tier.natural_roll === "natural_1") return natural === 1;
  if (tier.natural_roll === "natural_20") return natural === 20;
  return true;
}
function totalWithinRange(tier, total) {
  const aboveMin = tier.minimum === null || total >= tier.minimum;
  const belowMax = tier.maximum === null || total <= tier.maximum;
  return aboveMin && belowMax;
}
function pickResponse(tier, randomize, random) {
  const pool = tier.responses.filter((r) => r.trim().length > 0);
  if (pool.length === 0) return "";
  if (pool.length === 1 || !randomize) return pool[0];
  const index = Math.floor(random() * pool.length);
  return pool[Math.min(index, pool.length - 1)];
}
function resolveExclusiveRange(branch, total, natural, randomize, random) {
  const candidates = branch.tiers.filter(
    (tier) => totalWithinRange(tier, total) && naturalConstraintSatisfied(tier, natural)
  );
  if (candidates.length === 0) return null;
  const naturalSpecific = candidates.find((t2) => t2.natural_roll !== "any");
  const chosen = naturalSpecific ?? candidates[0];
  const paragraph = pickResponse(chosen, randomize, random);
  if (!paragraph) return null;
  return {
    paragraphs: [paragraph],
    tierIds: [chosen.id],
    usedFallback: false,
    personal: false,
    tone: rankTone(branch, [chosen.id])
  };
}
function rankTone(branch, reachedIds) {
  const ordered = [...branch.tiers].sort(
    (a, b) => (a.minimum ?? -Infinity) - (b.minimum ?? -Infinity)
  );
  if (ordered.length < 2 || reachedIds.length === 0) return null;
  const highest = ordered.reduce((best, tier, index) => {
    return reachedIds.includes(tier.id) ? index : best;
  }, -1);
  if (highest < 0) return null;
  return highest / (ordered.length - 1);
}
function resolveCumulativeThreshold(branch, total, natural, randomize, random) {
  const reached = branch.tiers.filter(
    (tier) => (tier.minimum === null || total >= tier.minimum) && naturalConstraintSatisfied(tier, natural)
  ).sort((a, b) => (a.minimum ?? -Infinity) - (b.minimum ?? -Infinity));
  if (reached.length === 0) return null;
  const paragraphs = [];
  const tierIds = [];
  for (const tier of reached) {
    const paragraph = pickResponse(tier, randomize, random);
    if (paragraph) {
      paragraphs.push(paragraph);
      tierIds.push(tier.id);
    }
  }
  if (paragraphs.length === 0) return null;
  return {
    paragraphs,
    tierIds,
    usedFallback: false,
    personal: false,
    tone: rankTone(branch, tierIds)
  };
}
function findPersonalResponse(branch, candidateUserIds) {
  const usable = (branch.personal_responses ?? []).filter(
    (p) => p.user_id && p.response.trim().length > 0
  );
  for (const userId of candidateUserIds) {
    const match = usable.find((p) => p.user_id === userId);
    if (match) return match;
  }
  return void 0;
}
function resolveResponse(block, context, random = defaultRandom, candidateUserIds = []) {
  const branch = findBranch(block, context.roll_type, context.key);
  if (!branch) return fallbackOrNull(block);
  const personal = findPersonalResponse(branch, candidateUserIds);
  if (personal) {
    return {
      paragraphs: [personal.response],
      tierIds: [],
      usedFallback: false,
      personal: true,
      tone: null
    };
  }
  const randomize = block.options.randomize_equal_tier_responses;
  const resolved = block.mode === "cumulative_threshold" ? resolveCumulativeThreshold(
    branch,
    context.total,
    context.natural_result,
    randomize,
    random
  ) : resolveExclusiveRange(
    branch,
    context.total,
    context.natural_result,
    randomize,
    random
  );
  return resolved ?? fallbackOrNull(block);
}
function fallbackOrNull(block) {
  if (block.options.send_fallback_response && block.options.fallback_response.trim().length > 0) {
    return {
      paragraphs: [block.options.fallback_response],
      tierIds: [],
      usedFallback: true,
      personal: false,
      tone: null
    };
  }
  return null;
}
function t(key, data) {
  const full = `${I18N_PREFIX}.${key}`;
  return data ? game.i18n.format(full, data) : game.i18n.localize(full);
}
function activeGmIds() {
  return game.users.filter((u) => u.isGM && u.active).map((u) => u.id);
}
function escapeText$1(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function toneClass(tone) {
  if (tone === null) return "";
  if (tone >= 0.8) return " tone-5";
  if (tone >= 0.6) return " tone-4";
  if (tone >= 0.4) return " tone-3";
  if (tone >= 0.2) return " tone-2";
  return " tone-1";
}
function buildPlayerContent(block, context, actorName, resolved) {
  const title = t("Whisper.PlayerTitle", { actor: escapeText$1(actorName) });
  const body = resolved.paragraphs.map((p) => `<p>${p}</p>`).join("");
  let total = "";
  if (block.options.show_result_to_player) {
    const natural = context.natural_result !== null ? ` (${t("Diag.Natural")} ${context.natural_result})` : "";
    total = `<p class="veiled-rolls-whisper-total">${t("Whisper.YourResult", {
      total: context.total
    })}${natural}</p>`;
  }
  const tone = block.options.color_by_tier ? toneClass(resolved.tone) : "";
  return `<div class="veiled-rolls-whisper${tone}"><p class="veiled-rolls-whisper-title">${title}</p>${body}${total}</div>`;
}
function buildGmContent(block, context, resolved, actorName, userName2, keyLabel) {
  const rows = [
    [t("Diag.Block"), escapeText$1(block.name)],
    [t("Diag.Player"), escapeText$1(userName2)],
    [t("Diag.Actor"), escapeText$1(actorName)],
    [t("Diag.Roll"), escapeText$1(keyLabel)],
    [t("Diag.Total"), String(context.total)]
  ];
  if (context.natural_result !== null) {
    rows.push([t("Diag.Natural"), String(context.natural_result)]);
  }
  rows.push([
    t("Diag.Tiers"),
    resolved.personal ? t("Diag.Personal") : resolved.usedFallback ? t("Diag.Fallback") : resolved.tierIds.join(", ") || "—"
  ]);
  const list = rows.map(([k, v]) => `<li><strong>${k}:</strong> ${v}</li>`).join("");
  return `<div class="veiled-rolls-diag"><p class="veiled-rolls-diag-title">${t(
    "Diag.Title"
  )}</p><ul>${list}</ul></div>`;
}
function speakerFor(actor, actorName) {
  if (actor) return ChatMessage.getSpeaker({ actor });
  return { alias: actorName };
}
async function deliverResponse(params) {
  const { block, context, resolved } = params;
  const gmIds = activeGmIds();
  const includeGm = block.options.include_gm_in_whisper;
  const playerRecipients = Array.from(
    /* @__PURE__ */ new Set([params.targetUserId, ...includeGm ? gmIds : []])
  );
  const created = [];
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
function ownerUserIds(actor) {
  const ownership = actor?.ownership ?? {};
  const owners = [];
  for (const user of game.users ?? []) {
    if (user.isGM) continue;
    const level = ownership[user.id] ?? ownership.default ?? 0;
    if (level >= 3) owners.push(user.id);
  }
  return owners;
}
async function resendHistory(entry) {
  const actor = await fromUuid(entry.actorUuid);
  const recipients = Array.from(/* @__PURE__ */ new Set([...ownerUserIds(actor), ...activeGmIds()]));
  const body = entry.responseParagraphs.map((p) => `<p>${p}</p>`).join("");
  const title = t("Whisper.PlayerTitle", { actor: escapeText$1(entry.actorName) });
  await ChatMessage.create({
    speaker: speakerFor(actor, entry.actorName),
    content: `<div class="veiled-rolls-whisper"><p class="veiled-rolls-whisper-title">${title}</p>${body}</div>`,
    whisper: recipients,
    flags: { [FLAG_SCOPE]: { kind: "resend", blockId: entry.blockId } }
  });
}
async function sendPlayerNote(targetUserId, messageKey) {
  const suffix = messageKey.startsWith(`${I18N_PREFIX}.`) ? messageKey.slice(I18N_PREFIX.length + 1) : messageKey;
  await ChatMessage.create({
    content: `<div class="veiled-rolls-whisper"><p>${t(suffix)}</p></div>`,
    whisper: [targetUserId],
    flags: { [FLAG_SCOPE]: { kind: "note" } }
  });
}
const DONE_FLAG = "done";
function rollId(blockId, rollType, key) {
  return `${blockId}|${rollType}|${key}`;
}
function doneFromHistory(history) {
  const done = {};
  for (const h of history) {
    const id = rollId(h.blockId, h.rollType, h.key);
    if (done[id] === void 0 || h.timestamp < done[id]) done[id] = h.timestamp;
  }
  return done;
}
async function getDone() {
  const store = await ensureStore();
  const raw = store.getFlag(MODULE_ID, DONE_FLAG);
  if (Array.isArray(raw)) return Object.fromEntries(raw);
  const history = store.getFlag(MODULE_ID, "history") ?? [];
  const migrated = doneFromHistory(history);
  await writeDone(migrated);
  return migrated;
}
async function writeDone(done) {
  const store = await ensureStore();
  await store.setFlag(MODULE_ID, DONE_FLAG, Object.entries(done));
}
async function markDone(blockId, rollType, key) {
  const done = await getDone();
  const id = rollId(blockId, rollType, key);
  if (done[id] !== void 0) return;
  done[id] = Date.now();
  await writeDone(done);
}
async function unmarkDone(blockId, rollType, key) {
  const done = await getDone();
  const id = rollId(blockId, rollType, key);
  if (done[id] === void 0) return;
  delete done[id];
  await writeDone(done);
}
async function clearDone() {
  await writeDone({});
}
const pending = /* @__PURE__ */ new Map();
function acceptedActorUuids() {
  return getState().participants.filter((p) => p.status === "accepted").map((p) => p.actorUuid);
}
function handlePreRoll(rollType, config, message) {
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
    if (participates && game.user?.isGM && getModuleSetting(SETTINGS.notifyUnexpectedRolls)) {
      ui.notifications?.info(
        game.i18n.format("VEILED_ROLLS.Notify.UnexpectedRoll", {
          key: getKeyLabel(rollType, info.key)
        })
      );
    }
    return;
  }
  if (!participates) return;
  const action = decideDuplicate(
    descriptor.duplicatePolicy,
    info.actorUuid,
    acceptedActorUuids()
  );
  if (action === "reject") return;
  const requestId = foundry.utils.randomID();
  markRollForInterception(config, requestId);
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
async function handlePostRoll(rolls, _data) {
  const post = extractPostRollInfo(rolls);
  if (!post?.requestId) return;
  const p = pending.get(post.requestId);
  if (!p) return;
  pending.delete(post.requestId);
  const descriptor = getState().descriptor;
  if (descriptor?.diceSoNiceMode === "private" && rolls[0]) {
    const audience = Array.from(
      new Set([game.user?.id, ...activeGmIds()].filter(Boolean))
    );
    await showDicePrivately(rolls[0], audience);
  }
  const context = {
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
    filter_revision: p.filterRevision
  };
  if (isResponsibleGm()) {
    markLocallyProcessed(context.request_id);
    await processFilteredRoll(context);
  } else {
    emitFilteredRoll(context);
  }
}
async function failSafe(userId, gmKey, playerKey) {
  ui.notifications?.warn(game.i18n.localize(gmKey));
  try {
    await sendPlayerNote(userId, playerKey);
  } catch (error) {
    console.error("[veiled-rolls] fail-safe note could not be sent", error);
  }
}
async function processFilteredRoll(context) {
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
    const action = decideDuplicate(
      block.options.duplicate_policy,
      context.actor_uuid,
      acceptedActorUuids()
    );
    const actor = await fromUuid(context.actor_uuid);
    const actorName = typeof actor?.name === "string" ? actor.name : context.actor_uuid;
    if (action === "reject") {
      await sendPlayerNote(context.user_id, "VEILED_ROLLS.Notify.DuplicatePlayer");
      await recordParticipant(
        makeParticipant(context.actor_uuid, actorName, "duplicate", context.total)
      );
      return;
    }
    const candidates = Array.from(/* @__PURE__ */ new Set([context.user_id, ...ownerUserIds(actor)]));
    const resolved = resolveResponse(block, context, void 0, candidates);
    const userName2 = game.users?.get(context.user_id)?.name ?? "?";
    const keyLabel = getKeyLabel(context.roll_type, context.key);
    if (!resolved) {
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
      await markRequestProgress(context.user_id, context.roll_type, context.key);
      return;
    }
    await deliverResponse({
      block,
      context,
      resolved,
      actor,
      actorName,
      userName: userName2,
      keyLabel,
      targetUserId: context.user_id
    });
    await addHistory({
      id: foundry.utils.randomID(),
      // GM clock, consistent with the done markers set right after.
      timestamp: Date.now(),
      userName: userName2,
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
    await markRequestProgress(context.user_id, context.roll_type, context.key);
  } catch (error) {
    console.error("[veiled-rolls] processing failed", error);
    await failSafe(
      context.user_id,
      "VEILED_ROLLS.Notify.ProcessError",
      "VEILED_ROLLS.Notify.PlayerError"
    );
  }
}
async function maybeAutoClose(block, processedCount) {
  const { auto_close_mode, auto_close_roll_count } = block.options;
  if (auto_close_mode === "after_roll_count" && typeof auto_close_roll_count === "number" && auto_close_roll_count > 0 && processedCount >= auto_close_roll_count) {
    await disable();
    return;
  }
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
async function handleRollRequest(request) {
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
function emptyTier(idFactory, minimum = null, maximum = null) {
  return {
    id: idFactory(),
    minimum,
    maximum,
    responses: [],
    gm_note: "",
    natural_roll: "any",
    weighting: "equal"
  };
}
function defaultTiers(idFactory) {
  return [emptyTier(idFactory, null, 9), emptyTier(idFactory, 10, 14), emptyTier(idFactory, 15, null)];
}
function newCard(idFactory, rollType = "skill", key = "") {
  return {
    branchId: null,
    roll_type: rollType,
    key,
    label: "",
    tiers: defaultTiers(idFactory),
    personal: []
  };
}
function blockToCards(block) {
  const used = /* @__PURE__ */ new Set();
  return block.selectors.map((selector) => {
    const branch = block.branches.find((b) => b.id === selector.branch_id);
    const reuse = branch && !used.has(branch.id) ? branch.id : null;
    if (reuse) used.add(reuse);
    return {
      branchId: reuse,
      roll_type: selector.roll_type,
      key: selector.key,
      label: selector.label ?? "",
      tiers: structuredClone(branch?.tiers ?? []),
      personal: structuredClone(branch?.personal_responses ?? [])
    };
  });
}
function hasText(tier) {
  return tier.responses.some((r) => r.trim().length > 0);
}
function cardsToBlock(block, cards, idFactory) {
  const next = structuredClone(block);
  next.selectors = [];
  next.branches = [];
  for (const card of cards) {
    const branchId = card.branchId ?? idFactory();
    const label = card.label.trim();
    next.selectors.push({
      roll_type: card.roll_type,
      key: card.key,
      label,
      branch_id: branchId
    });
    next.branches.push({
      id: branchId,
      label: label || card.key,
      roll_type: card.roll_type,
      key: card.key,
      tiers: card.tiers.filter(hasText).map((t2) => ({
        ...t2,
        responses: t2.responses.map((r) => sanitizeHtml(r.trim())).filter((r) => r.length > 0)
      })),
      personal_responses: card.personal.map((p) => ({ user_id: p.user_id.trim(), response: sanitizeHtml(p.response.trim()) })).filter((p) => p.user_id.length > 0 || p.response.length > 0)
    });
  }
  return next;
}
const { ApplicationV2: ApplicationV2$2, HandlebarsApplicationMixin: HandlebarsApplicationMixin$2 } = foundry.applications.api;
const PARTICIPANT_MODES = [
  "all_players",
  "selected_users",
  "selected_tokens",
  "selected_actors"
];
const DUPLICATE_POLICIES = [
  "first_per_actor",
  "accept_all",
  "replace_previous",
  "ask_gm"
];
const AUTO_CLOSE_MODES = ["manual", "after_roll_count", "after_each_participant"];
const NATURAL_OPTIONS = ["any", "natural_1", "natural_20"];
function newId() {
  return foundry.utils.randomID();
}
function newBlockTemplate(folder = "") {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  return {
    id: newId(),
    name: "",
    folder,
    description: "",
    enabled: true,
    mode: "exclusive_range",
    selectors: [],
    branches: [],
    options: {
      include_gm_in_whisper: true,
      show_total_to_gm: true,
      show_result_to_player: true,
      color_by_tier: true,
      dice_so_nice_mode: "disabled",
      duplicate_policy: "first_per_actor",
      participant_mode: "all_players",
      participant_ids: [],
      auto_close_mode: "manual",
      auto_close_roll_count: null,
      send_fallback_response: true,
      fallback_response: "",
      randomize_equal_tier_responses: true
    },
    metadata: {
      created_at: now,
      updated_at: now,
      created_by: game.user?.id ?? "",
      schema_version: SCHEMA_VERSION
    }
  };
}
function playerUsers() {
  return (game.users ?? []).filter((u) => !u.isGM).map((u) => ({ id: String(u.id), name: String(u.name) })).sort((a, b) => a.name.localeCompare(b.name));
}
class BlockEditor extends HandlebarsApplicationMixin$2(ApplicationV2$2) {
  static DEFAULT_OPTIONS = {
    id: "veiled-rolls-block-editor-{id}",
    classes: ["veiled-rolls", "veiled-rolls-editor"],
    tag: "form",
    window: {
      title: "VEILED_ROLLS.Editor.Title",
      icon: "fa-solid fa-mask",
      resizable: true
    },
    position: { width: 680, height: 760 }
  };
  static PARTS = {
    body: { template: `modules/${MODULE_ID}/templates/block-editor.hbs` }
  };
  /** Block-level fields and options (selectors/branches live in `cards`). */
  working;
  /** One card per roll; the source of truth for selectors and branches. */
  cards;
  /** Inline test state, parallel to `cards`. */
  tests;
  /** Whether the advanced-options section is unfolded. */
  advancedOpen = false;
  /** Validation errors (localized) from the last save attempt. */
  errors = [];
  constructor(block, options = {}) {
    super(options);
    this.working = structuredClone(block);
    this.cards = blockToCards(this.working).map((card) => ({
      ...card,
      // A label equal to the system wording was filled automatically: show it
      // as a placeholder so it follows the key if the GM changes it.
      label: card.label === getKeyLabel(card.roll_type, card.key) ? "" : card.label
    }));
    if (this.cards.length === 0) this.cards.push(newCard(newId));
    this.tests = this.cards.map(() => this.blankTest());
  }
  /** Default inline-test state for one card. */
  blankTest() {
    return { total: 12, userId: "", result: null };
  }
  async _prepareContext() {
    const w = this.working;
    const players = playerUsers();
    const nameOf = (id) => players.find((p) => p.id === id)?.name ?? id;
    const isExclusive = w.mode === "exclusive_range";
    const folders = [...new Set((await getBlocks()).map((b) => b.folder?.trim()).filter(Boolean))].sort();
    const participantIds = new Set(w.options.participant_ids);
    return {
      block: w,
      isExclusive,
      folders,
      cards: this.cards.map((card, ci) => {
        const test = this.tests[ci] ?? this.blankTest();
        const keyChoices = listRollKeys(card.roll_type).map((choice) => ({
          ...choice,
          selected: choice.value === card.key
        }));
        const title = card.label.trim() || (card.key ? getKeyLabel(card.roll_type, card.key) : "");
        return {
          index: ci,
          number: ci + 1,
          title,
          label: card.label,
          canRemove: this.cards.length > 1,
          rollTypes: ROLL_TYPES.map((value) => ({
            value,
            label: `VEILED_ROLLS.RollType.${value}`,
            selected: value === card.roll_type
          })),
          keyChoices,
          autoLabel: card.key ? getKeyLabel(card.roll_type, card.key) : "",
          tiers: card.tiers.map((t2, ti) => ({
            index: ti,
            minimum: t2.minimum,
            maximum: t2.maximum,
            responsesText: t2.responses.join("\n"),
            naturals: NATURAL_OPTIONS.map((n) => ({
              value: n,
              label: `VEILED_ROLLS.Natural.${n}`,
              selected: n === t2.natural_roll
            }))
          })),
          personal: card.personal.map((p, pi) => ({
            index: pi,
            response: p.response,
            players: [
              ...players.map((u) => ({ ...u, selected: u.id === p.user_id })),
              // Keep a stale id visible rather than silently dropping it.
              ...p.user_id && !players.some((u) => u.id === p.user_id) ? [{ id: p.user_id, name: nameOf(p.user_id), selected: true }] : []
            ]
          })),
          hasPersonal: card.personal.length > 0,
          test: {
            total: test.total,
            result: test.result,
            players: players.map((u) => ({ ...u, selected: u.id === test.userId }))
          }
        };
      }),
      hasPlayers: players.length > 0,
      advancedOpen: this.advancedOpen,
      modes: [
        { value: "exclusive_range", label: "VEILED_ROLLS.Editor.ModeExclusive", selected: isExclusive },
        { value: "cumulative_threshold", label: "VEILED_ROLLS.Editor.ModeCumulative", selected: !isExclusive }
      ],
      participantModes: PARTICIPANT_MODES.map((m) => ({
        value: m,
        label: `VEILED_ROLLS.Mode.${m}`,
        selected: m === w.options.participant_mode
      })),
      showUserPicker: w.options.participant_mode === "selected_users",
      showIdList: w.options.participant_mode === "selected_tokens" || w.options.participant_mode === "selected_actors",
      participantPlayers: players.map((u) => ({ ...u, checked: participantIds.has(u.id) })),
      participantIdsText: w.options.participant_ids.join("\n"),
      duplicatePolicies: DUPLICATE_POLICIES.map((d) => ({
        value: d,
        label: `VEILED_ROLLS.Duplicate.${d}`,
        selected: d === w.options.duplicate_policy
      })),
      autoCloseModes: AUTO_CLOSE_MODES.map((m) => ({
        value: m,
        label: `VEILED_ROLLS.AutoClose.${m}`,
        selected: m === w.options.auto_close_mode
      })),
      diceModes: [
        { value: "disabled", label: "VEILED_ROLLS.Dice.disabled", selected: w.options.dice_so_nice_mode === "disabled" },
        { value: "private", label: "VEILED_ROLLS.Dice.private", selected: w.options.dice_so_nice_mode === "private" }
      ],
      errors: this.errors
    };
  }
  // ---------------------------------------------------------------------------
  //  DOM → working copy
  // ---------------------------------------------------------------------------
  /** The root form element of this application. */
  get form() {
    return this.element instanceof HTMLFormElement ? this.element : this.element?.querySelector?.("form") ?? null;
  }
  /** Read a scalar string value by input name (empty when absent). */
  field(name) {
    const el = this.form?.elements.namedItem(name);
    return el?.value ?? "";
  }
  /** Whether an input with this name is currently rendered. */
  has(name) {
    return Boolean(this.form?.elements.namedItem(name));
  }
  /** Read a checkbox value by input name. */
  checked(name) {
    const el = this.form?.elements.namedItem(name);
    return Boolean(el?.checked);
  }
  /** Parse an optional number input. */
  optionalNumber(name) {
    const raw = this.field(name).trim();
    if (raw === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  /**
   * Read every rendered field back into the working copy. The whole editor is a
   * single page, so all fields are in the DOM; each read is still guarded so a
   * render race can never blank out data.
   */
  sync() {
    if (!this.form) return;
    const w = this.working;
    if (this.has("name")) w.name = this.field("name").trim();
    if (this.has("folder")) w.folder = this.field("folder").trim();
    this.cards = this.cards.map((card, ci) => {
      if (!this.has(`card-${ci}-type`)) return card;
      const rollType = this.field(`card-${ci}-type`) || card.roll_type;
      const rawKey = this.field(`card-${ci}-key`).trim().toLowerCase();
      const key = listRollKeys(rollType).some((c) => c.value === rawKey) ? rawKey : "";
      const test = this.tests[ci] ?? this.blankTest();
      const total = this.optionalNumber(`card-${ci}-test-total`);
      if (total !== null) test.total = total;
      test.userId = this.field(`card-${ci}-test-user`);
      this.tests[ci] = test;
      return {
        branchId: card.branchId,
        roll_type: rollType,
        key,
        label: this.field(`card-${ci}-label`),
        tiers: card.tiers.map((tier, ti) => this.readTier(ci, ti, tier)),
        personal: card.personal.map((p, pi) => ({
          user_id: this.has(`pers-${ci}-${pi}-user`) ? this.field(`pers-${ci}-${pi}-user`) : p.user_id,
          response: this.has(`pers-${ci}-${pi}-text`) ? this.field(`pers-${ci}-${pi}-text`) : p.response
        }))
      };
    });
    if (!this.has("mode")) return;
    w.mode = this.field("mode") || w.mode;
    w.description = this.field("description");
    const opts = w.options;
    opts.include_gm_in_whisper = this.checked("include_gm_in_whisper");
    opts.show_total_to_gm = this.checked("show_total_to_gm");
    opts.show_result_to_player = this.checked("show_result_to_player");
    opts.color_by_tier = this.checked("color_by_tier");
    opts.dice_so_nice_mode = this.field("dice_so_nice_mode") || "disabled";
    opts.randomize_equal_tier_responses = this.checked("randomize_equal_tier_responses");
    opts.send_fallback_response = this.checked("send_fallback_response");
    opts.fallback_response = this.field("fallback_response");
    opts.auto_close_mode = this.field("auto_close_mode") || "manual";
    const count = this.optionalNumber("auto_close_roll_count");
    opts.auto_close_roll_count = count !== null && count > 0 ? count : null;
    opts.duplicate_policy = this.field("duplicate_policy") || opts.duplicate_policy;
    const previousMode = opts.participant_mode;
    opts.participant_mode = this.field("participant_mode") || previousMode;
    if (opts.participant_mode !== previousMode) {
      opts.participant_ids = [];
    } else if (this.form.querySelector('[name="participant_user"]')) {
      opts.participant_ids = Array.from(
        this.form.querySelectorAll('input[name="participant_user"]:checked')
      ).map((el) => el.value);
    } else if (this.has("participant_ids")) {
      opts.participant_ids = this.field("participant_ids").split(/[\n,]/).map((s) => s.trim()).filter((s) => s.length > 0);
    }
  }
  /** Parse one tier's fields from the DOM. */
  readTier(ci, ti, current) {
    if (!this.has(`tier-${ci}-${ti}-responses`)) return current;
    return {
      ...current,
      minimum: this.optionalNumber(`tier-${ci}-${ti}-min`),
      maximum: this.optionalNumber(`tier-${ci}-${ti}-max`),
      responses: this.field(`tier-${ci}-${ti}-responses`).split("\n").map((s) => s.trim()).filter((s) => s.length > 0),
      natural_roll: this.field(`tier-${ci}-${ti}-natural`) || "any"
    };
  }
  // ---------------------------------------------------------------------------
  //  Events
  // ---------------------------------------------------------------------------
  /**
   * Bind one delegated click/change listener on the window root. Buttons carry a
   * `data-vr-action` attribute instead of the framework's `data-action`, which
   * keeps behaviour identical across Foundry versions. The root element survives
   * re-renders, so the listeners are attached only once per element.
   */
  _onRender(_context, _options) {
    const root = this.element;
    if (!root?.addEventListener || root.dataset.vrBound === "1") return;
    root.dataset.vrBound = "1";
    root.addEventListener("click", (event) => {
      const button = event.target?.closest?.("[data-vr-action]");
      if (!button || !root.contains(button)) return;
      event.preventDefault();
      void this.dispatch(button.dataset.vrAction ?? "", button.dataset);
    });
    root.addEventListener("change", (event) => {
      const el = event.target;
      if (el?.closest?.("[data-vr-refresh]")) {
        this.sync();
        void this.render();
      }
    });
    root.addEventListener(
      "toggle",
      (event) => {
        const el = event.target;
        if (el?.dataset?.vrAdvanced !== void 0) this.advancedOpen = el.open;
      },
      true
    );
    root.addEventListener("submit", (event) => event.preventDefault());
  }
  /** Route a delegated click to its handler. */
  async dispatch(action, data) {
    const ci = Number(data.card);
    const index = Number(data.index);
    if (action === "save") return this.onSave(false);
    if (action === "saveActivate") return this.onSave(true);
    if (action === "cancel") {
      await this.close();
      return;
    }
    this.sync();
    const card = Number.isInteger(ci) ? this.cards[ci] : void 0;
    switch (action) {
      case "addCard":
        this.cards.push(newCard(newId));
        this.tests.push(this.blankTest());
        break;
      case "removeCard":
        if (card && this.cards.length > 1) {
          this.cards.splice(ci, 1);
          this.tests.splice(ci, 1);
        }
        break;
      case "duplicateCard":
        if (card) {
          const copy = structuredClone(card);
          copy.branchId = null;
          copy.tiers = copy.tiers.map((t2) => ({ ...t2, id: newId() }));
          this.cards.splice(ci + 1, 0, copy);
          this.tests.splice(ci + 1, 0, this.blankTest());
        }
        break;
      case "addTier":
        card?.tiers.push(emptyTier(newId));
        break;
      case "removeTier":
        if (card && Number.isInteger(index)) card.tiers.splice(index, 1);
        break;
      case "addPersonal":
        card?.personal.push({ user_id: "", response: "" });
        break;
      case "removePersonal":
        if (card && Number.isInteger(index)) card.personal.splice(index, 1);
        break;
      case "test":
        if (card) this.runTest(ci);
        break;
      case "useSelection":
        this.captureSelection();
        break;
      default:
        return;
    }
    void this.render();
  }
  /** Resolve a simulated total against one card, without creating any message. */
  runTest(ci) {
    const card = this.cards[ci];
    const test = this.tests[ci];
    if (!card || !test) return;
    if (!card.key || !Number.isFinite(test.total)) {
      test.result = [game.i18n.localize("VEILED_ROLLS.Editor.TestInvalid")];
      return;
    }
    const preview = cardsToBlock(this.working, [card], newId);
    const resolved = resolveResponse(
      preview,
      { roll_type: card.roll_type, key: card.key, total: test.total, natural_result: null },
      void 0,
      test.userId ? [test.userId] : []
    );
    if (!resolved) {
      test.result = [game.i18n.localize("VEILED_ROLLS.Editor.TestNoMatch")];
      return;
    }
    const prefix = resolved.personal ? [game.i18n.localize("VEILED_ROLLS.Editor.TestPersonal")] : resolved.usedFallback ? [game.i18n.localize("VEILED_ROLLS.Editor.TestFallback")] : [];
    test.result = [...prefix, ...resolved.paragraphs.map(sanitizeHtml)];
  }
  /** Fill the participant list from the tokens currently selected on the canvas. */
  captureSelection() {
    const opts = this.working.options;
    const controlled = canvas?.tokens?.controlled ?? [];
    const ids = controlled.map(
      (t2) => opts.participant_mode === "selected_actors" ? t2?.actor?.uuid : t2?.document?.uuid
    ).filter((id) => typeof id === "string");
    if (ids.length === 0) {
      ui.notifications?.warn(game.i18n.localize("VEILED_ROLLS.Editor.NoSelection"));
      return;
    }
    opts.participant_ids = [...new Set(ids)];
  }
  // ---------------------------------------------------------------------------
  //  Save
  // ---------------------------------------------------------------------------
  /** Build the block to store from the working copy and the cards. */
  assemble() {
    const cards = this.cards.map((card) => ({
      ...card,
      // An empty label falls back to the system's own wording for the key.
      label: card.label.trim() || (card.key ? getKeyLabel(card.roll_type, card.key) : "")
    }));
    const block = cardsToBlock(this.working, cards, newId);
    block.options.fallback_response = sanitizeHtml(block.options.fallback_response);
    block.metadata.updated_at = (/* @__PURE__ */ new Date()).toISOString();
    return block;
  }
  /** Validate and persist; returns the saved block or null on failure. */
  async persist() {
    this.sync();
    const block = this.assemble();
    const validation = validateBlock(block);
    if (!validation.valid) {
      this.errors = [
        ...new Set(validation.errors.map((e) => game.i18n.format(e.messageKey, e.data ?? {})))
      ];
      void this.render();
      return null;
    }
    this.errors = [];
    const result = await upsertBlock(block);
    if (!result.valid) {
      this.errors = result.errors.map((e) => game.i18n.format(e.messageKey, e.data ?? {}));
      void this.render();
      return null;
    }
    refreshBlockLibrary();
    return block;
  }
  /** Save, optionally activate, then close. */
  async onSave(andActivate) {
    const saved = await this.persist();
    if (!saved) return;
    if (andActivate) {
      await activate(saved);
      ui.notifications?.info(game.i18n.localize("VEILED_ROLLS.Notify.Activated"));
    } else {
      ui.notifications?.info(game.i18n.localize("VEILED_ROLLS.Notify.Saved"));
    }
    await this.close();
  }
}
function openBlockEditor(block) {
  void new BlockEditor(block).render({ force: true });
}
const { ApplicationV2: ApplicationV2$1, HandlebarsApplicationMixin: HandlebarsApplicationMixin$1 } = foundry.applications.api;
async function readJsonFile() {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => resolve(null);
      reader.readAsText(file);
    });
    input.click();
  });
}
class BlockLibrary extends HandlebarsApplicationMixin$1(ApplicationV2$1) {
  static instance = null;
  static DEFAULT_OPTIONS = {
    id: "veiled-rolls-block-library",
    classes: ["veiled-rolls", "veiled-rolls-library"],
    tag: "section",
    window: {
      title: "VEILED_ROLLS.Library.Title",
      icon: "fa-solid fa-book",
      resizable: true
    },
    position: { width: 720, height: 600 },
    actions: {
      create: BlockLibrary.onCreate,
      edit: BlockLibrary.onEdit,
      duplicate: BlockLibrary.onDuplicate,
      remove: BlockLibrary.onDelete,
      activate: BlockLibrary.onActivate,
      exportOne: BlockLibrary.onExportOne,
      exportAll: BlockLibrary.onExportAll,
      importBlocks: BlockLibrary.onImport
    }
  };
  static PARTS = {
    body: { template: `modules/${MODULE_ID}/templates/block-library.hbs` }
  };
  query = "";
  blocks = [];
  static open() {
    BlockLibrary.instance ??= new BlockLibrary();
    void BlockLibrary.instance.render({ force: true });
  }
  static refresh() {
    if (BlockLibrary.instance?.rendered) void BlockLibrary.instance.render();
  }
  async _prepareContext() {
    this.blocks = await getBlocks();
    const rows = this.blocks.slice().sort((a, b) => (a.folder ?? "").localeCompare(b.folder ?? "") || a.name.localeCompare(b.name)).map((b) => ({
      id: b.id,
      search: [b.name, b.folder, ...b.selectors.map((s) => s.label)].join(" ").toLowerCase(),
      name: b.name || game.i18n.localize("VEILED_ROLLS.Library.Unnamed"),
      folder: b.folder || "—",
      rolls: b.selectors.map((s) => s.label?.trim() || s.key).join(", ") || "—",
      personal: b.branches.some((br) => (br.personal_responses ?? []).length > 0),
      mode: game.i18n.localize(
        b.mode === "cumulative_threshold" ? "VEILED_ROLLS.Editor.ModeCumulative" : "VEILED_ROLLS.Editor.ModeExclusive"
      ),
      updated: new Date(b.metadata.updated_at).toLocaleDateString(),
      valid: validateBlock(b).valid
    }));
    return { rows, query: this.query, count: rows.length };
  }
  block(id) {
    return this.blocks.find((b) => b.id === id);
  }
  /**
   * Filter rows as the GM types. Filtering is done on the rendered rows rather
   * than by re-rendering, so the search field keeps its focus and caret.
   */
  _onRender(_context, _options) {
    const root = this.element;
    const input = root?.querySelector?.("#vr-search");
    if (!root || !input) return;
    const apply = () => {
      this.query = input.value;
      const q = this.query.trim().toLowerCase();
      for (const row of root.querySelectorAll("[data-search]")) {
        row.hidden = q.length > 0 && !(row.dataset.search ?? "").includes(q);
      }
    };
    input.addEventListener("input", apply);
    apply();
  }
  static onCreate() {
    openBlockEditor(newBlockTemplate());
  }
  static onEdit(_event, target) {
    const block = this.block(target?.dataset?.id ?? "");
    if (block) openBlockEditor(structuredClone(block));
  }
  static async onDuplicate(_event, target) {
    const id = target?.dataset?.id;
    if (!id) return;
    await duplicateBlock(id);
    void this.render();
  }
  static async onDelete(_event, target) {
    const id = target?.dataset?.id;
    if (!id) return;
    const block = this.block(id);
    if (!block) return;
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("VEILED_ROLLS.Library.DeleteTitle") },
      content: `<p>${game.i18n.format("VEILED_ROLLS.Library.DeleteConfirm", { name: block.name })}</p>`
    });
    if (!ok) return;
    await deleteBlock(id);
    void this.render();
  }
  static async onActivate(_event, target) {
    const block = this.block(target?.dataset?.id ?? "");
    if (!block) return;
    const validation = validateBlock(block);
    if (!validation.valid) {
      ui.notifications?.warn(game.i18n.localize("VEILED_ROLLS.Notify.BlockInvalid"));
      return;
    }
    await activate(block);
    ui.notifications?.info(game.i18n.localize("VEILED_ROLLS.Notify.Activated"));
  }
  static async onExportOne(_event, target) {
    const id = target?.dataset?.id;
    if (!id) return;
    const data = await exportLibrary([id]);
    foundry.utils.saveDataToFile(
      JSON.stringify(data, null, 2),
      "application/json",
      `veiled-rolls-${id}.json`
    );
  }
  static async onExportAll() {
    const data = await exportLibrary();
    foundry.utils.saveDataToFile(
      JSON.stringify(data, null, 2),
      "application/json",
      "veiled-rolls-library.json"
    );
  }
  static async onImport() {
    const text = await readJsonFile();
    if (!text) return;
    const strategy = await pickStrategy();
    if (!strategy) return;
    const result = await importLibrary(text, strategy);
    if (!result.ok) {
      const key = result.errors?.[0]?.messageKey ?? "VEILED_ROLLS.Import.Malformed";
      ui.notifications?.error(game.i18n.localize(key));
      return;
    }
    const s = result.summary ?? { added: 0, replaced: 0, skipped: 0, duplicated: 0 };
    ui.notifications?.info(
      game.i18n.format("VEILED_ROLLS.Import.Summary", {
        imported: s.added + s.replaced + s.duplicated,
        skipped: s.skipped
      })
    );
    void this.render();
  }
}
async function pickStrategy() {
  const choice = await foundry.applications.api.DialogV2.wait({
    window: { title: game.i18n.localize("VEILED_ROLLS.Import.StrategyTitle") },
    content: `<p>${game.i18n.localize("VEILED_ROLLS.Import.StrategyHint")}</p>`,
    buttons: [
      { action: "duplicate", label: game.i18n.localize("VEILED_ROLLS.Import.Duplicate"), default: true },
      { action: "replace", label: game.i18n.localize("VEILED_ROLLS.Import.Replace") },
      { action: "skip", label: game.i18n.localize("VEILED_ROLLS.Import.Skip") }
    ]
  }).catch(() => null);
  return choice ?? null;
}
function openBlockLibrary() {
  BlockLibrary.open();
}
function refreshBlockLibrary() {
  BlockLibrary.refresh();
}
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
function shortTime(value) {
  if (value === null) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function shortDateTime(value) {
  if (value === null) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return `${date.toLocaleDateString()} ${shortTime(value)}`;
}
function userName(id) {
  return game.users?.get(id)?.name ?? id;
}
function escapeText(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function plain(html) {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}
class ControlPanel extends HandlebarsApplicationMixin(ApplicationV2) {
  static instance = null;
  static DEFAULT_OPTIONS = {
    id: "veiled-rolls-control-panel",
    classes: ["veiled-rolls", "veiled-rolls-panel"],
    tag: "section",
    window: {
      title: "VEILED_ROLLS.Panel.Title",
      icon: "fa-solid fa-mask",
      resizable: true
    },
    position: { width: 560, height: 680 }
  };
  static PARTS = {
    body: { template: `modules/${MODULE_ID}/templates/control-panel.hbs` }
  };
  /** Current view. */
  view = "todo";
  /** Folder names the GM has collapsed, per view, to keep long lists readable. */
  collapsedFolders = /* @__PURE__ */ new Set();
  /** Cache of history shown, for action handlers to read by id. */
  recent = [];
  /** Cache of blocks, for personal-response hints in the player picker. */
  blocks = [];
  /** Open (or bring to front) the singleton panel. */
  static open() {
    ControlPanel.instance ??= new ControlPanel();
    void ControlPanel.instance.render({ force: true });
  }
  /** Re-render the panel if it is currently open. */
  static refresh() {
    if (ControlPanel.instance?.rendered) void ControlPanel.instance.render();
  }
  async _prepareContext() {
    const state = getState();
    const history = await getHistory();
    const done = await getDone();
    const pendingKeys = outstandingSelectorIds();
    const noFolder = game.i18n.localize("VEILED_ROLLS.Panel.NoFolder");
    this.blocks = await getBlocks();
    const resultsByRoll = /* @__PURE__ */ new Map();
    for (const h of history) {
      const id = rollId(h.blockId, h.rollType, h.key);
      const list = resultsByRoll.get(id) ?? [];
      list.unshift(h);
      resultsByRoll.set(id, list);
    }
    const rows = [];
    for (const block of this.blocks) {
      const valid = validateBlock(block).valid;
      const isActiveBlock = state.active && state.blockId === block.id;
      for (const s of block.selectors) {
        const id = rollId(block.id, s.roll_type, s.key);
        const requested = isActiveBlock && pendingKeys.has(`${s.roll_type}|${s.key}`);
        const doneAt = done[id];
        const status = requested ? "requested" : doneAt !== void 0 ? "done" : "todo";
        const branch = block.branches.find((b) => b.id === s.branch_id);
        const results = (resultsByRoll.get(id) ?? []).filter((h) => doneAt === void 0 || h.timestamp >= doneAt - 5e3).slice(0, 8).map((h) => ({
          actorName: h.actorName,
          total: h.total,
          personal: Boolean(h.personal),
          preview: plain(h.responseParagraphs.join(" "))
        }));
        rows.push({
          id,
          blockId: block.id,
          blockName: block.name || game.i18n.localize("VEILED_ROLLS.Library.Unnamed"),
          folder: block.folder?.trim() || noFolder,
          rollType: s.roll_type,
          key: s.key,
          label: s.label?.trim() || getKeyLabel(s.roll_type, s.key),
          valid,
          status,
          waiting: requested ? outstandingUsers(s.roll_type, s.key).map(userName).join(", ") : "",
          personalNames: (branch?.personal_responses ?? []).map((p) => userName(p.user_id)).join(", "),
          doneAt: doneAt !== void 0 ? shortDateTime(doneAt) : "",
          results
        });
      }
    }
    const todoRows = rows.filter((r) => r.status !== "done").sort((a, b) => Number(b.status === "requested") - Number(a.status === "requested"));
    const doneRows = rows.filter((r) => r.status === "done");
    this.recent = history.slice(-100).reverse();
    const players = connectedPlayers();
    return {
      view: this.view,
      views: [
        { id: "todo", label: "VEILED_ROLLS.Panel.ViewTodo", count: todoRows.length, icon: "fa-list-check" },
        { id: "done", label: "VEILED_ROLLS.Panel.ViewDone", count: doneRows.length, icon: "fa-circle-check" },
        { id: "history", label: "VEILED_ROLLS.Panel.ViewHistory", count: history.length, icon: "fa-clock-rotate-left" }
      ].map((v) => ({ ...v, current: v.id === this.view })),
      isTodo: this.view === "todo",
      isDone: this.view === "done",
      isHistory: this.view === "history",
      folders: this.groupByFolder(this.view === "done" ? doneRows : todoRows),
      hasBlocks: this.blocks.length > 0,
      hasPlayers: players.length > 0,
      connected: players.map((p) => p.name).join(", "),
      active: state.active,
      blockName: state.descriptor?.blockName ?? "—",
      processedCount: state.processedCount,
      participants: state.participants.map((p) => ({
        actorName: p.actorName,
        status: p.status,
        statusLabel: game.i18n.localize(`VEILED_ROLLS.Status.${p.status}`),
        total: typeof p.lastTotal === "number" ? p.lastTotal : "—"
      })),
      history: this.recent.map((h) => ({
        id: h.id,
        userName: h.userName,
        actorName: h.actorName,
        keyLabel: h.keyLabel,
        blockName: h.blockName,
        total: h.total,
        natural: h.naturalResult,
        personal: Boolean(h.personal),
        fallback: h.usedFallback,
        response: h.responseParagraphs.join(" "),
        time: shortDateTime(h.timestamp)
      }))
    };
  }
  /** Group rows by folder, sorted by folder name, with progress counts. */
  groupByFolder(rows) {
    const groups = /* @__PURE__ */ new Map();
    for (const row of rows) {
      const list = groups.get(row.folder) ?? [];
      list.push(row);
      groups.set(row.folder, list);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([name, list]) => ({
      name,
      collapsed: this.collapsedFolders.has(`${this.view}|${name}`),
      count: list.length,
      rolls: list.map((r) => ({
        ...r,
        isTodo: r.status === "todo",
        isRequested: r.status === "requested",
        isDone: r.status === "done",
        statusLabel: game.i18n.localize(`VEILED_ROLLS.RollStatus.${r.status}`)
      }))
    }));
  }
  /**
   * Bind one delegated click listener on the window root. Buttons carry a
   * `data-vr-action` attribute instead of the framework's `data-action`, which
   * proved unreliable for rebuilt rows. The root survives re-renders, so the
   * listener is attached once per element.
   */
  _onRender(_context, _options) {
    const root = this.element;
    if (!root?.addEventListener || root.dataset.vrBound === "1") return;
    root.dataset.vrBound = "1";
    root.addEventListener("click", (event) => {
      const button = event.target?.closest?.("[data-vr-action]");
      if (!button || !root.contains(button)) return;
      event.preventDefault();
      void this.dispatch(button.dataset.vrAction ?? "", button.dataset).catch((error) => {
        console.error("[veiled-rolls] panel action failed", error);
      });
    });
  }
  /** Route a delegated click to its handler. */
  async dispatch(action, data) {
    const blockId = data.block ?? "";
    const rollType = data.type;
    const key = data.key ?? "";
    switch (action) {
      case "view":
        this.view = data.view ?? "todo";
        break;
      case "folder": {
        const id = `${this.view}|${data.folder ?? ""}`;
        if (this.collapsedFolders.has(id)) this.collapsedFolders.delete(id);
        else this.collapsedFolders.add(id);
        break;
      }
      case "requestGroup":
        if (rollType) await this.request(blockId, rollType, key, null);
        break;
      case "requestPlayers":
        if (rollType) {
          const picked = await this.pickPlayers(blockId, rollType, key);
          if (!picked) return;
          await this.request(blockId, rollType, key, picked);
        }
        break;
      case "markDone":
        if (rollType) await markDone(blockId, rollType, key);
        break;
      case "markTodo":
        if (rollType) await unmarkDone(blockId, rollType, key);
        break;
      case "edit": {
        const block = await getBlock(blockId);
        if (block) openBlockEditor(block);
        return;
      }
      case "create":
        openBlockEditor(newBlockTemplate());
        return;
      case "openLibrary":
        openBlockLibrary();
        return;
      case "disable":
        resetRequests();
        await disable();
        break;
      case "resetParticipants":
        await resetParticipants();
        break;
      case "newSession":
        if (!await this.confirm("NewSession", "NewSessionConfirm")) return;
        resetRequests();
        await disable();
        await resetParticipants();
        await clearDone();
        this.view = "todo";
        break;
      case "resend": {
        const entry = this.recent.find((h) => h.id === data.id);
        if (!entry) return;
        await resendHistory(entry);
        ui.notifications?.info(game.i18n.localize("VEILED_ROLLS.Notify.Resent"));
        return;
      }
      case "copy": {
        const entry = this.recent.find((h) => h.id === data.id);
        if (!entry) return;
        try {
          await navigator.clipboard.writeText(entry.responseParagraphs.map(plain).join("\n\n"));
          ui.notifications?.info(game.i18n.localize("VEILED_ROLLS.Notify.Copied"));
        } catch {
          ui.notifications?.warn(game.i18n.localize("VEILED_ROLLS.Notify.CopyFailed"));
        }
        return;
      }
      case "clearHistory":
        if (!await this.confirm("ClearHistory", "ClearHistoryConfirm")) return;
        await clearHistory();
        break;
      default:
        return;
    }
    void this.render();
  }
  /** Yes/no confirmation using two Panel.* i18n keys. */
  async confirm(titleKey, bodyKey) {
    return Boolean(
      await foundry.applications.api.DialogV2.confirm({
        window: { title: game.i18n.localize(`VEILED_ROLLS.Panel.${titleKey}`) },
        content: `<p>${game.i18n.localize(`VEILED_ROLLS.Panel.${bodyKey}`)}</p>`
      })
    );
  }
  /**
   * Prompt the GM to pick one or more connected players. Players with a
   * personal response on this roll are flagged. Returns the chosen user ids, or
   * null if cancelled or nobody is connected.
   */
  async pickPlayers(blockId, rollType, key) {
    const players = connectedPlayers();
    if (players.length === 0) {
      ui.notifications?.warn(game.i18n.localize("VEILED_ROLLS.Panel.RequestNoPlayers"));
      return null;
    }
    const block = this.blocks.find((b) => b.id === blockId);
    const selector = block?.selectors.find((s) => s.roll_type === rollType && s.key === key);
    const branch = block?.branches.find((b) => b.id === selector?.branch_id);
    const personal = new Set((branch?.personal_responses ?? []).map((p) => p.user_id));
    const personalHint = game.i18n.localize("VEILED_ROLLS.Panel.HasPersonal");
    const rows = players.map((p) => {
      const flag = personal.has(p.id) ? ` <i class="fa-solid fa-user-secret" title="${personalHint}" aria-label="${personalHint}"></i>` : "";
      return `<label class="veiled-rolls-pick"><input type="checkbox" name="vr-player" value="${p.id}" /> ${escapeText(p.name)}${flag}</label>`;
    }).join("");
    const chosen = await foundry.applications.api.DialogV2.wait({
      window: { title: game.i18n.localize("VEILED_ROLLS.Panel.PickPlayers") },
      content: `<div class="veiled-rolls-pick-list">${rows}</div>`,
      buttons: [
        {
          action: "ok",
          label: game.i18n.localize("VEILED_ROLLS.Panel.PickConfirm"),
          default: true,
          callback: (_event, button, dialog) => {
            const host = dialog?.element ?? button?.form;
            const boxes = host?.querySelectorAll?.('input[name="vr-player"]:checked') ?? [];
            return Array.from(boxes).map((b) => b.value);
          }
        },
        { action: "cancel", label: game.i18n.localize("VEILED_ROLLS.Editor.Cancel") }
      ]
    }).catch(() => null);
    if (!Array.isArray(chosen)) return null;
    if (chosen.length === 0) {
      ui.notifications?.warn(game.i18n.localize("VEILED_ROLLS.Panel.PickNone"));
      return null;
    }
    return chosen;
  }
  /** Ensure the roll's block is active, then send the request. */
  async request(blockId, rollType, key, targets) {
    const state = getState();
    if (!state.active || state.blockId !== blockId) {
      const block = await getBlock(blockId);
      if (!block) return;
      if (!validateBlock(block).valid) {
        ui.notifications?.warn(game.i18n.localize("VEILED_ROLLS.Notify.BlockInvalid"));
        return;
      }
      resetRequests();
      await activate(block);
    }
    requestRoll(rollType, key, targets);
  }
}
function openControlPanel() {
  ControlPanel.open();
}
const PRE_HOOKS = [
  ["dnd5e.preRollSkillV2", "skill"],
  ["dnd5e.preRollAbilityCheckV2", "ability_check"],
  ["dnd5e.preRollSavingThrowV2", "saving_throw"]
];
const POST_HOOKS = [
  ["dnd5e.rollSkillV2", "skill"],
  ["dnd5e.rollAbilityCheckV2", "ability_check"],
  ["dnd5e.rollSavingThrowV2", "saving_throw"]
];
Hooks.once("init", () => {
  registerSettings(openBlockLibrary);
  Handlebars.registerHelper("veiledEq", (a, b) => a === b);
  Handlebars.registerHelper(
    "concat",
    (...args) => args.slice(0, -1).join("")
  );
});
Hooks.once("ready", () => {
  registerSocket(processFilteredRoll);
  registerRollRequestHandler(handleRollRequest);
  for (const [hook, rollType] of PRE_HOOKS) {
    Hooks.on(hook, (config, _dialog, message) => {
      try {
        handlePreRoll(rollType, config, message);
      } catch (error) {
        console.error(`[veiled-rolls] pre-roll handling failed (${hook})`, error);
      }
    });
  }
  for (const [hook] of POST_HOOKS) {
    Hooks.on(hook, (rolls, data) => {
      void handlePostRoll(rolls).catch((error) => {
        console.error(`[veiled-rolls] post-roll handling failed (${hook})`, error);
      });
    });
  }
  const module = game.modules?.get(MODULE_ID);
  if (module) {
    module.api = createApi({ openControlPanel, openBlockLibrary });
  }
  Hooks.on("updateJournalEntry", (journal) => {
    if (journal?.getFlag?.(MODULE_ID, "store") !== true) return;
    ControlPanel.refresh();
    BlockLibrary.refresh();
  });
  Hooks.on("updateSetting", (setting) => {
    if (setting?.key === `${MODULE_ID}.${SETTINGS.activeFilter}`) {
      ControlPanel.refresh();
      BlockLibrary.refresh();
      if (game.user?.isGM) void ui.hotbar?.render?.();
    }
  });
});
Hooks.on("renderHotbar", (_app, element) => {
  if (!game.user?.isGM) return;
  try {
    const root = element?.[0] ?? (element instanceof HTMLElement ? element : null);
    if (!root) return;
    if (root.querySelector(".veiled-rolls-hotbar-button")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "veiled-rolls-hotbar-button";
    const label = game.i18n.localize("VEILED_ROLLS.Control.Button");
    button.title = label;
    button.setAttribute("aria-label", label);
    button.innerHTML = '<i class="fa-solid fa-mask" aria-hidden="true"></i>';
    if (getState().active) button.classList.add("is-active");
    button.addEventListener("click", (event) => {
      event.preventDefault();
      openControlPanel();
    });
    root.prepend(button);
  } catch (error) {
    console.error("[veiled-rolls] could not add hotbar button", error);
  }
});
Hooks.on("getSceneControlButtons", (controls) => {
  if (!game.user?.isGM) return;
  const active = getState().active;
  const tool = {
    name: "veiled-rolls",
    title: game.i18n.localize("VEILED_ROLLS.Control.Button"),
    icon: "fa-solid fa-mask",
    button: true,
    visible: true,
    active,
    onChange: () => openControlPanel(),
    onClick: () => openControlPanel()
  };
  try {
    if (Array.isArray(controls)) {
      const tokens = controls.find((c) => c.name === "token");
      if (tokens?.tools) tokens.tools.push(tool);
    } else if (controls && typeof controls === "object") {
      const tokens = controls.tokens ?? controls.token;
      if (tokens?.tools) tokens.tools[tool.name] = tool;
    }
  } catch (error) {
    console.error("[veiled-rolls] could not add scene control", error);
  }
});
//# sourceMappingURL=module.js.map
