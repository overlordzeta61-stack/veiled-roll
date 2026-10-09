import { describe, expect, it } from "vitest";
import { blockToCards, cardsToBlock, defaultTiers, newCard } from "../src/services/roll-cards.js";
import { validateBlock } from "../src/services/validation-service.js";
import { ids, makeBlock } from "./fixtures.js";

describe("roll cards", () => {
  it("maps each selector to a self-contained card", () => {
    const cards = blockToCards(makeBlock());
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ branchId: "br1", roll_type: "skill", key: "prc", label: "Perception" });
    expect(cards[0].tiers.map((t) => t.id)).toEqual(["low", "mid", "high"]);
  });

  it("splits a branch shared by two selectors into two cards", () => {
    const block = makeBlock();
    block.selectors.push({ roll_type: "skill", key: "inv", label: "Investigation", branch_id: "br1" });
    const cards = blockToCards(block);
    expect(cards.map((c) => c.branchId)).toEqual(["br1", null]);
    const rebuilt = cardsToBlock(block, cards, ids);
    expect(rebuilt.branches).toHaveLength(2);
    expect(new Set(rebuilt.selectors.map((s) => s.branch_id)).size).toBe(2);
    expect(validateBlock(rebuilt).valid).toBe(true);
  });

  it("round-trips an existing block unchanged in substance", () => {
    const block = makeBlock();
    const rebuilt = cardsToBlock(block, blockToCards(block), ids);
    expect(rebuilt.selectors).toEqual(block.selectors);
    expect(rebuilt.branches[0].tiers).toEqual(block.branches[0].tiers);
  });

  it("starts a new roll with three empty tiers that vanish if left blank", () => {
    expect(defaultTiers(ids).map((t) => [t.minimum, t.maximum])).toEqual([[null, 9], [10, 14], [15, null]]);
    const card = newCard(ids, "skill", "prc");
    card.tiers[2].responses = ["Tu vois tout."];
    const block = cardsToBlock(makeBlock(), [card], ids);
    expect(block.branches[0].tiers).toHaveLength(1);
    expect(validateBlock(block).valid).toBe(true);
  });

  it("keeps half-filled personal rows so validation can flag them", () => {
    const card = newCard(ids, "skill", "prc");
    card.tiers[0].responses = ["x"];
    card.personal = [
      { user_id: "", response: "" },
      { user_id: "alice", response: "" },
      { user_id: "bob", response: "  <b>Pour Bob</b><script>x</script> " }
    ];
    const block = cardsToBlock(makeBlock(), [card], ids);
    expect(block.branches[0].personal_responses).toEqual([
      { user_id: "alice", response: "" },
      { user_id: "bob", response: "<b>Pour Bob</b>" }
    ]);
    expect(validateBlock(block).valid).toBe(false);
  });

  it("does not mutate the source block", () => {
    const block = makeBlock();
    const snapshot = structuredClone(block);
    cardsToBlock(block, [newCard(ids)], ids);
    expect(block).toEqual(snapshot);
  });
});
