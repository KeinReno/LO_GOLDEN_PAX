/**
 * One-shot: orphan-module workshops + ion_drive unlock + tactic theater.
 * Run: node scripts/_closeOrphanModules.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CORE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "content", "core");

function read(name) {
  return JSON.parse(fs.readFileSync(path.join(CORE, name), "utf8"));
}
function write(name, data) {
  fs.writeFileSync(path.join(CORE, name), `${JSON.stringify(data, null, 2)}\n`);
}

function workshop(id, name, tier, prop, moduleId, cost, signature, tradeoff) {
  return {
    id,
    kind: "forge",
    zone: "surface",
    name,
    ap: 1,
    category: "C",
    tier,
    laborSlots: Math.min(4, tier + 1),
    faction: "generic",
    maxPerPlanet: 1,
    requireProperties: [prop],
    cost,
    effects: [{ effect: "production_flat", args: { resource: moduleId, amount: 1 } }],
    slots: [{ role: "structure", require: { category: "B", tier: ">=1" }, count: 4 }],
    upkeep_slots: [{ require: { category: "E", tier: ">=1" }, count: 1, per: "turn" }],
    signature,
    tradeoff,
  };
}

const extra = {
  "building.ion_yard": workshop(
    "building.ion_yard",
    "Ионный двор",
    2,
    "ion_drive",
    "module.space.ion_drive",
    { "currency.metal": 18, "currency.supply": 8, "currency.industria": 3 },
    "Ионный привод флота 1/ход",
    "не термояд",
  ),
  "building.scanner_bay": workshop(
    "building.scanner_bay",
    "Сканерная бухта",
    3,
    "info_store",
    "module.space.deep_scanner",
    { "currency.metal": 20, "currency.supply": 7, "currency.industria": 3 },
    "Глубинный сканер в слот тактики",
    "не орудие",
  ),
  "building.laser_armory": workshop(
    "building.laser_armory",
    "Лазерная оружейная",
    2,
    "laser",
    "module.ground.laser_rifle",
    { "currency.metal": 15, "currency.supply": 6, "currency.industria": 2 },
    "Карабин легиона 1/ход",
    "не корабельный луч",
  ),
  "building.at_works": workshop(
    "building.at_works",
    "ПТ-двор",
    2,
    "missile",
    "module.ground.at_launcher",
    { "currency.metal": 16, "currency.supply": 7, "currency.industria": 2 },
    "ПТ-пусковая легиона",
    "не корабельная кассета",
  ),
  "building.ablative_shop": workshop(
    "building.ablative_shop",
    "Абляционный цех",
    2,
    "armor_kit",
    "module.ground.ablative_plate",
    { "currency.metal": 16, "currency.supply": 6, "currency.industria": 2 },
    "Пластины легиона T2",
    "не обшивка корпуса",
  ),
  "building.track_works": workshop(
    "building.track_works",
    "Гусеничный двор",
    3,
    "armor_cadre",
    "module.ground.track_drive",
    { "currency.metal": 18, "currency.supply": 8, "currency.industria": 3 },
    "Привод бронекадра",
    "не корабельный двигатель",
  ),
};

const buildings = read("buildings.json");
for (const [id, def] of Object.entries(extra)) {
  if (buildings[id]) throw new Error(`exists ${id}`);
  buildings[id] = def;
}
write("buildings.json", buildings);

const techs = read("technologies.json");
const ion = techs["tech.military.ion_drive"];
if (!ion) throw new Error("missing ion_drive tech");
ion.effects = ion.effects || [];
if (!ion.effects.some((e) => e.effect === "unlock_property" && e.args?.property === "ion_drive")) {
  ion.effects.push({ effect: "unlock_property", args: { property: "ion_drive" } });
}
write("technologies.json", techs);

const ships = read("ships.json");
let tactic = 0;
for (const ship of Object.values(ships)) {
  for (const slot of ship.slots || []) {
    if (slot.role !== "tactic") continue;
    slot.require = slot.require || {};
    slot.require.theater = "space";
    tactic += 1;
  }
}
write("ships.json", ships);

const mods = read("modules.json");
const ionMod = mods["module.space.ion_drive"];
if (ionMod && !ionMod.properties.includes("ion_drive")) ionMod.properties.push("ion_drive");
write("modules.json", mods);

console.log(JSON.stringify({ buildings: Object.keys(extra).length, tacticSlots: tactic }));
