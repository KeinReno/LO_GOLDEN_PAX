/**
 * True cross-repo parity for clampOpinion and computeTargetOpinion (both
 * exported and pure in GMap/server/opinionTick.mjs, aside from reading a
 * `world` object for relations/faction list — reconstructed here from the
 * same relations.mjs table + faction-id list this port uses). stepOpinion
 * is module-private in GMap (behavior-tested in opinion.test.mjs instead).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { clampOpinion as newClamp, computeTargetOpinion as newTarget } from "./opinion.mjs";
import { setRelation } from "./relations.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const oldModulePath = path.resolve(__dirname, "../../../../GMap/server/opinionTick.mjs");

/** Convert this port's relations table into GMap's world.diplomacy edge array. */
function relationsToWorldEdges(relations) {
  return Object.entries(relations).map(([key, relation]) => {
    const [aId, bId] = key.split("|");
    return { aId, bId, relation };
  });
}

describe("clampOpinion / computeTargetOpinion parity with GMap", () => {
  it("clampOpinion matches across the value range", async () => {
    const { clampOpinion: oldClamp } = await import(oldModulePath);
    for (const v of [-500, -100, -1, 0, 1, 50.6, 100, 500, NaN, undefined]) {
      expect(newClamp(v)).toBe(oldClamp(v));
    }
  });

  it("computeTargetOpinion matches across relation/trait/shared-enemy scenarios", async () => {
    const { computeTargetOpinion: oldTarget } = await import(oldModulePath);

    const content = {
      races: { race_human: { xenorelations: { race_avian: -1 } }, race_avian: {} },
      faction_traits: { traits: { "trait.warmonger": { diplomacyBias: -5, effects: [] } } },
    };

    const factionA = { id: "fA", primaryRaceId: "race_human", traits: ["trait.warmonger"], diplomacy: { opinions: {}, history: [] } };
    const factionB = { id: "fB", primaryRaceId: "race_avian", diplomacy: { opinions: {}, history: [] } };
    const factionC = { id: "fC", primaryRaceId: "race_human", diplomacy: { opinions: {}, history: [] } };
    const factions = [factionA, factionB, factionC];

    let relations = {};
    relations = setRelation(relations, "fA", "fB", "war");
    relations = setRelation(relations, "fA", "fC", "war");
    relations = setRelation(relations, "fB", "fC", "war");

    const world = { factions, diplomacy: relationsToWorldEdges(relations) };

    expect(newTarget(factionA, factionB, ["fA", "fB", "fC"], relations, content)).toBe(
      oldTarget(world, factionA, factionB, content),
    );

    // Alliance case, no shared enemies.
    relations = setRelation({}, "fA", "fB", "alliance");
    const world2 = { factions, diplomacy: relationsToWorldEdges(relations) };
    expect(newTarget(factionA, factionB, ["fA", "fB", "fC"], relations, content)).toBe(
      oldTarget(world2, factionA, factionB, content),
    );
  });
});
