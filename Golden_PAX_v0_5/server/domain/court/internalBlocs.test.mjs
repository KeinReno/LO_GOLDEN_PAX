import { describe, it, expect } from "vitest";
import { getContent } from "../../contentLoader.mjs";
import { ensureInternalBlocs, recomputeInternalBlocs } from "./internalBlocs.mjs";
import { defaultNpc } from "./npcRoster.mjs";

const content = getContent(["core"]);

describe("ensureInternalBlocs", () => {
  it("seeds every catalog template when the faction has none (new design — GMap only seeded crown+guest)", () => {
    const blocs = ensureInternalBlocs({}, content);
    const catalogIds = Object.keys(content.internal_blocs.blocs);
    expect(blocs.map((b) => b.id).sort()).toEqual(catalogIds.sort());
    expect(blocs.length).toBe(catalogIds.length);
  });
});

describe("recomputeInternalBlocs scoring (GMap formula)", () => {
  it("weights seat + leadership + posting and converts stance to support/threat", () => {
    const blocs = [
      {
        id: "bloc.crown",
        kind: "house",
        stance: "loyal",
        leaderNpcId: null,
        influence: 0,
        support: 0,
        threat: 0,
        raceIds: [],
      },
      {
        id: "bloc.guest",
        kind: "guest",
        stance: "neutral",
        leaderNpcId: null,
        influence: 0,
        support: 0,
        threat: 0,
        raceIds: [],
      },
    ];
    const npcs = [
      defaultNpc({
        id: "leader",
        name: "L",
        raceId: "r",
        blocId: "bloc.crown",
        isBlocLeader: true,
        councilSeat: "seat.warlord",
        posting: { kind: "governor", systemId: "s1", sinceTurn: 0 },
        raceLeadership: { raceId: "race_elanor" },
      }),
    ];
    const scored = recomputeInternalBlocs({ internalBlocs: blocs }, npcs, { internal_blocs: { blocs: {} } });
    const crown = scored.find((b) => b.id === "bloc.crown");
    // base 3 + seat 10 + leader 12 + raceLeadership 8 + governor 14 = 47
    expect(crown.influence).toBe(47);
    expect(crown.support).toBe(47);
    expect(crown.threat).toBe(Math.floor(47 * 0.12));
    expect(crown.leaderNpcId).toBe("leader");
  });

  it("vacant house/church/race_caucus gets a floor of 8 influence", () => {
    const blocs = [{ id: "bloc.x", kind: "church", stance: "ambitious", leaderNpcId: null, influence: 0, support: 0, threat: 0 }];
    const scored = recomputeInternalBlocs({ internalBlocs: blocs }, [], { internal_blocs: { blocs: {} } });
    expect(scored[0].influence).toBe(8);
    expect(scored[0].support).toBe(Math.floor(8 * 0.55));
    expect(scored[0].threat).toBe(Math.floor(8 * 0.75));
  });
});
