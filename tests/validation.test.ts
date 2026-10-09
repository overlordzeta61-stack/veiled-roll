import { describe, expect, it } from "vitest";
import { validateBlock, validateImportShape } from "../src/services/validation-service.js";
import { makeBlock, tier } from "./fixtures.js";

const keys = (block: ReturnType<typeof makeBlock>) =>
  validateBlock(block).errors.map((e) => e.messageKey.replace("VEILED_ROLLS.Validation.", ""));

describe("validateBlock", () => {
  it("accepts the reference block", () => {
    expect(validateBlock(makeBlock()).valid).toBe(true);
  });

  it("requires a name and at least one roll", () => {
    expect(keys(makeBlock({ name: " ", selectors: [] }))).toEqual(
      expect.arrayContaining(["NameRequired", "SelectorRequired"])
    );
  });

  it("rejects unknown keys and dangling branches", () => {
    const block = makeBlock();
    block.selectors[0].key = "perception";
    block.selectors.push({ roll_type: "skill", key: "inv", label: "", branch_id: "nope" });
    expect(keys(block)).toEqual(expect.arrayContaining(["UnknownKey", "BranchMissing"]));
  });

  it("rejects overlapping exclusive ranges but not natural-specific tiers", () => {
    const block = makeBlock();
    block.branches[0].tiers.push(tier(null, null, ["crit"], "natural_20"));
    expect(validateBlock(block).valid).toBe(true);
    block.branches[0].tiers.push(tier(12, 16, ["overlap"]));
    expect(keys(block)).toContain("OverlappingRanges");
  });

  it("allows a roll with personal responses but no tier", () => {
    const block = makeBlock();
    block.branches[0].tiers = [];
    expect(keys(block)).toContain("TierRequired");
    block.branches[0].personal_responses = [{ user_id: "alice", response: "Pour toi." }];
    expect(validateBlock(block).valid).toBe(true);
  });

  it("checks personal responses: player, text, duplicates, html", () => {
    const block = makeBlock();
    block.branches[0].personal_responses = [
      { user_id: "", response: "Sans joueur" },
      { user_id: "alice", response: "" },
      { user_id: "alice", response: "Deuxième" },
      { user_id: "bob", response: '<a onclick="x()">clic</a>' }
    ];
    expect(keys(block)).toEqual(
      expect.arrayContaining(["PersonalUserRequired", "PersonalEmpty", "PersonalDuplicate", "DangerousHtml"])
    );
  });
});

describe("validateImportShape", () => {
  it("accepts v1 and v2 payloads and rejects newer ones", () => {
    expect(validateImportShape({ schema_version: 1, blocks: [] }).valid).toBe(true);
    expect(validateImportShape({ schema_version: 2, blocks: [] }).valid).toBe(true);
    expect(validateImportShape({ schema_version: 3, blocks: [] }).valid).toBe(false);
    expect(validateImportShape(null).valid).toBe(false);
    expect(validateImportShape({ schema_version: 2 }).valid).toBe(false);
  });
});
