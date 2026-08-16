/**
 * Rescale faction census to 400k–600k, trim buildings to grade caps,
 * seed a matching-category extractor + housing on inhabited worlds.
 *
 * Usage: node scripts/rescaleFactionCensus.mjs [--apply]
 */
import { randomUUID } from "node:crypto";
import { getContent } from "../server/contentLoader.mjs";
import { readLiveBoard, writeLiveBoard } from "../server/tableStore.mjs";
import { populationScaleCfg, laborPopulation } from "../server/populationScale.mjs";
import { canExtractDeposit } from "../server/depositExtract.mjs";
import {
  lookupMapResource,
  planetBuildingList,
  resolveBuildingDef,
} from "../server/flowEngine.mjs";
import { derivedGradeFields, zoneSlotCap } from "../server/planetGrade.mjs";
import { consumesLabor, laborSlotsForDef } from "../server/laborAllocation.mjs";

const MAJOR_FACTION_IDS = new Set([
  "faction_belator",
  "faction_amalfea",
  "faction_karned",
  "faction_turon",
  "faction_taala",
  "faction_federation",
  "faction_heshah",
  "faction_korvun",
  "faction_sikuri",
]);

function isMajorFaction(fac) {
  if (MAJOR_FACTION_IDS.has(fac.id)) return true;
  const name = String(fac.name || "");
  return /Галлиан|Белатор|Амальф|Карнед|Турон|Таал/i.test(name);
}

const APPLY = process.argv.includes("--apply");

const EXTRACTOR_FOR_CAT = {
  A: "building.mine",
  B: "materia.smelter",
  C: "building.factory",
  D: "energia.thermal_plant",
  E: "building.farm",
  F: "building.lab",
};

function inst(buildingId, zone = "surface") {
  return { id: randomUUID(), buildingId, zone };
}

function listKeyFor(b, def) {
  const zone = b?.zone || def?.zone || "surface";
  return zone === "orbital" ? "orbitalBuildings" : "surfaceBuildings";
}

function ensureLists(planet) {
  if (!Array.isArray(planet.surfaceBuildings)) planet.surfaceBuildings = [];
  if (!Array.isArray(planet.orbitalBuildings)) planet.orbitalBuildings = [];
  if (Array.isArray(planet.buildings) && planet.buildings.length) {
    const haveIds = new Set(
      [...planet.surfaceBuildings, ...planet.orbitalBuildings]
        .map((b) => b?.id)
        .filter(Boolean),
    );
    const listsFilled =
      planet.surfaceBuildings.length + planet.orbitalBuildings.length > 0;
    for (const b of planet.buildings) {
      if (listsFilled && b?.id && haveIds.has(b.id)) continue;
      if (listsFilled && !b?.id) continue;
      const def = resolveBuildingDef(getContent(), b);
      const key = listKeyFor(b, def);
      planet[key].push(b);
    }
    planet.buildings = [];
  }
}

function trimToCap(list, cap) {
  if (!Array.isArray(list) || list.length <= cap) return list || [];
  const seen = new Set();
  const unique = [];
  const extras = [];
  for (const b of list) {
    const id = b?.buildingId || b?.kind || "";
    if (id && !seen.has(id)) {
      seen.add(id);
      unique.push(b);
    } else extras.push(b);
  }
  const out = unique.length <= cap ? unique : unique.slice(0, cap);
  for (const b of extras) {
    if (out.length >= cap) break;
    out.push(b);
  }
  return out;
}

function hasHousing(planet, content) {
  for (const b of planetBuildingList(planet)) {
    const def = resolveBuildingDef(content, b);
    if (!def) continue;
    if ((def.kind === "residential" || def.kind === "habitat") && !consumesLabor(def)) {
      return true;
    }
  }
  return false;
}

function depositCats(planet, content) {
  const cats = new Set();
  for (const name of planet.resources || []) {
    const def = lookupMapResource(content, name);
    if (def?.category) cats.add(def.category);
  }
  return [...cats];
}

function unlocksCat(def, cat) {
  if (!def || !cat) return false;
  if (Object.prototype.hasOwnProperty.call(def, "extractsCategory")) {
    const v = def.extractsCategory;
    const list = Array.isArray(v) ? v : v == null || v === "" ? [] : [v];
    return list.includes(cat);
  }
  return def.category === cat;
}

/**
 * Drop surplus labor buildings so a planet's job-slots fit its labor units.
 * Always keep housing and one extractor per deposit category.
 */
function trimLaborConsumers(planet, content) {
  const labor = laborPopulation(planet, content);
  const cats = depositCats(planet, content);
  const all = planetBuildingList(planet);
  const housing = [];
  const extractors = [];
  const otherLabor = [];
  const rest = [];
  const covered = new Set();

  for (const b of all) {
    const def = resolveBuildingDef(content, b);
    if (!consumesLabor(def)) {
      housing.push({ b, zone: listKeyFor(b, def) });
      continue;
    }
    const catHit = cats.find((c) => unlocksCat(def, c) && !covered.has(c));
    if (catHit) {
      covered.add(catHit);
      extractors.push({ b, def, zone: listKeyFor(b, def) });
    } else if (consumesLabor(def)) {
      otherLabor.push({ b, def, zone: listKeyFor(b, def) });
    } else {
      rest.push({ b, zone: listKeyFor(b, def) });
    }
  }

  let used = extractors.reduce((s, x) => s + laborSlotsForDef(x.def), 0);
  const keptOther = [];
  for (const x of otherLabor) {
    const slots = laborSlotsForDef(x.def);
    if (labor <= 0) break;
    if (used + slots > labor) continue;
    keptOther.push(x);
    used += slots;
  }

  const surface = [];
  const orbital = [];
  const push = (item) => {
    if (item.zone === "orbitalBuildings") orbital.push(item.b);
    else surface.push(item.b);
  };
  for (const x of housing) push(x);
  for (const x of extractors) push(x);
  for (const x of keptOther) push(x);
  for (const x of rest) push(x);
  const dropped =
    all.length - surface.length - orbital.length;
  planet.surfaceBuildings = surface;
  planet.orbitalBuildings = orbital;
  return dropped;
}

function factionOwnedPlanets(world, factionId) {
  const out = [];
  for (const sys of world.systems || []) {
    if (sys.ownerFactionId !== factionId) continue;
    for (const p of sys.planets || []) out.push({ sys, planet: p });
  }
  return out;
}

function main() {
  const content = getContent();
  const cfg = populationScaleCfg(content);
  const world = readLiveBoard();
  if (!world) {
    console.error("no live board");
    process.exit(1);
  }

  const report = [];
  let buildingsDropped = 0;
  let housingAdded = 0;
  let extractorsAdded = 0;

  for (const fac of world.factions || []) {
    const owned = factionOwnedPlanets(world, fac.id);
    if (!owned.length) continue;
    const before = owned.reduce((s, o) => s + (Number(o.planet.population) || 0), 0);
    if (before <= 0) continue;

    let target = before;
    if (before > cfg.factionCensusMax) target = cfg.factionCensusTarget;
    else if (before < cfg.factionCensusMin && isMajorFaction(fac)) {
      target = cfg.factionCensusMin;
    }
    const scale = target / before;

    for (const { planet } of owned) {
      const prev = Math.max(0, Number(planet.population) || 0);
      planet.population = Math.round(prev * scale);
      if (planet.population > 0) planet.censusLocked = true;
    }
    const after = owned.reduce((s, o) => s + (Number(o.planet.population) || 0), 0);
    const drift = after - target;
    if (drift !== 0) {
      const richest = [...owned].sort(
        (a, b) => (b.planet.population || 0) - (a.planet.population || 0),
      )[0];
      if (richest) {
        richest.planet.population = Math.max(
          0,
          (richest.planet.population || 0) - drift,
        );
      }
    }

    const per = cfg.censusPerLaborUnit;
    for (const { planet } of owned) {
      const pop = Number(planet.population) || 0;
      if (pop <= 0) continue;
      planet.censusLocked = true;
      const hasWork =
        (planet.resources || []).length > 0 ||
        planetBuildingList(planet).length > 0;
      if (hasWork && laborPopulation(planet, content) <= 0) {
        planet.population = per;
      }
    }
    const afterBump = owned.reduce((s, o) => s + (Number(o.planet.population) || 0), 0);
    let bumpDrift = afterBump - target;
    if (bumpDrift !== 0) {
      const richest = [...owned].sort(
        (a, b) => (b.planet.population || 0) - (a.planet.population || 0),
      )[0];
      if (richest) {
        richest.planet.population = Math.max(
          per,
          (richest.planet.population || 0) - bumpDrift,
        );
      }
    }

    for (const { planet } of owned) {
      Object.assign(planet, derivedGradeFields(planet, content));
      ensureLists(planet);
      const surfCap = zoneSlotCap(planet, "surfaceBuildings", content);
      const orbCap = zoneSlotCap(planet, "orbitalBuildings", content);
      const surfBefore = planet.surfaceBuildings.length;
      const orbBefore = planet.orbitalBuildings.length;
      planet.surfaceBuildings = trimToCap(planet.surfaceBuildings, surfCap);
      planet.orbitalBuildings = trimToCap(planet.orbitalBuildings, orbCap);
      buildingsDropped +=
        surfBefore -
        planet.surfaceBuildings.length +
        (orbBefore - planet.orbitalBuildings.length);

      const inhabited = (planet.population || 0) > 0;
      const laborHere = laborPopulation(planet, content);
      if (inhabited && !hasHousing(planet, content) && planet.surfaceBuildings.length < surfCap) {
        planet.surfaceBuildings.unshift(inst("building.residential", "surface"));
        housingAdded += 1;
      }
      if (inhabited && laborHere > 0) {
        const buildings = planetBuildingList(planet);
        for (const cat of depositCats(planet, content)) {
          const { allowed } = canExtractDeposit({
            buildings,
            depositType: (planet.resources || []).find((n) => {
              const d = lookupMapResource(content, n);
              return d?.category === cat;
            }),
            content,
          });
          if (allowed) continue;
          const bid = EXTRACTOR_FOR_CAT[cat];
          if (!bid || !content.buildings?.[bid]) continue;
          const def = content.buildings[bid];
          const key = (def.zone || "surface") === "orbital" ? "orbitalBuildings" : "surfaceBuildings";
          const cap = key === "orbitalBuildings" ? orbCap : surfCap;
          if (planet[key].length >= cap) continue;
          planet[key].push(inst(bid, def.zone || "surface"));
          extractorsAdded += 1;
        }
      }
      buildingsDropped += trimLaborConsumers(planet, content);
    }

    const labor = owned.reduce((s, o) => s + laborPopulation(o.planet, content), 0);
    let laborNeed = 0;
    for (const { planet } of owned) {
      for (const b of planetBuildingList(planet)) {
        const def = resolveBuildingDef(content, b);
        if (consumesLabor(def)) laborNeed += laborSlotsForDef(def);
      }
    }
    report.push({
      id: fac.id,
      name: fac.name,
      popBefore: before,
      popAfter: owned.reduce((s, o) => s + (Number(o.planet.population) || 0), 0),
      labor,
      laborNeed,
    });
  }

  console.log(JSON.stringify({ apply: APPLY, buildingsDropped, housingAdded, extractorsAdded, factions: report }, null, 2));

  if (APPLY) {
    const written = writeLiveBoard(world, {
      backup: true,
      reason: "rescale_census_400_600k",
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
