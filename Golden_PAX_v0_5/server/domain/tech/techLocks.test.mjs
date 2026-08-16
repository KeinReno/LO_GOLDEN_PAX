/**
 * Behavior test (NOT byte-parity — GMap's factionRaceSharePercent walks
 * world.systems directly; this is reshaped to take factionPlanets, reusing
 * this project's own raceComposition.mjs, see techLocks.mjs's header). The
 * raceLock threshold (30) and requireProperties check ARE ported verbatim.
 */
import { describe, it, expect } from "vitest";
import { raceSharePercent, checkTechLocks, RACE_LOCK_MIN_SHARE } from "./techLocks.mjs";

function planet(raceId, percent, population = 100) {
  const rest = 100 - percent;
  const composition = rest > 0 ? [{ raceId, percent }, { raceId: "race_human", percent: rest }] : [{ raceId, percent }];
  return { population, raceComposition: composition };
}

describe("raceSharePercent", () => {
  it("is 0 with no planets or no population", () => {
    expect(raceSharePercent([], "race_swarm")).toBe(0);
    expect(raceSharePercent([planet("race_swarm", 100, 0)], "race_swarm")).toBe(0);
  });

  it("is population-weighted across multiple planets", () => {
    const planets = [planet("race_swarm", 100, 100), planet("race_human", 100, 300)];
    expect(raceSharePercent(planets, "race_swarm")).toBe(25);
  });
});

describe("checkTechLocks", () => {
  const content = { races: { race_swarm: { name: "Swarm" } } };

  it("blocks a raceLock tech when the faction is below the threshold", () => {
    const def = { raceLock: "race_swarm" };
    const result = checkTechLocks(def, {}, [planet("race_swarm", 10)], content);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(new RegExp(`${RACE_LOCK_MIN_SHARE}`));
  });

  it("allows a raceLock tech once the faction meets the population share", () => {
    const def = { raceLock: "race_swarm" };
    const result = checkTechLocks(def, {}, [planet("race_swarm", 50)], content);
    expect(result.ok).toBe(true);
  });

  it("blocks a requireProperties tech the faction hasn't unlocked", () => {
    const def = { requireProperties: ["exotic_thing"] };
    expect(checkTechLocks(def, { unlockedProperties: [] }, [], content).ok).toBe(false);
    expect(checkTechLocks(def, { unlockedProperties: ["exotic_thing"] }, [], content).ok).toBe(true);
  });

  it("has no lock at all when the def declares none", () => {
    expect(checkTechLocks({}, {}, [], content).ok).toBe(true);
  });
});
