import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TechnologyDef } from "../../../state/contentCatalog.ts";
import {
  buildTechGraphLayout,
  type GraphNode,
} from "./techGraphLayout.ts";

function tech(
  id: string,
  era: number,
  prerequisites?: string[],
): TechnologyDef {
  return {
    id,
    name: id,
    category: "A",
    era,
    ...(prerequisites ? { prerequisites } : {}),
  };
}

function byId(nodes: GraphNode[]): Record<string, GraphNode> {
  return Object.fromEntries(nodes.map((n) => [n.id, n]));
}

describe("buildTechGraphLayout", () => {
  it("lays a linear A→B→C chain across 3 eras with rising x and stable y", () => {
    const layout = buildTechGraphLayout([
      tech("A", 1),
      tech("B", 2, ["A"]),
      tech("C", 3, ["B"]),
    ]);
    const n = byId(layout.nodes);
    assert.equal(n.A.x, 0);
    assert.equal(n.B.x, 1);
    assert.equal(n.C.x, 2);
    assert.ok(n.A.x < n.B.x && n.B.x < n.C.x);
    assert.equal(n.A.y, n.B.y);
    assert.equal(n.B.y, n.C.y);
    assert.deepEqual(layout.edges, [
      { from: "A", to: "B" },
      { from: "B", to: "C" },
    ]);
    assert.equal(layout.maxX, 2);
    assert.equal(layout.maxY, n.A.y);
  });

  it("gives distinct y to two prereq-less techs in the same era", () => {
    const layout = buildTechGraphLayout([tech("A", 1), tech("B", 1)]);
    const n = byId(layout.nodes);
    assert.equal(n.A.x, 0);
    assert.equal(n.B.x, 0);
    assert.notEqual(n.A.y, n.B.y);
  });

  it("places a tech with two prereqs between their lanes", () => {
    const layout = buildTechGraphLayout([
      tech("P0", 1),
      tech("P1", 1),
      tech("C", 2, ["P0", "P1"]),
    ]);
    const n = byId(layout.nodes);
    const lo = Math.min(n.P0.y, n.P1.y);
    const hi = Math.max(n.P0.y, n.P1.y);
    assert.notEqual(n.P0.y, n.P1.y);
    assert.ok(n.C.y >= lo && n.C.y <= hi);
    assert.equal(n.C.x, 1);
  });

  it("skips edges whose prerequisite is not in the input set", () => {
    const layout = buildTechGraphLayout([tech("T", 2, ["ghost", "also-missing"])]);
    assert.equal(layout.edges.length, 0);
    assert.equal(layout.nodes.length, 1);
  });

  it("keeps x from tech.era even if a prereq belongs to a later era", () => {
    const layout = buildTechGraphLayout([
      tech("late", 3),
      tech("early", 1, ["late"]),
    ]);
    const n = byId(layout.nodes);
    assert.equal(n.early.x, 0);
    assert.equal(n.late.x, 2);
    assert.deepEqual(layout.edges, [{ from: "late", to: "early" }]);
  });

  it("is deterministic for the same input", () => {
    const input = [
      tech("P0", 1),
      tech("P1", 1),
      tech("C", 2, ["P0", "P1"]),
      tech("D", 2),
    ];
    const a = buildTechGraphLayout(input);
    const b = buildTechGraphLayout(input);
    assert.deepEqual(a, b);
  });
});
