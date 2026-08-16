/**
 * Direction mapping + offer grouping (TECH_TREE_2 P2).
 * Run: node --test server/techDirections.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  listDirectionIds,
  resolveTechDirection,
  normalizeOfferAxis,
  groupOffersByDirection,
  migrateOfferKeys,
  categoriesForDirection,
  directionLabel,
} from "./techDirections.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const liveDirections = JSON.parse(
  readFileSync(join(root, "content/core/tech_directions.json"), "utf8"),
);

const SIX = [
  "industry",
  "military",
  "culture",
  "commerce",
  "diplomacy",
  "governance",
];

function mappingContent(extraDirs = {}) {
  return {
    tech_directions: {
      order: SIX,
      directions: {
        ...liveDirections.directions,
        ...extraDirs,
      },
    },
  };
}

describe("tech_directions.json", () => {
  it("ships the six player-facing directions in order", () => {
    assert.deepEqual(liveDirections.order, SIX);
    for (const id of SIX) {
      assert.equal(liveDirections.directions[id].id, id);
      assert.ok(liveDirections.directions[id].label);
    }
    assert.deepEqual(liveDirections.directions.industry.categories, [
      "A",
      "B",
      "C",
      "D",
      "E",
      "F",
    ]);
  });
});

describe("resolveTechDirection", () => {
  const content = mappingContent();

  it("maps A–F economy techs to industry without a direction field", () => {
    assert.equal(resolveTechDirection({ category: "A" }, content), "industry");
    assert.equal(resolveTechDirection({ category: "F" }, content), "industry");
    assert.deepEqual(categoriesForDirection("industry", content), [
      "A",
      "B",
      "C",
      "D",
      "E",
      "F",
    ]);
  });

  it("lets explicit direction win over category", () => {
    assert.equal(
      resolveTechDirection({ category: "C", direction: "military" }, content),
      "military",
    );
  });

  it("maps trait locks / tags / iconTags to non-industry directions", () => {
    assert.equal(
      resolveTechDirection(
        { category: "C", factionTraitLock: "trait.war_economy" },
        content,
      ),
      "military",
    );
    assert.equal(
      resolveTechDirection({ category: "F", iconTag: "psionics" }, content),
      "culture",
    );
    assert.equal(
      resolveTechDirection({ category: "C", iconTag: "trade" }, content),
      "commerce",
    );
    assert.equal(
      resolveTechDirection({ category: "F", iconTag: "diplomacy" }, content),
      "diplomacy",
    );
    assert.equal(
      resolveTechDirection(
        { category: "F", factionTraitLock: "trait.technocracy" },
        content,
      ),
      "governance",
    );
  });

  it("does not hardcode tech ids", () => {
    const src = readFileSync(join(root, "server/techDirections.mjs"), "utf8");
    assert.equal(/tech\.[a-z0-9_.]+/.test(src), false);
  });
});

describe("groupOffersByDirection", () => {
  const content = mappingContent();

  it("folds legacy A–F offer keys into industry and keeps other directions", () => {
    const grouped = groupOffersByDirection(
      {
        A: { candidates: ["tech.a.1", "tech.a.2"], rerolled: false },
        D: { candidates: ["tech.d.1"], rerolled: true },
        military: { candidates: ["tech.war"], rerolled: false },
      },
      content,
    );
    assert.deepEqual(listDirectionIds(content), SIX);
    assert.ok(grouped.industry.candidates.includes("tech.a.1"));
    assert.ok(grouped.industry.candidates.includes("tech.d.1"));
    assert.equal(grouped.industry.rerolled, true);
    assert.deepEqual(grouped.military.candidates, ["tech.war"]);
    assert.deepEqual(grouped.culture.candidates, []);
    assert.equal(normalizeOfferAxis("A", content), "industry");
    assert.equal(normalizeOfferAxis("military", content), "military");
    assert.equal(directionLabel("industry", content), "Индустрия");
  });

  it("migrateOfferKeys rewrites persisted A–F keys", () => {
    const eco = {
      currentOffers: {
        A: { candidates: ["tech.a.1"], rerolled: false },
        B: { candidates: ["tech.b.1"], rerolled: false },
      },
    };
    assert.equal(migrateOfferKeys(eco, content), true);
    assert.ok(eco.currentOffers.industry.candidates.includes("tech.a.1"));
    assert.equal(eco.currentOffers.A, undefined);
  });

  it("re-buckets a military-tagged candidate out of a legacy A offer", () => {
    const withTechs = {
      ...content,
      technologies: {
        "tech.a.1": { id: "tech.a.1", category: "A" },
        "tech.war": { id: "tech.war", category: "C", factionTraitLock: "trait.war_economy" },
      },
    };
    const grouped = groupOffersByDirection(
      { A: { candidates: ["tech.a.1", "tech.war"], rerolled: false } },
      withTechs,
    );
    assert.ok(grouped.industry.candidates.includes("tech.a.1"));
    assert.ok(!grouped.industry.candidates.includes("tech.war"));
    assert.deepEqual(grouped.military.candidates, ["tech.war"]);
  });
});

describe("live content direction field", () => {
  it("only uses the six player-facing direction ids", () => {
    const techs = JSON.parse(
      readFileSync(join(root, "content/core/technologies.json"), "utf8"),
    );
    const allowed = new Set(SIX);
    for (const def of Object.values(techs)) {
      if (!def || typeof def !== "object" || !def.direction) continue;
      assert.ok(allowed.has(def.direction), `${def.id} direction=${def.direction}`);
    }
  });
});
