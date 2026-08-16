/**
 * If a faction pegs a strategic ore that is missing from owned worlds,
 * seed it on the richest inhabited planets and add a matching extractor.
 *
 * Usage: node scripts/ensurePegDeposits.mjs [--apply]
 */
import { randomUUID } from "node:crypto";
import { getContent } from "../server/contentLoader.mjs";
import { readLiveBoard, writeLiveBoard } from "../server/tableStore.mjs";
import { canExtractDeposit } from "../server/depositExtract.mjs";
import {
  lookupMapResource,
  planetBuildingList,
} from "../server/flowEngine.mjs";
import { zoneSlotCap } from "../server/planetGrade.mjs";

const APPLY = process.argv.includes("--apply");
const SEED_WORLDS = 4;

const EXTRACTOR_FOR_CAT = {
  A: "building.mine",
  B: "materia.smelter",
  C: "building.factory",
  D: "energia.thermal_plant",
  E: "building.farm",
  F: "building.lab",
};

function hasDeposit(planet, pegId, content) {
  for (const n of planet.resources || []) {
    const def = lookupMapResource(content, n);
    if (def?.id === pegId || n === pegId) return true;
  }
  return false;
}

function main() {
  const content = getContent();
  const world = readLiveBoard();
  if (!world) {
    console.error("no live board");
    process.exit(1);
  }

  const report = [];
  for (const fac of world.factions || []) {
    const peg = fac.treasuryPeg;
    if (!peg) continue;
    const pegDef = lookupMapResource(content, peg);
    if (!pegDef?.id || pegDef.category == null) continue;

    const owned = [];
    for (const sys of world.systems || []) {
      if (sys.ownerFactionId !== fac.id) continue;
      for (const p of sys.planets || []) owned.push(p);
    }
    const already = owned.filter((p) => hasDeposit(p, pegDef.id, content)).length;
    if (already > 0) {
      report.push({ id: fac.id, name: fac.name, peg, already, seeded: 0 });
      continue;
    }

    const targets = owned
      .filter((p) => (Number(p.population) || 0) > 0)
      .sort((a, b) => (b.population || 0) - (a.population || 0))
      .slice(0, SEED_WORLDS);
    let seeded = 0;
    for (const planet of targets) {
      if (!Array.isArray(planet.resources)) planet.resources = [];
      planet.resources.push(pegDef.id);
      if (!Array.isArray(planet.surfaceBuildings)) planet.surfaceBuildings = [];
      const buildings = planetBuildingList(planet);
      const { allowed } = canExtractDeposit({
        buildings,
        depositType: pegDef.id,
        content,
      });
      if (!allowed) {
        const bid = EXTRACTOR_FOR_CAT[pegDef.category];
        const def = bid ? content.buildings?.[bid] : null;
        if (def) {
          const cap = zoneSlotCap(planet, "surfaceBuildings", content);
          if (planet.surfaceBuildings.length < cap) {
            planet.surfaceBuildings.push({
              id: randomUUID(),
              buildingId: bid,
              zone: "surface",
            });
          }
        }
      }
      seeded += 1;
    }
    report.push({ id: fac.id, name: fac.name, peg, already: 0, seeded });
  }

  console.log(JSON.stringify({ apply: APPLY, factions: report }, null, 2));
  if (APPLY) {
    const written = writeLiveBoard(world, {
      backup: true,
      reason: "ensure_peg_deposits",
    });
    if (written?.ok === false) {
      console.error("write failed", written.error);
      process.exit(1);
    }
    console.log("WROTE live board");
  } else {
    console.log("dry-run; pass --apply to write");
  }
}

main();
