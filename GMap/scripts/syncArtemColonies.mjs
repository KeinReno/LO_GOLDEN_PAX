/**
 * Patch Belator colony truth from ARTEM all_planets.json into lo_golden_pax.json.
 * Settled = population > 0; controlled-only = owner but empty planets.
 *
 * Run: node scripts/syncArtemColonies.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARTEM_PLANETS = path.join(
  "D:/LO_GALACTIC_STRATEGY_ARTEM/game/data/planets/all_planets.json",
);
const CAMPAIGN = path.join(__dirname, "../public/campaigns/lo_golden_pax.json");

/** @type {Record<string, Array<{name:string, population:number, colonyType:string, habitable?:boolean}>>} */
const FALLBACK = {
  Солис: [
    { name: "Домус Солис", population: 572677, colonyType: "capital" },
  ],
  Гурез: [
    { name: "Домус Гурез", population: 222095, colonyType: "colony" },
    { name: "Луна Гурез", population: 2085, colonyType: "outpost" },
  ],
  Десерти: [
    { name: "Домус Десерти", population: 296955, colonyType: "colony" },
  ],
  Элегантия: [
    { name: "Домус Элегантия", population: 516760, colonyType: "colony" },
  ],
  Гамма: [
    { name: "Домус Данкристо", population: 10000, colonyType: "colony" },
    { name: "Домус Белвор", population: 10000, colonyType: "colony" },
  ],
  Алиот: [
    { name: "Домус Алиот", population: 0, colonyType: "colony", habitable: true },
  ],
  Алькор: [
    { name: "Домус Алькор", population: 0, colonyType: "colony", habitable: true },
  ],
};

function loadArtem() {
  if (!fs.existsSync(ARTEM_PLANETS)) {
    console.warn("ARTEM planets missing, using fallback table");
    return FALLBACK;
  }
  const raw = JSON.parse(fs.readFileSync(ARTEM_PLANETS, "utf8"));
  /** @type {Record<string, any[]>} */
  const bySys = {};
  for (const v of Object.values(raw)) {
    if (!v || typeof v !== "object") continue;
    const sys = v.system;
    if (!sys) continue;
    (bySys[sys] ??= []).push({
      name: v.planet_name || `Мир ${sys}`,
      population: Number(v.population) || 0,
      colonyType: v.colony_type || (Number(v.population) > 0 ? "colony" : "none"),
      habitable: true,
    });
  }
  return Object.keys(bySys).length ? bySys : FALLBACK;
}

function makePlanet(spec, raceId = "race_belator") {
  const pop = spec.population || 0;
  const buildingColony = pop === 0 && spec.colonyType === "colony";
  return {
    id: randomUUID(),
    name: spec.name,
    type: "rocky",
    climate: pop > 0 ? "temperate" : "cold",
    population: pop,
    raceComposition: pop > 0 ? [{ raceId, percent: 100 }] : [],
    resources: pop > 0 ? ["железо"] : [],
    habitable: spec.habitable ?? true,
    colonizable: true,
    surveyed: true,
    colonyType: pop > 0 ? spec.colonyType || "colony" : buildingColony ? "colony" : "none",
  };
}

function emptyClaimPlanet(systemName) {
  return {
    id: randomUUID(),
    name: `Мир ${systemName}`,
    type: "rocky",
    climate: "cold",
    population: 0,
    raceComposition: [],
    resources: [],
    habitable: true,
    colonizable: true,
    surveyed: true,
    colonyType: "none",
  };
}

const bySys = loadArtem();
const world = JSON.parse(fs.readFileSync(CAMPAIGN, "utf8"));
let patched = 0;
let settled = 0;
let controlledEmpty = 0;

for (const s of world.systems ?? []) {
  if (s.ownerFactionId !== "faction_belator") continue;
  if (s.kind === "corridor") continue;

  const specs = bySys[s.name];
  if (specs?.length) {
    s.planets = specs.map((p) => makePlanet(p));
    if (specs.some((p) => p.population > 0)) settled += 1;
    else controlledEmpty += 1;
    patched += 1;
  } else {
    // Controlled without colony record — claim only
    s.planets = [emptyClaimPlanet(s.name)];
    controlledEmpty += 1;
    patched += 1;
  }
}

fs.writeFileSync(CAMPAIGN, JSON.stringify(world, null, 2), "utf8");
console.log(
  `Patched ${patched} Belator systems · settled ${settled} · controlled-empty ${controlledEmpty}`,
);
console.log("Wrote", CAMPAIGN);
