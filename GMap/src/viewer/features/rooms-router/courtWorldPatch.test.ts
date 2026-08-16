import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { WorldState } from "../../../state/types.ts";
import {
  stockAlertMsg,
  worldAfterBlocLeader,
  worldAfterRaceLeader,
  worldAfterSeatPortfolio,
} from "./courtWorldPatch.ts";

const base = {
  factions: [
    {
      id: "f1",
      council: { unlockedSeatIds: ["seat.a"] },
      npcs: [
        { id: "n1", blocId: "b1" },
        { id: "n2", blocId: "b1", isBlocLeader: true },
      ],
      internalBlocs: [{ id: "b1", leaderNpcId: "n2" }],
    },
  ],
} as unknown as WorldState;

describe("courtWorldPatch", () => {
  it("seat portfolio", () => {
    const next = worldAfterSeatPortfolio(base, "f1", "seat.a", "port.x");
    assert.equal(
      next.factions[0]?.council?.seatPortfolios?.["seat.a"],
      "port.x",
    );
  });

  it("bloc leader swaps", () => {
    const next = worldAfterBlocLeader(base, "f1", "n1", "b1");
    const n1 = next.factions[0]?.npcs?.find((n) => n.id === "n1");
    const n2 = next.factions[0]?.npcs?.find((n) => n.id === "n2");
    assert.equal(n1?.isBlocLeader, true);
    assert.equal(n2?.isBlocLeader, false);
    assert.equal(next.factions[0]?.internalBlocs?.[0]?.leaderNpcId, "n1");
  });

  it("race leader exclusive", () => {
    const withLead = {
      ...base,
      factions: [
        {
          ...base.factions[0],
          npcs: [
            { id: "n1" },
            { id: "n2", raceLeadership: { raceId: "r1" } },
          ],
        },
      ],
    } as unknown as WorldState;
    const next = worldAfterRaceLeader(withLead, "f1", "n1", "r1", "khan");
    const n1 = next.factions[0]?.npcs?.find((n) => n.id === "n1");
    const n2 = next.factions[0]?.npcs?.find((n) => n.id === "n2");
    assert.deepEqual(n1?.raceLeadership, { raceId: "r1", title: "khan" });
    assert.equal(n2?.raceLeadership, null);
  });
});

describe("stockAlertMsg", () => {
  it("on/off copy", () => {
    assert.match(stockAlertMsg(true, "железо"), /Слежение/);
    assert.match(stockAlertMsg(false, "железо"), /снято/);
  });
});
