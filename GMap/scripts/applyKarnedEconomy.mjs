/**
 * Specialize Karned production for easy early gameplay:
 * - Cut pop to «малочисленные» (fixes Bios pop demand)
 * - Remove lab-spam (E upkeep); hospitals → bios.medical
 * - Role planets: bio / mine / energy / industry / capital
 * - Shipyards: Стрида (main) + Нанокарст (secondary) + Голоколь (repair)
 * - techTiers → 5 so spaceport/shipyard/hydroponics contribute
 * - Healthy ledger stocks, clear deficit
 *
 * Run: node GMap/scripts/applyKarnedEconomy.mjs
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

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
  const set = new Set(names);
  return (
    sys.planets.find((p) => set.has(p.name)) ||
    sys.planets.find((p) => p.colonyType && p.colonyType !== "none") ||
    sys.planets[0]
  );
}

function setColony(planet, { pop, colonyType, notes, surface, orbital }) {
  planet.population = pop;
  planet.colonyType = colonyType;
  planet.habitable = true;
  planet.colonizable = true;
  planet.ownerFactionId = FACTION;
  planet.raceComposition = MIXED.map((r) => ({ ...r }));
  if (notes) planet.notes = notes;
  planet.surfaceBuildings = surface;
  planet.orbitalBuildings = orbital || [];
  planet.surfaceSlots = Math.max(planet.surfaceSlots ?? 8, surface.length + 2);
  planet.orbitalSlots = Math.max(
    planet.orbitalSlots ?? 4,
    (orbital || []).length + 2,
  );
}

function applyLayout(world) {
  // Legion strength was 5000 → E demand +2000/turn; tune for early game
  for (const l of world.legions ?? []) {
    if (l.factionId === FACTION && (l.strength ?? 0) > 200) {
      l.strength = 120;
      if (!l.notes) l.notes = "Королевский легион (ранний контур, ~когорта).";
    }
  }

  // ——— Стрида / Гарденис: столица + главная верфь + баланс цепи ———
  {
    const sys = findSys(world, ["Стрида", "SYS-565"]);
    const p = findPlanet(sys, ["Гарденис"]);
    setColony(p, {
      pop: 1200,
      colonyType: "core",
      notes:
        "Столичный мир Гарденис. Полис в равнинах среди гор; звезда башен. Экономический хаб: агро + плавильни + заводы + главная верфь. Базовые нужды закрыты.",
      surface: [
        b("Башня Архонта (центр звезды)", "capitol"),
        b("Башня Жреца-Тенепляса (духовный полюс)", "capitol"),
        b("Башня лидеров · луч I", "defense"),
        b("Башня лидеров · луч II", "defense"),
        b("Узел ПВО/ПКО · звезда", "defense"),
        b("Первые дома Гарденис", "residential"),
        ...many(12, () => b("Агрокомплекс Гарденис", "farm")),
        ...many(2, () => b("Шахты Гарденис", "mine")),
        b("Плавильня Гарденис I", "factory", "surface", "materia.smelter"),
        b("Плавильня Гарденис II", "factory", "surface", "materia.smelter"),
        b("Завод Гарденис I", "factory"),
        b("Завод Гарденис II", "factory"),
        b("Серебряная Гавань (сборка)", "factory", "surface", "industria.assembly"),
        b("ТЭС Гарденис I", "factory", "surface", "energia.thermal_plant"),
        b("ТЭС Гарденис II", "factory", "surface", "energia.thermal_plant"),
        b("ТЭС Гарденис III", "factory", "surface", "energia.thermal_plant"),
        b("Госпиталь Гарденис", "residential", "surface", "bios.medical"),
        b("Библиотека Архитекторов", "lab"),
        b("Храм Серебряной Луны", "residential"),
        b("Казармы верных эланор", "barracks"),
      ],
      orbital: [
        b("Космопорт Гарденис", "spaceport", "orbital"),
        b("Королевская верфь Стриды", "shipyard", "orbital"),
        b("Верфь сопровождения Стриды", "shipyard", "orbital"),
        ...many(5, () =>
          b("Гидропоника Стриды", "farm", "orbital", "bios.hydroponics"),
        ),
        b("Орбитальный узел ПКО", "defense", "orbital"),
      ],
    });
  }

  // ——— Корнепеснь: био/еда (SYS-0004) ———
  {
    const sys = findSys(world, ["Корнепеснь", "SYS-564"]);
    const terra = findPlanet(sys, ["Терракульт"]);
    setColony(terra, {
      pop: 500,
      colonyType: "colony",
      notes:
        "Агро-хаб Карнед (культивация / органика). Малочисленная качественная колония — основной поставщик Bios.",
      surface: [
        b("Жилой квартал Терракульт", "residential"),
        ...many(10, () => b("Агрокомплекс Терракульт", "farm")),
        b("Шахта стройресурса", "mine"),
        b("Госпиталь Терракульт", "residential", "surface", "bios.medical"),
        b("Храм корней", "residential"),
        b("Оборона Терракульт", "defense"),
      ],
      orbital: [
        b("Космопорт Терракульт", "spaceport", "orbital"),
        ...many(4, () =>
          b("Орб. гидропоника Корнепеснь", "farm", "orbital", "bios.hydroponics"),
        ),
      ],
    });
    const bio = findPlanet(sys, ["Биосфера-Полис"]);
    if (bio && bio.id !== terra.id) {
      setColony(bio, {
        pop: 400,
        colonyType: "colony",
        notes:
          "Биосфера с рисками. Лекарственные / ферменты. Качественная мед-агро колония.",
        surface: [
          b("Жильё Биосфера-Полис", "residential"),
          ...many(8, () => b("Агро / ферменты", "farm")),
          b("Медкомплекс Биосфера", "residential", "surface", "bios.medical"),
          b("Оборона периметра", "defense"),
        ],
        orbital: [
          b("Космопорт Биосфера-Полис", "spaceport", "orbital"),
          b("Гидропоника Биосфера", "farm", "orbital", "bios.hydroponics"),
        ],
      });
    }
    const mineP = sys.planets.find(
      (p) => /mining|4|руда|пояс/i.test(p.name + p.notes + p.colonyType) || p.colonyType === "mining",
    );
    if (mineP && mineP.id !== terra.id && mineP.id !== bio?.id) {
      setColony(mineP, {
        pop: 150,
        colonyType: "mining",
        notes: "Внешний пояс Корнепесни — редкоземы / руды.",
        surface: [
          ...many(3, () => b("Шахты пояса", "mine")),
          b("Жильё шахтёров", "residential"),
          b("Снабжение пояса", "farm"),
          b("Оборона пояса", "defense"),
        ],
        orbital: [b("Добычная станция пояса", "spaceport", "orbital")],
      });
      mineP.name = mineP.name.startsWith("Корнепеснь")
        ? mineP.name
        : "Пояс Корнепесни";
    }
  }

  // ——— Ауралис: северный агро + добыча ———
  {
    const sys = findSys(world, ["Ауралис", "SYS-561"]);
    const verd = findPlanet(sys, ["Вердант"]);
    setColony(verd, {
      pop: 400,
      colonyType: "colony",
      notes: "Северный агро-мир. Пища / вода / стройплексы. Качественная колония.",
      surface: [
        b("Жилой квартал Вердант", "residential"),
        ...many(8, () => b("Агрокомплекс Вердант", "farm")),
        b("Шахта стройплексов", "mine"),
        b("Госпиталь Вердант", "residential", "surface", "bios.medical"),
        b("Оборона Вердант", "defense"),
      ],
      orbital: [
        b("Космопорт Вердант", "spaceport", "orbital"),
        b("Гидропоника Вердант", "farm", "orbital", "bios.hydroponics"),
      ],
    });
    const belt = sys.planets.find((p) => p.orbitIndex === 5) || sys.planets[4];
    if (belt && belt.id !== verd.id) {
      setColony(belt, {
        pop: 150,
        colonyType: "mining",
        notes: "Астероидный пояс Ауралиса — металлы.",
        surface: [
          ...many(3, () => b("Шахты Ауралис-пояс", "mine")),
          b("Жильё", "residential"),
          b("Снабжение", "farm"),
        ],
        orbital: [b("Орб. добыча Ауралис", "spaceport", "orbital")],
      });
      belt.name = "Ауралис-Пояс";
    }
  }

  // ——— Абиссаль: гидро/био ———
  {
    const sys = findSys(world, ["Абиссаль", "SYS-566"]);
    const p = findPlanet(sys, ["Гидролис"]);
    setColony(p, {
      pop: 350,
      colonyType: "colony",
      notes: "Океанический биокатализ / пища. Гидроколония Карнед.",
      surface: [
        b("Жильё Гидролис", "residential"),
        ...many(8, () => b("Гидроагро Гидролис", "farm")),
        b("Гео/гидро станция", "factory", "surface", "energia.geo_hydro"),
        b("Госпиталь Гидролис", "residential", "surface", "bios.medical"),
        b("Оборона Гидролис", "defense"),
      ],
      orbital: [
        b("Космопорт Гидролис", "spaceport", "orbital"),
        ...many(2, () =>
          b("Орб. гидропоника Абиссаль", "farm", "orbital", "bios.hydroponics"),
        ),
      ],
    });
  }

  // ——— Голоколь: топливо / добыча / ремонтный док ———
  {
    const sys = findSys(world, ["Голоколь", "SYS-562"]);
    const p = findPlanet(sys, ["Никель-Пост"]);
    setColony(p, {
      pop: 200,
      colonyType: "mining",
      notes:
        "Холодный логистический узел: никель/кобальт/газ. Ремонтный док флота.",
      surface: [
        b("Жильё Никель-Пост", "residential"),
        ...many(4, () => b("Шахты Никель-Пост", "mine")),
        b("Газовый промысел", "mine", "surface", "extract.gas_well"),
        b("Плавильня Голоколь", "factory", "surface", "materia.smelter"),
        b("ТЭС Голоколь", "factory", "surface", "energia.thermal_plant"),
        b("Снабжение поста", "farm"),
        b("Снабжение поста II", "farm"),
        b("Оборона поста", "defense"),
      ],
      orbital: [
        b("Космопорт Голоколь", "spaceport", "orbital"),
        b("Ремонтный док Голоколь", "shipyard", "orbital", "industria.repair_dock"),
        b("Гидропоника Голоколь", "farm", "orbital", "bios.hydroponics"),
      ],
    });
  }

  // ——— Плазмир: энергия / сплавы ———
  {
    const sys = findSys(world, ["Плазмир", "SYS-563"]);
    const p = findPlanet(sys, ["Искра"]);
    setColony(p, {
      pop: 250,
      colonyType: "colony",
      notes:
        "Энерго-металлургический узел (плазма / сплавы). Малочисленная промколония.",
      surface: [
        b("Жильё Искра", "residential"),
        ...many(3, () => b("Шахты плазмы / сплавов", "mine")),
        b("Плавильня Искра", "factory", "surface", "materia.smelter"),
        b("Кристалл-цех", "factory", "surface", "materia.crystal_workshop"),
        b("ТЭС Искра I", "factory", "surface", "energia.thermal_plant"),
        b("ТЭС Искра II", "factory", "surface", "energia.thermal_plant"),
        b("Геотермия Искра", "factory", "surface", "energia.geo_hydro"),
        b("Завод Искра", "factory"),
        b("Снабжение Искра", "farm"),
        b("Снабжение Искра II", "farm"),
        b("Оборона Искра", "defense"),
      ],
      orbital: [
        b("Космопорт Искра", "spaceport", "orbital"),
        b("Гидропоника Искра", "farm", "orbital", "bios.hydroponics"),
      ],
    });
  }

  // ——— Нанокарст: индустрия + вторая верфь ———
  {
    const sys = findSys(world, ["Нанокарст", "SYS-567"]);
    const p = findPlanet(sys, ["Чёрный Жил"]);
    setColony(p, {
      pop: 200,
      colonyType: "mining",
      notes:
        "Нанотех-пром: кибер-минералы / сплавы. Вторая верфь Карнед + сборка.",
      surface: [
        b("Жильё Чёрный Жил", "residential"),
        ...many(4, () => b("Шахты кибер-жил", "mine")),
        b("Плавильня Нанокарст", "factory", "surface", "materia.smelter"),
        b("Сборка Нанокарст", "factory", "surface", "industria.assembly"),
        b("Модульная стройка", "factory", "surface", "industria.modular_yard"),
        b("Завод корпусов", "factory"),
        b("ТЭС Нанокарст", "factory", "surface", "energia.thermal_plant"),
        b("Снабжение жилы", "farm"),
        b("Снабжение жилы II", "farm"),
        b("Медпункт жилы", "residential", "surface", "bios.medical"),
        b("Оборона жилы", "defense"),
      ],
      orbital: [
        b("Космопорт Нанокарст", "spaceport", "orbital"),
        b("Верфь Нанокарст", "shipyard", "orbital"),
        b("Верфь корпусов Нанокарст", "shipyard", "orbital"),
        b("Гидропоника Нанокарст", "farm", "orbital", "bios.hydroponics"),
      ],
    });
  }

  // ——— Северные форпосты: лёгкие ———
  for (const [names, label, pop] of [
    [["SYS-568"], "Северный форпост Карнед", 80],
    [["SYS-569"], "Северный форпост Карнед II", 80],
  ]) {
    const sys = findSys(world, names);
    if (!sys) continue;
    const p =
      sys.planets.find((x) => x.habitable || x.colonizable) || sys.planets[0];
    if (!p) continue;
    setColony(p, {
      pop,
      colonyType: "outpost",
      notes: `${label}: вектор северной экспансии. Минимум зданий, без пром-нагрузки.`,
      surface: [
        b(`Жильё ${label}`, "residential"),
        b(`Агро ${label}`, "farm"),
        b(`Агро ${label} II`, "farm"),
        b(`Медпункт ${label}`, "residential", "surface", "bios.medical"),
        b(`Оборона ${label}`, "defense"),
      ],
      orbital: [b(`Посадочная площадка ${label}`, "spaceport", "orbital")],
    });
    p.name = label;
  }

  // Zero stray pop / orphan colony flags on non-settled worlds (was inflating Bios demand)
  const settled = new Set();
  for (const sys of world.systems) {
    if (sys.ownerFactionId !== FACTION) continue;
    for (const p of sys.planets || []) {
      const hasBuildings =
        (p.surfaceBuildings?.length || 0) + (p.orbitalBuildings?.length || 0) > 0;
      if (hasBuildings && p.colonyType && p.colonyType !== "none") {
        settled.add(p.id);
      }
    }
  }
  for (const sys of world.systems) {
    if (sys.ownerFactionId !== FACTION) continue;
    for (const p of sys.planets || []) {
      if (settled.has(p.id)) continue;
      p.population = 0;
      p.colonyType = "none";
      p.raceComposition = [];
      p.surfaceBuildings = [];
      p.orbitalBuildings = [];
    }
  }

  // Extra farms on bio hubs + thermal on energy hub (final surplus nudge)
  const boostFarm = (sysNames, planetNames, n) => {
    const sys = findSys(world, sysNames);
    if (!sys) return;
    const p = findPlanet(sys, planetNames);
    if (!p?.surfaceBuildings) return;
    for (let i = 0; i < n; i++) {
      p.surfaceBuildings.push(b(`Агро резерв ${planetNames[0]}`, "farm"));
    }
    p.surfaceSlots = Math.max(p.surfaceSlots ?? 8, p.surfaceBuildings.length + 1);
  };
  boostFarm(["Корнепеснь", "SYS-564"], ["Терракульт"], 4);
  boostFarm(["Ауралис", "SYS-561"], ["Вердант"], 3);
  boostFarm(["Абиссаль", "SYS-566"], ["Гидролис"], 3);
  const addGeos = (sysNames, planetNames, n, label) => {
    const sys = findSys(world, sysNames);
    const p = findPlanet(sys, planetNames);
    if (!p?.surfaceBuildings) return;
    for (let i = 0; i < n; i++) {
      p.surfaceBuildings.push(
        b(`${label} ${i + 1}`, "factory", "surface", "energia.geo_hydro"),
      );
    }
    p.surfaceSlots = Math.max(p.surfaceSlots ?? 8, p.surfaceBuildings.length + 1);
  };
  // Плазмир = энергохаб; плюс гео на столице/гидромире
  {
    const sys = findSys(world, ["Плазмир", "SYS-563"]);
    const p = findPlanet(sys, ["Искра"]);
    if (p?.surfaceBuildings) {
      p.surfaceBuildings.push(
        b("ТЭС Искра III", "factory", "surface", "energia.thermal_plant"),
        b("ТЭС Искра IV", "factory", "surface", "energia.thermal_plant"),
      );
    }
  }
  addGeos(["Плазмир", "SYS-563"], ["Искра"], 10, "Геотермия Искра");
  addGeos(["Стрида", "SYS-565"], ["Гарденис"], 6, "Гео/гидро Гарденис");
  addGeos(["Абиссаль", "SYS-566"], ["Гидролис"], 4, "Гео/гидро Гидролис");
  addGeos(["Голоколь", "SYS-562"], ["Никель-Пост"], 3, "Гео Голоколь");

  // Faction doctrine note append (economy)
  const f = world.factions.find((x) => x.id === FACTION);
  if (f) {
    const ecoNote =
      "Экономика: специализированные миры (агро Корнепеснь/Ауралис/Абиссаль; энергия Плазмир; добыча Голоколь/Нанокарст; верфи Стрида+Нанокарст, ремонт Голоколь). Население малочисленное под положительный Bios.";
    if (!(f.notes || "").includes("Экономика:")) {
      f.notes = [f.notes, ecoNote].filter(Boolean).join("\n");
    }
    const gm =
      "Economy pass: techTiers=5; shipyards Strida×2 + Nanokarst×2; repair Holokol; legion strength 120; labs minimized (medical=bios.medical).";
    if (!(f.gmNotes || "").includes("Economy pass")) {
      f.gmNotes = [f.gmNotes, gm].filter(Boolean).join("\n");
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
    console.warn("no ledger faction");
    return;
  }
  eco.stocks = {
    ...eco.stocks,
    "currency.metal": 28000,
    "currency.supply": 12000,
    "currency.extracta": 80,
    "currency.materia": 60,
    "currency.industria": 40,
    "currency.energia": 120,
    "currency.bios": 100,
    "currency.cognitio": 40,
    "map.food": 12000,
    "map.biomass": 10000,
    "map.biofuel": 8000,
    "map.buildplex": 12000,
  };
  eco.techTiers = { A: 5, B: 5, C: 5, D: 5, E: 5, F: 5 };
  eco.deficit = null;
  eco.bottlenecks = {};
  eco.pressure = Math.min(eco.pressure ?? 0, 10);
  fs.writeFileSync(LEDGER, JSON.stringify(led, null, 2) + "\n", "utf8");
  console.log("ledger: bios=100, techTiers=5, deficit cleared");
}

function main() {
  for (const file of WORLD_FILES) {
    if (!fs.existsSync(file)) continue;
    const world = JSON.parse(fs.readFileSync(file, "utf8"));
    applyLayout(world);
    fs.writeFileSync(file, JSON.stringify(world, null, 2) + "\n", "utf8");
    console.log("patched", path.basename(file));
  }
  patchLedger();
}

main();
