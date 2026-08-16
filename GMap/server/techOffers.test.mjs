/**
 * Research offers: 3-per-direction frontier, one reroll, bypass is cost-only.
 * Run: node --test server/techOffers.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  frontierTechs,
  rollOffer,
  rerollOffer,
  ensureOffers,
  offerWeight,
  applyOfferBypass,
  techOfferAxis,
  OFFER_SIZE,
  RACE_AFFINITY_WEIGHT,
  OFFER_BYPASS_COGNITIO_MULT,
} from "./techOffers.mjs";

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
    technologies[`tech.a.${n}`] = {
      id: `tech.a.${n}`,
      name: `A ${n}`,
      category: "A",
      era: 1,
      prerequisites: [],
      cost: { "currency.cognitio": 12 },
      effects: [{ effect: "unlock_tech_tier", args: { category: "A", to: 1 } }],
    };
  }
  technologies["tech.a.1"].tags = ["race_swarm"];
  technologies["tech.d.1"] = {
    id: "tech.d.1",
    name: "Energy one",
    category: "D",
    era: 1,
    prerequisites: [],
    cost: { "currency.cognitio": 12 },
    effects: [{ effect: "unlock_property", args: { property: "fuel" } }],
  };
  technologies["tech.stub"] = {
    id: "tech.stub",
    name: "Stub",
    category: "A",
    catalogPending: true,
    prerequisites: [],
    cost: { "currency.cognitio": 12 },
    effects: [{ effect: "production_mult", args: { resource: "currency.extracta", mult: 1.02 } }],
  };
  technologies["tech.locked"] = {
    id: "tech.locked",
    name: "Locked",
    category: "A",
    prerequisites: ["tech.a.1"],
    cost: { "currency.cognitio": 12 },
    effects: [{ effect: "unlock_tech_tier", args: { category: "A", to: 2 } }],
  };
  technologies["tech.alchemy"] = {
    id: "tech.alchemy",
    name: "Alchemy",
    category: "A",
    alchemyOnly: true,
    prerequisites: [],
    cost: { "currency.cognitio": 12 },
    effects: [{ effect: "production_mult", args: { resource: "currency.extracta", mult: 1.05 } }],
  };
  technologies["tech.path.opener"] = {
    id: "tech.path.opener",
    name: "Opener",
    category: "A",
    prerequisites: [],
    cost: { "currency.cognitio": 42 },
    effects: [{ effect: "open_path", args: { pathId: "structural" } }],
  };
  technologies["tech.war"] = {
    id: "tech.war",
    name: "War",
    category: "C",
    direction: "military",
    era: 1,
    prerequisites: [],
    cost: { "currency.cognitio": 12 },
    effects: [{ effect: "stat_mult", args: { stat: "damage", mult: 1.1 } }],
  };
  return {
    technologies,
    economy_schema: {
      categories: { A: { id: "A" }, D: { id: "D" } },
    },
    tech_paths: { paths: {} },
    tech_directions: {
      order: [
        "industry",
        "military",
        "culture",
        "commerce",
        "diplomacy",
        "governance",
      ],
      directions: {
        industry: { id: "industry", label: "Индустрия", categories: ["A", "B", "C", "D", "E", "F"] },
        military: { id: "military", label: "Военное дело", tags: ["military"] },
        culture: { id: "culture", label: "Культура", iconTags: ["psionics"] },
        commerce: { id: "commerce", label: "Коммерция", iconTags: ["trade"] },
        diplomacy: { id: "diplomacy", label: "Дипломатия", iconTags: ["diplomacy"] },
        governance: { id: "governance", label: "Управление", factionTraitLocks: ["trait.technocracy"] },
      },
    },
  };
}

function eco(overrides = {}) {
  return { unlockedTechs: [], currentOffers: {}, ...overrides };
}

const swarmFac = { primaryRaceId: "race_swarm" };
const humanFac = { primaryRaceId: "race_human" };

describe("techOfferAxis", () => {
  it("maps live A–F techs to industry and drops stubs, alchemy, and path openers", () => {
    const content = makeContent();
    assert.equal(techOfferAxis(content.technologies["tech.a.1"], content), "industry");
    assert.equal(techOfferAxis(content.technologies["tech.d.1"], content), "industry");
    assert.equal(techOfferAxis(content.technologies["tech.war"], content), "military");
    assert.equal(techOfferAxis(content.technologies["tech.stub"], content), null);
    assert.equal(techOfferAxis(content.technologies["tech.alchemy"], content), null);
    assert.equal(techOfferAxis(content.technologies["tech.path.opener"], content), null);
  });
});

describe("frontierTechs", () => {
  it("groups by direction: industry gets A+D, military stays separate", () => {
    const content = makeContent();
    const account = eco();
    const industry = frontierTechs(account, content, "industry");
    assert.ok(industry.includes("tech.a.1"));
    assert.ok(industry.includes("tech.d.1"));
    assert.ok(!industry.includes("tech.stub"));
    assert.ok(!industry.includes("tech.locked"));
    assert.ok(!industry.includes("tech.alchemy"));
    assert.ok(!industry.includes("tech.war"));
    assert.ok(!industry.includes("tech.path.opener"));
    assert.ok(frontierTechs(account, content, "military").includes("tech.war"));

    const after = eco({ unlockedTechs: ["tech.a.1"] });
    assert.ok(frontierTechs(after, content, "industry").includes("tech.locked"));
    assert.ok(!frontierTechs(after, content, "industry").includes("tech.a.1"));
    assert.ok(frontierTechs(account, content, "A").includes("tech.a.1"));
  });
});

describe("rollOffer / rerollOffer / ensureOffers", () => {
  it("samples up to 3 from the frontier and allows a smaller set", () => {
    const content = makeContent();
    const account = eco();
    const offer = rollOffer(account, content, "industry", { rng: seqRng([0, 0, 0]) });
    assert.equal(offer.candidates.length, OFFER_SIZE);
    assert.equal(offer.rerolled, false);

    const tiny = {
      ...content,
      technologies: { "tech.war": content.technologies["tech.war"] },
    };
    const mil = rollOffer(account, tiny, "military", { rng: () => 0 });
    assert.deepEqual(mil.candidates, ["tech.war"]);
  });

  it("reroll consumes the one-time flag and a second reroll is refused", () => {
    const content = makeContent();
    const seeded = eco({
      currentOffers: {
        industry: { candidates: ["tech.a.1", "tech.a.2", "tech.a.3"], rerolled: false },
      },
    });
    const once = rerollOffer(seeded, content, "industry", { rng: () => 0.99 });
    assert.equal(once.ok, true);
    assert.equal(once.eco.currentOffers.industry.rerolled, true);
    assert.notDeepEqual(once.eco.currentOffers.industry.candidates, [
      "tech.a.1",
      "tech.a.2",
      "tech.a.3",
    ]);

    const twice = rerollOffer(once.eco, content, "industry", { rng: () => 0.5 });
    assert.equal(twice.ok, false);
    assert.match(String(twice.error), /reroll/);
  });

  it("ensureOffers fills missing directions and regenerates a researched candidate", () => {
    const content = makeContent();
    const empty = ensureOffers(eco(), content, { rng: () => 0 });
    assert.equal(empty.changed, true);
    assert.ok(empty.eco.currentOffers.industry.candidates.length > 0);
    assert.deepEqual(empty.eco.currentOffers.military.candidates, ["tech.war"]);

    const stale = eco({
      unlockedTechs: [...empty.eco.currentOffers.industry.candidates],
      currentOffers: empty.eco.currentOffers,
    });
    const refreshed = ensureOffers(stale, content, { rng: () => 0.5 });
    assert.equal(refreshed.changed, true);
    for (const id of refreshed.eco.currentOffers.industry.candidates) {
      assert.ok(!stale.unlockedTechs.includes(id));
    }
  });

  it("legacy A–F reroll maps onto industry", () => {
    const content = makeContent();
    const seeded = eco({
      currentOffers: {
        A: { candidates: ["tech.a.1", "tech.a.2", "tech.a.3"], rerolled: false },
      },
    });
    const once = rerollOffer(seeded, content, "A", { rng: () => 0.99 });
    assert.equal(once.ok, true);
    assert.equal(once.eco.currentOffers.industry.rerolled, true);
    assert.equal(once.eco.currentOffers.A, undefined);
  });
});

describe("offer bypass + race weight", () => {
  it("multiplies only cognitio when bypassing the offer", () => {
    const cost = applyOfferBypass(
      { "currency.cognitio": 10, "currency.metal": 4 },
      true,
    );
    assert.equal(cost["currency.cognitio"], Math.ceil(10 * OFFER_BYPASS_COGNITIO_MULT));
    assert.equal(cost["currency.metal"], 4);
    assert.deepEqual(applyOfferBypass({ "currency.cognitio": 10 }, false), {
      "currency.cognitio": 10,
    });
  });

  it("weights a matching primary race higher than a non-matching one", () => {
    const content = makeContent();
    assert.equal(offerWeight(content.technologies["tech.a.1"], swarmFac), RACE_AFFINITY_WEIGHT);
    assert.equal(offerWeight(content.technologies["tech.a.1"], humanFac), 1);
  });
});
