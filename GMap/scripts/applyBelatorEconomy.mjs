/**
 * Империя Белатор — экономика, население, технологии, мятежники.
 *
 * Опора на 02_История:
 * - Солис: столица, Церковь Сола, «Тихий Огонь», Золотой Банк, соларид
 * - Гурез: главная верфь + лунный аванпост
 * - Элегантия / Десерти / Гамма: ранние колонии
 * - Западный марш: Алиот → Альбирео / Йота / Антрес / Адара
 * - Мерцак / Велентис: добыча (железо, кристаллы, газ, титан)
 * - Федерация под управой: урезанные админ-миры, не мегаполисы-призраки
 *
 * Цель: положительный баланс (не стагнация), без мятежников на территории.
 *
 * Run: node GMap/scripts/applyBelatorEconomy.mjs
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
const FACTION = "faction_belator";
const uuid = () => crypto.randomUUID();

const CORE_MIX = [
  { raceId: "race_belator", percent: 92 },
  { raceId: "race_human", percent: 8 },
];
const WEST_MIX = [
  { raceId: "race_belator", percent: 78 },
  { raceId: "race_human", percent: 22 },
];
const FED_MIX = [
  { raceId: "race_human", percent: 82 },
  { raceId: "race_belator", percent: 18 },
];
const HESHAH_MIX = [
  { raceId: "race_heshah", percent: 88 },
  { raceId: "race_belator", percent: 12 },
];

/** Базовые + профильные технологии по лору (военная машина, соларид, пси, био). */
const EXTRA_TECHS = [
  "tech.medicine",
  "tech.biocatalysis",
  "tech.deep_prospecting",
  "tech.asteroid_mining",
  "tech.war_economy.doctrine",
  "tech.psi_doctrine.chorus",
  "tech.hybrid.imperial_synthesis",
  // каталог A — добыча
  "tech.a_surface_mining",
  "tech.a_ore_extraction",
  "tech.a_mining_networks",
  "tech.a_geological_scanning",
  "tech.a_resource_mapping",
  "tech.a_deep_drilling",
  "tech.a_automated_miners",
  "tech.a_geothermal_tapping",
  "tech.a_orbital_extraction",
  // каталог D — энергия / соларид-альтернативы
  "tech.d_solar_arrays",
  "tech.d_geothermal_taps",
  "tech.d_power_grid_mgmt",
  "tech.d_thermal_efficiency",
  "tech.d_fission_reactors",
  "tech.d_energy_storage",
  // каталог E — агро / медицина
  "tech.e_agriculture",
  "tech.e_agricultural_automation",
  "tech.e_food_synthesis",
  "tech.e_medical_advances",
  "tech.e_ecosystem_mgmt",
  "tech.e_bio_recycling",
  "tech.e_population_growth",
  // каталог C — промышленность / верфи
  "tech.c_assembly_lines",
  "tech.c_mass_production",
  "tech.c_supply_chain_mgmt",
  "tech.c_factory_networks",
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

function setColony(
  planet,
  { pop, colonyType, notes, surface, orbital, races, resources, loyalty },
) {
  planet.population = pop;
  planet.colonyType = colonyType;
  planet.habitable = true;
  planet.colonizable = true;
  planet.ownerFactionId = FACTION;
  planet.raceComposition = (races || CORE_MIX).map((r) => ({ ...r }));
  if (notes) planet.notes = notes;
  if (resources) planet.resources = resources;
  planet.loyalty = loyalty ?? 75;
  planet.surfaceBuildings = surface;
  planet.orbitalBuildings = orbital || [];
  planet.surfaceSlots = Math.max(planet.surfaceSlots ?? 8, surface.length + 2);
  planet.orbitalSlots = Math.max(
    planet.orbitalSlots ?? 4,
    (orbital || []).length + 2,
  );
}

function clearPlanet(planet) {
  planet.population = 0;
  planet.colonyType = "none";
  planet.raceComposition = [];
  planet.surfaceBuildings = [];
  planet.orbitalBuildings = [];
  planet.loyalty = 50;
  if (planet.ownerFactionId === FACTION || planet.ownerFactionId == null) {
    planet.ownerFactionId = null;
  }
}

function removeBelatorRebels(world) {
  const belSys = new Set(
    (world.systems || [])
      .filter((s) => s.ownerFactionId === FACTION)
      .map((s) => s.id),
  );
  const before = (world.legions || []).length;
  world.legions = (world.legions || []).filter((l) => {
    const sid = l.systemId || l.locationSystemId || l.location?.systemId;
    const isRebel =
      l.factionId === "faction_rebels" ||
      String(l.id || "").startsWith("legion_rebel_") ||
      String(l.factionId || "").includes("rebel");
    if (!isRebel) return true;
    return !belSys.has(sid);
  });
  return before - world.legions.length;
}

function tuneLegions(world) {
  // E3 upkeep идёт по composition.count (forceEconomy), не только по strength.
  const targets = {
    "Золотой Белаторский Легион Сула": 18,
    "Легион Нагааритян": 14,
    "Красный Легион Рэдмона": 14,
    "Легион Единства": 14,
    "XI «Световой Вал»": 10,
    "Гуманитарный Корпус Астры": 6,
    "СБ — хвост Кузницы": 4,
  };
  for (const l of world.legions || []) {
    if (l.factionId !== FACTION) continue;
    let next = targets[l.name];
    if (next == null && (l.strength ?? 0) > 80) next = 40;
    const compSum = (l.composition || []).reduce(
      (s, g) => s + (g.count || 0),
      0,
    );
    if (next == null && compSum > 80) next = Math.max(8, l.strength || 40);
    if (next == null) continue;
    l.strength = next;
    if (Array.isArray(l.composition) && l.composition.length) {
      if (l.composition.length === 1) l.composition[0].count = next;
      else {
        const sum = compSum || 1;
        let left = next;
        for (let i = 0; i < l.composition.length; i++) {
          const g = l.composition[i];
          if (i === l.composition.length - 1) g.count = left;
          else {
            const share = Math.max(1, Math.round((next * (g.count || 0)) / sum));
            g.count = Math.min(left, share);
            left -= g.count;
          }
        }
      }
    } else {
      l.composition = [
        { defId: "unit.generic_line", count: next, hp: 100, xp: 0, level: 0 },
      ];
    }
    if (!/игровой контур содержания/i.test(l.notes || "")) {
      l.notes = [
        l.notes,
        "Игровой контур содержания (когорта); лорная численность выше.",
      ]
        .filter(Boolean)
        .join(" ");
    }
  }
}

function ensureBelatorLogistics(world) {
  const content = getContent();
  const bel = (world.systems || []).filter((s) => s.ownerFactionId === FACTION);
  if (!bel.length) return;

  let capId = resolveCapitalSystemId(world, FACTION);
  const solis = bel.find((s) => s.name === "Солис");
  if (solis) capId = solis.id;

  const faction = (world.factions || []).find((f) => f.id === FACTION);
  if (faction) faction.capitalSystemId = capId;
  for (const s of bel) s.isCapital = s.id === capId;

  world.links = world.links || [];
  const existing = new Set();
  for (const l of world.links) {
    existing.add(`${l.fromId}|${l.toId}`);
    existing.add(`${l.toId}|${l.fromId}`);
  }

  const addLink = (fromId, toId) => {
    if (!fromId || !toId || fromId === toId) return;
    if (existing.has(`${fromId}|${toId}`)) return;
    world.links.push({
      id: uuid(),
      fromId,
      toId,
      type: "corridor",
      fromPlanetId: null,
      toPlanetId: null,
    });
    existing.add(`${fromId}|${toId}`);
    existing.add(`${toId}|${fromId}`);
  };

  const hubNames = [
    "Солис",
    "Гурез",
    "Элегантия",
    "Десерти",
    "Алиот",
    "Мерцак",
    "Мегрец",
    "Адара",
    "Капелла",
    "Регул",
    "Алькор",
    "Процион",
  ];
  const hubs = bel.filter((s) => hubNames.includes(s.name));
  for (const h of hubs) {
    if (h.id !== capId) addLink(capId, h.id);
    h.spaceObjects = Array.isArray(h.spaceObjects) ? h.spaceObjects : [];
    if (!h.spaceObjects.includes("depot")) h.spaceObjects.push("depot");
    // убрать беженцев с производственных хабов — не трогаем лор, только штрафные теги
    h.spaceObjects = h.spaceObjects.filter((t) => t !== "refugees");
  }

  for (const s of bel) {
    if (s.id === capId) continue;
    if (hubs.some((h) => h.id === s.id)) continue;
    let best = hubs[0] || bel.find((x) => x.id === capId);
    let bestD = Infinity;
    for (const h of hubs.length ? hubs : [{ id: capId, x: 0, y: 0 }]) {
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

  // Гурез раньше был без линков — гарантируем хаб-связь
  const gurez = bel.find((s) => s.name === "Гурез");
  if (gurez) addLink(capId, gurez.id);

  computeLogisticsNetwork(world, FACTION, content);
  const connected = bel.filter((s) => s.logistics?.connectedToCapital).length;
  console.log(
    `logistics: ${connected}/${bel.length} connected to capital (depots on hubs)`,
  );
}

function applyLayout(world) {
  const removed = removeBelatorRebels(world);
  tuneLegions(world);
  ensureBelatorLogistics(world);

  // ——— Солис: столица ———
  {
    const sys = findSys(world, ["Солис"]);
    const p = findPlanet(sys, ["Домус Солис"]);
    setColony(p, {
      pop: 2800,
      colonyType: "capital",
      loyalty: 92,
      races: CORE_MIX,
      resources: ["map.iron", "map.solari", "map.gold", "map.silver", "map.blumatid"],
      notes:
        "Столица Империи. Дворец, Церковь Сола, Золотой Банк, «Тихий Огонь». Промысел соларита и блюматида + военный штаб.",
      surface: [
        b("Императорский дворец", "capitol"),
        b("Храм Сола · канонизация", "capitol"),
        b("Золотой Банк Белатора", "capitol", "surface", "materia.mint"),
        b("Узел ПКО Солис", "defense"),
        b("ПКО Восточный пояс", "defense"),
        b("Кварталы Домус Солис", "residential"),
        b("Кварталы ветеранов", "residential"),
        b("Госпиталь Танет", "residential", "surface", "bios.medical"),
        ...many(14, () => b("Агропояс Солис", "farm")),
        ...many(4, () => b("Солариевые шахты Солис", "mine")),
        ...many(2, () => b("Минеральные шахты Солис", "mine")),
        b("Глубинная шахта Солис", "mine", "subsurface", "extract.deep_shaft"),
        b("Плавильня Сула I", "factory", "surface", "materia.smelter"),
        b("Плавильня Сула II", "factory", "surface", "materia.smelter"),
        b("Оружейный концерн Белатор", "factory"),
        b("Сборка легионной техники", "factory", "surface", "industria.assembly"),
        b("ТЭС Солис I", "factory", "surface", "energia.thermal_plant"),
        b("ТЭС Солис II", "factory", "surface", "energia.thermal_plant"),
        b("Гео/гидро Солис", "factory", "surface", "energia.geo_hydro"),
        b("Гео/гидро Солис II", "factory", "surface", "energia.geo_hydro"),
        b("Термояд Солис", "factory", "surface", "energia.fusion_reactor"),
        b("Ловец соларида (ядро)", "factory", "deep", "energia.solar_catcher"),
        b("Архив Империи", "lab", "deep", "mega.archive.belator"),
        b("Пси-храм Сола", "lab", "surface", "cognitio.psi_temple"),
        b("Казармы Золотого легиона", "barracks"),
      ],
      orbital: [
        b("Космопорт Солис", "spaceport", "orbital"),
        b("Ремонтный док флагмана", "shipyard", "orbital", "industria.repair_dock"),
        b("Тихий Огонь (щитовой контур)", "defense", "orbital", "mega.quiet_fire"),
        b("Орбитальный ПКО Солис", "defense", "orbital"),
        ...many(6, () =>
          b("Гидропоника Солис", "farm", "orbital", "bios.hydroponics"),
        ),
      ],
    });
  }

  // ——— Гурез: верфи ———
  {
    const sys = findSys(world, ["Гурез"]);
    const p = findPlanet(sys, ["Домус Гурез"]);
    setColony(p, {
      pop: 1900,
      colonyType: "core",
      loyalty: 85,
      races: CORE_MIX,
      resources: ["железо", "титан", "минералы"],
      notes:
        "Верфейный мир Империи. Главная кузница флота; титан после федеральных заказов.",
      surface: [
        b("Администрация Гурез", "capitol"),
        b("Жильё верфейщиков", "residential"),
        b("Медпункт Гурез", "residential", "surface", "bios.medical"),
        ...many(8, () => b("Агро Гурез", "farm")),
        ...many(5, () => b("Рудники Гурез", "mine")),
        b("Плавильня титана", "factory", "surface", "materia.smelter"),
        b("Прокат Гурез", "factory", "surface", "materia.rolling_mill"),
        b("Сборочный двор", "factory", "surface", "industria.assembly"),
        b("Модульный двор", "factory", "surface", "industria.modular_yard"),
        b("Завод Гурез", "factory"),
        b("ТЭС Гурез I", "factory", "surface", "energia.thermal_plant"),
        b("ТЭС Гурез II", "factory", "surface", "energia.thermal_plant"),
        b("Гео Гурез", "factory", "surface", "energia.geo_hydro"),
        b("ПКО Гурез", "defense"),
        b("Казармы Нагааритян", "barracks"),
      ],
      orbital: [
        b("Космопорт Гурез", "spaceport", "orbital"),
        b("Звёздная кузница Гурез", "shipyard", "orbital"),
        b("Верфь сопровождения", "shipyard", "orbital"),
        b("Ремонтный док Гурез", "shipyard", "orbital", "industria.repair_dock"),
        ...many(4, () =>
          b("Гидропоника Гурез", "farm", "orbital", "bios.hydroponics"),
        ),
        b("Орбитальный ПКО", "defense", "orbital"),
      ],
    });
    const moon = findPlanet(sys, ["Луна Гурез"]);
    if (moon) {
      setColony(moon, {
        pop: 220,
        colonyType: "outpost",
        loyalty: 80,
        races: CORE_MIX,
        resources: ["железо"],
        notes:
          "Лунный аванпост: транспортная площадка трансмиссии со столичным контуром.",
        surface: [
          b("Жильё аванпоста", "residential"),
          b("Агро купол", "farm"),
          b("Агро купол II", "farm"),
          b("Медпункт", "residential", "surface", "bios.medical"),
          b("Оборона луны", "defense"),
          b("Шахта луны", "mine"),
        ],
        orbital: [
          b("Транспортная площадка", "spaceport", "orbital"),
          b("Гидропоника луны", "farm", "orbital", "bios.hydroponics"),
        ],
      });
    }
  }

  // ——— Элегантия: агро/культура ———
  {
    const sys = findSys(world, ["Элегантия"]);
    const p = findPlanet(sys, ["Домус Элегантия"]);
    setColony(p, {
      pop: 1400,
      colonyType: "colony",
      loyalty: 82,
      races: CORE_MIX,
      resources: ["железо", "органическая биомасса", "пища"],
      notes: "Колония-сад Империи. Агро-хаб и культурный пояс.",
      surface: [
        b("Дворец Элегантии", "capitol"),
        b("Кварталы Элегантии", "residential"),
        b("Госпиталь", "residential", "surface", "bios.medical"),
        ...many(16, () => b("Агрокомплекс Элегантия", "farm")),
        ...many(2, () => b("Шахта Элегантия", "mine")),
        b("Биолаборатория", "lab", "surface", "bios.biolab"),
        b("ТЭС Элегантия", "factory", "surface", "energia.thermal_plant"),
        b("Гео Элегантия", "factory", "surface", "energia.geo_hydro"),
        b("ПКО Элегантия", "defense"),
        b("Казармы Рэдмона", "barracks"),
      ],
      orbital: [
        b("Космопорт Элегантия", "spaceport", "orbital"),
        ...many(5, () =>
          b("Гидропоника Элегантия", "farm", "orbital", "bios.hydroponics"),
        ),
      ],
    });
  }

  // ——— Десерти: добыча + агро ———
  {
    const sys = findSys(world, ["Десерти"]);
    const p = findPlanet(sys, ["Домус Десерти"]);
    setColony(p, {
      pop: 1600,
      colonyType: "colony",
      loyalty: 80,
      races: CORE_MIX,
      resources: ["map.iron", "map.minerals", "map.solari", "map.blumatid"],
      notes:
        "Крупная ранняя колония. Пустынный промысел минералов, соларита и блюматида + агрокупола.",
      surface: [
        b("Администрация Десерти", "capitol"),
        b("Жильё Десерти", "residential"),
        b("Медпункт", "residential", "surface", "bios.medical"),
        ...many(10, () => b("Агрокупол Десерти", "farm")),
        ...many(8, () => b("Карьер Десерти", "mine")),
        b("Глубинная шахта", "mine", "subsurface", "extract.deep_shaft"),
        b("Открытый карьер", "mine", "surface", "extract.strip_pit"),
        b("Плавильня Десерти", "factory", "surface", "materia.smelter"),
        b("ТЭС Десерти I", "factory", "surface", "energia.thermal_plant"),
        b("ТЭС Десерти II", "factory", "surface", "energia.thermal_plant"),
        b("Солнечный ловец", "factory", "deep", "energia.solar_catcher"),
        b("ПКО Десерти", "defense"),
        b("Казармы Единства", "barracks"),
      ],
      orbital: [
        b("Космопорт Десерти", "spaceport", "orbital"),
        ...many(4, () =>
          b("Гидропоника Десерти", "farm", "orbital", "bios.hydroponics"),
        ),
      ],
    });
  }

  // ——— Гамма: Данкристо / Белвор ———
  {
    const sys = findSys(world, ["Гамма"]);
    const d = findPlanet(sys, ["Домус Данкристо"]);
    const bel = findPlanet(sys, ["Домус Белвор"]);
    if (d) {
      setColony(d, {
        pop: 450,
        colonyType: "colony",
        loyalty: 78,
        races: CORE_MIX,
        resources: ["железо"],
        notes: "Форпост Гаммы · Данкристо.",
        surface: [
          b("Жильё Данкристо", "residential"),
          ...many(4, () => b("Агро Данкристо", "farm")),
          b("Шахта Данкристо", "mine"),
          b("Медпункт", "residential", "surface", "bios.medical"),
          b("ТЭС", "factory", "surface", "energia.thermal_plant"),
          b("Оборона", "defense"),
        ],
        orbital: [
          b("Космопорт Данкристо", "spaceport", "orbital"),
          b("Гидропоника", "farm", "orbital", "bios.hydroponics"),
        ],
      });
    }
    if (bel) {
      setColony(bel, {
        pop: 480,
        colonyType: "colony",
        loyalty: 78,
        races: CORE_MIX,
        resources: ["железо"],
        notes: "Форпост Гаммы · Белвор.",
        surface: [
          b("Жильё Белвор", "residential"),
          ...many(4, () => b("Агро Белвор", "farm")),
          b("Шахта Белвор", "mine"),
          b("Медпункт", "residential", "surface", "bios.medical"),
          b("ТЭС", "factory", "surface", "energia.thermal_plant"),
          b("Оборона", "defense"),
        ],
        orbital: [
          b("Космопорт Белвор", "spaceport", "orbital"),
          b("Гидропоника", "farm", "orbital", "bios.hydroponics"),
        ],
      });
    }
  }

  // ——— Западный марш ———
  {
    const sys = findSys(world, ["Алиот"]);
    const p = findPlanet(sys, ["Домус Алиот"]);
    setColony(p, {
      pop: 900,
      colonyType: "colony",
      loyalty: 68,
      races: WEST_MIX,
      resources: ["железо", "стройплексы", "газ"],
      notes:
        "Освобождённый логистический узел. Склады, коммуникации, передовая западного марша.",
      surface: [
        b("Военная управа Алиот", "capitol"),
        b("Жильё возвращённых", "residential"),
        b("Медпункт", "residential", "surface", "bios.medical"),
        ...many(6, () => b("Агро Алиот", "farm")),
        ...many(3, () => b("Складской комплекс", "factory")),
        b("Сборка", "factory", "surface", "industria.assembly"),
        ...many(2, () => b("Шахта Алиот", "mine")),
        b("Газовый колодец", "mine", "surface", "extract.gas_well"),
        b("ТЭС Алиот", "factory", "surface", "energia.thermal_plant"),
        b("ПКО Алиот", "defense"),
        b("Казармы западного марша", "barracks"),
      ],
      orbital: [
        b("Космопорт Алиот", "spaceport", "orbital"),
        ...many(3, () =>
          b("Гидропоника Алиот", "farm", "orbital", "bios.hydroponics"),
        ),
      ],
    });
  }

  {
    const sys = findSys(world, ["Альбирео"]);
    const p = findPlanet(sys, ["Мир Альбирео"]);
    setColony(p, {
      pop: 700,
      colonyType: "colony",
      loyalty: 65,
      races: WEST_MIX,
      resources: ["железо", "вода"],
      notes: "Западный рубеж. Восстановление после туранмальской оккупации.",
      surface: [
        b("Управа Альбирео", "capitol"),
        b("Жильё", "residential"),
        b("Медпункт", "residential", "surface", "bios.medical"),
        ...many(7, () => b("Агро Альбирео", "farm")),
        ...many(2, () => b("Шахта", "mine")),
        b("ТЭС", "factory", "surface", "energia.thermal_plant"),
        b("ПКО", "defense"),
      ],
      orbital: [
        b("Космопорт", "spaceport", "orbital"),
        ...many(2, () =>
          b("Гидропоника", "farm", "orbital", "bios.hydroponics"),
        ),
      ],
    });
  }

  for (const [sysName, planetName, label] of [
    ["Йота", "Мир Йота", "Йота"],
    ["Антрес", "Мир Антрес", "Антрес"],
  ]) {
    const sys = findSys(world, [sysName]);
    const p = findPlanet(sys, [planetName]);
    if (!p) continue;
    setColony(p, {
      pop: 280,
      colonyType: "outpost",
      loyalty: 62,
      races: WEST_MIX,
      resources: ["железо"],
      notes: `${label}: форпост западного марша, гражданская жизнь возвращается.`,
      surface: [
        b(`Жильё ${label}`, "residential"),
        ...many(3, () => b(`Агро ${label}`, "farm")),
        b(`Шахта ${label}`, "mine"),
        b("Медпункт", "residential", "surface", "bios.medical"),
        b("ТЭС", "factory", "surface", "energia.thermal_plant"),
        b("Оборона", "defense"),
      ],
      orbital: [
        b(`Космопорт ${label}`, "spaceport", "orbital"),
        b("Гидропоника", "farm", "orbital", "bios.hydroponics"),
      ],
    });
  }

  {
    const sys = findSys(world, ["Адара"]);
    const p = findPlanet(sys, ["Мир Адара"]);
    setColony(p, {
      pop: 1100,
      colonyType: "colony",
      loyalty: 64,
      races: WEST_MIX,
      resources: ["железо", "титан", "минералы"],
      notes: "Крупный западный мир после освобождения. Промышленный рубеж.",
      surface: [
        b("Управа Адара", "capitol"),
        b("Жильё Адара", "residential"),
        b("Медпункт", "residential", "surface", "bios.medical"),
        ...many(8, () => b("Агро Адара", "farm")),
        ...many(5, () => b("Рудник Адара", "mine")),
        b("Плавильня", "factory", "surface", "materia.smelter"),
        b("Завод", "factory"),
        b("Сборка", "factory", "surface", "industria.assembly"),
        b("ТЭС I", "factory", "surface", "energia.thermal_plant"),
        b("ТЭС II", "factory", "surface", "energia.thermal_plant"),
        b("Гео", "factory", "surface", "energia.geo_hydro"),
        b("ПКО", "defense"),
        b("Казармы", "barracks"),
      ],
      orbital: [
        b("Космопорт Адара", "spaceport", "orbital"),
        b("Малая верфь Адара", "shipyard", "orbital"),
        ...many(3, () =>
          b("Гидропоника", "farm", "orbital", "bios.hydroponics"),
        ),
      ],
    });
  }

  // ——— Мерцак: добывающий хаб ———
  {
    const sys = findSys(world, ["Мерцак"]);
    const p = findPlanet(sys, ["Мир Мерцак"]);
    setColony(p, {
      pop: 950,
      colonyType: "colony",
      loyalty: 76,
      races: CORE_MIX,
      resources: ["железо", "кристаллы", "газ"],
      notes: "Добывающий хаб: железо, кристаллы, газ.",
      surface: [
        b("Управа Мерцак", "capitol"),
        b("Жильё шахтёров", "residential"),
        b("Медпункт", "residential", "surface", "bios.medical"),
        ...many(5, () => b("Агро Мерцак", "farm")),
        ...many(6, () => b("Рудник Мерцак", "mine")),
        b("Глубинная шахта", "mine", "subsurface", "extract.deep_shaft"),
        b("Газовый колодец", "mine", "surface", "extract.gas_well"),
        b("Кристаллический цех", "factory", "surface", "materia.crystal_workshop"),
        b("Плавильня", "factory", "surface", "materia.smelter"),
        b("Газоочистка", "factory", "surface", "materia.refinery_gas"),
        b("ТЭС I", "factory", "surface", "energia.thermal_plant"),
        b("ТЭС II", "factory", "surface", "energia.thermal_plant"),
        b("Гео", "factory", "surface", "energia.geo_hydro"),
        b("ПКО", "defense"),
      ],
      orbital: [
        b("Космопорт Мерцак", "spaceport", "orbital"),
        b("Астероидный харвестер", "mine", "orbital", "extract.asteroid_harvester"),
        ...many(3, () =>
          b("Гидропоника", "farm", "orbital", "bios.hydroponics"),
        ),
      ],
    });
  }

  // ——— Велентис: титановый пост ———
  {
    const sys = findSys(world, ["Велентис"]);
    const p = findPlanet(sys, ["Вихрь-Крак-2"]);
    if (p) {
      setColony(p, {
        pop: 180,
        colonyType: "outpost",
        loyalty: 70,
        races: CORE_MIX,
        resources: ["титан"],
        notes: "Титановый промысел Велентис. Жёсткая среда, ценный рудник.",
        surface: [
          b("Жильё буровиков", "residential"),
          b("Агро купол", "farm"),
          b("Агро купол II", "farm"),
          b("Титановая шахта", "mine"),
          b("Глубинная добыча титана", "mine", "subsurface", "extract.deep_shaft"),
          b("Медпункт", "residential", "surface", "bios.medical"),
          b("ТЭС", "factory", "surface", "energia.thermal_plant"),
          b("Оборона поста", "defense"),
        ],
        orbital: [
          b("Посадочная площадка", "spaceport", "orbital"),
          b("Гидропоника", "farm", "orbital", "bios.hydroponics"),
        ],
      });
      p.habitable = true;
      p.colonizable = true;
    }
  }

  // ——— Вторичные белаторские миры ———
  const secondary = [
    {
      sys: "Мегрец",
      planet: "Мир Мегрец",
      pop: 1000,
      role: "agro",
      res: ["железо", "органическая биомасса", "пища"],
      note: "Агро-провинция ядра.",
    },
    {
      sys: "Регул",
      planet: "Мир Регул",
      pop: 900,
      role: "industry",
      res: ["железо", "минералы"],
      note: "Промышленный пояс Империи.",
    },
    {
      sys: "Процион",
      planet: "Мир Процион",
      pop: 950,
      role: "mixed",
      res: ["map.iron", "map.solari", "map.food", "map.blumatid"],
      note: "Смешанный мир: добыча соларита и блюматида + агро.",
    },
    {
      sys: "Алькор",
      planet: "Домус Алькор",
      pop: 800,
      role: "colony",
      res: ["железо"],
      note: "Колония Алькор под имперской управой.",
    },
    {
      sys: "Альдебар",
      planet: "Мир Альдебар",
      pop: 320,
      role: "outpost",
      res: ["железо"],
      note: "Малый форпост Альдебар.",
    },
  ];

  for (const row of secondary) {
    const sys = findSys(world, [row.sys]);
    const p = findPlanet(sys, [row.planet]);
    if (!p) continue;
    const farms =
      row.role === "agro" ? 14 : row.role === "outpost" ? 3 : 7;
    const mines =
      row.role === "industry" ? 6 : row.role === "agro" ? 2 : 4;
    const factories =
      row.role === "industry" ? 4 : row.role === "mixed" ? 2 : 1;
    setColony(p, {
      pop: row.pop,
      colonyType: row.role === "outpost" ? "outpost" : "colony",
      loyalty: 74,
      races: CORE_MIX,
      resources: row.res,
      notes: row.note,
      surface: [
        b(`Управа ${row.sys}`, "capitol"),
        b("Жильё", "residential"),
        b("Медпункт", "residential", "surface", "bios.medical"),
        ...many(farms, () => b(`Агро ${row.sys}`, "farm")),
        ...many(mines, () => b(`Шахта ${row.sys}`, "mine")),
        ...many(factories, () => b(`Завод ${row.sys}`, "factory")),
        ...(row.role === "industry"
          ? [
              b("Плавильня", "factory", "surface", "materia.smelter"),
              b("Сборка", "factory", "surface", "industria.assembly"),
            ]
          : []),
        ...(row.res.includes("map.solari") || row.res.includes("соларид")
          ? [b("Ловец соларита", "factory", "deep", "energia.solar_catcher")]
          : []),
        b("ТЭС", "factory", "surface", "energia.thermal_plant"),
        b("Гео", "factory", "surface", "energia.geo_hydro"),
        b("ПКО", "defense"),
      ],
      orbital: [
        b(`Космопорт ${row.sys}`, "spaceport", "orbital"),
        ...many(row.role === "agro" ? 4 : 2, () =>
          b("Гидропоника", "farm", "orbital", "bios.hydroponics"),
        ),
      ],
    });
  }

  // ——— Федерация под управой (сжатые админ-миры) ———
  const fed = [
    {
      sys: "Каппа",
      planet: "Мир Каппа",
      pop: 700,
      note: "Федеральный мир под белаторской военной управой.",
    },
    {
      sys: "Капелла",
      planet: "Мир Капелла",
      pop: 750,
      note: "Федеральный хаб. Налоги и порядок Империи.",
    },
    {
      sys: "Ню",
      planet: "Мир Ню",
      pop: 650,
      note: "Человеческий мир Федерации; имперский гарнизон.",
    },
  ];
  for (const row of fed) {
    const sys = findSys(world, [row.sys]);
    const p = findPlanet(sys, [row.planet]);
    if (!p) continue;
    setColony(p, {
      pop: row.pop,
      colonyType: "colony",
      loyalty: 58,
      races: FED_MIX,
      resources: ["железо", "пища"],
      notes: row.note,
      surface: [
        b("Военная управа", "capitol"),
        b("Жильё", "residential"),
        b("Медпункт", "residential", "surface", "bios.medical"),
        ...many(8, () => b("Агро", "farm")),
        ...many(2, () => b("Шахта", "mine")),
        b("ТЭС", "factory", "surface", "energia.thermal_plant"),
        b("ПКО", "defense"),
        b("Казармы управы", "barracks"),
      ],
      orbital: [
        b("Космопорт", "spaceport", "orbital"),
        ...many(2, () =>
          b("Гидропоника", "farm", "orbital", "bios.hydroponics"),
        ),
      ],
    });
  }

  // Поллукс — ХэШах-анклав под крышей Империи
  {
    const sys = findSys(world, ["Поллукс"]);
    const p = findPlanet(sys, ["Мир Поллукс"]);
    if (p) {
      setColony(p, {
        pop: 700,
        colonyType: "colony",
        loyalty: 72,
        races: HESHAH_MIX,
        resources: ["железо", "минералы"],
        notes: "Мир ХэШах в имперской орбите. Союзный контингент, общая логистика.",
        surface: [
          b("Совет ХэШах", "capitol"),
          b("Жильё", "residential"),
          b("Медпункт", "residential", "surface", "bios.medical"),
          ...many(6, () => b("Агро Поллукс", "farm")),
          ...many(3, () => b("Шахта", "mine")),
          b("Завод", "factory"),
          b("ТЭС", "factory", "surface", "energia.thermal_plant"),
          b("ПКО", "defense"),
          b("Казармы союзников", "barracks"),
        ],
        orbital: [
          b("Космопорт Поллукс", "spaceport", "orbital"),
          ...many(2, () =>
            b("Гидропоника", "farm", "orbital", "bios.hydroponics"),
          ),
        ],
      });
    }
  }

  // Обнулить неразвитые претензии / бывшие мега-населения без инфраструктуры
  const settled = new Set();
  for (const sys of world.systems || []) {
    if (sys.ownerFactionId !== FACTION) continue;
    for (const p of sys.planets || []) {
      const hasBuildings =
        (p.surfaceBuildings?.length || 0) + (p.orbitalBuildings?.length || 0) >
        0;
      if (hasBuildings && p.colonyType && p.colonyType !== "none") {
        settled.add(p.id);
      }
    }
  }
  for (const sys of world.systems || []) {
    if (sys.ownerFactionId !== FACTION) continue;
    for (const p of sys.planets || []) {
      if (settled.has(p.id)) continue;
      clearPlanet(p);
    }
  }

  /**
   * Жёсткий баланс потоков:
   * - farm upkeep D×1, hydro D×2 — лишние фермы уводят энергию в минус
   * - geo_hydro = чистый D (yield 3, без upkeep) → основной профицит энергии
   * - hydro даёт E3 под легионы; обычные фермы — E1 под население
   */
  const belPlanets = [];
  for (const sys of world.systems || []) {
    if (sys.ownerFactionId !== FACTION) continue;
    for (const p of sys.planets || []) {
      if ((p.surfaceBuildings?.length || 0) + (p.orbitalBuildings?.length || 0) > 0) {
        belPlanets.push({ sys, p });
      }
    }
  }

  const isHydro = (x) => x.buildingId === "bios.hydroponics";
  const isGeo = (x) => x.buildingId === "energia.geo_hydro";
  const isFarm = (x) => x.kind === "farm" && !isHydro(x);
  const isMine = (x) => x.kind === "mine";
  const isTherm = (x) => x.buildingId === "energia.thermal_plant";
  const isHeavyIndustry = (x) =>
    x.kind === "factory" &&
    !isGeo(x) &&
    !isTherm(x) &&
    ![
      "energia.solar_catcher",
      "energia.fusion_reactor",
      "energia.geo_hydro",
    ].includes(x.buildingId);

  const extractHub = (sys, p) =>
    /Мерцак|Десерти|Гурез|Велентис|Солис|Адара|Вихрь|Процион/.test(
      `${sys.name} ${p.name}`,
    );
  const bioHub = (sys, p) =>
    /Элегантия|Мегрец|Солис|Капелла|Каппа/.test(`${sys.name} ${p.name}`);
  const industryHub = (sys, p) =>
    /Гурез|Солис|Регул|Адара/.test(`${sys.name} ${p.name}`);

  for (const { sys, p } of belPlanets) {
    const maxFarm = bioHub(sys, p) ? 12 : extractHub(sys, p) ? 4 : 5;
    const maxHydro = bioHub(sys, p) ? 2 : 1;
    const maxMine = extractHub(sys, p) ? 8 : 3;
    const maxTherm = 1;
    const maxIndustry = industryHub(sys, p) ? 4 : 1;
    const maxBarracks = industryHub(sys, p) || bioHub(sys, p) ? 1 : 0;
    const maxCapitol = /Солис|Гурез|Элегантия|Десерти|Алиот/.test(
      `${sys.name} ${p.name}`,
    )
      ? 2
      : 1;
    let farms = 0,
      hydros = 0,
      mines = 0,
      therms = 0,
      industry = 0,
      barracks = 0,
      capitols = 0;
    p.surfaceBuildings = (p.surfaceBuildings || []).filter((x) => {
      if (isFarm(x)) return ++farms <= maxFarm;
      if (isMine(x)) return ++mines <= maxMine;
      if (isTherm(x)) return ++therms <= maxTherm;
      if (isGeo(x)) return false; // пересоберём ниже
      if (x.buildingId === "energia.solar_catcher") return false;
      if (isHeavyIndustry(x)) return ++industry <= maxIndustry;
      if (x.kind === "barracks") return ++barracks <= maxBarracks;
      if (x.kind === "capitol") return ++capitols <= maxCapitol;
      return true;
    });
    p.orbitalBuildings = (p.orbitalBuildings || []).filter((x) => {
      if (isHydro(x)) return ++hydros <= maxHydro;
      return true;
    });
  }

  // Целевые гео-станции (чистый D) + точечные солнечные ловцы
  const geoTargets = [
    ["Солис", "Домус Солис", 28],
    ["Гурез", "Домус Гурез", 22],
    ["Десерти", "Домус Десерти", 20],
    ["Мерцак", "Мир Мерцак", 20],
    ["Элегантия", "Домус Элегантия", 14],
    ["Мегрец", "Мир Мегрец", 14],
    ["Регул", "Мир Регул", 14],
    ["Адара", "Мир Адара", 12],
    ["Процион", "Мир Процион", 12],
    ["Алиот", "Домус Алиот", 10],
    ["Алькор", "Домус Алькор", 8],
    ["Капелла", "Мир Капелла", 10],
    ["Каппа", "Мир Каппа", 8],
    ["Ню", "Мир Ню", 8],
    ["Поллукс", "Мир Поллукс", 8],
    ["Альбирео", "Мир Альбирео", 6],
  ];
  for (const [sysName, planetName, n] of geoTargets) {
    const p = findPlanet(findSys(world, [sysName]), [planetName]);
    if (!p) continue;
    p.surfaceBuildings = p.surfaceBuildings || [];
    for (let i = 0; i < n; i++) {
      p.surfaceBuildings.push(
        b(`Геостанция ${sysName}`, "factory", "surface", "energia.geo_hydro"),
      );
    }
    p.surfaceSlots = Math.max(p.surfaceSlots ?? 8, p.surfaceBuildings.length + 2);
  }

  // Гео на КАЖДОМ заселённом мире — закрывает D upkeep шахт/ферм/портов
  for (const { sys, p } of belPlanets) {
    const already = geoTargets.some(
      ([sn, pn]) => sn === sys.name && pn === p.name,
    );
    const n = already ? 12 : 16;
    p.surfaceBuildings = p.surfaceBuildings || [];
    for (let i = 0; i < n; i++) {
      p.surfaceBuildings.push(
        b(`Геосеть ${sys.name}`, "factory", "surface", "energia.geo_hydro"),
      );
    }
    p.surfaceSlots = Math.max(p.surfaceSlots ?? 8, p.surfaceBuildings.length + 2);
  }

  // Убрать ТЭС (жрут D как fuel) — геосеть закрывает энергию чище
  for (const { p } of belPlanets) {
    p.surfaceBuildings = (p.surfaceBuildings || []).filter(
      (x) => x.buildingId !== "energia.thermal_plant",
    );
  }

  for (const [sysName, planetName] of [
    ["Солис", "Домус Солис"],
    ["Гурез", "Домус Гурез"],
    ["Десерти", "Домус Десерти"],
    ["Мерцак", "Мир Мерцак"],
    ["Процион", "Мир Процион"],
  ]) {
    const p = findPlanet(findSys(world, [sysName]), [planetName]);
    if (!p) continue;
    p.surfaceBuildings = p.surfaceBuildings || [];
    p.surfaceBuildings.push(
      b(`Ловец соларида ${sysName}`, "factory", "deep", "energia.solar_catcher"),
    );
  }

  // Extracta (A) — вторичный вход D→E; без шахт фермы/гидро не кормят империю
  for (const [sysName, planetName, n] of [
    ["Солис", "Домус Солис", 10],
    ["Гурез", "Домус Гурез", 10],
    ["Десерти", "Домус Десерти", 14],
    ["Мерцак", "Мир Мерцак", 16],
    ["Адара", "Мир Адара", 10],
    ["Процион", "Мир Процион", 10],
    ["Регул", "Мир Регул", 8],
    ["Велентис", "Вихрь-Крак-2", 6],
  ]) {
    const p = findPlanet(findSys(world, [sysName]), [planetName]);
    if (!p) continue;
    p.surfaceBuildings = p.surfaceBuildings || [];
    for (let i = 0; i < n; i++) {
      p.surfaceBuildings.push(b(`Промысел ${sysName}`, "mine"));
    }
    p.surfaceSlots = Math.max(p.surfaceSlots ?? 8, p.surfaceBuildings.length + 2);
  }

  // Гидро под E3 легионов (~260 str → ~104 demand; hydro throughput≈4 → ~30 хватает)
  for (const [sysName, planetName, n] of [
    ["Солис", "Домус Солис", 6],
    ["Элегантия", "Домус Элегантия", 6],
    ["Мегрец", "Мир Мегрец", 6],
    ["Гурез", "Домус Гурез", 4],
    ["Капелла", "Мир Капелла", 4],
  ]) {
    const p = findPlanet(findSys(world, [sysName]), [planetName]);
    if (!p) continue;
    p.orbitalBuildings = p.orbitalBuildings || [];
    for (let i = 0; i < n; i++) {
      p.orbitalBuildings.push(
        b(`Гидроконтур ${sysName}`, "farm", "orbital", "bios.hydroponics"),
      );
    }
    p.orbitalSlots = Math.max(p.orbitalSlots ?? 4, p.orbitalBuildings.length + 2);
  }

  // Доп. агро на био-хабах (E1 после того как A разблокирован шахтами)
  for (const [sysName, planetName, n] of [
    ["Элегантия", "Домус Элегантия", 8],
    ["Мегрец", "Мир Мегрец", 8],
    ["Солис", "Домус Солис", 6],
    ["Капелла", "Мир Капелла", 6],
  ]) {
    const p = findPlanet(findSys(world, [sysName]), [planetName]);
    if (!p) continue;
    p.surfaceBuildings = p.surfaceBuildings || [];
    for (let i = 0; i < n; i++) {
      p.surfaceBuildings.push(b(`Агроконтур ${sysName}`, "farm"));
    }
    p.surfaceSlots = Math.max(p.surfaceSlots ?? 8, p.surfaceBuildings.length + 2);
  }

  // Жильё + дифференцированное население по лору (игровые единицы, не миллионы)
  const popPlan = [
    ["Солис", "Домус Солис", 160, 6],
    ["Гурез", "Домус Гурез", 110, 4],
    ["Гурез", "Луна Гурез", 28, 1],
    ["Элегантия", "Домус Элегантия", 100, 3],
    ["Десерти", "Домус Десерти", 100, 3],
    ["Мегрец", "Мир Мегрец", 90, 3],
    ["Регул", "Мир Регул", 80, 2],
    ["Процион", "Мир Процион", 75, 2],
    ["Мерцак", "Мир Мерцак", 70, 2],
    ["Адара", "Мир Адара", 75, 2],
    ["Алиот", "Домус Алиот", 60, 2],
    ["Алькор", "Домус Алькор", 55, 2],
    ["Капелла", "Мир Капелла", 65, 2],
    ["Каппа", "Мир Каппа", 55, 2],
    ["Ню", "Мир Ню", 50, 2],
    ["Поллукс", "Мир Поллукс", 55, 2],
    ["Альбирео", "Мир Альбирео", 45, 1],
    ["Йота", "Мир Йота", 28, 1],
    ["Антрес", "Мир Антрес", 28, 1],
    ["Альдебар", "Мир Альдебар", 28, 1],
    ["Гамма", "Домус Данкристо", 35, 1],
    ["Гамма", "Домус Белвор", 35, 1],
    ["Велентис", "Вихрь-Крак-2", 30, 1],
  ];
  for (const [sysName, planetName, pop, resid] of popPlan) {
    const p = findPlanet(findSys(world, [sysName]), [planetName]);
    if (!p) continue;
    p.surfaceBuildings = p.surfaceBuildings || [];
    const have = (p.surfaceBuildings || []).filter(
      (x) => x.kind === "residential",
    ).length;
    for (let i = have; i < resid; i++) {
      p.surfaceBuildings.push(b(`Квартал ${sysName}`, "residential"));
    }
    // bios.medical даёт capacity_add E3 и при capacity>0 режет весь E3 rate — не ставим.
    p.surfaceBuildings = (p.surfaceBuildings || []).filter(
      (x) => x.buildingId !== "bios.medical",
    );
    p.population = pop;
    p.surfaceSlots = Math.max(p.surfaceSlots ?? 8, p.surfaceBuildings.length + 2);
  }

  // Финальный агро-толчок под возросшее население (держать E в плюсе)
  for (const [sysName, planetName, n] of [
    ["Элегантия", "Домус Элегантия", 16],
    ["Мегрец", "Мир Мегрец", 16],
    ["Солис", "Домус Солис", 14],
    ["Капелла", "Мир Капелла", 10],
    ["Десерти", "Домус Десерти", 8],
    ["Гурез", "Домус Гурез", 8],
    ["Регул", "Мир Регул", 6],
    ["Процион", "Мир Процион", 6],
    ["Каппа", "Мир Каппа", 6],
    ["Ню", "Мир Ню", 6],
  ]) {
    const p = findPlanet(findSys(world, [sysName]), [planetName]);
    if (!p) continue;
    for (let i = 0; i < n; i++) {
      p.surfaceBuildings.push(b(`Агропрофицит ${sysName}`, "farm"));
    }
    p.surfaceSlots = Math.max(p.surfaceSlots ?? 8, p.surfaceBuildings.length + 2);
  }

  // Ещё гидро под пиковый E3 (легионы + upkeep)
  for (const [sysName, planetName, n] of [
    ["Элегантия", "Домус Элегантия", 4],
    ["Мегрец", "Мир Мегрец", 4],
    ["Солис", "Домус Солис", 4],
  ]) {
    const p = findPlanet(findSys(world, [sysName]), [planetName]);
    if (!p) continue;
    for (let i = 0; i < n; i++) {
      p.orbitalBuildings.push(
        b(`Гидропрофицит ${sysName}`, "farm", "orbital", "bios.hydroponics"),
      );
    }
    p.orbitalSlots = Math.max(p.orbitalSlots ?? 4, p.orbitalBuildings.length + 2);
  }

  const f = (world.factions || []).find((x) => x.id === FACTION);
  if (f) {
    const ecoNote =
      "Экономика: Солис (столица/соларид/Тихий Огонь) · Гурез (верфи) · Элегантия/Мегрец (агро) · Десерти/Мерцак/Велентис (добыча) · Западный марш (Алиот→Адара) · Федерация под управой. Баланс в плюсе.";
    if (!(f.notes || "").includes("Экономика:")) {
      f.notes = [f.notes, ecoNote].filter(Boolean).join("\n");
    }
    const gm =
      "Economy pass Belator: rebels cleared; pops scaled to housing; tech medicine/biocatalysis/deep mining + catalog A/D/E/C; techTiers recomputed; legion upkeep tuned.";
    if (!(f.gmNotes || "").includes("Economy pass Belator")) {
      f.gmNotes = [f.gmNotes, gm].filter(Boolean).join("\n");
    }
  }

  if (world.meta) {
    world.meta.updatedAt = new Date().toISOString();
    world.meta.tableRevision = (world.meta.tableRevision ?? 0) + 1;
  }

  return removed;
}

function patchLedger(content) {
  const led = JSON.parse(fs.readFileSync(LEDGER, "utf8"));
  const eco = led.factions[FACTION];
  if (!eco) {
    console.warn("no ledger faction");
    return eco;
  }

  const techSet = new Set(eco.unlockedTechs || []);
  for (const id of EXTRA_TECHS) {
    if (content.technologies?.[id] || content.tech?.[id]) techSet.add(id);
    else if (getContent().technologies?.[id]) techSet.add(id);
    else {
      // technologies live at content root in loader — try both
      const techs = getContent().technologies || getContent().techs || {};
      if (techs[id]) techSet.add(id);
      else console.warn("skip missing tech", id);
    }
  }
  // Always add known extras if present in content
  const allTechs = getContent().technologies || {};
  for (const id of EXTRA_TECHS) {
    if (allTechs[id]) techSet.add(id);
  }
  eco.unlockedTechs = [...techSet];
  recomputeUnlocksFromTechs(eco, getContent(), FACTION, world);

  // Floor tiers so shipyard/hydroponics/deep mines реально работают
  const floor = { A: 6, B: 6, C: 6, D: 6, E: 6, F: 7 };
  for (const [k, v] of Object.entries(floor)) {
    eco.techTiers[k] = Math.max(Number(eco.techTiers[k] ?? 1), v);
  }

  eco.stocks = {
    ...eco.stocks,
    "currency.metal": 42000,
    "currency.supply": 18000,
    "currency.extracta": 220,
    "currency.materia": 160,
    "currency.industria": 120,
    "currency.energia": 280,
    "currency.bios": 180,
    "currency.cognitio": Math.max(Number(eco.stocks["currency.cognitio"] ?? 0), 8000),
    "map.food": 14000,
    "map.biomass": 11000,
    "map.biofuel": 9000,
    "map.buildplex": 10000,
    "map.solari": 16000,
    "map.titan": 7000,
    "map.iron": 12000,
    "map.gold": 5000,
    "map.silver": 6000,
    "map.minerals": 9000,
  };
  eco.deficit = null;
  eco.bottlenecks = {};
  eco.pressure = Math.min(eco.pressure ?? 0, 8);

  fs.writeFileSync(LEDGER, JSON.stringify(led, null, 2) + "\n", "utf8");
  console.log(
    "ledger: techs=",
    eco.unlockedTechs.length,
    "tiers=",
    eco.techTiers,
    "bios=",
    eco.stocks["currency.bios"],
  );
  return eco;
}

function main() {
  loadContent();
  let rebelsRemoved = 0;
  let worldForCheck = null;

  for (const file of WORLD_FILES) {
    if (!fs.existsSync(file)) continue;
    const world = JSON.parse(fs.readFileSync(file, "utf8"));
    rebelsRemoved = applyLayout(world);
    fs.writeFileSync(file, JSON.stringify(world, null, 2) + "\n", "utf8");
    console.log("patched", path.basename(file), "rebels removed:", rebelsRemoved);
    if (!worldForCheck) worldForCheck = world;
  }

  const eco = patchLedger(getContent());

  if (worldForCheck && eco) {
    const bd = computeFlowBreakdown(worldForCheck, FACTION, getContent(), eco);
    const totals = bd.totals || {};
    console.log("flow totals:", JSON.stringify(totals, null, 2));
    console.log("bottlenecks:", JSON.stringify(bd.bottlenecks || {}, null, 2));
  }
}

main();
