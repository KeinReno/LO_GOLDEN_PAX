/**
 * One-shot GMap → Golden Pax galaxy import.
 *
 * Direct DB via campaign stores + domain mappers (not HTTP): 978 systems /
 * 2774 planets. Domain functions compute population (planetCapFromBuildings),
 * grade, and building defs; stores persist the same shapes the GM routes use.
 *
 * Usage (from Golden_PAX_v0_5/):
 *   node scripts/migrateGalaxy.mjs
 *   node scripts/migrateGalaxy.mjs --db ./data/golden-pax.sqlite
 *   node scripts/migrateGalaxy.mjs --sample
 *   node scripts/migrateGalaxy.mjs --input ../GMap/data/published.json --db :memory:
 *
 * Default DB is the process store (data/golden-pax.sqlite). Always creates a
 * new campaign; does not wipe existing ones. Faction passwords are never copied.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDb } from "../server/db/store.mjs";
import { loadContent } from "../server/contentLoader.mjs";
import {
  assertMappedPlanet,
  assertMappedSystem,
  filterWorld,
  mapGalaxy,
  pickRepresentativeSystemIds,
} from "../server/domain/planets/galaxyMigration.mjs";
import { persistMappedGalaxy } from "../server/campaign/galaxyMigration.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_INPUT = path.resolve(__dirname, "../../GMap/data/published.json");

function arg(flag, fallback) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return fallback;
  return process.argv[i + 1] ?? fallback;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

export function loadPublishedGalaxy(inputPath = DEFAULT_INPUT) {
  return JSON.parse(fs.readFileSync(inputPath, "utf8"));
}

export function migratePublishedGalaxy(db, world, content, { sample = false, campaignName } = {}) {
  const source = sample ? filterWorld(world, pickRepresentativeSystemIds(world)) : world;
  const t0 = Date.now();
  const mapped = mapGalaxy(source, content);
  const mapMs = Date.now() - t0;
  if (!mapped.ok) {
    throw new Error(
      mapped.unresolvedCombos?.length
        ? `unmapped kind/zone: ${mapped.unresolvedCombos.join(", ")}`
        : mapped.errors.map((e) => e.error).join("; "),
    );
  }
  for (const sys of mapped.systems) assertMappedSystem(sys);
  const srcPlanetById = new Map();
  for (const sys of source.systems || []) {
    for (const p of sys.planets || []) srcPlanetById.set(p.id, p);
  }
  for (const planet of mapped.planets) {
    const src = srcPlanetById.get(planet.id);
    if (src) assertMappedPlanet(src, planet, content);
  }
  const persisted = persistMappedGalaxy(db, mapped, {
    content,
    campaignName: campaignName || world.meta?.name || (sample ? "GMap galaxy sample" : "GMap galaxy"),
  });
  return { mapped, persisted, mapMs, sample, systemCount: mapped.report.systemCount, planetCount: mapped.report.planetCount };
}

function parseDbTarget(raw) {
  if (!raw) return undefined;
  if (raw === ":memory:") return ":memory:";
  return path.resolve(raw);
}

function main() {
  const input = path.resolve(arg("--input", DEFAULT_INPUT));
  const sample = hasFlag("--sample");
  const dbTarget = parseDbTarget(arg("--db", ""));
  const campaignName = arg("--campaign-name", "");

  if (!fs.existsSync(input)) {
    console.error(`input not found: ${input}`);
    process.exit(1);
  }

  const content = loadContent(["core"]);
  const world = loadPublishedGalaxy(input);
  const db = dbTarget === undefined ? createDb() : createDb(dbTarget);
  const result = migratePublishedGalaxy(db, world, content, { sample, campaignName });

  console.log(
    JSON.stringify(
      {
        campaignId: result.persisted.campaign.id,
        sample: result.sample,
        systems: result.systemCount,
        planets: result.planetCount,
        links: result.mapped.report.linkCount,
        sectors: result.mapped.report.sectorCount,
        factions: result.mapped.report.factionCount,
        aliasedBuildings: result.mapped.report.aliasedBuildings,
        skippedDuplicateLinks: result.persisted.skippedDuplicateLinks,
        kindZoneCombos: result.mapped.report.kindZoneCombos,
        mapMs: result.mapMs,
        persistMs: result.persisted.elapsedMs,
        db: dbTarget === undefined ? "default data/golden-pax.sqlite" : dbTarget,
      },
      null,
      2,
    ),
  );
}

const isCli = process.argv[1] && path.normalize(process.argv[1]) === path.normalize(fileURLToPath(import.meta.url));
if (isCli) main();
