/**
 * Generate content/core/units.json + ships.json — baseline force ladder.
 * Costs: runtime forceEconomy (metalByTier × mult). Stats scale ~even with tier.
 * Re-runnable. Spec: docs/BALANCE_BASELINE_SPEC.md
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const UNITS_OUT = path.join(ROOT, "content/core/units.json");
const SHIPS_OUT = path.join(ROOT, "content/core/ships.json");

const RACE_SHIP = {
  race_belator: { statsMult: { armor: 1.15 }, suffix: "belator" },
  race_synth: { statsMult: { hp: 0.9, accuracy: 1.15 }, suffix: "synth" },
  race_human: { statsMult: { damage: 1.05 }, suffix: "human" },
  race_karned: { statsMult: { armor: 1.2, damage: 0.95 }, suffix: "karned" },
  race_psionic: { statsMult: { damage: 1.12, shields: 1.1 }, suffix: "psionic" },
  race_swarm: { statsMult: { hp: 0.85, damage: 1.1 }, suffix: "swarm" },
  race_voidborn: { statsMult: { accuracy: 1.1, hp: 0.95 }, suffix: "voidborn" },
};

const RACE_UNIT = {
  race_belator: { statsMult: { defense: 1.15 }, name: "Легион Белатора" },
  race_synth: { statsMult: { hp: 0.9, speed: 1.2 }, name: "Синт-дрон" },
  race_human: { statsMult: { damage: 1.05 }, name: "Колониальная пехота" },
  race_karned: { statsMult: { defense: 1.2, speed: 0.9 }, name: "Каменная когорта" },
  race_psionic: { statsMult: { damage: 1.15, hp: 0.9 }, name: "Пси-кадр" },
  race_swarm: { statsMult: { hp: 0.85, damage: 1.1 }, name: "Роевая биомасса" },
  race_voidborn: { statsMult: { accuracy: 1.1, hp: 0.95 }, name: "Войд-скитальцы" },
};

function withRaceShip(def) {
  const raceVariants = {};
  for (const [id, v] of Object.entries(RACE_SHIP)) {
    raceVariants[id] = {
      statsMult: v.statsMult,
      name: `${def.name} · ${v.suffix}`,
    };
  }
  return { ...def, raceVariants };
}

function withRaceUnit(def) {
  const raceVariants = {};
  for (const [id, v] of Object.entries(RACE_UNIT)) {
    raceVariants[id] = {
      statsMult: v.statsMult,
      name: def.stationary ? `${v.name} · ${def.name}` : v.name,
    };
  }
  return { ...def, raceVariants };
}

function slot(role, require, count) {
  return { role, require, count };
}

function upkeep(require, count = 1) {
  return { require, count, per: "turn" };
}

/** @type {Record<string, object>} */
const UNITS_RAW = {
  "unit.militia": {
    id: "unit.militia",
    name: "Ополчение",
    faction: "generic",
    tier: 1,
    roles: ["infantry", "militia"],
    stats: { damage: 8, defense: 8, hp: 70, speed: 4 },
    targeting: "infantry_first",
    theaterMult: { ground: 1, assault: 0.85, space: 0 },
    slots: [
      slot("hull", { properties: ["strong"], tier: ">=1" }, 2),
      slot("weapon", { properties: ["weapon"], tier: ">=1" }, 1),
      slot("crew", { category: "E", tier: ">=1" }, 2),
    ],
    upkeep_slots: [upkeep({ category: "E", tier: ">=1" }, 1)],
    signature: "Стартовый десант; дёшев",
    tradeoff: "слаб против гарнизона",
  },
  "unit.generic_line": {
    id: "unit.generic_line",
    name: "Линейная пехота",
    faction: "generic",
    tier: 2,
    roles: ["infantry"],
    stats: { damage: 12, defense: 12, hp: 100, speed: 5 },
    targeting: "infantry_first",
    theaterMult: { ground: 1, assault: 1, space: 0 },
    slots: [
      slot("hull", { properties: ["strong"], tier: ">=1" }, 3),
      slot("weapon", { properties: ["weapon"], tier: ">=1" }, 2),
      slot("crew", { category: "E", tier: ">=2" }, 3),
    ],
    upkeep_slots: [upkeep({ category: "E", tier: ">=2" }, 1)],
  },
  "unit.garrison": {
    id: "unit.garrison",
    name: "Гарнизон",
    faction: "generic",
    tier: 3,
    roles: ["garrison", "infantry"],
    stats: { damage: 10, defense: 20, hp: 120, speed: 3 },
    targeting: "assault_first",
    theaterMult: { ground: 1.1, assault: 0.9, space: 0 },
    slots: [
      slot("hull", { properties: ["strong"], tier: ">=2" }, 5),
      slot("weapon", { properties: ["weapon"], tier: ">=2" }, 2),
      slot("crew", { category: "E", tier: ">=2" }, 3),
    ],
    upkeep_slots: [upkeep({ category: "E", tier: ">=2" }, 1)],
  },
  "unit.planetary_gun": {
    id: "unit.planetary_gun",
    name: "Планетарное орудие",
    faction: "generic",
    tier: 3,
    roles: ["garrison", "emplacement"],
    stationary: true,
    stats: { damage: 18, defense: 30, hp: 200, speed: 0 },
    targeting: "assault_first",
    theaterMult: { ground: 1, assault: 1, space: 0 },
    slots: [
      slot("hull", { properties: ["strong"], tier: ">=2" }, 4),
      slot("weapon", { properties: ["weapon_amp"], tier: ">=2" }, 3),
    ],
    upkeep_slots: [upkeep({ category: "D", tier: ">=2" }, 1)],
  },
  "unit.bunker": {
    id: "unit.bunker",
    name: "Бункер",
    faction: "generic",
    tier: 3,
    roles: ["garrison", "fortification"],
    stationary: true,
    stats: { damage: 6, defense: 40, hp: 260, speed: 0 },
    targeting: "assault_first",
    theaterMult: { ground: 1.2, assault: 0.7, space: 0 },
    slots: [
      slot("hull", { properties: ["strong"], tier: ">=2" }, 6),
      slot("weapon", { properties: ["weapon"], tier: ">=1" }, 1),
    ],
    upkeep_slots: [upkeep({ category: "E", tier: ">=1" }, 1)],
  },
  "unit.breach_cadre": {
    id: "unit.breach_cadre",
    name: "Штурмовой кадр",
    faction: "generic",
    tier: 4,
    roles: ["assault", "infantry"],
    stats: { damage: 22, defense: 14, hp: 100, speed: 6 },
    targeting: "garrison_first",
    theaterMult: { ground: 1, assault: 1.2, space: 0 },
    slots: [
      slot("hull", { properties: ["strong"], tier: ">=3" }, 4),
      slot("weapon", { properties: ["weapon_amp"], tier: ">=3" }, 3),
      slot("crew", { category: "E", tier: ">=3" }, 4),
    ],
    upkeep_slots: [upkeep({ category: "E", tier: ">=3" }, 1)],
  },
  "unit.shield_dome": {
    id: "unit.shield_dome",
    name: "Щитовой купол",
    faction: "generic",
    tier: 4,
    roles: ["garrison", "fortification"],
    stationary: true,
    stats: { damage: 4, defense: 50, hp: 300, speed: 0 },
    targeting: "assault_first",
    theaterMult: { ground: 1.15, assault: 0.6, space: 0 },
    slots: [
      slot("hull", { properties: ["strong"], tier: ">=3" }, 5),
      slot("shield", { properties: ["shield"], tier: ">=3" }, 4),
    ],
    upkeep_slots: [upkeep({ category: "D", tier: ">=3" }, 2)],
  },
  "unit.armor_cadre": {
    id: "unit.armor_cadre",
    name: "Бронекадр",
    faction: "generic",
    tier: 5,
    roles: ["vehicle", "assault"],
    stats: { damage: 28, defense: 26, hp: 160, speed: 5 },
    targeting: "garrison_first",
    theaterMult: { ground: 1.05, assault: 1.15, space: 0 },
    slots: [
      slot("hull", { properties: ["strong"], tier: ">=4" }, 6),
      slot("armor", { properties: ["strong", "malleable"], tier: ">=3" }, 3),
      slot("weapon", { properties: ["weapon_amp"], tier: ">=4" }, 3),
      slot("crew", { category: "E", tier: ">=3" }, 3),
    ],
    upkeep_slots: [
      upkeep({ category: "D", tier: ">=3" }, 1),
      upkeep({ category: "E", tier: ">=3" }, 1),
    ],
    signature: "Мобильная броня; outfitable",
    tradeoff: "дороже пехоты того же тира",
  },
  "unit.heavy_legion": {
    id: "unit.heavy_legion",
    name: "Тяжёлый легион",
    faction: "generic",
    tier: 6,
    roles: ["infantry", "line"],
    stats: { damage: 32, defense: 28, hp: 180, speed: 4 },
    targeting: "infantry_first",
    theaterMult: { ground: 1.1, assault: 1.05, space: 0 },
    slots: [
      slot("hull", { properties: ["strong"], tier: ">=5" }, 7),
      slot("weapon", { properties: ["weapon_amp"], tier: ">=5" }, 4),
      slot("crew", { category: "E", tier: ">=4" }, 5),
      slot("tactic", { category: "F", tier: ">=3" }, 1),
    ],
    upkeep_slots: [upkeep({ category: "E", tier: ">=4" }, 2)],
    requireProperties: ["heavy_legion"],
  },
};

/** @type {Record<string, object>} */
const SHIPS_RAW = {
  "ship.scout": {
    id: "ship.scout",
    name: "Разведчик",
    faction: "generic",
    tier: 1,
    roles: ["screen"],
    stats: { damage: 4, armor: 4, shields: 2, hp: 22, accuracy: 65 },
    targeting: "screen_first",
    theaterMult: { space: 1, assault: 0.15, ground: 0 },
    slots: [
      slot("hull", { properties: ["strong"], tier: ">=1" }, 2),
      slot("weapon", { properties: ["weapon"], tier: ">=1" }, 1),
      slot("reactor", { properties: ["energy"], tier: ">=1" }, 1),
      slot("crew", { category: "E", tier: ">=1" }, 1),
    ],
    upkeep_slots: [upkeep({ properties: ["fuel"], tier: ">=1" }, 1)],
    signature: "Стартовый экран / разведка",
    tradeoff: "почти без брони",
  },
  "ship.patrol": {
    id: "ship.patrol",
    name: "Патруль",
    faction: "generic",
    tier: 2,
    roles: ["screen"],
    stats: { damage: 6, armor: 7, shields: 4, hp: 30, accuracy: 62 },
    targeting: "screen_first",
    theaterMult: { space: 1, assault: 0.2, ground: 0 },
    slots: [
      slot("hull", { properties: ["strong"], tier: ">=1" }, 2),
      slot("weapon", { properties: ["weapon"], tier: ">=1" }, 2),
      slot("shield", { properties: ["shield"], tier: ">=1" }, 1),
      slot("reactor", { properties: ["energy"], tier: ">=1" }, 1),
      slot("crew", { category: "E", tier: ">=1" }, 2),
    ],
    upkeep_slots: [upkeep({ properties: ["fuel"], tier: ">=1" }, 1)],
  },
  "ship.corvette": {
    id: "ship.corvette",
    name: "Корвет",
    faction: "generic",
    tier: 3,
    roles: ["screen"],
    stats: { damage: 8, armor: 10, shields: 5, hp: 40, accuracy: 60 },
    targeting: "screen_first",
    theaterMult: { space: 1, assault: 0.3, ground: 0 },
    slots: [
      slot("hull", { properties: ["strong"], tier: ">=2" }, 3),
      slot("weapon", { properties: ["weapon_amp"], tier: ">=2" }, 2),
      slot("shield", { properties: ["shield"], tier: ">=2" }, 1),
      slot("reactor", { properties: ["energy"], tier: ">=2" }, 1),
      slot("crew", { category: "E", tier: ">=2" }, 2),
    ],
    upkeep_slots: [upkeep({ properties: ["fuel"], tier: ">=2" }, 1)],
  },
  "ship.frigate": {
    id: "ship.frigate",
    name: "Фрегат",
    faction: "generic",
    tier: 4,
    roles: ["screen", "line"],
    stats: { damage: 14, armor: 18, shields: 12, hp: 70, accuracy: 55 },
    targeting: "screen_first",
    theaterMult: { space: 1, assault: 0.4, ground: 0 },
    slots: [
      slot("hull", { properties: ["strong"], tier: ">=3" }, 5),
      slot("weapon", { properties: ["weapon_amp"], tier: ">=3" }, 3),
      slot("shield", { properties: ["shield"], tier: ">=3" }, 2),
      slot("reactor", { properties: ["energy"], tier: ">=3" }, 2),
      slot("engine", { properties: ["accelerate"], tier: ">=3" }, 1),
      slot("crew", { category: "E", tier: ">=3" }, 3),
    ],
    upkeep_slots: [upkeep({ properties: ["fuel"], tier: ">=3" }, 1)],
  },
  "ship.destroyer": {
    id: "ship.destroyer",
    name: "Эсминец",
    faction: "generic",
    tier: 5,
    roles: ["line"],
    stats: { damage: 20, armor: 26, shields: 18, hp: 95, accuracy: 52 },
    targeting: "line_first",
    theaterMult: { space: 1, assault: 0.5, ground: 0 },
    slots: [
      slot("hull", { properties: ["strong"], tier: ">=4" }, 6),
      slot("weapon", { properties: ["weapon_amp"], tier: ">=4" }, 4),
      slot("shield", { properties: ["shield"], tier: ">=3" }, 2),
      slot("reactor", { properties: ["energy"], tier: ">=4" }, 2),
      slot("engine", { properties: ["accelerate"], tier: ">=3" }, 1),
      slot("crew", { category: "E", tier: ">=3" }, 4),
    ],
    upkeep_slots: [
      upkeep({ properties: ["fuel"], tier: ">=3" }, 1),
      upkeep({ category: "E", tier: ">=3" }, 1),
    ],
    signature: "Средняя линия до крейсера",
    tradeoff: "слабее capital 1v1",
  },
  "ship.cruiser": {
    id: "ship.cruiser",
    name: "Крейсер",
    faction: "generic",
    tier: 6,
    roles: ["line"],
    stats: { damage: 28, armor: 35, shields: 30, hp: 120, accuracy: 50 },
    targeting: "line_first",
    theaterMult: { space: 1, assault: 0.6, ground: 0 },
    slots: [
      slot("hull", { properties: ["strong"], tier: ">=5" }, 8),
      slot("armor", { properties: ["strong", "malleable"], tier: ">=4" }, 4),
      slot("weapon", { properties: ["weapon_amp"], tier: ">=5" }, 4),
      slot("shield", { properties: ["shield"], tier: ">=4" }, 3),
      slot("reactor", { properties: ["energy"], tier: ">=5" }, 2),
      slot("engine", { properties: ["accelerate"], tier: ">=4" }, 1),
      slot("crew", { category: "E", tier: ">=4" }, 5),
      slot("tactic", { category: "F", tier: ">=4" }, 1),
    ],
    upkeep_slots: [
      upkeep({ properties: ["fuel"], tier: ">=4" }, 1),
      upkeep({ category: "E", tier: ">=3" }, 2),
    ],
  },
  "ship.battleship": {
    id: "ship.battleship",
    name: "Линкор",
    faction: "generic",
    tier: 7,
    roles: ["capital"],
    stats: { damage: 55, armor: 60, shields: 45, hp: 220, accuracy: 45 },
    targeting: "capital_first",
    theaterMult: { space: 1, assault: 0.8, ground: 0 },
    slots: [
      slot("hull", { properties: ["strong"], tier: ">=6" }, 12),
      slot("armor", { properties: ["strong", "malleable"], tier: ">=5" }, 6),
      slot("weapon", { properties: ["weapon_amp"], tier: ">=6" }, 6),
      slot("shield", { properties: ["shield"], tier: ">=5" }, 4),
      slot("reactor", { properties: ["energy"], tier: ">=6" }, 3),
      slot("engine", { properties: ["accelerate"], tier: ">=5" }, 2),
      slot("crew", { category: "E", tier: ">=5" }, 8),
      slot("tactic", { category: "F", tier: ">=5" }, 2),
    ],
    upkeep_slots: [
      upkeep({ properties: ["fuel"], tier: ">=5" }, 2),
      upkeep({ category: "E", tier: ">=4" }, 3),
    ],
    requireProperties: ["battleship_keel"],
  },
  "ship.carrier": {
    id: "ship.carrier",
    name: "Носитель",
    faction: "generic",
    tier: 7,
    roles: ["carrier"],
    stats: { damage: 20, armor: 25, shields: 35, hp: 180, accuracy: 40 },
    targeting: "screen_first",
    theaterMult: { space: 1, assault: 0.5, ground: 0 },
    slots: [
      slot("hull", { properties: ["strong"], tier: ">=5" }, 10),
      slot("shield", { properties: ["shield"], tier: ">=5" }, 5),
      slot("reactor", { properties: ["energy"], tier: ">=5" }, 3),
      slot("crew", { category: "E", tier: ">=5" }, 10),
      slot("tactic", { category: "F", tier: ">=5" }, 2),
    ],
    upkeep_slots: [
      upkeep({ properties: ["fuel"], tier: ">=5" }, 2),
      upkeep({ category: "E", tier: ">=4" }, 4),
    ],
  },
  "ship.psi_cruiser": {
    id: "ship.psi_cruiser",
    name: "Пси-крейсер",
    faction: "generic",
    tier: 7,
    roles: ["line", "psi"],
    stats: { damage: 40, armor: 30, shields: 60, hp: 150, accuracy: 55 },
    targeting: "line_first",
    theaterMult: { space: 1, assault: 0.7, ground: 0 },
    slots: [
      slot("hull", { properties: ["strong"], tier: ">=5" }, 8),
      slot("weapon", { properties: ["weapon"], tier: ">=5" }, 3),
      slot("shield", { properties: ["psion_emit"], tier: ">=6" }, 4),
      slot("reactor", { properties: ["energy"], tier: ">=5" }, 2),
      slot("tactic", { properties: ["psion_store"], tier: ">=6" }, 2),
      slot("crew", { category: "E", tier: ">=5" }, 5),
    ],
    upkeep_slots: [
      upkeep({ properties: ["fuel"], tier: ">=4" }, 1),
      upkeep({ properties: ["psion_emit"], tier: ">=6" }, 1),
    ],
    signature: "Псион-щиты; specialty",
    tradeoff: "требует псион-ресурсы/расу",
  },
  "ship.dreadnought": {
    id: "ship.dreadnought",
    name: "Дредноут",
    faction: "generic",
    tier: 8,
    roles: ["capital", "bombard"],
    stats: { damage: 90, armor: 95, shields: 70, hp: 380, accuracy: 40 },
    targeting: "capital_first",
    theaterMult: { space: 1, assault: 1.0, ground: 0 },
    slots: [
      slot("hull", { properties: ["strong"], tier: ">=7" }, 18),
      slot("armor", { properties: ["strong", "malleable"], tier: ">=6" }, 10),
      slot("weapon", { properties: ["weapon_amp"], tier: ">=7" }, 10),
      slot("shield", { properties: ["shield"], tier: ">=6" }, 6),
      slot("reactor", { properties: ["energy"], tier: ">=7" }, 5),
      slot("engine", { properties: ["accelerate"], tier: ">=6" }, 3),
      slot("crew", { category: "E", tier: ">=6" }, 12),
      slot("tactic", { category: "F", tier: ">=6" }, 3),
    ],
    upkeep_slots: [
      upkeep({ properties: ["fuel"], tier: ">=6" }, 3),
      upkeep({ category: "E", tier: ">=5" }, 4),
    ],
    signature: "T8 столб флота",
    tradeoff: "огромный upkeep",
  },
  "ship.black_iron": {
    id: "ship.black_iron",
    name: "Чёрное Железо",
    faction: "generic",
    tier: 9,
    roles: ["capital"],
    stats: { damage: 120, armor: 120, shields: 80, hp: 500, accuracy: 38 },
    targeting: "capital_first",
    theaterMult: { space: 1, assault: 1.0, ground: 0 },
    slots: [
      slot("hull", { properties: ["strong"], tier: ">=8" }, 24),
      slot("armor", { properties: ["strong", "malleable"], tier: ">=7" }, 14),
      slot("weapon", { properties: ["matter_destroy"], tier: ">=8" }, 8),
      slot("shield", { properties: ["shield"], tier: ">=7" }, 8),
      slot("reactor", { properties: ["energy"], tier: ">=8" }, 6),
      slot("engine", { properties: ["accelerate"], tier: ">=7" }, 4),
      slot("crew", { category: "E", tier: ">=7" }, 16),
      slot("tactic", { category: "F", tier: ">=7" }, 4),
    ],
    upkeep_slots: [
      upkeep({ properties: ["fuel"], tier: ">=7" }, 4),
      upkeep({ category: "E", tier: ">=6" }, 5),
    ],
    signature: "T9 флагман",
    tradeoff: "требует late tech / экзотику",
    requireProperties: ["black_iron_keel"],
  },
};

const UNITS = Object.fromEntries(
  Object.entries(UNITS_RAW).map(([k, v]) => [k, withRaceUnit(v)]),
);
const SHIPS = Object.fromEntries(
  Object.entries(SHIPS_RAW).map(([k, v]) => [k, withRaceShip(v)]),
);

fs.writeFileSync(UNITS_OUT, JSON.stringify(UNITS, null, 2) + "\n", "utf8");
fs.writeFileSync(SHIPS_OUT, JSON.stringify(SHIPS, null, 2) + "\n", "utf8");
console.log("Wrote", Object.keys(UNITS).length, "units →", UNITS_OUT);
console.log("Wrote", Object.keys(SHIPS).length, "ships →", SHIPS_OUT);
