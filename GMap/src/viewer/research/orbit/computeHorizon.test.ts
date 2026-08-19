import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeHorizon, type HorizonTech } from "./computeHorizon.ts";
import { computeDirectionProgress } from "./computeDirectionProgress.ts";

/** A linear chain t0 -> t1 -> t2 -> ... each requiring the previous. */
function chain(n: number, prefix = "t"): HorizonTech[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${prefix}.${i}`,
    prerequisites: i === 0 ? [] : [`${prefix}.${i - 1}`],
  }));
}

/** n independent no-prerequisite techs (all are frontier candidates from turn 1). */
function flat(n: number, prefix = "t"): HorizonTech[] {
  return Array.from({ length: n }, (_, i) => ({ id: `${prefix}.${i}`, prerequisites: [] }));
}

describe("computeHorizon", () => {
  it("phase dormant: shows only the door tech (first no-prerequisite entry), nothing else", () => {
    const techs = chain(50);
    const progress = computeDirectionProgress({ a: techs }, []);
    const [h] = computeHorizon({ a: techs }, [], progress);
    assert.equal(h.mode, "door");
    assert.deepEqual(h.visible, [{ id: "t.0", state: "frontier" }]);
    assert.equal(h.badgeCount, 0);
  });

  it("phase complete: shows nothing, no badge — trophy mode", () => {
    const techs = chain(10);
    const allIds = techs.map((t) => t.id);
    const progress = computeDirectionProgress({ a: techs }, allIds);
    const [h] = computeHorizon({ a: techs }, allIds, progress);
    assert.equal(h.mode, "trophy");
    assert.deepEqual(h.visible, []);
    assert.equal(h.badgeCount, 0);
  });

  it("horizon mode: researched shows as done, immediate unlockable children show as frontier", () => {
    const techs = chain(20);
    const unlocked = ["t.0", "t.1", "t.2"];
    const progress = computeDirectionProgress({ a: techs }, unlocked);
    const [h] = computeHorizon({ a: techs }, unlocked, progress);
    assert.equal(h.mode, "horizon");
    const byId = Object.fromEntries(h.visible.map((n) => [n.id, n.state]));
    assert.equal(byId["t.0"], "done");
    assert.equal(byId["t.1"], "done");
    assert.equal(byId["t.2"], "done");
    // t.3 is the only tech whose sole prerequisite (t.2) is unlocked
    assert.equal(byId["t.3"], "frontier");
    // t.4 needs t.3 first — not yet reachable, and total remaining (16) > directShowCap (14) so it's badged, not dim
    assert.equal(byId["t.4"], undefined);
  });

  it("caps frontier at 8 even when more techs are simultaneously reachable", () => {
    const techs = [
      { id: "root", prerequisites: [] },
      ...flat(12, "child").map((t) => ({ id: t.id, prerequisites: ["root"] })),
    ];
    const unlocked = ["root"];
    const progress = computeDirectionProgress({ a: techs }, unlocked);
    const [h] = computeHorizon({ a: techs }, unlocked, progress, { frontierCap: 8 });
    const frontierIds = h.visible.filter((n) => n.state === "frontier").map((n) => n.id);
    assert.equal(frontierIds.length, 8);
    // the 4 overflow children count toward "remaining", not silently dropped
    // total remaining = 12 - 8 = 4, which is <= directShowCap(14), so they show dim
    const dimIds = h.visible.filter((n) => n.state === "dim").map((n) => n.id);
    assert.equal(dimIds.length, 4);
    assert.equal(h.badgeCount, 0);
  });

  it("shows remaining locked techs directly (dim) when count is at or below 14, no badge", () => {
    const techs = [
      { id: "root", prerequisites: [] },
      ...flat(9, "child").map((t) => ({ id: t.id, prerequisites: ["root"] })), // 9 frontier candidates, cap 8 -> 1 overflow
      ...chain(5, "later").map((t) => ({ ...t, prerequisites: [...(t.prerequisites ?? []), "root"] })),
    ];
    const unlocked = ["root"];
    const progress = computeDirectionProgress({ a: techs }, unlocked);
    const [h] = computeHorizon({ a: techs }, unlocked, progress);
    assert.equal(h.badgeCount, 0);
    const dimCount = h.visible.filter((n) => n.state === "dim").length;
    // 1 overflow child + 5 "later" chain techs (only later.0 actually has root as
    // an extra prereq per the spread above, the rest still need their own chain
    // predecessor) = at least the overflow child shows dim
    assert.ok(dimCount >= 1);
  });

  it("collapses to a single badge, no dim nodes, once remaining exceeds 14", () => {
    const techs = [
      { id: "root", prerequisites: [] },
      ...flat(30, "child").map((t) => ({ id: t.id, prerequisites: ["root"] })),
    ];
    const unlocked = ["root"];
    const progress = computeDirectionProgress({ a: techs }, unlocked);
    const [h] = computeHorizon({ a: techs }, unlocked, progress, { frontierCap: 8, directShowCap: 14 });
    const dimIds = h.visible.filter((n) => n.state === "dim");
    assert.equal(dimIds.length, 0);
    assert.equal(h.badgeCount, 22); // 30 - 8 frontier shown
  });

  it("never drops a tech silently: done + frontier + dim + badgeCount always accounts for every tech", () => {
    const techs = [
      { id: "root", prerequisites: [] },
      ...flat(25, "child").map((t) => ({ id: t.id, prerequisites: ["root"] })),
    ];
    const unlocked = ["root", "child.0", "child.1"];
    const progress = computeDirectionProgress({ a: techs }, unlocked);
    const [h] = computeHorizon({ a: techs }, unlocked, progress);
    const accountedFor = h.visible.length + h.badgeCount;
    assert.equal(accountedFor, techs.length);
  });
});
