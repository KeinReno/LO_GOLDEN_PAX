/**
 * AUD-05/06: add live-board race ids missing from races.json as human forks,
 * then stamp faction.primaryRaceId from owned planet majority.
 *
 * Usage: node scripts/stampBoardRaces.mjs [--apply]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { inferPrimaryRaceId } from "../server/normalizeWorld/factions.mjs";
import { hintRaceFromFaction } from "../server/normalizeWorld/factions.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const apply = process.argv.includes("--apply");

const NAMES = {
  corinfad: "Коринфад",
  heshah: "ХэШах",
  sikuri: "Сикури",
  elanor: "Эланор",
  vendir: "Вендир",
  elanis: "Эланис",
  elatris: "Элатрис",
  triumvis: "Триумвис",
  lithoid: "Литоид",
  elacrin: "Элакрин",
  eladon: "Эладон",
  bistier: "Бистиер",
  korvun: "Корвун",
  taala: "Таала",
  huchi: "Хучи",
};

function loadJson(p) {
  return JSON.parse(readFileSync(p, "utf8"));
}

function collectLiveRaceIds(world) {
  const ids = new Set();
  const add = (id) => {
    if (typeof id === "string" && id) ids.add(id);
  };
  for (const s of world.systems || []) {
    for (const p of s.planets || []) {
      for (const row of p.raceComposition || []) {
        add(typeof row === "string" ? row : row?.raceId);
      }
    }
  }
  for (const f of world.factions || []) {
    add(f.primaryRaceId);
    add(f.raceId);
    add(f.primaryRace);
  }
  return ids;
}

function stubRace(id) {
  const bare = String(id).replace(/^race_/, "");
  return {
    id,
    name: NAMES[bare] || bare,
    kind: "fork",
    origin: `Живой стол: раса ${NAMES[bare] || bare} (AUD-05)`,
    base: "race_human",
    forked_from: "race_human",
    tags: ["board", bare],
    override_traits: [],
    xenorelations: {},
  };
}

const racesPath = join(root, "content/core/races.json");
const publishedPath = join(root, "data/published.json");
const races = loadJson(racesPath);
const published = loadJson(publishedPath);
const liveIds = collectLiveRaceIds(published);

const toAdd = [];
for (const id of liveIds) {
  if (!races[id]) toAdd.push(id);
}
for (const bare of Object.keys(NAMES)) {
  for (const id of [bare, `race_${bare}`]) {
    if (liveIds.has(id) && !races[id] && !toAdd.includes(id)) toAdd.push(id);
  }
}
toAdd.sort();

for (const id of toAdd) races[id] = stubRace(id);

let stamped = 0;
for (const f of published.factions || []) {
  if (f.primaryRaceId || f.raceId) continue;
  const hinted = hintRaceFromFaction(f, races);
  const inferred = hinted || inferPrimaryRaceId(published, f.id);
  if (!inferred) continue;
  f.primaryRaceId = inferred;
  stamped += 1;
}

const still = (published.factions || []).filter((f) => !f.primaryRaceId);
const majors = {};
for (const id of [
  "faction_belator",
  "faction_karned",
  "faction_korvun",
  "faction_heshah",
  "faction_federation",
]) {
  const f = (published.factions || []).find((x) => x.id === id);
  majors[id] = f?.primaryRaceId || null;
}

console.log(
  JSON.stringify({
    apply,
    catalogAdded: toAdd,
    catalogAddedCount: toAdd.length,
    catalogTotal: Object.keys(races).length,
    primaryStamped: stamped,
    primaryStillNull: still.map((f) => f.id),
    majors,
  }),
);

if (apply) {
  if (toAdd.length) {
    const extra = {};
    for (const id of toAdd) extra[id] = stubRace(id);
    const inner = JSON.stringify(extra, null, 2).trim().slice(1, -1).trim();
    const raw = readFileSync(racesPath, "utf8").replace(/\}\s*$/, "");
    writeFileSync(racesPath, `${raw.trimEnd()},\n${inner}\n}\n`);
  }
  writeFileSync(publishedPath, `${JSON.stringify(published, null, 2)}\n`);
}
