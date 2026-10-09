/**
 * Module entry point.
 *
 * Wires Foundry lifecycle hooks: registers settings at `init`, and at `ready`
 * attaches the D&D5e roll hooks, the GM socket handler, the public API and the
 * GM scene-control button. The pre/post roll hooks run on every client because
 * interception must happen on the *rolling* client, before any public card is
 * created; only the responsible GM resolves and whispers the response.
 */

import { MODULE_ID, SETTINGS } from "./constants.js";
import { createApi } from "./api.js";
import { getState } from "./controllers/activation-controller.js";
import {
  handlePostRoll,
  handlePreRoll,
  handleRollRequest,
  processFilteredRoll
} from "./controllers/roll-interceptor.js";
import { registerSettings } from "./settings.js";
import { registerRollRequestHandler, registerSocket } from "./services/socket-service.js";
import { ControlPanel, openControlPanel } from "./apps/control-panel.js";
import { BlockLibrary, openBlockLibrary } from "./apps/block-library.js";
import type { RollType } from "./types.js";

/** Map each D&D5e V2 pre-roll hook to our roll-type tag. */
const PRE_HOOKS: Array<[string, RollType]> = [
  ["dnd5e.preRollSkillV2", "skill"],
  ["dnd5e.preRollAbilityCheckV2", "ability_check"],
  ["dnd5e.preRollSavingThrowV2", "saving_throw"]
];

/** Map each D&D5e V2 post-roll hook to our roll-type tag. */
const POST_HOOKS: Array<[string, RollType]> = [
  ["dnd5e.rollSkillV2", "skill"],
  ["dnd5e.rollAbilityCheckV2", "ability_check"],
  ["dnd5e.rollSavingThrowV2", "saving_throw"]
];

Hooks.once("init", () => {
  registerSettings(openBlockLibrary);
  // Small equality helper used by the editor template for <option selected>.
  Handlebars.registerHelper("veiledEq", (a: unknown, b: unknown) => a === b);
  // Concatenate arguments (used to build i18n keys like "PREFIX." + value).
  Handlebars.registerHelper("concat", (...args: unknown[]) =>
    args.slice(0, -1).join("")
  );
});

Hooks.once("ready", () => {
  // The responsible GM resolves and whispers; the handler self-guards internally.
  registerSocket(processFilteredRoll);
  // Targeted players react to GM roll requests.
  registerRollRequestHandler(handleRollRequest);

  // Register roll interception on every client.
  for (const [hook, rollType] of PRE_HOOKS) {
    Hooks.on(hook, (config: AnyObject, _dialog: AnyObject, message: AnyObject) => {
      try {
        handlePreRoll(rollType, config, message);
      } catch (error) {
        console.error(`[veiled-rolls] pre-roll handling failed (${hook})`, error);
      }
    });
  }
  for (const [hook] of POST_HOOKS) {
    Hooks.on(hook, (rolls: AnyObject[], data: AnyObject) => {
      void handlePostRoll(rolls, data).catch((error: unknown) => {
        console.error(`[veiled-rolls] post-roll handling failed (${hook})`, error);
      });
    });
  }

  // Expose the public API (GM-gated internally).
  const module = game.modules?.get(MODULE_ID);
  if (module) {
    module.api = createApi({ openControlPanel, openBlockLibrary });
  }

  // Blocks, history and done markers live on the private store journal: any
  // update to it refreshes the GM windows (only GMs ever receive that journal).
  Hooks.on("updateJournalEntry", (journal: AnyObject) => {
    if (journal?.getFlag?.(MODULE_ID, "store") !== true) return;
    ControlPanel.refresh();
    BlockLibrary.refresh();
  });

  // Keep GM windows in sync with the broadcast active-filter setting.
  Hooks.on("updateSetting", (setting: AnyObject) => {
    if (setting?.key === `${MODULE_ID}.${SETTINGS.activeFilter}`) {
      ControlPanel.refresh();
      BlockLibrary.refresh();
      // Re-render the hotbar so the button reflects the active/idle state.
      if (game.user?.isGM) void ui.hotbar?.render?.();
    }
  });
});

/**
 * Add a GM-only button next to the macro hotbar at the bottom of the screen.
 *
 * This is the primary access point: it is plain DOM injection into the hotbar,
 * which is far more predictable across Foundry versions than the scene-control
 * payload shape. The scene-control button below is kept as a secondary entry.
 */
Hooks.on("renderHotbar", (_app: AnyObject, element: AnyObject) => {
  if (!game.user?.isGM) return;
  try {
    // Foundry ≤ v12 passes a jQuery object; v13 passes an HTMLElement.
    const root: HTMLElement | null =
      element?.[0] ?? (element instanceof HTMLElement ? element : null);
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

/**
 * Add the GM-only scene-control button. The hook payload shape changed across
 * Foundry versions, so both the array (≤ v12) and record (v13) forms are handled
 * defensively; failure here must never break the scene controls.
 */
Hooks.on("getSceneControlButtons", (controls: AnyObject) => {
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
      const tokens = controls.find((c: AnyObject) => c.name === "token");
      if (tokens?.tools) tokens.tools.push(tool);
    } else if (controls && typeof controls === "object") {
      const tokens = controls.tokens ?? controls.token;
      if (tokens?.tools) tokens.tools[tool.name] = tool;
    }
  } catch (error) {
    console.error("[veiled-rolls] could not add scene control", error);
  }
});
