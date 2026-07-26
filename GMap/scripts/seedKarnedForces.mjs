/**
 * Карнед: 5 флотов (1 линкор + 4×фрегат) и ровно 1 легион.
 * Население планеты ≠ легионы.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const FACTION = "faction_karned";
const uuid = () => crypto.randomUUID();

const files = [
  path.join(ROOT, "data/published.json"),
  path.join(ROOT, "public/campaigns/lo_golden_pax.json"),
];

for (const file of files) {
  const world = JSON.parse(fs.readFileSync(file, "utf8"));
  const capital = world.systems.find((s) => s.name === "SYS-565");
  if (!capital) {
    console.error("SYS-565 missing in", file);
    continue;
  }

  world.fleets = (world.fleets ?? []).filter((f) => f.factionId !== FACTION);
  world.fleets.push(
    {
      id: uuid(),
      name: "Линкор Карнед",
      factionId: FACTION,
      systemId: capital.id,
      kind: "combat",
      composition: [
        { type: "линкор", count: 1, defId: "ship.battleship" },
      ],
      stance: "defend",
      route: [],
    },
    {
      id: uuid(),
      name: "Фрегат Карнед I",
      factionId: FACTION,
      systemId: capital.id,
      kind: "patrol",
      composition: [{ type: "фрегат", count: 1, defId: "ship.frigate" }],
      stance: "defend",
      route: [],
    },
    {
      id: uuid(),
      name: "Фрегат Карнед II",
      factionId: FACTION,
      systemId: capital.id,
      kind: "patrol",
      composition: [{ type: "фрегат", count: 1, defId: "ship.frigate" }],
      stance: "defend",
      route: [],
    },
    {
      id: uuid(),
      name: "Фрегат Карнед III",
      factionId: FACTION,
      systemId: capital.id,
      kind: "patrol",
      composition: [{ type: "фрегат", count: 1, defId: "ship.frigate" }],
      stance: "idle",
      route: [],
    },
    {
      id: uuid(),
      name: "Фрегат Карнед IV",
      factionId: FACTION,
      systemId: capital.id,
      kind: "patrol",
      composition: [{ type: "фрегат", count: 1, defId: "ship.frigate" }],
      stance: "idle",
      route: [],
    },
  );

  world.legions = (world.legions ?? []).filter((l) => l.factionId !== FACTION);
  world.legions.push({
    id: uuid(),
    name: "Королевский легион Карнед",
    factionId: FACTION,
    systemId: capital.id,
    strength: 5000,
    status: "garrison",
    route: [],
    composition: [
      { defId: "unit.generic_line", count: 5000, hp: 100 },
    ],
  });

  world.meta.updatedAt = new Date().toISOString();
  world.meta.tableRevision = (world.meta.tableRevision || 0) + 1;
  fs.writeFileSync(file, JSON.stringify(world, null, 2) + "\n");
  console.log(
    path.basename(file),
    "fleets",
    world.fleets.filter((f) => f.factionId === FACTION).length,
    "legions",
    world.legions.filter((l) => l.factionId === FACTION).length,
    "rev",
    world.meta.tableRevision,
  );
}
