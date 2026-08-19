import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeFocusedOrbitLayout, computeOrbitLayout, type OrbitLayoutTech } from "./computeOrbitLayout.ts";

function techs(direction: string, count: number, prefix = direction): OrbitLayoutTech[] {
  return Array.from({ length: count }, (_, i) => ({ id: `${prefix}.${i}`, direction }));
}

describe("computeOrbitLayout", () => {
  it("gives every direction an equal, fixed angular arc regardless of content — no direction starves another's angle", () => {
    // Wildly uneven counts on purpose: the old proportional-angle model
    // would give "a" a huge wedge and "f" a sliver. The constellation model
    // must not care — every direction's arc width is identical.
    const directions = ["a", "b", "c", "d", "e", "f"];
    const list = [
      ...techs("a", 500),
      ...techs("b", 1),
      ...techs("c", 1),
      ...techs("d", 1),
      ...techs("e", 1),
      ...techs("f", 1),
    ];
    const { sectors } = computeOrbitLayout(directions, list, { clusterArcDeg: 100 });
    const byDir = Object.fromEntries(sectors.map((s) => [s.direction, s]));
    for (const dir of directions) {
      const arcDeg = ((byDir[dir].endAngle - byDir[dir].startAngle) * 180) / Math.PI;
      assert.ok(Math.abs(arcDeg - 100) < 1e-6, `${dir}: expected 100deg arc, got ${arcDeg}`);
    }
  });

  it("anchors every direction at an equal compass step, same distance from the hub", () => {
    const directions = ["a", "b", "c", "d"];
    const list = [...techs("a", 50), ...techs("b", 1), ...techs("c", 10), ...techs("d", 0)];
    const { sectors } = computeOrbitLayout(directions, list, { hubGapPx: 80 });
    const byDir = Object.fromEntries(sectors.map((s) => [s.direction, s]));
    for (const dir of directions) {
      const apexDist = Math.hypot(byDir[dir].apexX, byDir[dir].apexY);
      assert.ok(Math.abs(apexDist - 80) < 1e-6, `${dir}: expected apex at 80px from hub, got ${apexDist}`);
    }
    // 4 directions -> 90deg apart
    const angleOf = (dir: string) => Math.atan2(byDir[dir].apexY, byDir[dir].apexX);
    const step = angleOf("b") - angleOf("a");
    assert.ok(Math.abs(Math.abs(step) - Math.PI / 2) < 1e-6, `expected 90deg compass step, got ${(step * 180) / Math.PI}`);
  });

  it("sizes each cluster's own radius purely from its own content — a rich neighbor never inflates a sparse direction's radius", () => {
    const directions = ["rich", "sparse"];
    const richOnly = computeOrbitLayout(directions, [...techs("rich", 400), ...techs("sparse", 1)]);
    const sparseAlone = computeOrbitLayout(["sparse"], techs("sparse", 1));
    const richSector = richOnly.sectors.find((s) => s.direction === "sparse")!;
    const aloneSector = sparseAlone.sectors.find((s) => s.direction === "sparse")!;
    assert.equal(richSector.outerRadius, aloneSector.outerRadius);
    // and it stays small in absolute terms, not dragged out toward the rich direction's scale
    const richSectorReach = richOnly.sectors.find((s) => s.direction === "rich")!.outerRadius;
    assert.ok(
      richSector.outerRadius < richSectorReach / 4,
      `sparse outerRadius ${richSector.outerRadius} should stay far below rich's ${richSectorReach}`,
    );
  });

  it("gives a zero-tech direction a placeholder position without a real ring", () => {
    const directions = ["industry", "diplomacy"];
    const list = techs("industry", 50);
    const { sectors } = computeOrbitLayout(directions, list);
    const dip = sectors.find((s) => s.direction === "diplomacy")!;
    assert.equal(dip.count, 0);
    assert.equal(dip.ringCount, 0);
    assert.equal(dip.startAngle, dip.endAngle);
  });

  it("never overlaps node radii within a ring and grows radius outward ring over ring", () => {
    const directions = ["industry"];
    const list = techs("industry", 40);
    const { nodes, sectors } = computeOrbitLayout(directions, list);
    const rings = new Map<number, number[]>();
    for (const n of nodes) {
      if (!rings.has(n.ring)) rings.set(n.ring, []);
      rings.get(n.ring)!.push(n.radius);
    }
    const radii = [...rings.entries()].sort((a, b) => a[0] - b[0]).map(([, rs]) => rs[0]);
    for (let i = 1; i < radii.length; i++) {
      assert.ok(radii[i] > radii[i - 1], `ring ${i} radius ${radii[i]} should exceed ring ${i - 1} radius ${radii[i - 1]}`);
    }
    assert.equal(sectors[0].ringCount, rings.size);
  });

  it("keeps earlier full rings byte-identical when more techs are appended to the same direction", () => {
    const directions = ["industry", "governance"];
    // industry's arc width is fixed regardless of how many more techs join
    // it, so ring 0's capacity at this arc/pitch/radius combo is stable —
    // appending past a fully-packed ring is the case §1b promises stays
    // stable; a partially-filled ring is allowed to reflow as it fills, so
    // the test deliberately avoids that case.
    const before = [...techs("industry", 2), ...techs("governance", 1)];
    const after = [...techs("industry", 6), ...techs("governance", 1)];
    const layoutBefore = computeOrbitLayout(directions, before);
    const layoutAfter = computeOrbitLayout(directions, after);
    const ring0Before = layoutBefore.nodes.filter((n) => n.direction === "industry" && n.ring === 0);
    const ring0After = layoutAfter.nodes.filter((n) => n.direction === "industry" && n.ring === 0);
    assert.ok(ring0Before.length > 0, "sanity: ring 0 has nodes before appending");
    assert.equal(ring0Before.length, ring0After.length, "ring 0 membership count changed after appending");
    for (let i = 0; i < ring0Before.length; i++) {
      assert.equal(ring0Before[i].id, ring0After[i].id);
      assert.ok(Math.abs(ring0Before[i].x - ring0After[i].x) < 1e-9);
      assert.ok(Math.abs(ring0Before[i].y - ring0After[i].y) < 1e-9);
    }
  });

  it("assigns contiguous ranks per direction in input order, regardless of interleaving across directions in the input array", () => {
    const directions = ["a", "b"];
    const list = [
      { id: "a.0", direction: "a" },
      { id: "b.0", direction: "b" },
      { id: "a.1", direction: "a" },
      { id: "b.1", direction: "b" },
      { id: "a.2", direction: "a" },
    ];
    const { nodes } = computeOrbitLayout(directions, list);
    const aRanks = nodes.filter((n) => n.direction === "a").sort((x, y) => x.rank - y.rank).map((n) => n.id);
    const bRanks = nodes.filter((n) => n.direction === "b").sort((x, y) => x.rank - y.rank).map((n) => n.id);
    assert.deepEqual(aRanks, ["a.0", "a.1", "a.2"]);
    assert.deepEqual(bRanks, ["b.0", "b.1"]);
  });

  it("returns an empty layout for no techs", () => {
    const { nodes, sectors } = computeOrbitLayout(["a", "b"], []);
    assert.equal(nodes.length, 0);
    assert.equal(sectors.length, 2);
    for (const s of sectors) assert.equal(s.count, 0);
  });
});

describe("computeFocusedOrbitLayout", () => {
  it("anchors a single direction at the origin with a full ring", () => {
    const list = techs("military", 12);
    const { nodes, sectors } = computeFocusedOrbitLayout("military", list);
    assert.equal(sectors.length, 1);
    assert.ok(Math.abs(sectors[0].apexX) < 1e-9);
    assert.ok(Math.abs(sectors[0].apexY) < 1e-9);
    assert.equal(nodes.length, 12);
    const arc = sectors[0].endAngle - sectors[0].startAngle;
    assert.ok(Math.abs(arc - Math.PI * 2) < 1e-6);
  });

  it("ignores other directions in the input list", () => {
    const list = [...techs("military", 4), ...techs("industry", 40)];
    const { nodes, sectors } = computeFocusedOrbitLayout("military", list);
    assert.equal(sectors[0].count, 4);
    assert.equal(nodes.length, 4);
    assert.ok(nodes.every((n) => n.direction === "military"));
  });
});
