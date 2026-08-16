import { describe, it, expect } from "vitest";
import { canColonizePlanet, colonizePlanet } from "./colonization.mjs";

/**
 * Behavior test, not a cross-repo diff: GMap's canColonizePlanet is
 * module-private in server/planetActions.mjs (never exported). Cases
 * re-derived directly from reading that function.
 */
describe("canColonizePlanet", () => {
  it("requires an owned system, an empty/unclaimed/habitable planet", () => {
    expect(canColonizePlanet({ ownerFactionId: "fA" }, { population: 0, colonyType: "none", habitable: true }, "fA")).toBe(true);
    expect(canColonizePlanet({ ownerFactionId: "fA" }, { population: 5, colonyType: "none", habitable: true }, "fA")).toBe(false);
    expect(canColonizePlanet({ ownerFactionId: "fB" }, { population: 0, colonyType: "none", habitable: true }, "fA")).toBe(false);
    expect(canColonizePlanet({ ownerFactionId: "fA" }, { population: 0, colonyType: "outpost", habitable: true }, "fA")).toBe(false);
    expect(canColonizePlanet({ ownerFactionId: "fA" }, { population: 0, colonyType: "none", habitable: true, colonizable: false }, "fA")).toBe(false);
    expect(canColonizePlanet({ ownerFactionId: "fA" }, { population: 0, colonyType: "none", ownerFactionId: "fB", habitable: true }, "fA")).toBe(false);
  });
});

describe("colonizePlanet (scoped action, real content/core/colonies.json costs)", () => {
  const content = { colonies: { "colony.outpost": { colonyType: "outpost", colonizeCost: { "currency.metal": 14, "currency.supply": 6 }, colonizePopulation: 2 } } };
  const auto = { mode: "auto", founderRaceId: "race_human", factionPlanets: [] };

  it("spends the real cost and sets ownership/population (auto mode, founding colony)", () => {
    const system = { ownerFactionId: "fA" };
    const planet = { population: 0, colonyType: "none", habitable: true };
    const stocks = { "currency.metal": 20, "currency.supply": 10 };

    const result = colonizePlanet(system, planet, "fA", "outpost", stocks, content, auto);

    expect(result.ok).toBe(true);
    expect(result.planet.ownerFactionId).toBe("fA");
    expect(result.planet.population).toBe(2);
    expect(result.planet.raceComposition).toEqual([{ raceId: "race_human", percent: 100 }]);
    expect(result.stocks["currency.metal"]).toBe(6);
    expect(result.stocks["currency.supply"]).toBe(4);
    expect(result.sourcePlanets).toEqual([]); // founding colony — nothing to transfer from
  });

  it("fails, spending nothing, when the faction can't afford it", () => {
    const system = { ownerFactionId: "fA" };
    const planet = { population: 0, colonyType: "none", habitable: true };
    const stocks = { "currency.metal": 1, "currency.supply": 1 };

    const result = colonizePlanet(system, planet, "fA", "outpost", stocks, content, auto);
    expect(result.ok).toBe(false);
  });

  it("fails when the planet can't be colonized (not your system)", () => {
    const system = { ownerFactionId: "fB" };
    const planet = { population: 0, colonyType: "none", habitable: true };
    const result = colonizePlanet(system, planet, "fA", "outpost", {}, content, auto);
    expect(result.ok).toBe(false);
  });

  it("auto mode with an existing empire draws real population from the faction's other planets", () => {
    const system = { ownerFactionId: "fA" };
    const planet = { population: 0, colonyType: "none", habitable: true };
    const stocks = { "currency.metal": 20, "currency.supply": 10 };
    const home = { id: "home", population: 50, raceComposition: [{ raceId: "race_human", percent: 100 }] };

    const result = colonizePlanet(system, planet, "fA", "outpost", stocks, content, { mode: "auto", founderRaceId: "race_human", factionPlanets: [home] });

    expect(result.ok).toBe(true);
    expect(result.planet.population).toBe(2);
    expect(result.sourcePlanets).toEqual([{ id: "home", population: 48, raceComposition: [{ raceId: "race_human", percent: 100 }] }]);
  });

  it("manual mode sends an exact player-chosen composition and quantity", () => {
    const system = { ownerFactionId: "fA" };
    const planet = { population: 0, colonyType: "none", habitable: true };
    const stocks = { "currency.metal": 20, "currency.supply": 10 };
    const home = { id: "home", population: 100, raceComposition: [{ raceId: "race_human", percent: 80 }, { raceId: "race_belator", percent: 20 }] };
    const opts = {
      mode: "manual",
      factionPlanets: [home],
      manualComposition: [{ raceId: "race_human", count: 5 }, { raceId: "race_belator", count: 1 }],
    };

    const result = colonizePlanet(system, planet, "fA", "outpost", stocks, content, opts);

    expect(result.ok).toBe(true);
    expect(result.planet.population).toBe(6); // manual mode's own total, not colonizePopulation
    expect(result.planet.raceComposition).toEqual(
      expect.arrayContaining([
        { raceId: "race_human", percent: expect.closeTo((5 / 6) * 100, 5) },
        { raceId: "race_belator", percent: expect.closeTo((1 / 6) * 100, 5) },
      ]),
    );
  });

  it("manual mode with an explicit source planet deducts only from that planet, and fails if it can't cover the ask", () => {
    const system = { ownerFactionId: "fA" };
    const planet = { population: 0, colonyType: "none", habitable: true };
    const stocks = { "currency.metal": 20, "currency.supply": 10 };
    const home = { id: "home", population: 10, raceComposition: [{ raceId: "race_human", percent: 100 }] };
    const opts = { mode: "manual", factionPlanets: [home], sourcePlanetId: "home", manualComposition: [{ raceId: "race_human", count: 5 }] };

    const ok = colonizePlanet(system, { ...planet }, "fA", "outpost", stocks, content, opts);
    expect(ok.ok).toBe(true);
    expect(ok.sourcePlanets).toEqual([{ id: "home", population: 5, raceComposition: [{ raceId: "race_human", percent: 100 }] }]);

    const tooMuch = colonizePlanet(system, { ...planet }, "fA", "outpost", stocks, content, {
      ...opts,
      manualComposition: [{ raceId: "race_human", count: 999 }],
    });
    expect(tooMuch.ok).toBe(false);
  });
});
