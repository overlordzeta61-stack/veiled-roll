import { describe, expect, it } from "vitest";
import { findPersonalResponse, resolveResponse } from "../src/services/response-resolver.js";
import { makeBlock, tier } from "./fixtures.js";

const roll = (total: number, natural: number | null = null) => ({
  roll_type: "skill" as const,
  key: "prc",
  total,
  natural_result: natural
});

describe("resolveResponse — tiers", () => {
  it("picks the exclusive tier containing the total", () => {
    const block = makeBlock();
    expect(resolveResponse(block, roll(3))?.tierIds).toEqual(["low"]);
    expect(resolveResponse(block, roll(12))?.paragraphs).toEqual(["Une dalle sonne creux."]);
    expect(resolveResponse(block, roll(25))?.tierIds).toEqual(["high"]);
  });

  it("includes both bounds of a range", () => {
    const block = makeBlock();
    expect(resolveResponse(block, roll(10))?.tierIds).toEqual(["mid"]);
    expect(resolveResponse(block, roll(14))?.tierIds).toEqual(["mid"]);
  });

  it("lets a natural-20 tier override the ordinary range", () => {
    const block = makeBlock();
    block.branches[0].tiers.push({ ...tier(null, null, ["Critique !"], "natural_20"), id: "nat20" });
    expect(resolveResponse(block, roll(22, 20))?.tierIds).toEqual(["nat20"]);
    expect(resolveResponse(block, roll(22, 19))?.tierIds).toEqual(["high"]);
  });

  it("assembles every reached threshold in cumulative mode", () => {
    const block = makeBlock({ mode: "cumulative_threshold" });
    block.branches[0].tiers = [
      { ...tier(10, null, ["B"]), id: "b" },
      { ...tier(null, null, ["A"]), id: "a" },
      { ...tier(15, null, ["C"]), id: "c" }
    ];
    expect(resolveResponse(block, roll(12))?.paragraphs).toEqual(["A", "B"]);
    expect(resolveResponse(block, roll(18))?.paragraphs).toEqual(["A", "B", "C"]);
  });

  it("uses the injected random source between equal responses", () => {
    const block = makeBlock();
    block.options.randomize_equal_tier_responses = true;
    block.branches[0].tiers[0].responses = ["un", "deux", "trois"];
    expect(resolveResponse(block, roll(1), () => 0)?.paragraphs).toEqual(["un"]);
    expect(resolveResponse(block, roll(1), () => 0.99)?.paragraphs).toEqual(["trois"]);
  });

  it("falls back when nothing matches, or returns null without fallback", () => {
    const block = makeBlock();
    block.branches[0].tiers = [tier(10, null, ["ok"])];
    const r = resolveResponse(block, roll(2));
    expect(r?.usedFallback).toBe(true);
    expect(r?.paragraphs).toEqual(["Tu ne remarques rien de particulier."]);
    block.options.send_fallback_response = false;
    expect(resolveResponse(block, roll(2))).toBeNull();
  });

  it("falls back for a roll the block does not cover", () => {
    const r = resolveResponse(makeBlock(), { ...roll(15), key: "inv" });
    expect(r?.usedFallback).toBe(true);
  });

  it("computes a tone from the reached tier", () => {
    const block = makeBlock();
    expect(resolveResponse(block, roll(1))?.tone).toBe(0);
    expect(resolveResponse(block, roll(12))?.tone).toBe(0.5);
    expect(resolveResponse(block, roll(20))?.tone).toBe(1);
  });
});

describe("resolveResponse — personal responses", () => {
  const withPersonal = () => {
    const block = makeBlock();
    block.branches[0].personal_responses = [
      { user_id: "alice", response: "Alice reconnaît le symbole de sa guilde." },
      { user_id: "bob", response: "Bob sent l'odeur du soufre." }
    ];
    return block;
  };

  it("gives the designated player their personal text whatever the total", () => {
    const block = withPersonal();
    for (const total of [1, 12, 30]) {
      const r = resolveResponse(block, roll(total), undefined, ["alice"]);
      expect(r?.personal).toBe(true);
      expect(r?.paragraphs).toEqual(["Alice reconnaît le symbole de sa guilde."]);
      expect(r?.tierIds).toEqual([]);
    }
  });

  it("answers every other player with the tiers", () => {
    const r = resolveResponse(withPersonal(), roll(12), undefined, ["carol"]);
    expect(r?.personal).toBe(false);
    expect(r?.tierIds).toEqual(["mid"]);
  });

  it("ignores personal responses when no candidate is given", () => {
    expect(resolveResponse(withPersonal(), roll(12))?.personal).toBe(false);
  });

  it("matches candidates in priority order (roller before owners)", () => {
    const branch = withPersonal().branches[0];
    expect(findPersonalResponse(branch, ["gm", "bob", "alice"])?.user_id).toBe("bob");
  });

  it("skips blank personal entries", () => {
    const block = makeBlock();
    block.branches[0].personal_responses = [{ user_id: "alice", response: "   " }];
    expect(resolveResponse(block, roll(12), undefined, ["alice"])?.personal).toBe(false);
  });

  it("works on a roll answered only by personal responses", () => {
    const block = withPersonal();
    block.branches[0].tiers = [];
    expect(resolveResponse(block, roll(5), undefined, ["bob"])?.personal).toBe(true);
    expect(resolveResponse(block, roll(5), undefined, ["carol"])?.usedFallback).toBe(true);
  });

  it("tolerates blocks created before personal responses existed", () => {
    const block = makeBlock();
    delete block.branches[0].personal_responses;
    expect(resolveResponse(block, roll(12), undefined, ["alice"])?.tierIds).toEqual(["mid"]);
  });
});
