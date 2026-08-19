import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pickScoutSystems } from "./pickScoutSystems.ts";

describe("pickScoutSystems", () => {
  const systems = [
    { id: "a", name: "Alpha", x: 0, y: 0, ownerFactionId: "me" },
    { id: "b", name: "Bravo", x: 10, y: 0, ownerFactionId: "them" },
    { id: "c", name: "Charlie", x: 100, y: 0, ownerFactionId: "them" },
    { id: "d", name: "Delta", x: 11, y: 0, ownerFactionId: "them" },
  ];

  it("drops own systems and keeps the nearest foreigners", () => {
    const rows = pickScoutSystems(systems, { x: 0, y: 0 }, "", "me", 2);
    assert.deepEqual(
      rows.map((s) => s.id),
      ["b", "d"],
    );
  });

  it("search matches name across the full foreign pool", () => {
    const rows = pickScoutSystems(systems, { x: 0, y: 0 }, "char", "me", 2);
    assert.deepEqual(
      rows.map((s) => s.id),
      ["c"],
    );
  });
});
