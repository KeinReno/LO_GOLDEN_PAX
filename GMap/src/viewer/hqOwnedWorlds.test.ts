import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hqOwnedWorlds } from "./hqOwnedWorlds.ts";

describe("hqOwnedWorlds", () => {
  it("keeps settled own planets and skips empty/foreign", () => {
    const rows = hqOwnedWorlds({
      factionId: "f1",
      world: {
        systems: [
          {
            id: "s1",
            name: "Солис",
            ownerFactionId: "f1",
            planets: [
              { id: "p1", name: "Столица", population: 900, ownerFactionId: "f1" },
              { id: "p2", name: "Пустыня", population: 0, ownerFactionId: "f1" },
            ],
          },
          {
            id: "s2",
            name: "Чужая",
            ownerFactionId: "f2",
            planets: [
              { id: "p3", name: "Форпост", population: 40, ownerFactionId: "f2" },
            ],
          },
        ],
      },
    });
    assert.deepEqual(
      rows.map((r) => r.planetId),
      ["p1"],
    );
  });
});
