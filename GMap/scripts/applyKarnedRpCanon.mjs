/**
 * Apply Avis/Karned RP canon onto the live board:
 * - Rename SYS-561..567 (capital: Стрида / Гарденис from player RP)
 * - Quality colonies in all 7 core systems
 * - Capital polis (star-defense, civic buildings, Architects)
 * - Faction doctrine notes + court NPCs
 *
 * Run: node GMap/scripts/applyKarnedRpCanon.mjs
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TARGETS = [
  path.join(ROOT, "data/published.json"),
  path.join(ROOT, "data/campaign-draft.json"),
  path.join(ROOT, "public/campaigns/lo_golden_pax.json"),
];

const FACTION_ID = "faction_karned";
const uuid = () => crypto.randomUUID();

const MIXED_RACES = [
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

function bld(name, kind, zone = "surface") {
  return { id: uuid(), name, kind, zone };
}

function qualityCivic(prefix) {
  return [
    bld(`Жилой квартал ${prefix}`, "residential"),
    bld(`Агрокомплекс ${prefix}`, "farm"),
    bld(`Промпредприятие ${prefix}`, "factory"),
    bld(`Госпиталь ${prefix}`, "lab"),
    bld(`Библиотека ${prefix}`, "lab"),
    bld(`Храм ${prefix}`, "lab"),
  ];
}

/**
 * Player-confirmed: Стрида (star/system) + Гарденис (world).
 * Other six: lore-themed working names (ex-SYS ids kept in gmNotes) —
 * replace if Avis supplies exact list.
 */
const RENAMES = {
  "SYS-561": {
    system: "Ауралис",
    loreId: "SYS-0001",
    colonyPlanetOrbit: 3,
    colonyName: "Вердант",
    colonyType: "colony",
    pop: 4200,
    notes:
      "Северная аграрно-торговая система Карнед. УФ-всплески; биолюминесценция над океаном. Качественная малочисленная колония без нац. анклавов.",
  },
  "SYS-562": {
    system: "Голоколь",
    loreId: "SYS-0002",
    colonyPlanetOrbit: 3,
    colonyName: "Никель-Пост",
    colonyType: "mining",
    pop: 2800,
    notes:
      "Холодная дозаправочная система. Голо-колокол на орбите. Качественный добычной аванпост.",
  },
  "SYS-563": {
    system: "Плазмир",
    loreId: "SYS-0003",
    colonyPlanetOrbit: 5,
    colonyName: "Искра",
    colonyType: "colony",
    pop: 3600,
    notes:
      "Горячая система плазмо-кристаллов. Малочисленная качественная колония на переходной скалистой (нет комфортной hab-зоны).",
  },
  "SYS-564": {
    system: "Корнепеснь",
    loreId: "SYS-0004",
    colonyPlanetOrbit: 2,
    colonyName: "Терракульт",
    colonyType: "colony",
    pop: 4800,
    extraColonies: [
      {
        orbit: 3,
        name: "Биосфера-Полис",
        colonyType: "colony",
        pop: 3200,
        notesExtra:
          "Пригодна с рисками (агрессивная флора/фауна). Ферменты / лекарственные соединения.",
      },
    ],
    notes:
      "Богатая органическая химия; высокая биологическая конкуренция. Дроны-агрономы; орбитальные биокупола. Диковинки: песнь корней; электрофитные штормы.",
  },
  "SYS-565": {
    system: "Стрида",
    loreId: "SYS-0005",
    colonyPlanetOrbit: 2,
    colonyName: "Гарденис",
    colonyType: "core",
    pop: 22000,
    isCapital: true,
    notes:
      "Столица дуалистической монархии Карнед. Звезда Стрида; столичный мир Гарденис. Полис в равнинах среди гор; Архитекторы возводят город с оборонным и экономическим потенциалом. Центр сверху — звезда башен. Планета закрывает базовые потребности.",
  },
  "SYS-566": {
    system: "Абиссаль",
    loreId: "SYS-0006",
    colonyPlanetOrbit: 1,
    colonyName: "Гидролис",
    colonyType: "colony",
    pop: 4000,
    notes:
      "Океаническая система с абиссальными организмами и «железным дождём». Качественная гидроколония.",
  },
  "SYS-567": {
    system: "Нанокарст",
    loreId: "SYS-0007",
    colonyPlanetOrbit: 1,
    colonyName: "Чёрный Жил",
    colonyType: "mining",
    pop: 3000,
    notes:
      "Стратегическая нанотех-добыча. Холодно и дорого; качественный горный анклав.",
  },
};

const FACTION_NOTES = [
  "Доктрина расселения (Avis Wintory): экспансия на северные системы; население поровну по городам; без деления на нации; колонии малочисленные, но качественно обустроенные.",
  "Дуализм власти: светский полюс (Архонт / башня правителя) и духовный/орденский полюс (круг Жреца-Тенепляса). Башни прочих лидеров образуют «лучи» столицы.",
  "Тайный Орден — зародыш тайной полиции при круге Жреца-Тенепляса.",
  "Архитекторы / Великий Архитектор — ускоренное возведение полиса из местных горных пород почти без затрат стройресурса.",
  "Бистьеры: отдельной национальной политики нет (вопрос в ролке открыт); живут в общем смешанном составе.",
].join("\n");

const FACTION_GM_NOTES = [
  "Канон-источник: анонимная ролка Avis + лог Гарденис/Стрида.",
  "Имена Ауралис…Нанокарст (кроме Стрида/Гарденис) — рабочие по лору SYS-0001…0007; заменить, если игрок даст точный список.",
  "Старший Год'од-стратег прибыл; аудиенция один на один согласована (ожидает сцены).",
  "Север карты относительно столицы: Ауралис / Голоколь / Плазмир (меньший Y).",
].join("\n");

const NPCS = [
  {
    id: "npc_karned_archon",
    name: "Архонт Скиталец",
    title: "Светский полюс дуалистической монархии",
    role: "ruler",
    status: "active",
    publicNotes:
      "Правитель Карнеда. Центральная башня столицы — его. Культура Эланор: земные поклоны не приняты.",
    gmNotes: "PC / Avis Wintory. Пароль Archon.",
    tags: ["дуализм", "Эланор"],
  },
  {
    id: "npc_karned_teneplyas",
    name: "Жрец-Тенепляс",
    title: "Духовный полюс · основатель круга Тайного Ордена",
    role: "priest",
    status: "active",
    publicNotes:
      "Сформировал круг приближённых; подготовка Тайного Ордена (тайная полиция).",
    gmNotes: "Второй полюс власти. Следить за ростом Ордена.",
    tags: ["Тайный Орден", "дуализм"],
  },
  {
    id: "npc_karned_godod",
    name: "Старший Год'од",
    title: "Стратег",
    role: "strategist",
    status: "active",
    publicNotes:
      "Прибыл в столицу; не кланяется (норма Эланор). Требует аудиенции с глазу на глаз — согласие дано.",
    gmNotes: "Сцена аудиенции ещё не сыграна / в процессе.",
    tags: ["Год'од", "штаб"],
  },
  {
    id: "npc_karned_architect",
    name: "Великий Архитектор",
    title: "Глава Архитекторов",
    role: "architect",
    status: "active",
    publicNotes:
      "Проектирует полис с учётом обороны и экономики. Горные породы Гарденис позволяют строить почти без затрат.",
    gmNotes: "Объясняет недельную застройку столицы.",
    tags: ["Архитекторы"],
  },
  {
    id: "npc_karned_expant",
    name: "Кел дри Экспант",
    title: "Координатор строительства",
    role: "architect",
    status: "active",
    publicNotes: "Практическая координация возведения аванпостов и кварталов.",
    tags: ["Архитекторы"],
  },
  {
    id: "npc_karned_exzod",
    name: "Экз Од",
    title: "Стратег Эланор (круг приближённых)",
    role: "strategist",
    status: "active",
    publicNotes: "Военная координация; элитные контуры Эланор.",
    tags: ["Эланор", "штаб"],
  },
];

function ensureRaces(world) {
  const need = [
    ["race_elanor", "Эланор (верные)"],
    ["race_vendir", "Вендиры"],
    ["race_elanis", "Эланис"],
    ["race_elatris", "Элатрис"],
    ["race_triumvis", "Триумвис"],
    ["race_horn", "Хорны"],
    ["race_lithoid", "Слуги / литоиды"],
    ["race_elacrin", "Элакрин"],
    ["race_eladon", "Эладонцы"],
    ["race_bistier", "Бистьер"],
    ["race_architect", "Архитекторы"],
    ["race_godod", "Год'од"],
  ];
  world.races ??= [];
  for (const [id, name] of need) {
    if (!world.races.some((r) => r.id === id)) world.races.push({ id, name });
  }
}

function findHabitableOrOrbit(planets, orbit) {
  return (
    planets.find((p) => p.orbitIndex === orbit) ||
    planets.find((p) => p.habitable || p.colonizable) ||
    planets[0]
  );
}

function applyColony(planet, { name, colonyType, pop, notes, buildings, orbital }) {
  planet.name = name;
  planet.colonyType = colonyType;
  planet.habitable = planet.habitable || colonyType === "core" || colonyType === "colony";
  planet.colonizable = true;
  planet.population = pop;
  planet.raceComposition = MIXED_RACES.map((r) => ({ ...r }));
  planet.ownerFactionId = FACTION_ID;
  if (notes) planet.notes = notes;
  planet.surfaceBuildings = buildings;
  if (orbital) planet.orbitalBuildings = orbital;
  planet.surfaceSlots = Math.max(planet.surfaceSlots ?? 8, buildings.length + 2);
  if (orbital) {
    planet.orbitalSlots = Math.max(planet.orbitalSlots ?? 4, orbital.length + 1);
  }
}

function capitalBuildings() {
  return {
    surface: [
      bld("Башня Архонта (центр звезды)", "capitol"),
      bld("Башня Жреца-Тенепляса (духовный полюс)", "capitol"),
      bld("Башня лидеров · луч I", "defense"),
      bld("Башня лидеров · луч II", "defense"),
      bld("Башня лидеров · луч III", "defense"),
      bld("Узел ПВО / ПКО · луч A", "defense"),
      bld("Узел ПВО / ПКО · луч B", "defense"),
      bld("Узел ПВО / ПКО · луч C", "defense"),
      bld("Первые дома Гарденис", "residential"),
      bld("Агрокомплексы Гарденис", "farm"),
      bld("Шахты Гарденис", "mine"),
      bld("Первые промышленные предприятия", "factory"),
      bld("Госпитали Гарденис", "lab"),
      bld("Библиотеки Архитекторов", "lab"),
      bld("Храм Серебряной Луны", "lab"),
      bld("Серебряная Гавань (эладонский квартал)", "factory"),
      bld("Казармы верных эланор", "barracks"),
      bld("Дворец дуалистической монархии", "capitol"),
    ],
    orbital: [
      bld("Космопорт Гарденис", "spaceport", "orbital"),
      bld("Орбитальная верфь Стриды", "shipyard", "orbital"),
      bld("Орбитальный узел ПКО", "defense", "orbital"),
    ],
  };
}

function applySystem(sys, def, oldName) {
  sys.name = def.system;
  sys.isCapital = !!def.isCapital;
  sys.ownerFactionId = FACTION_ID;
  sys.notes = def.notes;
  const prevGm = (sys.gmNotes || "").trim();
  const tag = `loreId=${def.loreId}; ex=${oldName}`;
  sys.gmNotes = prevGm.includes(def.loreId)
    ? prevGm
    : [tag, prevGm].filter(Boolean).join("\n");

  const planet = findHabitableOrOrbit(sys.planets, def.colonyPlanetOrbit);
  if (!planet) {
    console.warn("No planet for", def.system);
    return;
  }

  if (def.isCapital) {
    const { surface, orbital } = capitalBuildings();
    applyColony(planet, {
      name: def.colonyName,
      colonyType: "core",
      pop: def.pop,
      notes:
        "Столичный мир Гарденис. Полис в равнинах среди гор. За неделю Архитекторы возвели дома, пром, госпитали, библиотеки и храмы. Сверху центр — звезда: башня правителя → башни лидеров → ПВО/ПКО. Базовые нужды закрыты.",
      buildings: surface,
      orbital,
    });
  } else {
    applyColony(planet, {
      name: def.colonyName,
      colonyType: def.colonyType,
      pop: def.pop,
      notes:
        (planet.notes ? planet.notes + " " : "") +
        "Качественная малочисленная колония Карнед; смешанный состав, без национальных анклавов.",
      buildings: [
        ...qualityCivic(def.colonyName),
        ...(def.colonyType === "mining" ? [bld(`Шахты ${def.colonyName}`, "mine")] : []),
        bld(`Оборона ${def.colonyName}`, "defense"),
      ],
      orbital: [bld(`Космопорт ${def.colonyName}`, "spaceport", "orbital")],
    });
  }

  for (const extra of def.extraColonies ?? []) {
    const p = findHabitableOrOrbit(sys.planets, extra.orbit);
    if (!p || p.id === planet.id) continue;
    applyColony(p, {
      name: extra.name,
      colonyType: extra.colonyType,
      pop: extra.pop,
      notes:
        (extra.notesExtra || p.notes || "") +
        " Качественная колония Карнед; смешанный состав.",
      buildings: [
        ...qualityCivic(extra.name),
        bld(`Оборона ${extra.name}`, "defense"),
      ],
      orbital: [bld(`Орбитальный пост ${extra.name}`, "spaceport", "orbital")],
    });
  }

  // Rename leftover "Планета N" to "Стрида-N" style for readability
  for (const p of sys.planets) {
    if (/^Планета\s+\d+/i.test(p.name || "")) {
      p.name = `${def.system}-${p.orbitIndex ?? "?"}`;
    }
    if (!p.ownerFactionId) p.ownerFactionId = FACTION_ID;
  }
}

function applyFaction(world) {
  let f = world.factions.find((x) => x.id === FACTION_ID);
  if (!f) {
    f = {
      id: FACTION_ID,
      name: "Дуалистическая монархия Карнед",
      color: "#3a7bd5",
      borderColor: "#1e6fd9",
      fillColor: "#2a3038",
      systemColor: "#4a8ee0",
      nameColor: "#c8d8f0",
      password: "Archon",
      kind: "state",
      fullMapVision: false,
      nameFont: "Spectral, Georgia, serif",
    };
    world.factions.push(f);
  }
  Object.assign(f, {
    name: "Дуалистическая монархия Карнед",
    kind: "state",
    notes: FACTION_NOTES,
    gmNotes: FACTION_GM_NOTES,
    npcs: NPCS.map((n) => ({
      ...n,
      factionId: FACTION_ID,
      locationSystemName: "Стрида",
      locationPlanetName: "Гарденис",
    })),
  });
}

function patchFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.warn("skip missing", filePath);
    return;
  }
  const world = JSON.parse(fs.readFileSync(filePath, "utf8"));
  ensureRaces(world);
  applyFaction(world);

  for (const [oldName, def] of Object.entries(RENAMES)) {
    const sys =
      world.systems.find((s) => s.name === oldName) ||
      world.systems.find((s) => s.name === def.system);
    if (!sys) {
      console.warn("missing system", oldName, "in", path.basename(filePath));
      continue;
    }
    const was = sys.name;
    applySystem(sys, def, oldName);
    console.log(`${path.basename(filePath)}: ${was} → ${sys.name} (${def.colonyName})`);
  }

  // Northern expansion markers on fringe (owned, light outposts)
  for (const [name, label, orbit] of [
    ["SYS-568", "Северный форпост Карнед", 1],
    ["SYS-569", "Северный форпост Карнед II", 1],
  ]) {
    const sys = world.systems.find((s) => s.name === name);
    if (!sys) continue;
    sys.ownerFactionId = FACTION_ID;
    sys.notes =
      (sys.notes ? sys.notes + " " : "") +
      "Вектор экспансии на север (доктрина Карнед). Качественный малочисленный форпост.";
    const p =
      sys.planets.find((x) => x.habitable || x.colonizable) ||
      sys.planets[orbit - 1] ||
      sys.planets[0];
    if (p && (!p.colonyType || p.colonyType === "none")) {
      applyColony(p, {
        name: label,
        colonyType: "outpost",
        pop: 900,
        notes: "Северный форпост: малочисленный, качественно обустроенный.",
        buildings: [
          bld(`Жильё ${label}`, "residential"),
          bld(`Снабжение ${label}`, "farm"),
          bld(`Госпиталь ${label}`, "lab"),
          bld(`Оборона ${label}`, "defense"),
        ],
      });
      console.log(`${path.basename(filePath)}: northern outpost on ${name}`);
    }
  }

  if (world.meta) {
    world.meta.updatedAt = new Date().toISOString();
    world.meta.tableRevision = (world.meta.tableRevision ?? 0) + 1;
  }

  fs.writeFileSync(filePath, JSON.stringify(world, null, 2) + "\n", "utf8");
}

function main() {
  for (const t of TARGETS) patchFile(t);
  console.log("Done. Capital: Стрида / Гарденис. Court NPCs + doctrine on faction_karned.");
}

main();
