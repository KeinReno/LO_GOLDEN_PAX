import { describe, it, expect } from "vitest";
import { syncTreatiesFromEdge, breakTreaty, collectTreatyEffects, bumpOpinion } from "./treaties.mjs";
import { defaultDiplomacyAccount } from "./diplomacyAccount.mjs";

function faction(id) {
  return { id, diplomacy: defaultDiplomacyAccount() };
}

describe("syncTreatiesFromEdge", () => {
  it("adds a mirrored treaty record to both factions", () => {
    const stances = { alliance: { effects: [{ effect: "production_mult", args: { mult: 1.1 } }] } };
    const { factionA, factionB } = syncTreatiesFromEdge(faction("fA"), faction("fB"), "alliance", 5, stances);

    expect(factionA.diplomacy.treaties).toHaveLength(1);
    expect(factionA.diplomacy.treaties[0]).toMatchObject({ type: "alliance", withFactionId: "fB" });
    expect(factionB.diplomacy.treaties[0]).toMatchObject({ type: "alliance", withFactionId: "fA" });
  });

  it("relation 'neutral' clears any existing treaty without adding a new one", () => {
    const withTreaty = { ...faction("fA"), diplomacy: { ...defaultDiplomacyAccount(), treaties: [{ id: "old", withFactionId: "fB" }] } };
    const { factionA } = syncTreatiesFromEdge(withTreaty, faction("fB"), "neutral", 5, {});
    expect(factionA.diplomacy.treaties).toEqual([]);
  });

  it("political and economic relations coexist on the same pair (two-track model)", () => {
    const stances = {
      alliance: { track: "political", effects: [{ effect: "combat_assist" }] },
      currency_union: { track: "economic", effects: [] },
    };
    const first = syncTreatiesFromEdge(faction("fA"), faction("fB"), "alliance", 1, stances);
    const { factionA, factionB } = syncTreatiesFromEdge(first.factionA, first.factionB, "currency_union", 2, stances);
    expect(factionA.diplomacy.treaties.map((t) => t.type).sort()).toEqual(["alliance", "currency_union"]);
    expect(factionB.diplomacy.treaties.map((t) => t.type).sort()).toEqual(["alliance", "currency_union"]);
    const replaced = syncTreatiesFromEdge(factionA, factionB, "currency_exchange", 3, {
      ...stances,
      currency_exchange: { track: "economic", effects: [] },
    });
    expect(replaced.factionA.diplomacy.treaties.map((t) => t.type).sort()).toEqual(["alliance", "currency_exchange"]);
  });
});

describe("breakTreaty", () => {
  it("removes the treaty, hits the breaker's opinion, and hits third parties' opinion of the breaker", () => {
    const stances = { alliance: {} };
    const factions = [faction("fA"), faction("fB"), faction("fC")];
    const { factionA, factionB } = syncTreatiesFromEdge(factions[0], factions[1], "alliance", 1, stances);
    const withTreaty = [factionA, factionB, factions[2]];

    const result = breakTreaty(withTreaty, "fA", "fB", 5, stances);
    const a = result.find((f) => f.id === "fA");
    const b = result.find((f) => f.id === "fB");
    const c = result.find((f) => f.id === "fC");

    expect(a.diplomacy.treaties).toEqual([]);
    expect(a.diplomacy.lastBrokenTreatyTurn).toBe(5);
    expect(b.diplomacy.opinions.fA).toBeLessThan(0);
    expect(c.diplomacy.opinions.fA).toBeLessThan(0);
  });
});

describe("collectTreatyEffects (catalog-lookup path)", () => {
  it("resolves effects from the stances catalog when a treaty has no explicit effects", () => {
    const stances = { trade: { effects: [{ effect: "production_mult", args: { mult: 1.05 } }] } };
    const f = { id: "fA", diplomacy: { treaties: [{ id: "t1", type: "trade", withFactionId: "fB" }] } };
    const effects = collectTreatyEffects(f, stances);
    expect(effects).toEqual([{ effect: "production_mult", args: { mult: 1.05 }, source: { kind: "treaty", id: "t1", label: "trade" } }]);
  });
});

describe("bumpOpinion", () => {
  it("adds the delta and logs a gift history entry", () => {
    const result = bumpOpinion(faction("fA"), "fB", 10, 3, "Дар");
    expect(result.diplomacy.opinions.fB).toBe(10);
    expect(result.diplomacy.history).toHaveLength(1);
    expect(result.diplomacy.history[0]).toMatchObject({ type: "gift", withFactionId: "fB", opinionDelta: 10 });
  });

  it("caps history at 40 entries, matching GMap's HISTORY_CAP, dropping the oldest first", () => {
    let f = faction("fA");
    for (let i = 0; i < 45; i++) {
      f = bumpOpinion(f, "fB", 1, i, `gift ${i}`);
    }
    expect(f.diplomacy.history).toHaveLength(40);
    expect(f.diplomacy.history[0].label).toBe("gift 5");
    expect(f.diplomacy.history.at(-1).label).toBe("gift 44");
  });
});
