import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { StarSystem } from "../../state/types.ts";
import { applyGmSystemAction } from "./applyGmSystemAction.ts";

function system(partial: Partial<StarSystem> = {}): StarSystem {
  return {
    id: "s1",
    name: "Sol",
    q: 0,
    r: 0,
    ownerFactionId: "f1",
    planets: [],
    stations: [],
    ...partial,
  } as StarSystem;
}

describe("applyGmSystemAction", () => {
  it("places a mining station on the belt", () => {
    const patch = applyGmSystemAction(
      system(),
      {
        action: "build_station",
        systemId: "s1",
        stationKind: "mining",
        beltAngle: 1.2,
      },
      { factionId: "f1", nextId: () => "st1" },
    );
    assert.equal(patch?.stations?.length, 1);
    assert.equal(patch?.stations?.[0]?.kind, "mining");
    assert.equal(patch?.stations?.[0]?.beltAngle, 1.2);
  });

  it("removes a station", () => {
    const patch = applyGmSystemAction(
      system({
        stations: [
          { id: "st1", name: "A", kind: "mining", factionId: "f1" },
          { id: "st2", name: "B", kind: "trade", factionId: "f1" },
        ],
      }),
      { action: "demolish_station", systemId: "s1", stationId: "st1" },
      { factionId: "f1", nextId: () => "x" },
    );
    assert.deepEqual(
      patch?.stations?.map((s) => s.id),
      ["st2"],
    );
  });

  it("renames the system", () => {
    const patch = applyGmSystemAction(
      system(),
      { action: "rename_system", systemId: "s1", name: "Гелиос" },
      { factionId: "f1", nextId: () => "x" },
    );
    assert.equal(patch?.name, "Гелиос");
  });

  it("ignores produce (needs raise path)", () => {
    assert.equal(
      applyGmSystemAction(
        system(),
        { action: "produce_ship", systemId: "s1", shipId: "ship.scout" },
        { factionId: "f1", nextId: () => "x" },
      ),
      null,
    );
  });
});
