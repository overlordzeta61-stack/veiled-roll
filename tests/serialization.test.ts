import { describe, expect, it } from "vitest";
import { applyImport, coerceImportedBlock, exportBlocks } from "../src/services/block-serialization.js";
import { containsDangerousHtml, sanitizeHtml } from "../src/services/html-sanitizer.js";
import { validateBlock } from "../src/services/validation-service.js";
import { ids, makeBlock } from "./fixtures.js";

describe("sanitizeHtml", () => {
  it("keeps formatting tags and strips everything else", () => {
    expect(sanitizeHtml('<b class="x">gras</b><script>alert(1)</script><img src=x onerror=y>'))
      .toBe("<b>gras</b>");
    expect(sanitizeHtml("<p>a<br/>b</p>")).toBe("<p>a<br>b</p>");
  });

  it("flags executable-looking content", () => {
    expect(containsDangerousHtml("<script>")).toBe(true);
    expect(containsDangerousHtml("javascript:void(0)")).toBe(true);
    expect(containsDangerousHtml("<b>ok</b>")).toBe(false);
  });
});

describe("import / export", () => {
  it("round-trips a block with personal responses", () => {
    const block = makeBlock();
    block.branches[0].personal_responses = [{ user_id: "alice", response: "<em>Pour toi</em>" }];
    const exported = JSON.parse(JSON.stringify(exportBlocks([block], "now")));
    expect(exported.schema_version).toBe(2);
    const back = coerceImportedBlock(exported.blocks[0], ids, "now", "gm");
    expect(back.branches[0].personal_responses).toEqual([{ user_id: "alice", response: "<em>Pour toi</em>" }]);
    expect(validateBlock(back).valid).toBe(true);
  });

  it("sanitizes and drops unusable personal entries on import", () => {
    const raw = makeBlock() as unknown as Record<string, any>;
    raw.branches[0].personal_responses = [
      { user_id: "alice", response: "<script>x</script>Salut" },
      { user_id: "", response: "orphelin" },
      { user_id: "bob", response: "" },
      "garbage"
    ];
    const block = coerceImportedBlock(raw, ids, "now", "gm");
    expect(block.branches[0].personal_responses).toEqual([{ user_id: "alice", response: "Salut" }]);
  });

  it("imports a v1 block (no personal responses) as an empty list", () => {
    const raw = makeBlock() as unknown as Record<string, any>;
    delete raw.branches[0].personal_responses;
    expect(coerceImportedBlock(raw, ids, "now", "gm").branches[0].personal_responses).toEqual([]);
  });

  it("applies the conflict strategies", () => {
    const existing = [makeBlock()];
    const incoming = [makeBlock({ name: "Nouveau" })];
    expect(applyImport(existing, incoming, "skip", ids).summary.skipped).toBe(1);
    const replaced = applyImport(existing, incoming, "replace", ids);
    expect(replaced.blocks[0].name).toBe("Nouveau");
    const dup = applyImport(existing, incoming, "duplicate", ids);
    expect(dup.blocks).toHaveLength(2);
    expect(dup.blocks[1].id).not.toBe("block1");
  });
});
