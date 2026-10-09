/**
 * ControlPanel
 *
 * The GM's main window. Prepared rolls are split into three views so what is
 * left to play never mixes with what has been played:
 *
 *  - **To do**: rolls not yet answered, requested ones pinned on top with the
 *    players still awaited; one click asks the whole group or chosen players.
 *  - **Done**: answered rolls with who rolled what, a re-request and a
 *    "back to to-do" action.
 *  - **History**: every processed roll, kept across sessions, with resend/copy.
 *
 * It is a singleton and re-renders whenever the active filter or the private
 * store (blocks, history, done markers) changes.
 */

import { MODULE_ID } from "../constants.js";
import { activate, disable, getState, resetParticipants } from "../controllers/activation-controller.js";
import { getBlock, getBlocks } from "../services/block-repository.js";
import { validateBlock } from "../services/validation-service.js";
import { clearHistory, getHistory } from "../services/history-service.js";
import { clearDone, getDone, markDone, rollId, unmarkDone } from "../services/progress-service.js";
import { resendHistory } from "../services/whisper-service.js";
import {
  connectedPlayers,
  outstandingSelectorIds,
  outstandingUsers,
  requestRoll,
  resetRequests
} from "../services/roll-request-service.js";
import { getKeyLabel } from "../adapters/dnd5e-roll-adapter.js";
import type { EventBlock, HistoryEntry, RollType } from "../types.js";
import { openBlockLibrary } from "./block-library.js";
import { newBlockTemplate, openBlockEditor } from "./block-editor.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** The three views of the panel. */
type PanelView = "todo" | "done" | "history";

/** How many history entries the history view shows. */
const HISTORY_VIEW_LIMIT = 100;

/** Format an ISO/epoch timestamp as a short local time string. */
function shortTime(value: number | string | null): string {
  if (value === null) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Format a timestamp as a short date + time. */
function shortDateTime(value: number | string | null): string {
  if (value === null) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return `${date.toLocaleDateString()} ${shortTime(value)}`;
}

/** Display name of a user id. */
function userName(id: string): string {
  return game.users?.get(id)?.name ?? id;
}

/** Escape a string for insertion as HTML text. */
function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Strip markup from a stored response for a one-line preview. */
function plain(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/** One prepared roll as shown in the to-do / done lists. */
interface RollRow {
  id: string;
  blockId: string;
  blockName: string;
  folder: string;
  rollType: RollType;
  key: string;
  label: string;
  valid: boolean;
  status: "todo" | "requested" | "done";
  waiting: string;
  personalNames: string;
  doneAt: string;
  results: Array<{ actorName: string; total: number; personal: boolean; preview: string }>;
}

/** The GM control panel window. */
export class ControlPanel extends HandlebarsApplicationMixin(ApplicationV2) {
  static instance: ControlPanel | null = null;

  static DEFAULT_OPTIONS = {
    id: "veiled-rolls-control-panel",
    classes: ["veiled-rolls", "veiled-rolls-panel"],
    tag: "section",
    window: {
      title: "VEILED_ROLLS.Panel.Title",
      icon: "fa-solid fa-mask",
      resizable: true
    },
    position: { width: 560, height: 680 as const }
  };

  static PARTS = {
    body: { template: `modules/${MODULE_ID}/templates/control-panel.hbs` }
  };

  /** Current view. */
  private view: PanelView = "todo";
  /** Folder names the GM has collapsed, per view, to keep long lists readable. */
  private collapsedFolders = new Set<string>();
  /** Cache of history shown, for action handlers to read by id. */
  private recent: HistoryEntry[] = [];
  /** Cache of blocks, for personal-response hints in the player picker. */
  private blocks: EventBlock[] = [];

  /** Open (or bring to front) the singleton panel. */
  static open(): void {
    ControlPanel.instance ??= new ControlPanel();
    void ControlPanel.instance.render({ force: true });
  }

  /** Re-render the panel if it is currently open. */
  static refresh(): void {
    if (ControlPanel.instance?.rendered) void ControlPanel.instance.render();
  }

  async _prepareContext(): Promise<AnyObject> {
    const state = getState();
    const history = await getHistory();
    const done = await getDone();
    const pendingKeys = outstandingSelectorIds();
    const noFolder = game.i18n.localize("VEILED_ROLLS.Panel.NoFolder");
    this.blocks = await getBlocks();

    // Results per prepared roll, newest first, for the "done" view.
    const resultsByRoll = new Map<string, HistoryEntry[]>();
    for (const h of history) {
      const id = rollId(h.blockId, h.rollType, h.key);
      const list = resultsByRoll.get(id) ?? [];
      list.unshift(h);
      resultsByRoll.set(id, list);
    }

    const rows: RollRow[] = [];
    for (const block of this.blocks) {
      const valid = validateBlock(block).valid;
      const isActiveBlock = state.active && state.blockId === block.id;
      for (const s of block.selectors) {
        const id = rollId(block.id, s.roll_type, s.key);
        const requested = isActiveBlock && pendingKeys.has(`${s.roll_type}|${s.key}`);
        const doneAt = done[id];
        const status = requested ? "requested" : doneAt !== undefined ? "done" : "todo";
        const branch = block.branches.find((b) => b.id === s.branch_id);
        const results = (resultsByRoll.get(id) ?? [])
          // Only answers since the roll was (last) marked done. Both times are
          // taken on the GM client, so no clock skew between machines.
          .filter((h) => doneAt === undefined || h.timestamp >= doneAt - 5000)
          .slice(0, 8)
          .map((h) => ({
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
          doneAt: doneAt !== undefined ? shortDateTime(doneAt) : "",
          results
        });
      }
    }

    const todoRows = rows
      .filter((r) => r.status !== "done")
      // Requested rolls first: they are what the table is playing right now.
      .sort((a, b) => Number(b.status === "requested") - Number(a.status === "requested"));
    const doneRows = rows.filter((r) => r.status === "done");

    this.recent = history.slice(-HISTORY_VIEW_LIMIT).reverse();
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
  private groupByFolder(rows: RollRow[]): AnyObject[] {
    const groups = new Map<string, RollRow[]>();
    for (const row of rows) {
      const list = groups.get(row.folder) ?? [];
      list.push(row);
      groups.set(row.folder, list);
    }
    return [...groups.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, list]) => ({
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
  _onRender(_context: AnyObject, _options: AnyObject): void {
    const root = this.element as HTMLElement | null;
    if (!root?.addEventListener || root.dataset.vrBound === "1") return;
    root.dataset.vrBound = "1";
    root.addEventListener("click", (event: Event) => {
      const button = (event.target as HTMLElement)?.closest?.<HTMLElement>("[data-vr-action]");
      if (!button || !root.contains(button)) return;
      event.preventDefault();
      void this.dispatch(button.dataset.vrAction ?? "", button.dataset).catch((error: unknown) => {
        console.error("[veiled-rolls] panel action failed", error);
      });
    });
  }

  /** Route a delegated click to its handler. */
  private async dispatch(action: string, data: DOMStringMap): Promise<void> {
    const blockId = data.block ?? "";
    const rollType = data.type as RollType | undefined;
    const key = data.key ?? "";

    switch (action) {
      case "view":
        this.view = (data.view as PanelView) ?? "todo";
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
        if (!(await this.confirm("NewSession", "NewSessionConfirm"))) return;
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
        if (!(await this.confirm("ClearHistory", "ClearHistoryConfirm"))) return;
        await clearHistory();
        break;
      default:
        return;
    }
    void this.render();
  }

  /** Yes/no confirmation using two Panel.* i18n keys. */
  private async confirm(titleKey: string, bodyKey: string): Promise<boolean> {
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
  private async pickPlayers(blockId: string, rollType: RollType, key: string): Promise<string[] | null> {
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

    const rows = players
      .map((p) => {
        const flag = personal.has(p.id)
          ? ` <i class="fa-solid fa-user-secret" title="${personalHint}" aria-label="${personalHint}"></i>`
          : "";
        return `<label class="veiled-rolls-pick"><input type="checkbox" name="vr-player" value="${p.id}" /> ${escapeText(p.name)}${flag}</label>`;
      })
      .join("");
    const chosen = await foundry.applications.api.DialogV2.wait({
      window: { title: game.i18n.localize("VEILED_ROLLS.Panel.PickPlayers") },
      content: `<div class="veiled-rolls-pick-list">${rows}</div>`,
      buttons: [
        {
          action: "ok",
          label: game.i18n.localize("VEILED_ROLLS.Panel.PickConfirm"),
          default: true,
          callback: (_event: Event, button: AnyObject, dialog: AnyObject) => {
            const host = dialog?.element ?? button?.form;
            const boxes = host?.querySelectorAll?.('input[name="vr-player"]:checked') ?? [];
            return Array.from(boxes).map((b) => (b as HTMLInputElement).value);
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
    return chosen as string[];
  }

  /** Ensure the roll's block is active, then send the request. */
  private async request(
    blockId: string,
    rollType: RollType,
    key: string,
    targets: string[] | null
  ): Promise<void> {
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

/** Convenience opener used by the API and scene control. */
export function openControlPanel(): void {
  ControlPanel.open();
}
