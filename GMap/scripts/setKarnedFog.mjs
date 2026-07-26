/**
 * Password Archon + FoW: only SYS-561..570 visible for Карнед.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const FACTION = "faction_karned";
const VISIBLE = new Set([
  "SYS-561",
  "SYS-562",
  "SYS-563",
  "SYS-564",
  "SYS-565",
  "SYS-566",
  "SYS-567",
  "SYS-568",
  "SYS-569",
  "SYS-570",
]);

const files = [
  path.join(ROOT, "data/published.json"),
  path.join(ROOT, "public/campaigns/lo_golden_pax.json"),
];

for (const p of files) {
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  const fac = j.factions.find((f) => f.id === FACTION);
  if (!fac) {
    console.error("no faction in", p);
    continue;
  }
  fac.password = "Archon";
  fac.fullMapVision = false;

  let added = 0;
  let stripped = 0;
  for (const s of j.systems) {
    const vis = new Set(s.visibleToFactionIds || []);
    const shouldSee = VISIBLE.has(s.name);
    const had = vis.has(FACTION);
    if (shouldSee) {
      if (!had) {
        vis.add(FACTION);
        added++;
      }
    } else if (had) {
      vis.delete(FACTION);
      stripped++;
    }
    s.visibleToFactionIds = [...vis];
  }

  j.meta.updatedAt = new Date().toISOString();
  j.meta.tableRevision = (j.meta.tableRevision || 0) + 1;
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + "\n");

  const visibleNow = j.systems
    .filter((s) => (s.visibleToFactionIds || []).includes(FACTION))
    .map((s) => s.name)
    .sort();
  console.log(path.basename(p), "rev", j.meta.tableRevision, "pass", fac.password);
  console.log("  visible:", visibleNow.join(", "));
  console.log("  added", added, "stripped", stripped);

  // Sanity: player would see only these (+ owned auto)
  const owned = new Set(
    j.systems.filter((s) => s.ownerFactionId === FACTION).map((s) => s.id),
  );
  const seen = new Set(
    j.systems
      .filter(
        (s) =>
          s.ownerFactionId === FACTION ||
          (s.visibleToFactionIds || []).includes(FACTION),
      )
      .map((s) => s.name),
  );
  for (const f of j.fleets || []) {
    if (f.factionId === FACTION) {
      const sys = j.systems.find((s) => s.id === f.systemId);
      if (sys) seen.add(sys.name);
    }
  }
  console.log("  player sees", seen.size, "systems:", [...seen].sort().join(", "));
  console.log("  owned count", owned.size);
}

const fogPath = path.join(ROOT, "data/fog-masks.json");
const fog = JSON.parse(fs.readFileSync(fogPath, "utf8"));
fog.masks = fog.masks || {};
fog.masks[FACTION] = [];
fs.writeFileSync(fogPath, JSON.stringify(fog, null, 2) + "\n");
console.log("fog-masks: empty mask for", FACTION);
