import { describe, it, expect } from "vitest";
import { researchTech } from "./researchTech.mjs";
import { defaultTechAccount } from "./techAccount.mjs";
import { getContent } from "../../contentLoader.mjs";

const content = {
  technologies: {
    "tech.a": {
      id: "tech.a",
      name: "A",
      cost: { "currency.cognitio": 20 },
      prerequisites: [],
      effects: [{ effect: "unlock_tech_tier", args: { category: "A", to: 2 } }],
    },
    "tech.b": {
      id: "tech.b",
      name: "B",
      cost: { "currency.cognitio": 40 },
      prerequisites: ["tech.a"],
      effects: [],
    },
    "tech.swarm_only": {
      id: "tech.swarm_only",
      name: "Swarm-only",
      cost: { "currency.cognitio": 10 },
      prerequisites: [],
      effects: [],
      raceLock: "race_swarm",
    },
    "tech.stub": {
      id: "tech.stub",
      name: "Placeholder",
      cost: { "currency.cognitio": 5 },
      prerequisites: [],
      effects: [{ effect: "production_mult", args: { resource: "currency.extracta", mult: 1.02 } }],
      catalogPending: true,
    },
  },
  races: { race_swarm: { name: "Swarm" } },
};

describe("researchTech", () => {
  it("unlocks a tech, spends its cost, and applies its effects", () => {
    const account = defaultTechAccount("f1");
    const stocks = { "currency.cognitio": 50 };

    const result = researchTech(account, stocks, "tech.a", content, { turn: 2 });

    expect(result.ok).toBe(true);
    expect(result.techAccount.unlockedTechs).toEqual(["tech.a"]);
    expect(result.techAccount.techTiers.A).toBe(2);
    expect(result.stocks["currency.cognitio"]).toBe(30);
    expect(result.journal).toHaveLength(1);
  });

  it("blocks researching an already-unlocked tech", () => {
    const account = { ...defaultTechAccount("f1"), unlockedTechs: ["tech.a"] };
    const result = researchTech(account, { "currency.cognitio": 50 }, "tech.a", content);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/already/);
  });

  it("blocks researching without prerequisites unlocked", () => {
    const account = defaultTechAccount("f1");
    const result = researchTech(account, { "currency.cognitio": 999 }, "tech.b", content);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/tech: A|requires/);
  });

  it("blocks researching without enough cognitio, spending nothing", () => {
    const account = defaultTechAccount("f1");
    const stocks = { "currency.cognitio": 5 };
    const result = researchTech(account, stocks, "tech.a", content);
    expect(result.ok).toBe(false);
    expect(stocks["currency.cognitio"]).toBe(5);
  });

  it("rejects an unknown tech id", () => {
    const account = defaultTechAccount("f1");
    const result = researchTech(account, {}, "tech.does_not_exist", content);
    expect(result.ok).toBe(false);
  });

  it("blocks a raceLock tech without enough of that race's population, allows it once met (2026-08-14 restoration)", () => {
    const account = defaultTechAccount("f1");
    const stocks = { "currency.cognitio": 50 };
    const noSwarm = researchTech(account, stocks, "tech.swarm_only", content, {
      factionPlanets: [{ population: 100, raceComposition: [{ raceId: "race_human", percent: 100 }] }],
    });
    expect(noSwarm.ok).toBe(false);
    expect(noSwarm.error).toMatch(/race|30/);

    const withSwarm = researchTech(account, stocks, "tech.swarm_only", content, {
      factionPlanets: [{ population: 100, raceComposition: [{ raceId: "race_swarm", percent: 50 }] }],
    });
    expect(withSwarm.ok).toBe(true);
  });

  it("refuses a catalogPending placeholder tech outright (2026-08-14, see notes/2026-08-14-tech-tree-audit.md — not a GMap behavior, this project's own decision)", () => {
    const account = defaultTechAccount("f1");
    const result = researchTech(account, { "currency.cognitio": 50 }, "tech.stub", content);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/placeholder/);
  });

  it("real content: exactly the 3 known raceLock techs are locked, the ~387 catalogPending techs are all refused", () => {
    const realContent = getContent(["core"]);
    const account = defaultTechAccount("f1");
    const raceLocked = Object.values(realContent.technologies).filter((t) => t.raceLock);
    expect(raceLocked.length).toBeGreaterThan(0);
    for (const def of raceLocked) {
      const result = researchTech(account, { "currency.cognitio": 9999 }, def.id, realContent, { factionPlanets: [] });
      expect(result.ok).toBe(false);
    }
    const stub = Object.values(realContent.technologies).find((t) => t.catalogPending);
    expect(stub).toBeTruthy();
    expect(researchTech(account, { "currency.cognitio": 9999 }, stub.id, realContent).ok).toBe(false);
  });

  it("offer path spends listed cognitio; bypass multiplies only the cognitio portion (NOT a port)", () => {
    const offerContent = {
      technologies: {
        "tech.offer_a": {
          id: "tech.offer_a",
          name: "A",
          direction: "industry",
          prerequisites: [],
          cost: { "currency.cognitio": 10, "currency.metal": 4 },
          effects: [],
        },
        "tech.offer_b": {
          id: "tech.offer_b",
          name: "B",
          direction: "industry",
          prerequisites: [],
          cost: { "currency.cognitio": 10 },
          effects: [],
        },
      },
    };
    const base = {
      ...defaultTechAccount("f1"),
      currentOffers: { industry: { candidates: ["tech.offer_a"], rerolled: false } },
    };
    const listed = researchTech(base, { "currency.cognitio": 50, "currency.metal": 10 }, "tech.offer_a", offerContent, {
      rng: () => 0,
    });
    expect(listed.ok).toBe(true);
    expect(listed.offerBypass).toBe(false);
    expect(listed.stocks["currency.cognitio"]).toBe(40);
    expect(listed.stocks["currency.metal"]).toBe(6);
    expect(listed.techAccount.currentOffers.industry.candidates).not.toContain("tech.offer_a");

    const bypass = researchTech(base, { "currency.cognitio": 50, "currency.metal": 10 }, "tech.offer_b", offerContent, {
      rng: () => 0,
    });
    expect(bypass.ok).toBe(true);
    expect(bypass.offerBypass).toBe(true);
    expect(bypass.stocks["currency.cognitio"]).toBe(35); // ceil(10 * 1.5) = 15
  });
});
