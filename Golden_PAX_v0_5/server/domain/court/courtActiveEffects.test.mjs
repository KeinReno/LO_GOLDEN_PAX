import { describe, it, expect } from "vitest";
import { getContent } from "../../contentLoader.mjs";
import { collectCourtActiveEffects, factionScopeEffects } from "./courtActiveEffects.mjs";
import { computeFactionFlowIncome } from "../planets/flowIncome.mjs";
import { resolveExchange } from "../combat/resolveExchange.mjs";
import { runEconomyTick } from "../economy/economyTick.mjs";
import { defaultEconomyAccount } from "../economy/ledgerAccount.mjs";
import { defaultNpc, ensurePlayerRulers } from "./npcRoster.mjs";
import { ensureFactionCouncil } from "./councilSeats.mjs";

const content = getContent(["core"]);

function factionWith(npcs, extras = {}) {
  const council = extras.council || ensureFactionCouncil({}, content);
  const synced = ensurePlayerRulers({ npcs, rulerNpcId: extras.rulerNpcId ?? null });
  return { ...synced, council, activeEffects: extras.activeEffects ?? [] };
}

const flowContent = {
  economy_schema: {
    categories: {
      A: { currencyId: "currency.extracta" },
      B: { currencyId: "currency.materia" },
      D: { currencyId: "currency.energia" },
      E: { currencyId: "currency.bios" },
    },
    rps_edges: [{ edge: "A->B", from: "A", to: "B" }],
  },
  map_resources: {
    "map.iron": { id: "map.iron", category: "A", tier: 1, yield: { "currency.extracta": 2 } },
  },
  buildings: {
    "b.mine": {
      id: "b.mine",
      category: "A",
      tier: 1,
      laborSlots: 3,
      effects: [{ effect: "yield_flat", args: { currency: "currency.extracta", amount: 2 } }],
    },
  },
};

function minePlanet() {
  return {
    id: "p1",
    ownerFactionId: "fA",
    population: 20,
    colonyType: "colony",
    resources: ["map.iron"],
    surfaceBuildings: [{ id: "i0", buildingId: "b.mine" }],
    orbitalBuildings: [],
  };
}

describe("collectCourtActiveEffects — production consumer", () => {
  it("an occupied economy-portfolio seat raises materia income vs the same world with the seat empty", () => {
    const advisor = defaultNpc({
      id: "adv",
      name: "Adv",
      raceId: "r",
      councilSeat: "seat.architect",
    });
    const seated = factionWith([advisor], {
      council: {
        unlockedSeatIds: ["seat.architect"],
        lockedSeatIds: [],
        seatPortfolios: { "seat.architect": "economy" },
      },
    });
    const empty = factionWith([]);
    const seatedFx = factionScopeEffects(collectCourtActiveEffects(seated, seated.npcs, content));
    const emptyFx = factionScopeEffects(collectCourtActiveEffects(empty, empty.npcs, content));
    expect(seatedFx.some((e) => e.effect === "production_mult" && e.args?.resource === "currency.materia")).toBe(true);

    const systems = [{ ownerFactionId: "fA", planets: [minePlanet()] }];
    const boostedContent = {
      ...flowContent,
      // 1.5 so floor() cannot swallow a 1.03 catalog echo on a small base (same pattern as tech.boost).
    };
    const seatBoost = seatedFx.map((e) =>
      e.effect === "production_mult" ? { ...e, args: { ...e.args, resource: "currency.extracta", mult: 1.5 } } : e,
    );
    const before = computeFactionFlowIncome(systems, "fA", boostedContent, undefined, emptyFx);
    const after = computeFactionFlowIncome(systems, "fA", boostedContent, undefined, seatBoost);
    expect(after.income["currency.extracta"]).toBeGreaterThan(before.income["currency.extracta"]);
  });
});

describe("collectCourtActiveEffects — combat stat consumer", () => {
  it("a commander posting's faction-scope stat_mult raises power vs the same stacks without it", () => {
    const commander = defaultNpc({
      id: "cmd",
      name: "Cmd",
      raceId: "r",
      posting: { kind: "commander", forceId: "leg.1", sinceTurn: 0 },
    });
    const fac = factionWith([commander]);
    const fx = collectCourtActiveEffects(fac, fac.npcs, content);
    expect(fx.some((e) => e.effect === "stat_mult" && e.args?.stat === "damage")).toBe(true);

    const stack = { roles: ["line"], damage: 10, accuracy: 100, shields: 0, armor: 5, count: 10, hp: 100, maxHp: 100 };
    const combatContent = { combat_matchups: {}, rules: {} };
    const baseline = resolveExchange([stack], [stack], {}, combatContent);
    const boosted = resolveExchange([stack], [stack], { courtEffectsA: fx, forceIdA: "leg.1" }, combatContent);
    expect(boosted.powerA).toBeGreaterThan(baseline.powerA);
    expect(boosted.powerB).toBeCloseTo(baseline.powerB);
  });
});

describe("collectCourtActiveEffects — pop-growth consumer", () => {
  it("a pop_growth_mult trait raises this-turn population delta vs the same planet without it", () => {
    const builder = defaultNpc({
      id: "b",
      name: "Builder",
      raceId: "r",
      traitIds: ["npc_trait.regent_builder"],
    });
    const fac = factionWith([builder]);
    const fx = factionScopeEffects(collectCourtActiveEffects(fac, fac.npcs, content));
    expect(fx.some((e) => e.effect === "pop_growth_mult")).toBe(true);

    const planet = { pop: 1000, cap: 2000, growthRate: 0.1, habEff: 1, supplyFactor: 1 };
    const tickContent = { rules: { population: { maxLossPerTurn: 0.15 }, tax: { defaultMode: "sink" } }, taxes: {} };
    const before = runEconomyTick(
      [{ id: "f1", eco: defaultEconomyAccount("f1"), planets: [{ ...planet }] }],
      1,
      tickContent,
    );
    const after = runEconomyTick(
      [{ id: "f1", eco: defaultEconomyAccount("f1"), planets: [{ ...planet }], popGrowthEffects: fx }],
      1,
      tickContent,
    );
    expect(after.breakdowns.f1.planets[0].pop).toBeGreaterThan(before.breakdowns.f1.planets[0].pop);
  });
});

describe("produced court channels", () => {
  it("produces loyalty_add / stability_add / move_cost_mult", () => {
    const priest = defaultNpc({
      id: "p",
      name: "P",
      raceId: "r",
      traitIds: ["npc_trait.high_priest"],
      councilSeat: "seat.priest",
    });
    const admiral = defaultNpc({
      id: "a",
      name: "A",
      raceId: "r",
      posting: { kind: "admiral", forceId: "flt.1", sinceTurn: 0 },
    });
    const fac = factionWith([priest, admiral]);
    const fx = collectCourtActiveEffects(fac, fac.npcs, content);
    expect(fx.some((e) => e.effect === "loyalty_add")).toBe(true);
    expect(fx.some((e) => e.effect === "stability_add")).toBe(true);
    expect(fx.some((e) => e.effect === "move_cost_mult")).toBe(true);
  });
});
