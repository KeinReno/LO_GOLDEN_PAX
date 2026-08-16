/**
 * Raise-from-planet domain checks (forces_raise_from_planet_v05).
 * Run: node --test server/forceRecruit.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  OVER_CEILING_POPULATION_MULT,
  mobilizableRecruits,
  populationCostForRaise,
  canRaiseUnit,
  raiseUnit,
  disbandUnits,
  reduceComposition,
  applyForceRaise,
  applyForceDisband,
} from "./forceRecruit.mjs";
import { applySystemAction } from "./systemActions.mjs";

const content = {
  economy_balance: { forces: { mobilizationRate: 0.3 } },
};
const militia = {
  id: "unit.militia",
  name: "Ополчение",
  tier: 1,
  roles: ["infantry", "militia"],
  raisableWithoutBuilding: true,
  cost: { "currency.metal": 4, "currency.supply": 2 },
};
const line = {
  id: "unit.generic_line",
  name: "Линейная пехота",
  tier: 2,
  roles: ["infantry"],
  cost: { "currency.metal": 8, "currency.supply": 4 },
};
const scout = {
  id: "ship.scout",
  name: "Разведчик",
  tier: 1,
  roles: ["screen"],
  cost: { "currency.metal": 10, "currency.supply": 4 },
};

describe("mobilizableRecruits", () => {
  it("floors population * 30%", () => {
    assert.equal(mobilizableRecruits({ population: 10 }, 0.3), 3);
    assert.equal(mobilizableRecruits({ population: 100 }, 0.3), 30);
  });
});

describe("populationCostForRaise", () => {
  it("is 1:1 without override; 1.5x overflow with override", () => {
    assert.equal(OVER_CEILING_POPULATION_MULT, 1.5);
    assert.equal(populationCostForRaise(5, 3, false), 5);
    assert.equal(populationCostForRaise(5, 3, true), 6);
  });
});

describe("canRaiseUnit", () => {
  it("allows militia with zero infrastructure", () => {
    const system = { ownerFactionId: "fA", planets: [] };
    assert.deepEqual(canRaiseUnit(system, { ownerFactionId: "fA" }, militia, "unit", "fA"), {
      ok: true,
    });
  });

  it("requires barracks for non-militia and shipyard for ships", () => {
    const empty = {
      ownerFactionId: "fA",
      planets: [{ ownerFactionId: "fA", surfaceBuildings: [], orbitalBuildings: [] }],
    };
    const planet = { ownerFactionId: "fA" };
    assert.equal(canRaiseUnit(empty, planet, line, "unit", "fA").ok, false);
    assert.equal(canRaiseUnit(empty, planet, scout, "ship", "fA").ok, false);

    const barracks = {
      ownerFactionId: "fA",
      planets: [{ ownerFactionId: "fA", surfaceBuildings: [{ kind: "barracks" }], orbitalBuildings: [] }],
    };
    const yard = {
      ownerFactionId: "fA",
      planets: [{ ownerFactionId: "fA", surfaceBuildings: [], orbitalBuildings: [{ kind: "shipyard" }] }],
    };
    assert.deepEqual(canRaiseUnit(barracks, planet, line, "unit", "fA"), { ok: true });
    assert.deepEqual(canRaiseUnit(yard, planet, scout, "ship", "fA"), { ok: true });
  });

  it("rejects a planet the faction does not own", () => {
    assert.equal(
      canRaiseUnit({ ownerFactionId: "fA", planets: [] }, { ownerFactionId: "fB" }, militia, "unit", "fA")
        .ok,
      false,
    );
  });

  it("rejects raise when requireProperties are locked", () => {
    const barracks = {
      ownerFactionId: "fA",
      planets: [{ ownerFactionId: "fA", surfaceBuildings: [{ kind: "barracks" }], orbitalBuildings: [] }],
    };
    const planet = { ownerFactionId: "fA" };
    const gated = { ...line, requireProperties: ["line_infantry"] };
    assert.equal(canRaiseUnit(barracks, planet, gated, "unit", "fA").ok, false);
    assert.equal(
      canRaiseUnit(barracks, planet, gated, "unit", "fA", { unlockedProperties: ["line_infantry"] })
        .ok,
      true,
    );
  });
});

describe("raiseUnit", () => {
  it("spends population and currency together", () => {
    const system = { ownerFactionId: "fA", planets: [] };
    const planet = { ownerFactionId: "fA", population: 20 };
    const stocks = { "currency.metal": 100, "currency.supply": 100 };
    const result = raiseUnit(system, planet, militia, "unit", "fA", 3, stocks, content);
    assert.equal(result.ok, true);
    assert.equal(result.planet.population, 17);
    assert.equal(result.group.defId, "unit.militia");
    assert.equal(result.group.count, 3);
    assert.equal(result.stocks["currency.metal"], 88);
    assert.equal(result.stocks["currency.supply"], 94);
    assert.equal(planet.population, 20);
  });

  it("fails when the 30% ceiling cannot cover the ask", () => {
    const result = raiseUnit(
      { ownerFactionId: "fA", planets: [] },
      { ownerFactionId: "fA", population: 10 },
      militia,
      "unit",
      "fA",
      5,
      { "currency.metal": 1000, "currency.supply": 1000 },
      content,
    );
    assert.equal(result.ok, false);
    assert.match(result.error, /мобилиз/);
  });

  it("overrideCeiling spends extra population on overflow only", () => {
    const result = raiseUnit(
      { ownerFactionId: "fA", planets: [] },
      { ownerFactionId: "fA", population: 10 },
      militia,
      "unit",
      "fA",
      5,
      { "currency.metal": 1000, "currency.supply": 1000 },
      content,
      { overrideCeiling: true },
    );
    assert.equal(result.ok, true);
    assert.equal(result.planet.population, 4);
    assert.equal(result.group.count, 5);
  });

  it("fails ships without a shipyard and spends nothing", () => {
    const planet = { ownerFactionId: "fA", population: 20 };
    const stocks = { "currency.metal": 1000, "currency.supply": 1000 };
    const result = raiseUnit(
      { ownerFactionId: "fA", planets: [] },
      planet,
      scout,
      "ship",
      "fA",
      1,
      stocks,
      content,
    );
    assert.equal(result.ok, false);
    assert.match(result.error, /верф/);
    assert.equal(planet.population, 20);
    assert.equal(stocks["currency.metal"], 1000);
  });
});

describe("disbandUnits / reduceComposition", () => {
  it("returns population, not currency", () => {
    assert.equal(disbandUnits({ population: 10 }, 4).population, 14);
  });

  it("reduces last group by count; omitting both clears the force", () => {
    const scouts = { defId: "ship.scout", count: 4 };
    const mil = { defId: "unit.militia", count: 3 };
    assert.deepEqual(reduceComposition([scouts, mil]), {
      ok: true,
      composition: [],
      disbandedCount: 7,
    });
    const partial = reduceComposition([scouts, mil], 2);
    assert.equal(partial.disbandedCount, 2);
    assert.equal(partial.composition[1].count, 1);
  });
});

describe("applyForceRaise / applyForceDisband (in-memory, no disk)", () => {
  function fixture() {
    const planet = {
      id: "p1",
      ownerFactionId: "fA",
      population: 20,
      surfaceBuildings: [],
      orbitalBuildings: [],
    };
    const world = {
      meta: { turn: 1 },
      factions: [{ id: "fA" }],
      systems: [{ id: "s1", name: "Test", ownerFactionId: "fA", planets: [planet] }],
      legions: [],
      fleets: [],
    };
    const ledger = {
      factions: {
        fA: { stocks: { "currency.metal": 1000, "currency.supply": 1000 } },
      },
    };
    return { world, planet, ledger };
  }

  it("raises militia onto a new legion and deducts pop + currency", () => {
    const { world, planet, ledger } = fixture();
    const metalBefore = ledger.factions.fA.stocks["currency.metal"];
    const result = applyForceRaise({
      world,
      factionId: "fA",
      systemId: "s1",
      planetId: "p1",
      kind: "unit",
      defId: "unit.militia",
      count: 2,
      persist: false,
      ledger,
    });
    assert.equal(result.ok, true);
    assert.equal(planet.population, 18);
    assert.equal(world.legions.length, 1);
    assert.equal(world.legions[0].composition[0].defId, "unit.militia");
    assert.equal(world.legions[0].composition[0].count, 2);
    assert.equal(world.legions[0].homePlanetId, "p1");
    assert.ok(ledger.factions.fA.stocks["currency.metal"] < metalBefore);
  });

  it("omitted forceId creates a new legion and does not merge into a visitor", () => {
    const { world, ledger } = fixture();
    world.legions = [
      {
        id: "home-legion",
        factionId: "fA",
        systemId: "s1",
        homePlanetId: "p-other",
        composition: [{ defId: "unit.militia", count: 4 }],
        strength: 4,
        status: "idle",
      },
      {
        id: "visitor-legion",
        factionId: "fA",
        systemId: "s1",
        homePlanetId: "p-away",
        composition: [{ defId: "unit.generic_line", count: 7 }],
        strength: 7,
        status: "idle",
      },
    ];
    const visitorBefore = structuredClone(world.legions[1].composition);
    const result = applyForceRaise({
      world,
      factionId: "fA",
      systemId: "s1",
      planetId: "p1",
      kind: "unit",
      defId: "unit.militia",
      count: 2,
      persist: false,
      ledger,
    });
    assert.equal(result.ok, true);
    assert.equal(world.legions.length, 3);
    const created = world.legions[2];
    assert.notEqual(created.id, "home-legion");
    assert.notEqual(created.id, "visitor-legion");
    assert.equal(created.homePlanetId, "p1");
    assert.equal(created.composition[0].defId, "unit.militia");
    assert.equal(created.composition[0].count, 2);
    assert.deepEqual(world.legions[1].composition, visitorBefore);
    assert.equal(world.legions[0].composition[0].count, 4);
  });

  it("blocks non-militia without barracks", () => {
    const { world, ledger } = fixture();
    const result = applyForceRaise({
      world,
      factionId: "fA",
      systemId: "s1",
      planetId: "p1",
      kind: "unit",
      defId: "unit.generic_line",
      count: 1,
      persist: false,
      ledger,
    });
    assert.equal(result.ok, false);
    assert.match(result.error, /казарм/);
  });

  it("disband returns population and does not mint currency", () => {
    const { world, planet, ledger } = fixture();
    const raised = applyForceRaise({
      world,
      factionId: "fA",
      systemId: "s1",
      planetId: "p1",
      kind: "unit",
      defId: "unit.militia",
      count: 2,
      persist: false,
      ledger,
    });
    const metalAfterRaise = ledger.factions.fA.stocks["currency.metal"];
    const disbanded = applyForceDisband({
      world,
      factionId: "fA",
      kind: "legion",
      id: raised.force.id,
      persist: false,
    });
    assert.equal(disbanded.ok, true);
    assert.equal(disbanded.force, null);
    assert.equal(planet.population, 20);
    assert.equal(ledger.factions.fA.stocks["currency.metal"], metalAfterRaise);
    assert.equal(world.legions.length, 0);
  });
});

describe("produce_unit / produce_ship go through raise (in-memory)", () => {
  function produceFixture(pop = 20) {
    const planet = {
      id: "p1",
      ownerFactionId: "fA",
      population: pop,
      surfaceBuildings: [],
      orbitalBuildings: [],
    };
    const world = {
      meta: { turn: 1 },
      factions: [{ id: "fA" }],
      systems: [
        { id: "s1", name: "Test", ownerFactionId: "fA", planets: [planet] },
      ],
      legions: [],
      fleets: [],
    };
    const ledger = {
      factions: {
        fA: { stocks: { "currency.metal": 1000, "currency.supply": 1000 } },
      },
    };
    return { world, planet, ledger };
  }

  it("produce_unit with pop succeeds and population goes down", () => {
    const { world, planet, ledger } = produceFixture(20);
    const metalBefore = ledger.factions.fA.stocks["currency.metal"];
    const result = applySystemAction({
      world,
      factionId: "fA",
      action: "produce_unit",
      systemId: "s1",
      planetId: "p1",
      unitId: "unit.militia",
      count: 2,
      persist: false,
      ledger,
    });
    assert.equal(result.ok, true);
    assert.equal(planet.population, 18);
    assert.equal(result.popCost, 2);
    assert.equal(world.legions.length, 1);
    assert.equal(world.legions[0].composition[0].defId, "unit.militia");
    assert.equal(world.legions[0].composition[0].count, 2);
    const billed = Number(result.cost?.["currency.metal"] || 0);
    assert.ok(billed > 0);
    assert.equal(
      ledger.factions.fA.stocks["currency.metal"],
      metalBefore - billed,
    );
  });

  it("produce_unit with 0 pop fails and does not spawn", () => {
    const { world, planet, ledger } = produceFixture(0);
    const metalBefore = ledger.factions.fA.stocks["currency.metal"];
    const result = applySystemAction({
      world,
      factionId: "fA",
      action: "produce_unit",
      systemId: "s1",
      planetId: "p1",
      unitId: "unit.militia",
      count: 1,
      persist: false,
      ledger,
    });
    assert.equal(result.ok, false);
    assert.match(result.error, /населен/);
    assert.equal(planet.population, 0);
    assert.equal(world.legions.length, 0);
    assert.equal(ledger.factions.fA.stocks["currency.metal"], metalBefore);
  });

  it("produce_ship spends pop (including crew) and does not mint hulls from air", () => {
    const { world, planet, ledger } = produceFixture(20);
    planet.orbitalBuildings = [{ kind: "shipyard" }];
    const metalBefore = ledger.factions.fA.stocks["currency.metal"];
    const result = applySystemAction({
      world,
      factionId: "fA",
      action: "produce_ship",
      systemId: "s1",
      planetId: "p1",
      shipId: "ship.scout",
      count: 1,
      persist: false,
      ledger,
    });
    assert.equal(result.ok, true);
    assert.ok(planet.population < 20);
    assert.equal(world.fleets.length, 1);
    const group = world.fleets[0].composition[0];
    assert.equal(group.defId, "ship.scout");
    assert.equal(group.count, 1);
    assert.ok((group.crewCount || 0) > 0);
    assert.ok(ledger.factions.fA.stocks["currency.metal"] < metalBefore);
  });
});
