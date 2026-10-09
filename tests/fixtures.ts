import type { EventBlock, ResponseTier } from "../src/types.js";

let counter = 0;
/** Deterministic id factory for tests. */
export const ids = (): string => `id${++counter}`;

export function tier(
  minimum: number | null,
  maximum: number | null,
  responses: string[],
  natural_roll: ResponseTier["natural_roll"] = "any"
): ResponseTier {
  return { id: ids(), minimum, maximum, responses, gm_note: "", natural_roll, weighting: "equal" };
}

/** A valid block with one Perception roll and three exclusive tiers. */
export function makeBlock(overrides: Partial<EventBlock> = {}): EventBlock {
  return {
    id: "block1",
    name: "Couloir piégé",
    folder: "Session 1",
    description: "",
    enabled: true,
    mode: "exclusive_range",
    selectors: [{ roll_type: "skill", key: "prc", label: "Perception", branch_id: "br1" }],
    branches: [
      {
        id: "br1",
        label: "Perception",
        roll_type: "skill",
        key: "prc",
        tiers: [
          { ...tier(null, 9, ["Rien."]), id: "low" },
          { ...tier(10, 14, ["Une dalle sonne creux."]), id: "mid" },
          { ...tier(15, null, ["Le mécanisme est évident."]), id: "high" }
        ],
        personal_responses: []
      }
    ],
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
      fallback_response: "Tu ne remarques rien de particulier.",
      randomize_equal_tier_responses: false
    },
    metadata: { created_at: "", updated_at: "", created_by: "gm", schema_version: 2 },
    ...overrides
  };
}
