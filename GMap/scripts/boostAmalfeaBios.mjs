import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { loadContent, getContent } from "../server/contentLoader.mjs";
import { computeFlowBreakdown } from "../server/economyTick.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const FACTION = "faction_amalfea";
const uuid = () => crypto.randomUUID();
const files = [
  path.join(ROOT, "data/published.json"),
  path.join(ROOT, "data/campaign-draft.json"),
  path.join(ROOT, "public/campaigns/lo_golden_pax.json"),
];
const LEDGER = path.join(ROOT, "data/ledger.json");

function b(name, kind, zone, buildingId) {
  const o = { id: uuid(), name, kind, zone: zone || "surface" };
  if (buildingId) o.buildingId = buildingId;
  return o;
}

function boost(world) {
  for (const sys of world.systems || []) {
    if (sys.ownerFactionId !== FACTION) continue;
    for (const p of sys.planets || []) {
      if (!(p.population > 0)) continue;
      p.surfaceBuildings = p.surfaceBuildings || [];
      p.orbitalBuildings = p.orbitalBuildings || [];
      const major = p.population >= 100000;
      const farms = major ? 16 : 10;
      const hydros = major ? 10 : 5;
      const geos = major ? 20 : 12;
      for (let i = 0; i < farms; i++) {
        p.surfaceBuildings.push(b(`Агробуст ${p.name}`, "farm"));
      }
      for (let i = 0; i < geos; i++) {
        p.surfaceBuildings.push(
          b(`Геобуст ${p.name}`, "factory", "surface", "energia.geo_hydro"),
        );
      }
      for (let i = 0; i < hydros; i++) {
        p.orbitalBuildings.push(
          b(`Гидробуст ${p.name}`, "farm", "orbital", "bios.hydroponics"),
        );
      }
      // лишнее жильё раздувает Bios demand (fed = min(pop, cap))
      const maxResid = p.population >= 200000 ? 4 : p.population >= 80000 ? 3 : 2;
      let resid = 0;
      let labs = 0;
      let medical = 0;
      p.surfaceBuildings = p.surfaceBuildings.filter((x) => {
        if (x.buildingId === "bios.biolab" || (x.kind === "lab" && x.buildingId !== "cognitio.archaeology")) {
          labs += 1;
          return labs <= 1;
        }
        if (x.buildingId === "bios.medical") {
          medical += 1;
          return medical <= 1;
        }
        if (x.kind === "residential" && !x.buildingId) {
          resid += 1;
          return resid <= maxResid;
        }
        return true;
      });
      p.surfaceSlots = Math.max(p.surfaceSlots ?? 8, p.surfaceBuildings.length + 2);
      p.orbitalSlots = Math.max(p.orbitalSlots ?? 4, p.orbitalBuildings.length + 2);
    }
  }
}

loadContent();
let w0 = null;
for (const f of files) {
  const w = JSON.parse(fs.readFileSync(f, "utf8"));
  boost(w);
  fs.writeFileSync(f, JSON.stringify(w, null, 2) + "\n", "utf8");
  console.log("boosted", path.basename(f));
  if (!w0) w0 = w;
}
const led = JSON.parse(fs.readFileSync(LEDGER, "utf8"));
const eco = led.factions[FACTION];
eco.stocks["currency.bios"] = Math.max(Number(eco.stocks["currency.bios"] || 0), 220);
eco.stocks["currency.cognitio"] = Math.max(
  Number(eco.stocks["currency.cognitio"] || 0),
  5000,
);
fs.writeFileSync(LEDGER, JSON.stringify(led, null, 2) + "\n", "utf8");
const bd = computeFlowBreakdown(w0, FACTION, getContent(), eco);
console.log(
  "NETS",
  Object.fromEntries(
    Object.entries(bd.totals).map(([k, v]) => [k, Math.round(v.net * 10) / 10]),
  ),
);
console.log("all+", Object.values(bd.totals).every((v) => v.net >= 0));
