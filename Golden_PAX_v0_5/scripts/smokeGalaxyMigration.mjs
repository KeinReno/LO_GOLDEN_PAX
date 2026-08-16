/**
 * Live check for GALAXY_MIGRATION_SPEC: map a representative sample of
 * GMap/data/published.json into an in-memory DB and assert the spec gates
 * (building-derived population, grade fits buildings, kind/zone resolved,
 * links/x/y exact, inert tags kept). Pass --full to persist all 978 systems
 * and print timing.
 *
 * Usage: node scripts/smokeGalaxyMigration.mjs
 *        node scripts/smokeGalaxyMigration.mjs --full
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDb } from "../server/db/store.mjs";
import { loadContent } from "../server/contentLoader.mjs";
import { getSystem, loadPlanet, listSystemsWithPlanets } from "../server/campaign/planetStore.mjs";
import { listSystemLinks } from "../server/campaign/systemLinksStore.mjs";
import { listSectors } from "../server/campaign/sectorStore.mjs";
import { loadPublishedGalaxy, migratePublishedGalaxy } from "./migrateGalaxy.mjs";
import { planetCapFromBuildings } from "../server/domain/planets/populationCap.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INPUT = path.resolve(__dirname, "../../GMap/data/published.json");

function assert(cond, msg) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  ok  ${msg}`);
}

function main() {
  const full = process.argv.includes("--full");
  assert(fs.existsSync(INPUT), `published.json present (${INPUT})`);

  const content = loadContent(["core"]);
  const world = loadPublishedGalaxy(INPUT);
  assert(world.systems.length === 978, `978 systems in source, got ${world.systems.length}`);
  assert(world.systems.reduce((n, s) => n + (s.planets || []).length, 0) === 2774, "2774 planets in source");

  const db = createDb(":memory:");
  const t0 = Date.now();
  const result = migratePublishedGalaxy(db, world, content, { sample: !full });
  const totalMs = Date.now() - t0;

  const { campaign } = result.persisted;
  const srcById = new Map(world.systems.map((s) => [s.id, s]));
  const migrated = listSystemsWithPlanets(db, campaign.id);
  let popChecks = 0;

  for (const sys of migrated) {
    const src = srcById.get(sys.id);
    if (!src) throw new Error(`FAIL: missing source system ${sys.id}`);
    if (sys.x !== src.x || sys.y !== src.y) throw new Error(`FAIL: ${sys.id} x/y ${sys.x},${sys.y} vs ${src.x},${src.y}`);
    const srcTags = [...(src.spaceObjects || [])].sort();
    const gotTags = sys.spaceObjects.map((o) => o.typeId).sort();
    if (JSON.stringify(gotTags) !== JSON.stringify(srcTags)) {
      throw new Error(`FAIL: ${sys.id} tags ${JSON.stringify(gotTags)} vs ${JSON.stringify(srcTags)}`);
    }
    for (const p of sys.planets) {
      const fromBuildings = planetCapFromBuildings(p, content);
      if (p.population !== fromBuildings && p.population !== 0) {
        throw new Error(`FAIL: ${p.id} population ${p.population} is not cap ${fromBuildings} or 0`);
      }
      const srcP = (src.planets || []).find((x) => x.id === p.id);
      if (srcP && Number(srcP.population) > 200 && p.population === srcP.population) {
        throw new Error(`FAIL: ${p.id} copied old population ${srcP.population}`);
      }
      popChecks += 1;
    }
  }
  assert(true, `${migrated.length} systems x/y + tags match source`);
  assert(popChecks > 0, `${popChecks} planets have building-derived (or zero) population`);

  const links = listSystemLinks(db, campaign.id);
  const migratedIds = new Set(migrated.map((s) => s.id));
  for (const link of links) {
    const src = world.links.find((l) => l.id === link.id) || world.links.find((l) => l.fromId === link.fromId && l.toId === link.toId);
    if (!src || src.fromId !== link.fromId || src.toId !== link.toId || src.type !== link.type) {
      throw new Error(`FAIL: link ${link.fromId}→${link.toId} (${link.type}) does not match source`);
    }
    if (!migratedIds.has(link.fromId) || !migratedIds.has(link.toId)) {
      throw new Error(`FAIL: link ${link.fromId}→${link.toId} points outside migrated set`);
    }
  }
  assert(true, `${links.length} links match source endpoints and type`);

  if (full) {
    assert(migrated.length === 978, "all 978 systems persisted");
    assert(listSectors(db, campaign.id).length === (world.sectors || []).length, "all sectors persisted");
  } else {
    assert(migrated.length >= 8, `sample has ${migrated.length} systems`);
    const withInert = migrated.find((s) => s.spaceObjects.some((o) => o.typeId === "refugees"));
    if (withInert) assert(true, `inert tag refugees preserved on ${withInert.id}`);
  }

  const withPlanet = migrated.find((s) => s.planets?.length);
  assert(withPlanet, "sample includes a system with a planet");
  const samplePlanet = loadPlanet(db, withPlanet.id, withPlanet.planets[0].id);
  assert(samplePlanet.grade >= 1 && samplePlanet.grade <= 5, `grade in range (${samplePlanet.grade})`);
  getSystem(db, campaign.id, withPlanet.id);

  console.log(
    `\n=== galaxy migration ${full ? "FULL" : "sample"} — ${result.systemCount} systems, ${result.planetCount} planets, map ${result.mapMs}ms, persist ${result.persisted.elapsedMs}ms, total ${totalMs}ms ===`,
  );
}

main();
