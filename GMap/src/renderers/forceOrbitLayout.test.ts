import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Fleet, FleetKind, Legion, LegionStatus } from "../state/types.ts";
import { toIso } from "./iso.ts";
import {
  cycleStackSelection,
  layoutFleetsAroundSystem,
  layoutLegionsAroundSystem,
} from "./forceOrbitLayout.ts";

const SYS = { x: 0, y: 0 };
const ORIGIN = toIso(0, 0);

function dist(x: number, y: number): number {
  return Math.hypot(x - ORIGIN.x, y - ORIGIN.y);
}

function fleet(
  id: string,
  factionId: string,
  kind: FleetKind = "combat",
): Fleet {
  return {
    id,
    name: id,
    factionId,
    systemId: "s1",
    kind,
    composition: [],
    stance: "idle",
    route: [],
  };
}

function legion(
  id: string,
  factionId: string,
  strength = 10,
  status: LegionStatus = "garrison",
): Legion {
  return {
    id,
    name: id,
    factionId,
    systemId: "s1",
    strength,
    status,
  };
}

describe("layoutFleetsAroundSystem", () => {
  it("parks a single fleet close to the star (not the old ~80px orbit)", () => {
    const slots = layoutFleetsAroundSystem(SYS, [fleet("f1", "north")]);
    assert.equal(slots.length, 1);
    assert.ok(dist(slots[0]!.x, slots[0]!.y) < 50);
    assert.equal(slots[0]!.stackCount, 1);
  });

  it("stacks many fleets of one faction into one glyph", () => {
    const fleets = Array.from({ length: 8 }, (_, i) =>
      fleet(`f${i}`, "north", i === 0 ? "combat" : "trade"),
    );
    const slots = layoutFleetsAroundSystem(SYS, fleets);
    assert.equal(slots.length, 1);
    assert.equal(slots[0]!.stackCount, 8);
    assert.equal(slots[0]!.fleetIds.length, 8);
    assert.equal(slots[0]!.fleet.kind, "combat");
    assert.ok(dist(slots[0]!.x, slots[0]!.y) < 50);
  });

  it("fans the selected faction instead of stacking", () => {
    const fleets = Array.from({ length: 5 }, (_, i) => fleet(`f${i}`, "north"));
    const slots = layoutFleetsAroundSystem(SYS, fleets, undefined, "f2");
    assert.equal(slots.length, 5);
    assert.ok(slots.every((s) => s.stackCount === 1));
    const sel = slots.find((s) => s.fleet.id === "f2")!;
    const collapsed = layoutFleetsAroundSystem(SYS, fleets)[0]!;
    assert.ok(dist(sel.x, sel.y) < 55);
    assert.ok(Math.hypot(sel.x - collapsed.x, sel.y - collapsed.y) < 12);
  });

  it("keeps one glyph per faction when several empires share a system", () => {
    const fleets = [
      fleet("a1", "alpha"),
      fleet("a2", "alpha"),
      fleet("b1", "beta"),
      fleet("b2", "beta"),
      fleet("c1", "gamma"),
    ];
    const slots = layoutFleetsAroundSystem(SYS, fleets);
    assert.equal(slots.length, 3);
    assert.deepEqual(
      slots.map((s) => s.stackCount).sort(),
      [1, 2, 2],
    );
    const maxR = Math.max(...slots.map((s) => dist(s.x, s.y)));
    assert.ok(maxR < 70);
  });
});

describe("layoutLegionsAroundSystem", () => {
  it("stacks same-faction legions on a short south row", () => {
    const legs = Array.from({ length: 6 }, (_, i) =>
      legion(`l${i}`, "north", 10 + i),
    );
    const slots = layoutLegionsAroundSystem(SYS, legs);
    assert.equal(slots.length, 1);
    assert.equal(slots[0]!.stackCount, 6);
    assert.ok(slots[0]!.y - ORIGIN.y < 50);
    assert.ok(Math.abs(slots[0]!.x - ORIGIN.x) < 8);
  });

  it("fans the selected legion faction", () => {
    const legs = Array.from({ length: 4 }, (_, i) => legion(`l${i}`, "north"));
    const slots = layoutLegionsAroundSystem(SYS, legs, undefined, "l1");
    assert.equal(slots.length, 4);
    const xs = slots.map((s) => s.x).sort((a, b) => a - b);
    assert.ok(xs[xs.length - 1]! - xs[0]! < 90);
  });

  it("cycleStackSelection walks one faction then wraps", () => {
    const stack = [
      fleet("a", "north"),
      fleet("b", "north"),
      fleet("c", "north"),
    ];
    assert.equal(cycleStackSelection(stack, "a", null), "a");
    assert.equal(cycleStackSelection(stack, "a", "a"), "b");
    assert.equal(cycleStackSelection(stack, "b", "a"), "b");
    assert.equal(cycleStackSelection(stack, "c", "c"), "a");
    assert.equal(cycleStackSelection([fleet("solo", "north")], "solo", "solo"), null);
  });

  it("places rival factions side by side, not a long parking lot", () => {
    const legs = [
      legion("a", "alpha"),
      legion("b1", "beta"),
      legion("b2", "beta"),
      legion("c", "gamma"),
    ];
    const slots = layoutLegionsAroundSystem(SYS, legs);
    assert.equal(slots.length, 3);
    const xs = slots.map((s) => s.x).sort((a, b) => a - b);
    assert.ok(xs[2]! - xs[0]! < 80);
  });
});
