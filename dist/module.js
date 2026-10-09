var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
const MODULE_ID = "veiled-rolls";
const SOCKET_NAME = `module.${MODULE_ID}`;
const SCHEMA_VERSION = 1;
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
  var _a;
  return _a = class extends foundry.applications.api.ApplicationV2 {
    async _prepareContext() {
      return {};
    }
    async render() {
      openBlockLibrary2();
      await this.close();
      return this;
    }
  }, __publicField(_a, "DEFAULT_OPTIONS", { id: "veiled-rolls-library-menu" }), _a;
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
    selectors: block.selectors.map((s) => {
      var _a;
      return {
        roll_type: s.roll_type,
        key: s.key,
        label: ((_a = s.label) == null ? void 0 : _a.trim()) || s.key
      };
    }),
    participantMode: block.options.participant_mode,
    participantIds: [...block.options.participant_ids],
    duplicatePolicy: block.options.duplicate_policy,
    diceSoNiceMode: block.options.dice_so_nice_mode,
    blockName: block.name
  };
}
async function activate(block) {
  var _a;
  const previous = getState();
  const state = {
    active: true,
    blockId: block.id,
    revision: previous.revision + 1,
    descriptor: buildDescriptor(block),
    participants: [],
    processedCount: 0,
    activatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    activatedBy: ((_a = game.user) == null ? void 0 : _a.id) ?? null
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
function coerceBranch(raw, idFactory) {
  const r = raw ?? {};
  const rollType = VALID_ROLL_TYPES.includes(r.roll_type) ? r.roll_type : "skill";
  const tiers = Array.isArray(r.tiers) ? r.tiers.map((t2) => coerceTier(t2, idFactory)) : [];
  return {
    id: toStr(r.id) || idFactory(),
    label: toStr(r.label),
    roll_type: rollType,
    key: toStr(r.key),
    tiers
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
    if (!Array.isArray(branch.tiers) || branch.tiers.length === 0) {
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
function newId() {
  return foundry.utils.randomID();
}
async function ensureStore() {
  var _a;
  if (storeJournal) return storeJournal;
  const existing = (_a = game.journal) == null ? void 0 : _a.find(
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
  var _a;
  return globalThis.JournalEntry ?? ((_a = foundry.documents) == null ? void 0 : _a.JournalEntry) ?? CONFIG.JournalEntry.documentClass;
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
  copy.id = newId();
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
  var _a;
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, errors: [{ path: "", messageKey: "VEILED_ROLLS.Import.Malformed" }] };
  }
  const shape = validateImportShape(parsed);
  if (!shape.valid) return { ok: false, errors: shape.errors };
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const userId = ((_a = game.user) == null ? void 0 : _a.id) ?? "unknown";
  const rawBlocks = parsed.blocks;
  const coerced = rawBlocks.map((b) => coerceImportedBlock(b, newId, now, userId));
  const invalid = coerced.flatMap((b) => validateBlock(b).errors);
  if (invalid.length > 0) return { ok: false, errors: invalid };
  const existing = await getBlocks();
  const { blocks, summary } = applyImport(existing, coerced, strategy, newId);
  await persist(blocks);
  return { ok: true, summary };
}
function assertGm() {
  var _a;
  if (!((_a = game.user) == null ? void 0 : _a.isGM)) {
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
  return Boolean((config == null ? void 0 : config.skill) || (config == null ? void 0 : config.tool));
}
function getRollKey(rollType, config) {
  if (rollType === "skill") return (config == null ? void 0 : config.skill) ?? null;
  return (config == null ? void 0 : config.ability) ?? null;
}
function extractPreRollInfo(rollType, config) {
  var _a, _b, _c, _d, _e, _f;
  const actor = (config == null ? void 0 : config.subject) ?? (config == null ? void 0 : config.actor);
  if (!(actor == null ? void 0 : actor.uuid)) return null;
  const key = getRollKey(rollType, config);
  if (!key) return null;
  const tokenUuid = ((_a = actor.token) == null ? void 0 : _a.uuid) ?? ((_e = (_d = (_c = (_b = actor.getActiveTokens) == null ? void 0 : _b.call(actor)) == null ? void 0 : _c[0]) == null ? void 0 : _d.document) == null ? void 0 : _e.uuid) ?? null;
  return {
    actor,
    actorUuid: actor.uuid,
    tokenUuid,
    userId: ((_f = game.user) == null ? void 0 : _f.id) ?? "unknown",
    key
  };
}
function markRollForInterception(config, requestId) {
  var _a;
  const roll = (_a = config == null ? void 0 : config.rolls) == null ? void 0 : _a[0];
  if (!roll) return false;
  roll.options = roll.options ?? {};
  roll.options[ROLL_OPTION_KEY] = requestId;
  return true;
}
function suppressPublicMessage(message) {
  if (message) message.create = false;
}
function readTotal(roll) {
  const total = Number(roll == null ? void 0 : roll.total);
  return Number.isFinite(total) ? total : null;
}
function readNatural(roll) {
  var _a, _b, _c;
  const die = ((_b = (_a = roll == null ? void 0 : roll.dice) == null ? void 0 : _a.find) == null ? void 0 : _b.call(_a, (d) => (d == null ? void 0 : d.faces) === 20)) ?? ((_c = roll == null ? void 0 : roll.dice) == null ? void 0 : _c[0]);
  const value = Number(die == null ? void 0 : die.total);
  return Number.isFinite(value) ? value : null;
}
function extractPostRollInfo(rolls) {
  var _a;
  const roll = rolls == null ? void 0 : rolls[0];
  if (!roll) return null;
  const total = readTotal(roll);
  if (total === null) return null;
  return {
    requestId: ((_a = roll.options) == null ? void 0 : _a[ROLL_OPTION_KEY]) ?? null,
    total,
    natural: readNatural(roll),
    formula: typeof roll.formula === "string" ? roll.formula : null
  };
}
function listRollKeys(rollType) {
  const config = (CONFIG == null ? void 0 : CONFIG.DND5E) ?? {};
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
  if (!(dice3d == null ? void 0 : dice3d.showForRoll)) return;
  try {
    await dice3d.showForRoll(roll, game.user, true, whisperUserIds, false, null, null);
  } catch (error) {
    console.warn("[veiled-rolls] Dice So Nice private animation failed", error);
  }
}
function resolvePlayerActor() {
  var _a, _b, _c;
  const assigned = (_a = game.user) == null ? void 0 : _a.character;
  if (assigned) return assigned;
  const controlled = ((_b = canvas == null ? void 0 : canvas.tokens) == null ? void 0 : _b.controlled) ?? [];
  return ((_c = controlled[0]) == null ? void 0 : _c.actor) ?? null;
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
  const config = (CONFIG == null ? void 0 : CONFIG.DND5E) ?? {};
  const table = rollType === "skill" ? config.skills : config.abilities;
  const entry = table == null ? void 0 : table[key];
  const label = (entry == null ? void 0 : entry.label) ?? (entry == null ? void 0 : entry.name) ?? key;
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
async function getRecentHistory(limit = 20) {
  const history = await getHistory();
  return history.slice(-limit).reverse();
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
  var _a, _b, _c;
  const active = (_a = game.users) == null ? void 0 : _a.activeGM;
  if (active == null ? void 0 : active.id) return active.id;
  const gms = (_b = game.users) == null ? void 0 : _b.filter((u) => u.isGM && u.active).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return ((_c = gms == null ? void 0 : gms[0]) == null ? void 0 : _c.id) ?? null;
}
function isResponsibleGm() {
  var _a;
  return Boolean((_a = game.user) == null ? void 0 : _a.id) && game.user.id === responsibleGmId();
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
  if (!(context == null ? void 0 : context.request_id) || processedIds.includes(context.request_id)) return;
  markProcessed(context.request_id);
  void (handler == null ? void 0 : handler(context).catch((error) => {
    var _a;
    console.error("[veiled-rolls] failed to process filtered roll", error);
    (_a = ui.notifications) == null ? void 0 : _a.error(game.i18n.localize("VEILED_ROLLS.Notify.ProcessError"));
  }));
}
function onRollRequest(request) {
  var _a, _b;
  if (!(request == null ? void 0 : request.requestId)) return;
  if ((_a = game.user) == null ? void 0 : _a.isGM) return;
  const targets = request.targetUserIds;
  if (targets !== null && !targets.includes(((_b = game.user) == null ? void 0 : _b.id) ?? "")) return;
  void (requestHandler == null ? void 0 : requestHandler(request).catch((error) => {
    console.error("[veiled-rolls] failed to handle roll request", error);
  }));
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
function resetRequests() {
  outstanding.clear();
}
function requestRoll(rollType, key, targetUserIds) {
  var _a, _b;
  const state = getState();
  if (!state.active || !state.blockId || !state.descriptor) {
    (_a = ui.notifications) == null ? void 0 : _a.warn(game.i18n.localize("VEILED_ROLLS.Request.NeedActive"));
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
  const scope = request.targetUserIds === null ? game.i18n.localize("VEILED_ROLLS.Request.ScopeAll") : request.targetUserIds.map((id) => {
    var _a2, _b2;
    return ((_b2 = (_a2 = game.users) == null ? void 0 : _a2.get(id)) == null ? void 0 : _b2.name) ?? id;
  }).join(", ");
  (_b = ui.notifications) == null ? void 0 : _b.info(
    game.i18n.format("VEILED_ROLLS.Request.Sent", { roll: request.keyLabel, scope })
  );
  return true;
}
async function markRequestProgress(userId, rollType, key) {
  var _a;
  const id = selectorId(rollType, key);
  const expected = outstanding.get(id);
  if (!expected) return;
  expected.delete(userId);
  if (expected.size === 0) outstanding.delete(id);
  if (outstanding.size === 0) {
    await disable();
    resetRequests();
    (_a = ui.notifications) == null ? void 0 : _a.info(game.i18n.localize("VEILED_ROLLS.Request.AllDone"));
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
  return { paragraphs, tierIds, usedFallback: false, tone: rankTone(branch, tierIds) };
}
function resolveResponse(block, context, random = defaultRandom) {
  const branch = findBranch(block, context.roll_type, context.key);
  if (!branch) return fallbackOrNull(block);
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
function escapeText(value) {
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
  const title = t("Whisper.PlayerTitle", { actor: escapeText(actorName) });
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
function buildGmContent(block, context, resolved, actorName, userName, keyLabel) {
  const rows = [
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
    resolved.usedFallback ? t("Diag.Fallback") : resolved.tierIds.join(", ") || "—"
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
  if (playerMessage == null ? void 0 : playerMessage.id) created.push(playerMessage.id);
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
    if (gmMessage == null ? void 0 : gmMessage.id) created.push(gmMessage.id);
  }
  return created;
}
function ownerUserIds(actor) {
  const ownership = (actor == null ? void 0 : actor.ownership) ?? {};
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
  const title = t("Whisper.PlayerTitle", { actor: escapeText(entry.actorName) });
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
const pending = /* @__PURE__ */ new Map();
function acceptedActorUuids() {
  return getState().participants.filter((p) => p.status === "accepted").map((p) => p.actorUuid);
}
function handlePreRoll(rollType, config, message) {
  var _a, _b;
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
    if (participates && ((_a = game.user) == null ? void 0 : _a.isGM) && getModuleSetting(SETTINGS.notifyUnexpectedRolls)) {
      (_b = ui.notifications) == null ? void 0 : _b.info(
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
  var _a;
  const post = extractPostRollInfo(rolls);
  if (!(post == null ? void 0 : post.requestId)) return;
  const p = pending.get(post.requestId);
  if (!p) return;
  pending.delete(post.requestId);
  const descriptor = getState().descriptor;
  if ((descriptor == null ? void 0 : descriptor.diceSoNiceMode) === "private" && rolls[0]) {
    const audience = Array.from(
      new Set([(_a = game.user) == null ? void 0 : _a.id, ...activeGmIds()].filter(Boolean))
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
  var _a;
  (_a = ui.notifications) == null ? void 0 : _a.warn(game.i18n.localize(gmKey));
  try {
    await sendPlayerNote(userId, playerKey);
  } catch (error) {
    console.error("[veiled-rolls] fail-safe note could not be sent", error);
  }
}
async function processFilteredRoll(context) {
  var _a, _b, _c, _d, _e;
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
    const actorName = typeof (actor == null ? void 0 : actor.name) === "string" ? actor.name : context.actor_uuid;
    if (action === "reject") {
      await sendPlayerNote(context.user_id, "VEILED_ROLLS.Notify.DuplicatePlayer");
      await recordParticipant(
        makeParticipant(context.actor_uuid, actorName, "duplicate", context.total)
      );
      return;
    }
    const resolved = resolveResponse(block, context);
    const userName = ((_b = (_a = game.users) == null ? void 0 : _a.get(context.user_id)) == null ? void 0 : _b.name) ?? "?";
    const keyLabel = getKeyLabel(context.roll_type, context.key);
    if (!resolved) {
      await sendPlayerNote(context.user_id, "VEILED_ROLLS.Notify.NoResultPlayer");
      (_c = ui.notifications) == null ? void 0 : _c.warn(
        game.i18n.format("VEILED_ROLLS.Notify.NoTierMatched", {
          actor: actorName,
          total: context.total
        })
      );
      await addHistory({
        id: foundry.utils.randomID(),
        timestamp: context.timestamp,
        userName: ((_e = (_d = game.users) == null ? void 0 : _d.get(context.user_id)) == null ? void 0 : _e.name) ?? "?",
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
        usedFallback: false
      });
      await recordParticipant(
        makeParticipant(context.actor_uuid, actorName, "accepted", context.total)
      );
      await incrementProcessed();
      return;
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
      timestamp: context.timestamp,
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
      usedFallback: resolved.usedFallback
    });
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
    const ids = (descriptor == null ? void 0 : descriptor.participantIds) ?? [];
    if (ids.length > 0) {
      const accepted = new Set(acceptedActorUuids());
      const allDone = ids.every((id) => accepted.has(id));
      if (allDone) await disable();
    }
  }
}
async function handleRollRequest(request) {
  var _a, _b;
  const actor = resolvePlayerActor();
  if (!actor) {
    (_a = ui.notifications) == null ? void 0 : _a.warn(game.i18n.localize("VEILED_ROLLS.Request.NoActor"));
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
    (_b = ui.notifications) == null ? void 0 : _b.warn(game.i18n.localize("VEILED_ROLLS.Request.Failed"));
  }
}
const { ApplicationV2: ApplicationV2$2, HandlebarsApplicationMixin: HandlebarsApplicationMixin$2 } = foundry.applications.api;
const PARTICIPANT_MODES = [
  "all_players",
  "selected_tokens",
  "selected_actors",
  "selected_users"
];
const DUPLICATE_POLICIES = [
  "accept_all",
  "first_per_actor",
  "replace_previous",
  "ask_gm"
];
const AUTO_CLOSE_MODES = ["manual", "after_roll_count", "after_each_participant"];
const NATURAL_OPTIONS = ["any", "natural_1", "natural_20"];
function newBlockTemplate() {
  var _a;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  return {
    id: foundry.utils.randomID(),
    name: "",
    folder: "",
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
      created_by: ((_a = game.user) == null ? void 0 : _a.id) ?? "",
      schema_version: SCHEMA_VERSION
    }
  };
}
const _BlockEditor = class _BlockEditor extends HandlebarsApplicationMixin$2(ApplicationV2$2) {
  constructor(block, options = {}) {
    super(options);
    /** In-memory working copy; never a live repository reference. */
    __publicField(this, "working");
    /** Currently selected tab id. */
    __publicField(this, "activeTab", "general");
    /** Last test-tool result (paragraphs) shown in the UI. */
    __publicField(this, "testResult", null);
    /** Test-tool inputs, kept across re-renders so repeated testing is quick. */
    __publicField(this, "testSelector", "");
    __publicField(this, "testTotal", 15);
    /** Validation errors (localized) from the last save attempt. */
    __publicField(this, "errors", []);
    this.working = structuredClone(block);
  }
  async _prepareContext() {
    const w = this.working;
    const branchChoices = w.branches.map((b) => {
      var _a;
      return {
        id: b.id,
        label: ((_a = b.label) == null ? void 0 : _a.trim()) || b.id
      };
    });
    return {
      tab: this.activeTab,
      tabs: [
        { id: "general", label: "VEILED_ROLLS.Editor.TabGeneral" },
        { id: "rolls", label: "VEILED_ROLLS.Editor.TabRolls" },
        { id: "responses", label: "VEILED_ROLLS.Editor.TabResponses" },
        { id: "participants", label: "VEILED_ROLLS.Editor.TabParticipants" },
        { id: "options", label: "VEILED_ROLLS.Editor.TabOptions" }
      ],
      block: w,
      isExclusive: w.mode === "exclusive_range",
      modes: this.modeOptions(w.mode),
      naturalOptions: [...NATURAL_OPTIONS],
      participantModes: PARTICIPANT_MODES,
      duplicatePolicies: DUPLICATE_POLICIES,
      autoCloseModes: [...AUTO_CLOSE_MODES],
      diceModes: [
        { value: "disabled", label: "VEILED_ROLLS.Dice.disabled", selected: w.options.dice_so_nice_mode === "disabled" },
        { value: "private", label: "VEILED_ROLLS.Dice.private", selected: w.options.dice_so_nice_mode === "private" }
      ],
      participantIds: w.options.participant_ids.join("\n"),
      branchChoices,
      // Each row carries its own key list, matching that row's roll type.
      selectors: w.selectors.map((s) => ({
        ...s,
        rollTypes: this.rollTypeOptions(s.roll_type),
        keyChoices: this.keyOptions(s.roll_type, s.key),
        branches: branchChoices.map((b) => ({ ...b, selected: b.id === s.branch_id }))
      })),
      branches: w.branches.map((b) => {
        var _a;
        return {
          ...b,
          displayName: ((_a = b.label) == null ? void 0 : _a.trim()) || b.id,
          rollTypes: this.rollTypeOptions(b.roll_type),
          keyChoices: this.keyOptions(b.roll_type, b.key),
          tiers: b.tiers.map((t2) => ({ ...t2, responsesText: t2.responses.join("\n") }))
        };
      }),
      // Selectors offered to the test tool, labelled readably.
      testChoices: w.selectors.map((s) => {
        var _a;
        return {
          value: `${s.roll_type}|${s.key}`,
          label: ((_a = s.label) == null ? void 0 : _a.trim()) || getKeyLabel(s.roll_type, s.key) || s.key,
          selected: `${s.roll_type}|${s.key}` === this.testSelector
        };
      }),
      testTotal: this.testTotal,
      testResult: this.testResult,
      errors: this.errors
    };
  }
  /** Roll-type options with the current one flagged. */
  rollTypeOptions(current) {
    return ROLL_TYPES.map((value) => ({
      value,
      label: `VEILED_ROLLS.RollType.${value}`,
      selected: value === current
    }));
  }
  /**
   * Key options for a roll type. Free text was error-prone: D&D5e expects short
   * ids (`acr`, `dex`), and a skill name is invalid for an ability check.
   */
  keyOptions(rollType, current) {
    return listRollKeys(rollType).map((choice) => ({
      ...choice,
      selected: choice.value === current
    }));
  }
  /** Options for the resolution-mode select with the current one flagged. */
  modeOptions(current) {
    return [
      { value: "exclusive_range", label: "VEILED_ROLLS.Editor.ModeExclusive", selected: current === "exclusive_range" },
      { value: "cumulative_threshold", label: "VEILED_ROLLS.Editor.ModeCumulative", selected: current === "cumulative_threshold" }
    ];
  }
  /** The root form element of this application. */
  get form() {
    var _a, _b;
    return this.element instanceof HTMLFormElement ? this.element : ((_b = (_a = this.element) == null ? void 0 : _a.querySelector) == null ? void 0 : _b.call(_a, "form")) ?? null;
  }
  /** Read a scalar string value by input name from the form. */
  field(name) {
    var _a;
    const el = (_a = this.form) == null ? void 0 : _a.elements.namedItem(name);
    return (el == null ? void 0 : el.value) ?? "";
  }
  /** Read a checkbox value by input name. */
  checked(name) {
    var _a;
    const el = (_a = this.form) == null ? void 0 : _a.elements.namedItem(name);
    return Boolean(el == null ? void 0 : el.checked);
  }
  /**
   * Sync the DOM fields of the *currently rendered* tab into the working copy.
   *
   * Only the active tab exists in the DOM, so each group is guarded: reading a
   * field belonging to a hidden tab would return an empty string and silently
   * erase the user's data (and turn every option checkbox off).
   */
  sync() {
    const w = this.working;
    const selector = this.field("test_selector");
    if (selector) this.testSelector = selector;
    const rawTotal = this.field("test_total");
    if (rawTotal !== "") {
      const parsed = Number(rawTotal);
      if (Number.isFinite(parsed)) this.testTotal = parsed;
    }
    if (this.activeTab === "general") {
      w.name = this.field("name").trim();
      w.folder = this.field("folder").trim();
      w.description = this.field("description");
      w.mode = this.field("mode") || w.mode;
    }
    if (this.activeTab === "rolls") {
      w.selectors = w.selectors.map((_, i) => {
        const rollType = this.field(`sel-${i}-roll_type`) || "skill";
        const key = this.field(`sel-${i}-key`).trim().toLowerCase();
        const label = this.field(`sel-${i}-label`).trim() || getKeyLabel(rollType, key);
        return {
          roll_type: rollType,
          key,
          label,
          branch_id: this.field(`sel-${i}-branch_id`).trim()
        };
      });
    }
    if (this.activeTab === "responses") {
      w.branches = w.branches.map((b, bi) => ({
        id: b.id,
        label: this.field(`br-${bi}-label`).trim() || b.id,
        roll_type: this.field(`br-${bi}-roll_type`) || b.roll_type,
        key: this.field(`br-${bi}-key`).trim().toLowerCase() || b.key,
        tiers: b.tiers.map((t2, ti) => this.readTier(bi, ti, t2))
      }));
    }
    const opts = w.options;
    if (this.activeTab === "participants") {
      opts.participant_mode = this.field("participant_mode") || opts.participant_mode;
      opts.duplicate_policy = this.field("duplicate_policy") || opts.duplicate_policy;
      opts.participant_ids = this.field("participant_ids").split(/[\n,]/).map((s) => s.trim()).filter((s) => s.length > 0);
    }
    if (this.activeTab === "options") {
      opts.include_gm_in_whisper = this.checked("include_gm_in_whisper");
      opts.show_total_to_gm = this.checked("show_total_to_gm");
      opts.show_result_to_player = this.checked("show_result_to_player");
      opts.color_by_tier = this.checked("color_by_tier");
      opts.dice_so_nice_mode = this.field("dice_so_nice_mode") || "disabled";
      opts.randomize_equal_tier_responses = this.checked("randomize_equal_tier_responses");
      opts.send_fallback_response = this.checked("send_fallback_response");
      opts.fallback_response = this.field("fallback_response");
      opts.auto_close_mode = this.field("auto_close_mode") || "manual";
      const count = Number(this.field("auto_close_roll_count"));
      opts.auto_close_roll_count = Number.isFinite(count) && count > 0 ? count : null;
    }
  }
  /** Parse one tier's fields from the DOM. */
  readTier(bi, ti, current) {
    const minRaw = this.field(`tier-${bi}-${ti}-min`).trim();
    const maxRaw = this.field(`tier-${bi}-${ti}-max`).trim();
    const responses = this.field(`tier-${bi}-${ti}-responses`).split("\n").map((s) => s.trim()).filter((s) => s.length > 0);
    return {
      id: current.id,
      minimum: minRaw === "" ? null : Number(minRaw),
      maximum: maxRaw === "" ? null : Number(maxRaw),
      responses,
      gm_note: this.field(`tier-${bi}-${ti}-gm_note`),
      natural_roll: this.field(`tier-${bi}-${ti}-natural`) || "any",
      weighting: "equal"
    };
  }
  /**
   * Wire tab switching with a direct click listener rather than the framework's
   * `data-action` dispatch.
   *
   * ApplicationV2 reserves the `tab` action for its own tab-group handling, and
   * the exact convention varies between versions; binding the listener here makes
   * tab navigation independent of that mechanism. Listeners are re-attached on
   * every render because the elements are recreated each time.
   */
  _onRender(_context, _options) {
    const root = this.element;
    if (!(root == null ? void 0 : root.querySelectorAll)) return;
    for (const el of root.querySelectorAll("[data-tab-id]")) {
      el.addEventListener("click", (event) => {
        var _a, _b;
        event.preventDefault();
        const id = (_b = (_a = event.currentTarget) == null ? void 0 : _a.dataset) == null ? void 0 : _b.tabId;
        if (!id) return;
        this.sync();
        this.activeTab = id;
        void this.render();
      });
    }
    for (const el of root.querySelectorAll("[data-vr-refresh]")) {
      el.addEventListener("change", () => {
        this.sync();
        void this.render();
      });
    }
  }
  static onAddSelector() {
    this.sync();
    this.working.selectors.push({ roll_type: "skill", key: "", label: "", branch_id: "" });
    void this.render();
  }
  static onRemoveSelector(_event, target) {
    var _a;
    this.sync();
    const i = Number((_a = target == null ? void 0 : target.dataset) == null ? void 0 : _a.index);
    if (Number.isInteger(i)) this.working.selectors.splice(i, 1);
    void this.render();
  }
  static onAddBranch() {
    this.sync();
    const branch = {
      id: foundry.utils.randomID(),
      label: "",
      roll_type: "skill",
      key: "",
      tiers: []
    };
    this.working.branches.push(branch);
    void this.render();
  }
  static onRemoveBranch(_event, target) {
    var _a;
    this.sync();
    const i = Number((_a = target == null ? void 0 : target.dataset) == null ? void 0 : _a.index);
    if (Number.isInteger(i)) this.working.branches.splice(i, 1);
    void this.render();
  }
  static onAddTier(_event, target) {
    var _a;
    this.sync();
    const bi = Number((_a = target == null ? void 0 : target.dataset) == null ? void 0 : _a.index);
    const branch = this.working.branches[bi];
    if (!branch) return;
    branch.tiers.push({
      id: foundry.utils.randomID(),
      minimum: null,
      maximum: null,
      responses: [],
      gm_note: "",
      natural_roll: "any",
      weighting: "equal"
    });
    void this.render();
  }
  static onRemoveTier(_event, target) {
    var _a, _b;
    this.sync();
    const bi = Number((_a = target == null ? void 0 : target.dataset) == null ? void 0 : _a.branch);
    const ti = Number((_b = target == null ? void 0 : target.dataset) == null ? void 0 : _b.tier);
    const branch = this.working.branches[bi];
    if (branch && Number.isInteger(ti)) branch.tiers.splice(ti, 1);
    void this.render();
  }
  static onTest() {
    this.sync();
    const [roll_type, key] = this.testSelector.split("|");
    if (!Number.isFinite(this.testTotal) || !key) {
      this.testResult = [game.i18n.localize("VEILED_ROLLS.Editor.TestInvalid")];
      void this.render();
      return;
    }
    const resolved = resolveResponse(this.working, {
      roll_type,
      key,
      total: this.testTotal,
      natural_result: null
    });
    this.testResult = resolved ? resolved.paragraphs : [game.i18n.localize("VEILED_ROLLS.Editor.TestNoMatch")];
    void this.render();
  }
  /** Persist the working copy; returns the saved block or null on failure. */
  async persist() {
    this.sync();
    this.working.metadata.updated_at = (/* @__PURE__ */ new Date()).toISOString();
    const validation = validateBlock(this.working);
    if (!validation.valid) {
      this.errors = validation.errors.map(
        (e) => game.i18n.format(e.messageKey, e.data ?? {})
      );
      void this.render();
      return null;
    }
    this.errors = [];
    const result = await upsertBlock(this.working);
    if (!result.valid) {
      this.errors = result.errors.map((e) => game.i18n.format(e.messageKey, e.data ?? {}));
      void this.render();
      return null;
    }
    refreshBlockLibrary();
    return this.working;
  }
  static async onSave() {
    var _a;
    const saved = await this.persist();
    if (saved) {
      (_a = ui.notifications) == null ? void 0 : _a.info(game.i18n.localize("VEILED_ROLLS.Notify.Saved"));
      await this.close();
    }
  }
  static async onSaveActivate() {
    var _a;
    const saved = await this.persist();
    if (!saved) return;
    await activate(saved);
    (_a = ui.notifications) == null ? void 0 : _a.info(game.i18n.localize("VEILED_ROLLS.Notify.Activated"));
    await this.close();
  }
  static async onCancel() {
    await this.close();
  }
};
__publicField(_BlockEditor, "DEFAULT_OPTIONS", {
  id: "veiled-rolls-block-editor",
  classes: ["veiled-rolls", "veiled-rolls-editor"],
  tag: "form",
  window: {
    title: "VEILED_ROLLS.Editor.Title",
    icon: "fa-solid fa-pen-to-square",
    resizable: true
  },
  position: { width: 640, height: 640 },
  actions: {
    addSelector: _BlockEditor.onAddSelector,
    removeSelector: _BlockEditor.onRemoveSelector,
    addBranch: _BlockEditor.onAddBranch,
    removeBranch: _BlockEditor.onRemoveBranch,
    addTier: _BlockEditor.onAddTier,
    removeTier: _BlockEditor.onRemoveTier,
    test: _BlockEditor.onTest,
    save: _BlockEditor.onSave,
    saveActivate: _BlockEditor.onSaveActivate,
    cancel: _BlockEditor.onCancel
  }
});
__publicField(_BlockEditor, "PARTS", {
  body: { template: `modules/${MODULE_ID}/templates/block-editor.hbs` }
});
let BlockEditor = _BlockEditor;
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
      var _a;
      const file = (_a = input.files) == null ? void 0 : _a[0];
      if (!file) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => resolve(null);
      reader.readAsText(file);
    });
    input.click();
  });
}
const _BlockLibrary = class _BlockLibrary extends HandlebarsApplicationMixin$1(ApplicationV2$1) {
  constructor() {
    super(...arguments);
    __publicField(this, "query", "");
    __publicField(this, "blocks", []);
  }
  static open() {
    _BlockLibrary.instance ?? (_BlockLibrary.instance = new _BlockLibrary());
    void _BlockLibrary.instance.render({ force: true });
  }
  static refresh() {
    var _a;
    if ((_a = _BlockLibrary.instance) == null ? void 0 : _a.rendered) void _BlockLibrary.instance.render();
  }
  async _prepareContext() {
    this.blocks = await getBlocks();
    const q = this.query.toLowerCase();
    const rows = this.blocks.filter((b) => !q || b.name.toLowerCase().includes(q) || (b.folder ?? "").toLowerCase().includes(q)).map((b) => ({
      id: b.id,
      name: b.name || game.i18n.localize("VEILED_ROLLS.Library.Unnamed"),
      folder: b.folder || "—",
      rolls: b.selectors.map((s) => s.key.toUpperCase()).join(", ") || "—",
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
  static onSearch(event) {
    const target = event == null ? void 0 : event.target;
    this.query = (target == null ? void 0 : target.value) ?? "";
    void this.render();
  }
  static onCreate() {
    openBlockEditor(newBlockTemplate());
  }
  static onEdit(_event, target) {
    var _a;
    const block = this.block(((_a = target == null ? void 0 : target.dataset) == null ? void 0 : _a.id) ?? "");
    if (block) openBlockEditor(structuredClone(block));
  }
  static async onDuplicate(_event, target) {
    var _a;
    const id = (_a = target == null ? void 0 : target.dataset) == null ? void 0 : _a.id;
    if (!id) return;
    await duplicateBlock(id);
    void this.render();
  }
  static async onDelete(_event, target) {
    var _a;
    const id = (_a = target == null ? void 0 : target.dataset) == null ? void 0 : _a.id;
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
    var _a, _b, _c;
    const block = this.block(((_a = target == null ? void 0 : target.dataset) == null ? void 0 : _a.id) ?? "");
    if (!block) return;
    const validation = validateBlock(block);
    if (!validation.valid) {
      (_b = ui.notifications) == null ? void 0 : _b.warn(game.i18n.localize("VEILED_ROLLS.Notify.BlockInvalid"));
      return;
    }
    await activate(block);
    (_c = ui.notifications) == null ? void 0 : _c.info(game.i18n.localize("VEILED_ROLLS.Notify.Activated"));
  }
  static async onExportOne(_event, target) {
    var _a;
    const id = (_a = target == null ? void 0 : target.dataset) == null ? void 0 : _a.id;
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
    var _a, _b, _c, _d;
    const text = await readJsonFile();
    if (!text) return;
    const strategy = await pickStrategy();
    if (!strategy) return;
    const result = await importLibrary(text, strategy);
    if (!result.ok) {
      const key = ((_b = (_a = result.errors) == null ? void 0 : _a[0]) == null ? void 0 : _b.messageKey) ?? "VEILED_ROLLS.Import.Malformed";
      (_c = ui.notifications) == null ? void 0 : _c.error(game.i18n.localize(key));
      return;
    }
    const s = result.summary ?? { added: 0, replaced: 0, skipped: 0, duplicated: 0 };
    (_d = ui.notifications) == null ? void 0 : _d.info(
      game.i18n.format("VEILED_ROLLS.Import.Summary", {
        imported: s.added + s.replaced + s.duplicated,
        skipped: s.skipped
      })
    );
    void this.render();
  }
};
__publicField(_BlockLibrary, "instance", null);
__publicField(_BlockLibrary, "DEFAULT_OPTIONS", {
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
    create: _BlockLibrary.onCreate,
    edit: _BlockLibrary.onEdit,
    duplicate: _BlockLibrary.onDuplicate,
    remove: _BlockLibrary.onDelete,
    activate: _BlockLibrary.onActivate,
    exportOne: _BlockLibrary.onExportOne,
    exportAll: _BlockLibrary.onExportAll,
    importBlocks: _BlockLibrary.onImport,
    search: _BlockLibrary.onSearch
  }
});
__publicField(_BlockLibrary, "PARTS", {
  body: { template: `modules/${MODULE_ID}/templates/block-library.hbs` }
});
let BlockLibrary = _BlockLibrary;
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
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleTimeString();
}
const _ControlPanel = class _ControlPanel extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor() {
    super(...arguments);
    /** Cache of the recent history for action handlers to read by id. */
    __publicField(this, "recent", []);
    /** Folder names the GM has collapsed, to keep a long list readable. */
    __publicField(this, "collapsedFolders", /* @__PURE__ */ new Set());
  }
  /** Open (or bring to front) the singleton panel. */
  static open() {
    _ControlPanel.instance ?? (_ControlPanel.instance = new _ControlPanel());
    void _ControlPanel.instance.render({ force: true });
  }
  /** Re-render the panel if it is currently open. */
  static refresh() {
    var _a;
    if ((_a = _ControlPanel.instance) == null ? void 0 : _a.rendered) void _ControlPanel.instance.render();
  }
  async _prepareContext() {
    var _a, _b, _c;
    const state = getState();
    const activeBlock = state.blockId ? await getBlock(state.blockId) : void 0;
    this.recent = await getRecentHistory(20);
    const history = await getHistory();
    const doneSet = new Set(history.map((h) => `${h.blockId}|${h.rollType}|${h.key}`));
    const pendingKeys = outstandingSelectorIds();
    const noFolder = game.i18n.localize("VEILED_ROLLS.Panel.NoFolder");
    const all = await getBlocks();
    const groups = /* @__PURE__ */ new Map();
    let remaining = 0;
    for (const block of all) {
      const valid = validateBlock(block).valid;
      const folder = ((_a = block.folder) == null ? void 0 : _a.trim()) || noFolder;
      const isActiveBlock = state.active && state.blockId === block.id;
      for (const s of block.selectors) {
        const done = doneSet.has(`${block.id}|${s.roll_type}|${s.key}`);
        const requested = isActiveBlock && pendingKeys.has(`${s.roll_type}|${s.key}`);
        const status = requested ? "requested" : done ? "done" : "todo";
        if (status !== "done") remaining += 1;
        const rolls = groups.get(folder) ?? [];
        rolls.push({
          blockId: block.id,
          blockName: block.name || game.i18n.localize("VEILED_ROLLS.Library.Unnamed"),
          rollType: s.roll_type,
          key: s.key,
          label: ((_b = s.label) == null ? void 0 : _b.trim()) || getKeyLabel(s.roll_type, s.key),
          valid,
          status,
          statusLabel: game.i18n.localize(`VEILED_ROLLS.RollStatus.${status}`),
          isDone: status === "done",
          isRequested: status === "requested",
          isLoaded: isActiveBlock
        });
        groups.set(folder, rolls);
      }
    }
    const folders = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([name, rolls]) => ({
      name,
      collapsed: this.collapsedFolders.has(name),
      doneCount: rolls.filter((r) => r.isDone).length,
      total: rolls.length,
      rolls
    }));
    const players = connectedPlayers();
    return {
      active: state.active,
      folders,
      hasFolders: folders.length > 0,
      remaining,
      players,
      hasPlayers: players.length > 0,
      blockName: ((_c = state.descriptor) == null ? void 0 : _c.blockName) ?? (activeBlock == null ? void 0 : activeBlock.name) ?? "—",
      processedCount: state.processedCount,
      hasActiveBlock: Boolean(activeBlock),
      participants: state.participants.map((p) => ({
        actorName: p.actorName,
        status: p.status,
        statusLabel: game.i18n.localize(`VEILED_ROLLS.Status.${p.status}`),
        total: typeof p.lastTotal === "number" ? p.lastTotal : "—",
        lastRollAt: shortTime(p.lastRollAt)
      })),
      history: this.recent.map((h) => ({
        id: h.id,
        userName: h.userName,
        actorName: h.actorName,
        keyLabel: h.keyLabel,
        total: h.total,
        response: h.responseParagraphs.join(" "),
        time: shortTime(h.timestamp)
      }))
    };
  }
  /**
   * Bind the block-row controls with direct listeners rather than the framework's
   * `data-action` dispatch, which proved unreliable for these buttons. Listeners
   * are re-attached on every render because the rows are rebuilt each time.
   */
  _onRender(_context, _options) {
    const root = this.element;
    if (!(root == null ? void 0 : root.querySelectorAll)) return;
    for (const el of root.querySelectorAll("[data-vr-folder]")) {
      el.addEventListener("click", (event) => {
        var _a, _b;
        event.preventDefault();
        const name = (_b = (_a = event.currentTarget) == null ? void 0 : _a.dataset) == null ? void 0 : _b.vrFolder;
        if (!name) return;
        if (this.collapsedFolders.has(name)) this.collapsedFolders.delete(name);
        else this.collapsedFolders.add(name);
        void this.render();
      });
    }
    for (const el of root.querySelectorAll("[data-vr-request]")) {
      el.addEventListener("click", (event) => {
        var _a, _b, _c, _d;
        event.preventDefault();
        const node = event.currentTarget;
        const blockId = (_a = node == null ? void 0 : node.dataset) == null ? void 0 : _a.block;
        const rollType = (_b = node == null ? void 0 : node.dataset) == null ? void 0 : _b.vrRequest;
        const key = (_c = node == null ? void 0 : node.dataset) == null ? void 0 : _c.key;
        const target = (_d = node == null ? void 0 : node.dataset) == null ? void 0 : _d.target;
        if (!blockId || !rollType || !key || !target) return;
        void this.dispatchRequest(blockId, rollType, key, target);
      });
    }
  }
  /** Resolve the target scope (group or a player selection) and send it. */
  async dispatchRequest(blockId, rollType, key, target) {
    let targets;
    if (target === "group") {
      targets = null;
    } else {
      const picked = await _ControlPanel.pickPlayers();
      if (!picked || picked.length === 0) return;
      targets = picked;
    }
    await this.request(blockId, rollType, key, targets);
  }
  /**
   * Prompt the GM to pick one or more connected players. Returns the chosen user
   * ids, or null if cancelled or no players are connected.
   */
  static async pickPlayers() {
    var _a;
    const players = connectedPlayers();
    if (players.length === 0) {
      (_a = ui.notifications) == null ? void 0 : _a.warn(game.i18n.localize("VEILED_ROLLS.Panel.RequestNoPlayers"));
      return null;
    }
    const rows = players.map(
      (p) => `<label class="veiled-rolls-pick"><input type="checkbox" name="vr-player" value="${p.id}" checked /> ${p.name}</label>`
    ).join("");
    const chosen = await foundry.applications.api.DialogV2.wait({
      window: { title: game.i18n.localize("VEILED_ROLLS.Panel.PickPlayers") },
      content: `<div class="veiled-rolls-pick-list">${rows}</div>`,
      buttons: [
        {
          action: "ok",
          label: game.i18n.localize("VEILED_ROLLS.Panel.PickConfirm"),
          default: true,
          callback: (_event, button, dialog) => {
            var _a2;
            const host = (dialog == null ? void 0 : dialog.element) ?? (button == null ? void 0 : button.form);
            const boxes = ((_a2 = host == null ? void 0 : host.querySelectorAll) == null ? void 0 : _a2.call(host, 'input[name="vr-player"]:checked')) ?? [];
            return Array.from(boxes).map((b) => b.value);
          }
        },
        { action: "cancel", label: game.i18n.localize("VEILED_ROLLS.Editor.Cancel") }
      ]
    }).catch(() => null);
    return Array.isArray(chosen) ? chosen : null;
  }
  /** Ensure the roll's block is active, then send the request. */
  async request(blockId, rollType, key, targets) {
    var _a;
    const state = getState();
    if (!state.active || state.blockId !== blockId) {
      const block = await getBlock(blockId);
      if (!block) return;
      if (!validateBlock(block).valid) {
        (_a = ui.notifications) == null ? void 0 : _a.warn(game.i18n.localize("VEILED_ROLLS.Notify.BlockInvalid"));
        return;
      }
      resetRequests();
      await activate(block);
    }
    requestRoll(rollType, key, targets);
  }
  /**
   * Start a new session: disable the filter, reset participants and clear the
   * history. Clearing history is what resets every roll's "done" colour, giving
   * a clean slate to replay prepared blocks in the next session.
   */
  static async onNewSession() {
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("VEILED_ROLLS.Panel.NewSession") },
      content: `<p>${game.i18n.localize("VEILED_ROLLS.Panel.NewSessionConfirm")}</p>`
    });
    if (!ok) return;
    resetRequests();
    await disable();
    await resetParticipants();
    await clearHistory();
    _ControlPanel.refresh();
  }
  /** Find a cached history entry by id. */
  entry(id) {
    return this.recent.find((h) => h.id === id);
  }
  static onOpenLibrary() {
    openBlockLibrary();
  }
  static async onOpenActive() {
    const state = getState();
    if (!state.blockId) return;
    const block = await getBlock(state.blockId);
    if (block) openBlockEditor(block);
  }
  static async onDisable() {
    resetRequests();
    await disable();
    _ControlPanel.refresh();
  }
  static async onReset() {
    await resetParticipants();
    _ControlPanel.refresh();
  }
  static async onResend(_event, target) {
    var _a, _b;
    const id = (_a = target == null ? void 0 : target.dataset) == null ? void 0 : _a.id;
    const entry = id ? this.entry(id) : void 0;
    if (!entry) return;
    await resendHistory(entry);
    (_b = ui.notifications) == null ? void 0 : _b.info(game.i18n.localize("VEILED_ROLLS.Notify.Resent"));
  }
  static async onCopy(_event, target) {
    var _a, _b, _c;
    const id = (_a = target == null ? void 0 : target.dataset) == null ? void 0 : _a.id;
    const entry = id ? this.entry(id) : void 0;
    if (!entry) return;
    try {
      await navigator.clipboard.writeText(entry.responseParagraphs.join("\n\n"));
      (_b = ui.notifications) == null ? void 0 : _b.info(game.i18n.localize("VEILED_ROLLS.Notify.Copied"));
    } catch {
      (_c = ui.notifications) == null ? void 0 : _c.warn(game.i18n.localize("VEILED_ROLLS.Notify.CopyFailed"));
    }
  }
  static async onClearHistory() {
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("VEILED_ROLLS.Panel.ClearHistory") },
      content: `<p>${game.i18n.localize("VEILED_ROLLS.Panel.ClearHistoryConfirm")}</p>`
    });
    if (!ok) return;
    await clearHistory();
    _ControlPanel.refresh();
  }
};
__publicField(_ControlPanel, "instance", null);
__publicField(_ControlPanel, "DEFAULT_OPTIONS", {
  id: "veiled-rolls-control-panel",
  classes: ["veiled-rolls", "veiled-rolls-panel"],
  tag: "section",
  window: {
    title: "VEILED_ROLLS.Panel.Title",
    icon: "fa-solid fa-mask",
    resizable: true
  },
  position: { width: 520, height: "auto" },
  actions: {
    openLibrary: _ControlPanel.onOpenLibrary,
    openActive: _ControlPanel.onOpenActive,
    disableFilter: _ControlPanel.onDisable,
    resetParticipants: _ControlPanel.onReset,
    newSession: _ControlPanel.onNewSession,
    resend: _ControlPanel.onResend,
    copyResponse: _ControlPanel.onCopy,
    clearHistory: _ControlPanel.onClearHistory
  }
});
__publicField(_ControlPanel, "PARTS", {
  body: { template: `modules/${MODULE_ID}/templates/control-panel.hbs` }
});
let ControlPanel = _ControlPanel;
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
  var _a;
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
  const module = (_a = game.modules) == null ? void 0 : _a.get(MODULE_ID);
  if (module) {
    module.api = createApi({ openControlPanel, openBlockLibrary });
  }
  Hooks.on("updateSetting", (setting) => {
    var _a2, _b, _c;
    if ((setting == null ? void 0 : setting.key) === `${MODULE_ID}.${SETTINGS.activeFilter}`) {
      ControlPanel.refresh();
      BlockLibrary.refresh();
      if ((_a2 = game.user) == null ? void 0 : _a2.isGM) void ((_c = (_b = ui.hotbar) == null ? void 0 : _b.render) == null ? void 0 : _c.call(_b));
    }
  });
});
Hooks.on("renderHotbar", (_app, element) => {
  var _a;
  if (!((_a = game.user) == null ? void 0 : _a.isGM)) return;
  try {
    const root = (element == null ? void 0 : element[0]) ?? (element instanceof HTMLElement ? element : null);
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
  var _a;
  if (!((_a = game.user) == null ? void 0 : _a.isGM)) return;
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
      if (tokens == null ? void 0 : tokens.tools) tokens.tools.push(tool);
    } else if (controls && typeof controls === "object") {
      const tokens = controls.tokens ?? controls.token;
      if (tokens == null ? void 0 : tokens.tools) tokens.tools[tool.name] = tool;
    }
  } catch (error) {
    console.error("[veiled-rolls] could not add scene control", error);
  }
});
//# sourceMappingURL=module.js.map
