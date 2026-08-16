import { describe, it, expect } from "vitest";
import { runEconomyTick } from "./economyTick.mjs";
import { defaultEconomyAccount } from "./ledgerAccount.mjs";

const content = {
  rules: { population: { maxLossPerTurn: 0.15 }, tax: { defaultMode: "sink" } },
  taxes: {
    "tax.materia": { id: "tax.materia", tiers: [{ id: "none", rate: 0 }, { id: "high", rate: 0.2 }] },
  },
};

describe("runEconomyTick", () => {
  it("does not assume a fixed number of factions", () => {
    expect(runEconomyTick([], 1, content).breakdowns).toEqual({});
    const many = Array.from({ length: 8 }, (_, i) => ({ id: `f-${i}`, eco: defaultEconomyAccount(`f-${i}`) }));
    expect(Object.keys(runEconomyTick(many, 1, content).breakdowns)).toHaveLength(8);
  });

  it("applies category income, taxing it before it hits stocks", () => {
    const eco = { ...defaultEconomyAccount("f1"), taxes: { "tax.materia": "high" } };
    const factions = [{ id: "f1", eco, categoryIncome: { "currency.materia": 100 } }];

    const { breakdowns } = runEconomyTick(factions, 5, content);

    expect(breakdowns.f1.channels["currency.materia"]).toMatchObject({ gross: 100, taxRate: 0.2, tax: 20, net: 80 });
    expect(factions[0].eco.stocks["currency.materia"]).toBe(eco.stocks["currency.materia"] + 80);
  });

  it("re-evaluates deficit from the resulting stocks", () => {
    const eco = { ...defaultEconomyAccount("f1"), stocks: { ...defaultEconomyAccount("f1").stocks, "currency.bios": 0 } };
    const factions = [{ id: "f1", eco }];
    const { breakdowns } = runEconomyTick(factions, 1, content);
    expect(breakdowns.f1.deficit).toBe("empty");
  });

  it("grows population on each faction's planets using the real growth curve", () => {
    const factions = [
      {
        id: "f1",
        eco: defaultEconomyAccount("f1"),
        planets: [{ pop: 50, cap: 100, growthRate: 0.1, habEff: 1, supplyFactor: 1 }],
      },
    ];
    const { breakdowns } = runEconomyTick(factions, 1, content);
    const [planet] = breakdowns.f1.planets;
    expect(planet.pop).toBeGreaterThan(50);
    expect(planet.pop).toBeLessThan(100);
  });

  it("emigration never drops population by more than maxLossPerTurn", () => {
    const factions = [
      {
        id: "f1",
        eco: defaultEconomyAccount("f1"),
        planets: [{ pop: 1000, cap: 100, growthRate: 0.012, habEff: 1, supplyFactor: 1 }],
      },
    ];
    const { breakdowns } = runEconomyTick(factions, 1, content);
    const [planet] = breakdowns.f1.planets;
    expect(planet.pop).toBeGreaterThanOrEqual(1000 * (1 - 0.15));
  });

  it("an empty treasury applies GMap's harsher emigration penalty (-2%/turn) instead of normal growth", () => {
    const eco = { ...defaultEconomyAccount("f1"), stocks: { ...defaultEconomyAccount("f1").stocks, "currency.bios": 0 } };
    const factions = [
      { id: "f1", eco, planets: [{ pop: 1000, cap: 2000, growthRate: 0.1, habEff: 1, supplyFactor: 1 }] },
    ];
    const { breakdowns } = runEconomyTick(factions, 1, content);
    expect(breakdowns.f1.deficit).toBe("empty");
    // Below cap, normal growth would be strongly positive; empty treasury forces at least -2%.
    expect(breakdowns.f1.planets[0].delta).toBeLessThanOrEqual(-Math.floor(1000 * 0.02));
  });

  it("healthy stocks leave population growth untouched by the empty-treasury penalty", () => {
    const factions = [
      { id: "f1", eco: defaultEconomyAccount("f1"), planets: [{ pop: 1000, cap: 2000, growthRate: 0.1, habEff: 1, supplyFactor: 1 }] },
    ];
    const { breakdowns } = runEconomyTick(factions, 1, content);
    expect(breakdowns.f1.deficit).toBe("ok");
    expect(breakdowns.f1.planets[0].delta).toBeGreaterThan(0);
  });

  it("tax pressure decays 15%/turn, accumulates pressureAdd, and is capped at 12", () => {
    const eco = { ...defaultEconomyAccount("f1"), pressure: 10 };
    const { breakdowns: r1 } = runEconomyTick([{ id: "f1", eco, pressureAdd: 0 }], 1, content);
    expect(r1.f1.pressure).toBe(Math.floor(10 * 0.85)); // 8

    const highPressureEco = { ...defaultEconomyAccount("f1"), pressure: 10 };
    const { breakdowns: r2 } = runEconomyTick([{ id: "f1", eco: highPressureEco, pressureAdd: 20 }], 1, content);
    expect(r2.f1.pressure).toBe(12);
  });
});
