/**
 * Behavior tests: tradeDelta/cultureDelta are module-private in GMap/
 * server/civicTick.mjs (re-derived from reading that file); tickFactionCivic/
 * runCivicTick are this port's reshaping of runCivicTick to take caller-
 * supplied inputs instead of walking a world/ledger (see this file's and
 * README.md's "Status" section for why).
 */
import { describe, it, expect } from "vitest";
import { tradeDelta, cultureDelta, tickFactionCivic, runCivicTick } from "./civicTick.mjs";
import { defaultCivicAccount } from "./civicAccount.mjs";
import { defaultTechAccount } from "../tech/techAccount.mjs";

const content = {
  civic_paths: {
    scoring: { trade: { marketVolumeWeight: 1, treatyWeight: 50 }, culture: { cultureShareWeight: 50, loyaltyWeight: 1, faithShareWeight: 30 } },
    thresholds: { trade: { "law.open_markets": 50 }, culture: {} },
    paths: { trade: { id: "trade", scoreKey: "trade", unlocks: [{ kind: "law", id: "law.open_markets" }] }, culture: { id: "culture", scoreKey: "culture", unlocks: [] } },
  },
};

describe("tradeDelta", () => {
  it("weights market volume and treaty count", () => {
    expect(tradeDelta(10, 2, { marketVolumeWeight: 1, treatyWeight: 50 })).toMatchObject({ delta: 110, marketVol: 10, treaties: 2 });
  });
});

describe("cultureDelta", () => {
  it("weights culture share, loyalty, and faith share", () => {
    const result = cultureDelta({ cultureShare: 0.5, avgLoyalty: 60, faithShare: 0.2 }, { cultureShareWeight: 50, loyaltyWeight: 1, faithShareWeight: 30 });
    // sharePts = floor(0.5*100*50)=2500, loyaltyPts=floor(60*1)=60, faithPts=floor(0.2*100*30)=600
    expect(result.delta).toBe(2500 + 60 + 600);
  });
});

describe("tickFactionCivic", () => {
  it("accumulates score and unlocks a law once its threshold is crossed", () => {
    const civicAccount = defaultCivicAccount();
    const techAccount = defaultTechAccount("f1");
    const inputs = { marketVol: 60, treatyCount: 0, cultureMetrics: { cultureShare: 0, avgLoyalty: 0, faithShare: 0 } };

    const result = tickFactionCivic(civicAccount, techAccount, inputs, content);

    expect(result.civicAccount.civicScores.trade).toBe(60);
    expect(result.civicAccount.laws).toContain("law.open_markets");
    expect(result.journal.some((e) => e.type === "civic_unlock")).toBe(true);
  });

  it("never decreases score from a negative-delta tick", () => {
    const civicAccount = { ...defaultCivicAccount(), civicScores: { trade: 100, culture: 0 } };
    const techAccount = defaultTechAccount("f1");
    const inputs = { marketVol: -50, treatyCount: 0, cultureMetrics: { cultureShare: 0, avgLoyalty: 0, faithShare: 0 } };
    const result = tickFactionCivic(civicAccount, techAccount, inputs, content);
    expect(result.civicAccount.civicScores.trade).toBe(100);
  });
});

describe("runCivicTick", () => {
  it("does not assume a fixed number of factions", () => {
    expect(runCivicTick([], content).factions).toEqual([]);
    const many = Array.from({ length: 5 }, (_, i) => ({
      id: `f-${i}`,
      civicAccount: defaultCivicAccount(),
      techAccount: defaultTechAccount(`f-${i}`),
      inputs: { marketVol: 0, treatyCount: 0, cultureMetrics: { cultureShare: 0, avgLoyalty: 0, faithShare: 0 } },
    }));
    expect(runCivicTick(many, content).factions).toHaveLength(5);
  });
});
