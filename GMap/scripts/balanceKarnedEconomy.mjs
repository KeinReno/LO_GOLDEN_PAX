/**
 * Карнед — повторный баланс в плюс + очистка ghost-pop.
 * Опирается на роли из applyKarnedEconomy, но жёстко держит потоки A–F ≥ 0.
 *
 * Run: node GMap/scripts/balanceKarnedEconomy.mjs
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { loadContent, getContent } from "../server/contentLoader.mjs";
import { recomputeUnlocksFromTechs } from "../server/techActions.mjs";
import { computeFlowBreakdown } from "../server/economyTick.mjs";
import {
  computeLogisticsNetwork,
  resolveCapitalSystemId,
} from "../server/logistics.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const WORLD_FILES = [
  path.join(ROOT, "data/published.json"),
  path.join(ROOT, "data/campaign-draft.json"),
  path.join(ROOT, "public/campaigns/lo_golden_pax.json"),
];
const LEDGER = path.join(ROOT, "data/ledger.json");
const FACTION = "faction_karned";
const uuid = () => crypto.randomUUID();

const MIXED = [
  { raceId: "race_elanor", percent: 1 },
  { raceId: "race_vendir", percent: 5 },
  { raceId: "race_elanis", percent: 28 },
  { raceId: "race_elatris", percent: 4 },
  { raceId: "race_triumvis", percent: 3 },
  { raceId: "race_horn", percent: 9 },
  { raceId: "race_lithoid", percent: 36 },
  { raceId: "race_elacrin", percent: 12 },
  { raceId: "race_eladon", percent: 1 },
  { raceId: "race_bistier", percent: 1 },
];

const EXTRA_TECHS = [
  "tech.geology",
  "tech.deep_prospecting",
  "tech.asteroid_mining",
  "tech.materials_science",
  "tech.pyrometallurgy",
  "tech.industrial_org",
  "tech.modular_construction",
  "tech.energy_grid",
  "tech.plasma_engineering",
  "tech.fusion",
  "tech.hydroponics",
  "tech.medicine",
  "tech.biocatalysis",
  "tech.scientific_charter",
  "tech.archaeology",
  "tech.a_surface_mining",
  "tech.a_ore_extraction",
  "tech.a_mining_networks",
  "tech.d_geothermal_taps",
  "tech.d_solar_arrays",
  "tech.d_power_grid_mgmt",
  "tech.e_agriculture",
  "tech.e_agricultural_automation",
  "tech.e_food_synthesis",
  "tech.e_medical_advances",
  "tech.c_assembly_lines",
  "tech.c_mass_production",
  "tech.c_deep_space_shipyards",
];

function b(name, kind, zone, buildingId) {
  const o = { id: uuid(), name, kind, zone: zone || "surface" };
  if (buildingId) o.buildingId = buildingId;
  return o;
}
const many = (n, factory) => Array.from({ length: n }, () => factory());

function findSys(world, names) {
  const set = new Set(names);
  return world.systems.find((s) => set.has(s.name));
}
function findPlanet(sys, names) {
  if (!sys) return null;
  const set = new Set(names);
  return (
    sys.planets.find((p) => set.has(p.name)) ||
    sys.planets.find((p) => p.colonyType && p.colonyType !== "none") ||
    sys.planets[0]
  );
}

function setColony(planet, { pop, colonyType, notes, surface, orbital, resources, loyalty }) {
  planet.population = pop;
  planet.colonyType = colonyType;
  planet.habitable = true;
  planet.colonizable = true;
  planet.ownerFactionId = FACTION;
  planet.raceComposition = MIXED.map((r) => ({ ...r }));
  planet.loyalty = loyalty ?? 80;
  if (notes) planet.notes = notes;
  if (resources) planet.resources = resources;
  planet.surfaceBuildings = surface;
  planet.orbitalBuildings = orbital || [];
  planet.surfaceSlots = Math.max(planet.surfaceSlots ?? 8, surface.length + 2);
  planet.orbitalSlots = Math.max(planet.orbitalSlots ?? 4, (orbital || []).length + 2);
}

function ensureLogistics(world) {
  const content = getContent();
  const bel = (world.systems || []).filter((s) => s.ownerFactionId === FACTION);
  const strida = bel.find((s) => s.name === "Стрида" || s.name === "SYS-565");
  let capId = resolveCapitalSystemId(world, FACTION) || strida?.id;
  if (strida) capId = strida.id;
  const faction = (world.factions || []).find((f) => f.id === FACTION);
  if (faction) faction.capitalSystemId = capId;
  for (const s of bel) s.isCapital = s.id === capId;

  world.links = world.links || [];
  const existing = new Set();
  for (const l of world.links) {
    existing.add(`${l.fromId}|${l.toId}`);
    existing.add(`${l.toId}|${l.fromId}`);
  }
  const addLink = (a, b) => {
    if (!a || !b || a === b || existing.has(`${a}|${b}`)) return;
    world.links.push({
      id: uuid(),
      fromId: a,
      toId: b,
      type: "corridor",
      fromPlanetId: null,
      toPlanetId: null,
    });
    existing.add(`${a}|${b}`);
    existing.add(`${b}|${a}`);
  };

  for (const s of bel) {
    if (s.id !== capId) addLink(capId, s.id);
    s.spaceObjects = Array.isArray(s.spaceObjects) ? s.spaceObjects : [];
    if (!s.spaceObjects.includes("depot")) s.spaceObjects.push("depot");
    s.spaceObjects = s.spaceObjects.filter((t) => t !== "refugees");
  }
  computeLogisticsNetwork(world, FACTION, content);
  console.log(
    `karned logistics: ${bel.filter((s) => s.logistics?.connectedToCapital).length}/${bel.length}`,
  );
}

function applyLayout(world) {
  // Легион: E3 = ceil(str×0.4) — когорта, не армия 5000
  for (const l of world.legions || []) {
    if (l.factionId !== FACTION) continue;
    l.strength = 80;
    l.notes = "Королевский легион Карнед (игровой контур содержания, ~когорта).";
  }

  ensureLogistics(world);

  // ——— Стрида / Гарденис ———
  {
    const sys = findSys(world, ["Стрида", "SYS-565"]);
    const p = findPlanet(sys, ["Гарденис"]);
    setColony(p, {
      pop: 140,
      colonyType: "core",
      loyalty: 90,
      resources: ["железо", "серебро", "золото"],
      notes:
        "Столица Гарденис. Звезда башен, верфи Стриды, агро + плавильни. Королевский экономический хаб.",
      surface: [
        b("Башня Архонта", "capitol"),
        b("Башня Жреца-Тенепляса", "capitol"),
        b("ПКО · звезда", "defense"),
        b("ПКО · луч", "defense"),
        ...many(4, () => b("Квартал Гарденис", "residential")),
        b("Госпиталь Гарденис", "residential", "surface", "bios.medical"),
        ...many(14, () => b("Агро Гарденис", "farm")),
        ...many(4, () => b("Шахта Гарденис", "mine")),
        b("Плавильня I", "factory", "surface", "materia.smelter"),
        b("Плавильня II", "factory", "surface", "materia.smelter"),
        b("Сборка", "factory", "surface", "industria.assembly"),
        b("Завод", "factory"),
        ...many(20, () =>
          b("Геостанция Гарденис", "factory", "surface", "energia.geo_hydro"),
        ),
        b("Ловец энергии", "factory", "deep", "energia.solar_catcher"),
        b("Казармы", "barracks"),
        b("Храм Серебряной Луны", "residential"),
      ],
      orbital: [
        b("Космопорт Гарденис", "spaceport", "orbital"),
        b("Королевская верфь", "shipyard", "orbital"),
        b("Верфь сопровождения", "shipyard", "orbital"),
        b("Ремонтный док", "shipyard", "orbital", "industria.repair_dock"),
        ...many(8, () =>
          b("Гидропоника Стриды", "farm", "orbital", "bios.hydroponics"),
        ),
        b("Орб. ПКО", "defense", "orbital"),
      ],
    });
  }

  // ——— Корнепеснь: агро ———
  {
    const sys = findSys(world, ["Корнепеснь", "SYS-564"]);
    const terra = findPlanet(sys, ["Терракульт"]);
    setColony(terra, {
      pop: 90,
      colonyType: "colony",
      loyalty: 85,
      resources: ["органическая биомасса", "пища", "железо"],
      notes: "Агро-хаб Карнед. Основной поставщик Bios.",
      surface: [
        b("Управа Терракульт", "capitol"),
        ...many(3, () => b("Жильё", "residential")),
        b("Медпункт", "residential", "surface", "bios.medical"),
        ...many(18, () => b("Агро Терракульт", "farm")),
        ...many(3, () => b("Шахта", "mine")),
        ...many(12, () =>
          b("Гео Терракульт", "factory", "surface", "energia.geo_hydro"),
        ),
        b("Оборона", "defense"),
        b("Храм корней", "residential"),
      ],
      orbital: [
        b("Космопорт", "spaceport", "orbital"),
        ...many(8, () =>
          b("Гидропоника", "farm", "orbital", "bios.hydroponics"),
        ),
      ],
    });
    const bio = findPlanet(sys, ["Биосфера-Полис"]);
    if (bio && bio.id !== terra?.id) {
      setColony(bio, {
        pop: 70,
        colonyType: "colony",
        loyalty: 82,
        resources: ["органическая биомасса", "пища"],
        notes: "Биосфера: лекарства и ферменты.",
        surface: [
          b("Управа Биосфера", "capitol"),
          ...many(2, () => b("Жильё", "residential")),
          b("Медкомплекс", "residential", "surface", "bios.medical"),
          ...many(12, () => b("Агро / ферменты", "farm")),
          ...many(2, () => b("Шахта", "mine")),
          ...many(10, () =>
            b("Гео Биосфера", "factory", "surface", "energia.geo_hydro"),
          ),
          b("Оборона", "defense"),
        ],
        orbital: [
          b("Космопорт", "spaceport", "orbital"),
          ...many(5, () =>
            b("Гидропоника", "farm", "orbital", "bios.hydroponics"),
          ),
        ],
      });
    }
    const mineP = (sys?.planets || []).find(
      (p) =>
        p.id !== terra?.id &&
        p.id !== bio?.id &&
        (p.colonyType === "mining" || /4|руда|пояс|mining/i.test(p.name)),
    );
    if (mineP) {
      setColony(mineP, {
        pop: 40,
        colonyType: "mining",
        loyalty: 78,
        resources: ["железо", "минералы"],
        notes: "Рудный пояс Корнепеснь.",
        surface: [
          b("Жильё шахтёров", "residential"),
          ...many(3, () => b("Агро купол", "farm")),
          ...many(8, () => b("Рудник", "mine")),
          ...many(8, () =>
            b("Гео", "factory", "surface", "energia.geo_hydro"),
          ),
          b("Оборона", "defense"),
        ],
        orbital: [
          b("Космопорт", "spaceport", "orbital"),
          b("Гидропоника", "farm", "orbital", "bios.hydroponics"),
        ],
      });
    }
  }

  // ——— Ауралис: агро ———
  {
    const sys = findSys(world, ["Ауралис", "SYS-561"]);
    const p = findPlanet(sys, ["Вердант"]);
    setColony(p, {
      pop: 80,
      colonyType: "colony",
      loyalty: 84,
      resources: ["органическая биомасса", "пища", "железо"],
      notes: "Вердант — второй агро-контур Карнед.",
      surface: [
        b("Управа Вердант", "capitol"),
        ...many(2, () => b("Жильё", "residential")),
        b("Медпункт", "residential", "surface", "bios.medical"),
        ...many(16, () => b("Агро Вердант", "farm")),
        ...many(3, () => b("Шахта", "mine")),
        ...many(12, () =>
          b("Гео Вердант", "factory", "surface", "energia.geo_hydro"),
        ),
        b("Оборона", "defense"),
      ],
      orbital: [
        b("Космопорт", "spaceport", "orbital"),
        ...many(6, () =>
          b("Гидропоника", "farm", "orbital", "bios.hydroponics"),
        ),
      ],
    });
    const belt = (sys?.planets || []).find(
      (x) => x.id !== p?.id && (x.colonyType === "mining" || /Пояс|mining/i.test(x.name)),
    );
    if (belt) {
      setColony(belt, {
        pop: 35,
        colonyType: "mining",
        loyalty: 76,
        resources: ["железо"],
        notes: "Пояс Ауралис — добыча.",
        surface: [
          b("Жильё", "residential"),
          ...many(2, () => b("Агро", "farm")),
          ...many(6, () => b("Рудник", "mine")),
          ...many(8, () =>
            b("Гео", "factory", "surface", "energia.geo_hydro"),
          ),
          b("Оборона", "defense"),
        ],
        orbital: [
          b("Космопорт", "spaceport", "orbital"),
          b("Гидропоника", "farm", "orbital", "bios.hydroponics"),
        ],
      });
    }
  }

  // ——— Абиссаль: гидро/агро ———
  {
    const sys = findSys(world, ["Абиссаль", "SYS-566"]);
    const p = findPlanet(sys, ["Гидролис"]);
    setColony(p, {
      pop: 75,
      colonyType: "colony",
      loyalty: 83,
      resources: ["вода", "пища", "газ"],
      notes: "Гидролис — океанический агро/энерго контур.",
      surface: [
        b("Управа Гидролис", "capitol"),
        ...many(2, () => b("Жильё", "residential")),
        b("Медпункт", "residential", "surface", "bios.medical"),
        ...many(14, () => b("Агро Гидролис", "farm")),
        ...many(2, () => b("Шахта", "mine")),
        b("Газовый колодец", "mine", "surface", "extract.gas_well"),
        ...many(14, () =>
          b("Гео/гидро Гидролис", "factory", "surface", "energia.geo_hydro"),
        ),
        b("Оборона", "defense"),
      ],
      orbital: [
        b("Космопорт", "spaceport", "orbital"),
        ...many(6, () =>
          b("Гидропоника", "farm", "orbital", "bios.hydroponics"),
        ),
      ],
    });
  }

  // ——— Плазмир: энергия ———
  {
    const sys = findSys(world, ["Плазмир", "SYS-563"]);
    const p = findPlanet(sys, ["Искра"]);
    setColony(p, {
      pop: 60,
      colonyType: "colony",
      loyalty: 80,
      resources: ["газ", "кристаллы", "железо"],
      notes: "Искра — энергохаб Карнед (гео/плазма).",
      surface: [
        b("Управа Искра", "capitol"),
        ...many(2, () => b("Жильё", "residential")),
        b("Медпункт", "residential", "surface", "bios.medical"),
        ...many(6, () => b("Агро", "farm")),
        ...many(4, () => b("Шахта", "mine")),
        ...many(28, () =>
          b("Геостанция Искра", "factory", "surface", "energia.geo_hydro"),
        ),
        b("Ловец", "factory", "deep", "energia.solar_catcher"),
        b("Оборона", "defense"),
      ],
      orbital: [
        b("Космопорт", "spaceport", "orbital"),
        ...many(4, () =>
          b("Гидропоника", "farm", "orbital", "bios.hydroponics"),
        ),
        b("Орб. плазма", "factory", "orbital", "energia.plasma_condenser"),
      ],
    });
  }

  // ——— Голоколь: добыча + ремонт ———
  {
    const sys = findSys(world, ["Голоколь", "SYS-562"]);
    const p = findPlanet(sys, ["Никель-Пост"]);
    setColony(p, {
      pop: 55,
      colonyType: "mining",
      loyalty: 78,
      resources: ["железо", "титан", "минералы"],
      notes: "Никель-Пост — добыча и ремонтный контур.",
      surface: [
        b("Управа", "capitol"),
        ...many(2, () => b("Жильё", "residential")),
        b("Медпункт", "residential", "surface", "bios.medical"),
        ...many(5, () => b("Агро", "farm")),
        ...many(12, () => b("Рудник", "mine")),
        b("Глубинная шахта", "mine", "subsurface", "extract.deep_shaft"),
        b("Плавильня", "factory", "surface", "materia.smelter"),
        ...many(12, () =>
          b("Гео Голоколь", "factory", "surface", "energia.geo_hydro"),
        ),
        b("Оборона", "defense"),
      ],
      orbital: [
        b("Космопорт", "spaceport", "orbital"),
        b("Ремонтный док Голоколь", "shipyard", "orbital", "industria.repair_dock"),
        ...many(3, () =>
          b("Гидропоника", "farm", "orbital", "bios.hydroponics"),
        ),
      ],
    });
  }

  // ——— Нанокарст: добыча + верфи ———
  {
    const sys = findSys(world, ["Нанокарст", "SYS-567"]);
    const p = findPlanet(sys, ["Чёрный Жил"]);
    setColony(p, {
      pop: 65,
      colonyType: "mining",
      loyalty: 79,
      resources: ["железо", "кристаллы", "титан"],
      notes: "Чёрный Жил — добыча и вторичные верфи.",
      surface: [
        b("Управа", "capitol"),
        ...many(2, () => b("Жильё", "residential")),
        b("Медпункт", "residential", "surface", "bios.medical"),
        ...many(5, () => b("Агро", "farm")),
        ...many(10, () => b("Рудник", "mine")),
        b("Кристалл-цех", "factory", "surface", "materia.crystal_workshop"),
        b("Плавильня", "factory", "surface", "materia.smelter"),
        b("Сборка", "factory", "surface", "industria.assembly"),
        ...many(12, () =>
          b("Гео Нанокарст", "factory", "surface", "energia.geo_hydro"),
        ),
        b("Оборона", "defense"),
      ],
      orbital: [
        b("Космопорт", "spaceport", "orbital"),
        b("Верфь Нанокарст I", "shipyard", "orbital"),
        b("Верфь Нанокарст II", "shipyard", "orbital"),
        b("Астероидный харвестер", "mine", "orbital", "extract.asteroid_harvester"),
        ...many(3, () =>
          b("Гидропоника", "farm", "orbital", "bios.hydroponics"),
        ),
      ],
    });
  }

  // ——— Северные форпосты ———
  for (const [sysName, planetName, label] of [
    ["SYS-568", "Северный форпост Карнед", "Север I"],
    ["SYS-569", "Северный форпост Карнед II", "Север II"],
  ]) {
    const sys = findSys(world, [sysName]);
    const p = findPlanet(sys, [planetName]);
    if (!p) continue;
    p.name = planetName;
    setColony(p, {
      pop: 28,
      colonyType: "outpost",
      loyalty: 75,
      resources: ["железо"],
      notes: `${label}: вектор северной экспансии.`,
      surface: [
        b(`Жильё ${label}`, "residential"),
        ...many(3, () => b(`Агро ${label}`, "farm")),
        ...many(2, () => b(`Шахта ${label}`, "mine")),
        ...many(8, () =>
          b(`Гео ${label}`, "factory", "surface", "energia.geo_hydro"),
        ),
        b("Оборона", "defense"),
      ],
      orbital: [
        b("Посадочная", "spaceport", "orbital"),
        b("Гидропоника", "farm", "orbital", "bios.hydroponics"),
      ],
    });
  }

  // Обнулить ghost-pop / пустые миры
  const settled = new Set();
  for (const sys of world.systems || []) {
    if (sys.ownerFactionId !== FACTION) continue;
    for (const p of sys.planets || []) {
      const n =
        (p.surfaceBuildings?.length || 0) + (p.orbitalBuildings?.length || 0);
      if (n > 0 && p.colonyType && p.colonyType !== "none") settled.add(p.id);
    }
  }
  for (const sys of world.systems || []) {
    if (sys.ownerFactionId !== FACTION) continue;
    for (const p of sys.planets || []) {
      if (settled.has(p.id)) continue;
      p.population = 0;
      p.colonyType = "none";
      p.raceComposition = [];
      p.surfaceBuildings = [];
      p.orbitalBuildings = [];
      p.loyalty = 50;
    }
  }

  const f = (world.factions || []).find((x) => x.id === FACTION);
  if (f) {
    const note =
      "Экономика: Гарденис (столица/верфи) · Корнепеснь/Ауралис/Абиссаль (агро) · Плазмир (энергия) · Голоколь/Нанокарст (добыча/верфи). Баланс в плюсе.";
    if (!(f.notes || "").includes("Экономика:")) {
      f.notes = [f.notes, note].filter(Boolean).join("\n");
    }
    if (!(f.gmNotes || "").includes("Economy pass Karned")) {
      f.gmNotes = [
        f.gmNotes,
        "Economy pass Karned: rebels cleared globally separately; legion 80; geo/mine/hydro balanced; techs unlocked; ghost pop zeroed.",
      ]
        .filter(Boolean)
        .join("\n");
    }
  }
  if (world.meta) {
    world.meta.updatedAt = new Date().toISOString();
    world.meta.tableRevision = (world.meta.tableRevision ?? 0) + 1;
  }
}

function patchLedger() {
  const led = JSON.parse(fs.readFileSync(LEDGER, "utf8"));
  const eco = led.factions[FACTION];
  if (!eco) {
    console.warn("no karned ledger");
    return null;
  }
  const techs = getContent().technologies || {};
  const set = new Set(eco.unlockedTechs || []);
  for (const id of EXTRA_TECHS) if (techs[id]) set.add(id);
  eco.unlockedTechs = [...set];
  recomputeUnlocksFromTechs(eco, getContent(), FACTION, world);
  const floor = { A: 6, B: 6, C: 6, D: 6, E: 6, F: 5 };
  for (const [k, v] of Object.entries(floor)) {
    eco.techTiers[k] = Math.max(Number(eco.techTiers[k] ?? 1), v);
  }
  eco.stocks = {
    ...eco.stocks,
    "currency.metal": 32000,
    "currency.supply": 14000,
    "currency.extracta": 160,
    "currency.materia": 140,
    "currency.industria": 100,
    "currency.energia": 220,
    "currency.bios": 160,
    "currency.cognitio": Math.max(Number(eco.stocks["currency.cognitio"] ?? 0), 4000),
    "map.food": 12000,
    "map.biomass": 10000,
    "map.biofuel": 8000,
    "map.buildplex": 12000,
    "map.solari": 8000,
    "map.titan": 5000,
    "map.iron": 10000,
  };
  eco.deficit = null;
  eco.bottlenecks = {};
  eco.pressure = Math.min(eco.pressure ?? 0, 8);
  fs.writeFileSync(LEDGER, JSON.stringify(led, null, 2) + "\n", "utf8");
  console.log("ledger techs", eco.unlockedTechs.length, "tiers", eco.techTiers);
  return eco;
}

function main() {
  loadContent();
  let worldForCheck = null;
  for (const file of WORLD_FILES) {
    if (!fs.existsSync(file)) continue;
    const world = JSON.parse(fs.readFileSync(file, "utf8"));
    applyLayout(world);
    fs.writeFileSync(file, JSON.stringify(world, null, 2) + "\n", "utf8");
    console.log("patched", path.basename(file));
    if (!worldForCheck) worldForCheck = world;
  }
  const eco = patchLedger();
  if (worldForCheck && eco) {
    const bd = computeFlowBreakdown(worldForCheck, FACTION, getContent(), eco);
    console.log(
      "NETS",
      Object.fromEntries(
        Object.entries(bd.totals).map(([k, v]) => [k, Math.round(v.net * 10) / 10]),
      ),
    );
    console.log("all+", Object.values(bd.totals).every((v) => v.net >= 0));
    console.log("bottlenecks", bd.bottlenecks);
  }
}

main();
