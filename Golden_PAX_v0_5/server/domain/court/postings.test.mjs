import { describe, it, expect } from "vitest";
import { assignPosting, recallPosting } from "./postings.mjs";
import { seatNpcCouncil, unseatNpcCouncil, unlockCouncilSeat, isSeatUnlocked, ensureFactionCouncil } from "./councilSeats.mjs";
import { defaultNpc, ensurePlayerRulers } from "./npcRoster.mjs";
import { getContent } from "../../contentLoader.mjs";

const content = getContent(["core"]);

describe("assignPosting / recallPosting", () => {
  it("rejects the ruler and a busy NPC, and clears another NPC already on the same target", () => {
    const ruler = ensurePlayerRulers({
      npcs: [defaultNpc({ id: "r", name: "R", raceId: "x", isPlayerRuler: true })],
    });
    const r = ruler.npcs[0];
    expect(
      assignPosting({
        npc: r,
        npcs: ruler.npcs,
        kind: "governor",
        targetId: "sys.1",
        faction: { id: "f1", rulerNpcId: ruler.rulerNpcId },
        turn: 2,
        target: { ownerFactionId: "f1" },
      }).error,
    ).toBe("npc_is_player_ruler");

    const busy = defaultNpc({ id: "b", name: "B", raceId: "x", currentTask: { id: "t" } });
    expect(
      assignPosting({
        npc: busy,
        npcs: [busy],
        kind: "governor",
        targetId: "sys.1",
        faction: { id: "f1" },
        turn: 2,
        target: { ownerFactionId: "f1" },
      }).error,
    ).toBe("npc_busy");

    const a = defaultNpc({ id: "a", name: "A", raceId: "x", posting: { kind: "governor", systemId: "sys.1", sinceTurn: 0 }, status: "away" });
    const c = defaultNpc({ id: "c", name: "C", raceId: "x" });
    const assigned = assignPosting({
      npc: c,
      npcs: [a, c],
      kind: "governor",
      targetId: "sys.1",
      faction: { id: "f1" },
      turn: 4,
      target: { ownerFactionId: "f1" },
    });
    expect(assigned.ok).toBe(true);
    expect(assigned.npcs.find((n) => n.id === "c").posting).toMatchObject({ kind: "governor", systemId: "sys.1" });
    expect(assigned.npcs.find((n) => n.id === "c").councilSeat).toBeNull();
    expect(assigned.npcs.find((n) => n.id === "a").posting.kind).toBe("court");
    expect(assigned.npcs.find((n) => n.id === "a").status).toBe("active");

    const recalled = recallPosting({ npc: assigned.npcs.find((n) => n.id === "c"), npcs: assigned.npcs, turn: 5 });
    expect(recalled.ok).toBe(true);
    expect(recalled.npcs.find((n) => n.id === "c").posting.kind).toBe("court");
  });

  it("commander requires a legion and admiral requires a fleet", () => {
    const n = defaultNpc({ id: "n", name: "N", raceId: "x" });
    expect(
      assignPosting({
        npc: n,
        npcs: [n],
        kind: "commander",
        targetId: "flt.1",
        faction: { id: "f1" },
        turn: 1,
        target: { factionId: "f1", kind: "fleet" },
      }).error,
    ).toBe("npc_posting_foreign");
    expect(
      assignPosting({
        npc: n,
        npcs: [n],
        kind: "admiral",
        targetId: "leg.1",
        faction: { id: "f1" },
        turn: 1,
        target: { factionId: "f1", kind: "legion" },
      }).error,
    ).toBe("npc_posting_foreign");
  });
});

describe("council seat lock / player seat", () => {
  it("seat.at_large starts locked and unlocks only via the GM action", () => {
    const fac = { council: ensureFactionCouncil({}, content), npcs: [] };
    expect(isSeatUnlocked(fac, "seat.at_large", content)).toBe(false);
    const unlocked = { ...fac, council: unlockCouncilSeat(fac, "seat.at_large", content) };
    expect(isSeatUnlocked(unlocked, "seat.at_large", content)).toBe(true);
  });

  it("a player can seat an NPC on an unlocked advisor seat but not the throne", () => {
    const npcs = [defaultNpc({ id: "n", name: "N", raceId: "x" })];
    const fac = { council: ensureFactionCouncil({}, content), npcs, rulerNpcId: null };
    expect(seatNpcCouncil(fac, "n", "seat.ruler", content).error).toBe("council_seat_ruler_locked");
    const seated = seatNpcCouncil(fac, "n", "seat.warlord", content);
    expect(seated.ok).toBe(true);
    expect(seated.npcs[0].councilSeat).toBe("seat.warlord");
    const unseated = unseatNpcCouncil({ ...fac, npcs: seated.npcs }, "n");
    expect(unseated.ok).toBe(true);
    expect(unseated.npcs[0].councilSeat).toBeNull();
  });
});
