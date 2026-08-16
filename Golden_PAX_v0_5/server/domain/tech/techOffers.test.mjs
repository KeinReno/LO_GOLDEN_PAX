/**
 * NOT a port — new design (TECH_TREE_2_INTEGRATION_SPEC.md Priorities 2–4).
 * GMap has no offer/reroll system.
 */
import { describe, it, expect } from "vitest";
import {
  frontierTechs,
  rollOffer,
  rerollOffer,
  ensureOffers,
  offerWeight,
  OFFER_SIZE,
  RACE_AFFINITY_WEIGHT,
} from "./techOffers.mjs";
import { defaultTechAccount } from "./techAccount.mjs";

function seqRng(values) {
  let i = 0;
  return () => {
    const v = values[i % values.length];
    i += 1;
    return v;
  };
}

function makeContent() {
  const technologies = {};
  for (let n = 1; n <= 12; n++) {
    technologies[`tech.ind.${n}`] = {
      id: `tech.ind.${n}`,
      name: `Ind ${n}`,
      direction: "industry",
      prerequisites: [],
      cost: { "currency.cognitio": 12 },
      effects: [{ effect: "unlock_tech_tier", args: { category: "A", to: 1 } }],
    };
  }
  technologies["tech.ind.1"].raceAffinity = ["race_swarm"];
  technologies["tech.mil.1"] = {
    id: "tech.mil.1",
    name: "Mil",
    direction: "military",
    prerequisites: [],
    cost: { "currency.cognitio": 12 },
    effects: [{ effect: "unlock_property", args: { property: "weapon.plasma" } }],
  };
  technologies["tech.stub"] = {
    id: "tech.stub",
    name: "Stub",
    direction: "industry",
    catalogPending: true,
    prerequisites: [],
    cost: { "currency.cognitio": 12 },
    effects: [{ effect: "production_mult", args: { resource: "currency.extracta", mult: 1.02 } }],
  };
  technologies["tech.locked"] = {
    id: "tech.locked",
    name: "Locked",
    direction: "industry",
    prerequisites: ["tech.ind.1"],
    cost: { "currency.cognitio": 12 },
    effects: [{ effect: "unlock_tech_tier", args: { category: "A", to: 2 } }],
  };
  technologies["tech.untagged"] = {
    id: "tech.untagged",
    name: "Untagged",
    prerequisites: [],
    cost: { "currency.cognitio": 12 },
    effects: [{ effect: "unlock_tech_tier", args: { category: "B", to: 2 } }],
  };
  return { technologies };
}

const swarmPlanets = [{ population: 100, raceComposition: [{ raceId: "race_swarm", percent: 100 }] }];
const humanPlanets = [{ population: 100, raceComposition: [{ raceId: "race_human", percent: 100 }] }];

describe("frontierTechs", () => {
  it("keeps direction+prereqs+not-catalogPending+not-researched, and ignores untagged techs", () => {
    const content = makeContent();
    const account = defaultTechAccount("f1");
    const frontier = frontierTechs(account, content, "industry");
    expect(frontier).toContain("tech.ind.1");
    expect(frontier).not.toContain("tech.stub");
    expect(frontier).not.toContain("tech.locked");
    expect(frontier).not.toContain("tech.untagged");
    expect(frontier).not.toContain("tech.mil.1");

    const after = { ...account, unlockedTechs: ["tech.ind.1"] };
    expect(frontierTechs(after, content, "industry")).toContain("tech.locked");
    expect(frontierTechs(after, content, "industry")).not.toContain("tech.ind.1");
  });
});

describe("rollOffer / rerollOffer / ensureOffers", () => {
  it("samples up to 3 from the frontier and allows a smaller set", () => {
    const content = makeContent();
    const account = defaultTechAccount("f1");
    const offer = rollOffer(account, content, "industry", seqRng([0, 0, 0]));
    expect(offer.candidates).toHaveLength(OFFER_SIZE);
    expect(offer.rerolled).toBe(false);
    for (const id of offer.candidates) {
      expect(id.startsWith("tech.ind.")).toBe(true);
    }

    const tiny = {
      technologies: {
        "tech.mil.1": content.technologies["tech.mil.1"],
      },
    };
    const mil = rollOffer(account, tiny, "military", () => 0);
    expect(mil.candidates).toEqual(["tech.mil.1"]);
  });

  it("reroll consumes the one-time flag and a second reroll is refused", () => {
    const content = makeContent();
    const account = defaultTechAccount("f1");
    const seeded = {
      ...account,
      currentOffers: { industry: { candidates: ["tech.ind.1", "tech.ind.2", "tech.ind.3"], rerolled: false } },
    };
    const once = rerollOffer(seeded, content, "industry", () => 0.99);
    expect(once.ok).toBe(true);
    expect(once.techAccount.currentOffers.industry.rerolled).toBe(true);
    expect(once.techAccount.currentOffers.industry.candidates).not.toEqual(["tech.ind.1", "tech.ind.2", "tech.ind.3"]);

    const twice = rerollOffer(once.techAccount, content, "industry", () => 0.5);
    expect(twice.ok).toBe(false);
    expect(twice.error).toMatch(/reroll/);
  });

  it("ensureOffers fills missing directions and regenerates a researched candidate", () => {
    const content = makeContent();
    const empty = ensureOffers(defaultTechAccount("f1"), content, { rng: () => 0 });
    expect(empty.changed).toBe(true);
    expect(empty.techAccount.currentOffers.industry.candidates.length).toBeGreaterThan(0);
    expect(empty.techAccount.currentOffers.military.candidates).toEqual(["tech.mil.1"]);

    const stale = {
      ...empty.techAccount,
      unlockedTechs: [...empty.techAccount.currentOffers.industry.candidates],
    };
    const refreshed = ensureOffers(stale, content, { rng: () => 0.5 });
    expect(refreshed.changed).toBe(true);
    for (const id of refreshed.techAccount.currentOffers.industry.candidates) {
      expect(stale.unlockedTechs).not.toContain(id);
    }
  });
});

describe("race-affinity offer weighting", () => {
  it("a Swarm-majority faction draws the swarm-tagged tech more often than a human faction (distribution, not one roll)", () => {
    const content = makeContent();
    const account = defaultTechAccount("f1");
    expect(offerWeight(content.technologies["tech.ind.1"], swarmPlanets)).toBe(RACE_AFFINITY_WEIGHT);
    expect(offerWeight(content.technologies["tech.ind.1"], humanPlanets)).toBe(1);

    const rolls = 400;
    let swarmHits = 0;
    let humanHits = 0;
    for (let i = 0; i < rolls; i++) {
      const s = rollOffer(account, content, "industry", Math.random, swarmPlanets);
      const h = rollOffer(account, content, "industry", Math.random, humanPlanets);
      if (s.candidates.includes("tech.ind.1")) swarmHits += 1;
      if (h.candidates.includes("tech.ind.1")) humanHits += 1;
    }
    expect(swarmHits).toBeGreaterThan(humanHits);
    expect(swarmHits / rolls).toBeGreaterThan(0.3);
  });
});
