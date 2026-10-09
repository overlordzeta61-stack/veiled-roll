/**
 * BlockLibrary
 *
 * Lists every event block with search and per-row actions (edit, duplicate,
 * delete, activate, export). Import reads a JSON file, shows a summary and lets
 * the GM choose how id conflicts are handled. All blocks come from the GM-only
 * store, so no secret data reaches players through this window.
 */

import { MODULE_ID } from "../constants.js";
import { activate } from "../controllers/activation-controller.js";
import {
  deleteBlock,
  duplicateBlock,
  exportLibrary,
  getBlocks,
  importLibrary
} from "../services/block-repository.js";
import { validateBlock } from "../services/validation-service.js";
import type { EventBlock, ImportConflictStrategy } from "../types.js";
import { newBlockTemplate, openBlockEditor } from "./block-editor.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Read a text file chosen by the user via a transient file input. */
async function readJsonFile(): Promise<string | null> {
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

/** The block library window. */
export class BlockLibrary extends HandlebarsApplicationMixin(ApplicationV2) {
  static instance: BlockLibrary | null = null;

  static DEFAULT_OPTIONS = {
    id: "veiled-rolls-block-library",
    classes: ["veiled-rolls", "veiled-rolls-library"],
    tag: "section",
    window: {
      title: "VEILED_ROLLS.Library.Title",
      icon: "fa-solid fa-book",
      resizable: true
    },
    position: { width: 720, height: 600 as const },
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

  private query = "";
  private blocks: EventBlock[] = [];

  static open(): void {
    BlockLibrary.instance ??= new BlockLibrary();
    void BlockLibrary.instance.render({ force: true });
  }

  static refresh(): void {
    if (BlockLibrary.instance?.rendered) void BlockLibrary.instance.render();
  }

  async _prepareContext(): Promise<AnyObject> {
    this.blocks = await getBlocks();
    const rows = this.blocks
      .slice()
      .sort((a, b) => (a.folder ?? "").localeCompare(b.folder ?? "") || a.name.localeCompare(b.name))
      .map((b) => ({
        id: b.id,
        search: [b.name, b.folder, ...b.selectors.map((s) => s.label)].join(" ").toLowerCase(),
        name: b.name || game.i18n.localize("VEILED_ROLLS.Library.Unnamed"),
        folder: b.folder || "—",
        rolls: b.selectors.map((s) => s.label?.trim() || s.key).join(", ") || "—",
        personal: b.branches.some((br) => (br.personal_responses ?? []).length > 0),
        mode: game.i18n.localize(
          b.mode === "cumulative_threshold"
            ? "VEILED_ROLLS.Editor.ModeCumulative"
            : "VEILED_ROLLS.Editor.ModeExclusive"
        ),
        updated: new Date(b.metadata.updated_at).toLocaleDateString(),
        valid: validateBlock(b).valid
      }));
    return { rows, query: this.query, count: rows.length };
  }

  private block(id: string): EventBlock | undefined {
    return this.blocks.find((b) => b.id === id);
  }

  /**
   * Filter rows as the GM types. Filtering is done on the rendered rows rather
   * than by re-rendering, so the search field keeps its focus and caret.
   */
  _onRender(_context: AnyObject, _options: AnyObject): void {
    const root = this.element as HTMLElement | null;
    const input = root?.querySelector?.<HTMLInputElement>("#vr-search");
    if (!root || !input) return;
    const apply = (): void => {
      this.query = input.value;
      const q = this.query.trim().toLowerCase();
      for (const row of root.querySelectorAll<HTMLElement>("[data-search]")) {
        row.hidden = q.length > 0 && !(row.dataset.search ?? "").includes(q);
      }
    };
    input.addEventListener("input", apply);
    apply();
  }

  static onCreate(this: BlockLibrary): void {
    openBlockEditor(newBlockTemplate());
  }

  static onEdit(this: BlockLibrary, _event: Event, target: HTMLElement): void {
    const block = this.block(target?.dataset?.id ?? "");
    if (block) openBlockEditor(structuredClone(block));
  }

  static async onDuplicate(this: BlockLibrary, _event: Event, target: HTMLElement): Promise<void> {
    const id = target?.dataset?.id;
    if (!id) return;
    await duplicateBlock(id);
    void this.render();
  }

  static async onDelete(this: BlockLibrary, _event: Event, target: HTMLElement): Promise<void> {
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

  static async onActivate(this: BlockLibrary, _event: Event, target: HTMLElement): Promise<void> {
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

  static async onExportOne(this: BlockLibrary, _event: Event, target: HTMLElement): Promise<void> {
    const id = target?.dataset?.id;
    if (!id) return;
    const data = await exportLibrary([id]);
    foundry.utils.saveDataToFile(
      JSON.stringify(data, null, 2),
      "application/json",
      `veiled-rolls-${id}.json`
    );
  }

  static async onExportAll(this: BlockLibrary): Promise<void> {
    const data = await exportLibrary();
    foundry.utils.saveDataToFile(
      JSON.stringify(data, null, 2),
      "application/json",
      "veiled-rolls-library.json"
    );
  }

  static async onImport(this: BlockLibrary): Promise<void> {
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

/** Ask the GM how to resolve id conflicts on import. */
async function pickStrategy(): Promise<ImportConflictStrategy | null> {
  const choice = await foundry.applications.api.DialogV2.wait({
    window: { title: game.i18n.localize("VEILED_ROLLS.Import.StrategyTitle") },
    content: `<p>${game.i18n.localize("VEILED_ROLLS.Import.StrategyHint")}</p>`,
    buttons: [
      { action: "duplicate", label: game.i18n.localize("VEILED_ROLLS.Import.Duplicate"), default: true },
      { action: "replace", label: game.i18n.localize("VEILED_ROLLS.Import.Replace") },
      { action: "skip", label: game.i18n.localize("VEILED_ROLLS.Import.Skip") }
    ]
  }).catch(() => null);
  return (choice as ImportConflictStrategy | null) ?? null;
}

/** Opener used by the control panel, API and settings menu. */
export function openBlockLibrary(): void {
  BlockLibrary.open();
}

/** Re-render the library if open (after edits from the editor). */
export function refreshBlockLibrary(): void {
  BlockLibrary.refresh();
}
