/**
 * First integration scenario (see this folder's README): a multi-faction
 * turn touching every ported domain in sequence, using real content — the
 * kind of cross-domain regression a per-domain unit test can't catch
 * (e.g. domain/tech and domain/court sharing one techAccount.unlockedProperties
 * list, per domain/court/civicAccount.mjs's header).
 */
import { describe, it, expect } from "vitest";
import { getContent } from "../../server/contentLoader.mjs";
import { runEconomyTick } from "../../server/domain/economy/economyTick.mjs";
import { defaultEconomyAccount } from "../../server/domain/economy/ledgerAccount.mjs";
import { researchTech } from "../../server/domain/tech/researchTech.mjs";
import { defaultTechAccount } from "../../server/domain/tech/techAccount.mjs";
import { resolveExchange } from "../../server/domain/combat/resolveExchange.mjs";
import { tickOpinions } from "../../server/domain/diplomacy/opinion.mjs";
import { defaultDiplomacyAccount } from "../../server/domain/diplomacy/diplomacyAccount.mjs";
import { runCivicTick } from "../../server/domain/court/civicTick.mjs";
import { defaultCivicAccount } from "../../server/domain/court/civicAccount.mjs";
import { rollRecurringQuests, selectYearlyQuestPool } from "../../server/domain/quests/questTick.mjs";
import { catalogQuestToInstance } from "../../server/domain/quests/quest.mjs";

const content = getContent(["core"]);

function pickResearchableTech() {
  return Object.values(content.technologies).find(
    (t) => (!t.prerequisites || !t.prerequisites.length) && Number(t.cost?.["currency.cognitio"]) > 0,
  );
}

describe("turn cycle: economy -> tech -> combat -> diplomacy -> court -> quests, 3 factions", () => {
  it("stays internally consistent across every domain for one turn", () => {
    const turn = 7;
    const factionIds = ["fA", "fB", "fC"];

    // --- Economy: each faction earns and gets taxed ---
    const economyFactions = factionIds.map((id) => ({
      id,
      eco: defaultEconomyAccount(id, content),
      categoryIncome: { "currency.cognitio": 500 },
      planets: [{ pop: 200, cap: 500, growthRate: 0.05, habEff: 1, supplyFactor: 1 }],
    }));
    const econResult = runEconomyTick(economyFactions, turn, content);
    expect(Object.keys(econResult.breakdowns)).toEqual(factionIds);
    for (const id of factionIds) {
      expect(econResult.breakdowns[id].deficit).toBe("ok");
      expect(economyFactions.find((f) => f.id === id).eco.stocks["currency.cognitio"]).toBeGreaterThan(500);
    }

    // --- Tech: fA spends the cognitio it just earned ---
    const techDef = pickResearchableTech();
    expect(techDef).toBeTruthy();
    const fAEco = economyFactions[0].eco;
    const techAccount = defaultTechAccount("fA");
    if (techDef.direction) {
      techAccount.currentOffers = { [techDef.direction]: { candidates: [techDef.id], rerolled: false } };
    }
    const techResult = researchTech(techAccount, fAEco.stocks, techDef.id, content, { turn });
    expect(techResult.ok).toBe(true);
    expect(techResult.techAccount.unlockedTechs).toContain(techDef.id);
    expect(techResult.stocks["currency.cognitio"]).toBe(fAEco.stocks["currency.cognitio"] - Number(techDef.cost["currency.cognitio"]));

    // --- Court: fA's civic tick shares the SAME tech account tech just produced ---
    const civicResult = runCivicTick(
      [
        {
          id: "fA",
          civicAccount: { ...defaultCivicAccount(), civicScores: { trade: 250, culture: 0 } },
          techAccount: techResult.techAccount,
          inputs: { marketVol: 10, treatyCount: 0, cultureMetrics: { cultureShare: 0, avgLoyalty: 50, faithShare: 0 } },
        },
      ],
      content,
    );
    // fA's post-civic-tick techAccount must still carry the tech it researched a moment ago —
    // proves domain/tech and domain/court are reading/writing the same account shape, not two drifting copies.
    expect(civicResult.factions[0].techAccount.unlockedTechs).toContain(techDef.id);

    // --- Combat: fA (economically ahead, larger force) vs fB ---
    const stackA = [{ roles: ["line"], damage: 80, accuracy: 90, armor: 10, shields: 10, count: 30, hp: 100, maxHp: 100 }];
    const stackB = [{ roles: ["screen"], damage: 20, accuracy: 70, armor: 5, shields: 5, count: 15, hp: 60, maxHp: 60 }];
    const combatResult = resolveExchange(stackA, stackB, { factionIdA: "fA", factionIdB: "fB" }, content);
    expect(combatResult.ok).toBe(true);
    expect(["win_a", "draw"]).toContain(combatResult.outcome);

    // --- Diplomacy: opinions move for all 3 factions given fA/fB are now at war ---
    const diploFactions = factionIds.map((id) => ({ id, diplomacy: defaultDiplomacyAccount() }));
    const relations = { "fA|fB": "war", "fA|fC": "alliance" };
    const diploResult = tickOpinions(diploFactions, relations, content);
    const fA = diploResult.factions.find((f) => f.id === "fA");
    expect(fA.diplomacy.opinions.fB).toBeLessThan(0);
    expect(fA.diplomacy.opinions.fC).toBeGreaterThan(0);

    // --- Quests: fC rolls its yearly pool from the real catalog ---
    const { count } = rollRecurringQuests();
    const ctx = { era: 1, warCount: 0, hasRefugees: false, borderWithWar: false, hasRace: () => false, hasBuilding: () => false, lowLoyaltyRace: () => false, arcActive: () => false };
    const picked = selectYearlyQuestPool(Object.values(content.yearly_quests), ctx, count);
    const quests = picked.map((def) => catalogQuestToInstance(def, "fC", null, turn, turn + 1));
    expect(quests).toHaveLength(count);
    expect(quests.every((q) => q.sourceFactionId === "fC")).toBe(true);
  });

  it("does not assume exactly one or two factions anywhere in the chain (5 factions)", () => {
    const turn = 1;
    const factionIds = Array.from({ length: 5 }, (_, i) => `f${i}`);

    const economyFactions = factionIds.map((id) => ({ id, eco: defaultEconomyAccount(id, content) }));
    expect(Object.keys(runEconomyTick(economyFactions, turn, content).breakdowns)).toHaveLength(5);

    const diploFactions = factionIds.map((id) => ({ id, diplomacy: defaultDiplomacyAccount() }));
    expect(tickOpinions(diploFactions, {}, content).factions).toHaveLength(5);

    const civicFactions = factionIds.map((id) => ({
      id,
      civicAccount: defaultCivicAccount(),
      techAccount: defaultTechAccount(id),
      inputs: { marketVol: 0, treatyCount: 0, cultureMetrics: { cultureShare: 0, avgLoyalty: 0, faithShare: 0 } },
    }));
    expect(runCivicTick(civicFactions, content).factions).toHaveLength(5);
  });
});
