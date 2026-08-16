import { describe, it, expect } from "vitest";
import { expandVisionHops, resolveFogKnowledge, resolveVisibleWithFog, VISION_HOPS } from "./fog.mjs";

function chainWorld() {
  return {
    systems: [
      { id: "A", ownerFactionId: "f1" },
      { id: "B", ownerFactionId: null },
      { id: "C", ownerFactionId: "f2" },
    ],
    links: [
      { fromId: "A", toId: "B", type: "corridor" },
      { fromId: "B", toId: "C", type: "corridor" },
    ],
    forces: [],
  };
}

describe("fog hop-1 vision", () => {
  it("VISION_HOPS is 1", () => {
    expect(VISION_HOPS).toBe(1);
  });

  it("expandVisionHops does not include seeds, only neighbors", () => {
    const world = chainWorld();
    expect([...expandVisionHops(world, ["A"], 1)]).toEqual(["B"]);
    expect(expandVisionHops(world, ["A"], 1).has("A")).toBe(false);
    expect(expandVisionHops(world, ["A"], 1).has("C")).toBe(false);
  });

  it("f1 sees A (owned hop-0) and B (hop-1), not C (2 hops)", () => {
    const world = chainWorld();
    const { hop0, hop1, visible } = resolveFogKnowledge(world, "f1");
    expect([...hop0]).toEqual(["A"]);
    expect([...hop1]).toEqual(["B"]);
    expect(visible.has("A")).toBe(true);
    expect(visible.has("B")).toBe(true);
    expect(visible.has("C")).toBe(false);
    expect(resolveVisibleWithFog(world, "f1").has("C")).toBe(false);
  });

  it("own force seeds hop-0 even when the system is not owned", () => {
    const world = chainWorld();
    world.forces = [{ factionId: "f1", systemId: "C", kind: "legion" }];
    const { hop0, hop1 } = resolveFogKnowledge(world, "f1");
    expect(hop0.has("A")).toBe(true);
    expect(hop0.has("C")).toBe(true);
    expect(hop1.has("B")).toBe(true);
  });
});
