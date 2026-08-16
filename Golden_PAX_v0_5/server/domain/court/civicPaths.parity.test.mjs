/**
 * True cross-repo parity against GMap/server/civicPaths.mjs, using the
 * real content/core/civic_paths.json (loaded via GMap's own
 * contentLoader.mjs — same pattern as contentLoader.parity.test.mjs).
 * GMap's functions take a mutable `eco` object and sometimes call
 * getContent() internally instead of taking content as an argument; this
 * port always takes plain values + content explicitly (CLAUDE.md rule 3),
 * so each case below constructs the equivalent `eco` for the old side.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import {
  listCivicPathDefs as newList,
  getCivicPathDef as newGetDef,
  civicThresholdForUnlock as newThreshold,
  isCivicUnlockGranted as newGranted,
  applyCivicPathUnlocks as newApply,
  civicStatusPayload as newStatus,
} from "./civicPaths.mjs";
import { defaultTechAccount } from "../tech/techAccount.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const oldModulePath = path.resolve(__dirname, "../../../../GMap/server/civicPaths.mjs");
const oldContentLoaderPath = path.resolve(__dirname, "../../../../GMap/server/contentLoader.mjs");

describe("civicPaths parity with GMap (real content/core/civic_paths.json)", () => {
  it("matches across the path/threshold/unlock/status functions", async () => {
    const old = await import(oldModulePath);
    const { getContent } = await import(oldContentLoaderPath);
    const content = getContent(["core"]);

    expect(newList(content)).toEqual(old.listCivicPathDefs(content));
    expect(newGetDef("trade", content)).toEqual(old.getCivicPathDef("trade", content));
    expect(newThreshold("trade", "building.free_port", content)).toBe(old.civicThresholdForUnlock("trade", "building.free_port", content));
    expect(newThreshold("culture", "law.state_religion", content)).toBe(old.civicThresholdForUnlock("culture", "law.state_religion", content));

    const lawUnlock = { kind: "law", id: "law.open_markets" };
    const buildingUnlock = { kind: "building", id: "building.free_port", property: "free_port" };
    expect(newGranted([], [], lawUnlock, content)).toBe(old.isCivicUnlockGranted({ laws: [], unlockedProperties: [] }, lawUnlock));
    expect(newGranted(["law.open_markets"], [], lawUnlock, content)).toBe(
      old.isCivicUnlockGranted({ laws: ["law.open_markets"], unlockedProperties: [] }, lawUnlock),
    );
    expect(newGranted([], ["free_port"], buildingUnlock, content)).toBe(
      old.isCivicUnlockGranted({ laws: [], unlockedProperties: ["free_port"] }, buildingUnlock),
    );
  });

  it("applyCivicPathUnlocks matches GMap's threshold-crossing behavior", async () => {
    const old = await import(oldModulePath);
    const { getContent } = await import(oldContentLoaderPath);
    const content = getContent(["core"]);

    // Score of 250 crosses the trade building.free_port threshold (200) but not law.open_markets (800).
    const oldEco = { laws: [], unlockedProperties: [], civicScores: { trade: 250 } };
    const oldJournal = old.applyCivicPathUnlocks(oldEco, "trade", content);

    const techAccount = { ...defaultTechAccount("f1"), unlockedProperties: [] };
    const { laws, techAccount: nextTech, journal } = newApply(250, [], techAccount, "trade", content);

    expect(laws).toEqual(oldEco.laws);
    expect(nextTech.unlockedProperties).toEqual(oldEco.unlockedProperties);
    expect(journal).toEqual(oldJournal);
  });

  it("civicStatusPayload matches GMap's HUD payload shape", async () => {
    const old = await import(oldModulePath);
    const { getContent } = await import(oldContentLoaderPath);
    const content = getContent(["core"]);

    const oldEco = { civicScores: { trade: 250, culture: 0 }, laws: [], unlockedProperties: [] };
    const oldStatus = old.civicStatusPayload(oldEco, content);
    const newStatusResult = newStatus({ trade: 250, culture: 0 }, [], [], content);

    expect(newStatusResult).toEqual(oldStatus);
  });
});
