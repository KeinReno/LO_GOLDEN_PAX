/**
 * P4b space-object combat mods + field depletion (not planet deposits).
 * Run: node --test server/spaceObjects.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadContent, getContent } from "./contentLoader.mjs";
import { addPlanetExtraction, emptyFlows } from "./flowEngine.mjs";
import { computeFlowBreakdown, runEconomyTick } from "./economyTick.mjs";
import { readLedger, writeLedger, ensureFactionEco } from "./ledger.mjs";
import {
  spaceObjectCombatModifier,
  spaceObjectDrawnAmount,
  depleteSpaceObject,
  depleteSystemSpaceObjects,
  depleteWorldSpaceObjects,
} from "./spaceObjects.mjs";
import { resolveEngagementFight } from "./combatResolve.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LEDGER_PATH = path.join(__dirname, "..", "data", "ledger.json");
const FX_PATH = path.join(__dirname, "..", "data", "fx-exchange.json");

const content = {
  space_objects: {
    objects: {
      asteroid: {
        id: "asteroid",
        depletes: true,
        startingRemaining: 240,
        effects: [
          { effect: "rate_mod", args: { category: "A", tier: 2, amount: 1 } },
          { effect: "rate_mod", args: { category: "A", tier: 3, amount: 1 } },
          { effect: "rate_mod", args: { category: "A", tier: 4, amount: 1 } },
        ],
      },
      minefield: {
        id: "minefield",
        combat: { challengerPowerMult: 0.9 },
        effects: [{ effect: "demand_mod", args: { category: "C", tier: 4, amount: 1 } }],
      },
      nebula: {
        id: "nebula",
        combat: { bothPowerMult: 0.95 },
        effects: [{ effect: "rate_mod", args: { category: "B", tier: 3, amount: 1 } }],
      },
    },
  },
};

describe("space-object combat modifiers", () => {
  it("minefield hurts the challenger, not the owner; unowned is 1", () => {
    const system = { ownerFactionId: "fA", spaceObjects: ["minefield"] };
    assert.equal(spaceObjectCombatModifier(system, content, "fA"), 1);
    assert.equal(spaceObjectCombatModifier(system, content, "fB"), 0.9);
    assert.equal(
      spaceObjectCombatModifier(
        { ownerFactionId: null, spaceObjects: ["minefield"] },
        content,
        "fA",
      ),
      1,
    );
  });

  it("environmental bothPowerMult applies to owner and challenger", () => {
    const system = { ownerFactionId: "fA", spaceObjects: ["nebula"] };
    assert.equal(spaceObjectCombatModifier(system, content, "fA"), 0.95);
    assert.equal(spaceObjectCombatModifier(system, content, "fB"), 0.95);
  });
});

describe("field depletion (space objects only)", () => {
  it("asteroid drawn amount is the sum of positive rate_mod", () => {
    assert.equal(spaceObjectDrawnAmount(content.space_objects.objects.asteroid), 3);
  });

  it("depletes remaining over ticks and removes at zero", () => {
    const sys = {
      ownerFactionId: "fA",
      spaceObjects: ["asteroid"],
      spaceObjectRemaining: { asteroid: 6 },
    };
    const t1 = depleteSystemSpaceObjects(sys, content);
    assert.equal(t1.remaining.asteroid, 3);
    assert.equal(t1.removed.length, 0);
    Object.assign(sys, { spaceObjects: t1.spaceObjects, spaceObjectRemaining: t1.remaining });
    const t2 = depleteSystemSpaceObjects(sys, content);
    assert.equal(t2.removed[0], "asteroid");
    assert.deepEqual(t2.spaceObjects, []);
    assert.equal(t2.remaining.asteroid, undefined);
  });

  it("does not deplete nebula or unowned asteroid", () => {
    const nebulaSys = { ownerFactionId: "fA", spaceObjects: ["nebula"] };
    const nebulaNext = depleteSystemSpaceObjects(nebulaSys, content);
    assert.equal(nebulaNext.removed.length, 0);
    assert.equal(nebulaNext.changed, false);

    const unowned = {
      ownerFactionId: null,
      spaceObjects: ["asteroid"],
      spaceObjectRemaining: { asteroid: 240 },
    };
    const unownedNext = depleteSystemSpaceObjects(unowned, content);
    assert.equal(unownedNext.changed, false);
    assert.equal(unownedNext.remaining.asteroid, 240);
  });

  it("depleteSpaceObject is a no-op for non-depleting types", () => {
    const r = depleteSpaceObject(
      { spaceObjects: ["nebula"] },
      "nebula",
      10,
      content.space_objects.objects.nebula,
    );
    assert.equal(r.removed, false);
  });
});

describe("planet deposits stay infinite", () => {
  it("depletion does not splice planet.resources; extraction still credits", () => {
    const world = {
      systems: [
        {
          ownerFactionId: "fA",
          spaceObjects: ["asteroid"],
          spaceObjectRemaining: { asteroid: 6 },
          planets: [{ id: "p1", resources: ["map.iron"], population: 4, buildings: [] }],
        },
      ],
    };
    depleteWorldSpaceObjects(world, content);
    assert.deepEqual(world.systems[0].planets[0].resources, ["map.iron"]);

    const fixture = {
      map_resources: {
        "map.iron": {
          id: "map.iron",
          category: "A",
          tier: 1,
          yield: { "currency.metal": 2 },
        },
      },
    };
    const a = emptyFlows();
    addPlanetExtraction(a, ["map.iron"], fixture, {
      buildings: [{ buildingId: "building.mine" }],
      skipExtractGate: true,
    });
    const b = emptyFlows();
    addPlanetExtraction(b, world.systems[0].planets[0].resources, fixture, {
      skipExtractGate: true,
    });
    assert.equal(a.B[1].rate, 2);
    assert.equal(b.B[1].rate, 2);
  });
});

describe("live tick + combat hook", () => {
  it("runEconomyTick depletes an owned asteroid field", () => {
    loadContent();
    const live = getContent();
    const tag = `so_dep_${Date.now().toString(36)}`;
    const factionId = `${tag}_f`;
    const world = {
      meta: { turn: 2 },
      factions: [{ id: factionId }],
      systems: [
        {
          id: `${tag}_sys`,
          ownerFactionId: factionId,
          spaceObjects: ["asteroid"],
          spaceObjectRemaining: { asteroid: 9 },
          planets: [
            {
              id: `${tag}_p`,
              resources: ["map.iron"],
              population: 4,
              colonyType: "colony",
              buildings: [{ buildingId: "building.mine" }],
            },
          ],
          stations: [],
          resources: [],
        },
      ],
      fleets: [],
      legions: [],
    };
    const snap = (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null);
    const restore = (p, raw) => {
      if (raw == null) {
        if (fs.existsSync(p)) fs.unlinkSync(p);
        return;
      }
      fs.writeFileSync(p, raw, "utf8");
    };
    const ledgerSnap = snap(LEDGER_PATH);
    const fxSnap = snap(FX_PATH);
    try {
      const seeded = readLedger();
      const eco = ensureFactionEco(seeded, factionId);
      eco.techTiers = { A: 10, B: 10, C: 10, D: 10, E: 10, F: 10 };
      writeLedger(seeded);
      const beforeRes = [...world.systems[0].planets[0].resources];
      runEconomyTick(world, 3);
      const drawn = spaceObjectDrawnAmount(live.space_objects.objects.asteroid);
      assert.equal(world.systems[0].spaceObjectRemaining.asteroid, 9 - drawn);
      assert.deepEqual(world.systems[0].planets[0].resources, beforeRes);
      const flow = computeFlowBreakdown(world, factionId, live, eco);
      assert.ok(
        Number(flow.strategicExtraction?.["map.iron"] || flow.totals?.A?.rate || 0) >= 0,
      );
    } finally {
      restore(LEDGER_PATH, ledgerSnap);
      restore(FX_PATH, fxSnap);
    }
  });

  it("minefield changes engagement power for the challenger", () => {
    loadContent();
    const group = () => ({
      defId: "ship.scout",
      roles: ["screen"],
      count: 4,
      damage: 10,
      accuracy: 100,
      shields: 0,
      hp: 40,
      maxHp: 40,
    });
    const makeWorld = (mine) => ({
      factions: [{ id: "fA" }, { id: "fB" }],
      systems: [
        {
          id: "s1",
          ownerFactionId: "fB",
          spaceObjects: mine ? ["minefield"] : [],
          planets: [],
        },
      ],
      fleets: [
        { id: "flA", factionId: "fA", systemId: "s1", composition: [group()] },
        { id: "flB", factionId: "fB", systemId: "s1", composition: [group()] },
      ],
      legions: [],
    });
    const engagement = {
      systemId: "s1",
      theater: "space",
      sides: [
        { factionId: "fA", fleetIds: ["flA"], legionIds: [], stance: "hold" },
        { factionId: "fB", fleetIds: ["flB"], legionIds: [], stance: "hold" },
      ],
    };
    const even = resolveEngagementFight(makeWorld(false), engagement);
    const mined = resolveEngagementFight(makeWorld(true), engagement);
    assert.equal(even.ok, true);
    assert.equal(mined.ok, true);
    assert.ok(mined.powerA < even.powerA, `challenger ${mined.powerA} < ${even.powerA}`);
    assert.ok(Math.abs(mined.powerB - even.powerB) < 1e-9, `owner ${mined.powerB} vs ${even.powerB}`);
  });
});
