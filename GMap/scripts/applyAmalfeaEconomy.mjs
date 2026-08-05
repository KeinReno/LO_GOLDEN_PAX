/**
 * Альянс Амальфея — экономика по лору (II.18):
 * - Столица Амальфа (Gaia): единственный крупный живой мир
 * - Остальное — добыча/переработка (титан, кристаллы, редкоземы, биотех)
 * - Без псионики; биокузницы, медицина, агро, интеграция
 * - Потоки A–F в плюсе
 *
 * Run: node GMap/scripts/applyAmalfeaEconomy.mjs
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
const FACTION = "faction_amalfea";
const uuid = () => crypto.randomUUID();

/** Роды-основатели + кальтинцы (люди) + кибер/био-манты (synth). */
const CAPITAL_MIX = [
  { raceId: "race_human", percent: 38 },
  { raceId: "race_horn_narburi", percent: 22 },
  { raceId: "race_horn", percent: 14 },
  { raceId: "race_belator", percent: 12 },
  { raceId: "race_synth", percent: 9 },
  { raceId: "race_hybrid.belator_horn", percent: 5 },
];
const OUTPOST_MIX = [
  { raceId: "race_human", percent: 48 },
  { raceId: "race_horn", percent: 22 },
  { raceId: "race_synth", percent: 20 },
  { raceId: "race_belator", percent: 10 },
];

/** Без псионики — биотех, добыча, промышленность, энергия. */
const EXTRA_TECHS = [
  "tech.geology",
  "tech.deep_prospecting",
  "tech.asteroid_mining",
  "tech.materials_science",
  "tech.pyrometallurgy",
  "tech.crystal_integration",
  "tech.industrial_org",
  "tech.modular_construction",
  "tech.cybernetics",
  "tech.energy_grid",
  "tech.plasma_engineering",
  "tech.fusion",
  "tech.hydroponics",
  "tech.medicine",
  "tech.biocatalysis",
  "tech.xenobiology",
  "tech.scientific_charter",
  "tech.archaeology",
  "tech.a_surface_mining",
  "tech.a_ore_extraction",
  "tech.a_mining_networks",
  "tech.a_crystal_mining",
  "tech.a_rare_earth_extraction",
  "tech.a_geothermal_tapping",
  "tech.d_geothermal_taps",
  "tech.d_solar_arrays",
  "tech.d_power_grid_mgmt",
  "tech.d_thermal_efficiency",
  "tech.e_agriculture",
  "tech.e_agricultural_automation",
  "tech.e_food_synthesis",
  "tech.e_medical_advances",
  "tech.e_bioengineering",
  "tech.e_genetic_engineering",
  "tech.e_ecosystem_mgmt",
  "tech.e_bio_recycling",
  "tech.c_assembly_lines",
  "tech.c_mass_production",
  "tech.c_factory_networks",
  "tech.c_supply_chain_mgmt",
];

function b(name, kind, zone, buildingId) {
  const o = { id: uuid(), name, kind, zone: zone || "surface" };
  if (buildingId) o.buildingId = buildingId;
  return o;
}
const many = (n, factory) => Array.from({ length: n }, () => factory());

function findSys(world, names) {
  const set = new Set(names);
  return (world.systems || []).find((s) => set.has(s.name));
}

function findPlanet(sys, names) {
  if (!sys) return null;
  const set = new Set(names);
  return (
    (sys.planets || []).find((p) => set.has(p.name)) ||
    (sys.planets || []).find((p) => p.colonyType && p.colonyType !== "none") ||
    sys.planets?.[0]
  );
}

function setColony(
  planet,
  { pop, colonyType, notes, surface, orbital, resources, loyalty, races },
) {
  planet.population = pop;
  planet.colonyType = colonyType;
  planet.habitable = true;
  planet.colonizable = true;
  planet.ownerFactionId = FACTION;
  planet.raceComposition = (races || OUTPOST_MIX).map((r) => ({ ...r }));
  planet.loyalty = loyalty ?? 72;
  if (notes) planet.notes = notes;
  if (resources) planet.resources = resources;
  planet.surfaceBuildings = surface;
  planet.orbitalBuildings = orbital || [];
  planet.surfaceSlots = Math.max(planet.surfaceSlots ?? 8, surface.length + 2);
  planet.orbitalSlots = Math.max(
    planet.orbitalSlots ?? 4,
    (orbital || []).length + 2,
  );
}

function ensureLogistics(world) {
  const content = getContent();
  const owned = (world.systems || []).filter((s) => s.ownerFactionId === FACTION);
  const capital = owned.find((s) => s.name === "Амальфа") || owned[0];
  const capId = capital?.id || resolveCapitalSystemId(world, FACTION);
  const faction = (world.factions || []).find((f) => f.id === FACTION);
  if (faction) faction.capitalSystemId = capId;
  for (const s of owned) s.isCapital = s.id === capId;

  world.links = world.links || [];
  const existing = new Set();
  for (const l of world.links) {
    existing.add(`${l.fromId}|${l.toId}`);
    existing.add(`${l.toId}|${l.fromId}`);
  }
  const addLink = (a, bId) => {
    if (!a || !bId || a === bId || existing.has(`${a}|${bId}`)) return;
    world.links.push({
      id: uuid(),
      fromId: a,
      toId: bId,
      type: "corridor",
      fromPlanetId: null,
      toPlanetId: null,
    });
    existing.add(`${a}|${bId}`);
    existing.add(`${bId}|${a}`);
  };

  const hubNames = new Set([
    "Амальфа",
    "SYS-257",
    "SYS-761",
    "SYS-540",
    "SYS-239",
    "SYS-262",
    "SYS-760",
  ]);
  const hubs = owned.filter((s) => hubNames.has(s.name) || s.id === capId);
  for (const h of hubs) {
    if (h.id !== capId) addLink(capId, h.id);
    h.spaceObjects = Array.isArray(h.spaceObjects) ? h.spaceObjects : [];
    if (!h.spaceObjects.includes("depot")) h.spaceObjects.push("depot");
    h.spaceObjects = h.spaceObjects.filter((t) => t !== "refugees");
  }
  for (const s of owned) {
    if (s.id === capId || hubs.some((h) => h.id === s.id)) continue;
    let best = hubs[0] || capital;
    let bestD = Infinity;
    for (const h of hubs) {
      const d =
        (Number(s.x) - Number(h.x || 0)) ** 2 +
        (Number(s.y) - Number(h.y || 0)) ** 2;
      if (d < bestD) {
        bestD = d;
        best = h;
      }
    }
    if (best) addLink(best.id, s.id);
  }
  computeLogisticsNetwork(world, FACTION, content);
  console.log(
    `amalfea logistics: ${owned.filter((s) => s.logistics?.connectedToCapital).length}/${owned.length}`,
  );
}

function applyLayout(world) {
  // Лёгкий корпус безопасности (не жрёт Bios)
  const existingLegion = (world.legions || []).find((l) => l.factionId === FACTION);
  if (existingLegion) {
    existingLegion.strength = 60;
    existingLegion.notes = "Корпус Корней · охрана узлов Альянса (когорта).";
  } else {
    const cap = (world.systems || []).find(
      (s) => s.ownerFactionId === FACTION && (s.name === "Амальфа" || s.name === "SYS-763"),
    );
    world.legions = world.legions || [];
    world.legions.push({
      id: `legion_amalfea_${uuid().slice(0, 8)}`,
      name: "Корпус Корней",
      factionId: FACTION,
      systemId: cap?.id || null,
      strength: 60,
      notes: "Корпус Корней · охрана узлов Альянса (когорта).",
    });
  }

  // ——— Столица Амальфа (бывш. SYS-763, core-мир) ———
  {
    const sys = findSys(world, ["Амальфа", "SYS-763"]);
    if (sys) {
      sys.name = "Амальфа";
      const core =
        findPlanet(sys, ["Амальфа", "Планета 3"]) ||
        (sys.planets || []).find((p) => p.colonyType === "core") ||
        sys.planets?.[1] ||
        sys.planets?.[0];
      if (core) {
        core.name = "Амальфа";
        setColony(core, {
          pop: 180,
          colonyType: "capital",
          loyalty: 88,
          races: CAPITAL_MIX,
          resources: ["вода", "органическая биомасса", "пища", "железо", "золото"],
          notes:
            "Амальфа — Gaia/Paradise World. Столица Альянса, Двойной Храм Каль-Рог, биокузницы, Кодекс Смешения. Единственный крупный живой мир.",
          surface: [
            b("Дворец Генерального секретаря", "capitol"),
            b("Двойной Храм Каль-Рог", "capitol"),
            b("Совет Корней", "capitol"),
            b("ПКО Амальфа", "defense"),
            b("ПКО Кольцо Змея", "defense"),
            ...many(5, () => b("Квартал Кальтин", "residential")),
            ...many(2, () => b("Квартал Рогатых", "residential")),
            b("Клиника Смешения", "residential", "surface", "bios.medical"),
            b("Госпиталь Симбиоза", "residential", "surface", "bios.medical"),
            ...many(18, () => b("Агротеррасы Амальфа", "farm")),
            ...many(4, () => b("Шахта корня", "mine")),
            b("Биокузница I", "lab", "surface", "bios.biolab"),
            b("Биокузница II", "lab", "surface", "bios.biolab"),
            b("Кибер-схемный цех", "factory", "surface", "industria.assembly"),
            b("Плавильня узлов", "factory", "surface", "materia.smelter"),
            b("Завод интеграции", "factory"),
            b("Монетный двор Корней", "capitol", "surface", "materia.mint"),
            ...many(22, () =>
              b("Геосеть Амальфа", "factory", "surface", "energia.geo_hydro"),
            ),
            b("Ловец звезды", "factory", "deep", "energia.solar_catcher"),
            b("Архив Корней", "lab", "surface", "cognitio.archaeology"),
            b("Казармы Корпуса Корней", "barracks"),
          ],
          orbital: [
            b("Космопорт Амальфа", "spaceport", "orbital"),
            b("Верфь Альянса", "shipyard", "orbital"),
            b("Ремонтный док", "shipyard", "orbital", "industria.repair_dock"),
            ...many(10, () =>
              b("Гидропоника Амальфа", "farm", "orbital", "bios.hydroponics"),
            ),
            b("Орб. ПКО", "defense", "orbital"),
          ],
        });
      }
      // вторичная планета системы — лёгкий агро/склад
      const secondary = (sys.planets || []).find(
        (p) => p.name !== "Амальфа" && p.id !== core?.id,
      );
      if (secondary) {
        setColony(secondary, {
          pop: 45,
          colonyType: "colony",
          loyalty: 80,
          races: OUTPOST_MIX,
          resources: ["пища", "железо"],
          notes: "Спутник столицы: провиант и лёгкая добыча.",
          surface: [
            b("Управа", "capitol"),
            ...many(2, () => b("Жильё", "residential")),
            b("Медпункт", "residential", "surface", "bios.medical"),
            ...many(10, () => b("Агро", "farm")),
            ...many(3, () => b("Шахта", "mine")),
            ...many(10, () =>
              b("Гео", "factory", "surface", "energia.geo_hydro"),
            ),
            b("Оборона", "defense"),
          ],
          orbital: [
            b("Космопорт", "spaceport", "orbital"),
            ...many(4, () =>
              b("Гидропоника", "farm", "orbital", "bios.hydroponics"),
            ),
          ],
        });
      }
    }
  }

  /** Добывающие/перерабатывающие узлы (лор: ~15 планет добычи). */
  const mines = [
    {
      sys: ["SYS-761"],
      planet: "Планета 5",
      name: "Титан-Узел Каль",
      pop: 50,
      res: ["титан", "вода"],
      note: "Титановый промысел Альянса. Ключ к обмену с Белатором.",
      mines: 12,
      farms: 5,
      geos: 12,
      special: "titan",
    },
    {
      sys: ["SYS-762"],
      planet: "Планета 3",
      name: "Титан-Узел Рог",
      pop: 40,
      res: ["титан"],
      note: "Второй титановый контур.",
      mines: 10,
      farms: 4,
      geos: 10,
      special: "titan",
    },
    {
      sys: ["SYS-257"],
      planet: "Планета 2",
      name: "Антимат-Корн",
      pop: 45,
      res: ["антиматерия", "железо"],
      note: "Экзотическая добыча; переработка под контролем Совета Корней.",
      mines: 8,
      farms: 4,
      geos: 12,
      special: "exotic",
    },
    {
      sys: ["SYS-239"],
      planet: "Планета 2",
      name: "Кристалл-Харт",
      pop: 55,
      res: ["кристаллы", "редкоземы"],
      note: "Кристаллы и редкоземы для кибер-схем.",
      mines: 10,
      farms: 5,
      geos: 12,
      special: "crystal",
    },
    {
      sys: ["SYS-540"],
      planet: "Планета 1",
      name: "Караванный Хаб",
      pop: 70,
      res: ["железо", "пища"],
      note: "Торгово-логистический хаб северо-западного сектора.",
      mines: 6,
      farms: 10,
      geos: 12,
      special: "hub",
    },
    {
      sys: ["SYS-262"],
      planet: "Планета 1",
      name: "Газ-Железо Узел",
      pop: 40,
      res: ["газ", "железо"],
      note: "Газ и железо для биокузниц и ТЭС-замены геосетью.",
      mines: 8,
      farms: 4,
      geos: 10,
      special: "gas",
    },
    {
      sys: ["SYS-760"],
      planet: "Планета 1",
      name: "Кристалл-Антимат",
      pop: 35,
      res: ["антиматерия", "кристаллы"],
      note: "Смешанная экзо-добыча.",
      mines: 7,
      farms: 3,
      geos: 10,
      special: "exotic",
    },
    {
      sys: ["SYS-755"],
      planet: "Планета 4",
      name: "Редкозем-Пост",
      pop: 35,
      res: ["редкоземы", "кристаллы"],
      note: "Редкоземельный пост.",
      mines: 8,
      farms: 3,
      geos: 10,
      special: "crystal",
    },
    {
      sys: ["SYS-245"],
      planet: "Планета 1",
      name: "Кристалл-Пост",
      pop: 30,
      res: ["кристаллы"],
      note: "Малый кристаллический пост.",
      mines: 6,
      farms: 3,
      geos: 8,
      special: "crystal",
    },
    {
      sys: ["SYS-765"],
      planet: "Планета 1",
      name: "Водо-Провиант",
      pop: 55,
      res: ["вода", "пища"],
      note: "Вода и провиант — экспортный контур (предложение Харну).",
      mines: 3,
      farms: 12,
      geos: 10,
      special: "bio",
    },
    {
      sys: ["Капкан-Войд"],
      planet: "Мир 2",
      name: "Узел Данных",
      pop: 30,
      res: ["реликты", "железо"],
      note: "Реликтовые узлы и лёгкая добыча на окраине.",
      mines: 4,
      farms: 3,
      geos: 8,
      special: "data",
    },
    {
      sys: ["SYS-258"],
      planet: "Планета 2",
      name: "Антимат-Тень",
      pop: 28,
      res: ["антиматерия"],
      note: "Вторичный антимат-пост.",
      mines: 5,
      farms: 3,
      geos: 8,
      special: "exotic",
    },
  ];

  for (const row of mines) {
    const sys = findSys(world, row.sys);
    if (!sys) continue;
    // rename system for readability if still SYS-*
    if (/^SYS-|^COR-/.test(sys.name) && row.name) {
      // keep id; cosmetic name for key hubs only
      if (["Титан-Узел Каль", "Караванный Хаб", "Кристалл-Харт", "Антимат-Корн"].includes(row.name)) {
        sys.name = row.name;
      }
    }
    let p =
      findPlanet(sys, [row.planet, row.name]) ||
      (sys.planets || []).find((x) =>
        (x.resources || []).some((r) => (row.res || []).includes(r)),
      ) ||
      sys.planets?.[0];
    if (!p) continue;
    p.name = row.name;

    const surface = [
      b(`Управа ${row.name}`, "capitol"),
      b("Жильё промысла", "residential"),
      ...(row.pop >= 45
        ? [b("Медпункт", "residential", "surface", "bios.medical")]
        : []),
      ...many(row.farms, () => b(`Агро ${row.name}`, "farm")),
      ...many(row.mines, () => b(`Промысел ${row.name}`, "mine")),
      ...many(row.geos, () =>
        b(`Гео ${row.name}`, "factory", "surface", "energia.geo_hydro"),
      ),
      b("Оборона", "defense"),
    ];
    if (row.special === "titan") {
      surface.push(
        b("Глубинная титан-шахта", "mine", "subsurface", "extract.deep_shaft"),
        b("Плавильня титана", "factory", "surface", "materia.smelter"),
      );
    }
    if (row.special === "crystal") {
      surface.push(
        b("Кристалл-цех", "factory", "surface", "materia.crystal_workshop"),
      );
    }
    if (row.special === "gas") {
      surface.push(b("Газовый колодец", "mine", "surface", "extract.gas_well"));
      surface.push(
        b("Газоочистка", "factory", "surface", "materia.refinery_gas"),
      );
    }
    if (row.special === "hub") {
      surface.push(
        b("Сборка", "factory", "surface", "industria.assembly"),
        b("Склад провианта", "factory"),
      );
    }
    if (row.special === "bio") {
      surface.push(b("Биолаб", "lab", "surface", "bios.biolab"));
    }

    const orbital = [
      b(`Космопорт ${row.name}`, "spaceport", "orbital"),
      ...many(row.special === "bio" || row.special === "hub" ? 4 : 2, () =>
        b("Гидропоника", "farm", "orbital", "bios.hydroponics"),
      ),
    ];
    if (row.special === "exotic") {
      orbital.push(
        b("Астероидный харвестер", "mine", "orbital", "extract.asteroid_harvester"),
      );
    }

    setColony(p, {
      pop: row.pop,
      colonyType: row.special === "hub" || row.special === "bio" ? "colony" : "mining",
      loyalty: 70,
      races: OUTPOST_MIX,
      resources: row.res,
      notes: row.note,
      surface,
      orbital,
    });
  }

  // Обнулить всё прочее владение Амальфеи без зданий
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

  // Доп. гео на всех заселённых (D upkeep шахт/портов)
  for (const sys of world.systems || []) {
    if (sys.ownerFactionId !== FACTION) continue;
    for (const p of sys.planets || []) {
      if (!settled.has(p.id)) continue;
      const n = p.name === "Амальфа" ? 8 : 6;
      for (let i = 0; i < n; i++) {
        p.surfaceBuildings.push(
          b(`Георезерв ${p.name}`, "factory", "surface", "energia.geo_hydro"),
        );
      }
      p.surfaceSlots = Math.max(p.surfaceSlots ?? 8, p.surfaceBuildings.length + 2);
    }
  }

  // Агропрофицит на столице и био/хабах
  for (const [sysName, planetName, farms, hydros] of [
    ["Амальфа", "Амальфа", 10, 6],
    ["Караванный Хаб", "Караванный Хаб", 6, 3],
    ["Водо-Провиант", "Водо-Провиант", 6, 3],
  ]) {
    const sys = findSys(world, [sysName, "SYS-763", "SYS-540", "SYS-765"]);
    const p = findPlanet(sys, [planetName]);
    if (!p?.surfaceBuildings) continue;
    for (let i = 0; i < farms; i++) {
      p.surfaceBuildings.push(b(`Агропрофицит ${planetName}`, "farm"));
    }
    for (let i = 0; i < hydros; i++) {
      p.orbitalBuildings.push(
        b(`Гидропрофицит ${planetName}`, "farm", "orbital", "bios.hydroponics"),
      );
    }
    p.surfaceSlots = Math.max(p.surfaceSlots ?? 8, p.surfaceBuildings.length + 2);
    p.orbitalSlots = Math.max(p.orbitalSlots ?? 4, p.orbitalBuildings.length + 2);
  }

  ensureLogistics(world);

  const f = (world.factions || []).find((x) => x.id === FACTION);
  if (f) {
    const note =
      "Экономика: Амальфа (Gaia, биокузницы) · титан-узлы · кристалл/редкозем · антимат · провиант/вода. Без псионики. Баланс в плюсе.";
    if (!(f.notes || "").includes("Экономика:")) {
      f.notes = [f.notes, note].filter(Boolean).join("\n");
    }
    if (!(f.gmNotes || "").includes("Economy pass Amalfea")) {
      f.gmNotes = [
        f.gmNotes,
        "Economy pass Amalfea: capital Amalfa; mining outposts; bio techs no psi; logistics star+depots; surplus flows.",
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
    console.warn("no amalfea ledger");
    return null;
  }
  const techs = getContent().technologies || {};
  const set = new Set(eco.unlockedTechs || []);
  for (const id of EXTRA_TECHS) if (techs[id]) set.add(id);
  // гарантированно без псионики
  for (const id of [...set]) {
    if (/psionic|psi_|white_corridor/i.test(id)) set.delete(id);
  }
  eco.unlockedTechs = [...set];
  recomputeUnlocksFromTechs(eco, getContent(), FACTION, world);
  const floor = { A: 6, B: 6, C: 6, D: 6, E: 7, F: 5 };
  for (const [k, v] of Object.entries(floor)) {
    eco.techTiers[k] = Math.max(Number(eco.techTiers[k] ?? 1), v);
  }
  eco.stocks = {
    ...eco.stocks,
    "currency.metal": 28000,
    "currency.supply": 16000,
    "currency.extracta": 180,
    "currency.materia": 120,
    "currency.industria": 90,
    "currency.energia": 240,
    "currency.bios": 150,
    "currency.cognitio": Math.max(Number(eco.stocks["currency.cognitio"] ?? 0), 3500),
    "map.food": 18000,
    "map.biomass": 12000,
    "map.biofuel": 8000,
    "map.buildplex": 9000,
    "map.titan": 4000,
    "map.iron": 9000,
    "map.crystals": 5000,
    "map.water": 10000,
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
