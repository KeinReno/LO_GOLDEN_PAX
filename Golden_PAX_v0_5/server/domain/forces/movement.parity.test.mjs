import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { hopDistance, systemsWithinMoveRange } from "./movement.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const oldModulePath = path.resolve(__dirname, "../../../../GMap/server/forceMovement.mjs");

const world = {
  links: [
    { fromId: "a", toId: "b", type: "corridor" },
    { fromId: "b", toId: "c", type: "corridor" },
    { fromId: "c", toId: "d", type: "damyl_planet" },
  ],
};

describe("movement core parity with GMap (hopDistance / systemsWithinMoveRange)", () => {
  it("hopDistance matches GMap", async () => {
    const old = await import(oldModulePath);
    expect(hopDistance(world, "a", "a", "fleet")).toBe(old.hopDistance(world, "a", "a", "fleet"));
    expect(hopDistance(world, "a", "c", "fleet")).toBe(old.hopDistance(world, "a", "c", "fleet"));
    expect(hopDistance(world, "a", "d", "fleet")).toBe(old.hopDistance(world, "a", "d", "fleet"));
    expect(hopDistance(world, "a", "d", "legion")).toBe(old.hopDistance(world, "a", "d", "legion"));
    expect(hopDistance(world, "a", "c", "fleet")).toBe(2);
    expect(hopDistance(world, "a", "d", "fleet")).toBe(Infinity);
    expect(hopDistance(world, "a", "d", "legion")).toBe(3);
  });

  it("systemsWithinMoveRange matches GMap", async () => {
    const old = await import(oldModulePath);
    expect([...systemsWithinMoveRange(world, "a", "fleet", 2)].sort()).toEqual(
      [...old.systemsWithinMoveRange(world, "a", "fleet", 2)].sort(),
    );
    expect(systemsWithinMoveRange(world, "a", "fleet", 2).has("c")).toBe(true);
    expect(systemsWithinMoveRange(world, "a", "fleet", 2).has("d")).toBe(false);
    expect(systemsWithinMoveRange(world, "a", "legion", 3).has("d")).toBe(true);
  });
});
