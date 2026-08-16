/**
 * One roster → posting loop (v0.5 onto GMap).
 * Run from GMap/:  node --test server/courtRoster.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  defaultNpc,
  upsertNpc,
  removeNpc,
  setRuler,
  assignPosting,
  recallPosting,
  applyUpsertNpc,
  applyAssignNpcPosting,
  applyRecallNpcPosting,
  applyUnlockSeat,
  applyLockSeat,
  applySeatNpc,
  applyUnseatNpc,
} from "./courtRoster.mjs";

function fac(npcs, rulerNpcId = null) {
  return { id: "f1", rulerNpcId, npcs };
}

function worldWith(npcs, extra = {}) {
  return {
    meta: { turn: 4 },
    factions: [{ id: "f1", rulerNpcId: extra.rulerNpcId ?? null, npcs }],
    systems: extra.systems ?? [
      { id: "sys.1", name: "Home", ownerFactionId: "f1" },
      { id: "sys.x", name: "Foreign", ownerFactionId: "f2" },
    ],
    legions: extra.legions ?? [
      { id: "leg.1", name: "Levy", factionId: "f1", kind: "legion", systemId: "sys.1" },
    ],
    fleets: extra.fleets ?? [
      { id: "flt.1", name: "Scout", factionId: "f1", kind: "fleet", systemId: "sys.1" },
    ],
  };
}

describe("roster upsert / ruler lock", () => {
  it("creates an NPC with raceId and refuses a new NPC without one", () => {
    assert.deepEqual(upsertNpc(fac([]), { name: "X" }), {
      ok: false,
      error: "npc_race_required",
    });
    const result = upsertNpc(fac([]), { name: "X", raceId: "race_human" });
    assert.equal(result.ok, true);
    assert.equal(result.npcs[0].raceId, "race_human");
    assert.equal(result.npcs[0].status, "active");
    assert.equal(result.npcs[0].posting.kind, "court");
  });

  it("refuses to remove the ruler without confirmSetRuler, then clears on confirm", () => {
    const faction = upsertNpc(fac([]), {
      id: "r1",
      name: "R",
      raceId: "race_human",
      isPlayerRuler: true,
    });
    assert.equal(faction.rulerNpcId, "r1");
    assert.deepEqual(removeNpc(faction, "r1"), { ok: false, error: "ruler_locked" });
    const gone = removeNpc(faction, "r1", { confirmSetRuler: true });
    assert.equal(gone.ok, true);
    assert.equal(gone.npcs.length, 0);
    assert.equal(gone.rulerNpcId, null);
  });

  it("setRuler requires confirm and locks that NPC on the throne", () => {
    const faction = fac([
      defaultNpc({ id: "a", name: "A", raceId: "r" }),
      defaultNpc({ id: "b", name: "B", raceId: "r" }),
    ]);
    assert.deepEqual(setRuler(faction, "b"), { ok: false, error: "confirm_required" });
    const result = setRuler(faction, "b", { confirmSetRuler: true });
    assert.equal(result.ok, true);
    assert.equal(result.rulerNpcId, "b");
    assert.equal(result.npcs.find((n) => n.id === "b").councilSeat, "seat.ruler");
    assert.equal(result.npcs.find((n) => n.id === "a").isPlayerRuler, false);
  });
});

describe("one roster / posting loop", () => {
  it("GM upsert → player governor post (clears same target) → recall", () => {
    const world = worldWith([]);
    const created = applyUpsertNpc(world, {
      factionId: "f1",
      npc: { name: "Regent", raceId: "race_human", isPlayerRuler: true },
    });
    assert.equal(created.ok, true);
    const rulerId = created.rulerNpcId;
    assert.ok(rulerId);

    const advisor = applyUpsertNpc(world, {
      factionId: "f1",
      npc: { id: "gov.1", name: "Steward", raceId: "race_human" },
    });
    assert.equal(advisor.ok, true);

    const rulerPost = applyAssignNpcPosting(world, {
      factionId: "f1",
      npcId: rulerId,
      kind: "governor",
      targetId: "sys.1",
    });
    assert.equal(rulerPost.ok, false);
    assert.equal(rulerPost.error, "npc_is_player_ruler");

    const foreign = applyAssignNpcPosting(world, {
      factionId: "f1",
      npcId: "gov.1",
      kind: "governor",
      targetId: "sys.x",
    });
    assert.equal(foreign.error, "npc_posting_foreign");

    applyUpsertNpc(world, {
      factionId: "f1",
      npc: {
        id: "gov.old",
        name: "Old",
        raceId: "race_human",
        status: "away",
        posting: { kind: "governor", systemId: "sys.1", sinceTurn: 0 },
      },
    });

    const posted = applyAssignNpcPosting(world, {
      factionId: "f1",
      npcId: "gov.1",
      kind: "governor",
      targetId: "sys.1",
    });
    assert.equal(posted.ok, true);
    const steward = posted.npcs.find((n) => n.id === "gov.1");
    assert.equal(steward.posting.kind, "governor");
    assert.equal(steward.posting.systemId, "sys.1");
    assert.equal(steward.status, "away");
    assert.equal(steward.councilSeat, null);
    assert.equal(posted.npcs.find((n) => n.id === "gov.old").posting.kind, "court");

    const recalled = applyRecallNpcPosting(world, { factionId: "f1", npcId: "gov.1" });
    assert.equal(recalled.ok, true);
    assert.equal(recalled.npc.posting.kind, "court");
    assert.equal(recalled.npc.status, "active");
  });

  it("commander requires a legion; admiral requires a fleet; forceId is accepted", () => {
    const n = defaultNpc({ id: "n", name: "N", raceId: "x" });
    assert.equal(
      assignPosting({
        npc: n,
        npcs: [n],
        kind: "commander",
        targetId: "flt.1",
        faction: { id: "f1" },
        turn: 1,
        target: { factionId: "f1", kind: "fleet" },
      }).error,
      "npc_posting_foreign",
    );
    assert.equal(
      assignPosting({
        npc: n,
        npcs: [n],
        kind: "admiral",
        targetId: "leg.1",
        faction: { id: "f1" },
        turn: 1,
        target: { factionId: "f1", kind: "legion" },
      }).error,
      "npc_posting_foreign",
    );

    const world = worldWith([defaultNpc({ id: "n", name: "N", raceId: "x" })]);
    const posted = applyAssignNpcPosting(world, {
      factionId: "f1",
      npcId: "n",
      kind: "commander",
      forceId: "leg.1",
    });
    assert.equal(posted.ok, true);
    assert.equal(posted.posting.kind, "commander");
    assert.equal(posted.posting.legionId, "leg.1");
    assert.equal(posted.posting.forceId, "leg.1");

    const recalled = recallPosting({
      npc: posted.npc,
      npcs: posted.npcs,
      turn: 5,
    });
    assert.equal(recalled.ok, true);
    assert.equal(recalled.fromKind, "commander");
  });
});

describe("council seats unique path", () => {
  it("unlocks seat.at_large, seats an NPC, lock vacates", () => {
    const world = worldWith([
      defaultNpc({ id: "n", name: "N", raceId: "race_human" }),
    ]);
    const lockedSeat = applySeatNpc(world, {
      factionId: "f1",
      npcId: "n",
      seatId: "seat.at_large",
    });
    assert.equal(lockedSeat.error, "council_seat_locked");

    const unlocked = applyUnlockSeat(world, {
      factionId: "f1",
      seatId: "seat.at_large",
    });
    assert.equal(unlocked.ok, true);
    assert.ok(unlocked.council.unlockedSeatIds.includes("seat.at_large"));

    const seated = applySeatNpc(world, {
      factionId: "f1",
      npcId: "n",
      seatId: "seat.at_large",
    });
    assert.equal(seated.ok, true);
    assert.equal(seated.npc.councilSeat, "seat.at_large");

    const locked = applyLockSeat(world, {
      factionId: "f1",
      seatId: "seat.at_large",
    });
    assert.equal(locked.ok, true);
    assert.equal(
      locked.npcs.find((n) => n.id === "n").councilSeat,
      null,
    );

    const unseatEmpty = applyUnseatNpc(world, { factionId: "f1", npcId: "n" });
    assert.equal(unseatEmpty.error, "npc_not_seated");
  });

  it("refuses to seat the ruler and unseat the throne", () => {
    const world = worldWith([]);
    applyUpsertNpc(world, {
      factionId: "f1",
      npc: { id: "r1", name: "R", raceId: "race_human", isPlayerRuler: true },
    });
    const seatRuler = applySeatNpc(world, {
      factionId: "f1",
      npcId: "r1",
      seatId: "seat.warlord",
    });
    assert.equal(seatRuler.error, "npc_is_player_ruler");
    const unseatThrone = applyUnseatNpc(world, { factionId: "f1", npcId: "r1" });
    assert.equal(unseatThrone.error, "council_seat_ruler_locked");
  });
});
