import { describe, it, expect } from "vitest";
import { ensurePlayerRulers, removeNpc, setRuler, upsertNpc, defaultNpc } from "./npcRoster.mjs";

function fac(npcs, rulerNpcId = null) {
  return { rulerNpcId, npcs };
}

describe("ensurePlayerRulers", () => {
  it("locks the marked isPlayerRuler NPC on the throne and clears the flag on others", () => {
    const result = ensurePlayerRulers(
      fac([
        defaultNpc({ id: "a", name: "A", raceId: "r", isPlayerRuler: true }),
        defaultNpc({ id: "b", name: "B", raceId: "r", isPlayerRuler: true, councilSeat: "seat.ruler" }),
      ]),
    );
    expect(result.rulerNpcId).toBe("a");
    expect(result.npcs[0]).toMatchObject({ isPlayerRuler: true, councilSeat: "seat.ruler", posting: { kind: "court" } });
    expect(result.npcs[1].isPlayerRuler).toBe(false);
    expect(result.npcs[1].councilSeat).toBeNull();
  });

  it("falls back to the NPC seated at seat.ruler when no flag is set", () => {
    const result = ensurePlayerRulers(
      fac([defaultNpc({ id: "s", name: "S", raceId: "r", councilSeat: "seat.ruler" })]),
    );
    expect(result.rulerNpcId).toBe("s");
    expect(result.npcs[0].isPlayerRuler).toBe(true);
  });

  it("clears a dead/hidden ruler and promotes another marked NPC", () => {
    const result = ensurePlayerRulers(
      fac(
        [
          defaultNpc({ id: "dead", name: "D", raceId: "r", status: "dead", isPlayerRuler: true }),
          defaultNpc({ id: "heir", name: "H", raceId: "r", isPlayerRuler: true }),
        ],
        "dead",
      ),
    );
    expect(result.rulerNpcId).toBe("heir");
    expect(result.npcs.find((n) => n.id === "dead").isPlayerRuler).toBe(false);
    expect(result.npcs.find((n) => n.id === "heir").isPlayerRuler).toBe(true);
  });

  it("pulls a posted ruler back to court and sets status active", () => {
    const result = ensurePlayerRulers(
      fac([
        defaultNpc({
          id: "r1",
          name: "R",
          raceId: "r",
          isPlayerRuler: true,
          status: "away",
          posting: { kind: "governor", systemId: "sys.1", sinceTurn: 3 },
        }),
      ]),
    );
    expect(result.npcs[0].posting.kind).toBe("court");
    expect(result.npcs[0].status).toBe("active");
  });
});

describe("removeNpc / setRuler", () => {
  it("refuses to remove the current ruler without confirmSetRuler", () => {
    const faction = ensurePlayerRulers(fac([defaultNpc({ id: "r1", name: "R", raceId: "r", isPlayerRuler: true })]));
    expect(removeNpc(faction, "r1")).toEqual({ ok: false, error: "ruler_locked" });
  });

  it("removes a confirmed ruler and clears rulerNpcId", () => {
    const faction = ensurePlayerRulers(fac([defaultNpc({ id: "r1", name: "R", raceId: "r", isPlayerRuler: true })]));
    const result = removeNpc(faction, "r1", { confirmSetRuler: true });
    expect(result.ok).toBe(true);
    expect(result.npcs).toHaveLength(0);
    expect(result.rulerNpcId).toBeNull();
  });

  it("setRuler requires confirm and then locks that NPC", () => {
    const faction = fac([
      defaultNpc({ id: "a", name: "A", raceId: "r" }),
      defaultNpc({ id: "b", name: "B", raceId: "r" }),
    ]);
    expect(setRuler(faction, "b")).toEqual({ ok: false, error: "confirm_required" });
    const result = setRuler(faction, "b", { confirmSetRuler: true });
    expect(result.ok).toBe(true);
    expect(result.rulerNpcId).toBe("b");
    expect(result.npcs.find((n) => n.id === "b").councilSeat).toBe("seat.ruler");
    expect(result.npcs.find((n) => n.id === "a").isPlayerRuler).toBe(false);
  });
});

describe("upsertNpc", () => {
  it("creates an NPC with raceId and refuses a new NPC without one", () => {
    expect(upsertNpc(fac([]), { name: "X" })).toEqual({ ok: false, error: "npc_race_required" });
    const result = upsertNpc(fac([]), { name: "X", raceId: "race_human" });
    expect(result.ok).toBe(true);
    expect(result.npcs[0].raceId).toBe("race_human");
    expect(result.npcs[0].status).toBe("active");
  });
});
