import { describe, expect, it } from "vitest";
import { decideDuplicate } from "../src/services/duplicate-policy.js";
import { matchesParticipant } from "../src/services/participant-matcher.js";
import { doneFromHistory, rollId } from "../src/services/progress-service.js";
import type { HistoryEntry } from "../src/types.js";

describe("decideDuplicate", () => {
  it("applies each policy", () => {
    expect(decideDuplicate("accept_all", "a", ["a"])).toBe("accept");
    expect(decideDuplicate("first_per_actor", "a", ["a"])).toBe("reject");
    expect(decideDuplicate("first_per_actor", "b", ["a"])).toBe("accept");
    expect(decideDuplicate("replace_previous", "a", ["a"])).toBe("replace");
    expect(decideDuplicate("ask_gm", "a", ["a"])).toBe("ask");
  });
});

describe("matchesParticipant", () => {
  const who = { userId: "u1", actorUuid: "Actor.a", tokenUuid: "Token.t" };
  it("handles every mode", () => {
    expect(matchesParticipant({ mode: "all_players", participantIds: [] }, who)).toBe(true);
    expect(matchesParticipant({ mode: "selected_users", participantIds: ["u1"] }, who)).toBe(true);
    expect(matchesParticipant({ mode: "selected_users", participantIds: ["u2"] }, who)).toBe(false);
    expect(matchesParticipant({ mode: "selected_actors", participantIds: ["Actor.a"] }, who)).toBe(true);
    expect(matchesParticipant({ mode: "selected_tokens", participantIds: ["Token.x"] }, who)).toBe(false);
  });
});

describe("done markers", () => {
  const entry = (blockId: string, key: string, timestamp: number) =>
    ({ blockId, rollType: "skill", key, timestamp }) as HistoryEntry;

  it("derives the first answer time per roll from a legacy history", () => {
    const done = doneFromHistory([entry("b", "prc", 30), entry("b", "prc", 10), entry("b", "inv", 20)]);
    expect(done).toEqual({ [rollId("b", "skill", "prc")]: 10, [rollId("b", "skill", "inv")]: 20 });
  });
});
