/**
 * True cross-repo parity: GMap's applyCasualties (server/combatResolve.mjs)
 * is exported and pure aside from an optional `g.ref` write-through this
 * port doesn't use — test data omits `ref` so both versions do the same
 * thing. GMap mutates groups in place and returns a log; this port returns
 * {groups, log}, so we diff the mutated clone's count/hp against the new
 * groups array.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { applyCasualties as newFn } from "./casualties.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const oldModulePath = path.resolve(__dirname, "../../../../GMap/server/combatResolve.mjs");

function fleet() {
  return [
    { defId: "u.frigate", parentId: "p1", roles: ["screen"], count: 10, hp: 100, maxHp: 100, armor: 5, shields: 10 },
    { defId: "u.cruiser", parentId: "p1", roles: ["line"], count: 4, hp: 300, maxHp: 300, armor: 20, shields: 30 },
    { defId: "u.dread", parentId: "p1", roles: ["capital"], count: 1, hp: 1000, maxHp: 1000, armor: 50, shields: 60 },
  ];
}

describe("applyCasualties parity with GMap", () => {
  it("matches count/hp outcomes and loss log across damage levels and targeting", async () => {
    const { applyCasualties: oldFn } = await import(oldModulePath);

    for (const [damage, targeting] of [
      [50, "screen_first"],
      [500, "line_first"],
      [5000, "capital_first"],
      [50000, "screen_first"],
    ]) {
      const oldGroups = fleet();
      const oldLog = oldFn(oldGroups, damage, targeting);

      const { groups: newGroups, log: newLog } = newFn(fleet(), damage, targeting);

      expect(newGroups.map((g) => ({ count: g.count, hp: g.hp }))).toEqual(
        oldGroups.map((g) => ({ count: g.count, hp: g.hp })),
      );
      expect(newLog).toEqual(oldLog);
    }
  });
});
