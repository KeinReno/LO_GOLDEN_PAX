/** Quick Bios top-up for Karned after t20 tech grant. */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { loadContent, getContent } from "../server/contentLoader.mjs";
import { computeFlowBreakdown } from "../server/economyTick.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FACTION = "faction_karned";
const files = [
  path.join(ROOT, "data/published.json"),
  path.join(ROOT, "data/campaign-draft.json"),
  path.join(ROOT, "public/campaigns/lo_golden_pax.json"),
];
const LEDGER = path.join(ROOT, "data/ledger.json");
const uuid = () => crypto.randomUUID();

loadContent();
let w0 = null;
for (const f of files) {
  const w = JSON.parse(fs.readFileSync(f, "utf8"));
  for (const s of w.systems || []) {
    if (s.ownerFactionId !== FACTION) continue;
    for (const p of s.planets || []) {
      if (!(p.population > 0)) continue;
      let labs = 0;
      p.surfaceBuildings = (p.surfaceBuildings || []).filter((b) => {
        if (b.buildingId === "bios.medical") return false;
        if (
          b.buildingId === "bios.biolab" ||
          (b.kind === "lab" &&
            b.buildingId !== "cognitio.archaeology" &&
            !/архив|archaeology/i.test(b.name || ""))
        ) {
          labs += 1;
          return labs <= 1;
        }
        return true;
      });
      p.orbitalBuildings = p.orbitalBuildings || [];
      for (let i = 0; i < 10; i++) {
        p.surfaceBuildings.push({
          id: uuid(),
          name: `Агро t20 ${p.name}`,
          kind: "farm",
          zone: "surface",
        });
      }
      for (let i = 0; i < 3; i++) {
        p.orbitalBuildings.push({
          id: uuid(),
          name: `Гидро t20 ${p.name}`,
          kind: "farm",
          zone: "orbital",
          buildingId: "bios.hydroponics",
        });
      }
      p.surfaceSlots = Math.max(p.surfaceSlots ?? 8, p.surfaceBuildings.length + 2);
      p.orbitalSlots = Math.max(p.orbitalSlots ?? 4, p.orbitalBuildings.length + 2);
    }
  }
  // sync karned legion composition
  for (const l of w.legions || []) {
    if (l.factionId !== FACTION) continue;
    const next = Math.min(80, Math.max(8, Number(l.strength) || 80));
    l.strength = next;
    if (l.composition?.length === 1) l.composition[0].count = next;
    else
      l.composition = [
        { defId: "unit.generic_line", count: next, hp: 100, xp: 0, level: 0 },
      ];
  }
  fs.writeFileSync(f, JSON.stringify(w, null, 2) + "\n", "utf8");
  console.log("wrote", path.basename(f));
  if (!w0) w0 = w;
}
const led = JSON.parse(fs.readFileSync(LEDGER, "utf8"));
led.factions[FACTION].stocks["currency.bios"] = Math.max(
  Number(led.factions[FACTION].stocks["currency.bios"] || 0),
  220,
);
fs.writeFileSync(LEDGER, JSON.stringify(led, null, 2) + "\n", "utf8");
const bd = computeFlowBreakdown(w0, FACTION, getContent(), led.factions[FACTION]);
console.log(
  "NETS",
  Object.fromEntries(
    Object.entries(bd.totals).map(([k, v]) => [k, Math.round(v.net * 10) / 10]),
  ),
);
console.log("all+", Object.values(bd.totals).every((v) => v.net >= 0));
