import { describe, it, expect } from "vitest";
import {
  raceCountsFromPlanet,
  factionRaceCounts,
  rollAutoComposition,
  withDeductedRacePopulation,
  deductRaceAcrossPlanets,
} from "./raceComposition.mjs";

describe("raceCountsFromPlanet / factionRaceCounts", () => {
  it("converts percent-based composition into literal counts", () => {
    const planet = { population: 100, raceComposition: [{ raceId: "race_human", percent: 80 }, { raceId: "race_belator", percent: 20 }] };
    expect(raceCountsFromPlanet(planet)).toEqual({ race_human: 80, race_belator: 20 });
  });

  it("sums across every planet in the faction", () => {
    const planets = [
      { population: 100, raceComposition: [{ raceId: "race_human", percent: 100 }] },
      { population: 20, raceComposition: [{ raceId: "race_human", percent: 50 }, { raceId: "race_belator", percent: 50 }] },
    ];
    expect(factionRaceCounts(planets)).toEqual({ race_human: 110, race_belator: 10 });
  });
});

describe("rollAutoComposition", () => {
  // rollDie(6) uses crypto.randomInt internally (see combat/dice.mjs), not
  // the injected rng — the purity band itself isn't deterministically
  // forceable, so these are bounds/invariant checks over many rolls, same
  // treatment as domain/quests' non-deterministic roll tests.

  it("is always pure when the faction has no other races to mix in, regardless of roll", () => {
    for (let i = 0; i < 20; i++) {
      const { composition } = rollAutoComposition("race_human", {}, () => 0.9);
      expect(composition).toEqual([{ raceId: "race_human", percent: 100 }]);
    }
  });

  it("always includes the founder race and sums to 100%, whatever the roll", () => {
    const counts = { race_belator: 50, race_zeth: 10 };
    for (let i = 0; i < 30; i++) {
      const { roll, composition } = rollAutoComposition("race_human", counts, Math.random);
      expect(roll).toBeGreaterThanOrEqual(1);
      expect(roll).toBeLessThanOrEqual(6);
      expect(composition.some((c) => c.raceId === "race_human")).toBe(true);
      expect(composition.reduce((s, c) => s + c.percent, 0)).toBeCloseTo(100, 5);
      for (const c of composition) {
        expect(["race_human", "race_belator", "race_zeth"]).toContain(c.raceId);
      }
    }
  });

  it("light/heavy mix bands only draw secondary races the faction already has", () => {
    // Weighted pick with a single candidate always picks it — makes the
    // secondary race deterministic whenever the roll lands on a mix band.
    // Heavy mix (roll 6) falls back to a 55/45 split when only one
    // secondary race exists (nothing left for a third slot).
    const counts = { race_belator: 50 };
    for (let i = 0; i < 30; i++) {
      const { roll, composition } = rollAutoComposition("race_human", counts, () => 0.1);
      if (roll <= 3) continue;
      if (roll <= 5) {
        expect(composition).toEqual([
          { raceId: "race_human", percent: 80 },
          { raceId: "race_belator", percent: 20 },
        ]);
      } else {
        expect(composition).toEqual([
          { raceId: "race_human", percent: 55 },
          { raceId: "race_belator", percent: 45 },
        ]);
      }
    }
  });
});

describe("withDeductedRacePopulation", () => {
  it("removes the given amount of one race and recomputes percentages", () => {
    const planet = { population: 100, raceComposition: [{ raceId: "race_human", percent: 80 }, { raceId: "race_belator", percent: 20 }] };
    const next = withDeductedRacePopulation(planet, "race_human", 30);
    expect(next.population).toBe(70);
    expect(next.raceComposition).toEqual(
      expect.arrayContaining([
        { raceId: "race_human", percent: expect.closeTo(50 / 70 * 100, 5) },
        { raceId: "race_belator", percent: expect.closeTo(20 / 70 * 100, 5) },
      ]),
    );
  });

  it("clamps to what the planet actually has, never goes negative", () => {
    const planet = { population: 10, raceComposition: [{ raceId: "race_human", percent: 100 }] };
    const next = withDeductedRacePopulation(planet, "race_human", 999);
    expect(next.population).toBe(0);
    expect(next.raceComposition).toEqual([]);
  });

  it("is a no-op when the planet has none of that race", () => {
    const planet = { population: 10, raceComposition: [{ raceId: "race_human", percent: 100 }] };
    expect(withDeductedRacePopulation(planet, "race_belator", 5)).toBe(planet);
  });
});

describe("deductRaceAcrossPlanets", () => {
  it("spreads the draw proportionally to each planet's share of that race", () => {
    const planets = [
      { id: "p1", population: 80, raceComposition: [{ raceId: "race_human", percent: 100 }] },
      { id: "p2", population: 20, raceComposition: [{ raceId: "race_human", percent: 100 }] },
    ];
    const updated = deductRaceAcrossPlanets(planets, "race_human", 20);
    const byId = Object.fromEntries(updated.map((p) => [p.id, p]));
    expect(byId.p1.population).toBe(64); // lost 16 (80% of the 20 drawn)
    expect(byId.p2.population).toBe(16); // lost 4 (20% of the 20 drawn)
  });

  it("returns nothing when no planet has that race", () => {
    const planets = [{ id: "p1", population: 80, raceComposition: [{ raceId: "race_belator", percent: 100 }] }];
    expect(deductRaceAcrossPlanets(planets, "race_human", 20)).toEqual([]);
  });
});
