import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { linkAllowsTravel, neighborIds, hopPath } from "./pathfinding.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const oldModulePath = path.resolve(__dirname, "../../../../GMap/server/pathfinding.mjs");

const world = {
  links: [
    { fromId: "a", toId: "b", type: "corridor" },
    { fromId: "b", toId: "c", type: "gate" },
    { fromId: "c", toId: "d", type: "damyl_planet" },
    { fromId: "a", toId: "e", type: "corridor" },
  ],
};

describe("pathfinding parity with GMap", () => {
  it("linkAllowsTravel / neighborIds / hopPath match GMap on a mixed-type graph", async () => {
    const old = await import(oldModulePath);

    expect(linkAllowsTravel("damyl_planet", "fleet")).toBe(old.linkAllowsTravel("damyl_planet", "fleet"));
    expect(linkAllowsTravel("damyl_planet", "legion")).toBe(old.linkAllowsTravel("damyl_planet", "legion"));
    expect(linkAllowsTravel("corridor", "fleet")).toBe(old.linkAllowsTravel("corridor", "fleet"));
    expect(linkAllowsTravel("gate", "any")).toBe(old.linkAllowsTravel("gate", "any"));

    for (const mode of ["fleet", "legion", "any"]) {
      expect(neighborIds(world, "c", mode)).toEqual(old.neighborIds(world, "c", mode));
      expect(hopPath(world, "a", "d", mode)).toEqual(old.hopPath(world, "a", "d", mode));
      expect(hopPath(world, "a", "c", mode)).toEqual(old.hopPath(world, "a", "c", mode));
    }

    expect(hopPath(world, "a", "a", "fleet")).toEqual(["a"]);
    expect(hopPath(world, "a", "missing", "fleet")).toEqual([]);
    expect(hopPath(world, "a", "missing", "fleet")).toEqual(old.hopPath(world, "a", "missing", "fleet"));
  });

  it("fleets cannot use damyl_planet; legions can (2 hops vs unreachable)", () => {
    expect(hopPath(world, "a", "d", "fleet")).toEqual([]);
    expect(hopPath(world, "a", "d", "legion")).toEqual(["a", "b", "c", "d"]);
  });
});
