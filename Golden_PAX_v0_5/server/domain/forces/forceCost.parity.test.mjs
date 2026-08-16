import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { produceForceCost as newProduceForceCost, forceUpkeepRates as newForceUpkeepRates } from "./forceCost.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const oldModulePath = path.resolve(__dirname, "../../../../GMap/server/forceEconomy.mjs");
const oldContentLoaderPath = path.resolve(__dirname, "../../../../GMap/server/contentLoader.mjs");

/**
 * GMap's produceForceCost/forceUpkeepRates read content via an internal
 * bal() -> getContent() call; this port takes economyBalance explicitly
 * (CLAUDE.md rule 3: no hidden content-loading in domain functions) — same
 * formula, reshaped signature, diffed here against GMap's real content.
 */
describe("produceForceCost / forceUpkeepRates parity with GMap (real content)", () => {
  it("matches across ship/unit kinds, tiers, and explicit-cost defs", async () => {
    const { produceForceCost: oldFn } = await import(oldModulePath);
    const { getContent } = await import(oldContentLoaderPath);
    const content = getContent(["core"]);
    const bal = content.economy_balance;

    for (const kind of ["ship", "unit"]) {
      for (const tier of [1, 3, 7, 10]) {
        for (const count of [1, 4]) {
          const def = { tier };
          expect(newProduceForceCost(bal, kind, def, count)).toEqual(oldFn(kind, def, count));
        }
      }
    }

    const explicitCostDef = { cost: { "currency.metal": 12, "currency.supply": 5 } };
    expect(newProduceForceCost(bal, "unit", explicitCostDef, 3)).toEqual(oldFn("unit", explicitCostDef, 3));
  });

  it("real content defs (ship.scout, unit.militia) match", async () => {
    const { produceForceCost: oldFn } = await import(oldModulePath);
    const { getContent } = await import(oldContentLoaderPath);
    const content = getContent(["core"]);
    const bal = content.economy_balance;

    expect(newProduceForceCost(bal, "ship", content.ships["ship.scout"], 1)).toEqual(oldFn("ship", content.ships["ship.scout"], 1));
    expect(newProduceForceCost(bal, "unit", content.units["unit.militia"], 2)).toEqual(oldFn("unit", content.units["unit.militia"], 2));
  });

  it("forceUpkeepRates matches across ship/legion kinds and tiers", async () => {
    const { forceUpkeepRates: oldFn } = await import(oldModulePath);
    const { getContent } = await import(oldContentLoaderPath);
    const content = getContent(["core"]);
    const bal = content.economy_balance;

    for (const kind of ["ship", "unit"]) {
      for (const tier of [1, 5, 10]) {
        expect(newForceUpkeepRates(bal, kind, tier, 20)).toEqual(oldFn(kind, tier, 20));
      }
    }
  });
});
