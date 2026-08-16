import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import {
  collectCultureEffects as newCulture,
  collectFaithEffects as newFaith,
  resolvePlanetCultureId as newCultureId,
  resolvePlanetFaithShares as newFaithShares,
  primaryRaceFromComposition as newPrimaryRace,
} from "./cultureFaith.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const oldModulePath = path.resolve(__dirname, "../../../../GMap/server/cultureFaith.mjs");

const content = {
  cultures: {
    cultures: {
      "culture.baseline": { id: "culture.baseline", name: "Baseline", effects: [{ effect: "loyalty_add", args: { amount: 1 } }], compatibleRaces: ["race_human"] },
    },
  },
  faiths: {
    faiths: {
      "faith.secular": { id: "faith.secular", name: "Secular", effects: [{ effect: "production_mult", args: { mult: 1.1 } }], taboo_properties: ["toxic_industry"] },
    },
  },
  economy_schema: { properties: { toxic_industry: { label: "Toxic Industry" } } },
};

describe("cultureFaith parity with GMap", () => {
  it("collectCultureEffects matches, including the race-mismatch penalty", async () => {
    const { collectCultureEffects: oldFn } = await import(oldModulePath);
    expect(newCulture(content, "culture.baseline", { raceId: "race_human" })).toEqual(oldFn(content, "culture.baseline", { raceId: "race_human" }));
    expect(newCulture(content, "culture.baseline", { raceId: "race_avian" })).toEqual(oldFn(content, "culture.baseline", { raceId: "race_avian" }));
    expect(newCulture(content, "culture.unknown")).toEqual(oldFn(content, "culture.unknown"));
  });

  it("collectFaithEffects matches, including the taboo-property penalty", async () => {
    const { collectFaithEffects: oldFn } = await import(oldModulePath);
    const shares = [{ faithId: "faith.secular", percent: 100 }];

    const techAccountNoToxic = { unlockedProperties: [] };
    expect(newFaith(content, shares, techAccountNoToxic)).toEqual(oldFn(content, shares, techAccountNoToxic));

    const techAccountWithToxic = { unlockedProperties: ["toxic_industry"] };
    expect(newFaith(content, shares, techAccountWithToxic)).toEqual(oldFn(content, shares, techAccountWithToxic));
  });

  it("resolvePlanetCultureId / resolvePlanetFaithShares / primaryRaceFromComposition match", async () => {
    const old = await import(oldModulePath);

    expect(newCultureId({ cultureId: "culture.x" }, {})).toBe(old.resolvePlanetCultureId({ cultureId: "culture.x" }, {}));
    expect(newCultureId({}, { defaultCultureId: "culture.y" })).toBe(old.resolvePlanetCultureId({}, { defaultCultureId: "culture.y" }));
    expect(newCultureId({}, {})).toBe(old.resolvePlanetCultureId({}, {}));

    expect(newFaithShares({ faithShare: [{ faithId: "a", percent: 50 }] }, {})).toEqual(old.resolvePlanetFaithShares({ faithShare: [{ faithId: "a", percent: 50 }] }, {}));
    expect(newFaithShares({}, { primaryFaith: "faith.x" })).toEqual(old.resolvePlanetFaithShares({}, { primaryFaith: "faith.x" }));
    expect(newFaithShares({}, {})).toEqual(old.resolvePlanetFaithShares({}, {}));

    const comp = [{ raceId: "a", percent: 30 }, { raceId: "b", percent: 70 }];
    expect(newPrimaryRace(comp)).toBe(old.primaryRaceFromComposition(comp));
  });
});
