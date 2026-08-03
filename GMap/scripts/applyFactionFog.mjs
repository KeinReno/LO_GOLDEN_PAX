/**
 * Apply FoW: every faction sees only owned (+ listed) systems.
 * Belator: no fullMapVision; sees owned + central known-space blob (~R from territory centroid).
 * Restore Карнед ownership on SYS-561..567.
 * Strip map.han_doubloons / consumer goods names from systems/planets.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const BELATOR = "faction_belator";
const KARNED = "faction_karned";
const BELATOR_RADIUS = 1300;
const KARNED_OWN = [
  "SYS-561",
  "SYS-562",
  "SYS-563",
  "SYS-564",
  "SYS-565",
  "SYS-566",
  "SYS-567",
  "Ауралис",
  "Голоколь",
  "Плазмир",
  "Корнепеснь",
  "Стрида",
  "Абиссаль",
  "Нанокарст",
];
const KARNED_VIS = [
  ...KARNED_OWN,
  "SYS-568",
  "SYS-569",
  "SYS-570",
  // Damyl corridor from Голоколь
  "SYS-765",
  "SYS-540",
  "SYS-763",
  "SYS-192",
  "Стык 8",
  "Улей-Пепел",
  "COR-776",
];
const STRIP_RES = new Set([
  "ханские дублоны",
  "потребительские товары",
  "map.han_doubloons",
  "map.consumer_goods",
]);

const files = [
  path.join(ROOT, "data/published.json"),
  path.join(ROOT, "public/campaigns/lo_golden_pax.json"),
];

function stripResources(list) {
  if (!Array.isArray(list)) return list;
  return list.filter((r) => !STRIP_RES.has(r));
}

for (const file of files) {
  const world = JSON.parse(fs.readFileSync(file, "utf8"));

  // Restore Karned ownership
  for (const name of KARNED_OWN) {
    const s = world.systems.find((x) => x.name === name);
    if (s) {
      s.ownerFactionId = KARNED;
      for (const p of s.planets ?? []) {
        if (p.ownerFactionId == null || p.ownerFactionId === KARNED) {
          p.ownerFactionId = KARNED;
        }
      }
    }
  }
  const cap = world.systems.find((s) => s.name === "SYS-565");
  if (cap) cap.isCapital = true;

  // Disable omniscience on all factions
  for (const f of world.factions) {
    f.fullMapVision = false;
  }

  // Belator known-space blob
  const belOwned = world.systems.filter((s) => s.ownerFactionId === BELATOR);
  let cx = 0;
  let cy = 0;
  for (const s of belOwned) {
    cx += s.x;
    cy += s.y;
  }
  if (belOwned.length) {
    cx /= belOwned.length;
    cy /= belOwned.length;
  }
  const belatorVisible = new Set();
  for (const s of world.systems) {
    if (s.ownerFactionId === BELATOR) belatorVisible.add(s.id);
    else if (Math.hypot(s.x - cx, s.y - cy) <= BELATOR_RADIUS) {
      belatorVisible.add(s.id);
    }
  }

  // Rebuild visibleToFactionIds
  for (const s of world.systems) {
    const next = new Set();

    // Keep non-omniscient intel for factions that own the system
    if (s.ownerFactionId) next.add(s.ownerFactionId);

    // Co-owners
    for (const id of s.coOwnerFactionIds ?? []) next.add(id);

    // Belator blob
    if (belatorVisible.has(s.id)) next.add(BELATOR);

    // Karned whitelist
    if (KARNED_VIS.includes(s.name)) next.add(KARNED);

    // Fleets / legions present → that faction sees the system
    for (const f of world.fleets ?? []) {
      if (f.systemId === s.id) next.add(f.factionId);
    }
    for (const l of world.legions ?? []) {
      if (l.systemId === s.id) next.add(l.factionId);
    }

    s.visibleToFactionIds = [...next];
    s.resources = stripResources(s.resources);
    for (const p of s.planets ?? []) {
      p.resources = stripResources(p.resources);
    }
  }

  world.meta.updatedAt = new Date().toISOString();
  world.meta.tableRevision = (world.meta.tableRevision || 0) + 1;
  fs.writeFileSync(file, JSON.stringify(world, null, 2) + "\n");

  const belCount = world.systems.filter((s) =>
    (s.visibleToFactionIds || []).includes(BELATOR),
  ).length;
  const karnedOwn = world.systems.filter(
    (s) => s.ownerFactionId === KARNED,
  ).length;
  console.log(
    path.basename(file),
    "rev",
    world.meta.tableRevision,
    "belator sees",
    belCount,
    "karned owns",
    karnedOwn,
  );
}

// Clear subtractive fog masks for all factions (start clean)
const fogPath = path.join(ROOT, "data/fog-masks.json");
const fog = { masks: {}, permanentReveal: {} };
fs.writeFileSync(fogPath, JSON.stringify(fog, null, 2) + "\n");
console.log("cleared fog-masks.json");
