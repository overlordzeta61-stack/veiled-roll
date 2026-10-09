/**
 * BlockEditor
 *
 * Single-page editor for a set of veiled rolls. Everything the GM needs sits on
 * one scrolling page: name and folder at the top, then one card per roll (type,
 * skill, response tiers, personal responses and an inline test), and the rarely
 * used settings folded into an "Advanced options" section at the bottom.
 *
 * The working copy is held in memory as {@link RollCard}s; every field present
 * in the DOM is read back before any structural action (add/remove a roll, a
 * tier or a personal response), so nothing typed is lost across re-renders.
 * Saving rebuilds the stored block shape and validates it before persisting.
 */

import { MODULE_ID, ROLL_TYPES, SCHEMA_VERSION } from "../constants.js";
import { getKeyLabel, listRollKeys } from "../adapters/dnd5e-roll-adapter.js";
import { activate } from "../controllers/activation-controller.js";
import { getBlocks, upsertBlock } from "../services/block-repository.js";
import { sanitizeHtml } from "../services/html-sanitizer.js";
import { resolveResponse } from "../services/response-resolver.js";
import {
  blockToCards,
  cardsToBlock,
  emptyTier,
  newCard,
  type RollCard
} from "../services/roll-cards.js";
import { validateBlock } from "../services/validation-service.js";
import type {
  DuplicatePolicy,
  EventBlock,
  ParticipantMode,
  ResolutionMode,
  ResponseTier,
  RollType
} from "../types.js";
import { refreshBlockLibrary } from "./block-library.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const PARTICIPANT_MODES: ParticipantMode[] = [
  "all_players",
  "selected_users",
  "selected_tokens",
  "selected_actors"
];
const DUPLICATE_POLICIES: DuplicatePolicy[] = [
  "first_per_actor",
  "accept_all",
  "replace_previous",
  "ask_gm"
];
const AUTO_CLOSE_MODES = ["manual", "after_roll_count", "after_each_participant"] as const;
const NATURAL_OPTIONS = ["any", "natural_1", "natural_20"] as const;

/** Fresh id from Foundry's helper. */
function newId(): string {
  return foundry.utils.randomID();
}

/** Build a fresh, valid-shaped empty block for the "create" flow. */
export function newBlockTemplate(folder = ""): EventBlock {
  const now = new Date().toISOString();
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

/** Every non-GM user, sorted by name: the players a personal response can target. */
function playerUsers(): Array<{ id: string; name: string }> {
  return (game.users ?? [])
    .filter((u: AnyObject) => !u.isGM)
    .map((u: AnyObject) => ({ id: String(u.id), name: String(u.name) }))
    .sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name));
}

/** Per-card state of the inline test tool. */
interface CardTest {
  total: number;
  userId: string;
  result: string[] | null;
}

/** The block editor window. */
export class BlockEditor extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "veiled-rolls-block-editor-{id}",
    classes: ["veiled-rolls", "veiled-rolls-editor"],
    tag: "form",
    window: {
      title: "VEILED_ROLLS.Editor.Title",
      icon: "fa-solid fa-mask",
      resizable: true
    },
    position: { width: 680, height: 760 as const }
  };

  static PARTS = {
    body: { template: `modules/${MODULE_ID}/templates/block-editor.hbs` }
  };

  /** Block-level fields and options (selectors/branches live in `cards`). */
  private working: EventBlock;
  /** One card per roll; the source of truth for selectors and branches. */
  private cards: RollCard[];
  /** Inline test state, parallel to `cards`. */
  private tests: CardTest[];
  /** Whether the advanced-options section is unfolded. */
  private advancedOpen = false;
  /** Validation errors (localized) from the last save attempt. */
  private errors: string[] = [];

  constructor(block: EventBlock, options: AnyObject = {}) {
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
  private blankTest(): CardTest {
    return { total: 12, userId: "", result: null };
  }

  async _prepareContext(): Promise<AnyObject> {
    const w = this.working;
    const players = playerUsers();
    const nameOf = (id: string): string =>
      players.find((p) => p.id === id)?.name ?? id;
    const isExclusive = w.mode === "exclusive_range";

    // Existing folders, offered as suggestions so related rolls stay grouped.
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
          tiers: card.tiers.map((t, ti) => ({
            index: ti,
            minimum: t.minimum,
            maximum: t.maximum,
            responsesText: t.responses.join("\n"),
            naturals: NATURAL_OPTIONS.map((n) => ({
              value: n,
              label: `VEILED_ROLLS.Natural.${n}`,
              selected: n === t.natural_roll
            }))
          })),
          personal: card.personal.map((p, pi) => ({
            index: pi,
            response: p.response,
            players: [
              ...players.map((u) => ({ ...u, selected: u.id === p.user_id })),
              // Keep a stale id visible rather than silently dropping it.
              ...(p.user_id && !players.some((u) => u.id === p.user_id)
                ? [{ id: p.user_id, name: nameOf(p.user_id), selected: true }]
                : [])
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
      showIdList:
        w.options.participant_mode === "selected_tokens" ||
        w.options.participant_mode === "selected_actors",
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
  private get form(): HTMLFormElement | null {
    return this.element instanceof HTMLFormElement
      ? this.element
      : this.element?.querySelector?.("form") ?? null;
  }

  /** Read a scalar string value by input name (empty when absent). */
  private field(name: string): string {
    const el = this.form?.elements.namedItem(name) as HTMLInputElement | null;
    return el?.value ?? "";
  }

  /** Whether an input with this name is currently rendered. */
  private has(name: string): boolean {
    return Boolean(this.form?.elements.namedItem(name));
  }

  /** Read a checkbox value by input name. */
  private checked(name: string): boolean {
    const el = this.form?.elements.namedItem(name) as HTMLInputElement | null;
    return Boolean(el?.checked);
  }

  /** Parse an optional number input. */
  private optionalNumber(name: string): number | null {
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
  private sync(): void {
    if (!this.form) return;
    const w = this.working;

    if (this.has("name")) w.name = this.field("name").trim();
    if (this.has("folder")) w.folder = this.field("folder").trim();

    this.cards = this.cards.map((card, ci) => {
      if (!this.has(`card-${ci}-type`)) return card;
      const rollType = (this.field(`card-${ci}-type`) as RollType) || card.roll_type;
      // Switching between skill and ability invalidates the key.
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
    w.mode = (this.field("mode") as ResolutionMode) || w.mode;
    w.description = this.field("description");

    const opts = w.options;
    opts.include_gm_in_whisper = this.checked("include_gm_in_whisper");
    opts.show_total_to_gm = this.checked("show_total_to_gm");
    opts.show_result_to_player = this.checked("show_result_to_player");
    opts.color_by_tier = this.checked("color_by_tier");
    opts.dice_so_nice_mode =
      (this.field("dice_so_nice_mode") as EventBlock["options"]["dice_so_nice_mode"]) || "disabled";
    opts.randomize_equal_tier_responses = this.checked("randomize_equal_tier_responses");
    opts.send_fallback_response = this.checked("send_fallback_response");
    opts.fallback_response = this.field("fallback_response");
    opts.auto_close_mode =
      (this.field("auto_close_mode") as EventBlock["options"]["auto_close_mode"]) || "manual";
    const count = this.optionalNumber("auto_close_roll_count");
    opts.auto_close_roll_count = count !== null && count > 0 ? count : null;
    opts.duplicate_policy = (this.field("duplicate_policy") as DuplicatePolicy) || opts.duplicate_policy;

    const previousMode = opts.participant_mode;
    opts.participant_mode = (this.field("participant_mode") as ParticipantMode) || previousMode;
    if (opts.participant_mode !== previousMode) {
      // Ids of one kind (users, tokens, actors) mean nothing for another.
      opts.participant_ids = [];
    } else if (this.form.querySelector('[name="participant_user"]')) {
      opts.participant_ids = Array.from(
        this.form.querySelectorAll<HTMLInputElement>('input[name="participant_user"]:checked')
      ).map((el) => el.value);
    } else if (this.has("participant_ids")) {
      opts.participant_ids = this.field("participant_ids")
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    }
  }

  /** Parse one tier's fields from the DOM. */
  private readTier(ci: number, ti: number, current: ResponseTier): ResponseTier {
    if (!this.has(`tier-${ci}-${ti}-responses`)) return current;
    return {
      ...current,
      minimum: this.optionalNumber(`tier-${ci}-${ti}-min`),
      maximum: this.optionalNumber(`tier-${ci}-${ti}-max`),
      responses: this.field(`tier-${ci}-${ti}-responses`)
        .split("\n")
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
      natural_roll:
        (this.field(`tier-${ci}-${ti}-natural`) as ResponseTier["natural_roll"]) || "any"
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
  _onRender(_context: AnyObject, _options: AnyObject): void {
    const root = this.element as HTMLElement | null;
    if (!root?.addEventListener || root.dataset.vrBound === "1") return;
    root.dataset.vrBound = "1";

    root.addEventListener("click", (event: Event) => {
      const button = (event.target as HTMLElement)?.closest?.<HTMLElement>("[data-vr-action]");
      if (!button || !root.contains(button)) return;
      event.preventDefault();
      void this.dispatch(button.dataset.vrAction ?? "", button.dataset);
    });

    // Changing a roll type rebuilds that card's key list; changing the
    // participant mode swaps the picker underneath it.
    root.addEventListener("change", (event: Event) => {
      const el = event.target as HTMLElement;
      if (el?.closest?.("[data-vr-refresh]")) {
        this.sync();
        void this.render();
      }
    });

    root.addEventListener(
      "toggle",
      (event: Event) => {
        const el = event.target as HTMLDetailsElement;
        if (el?.dataset?.vrAdvanced !== undefined) this.advancedOpen = el.open;
      },
      true
    );

    // Enter in a text field must not submit (and close) the form.
    root.addEventListener("submit", (event: Event) => event.preventDefault());
  }

  /** Route a delegated click to its handler. */
  private async dispatch(action: string, data: DOMStringMap): Promise<void> {
    const ci = Number(data.card);
    const index = Number(data.index);

    if (action === "save") return this.onSave(false);
    if (action === "saveActivate") return this.onSave(true);
    if (action === "cancel") {
      await this.close();
      return;
    }

    // sync() rebuilds the card objects: look the card up only afterwards.
    this.sync();
    const card = Number.isInteger(ci) ? this.cards[ci] : undefined;
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
          copy.tiers = copy.tiers.map((t) => ({ ...t, id: newId() }));
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
  private runTest(ci: number): void {
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
      undefined,
      test.userId ? [test.userId] : []
    );
    if (!resolved) {
      test.result = [game.i18n.localize("VEILED_ROLLS.Editor.TestNoMatch")];
      return;
    }
    const prefix = resolved.personal
      ? [game.i18n.localize("VEILED_ROLLS.Editor.TestPersonal")]
      : resolved.usedFallback
        ? [game.i18n.localize("VEILED_ROLLS.Editor.TestFallback")]
        : [];
    test.result = [...prefix, ...resolved.paragraphs.map(sanitizeHtml)];
  }

  /** Fill the participant list from the tokens currently selected on the canvas. */
  private captureSelection(): void {
    const opts = this.working.options;
    const controlled: AnyObject[] = canvas?.tokens?.controlled ?? [];
    const ids = controlled
      .map((t) =>
        opts.participant_mode === "selected_actors" ? t?.actor?.uuid : t?.document?.uuid
      )
      .filter((id): id is string => typeof id === "string");
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
  private assemble(): EventBlock {
    const cards = this.cards.map((card) => ({
      ...card,
      // An empty label falls back to the system's own wording for the key.
      label: card.label.trim() || (card.key ? getKeyLabel(card.roll_type, card.key) : "")
    }));
    const block = cardsToBlock(this.working, cards, newId);
    block.options.fallback_response = sanitizeHtml(block.options.fallback_response);
    block.metadata.updated_at = new Date().toISOString();
    return block;
  }

  /** Validate and persist; returns the saved block or null on failure. */
  private async persist(): Promise<EventBlock | null> {
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
  private async onSave(andActivate: boolean): Promise<void> {
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

/** Open the editor for a given block (existing or new template). */
export function openBlockEditor(block: EventBlock): void {
  void new BlockEditor(block).render({ force: true });
}
