/**
 * LO GOLDEN PAX campaign — isometric layout from the hex-map screenshot.
 * Belator keeps canon system names; others get language-flavoured names.
 * One central sector holds all systems; 8 empty sectors ring it (future map).
 *
 * Run: node scripts/buildLoreCampaign.mjs
 *
 * Language guesses (except Belator / Latin cult):
 *   Туранмал     → туранско-тюркский + северный военный жаргон
 *   Федерация    → греко-латинский (Коринф)
 *   Корвун'тай   → монголо-сибирский шаманизм (апострофы, жёсткие согласные)
 *   Таала        → семитский / «возвышенный» (та'ала) + мягкие пси-имена
 *   ХэШах        → персидско-иранский (шах, охадор)
 *   Сикури       → союзники ХэШах (канон у Поллукса; догадка по географии ЮЗ)
 *   Хучи         → 3 коричневые точки (канон у Ригеля; между Белатором и Корвуном)
 *   Рой          → био-хитин, улейный жаргон
 *   Балсагон     → военно-латинский / техн. оккупация
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { enlivenWorld } from "./enrichLoreWorld.mjs";
import { buildRealisticLinks, seedWildSpace } from "./loreGraph.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "../public/campaigns/lo_golden_pax.json");
const SCHEMA_VERSION = 6;

const FACTIONS = [
  { id: "faction_belator", name: "Империя Белатор", color: "#e39a12", password: "solis", kind: "state" },
  { id: "faction_turon", name: "Турон / Туранмал", color: "#c01818", password: "turon", kind: "state" },
  { id: "faction_federation", name: "Федерация Коринфад", color: "#4ec4d4", password: "korin", kind: "state" },
  { id: "faction_korvun", name: "Корвун'тай", color: "#1a3a8a", password: "fold", kind: "state" },
  { id: "faction_taala", name: "Таала", color: "#7b2a9a", password: "taala", kind: "state" },
  { id: "faction_heshah", name: "ХэШах", color: "#6bcf5a", password: "heshah", kind: "state" },
  { id: "faction_balsagon", name: "Союз Балсагон (павший)", color: "#3a4a28", password: "balsa", kind: "state" },
  { id: "faction_amalfea", name: "Альянс Амальфея", color: "#3db8c8", password: "amalfa", kind: "state" },
  { id: "faction_khanate", name: "Ханство Золотой Луны", color: "#d4a017", password: "moon", kind: "state" },
  {
    id: "faction_sikuri",
    name: "Сикури (союзники ХэШах)",
    color: "#3a8a3a",
    password: "sikuri",
    kind: "faction",
  },
  {
    id: "faction_huchi",
    name: "Хучи",
    color: "#6b4423",
    password: "huchi",
    kind: "faction",
  },
  {
    id: "faction_north_swarm",
    name: "Северный Рой",
    color: "#8b6914",
    password: "queen",
    kind: "faction",
  },
  {
    id: "faction_south_swarm",
    name: "Южный Рой (уничтожен)",
    color: "#4a4a4a",
    password: "ash",
    kind: "faction",
  },
  { id: "faction_pirates", name: "Пираты / вольные банды", color: "#8b1a1a", password: "pirate", kind: "faction" },
  { id: "faction_or", name: "ОР / Умбра Телос", color: "#2a2a18", password: "umbra", kind: "faction" },
  { id: "faction_sahale", name: "Флот Эт Гильмир Сахале", color: "#ffd54a", password: "sahale", kind: "faction" },
];

const RACES = [
  { id: "race_belator", name: "Белаторцы" },
  { id: "race_human", name: "Люди (Турон)" },
  { id: "race_korei", name: "Корей" },
  { id: "race_nagaar", name: "Нагааритяне" },
  { id: "race_swarm", name: "Рой" },
  { id: "race_heshah", name: "ХэШах" },
  { id: "race_sikuri", name: "Сикури" },
  { id: "race_korvun", name: "Корвуны" },
  { id: "race_taala", name: "Таала" },
  { id: "race_huchi", name: "Хучи" },
  { id: "race_corinfad", name: "Коринфадцы" },
];

/** Canon Belator — offsets from Solis, then rotated for screenshot sprawl. */
const BELATOR_CANON = [
  { name: "Солис", dx: 0, dy: 0, capital: true, notes: "Домус Солис — столица" },
  { name: "Гурез", dx: 220, dy: 160, capital: true, notes: "Оборонительный узел" },
  { name: "Элегантия", dx: -200, dy: 180, capital: true, notes: "Пси-разлом ОР затих" },
  { name: "Десерти", dx: -60, dy: 380, capital: true, notes: "Пустынный столичный мир" },
  { name: "Алиот", dx: -520, dy: 240, notes: "Горный Венец" },
  { name: "Альбирео", dx: -260, dy: 520, notes: "Орбитальная станция / заложники" },
  { name: "Йота", dx: -280, dy: 650 },
  { name: "Антрес", dx: -320, dy: -450 },
  { name: "Адара", dx: -320, dy: -220 },
  { name: "Алькор", dx: -100, dy: -300 },
  { name: "Альдебар", dx: 640, dy: -50 },
  { name: "Альнаир", dx: 490, dy: -460 },
  { name: "Ню", dx: 580, dy: 280 },
  { name: "Кси", dx: 170, dy: 760 },
  { name: "Каппа", dx: 780, dy: 600 },
  { name: "Кастор", dx: 440, dy: 500 },
  { name: "Дубхе", dx: 580, dy: 980 },
  { name: "Денеб", dx: 350, dy: 700 },
  { name: "Капелла", dx: 820, dy: 800, notes: "1-й контакт Таала" },
  { name: "Мегрец", dx: 560, dy: 850 },
  { name: "Пи", dx: 450, dy: 1120 },
  { name: "Регул", dx: 880, dy: 1020 },
  { name: "Ригель", dx: 900, dy: 160, notes: "контакт Хучи" },
  { name: "Процион", dx: 1140, dy: 440 },
  { name: "Фи", dx: 820, dy: -540 },
  { name: "Мерцак", dx: 120, dy: 540 },
  { name: "Омикрон", dx: 120, dy: 980 },
  { name: "Сириус", dx: -100, dy: 1080 },
  { name: "Ро", dx: 350, dy: 1380 },
  { name: "Поллукс", dx: -260, dy: 1280, notes: "контакт Сикури" },
  { name: "Альфа", dx: -740, dy: -380 },
  { name: "Гамма", dx: 580, dy: -220 },
  { name: "Тета", dx: 1200, dy: 140, notes: "флот Балсагона уничтожен" },
];

/** Flat → isometric (tilted hex-map feel like the screenshot). */
function toIso(x, y) {
  const ang = (-28 * Math.PI) / 180;
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return {
    x: x * c - y * s,
    y: (x * s + y * c) * 0.62,
  };
}

function rot(dx, dy, deg) {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: dx * c - dy * s, y: dx * s + dy * c };
}

function jitter(i, scale = 28) {
  const a = Math.sin(i * 12.9898) * 43758.5453;
  const b = Math.sin(i * 78.233) * 23758.1234;
  return { x: (a - Math.floor(a) - 0.5) * scale, y: (b - Math.floor(b) - 0.5) * scale };
}

/** Chain / arm scatter — looks more like screenshot strings than round blobs. */
function scatterArm(cx, cy, count, length, width, angleDeg, seed = 1) {
  const pts = [];
  const a = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const along = (t - 0.5) * length;
    const j = jitter(i + seed * 17, width);
    const side = ((i % 3) - 1) * width * 0.35;
    pts.push({
      x: cx + along * cos - (side + j.y * 0.4) * sin + j.x * 0.3,
      y: cy + along * sin + (side + j.y * 0.4) * cos + j.x * 0.2,
    });
  }
  return pts;
}

function scatterCloud(cx, cy, count, radius, seed = 1, squash = 0.75) {
  const pts = [];
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2 + seed * 0.37;
    const ring = 0.2 + (i % 5) * 0.16;
    const j = jitter(i + seed * 17, radius * 0.28);
    pts.push({
      x: cx + Math.cos(ang) * radius * ring + j.x,
      y: cy + Math.sin(ang) * radius * ring * squash + j.y,
    });
  }
  return pts;
}

function makePlanet(name, inhabited, raceId, opts = {}) {
  const population =
    opts.population ??
    (inhabited ? 800_000_000 + Math.floor(Math.random() * 2e9) : 0);
  return {
    id: randomUUID(),
    name,
    type: "rocky",
    climate: inhabited || population > 0 ? "temperate" : "cold",
    population,
    raceComposition:
      (inhabited || population > 0) && raceId
        ? [{ raceId, percent: 100 }]
        : [],
    resources: inhabited || population > 0 ? ["железо"] : [],
    habitable: opts.habitable ?? true,
    colonizable: opts.colonizable ?? true,
    surveyed: true,
    colonyType:
      opts.colonyType ??
      (population > 0 ? (opts.capital ? "capital" : "colony") : "none"),
  };
}

/** ARTEM all_planets.json truth — Belator settled vs claim-only. */
const BELATOR_ARTEM_PLANETS = {
  Солис: [
    { name: "Домус Солис", population: 572677, colonyType: "capital" },
  ],
  Гурез: [
    { name: "Домус Гурез", population: 222095, colonyType: "colony" },
    { name: "Луна Гурез", population: 2085, colonyType: "outpost" },
  ],
  Десерти: [
    { name: "Домус Десерти", population: 296955, colonyType: "colony" },
  ],
  Элегантия: [
    { name: "Домус Элегантия", population: 516760, colonyType: "colony" },
  ],
  Гамма: [
    { name: "Домус Данкристо", population: 10000, colonyType: "colony" },
    { name: "Домус Белвор", population: 10000, colonyType: "colony" },
  ],
  Алиот: [
    { name: "Домус Алиот", population: 0, colonyType: "colony", habitable: true },
  ],
  Алькор: [
    { name: "Домус Алькор", population: 0, colonyType: "colony", habitable: true },
  ],
};

function belatorPlanets(name, capital, raceId) {
  const specs = BELATOR_ARTEM_PLANETS[name];
  if (specs?.length) {
    return specs.map((p) =>
      makePlanet(p.name, p.population > 0, raceId, {
        population: p.population,
        colonyType: p.colonyType,
        habitable: p.habitable ?? true,
        capital: p.colonyType === "capital",
      }),
    );
  }
  // Controlled claim without colony — empty habitable world
  return [
    makePlanet(`Мир ${name}`, false, raceId, {
      population: 0,
      colonyType: "none",
      habitable: true,
    }),
  ];
}

function makeSystem({
  name,
  x,
  y,
  ownerFactionId = null,
  capital = false,
  notes = "",
  activity = "none",
  kind = "stellar",
  raceId = "race_belator",
  resources = [],
  stations = [],
  sectorId = null,
  poiType = "none",
}) {
  const corridor = kind === "corridor";
  const pirate = poiType === "pirate" || ownerFactionId === "faction_pirates";
  const effectivePoi = pirate && poiType === "none" ? "pirate" : poiType;
  const planets = corridor
    ? []
    : ownerFactionId === "faction_belator"
      ? belatorPlanets(name, capital, raceId)
      : [makePlanet(`Мир ${name}`, capital || Math.random() > 0.55, raceId)];
  return {
    id: randomUUID(),
    name,
    x,
    y,
    kind,
    stars: corridor ? [] : [{ class: effectivePoi === "anomaly" ? "M" : "G", luminosity: capital ? 1.4 : 1 }],
    planets,
    stations,
    resources,
    ownerFactionId,
    sectorId,
    locked: capital,
    isCapital: capital,
    poiType: effectivePoi,
    visibleToFactionIds: [],
    activity,
    tradeWithSystemId: null,
    notes,
  };
}

function dip(a, b, relation) {
  const [x, y] = [a, b].sort();
  return { id: randomUUID(), aId: x, bId: y, relation };
}

/** Flat-top hex polygon (world coords). */
function hexPoly(cx, cy, r) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    pts.push(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
  return pts;
}

// ——— build in flat space, then iso ———
const flat = [];

const BEL_SCALE = 0.68;
const BEL_ROT = -18;
for (const b of BELATOR_CANON) {
  const r = rot(b.dx * BEL_SCALE, b.dy * BEL_SCALE, BEL_ROT);
  flat.push({
    name: b.name,
    x: r.x,
    y: r.y,
    ownerFactionId: "faction_belator",
    capital: !!b.capital,
    notes: b.notes || "",
    activity: b.name === "Солис" ? "garrison" : b.name === "Алиот" ? "battle" : "none",
    raceId: "race_belator",
    resources: b.capital ? ["железо", "титан", "кристаллы"] : [],
    stations:
      b.name === "Солис"
        ? [
            {
              id: randomUUID(),
              name: "Верфи «Звёздная Кузница»",
              kind: "military",
              factionId: "faction_belator",
            },
          ]
        : b.name === "Альбирео"
          ? [
              {
                id: randomUUID(),
                name: "Орбитальная станция Альбирео",
                kind: "military",
                factionId: "faction_belator",
              },
            ]
          : [],
  });
}

// Federation — compact cyan cluster N of Belator (slightly NW like screenshot)
const FED_NAMES = [
  "Коринфад-Прайм",
  "Агора-Дельта",
  "Политея",
  "Истмион",
  "Делос-9",
  "Периклид",
  "Астрейон",
  "Клисфений",
  "Эклесия",
  "Ном-Свободы",
  "Архион",
  "Синойкия",
  "Буле-Хаб",
  "Мегарон-Север",
  "Остракон",
  "Теория-Док",
  "Пникс-Узел",
  "Гелиэя",
];
scatterCloud(-120, -920, FED_NAMES.length, 360, 2, 0.68).forEach((p, i) => {
  flat.push({
    name: FED_NAMES[i],
    x: p.x,
    y: p.y,
    ownerFactionId: "faction_federation",
    capital: i === 0,
    notes: "Под имперским военным управлением",
    raceId: "race_corinfad",
  });
});

// Northern Swarm — tip N/NE of Federation
const NSWARM = [
  "Улей-Север",
  "Матка-Шрам",
  "Жвало-Гребень",
  "Споровик",
  "Хитин-Вал",
  "Рой-Клык",
  "Пустошь-Яйцо",
];
scatterCloud(420, -1420, NSWARM.length, 220, 3, 0.6).forEach((p, i) => {
  flat.push({
    name: NSWARM[i],
    x: p.x,
    y: p.y,
    ownerFactionId: "faction_north_swarm",
    activity: "battle",
    raceId: "race_swarm",
    notes: "Северная Королева — активная угроза",
  });
});

// Corvun Tai — far NE, two-lobed
const KORVUN = [
  "Складки Тишины",
  "Баари'он-Крест",
  "Дөрвөн-Гар",
  "Маска-Череп",
  "Рог'Тишин",
  "Кронос-Врата",
  "Шёпот-Стал",
  "Ночь-Клинок",
  "Хоосон-Хор",
  "Тень-Лезвия",
  "Гурван-Эвэр",
  "Пепельный Шаман",
  "Яс-Релей",
  "Безмолвный Док",
];
const korA = scatterCloud(1520, -780, 8, 240, 4, 0.68);
const korB = scatterCloud(1780, -480, 6, 200, 14, 0.68);
[...korA, ...korB].forEach((p, i) => {
  flat.push({
    name: KORVUN[i],
    x: p.x,
    y: p.y,
    ownerFactionId: "faction_korvun",
    capital: i === 0,
    kind: i === 0 ? "corridor" : "stellar",
    raceId: "race_korvun",
    notes: i === 0 ? "Регион Корвун'тай — Складки Тишины" : "",
  });
});

// Taala — mid-east / SE edge
const TAALA = [
  "Икилан-Трон",
  "Таал'а-Зеркало",
  "Сафир-Нить",
  "Зуджадж-Рог",
  "Лун'а-Ярус",
  "Телос-Око",
  "Нить-Таал",
  "Холодный Хор",
  "Пси-Гавань",
  "Арка Икилана",
  "Серый Стык",
  "Дар-Оболочки",
];
scatterCloud(1620, 320, TAALA.length, 280, 5, 0.7).forEach((p, i) => {
  flat.push({
    name: TAALA[i],
    x: p.x,
    y: p.y,
    ownerFactionId: "faction_taala",
    capital: i === 0,
    raceId: "race_taala",
  });
});

// Balsagon remnants — olive strip between Belator E-arm and Corvun/Taala
const BALSAGON_HELD = [
  "Аврентис",
  "Кузница-Шрам",
  "Балсагон-Редут",
  "Тета-Окраина",
  "Синхро-Яма",
  "Павший Сенат",
  "ОР-Остаток",
  "Клинок-в-Тени",
  "Решётка-9",
  "Пепельный Док",
];
scatterArm(920, -40, BALSAGON_HELD.length, 480, 140, 28, 6).forEach((p, i) => {
  flat.push({
    name: BALSAGON_HELD[i],
    x: p.x,
    y: p.y,
    ownerFactionId: "faction_balsagon",
    activity: i === 0 ? "battle" : "garrison",
    notes: "Остатки Балсагона — де-факто под контролем Белатора",
    raceId: "race_belator",
  });
});

// Huchi — exactly 3 brown systems between Belator NE arm and Corvun (Rigel contact)
[
  { name: "Хучи-Прайм", x: 1080, y: -400 },
  { name: "Ригель-Тень", x: 1180, y: -460 },
  { name: "Карапас-Док", x: 1120, y: -320 },
].forEach((p) => {
  flat.push({
    name: p.name,
    x: p.x,
    y: p.y,
    ownerFactionId: "faction_huchi",
    raceId: "race_huchi",
    notes: "Хучи — мирные гуманоиды (контакт у Ригеля); догадка по 3 коричневым точкам",
  });
});

// Turanmal — large western block, vertical/diagonal arms like screenshot
const TURON = [
  "Туранмал",
  "Темир-Қорған",
  "Алтын-Вал",
  "Қара-Клинок",
  "Молот Тура",
  "Орда-Сталь",
  "Террия-Врата",
  "Молот-Наследия",
  "Секвилон-Перевал",
  "Қызыл-Вал",
  "Туро-Форт",
  "Валькирия-Док",
  "Батыс-Клинок",
  "Горн Тура",
  "Стальной Ров",
  "Наследие-Узел",
  "Бастион-Закат",
  "Қан-Холм",
  "Щит-Запада",
  "Туранмал-Оңтүстік",
  "Ирион-Скат",
  "Оплот-Заря",
  "Тур-Редут",
  "Венец-Запада",
  "Клан-Қылыш",
  "Молот-Док",
  "Сталь-Пристань",
  "Крепость Секвилона",
];
const turA = scatterArm(-1350, -40, 12, 740, 190, 100, 7);
const turB = scatterArm(-1550, 320, 10, 580, 170, 35, 17);
const turC = scatterCloud(-1150, 460, 6, 200, 27, 0.68);
[...turA, ...turB, ...turC].forEach((p, i) => {
  if (i >= TURON.length) return;
  flat.push({
    name: TURON[i],
    x: p.x,
    y: p.y,
    ownerFactionId: "faction_turon",
    capital: i === 0,
    raceId: "race_human",
    notes: i === 0 ? "Столица Туранмала" : "Перемирие с Белатором",
  });
});

// HeShah — south of Belator, light green
const HESHAH = [
  "Охадор-Трон",
  "Михр-Шах",
  "Азар-Гребень",
  "Парс-Врата",
  "Шахир-Сполох",
  "Рошан-Док",
  "Крестовый Юг",
  "Охадор-Вал",
  "Шах-Пристань",
  "Чужая Дуга",
  "Зар-Хэш",
  "Рой-Охотник",
  "Южный Релей",
  "Дар Охадора",
];
scatterCloud(60, 1080, HESHAH.length, 320, 8, 0.68).forEach((p, i) => {
  flat.push({
    name: HESHAH[i],
    x: p.x,
    y: p.y,
    ownerFactionId: "faction_heshah",
    capital: i === 0,
    raceId: "race_heshah",
    notes: "Союз vs Рой (крестовый поход)",
  });
});

// Sikuri — SW of HeShah (allies; canon contact at Pollux)
const SIKURI = [
  "Сикури-Прайм",
  "Поллукс-Тень",
  "Кай-Узел",
  "Многообраз-Док",
  "Тихий Обмен",
  "Сику-Гнездо",
  "Зелёный Род",
  "Юго-Западный Щит",
  "Караван-Релей",
  "Сикури-Пристань",
];
scatterCloud(-640, 1220, SIKURI.length, 260, 9, 0.66).forEach((p, i) => {
  flat.push({
    name: SIKURI[i],
    x: p.x,
    y: p.y,
    ownerFactionId: "faction_sikuri",
    capital: i === 0,
    raceId: "race_sikuri",
    notes: "Сикури — союзники ХэШах / торговый край (догадка по канону Поллукса)",
  });
});

// Southern Swarm destroyed — SE sparse grey
const SSWARM = [
  "Улей-Пепел",
  "Матка-Мёртвая",
  "Садальмелик-Руин",
  "Садальахия-Пепел",
  "Фомальгаут-Отрезан",
  "Рой-Прах",
  "Хитин-Обломки",
  "Пустошь-Юг",
];
scatterCloud(1380, 1380, SSWARM.length, 300, 10, 0.62).forEach((p, i) => {
  flat.push({
    name: SSWARM[i],
    x: p.x,
    y: p.y,
    ownerFactionId: "faction_south_swarm",
    activity: "none",
    raceId: "race_swarm",
    notes: "Южный Рой уничтожен / остатки",
  });
});

// Transit corridor nodes between blocs (flat space)
[
  {
    name: "Гуманитарный Узел-Север",
    x: -40,
    y: -620,
    ownerFactionId: "faction_federation",
    notes: "Коридор беженцев Федерации → Белатор",
  },
  {
    name: "Западный Перевал",
    x: -720,
    y: 80,
    ownerFactionId: "faction_belator",
    notes: "Линия перемирия Турон/Белатор",
  },
  {
    name: "Стык Складок",
    x: 1180,
    y: -280,
    ownerFactionId: "faction_korvun",
    notes: "Корвун'тай → Балсагон",
  },
  {
    name: "Южный Крестовый Релей",
    x: 480,
    y: 980,
    ownerFactionId: "faction_heshah",
    notes: "ХэШах → пепел Южного Роя",
  },
].forEach((c) => {
  flat.push({
    ...c,
    kind: "corridor",
    activity: "transit",
    raceId: "race_belator",
  });
});

// Wild space: neutrals, pirates, anomalies, hubs, ruins in voids
for (const w of seedWildSpace(flat)) {
  flat.push(w);
}

// Apply isometric transform
const systems = flat.map((s) => {
  const iso = toIso(s.x, s.y);
  return makeSystem({ ...s, x: iso.x, y: iso.y });
});

// Sparse realistic links (MST + frontiers — not full faction mesh)
let links = buildRealisticLinks(systems);

const damillian = ["Солис", "Гурез", "Элегантия", "Десерти"]
  .map((n) => systems.find((s) => s.name === n))
  .filter(Boolean);
for (let i = 0; i < damillian.length; i++) {
  for (let j = i + 1; j < damillian.length; j++) {
    links.push({
      id: randomUUID(),
      fromId: damillian[i].id,
      toId: damillian[j].id,
      type: "gate",
    });
  }
}
{
  const a = systems.find((s) => s.name === "Элегантия");
  const b = systems.find((s) => s.name === "Агора-Дельта");
  if (a && b) links.push({ id: randomUUID(), fromId: a.id, toId: b.id, type: "gate" });
}

// Deduplicate links
{
  const seen = new Set();
  links = links.filter((l) => {
    const k = [l.fromId, l.toId].sort().join("|");
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ——— Sectors: 1 center (all systems) + 8 empty around (3×3) ———
const xs = systems.map((s) => s.x);
const ys = systems.map((s) => s.y);
const midX = (Math.min(...xs) + Math.max(...xs)) / 2;
const midY = (Math.min(...ys) + Math.max(...ys)) / 2;
const spanX = Math.max(...xs) - Math.min(...xs);
const spanY = Math.max(...ys) - Math.min(...ys);
const cell = Math.max(spanX, spanY) * 0.55 + 400;
const R = cell * 0.52;

const SECTOR_LAYOUT = [
  { key: "nw", name: "Сектор СЗ (пуст)", color: "#3a4550", dx: -1, dy: -1 },
  { key: "n", name: "Сектор С (пуст)", color: "#3a4550", dx: 0, dy: -1 },
  { key: "ne", name: "Сектор СВ (пуст)", color: "#3a4550", dx: 1, dy: -1 },
  { key: "w", name: "Сектор З (пуст)", color: "#3a4550", dx: -1, dy: 0 },
  { key: "c", name: "Центральный сектор", color: "#e39a12", dx: 0, dy: 0 },
  { key: "e", name: "Сектор В (пуст)", color: "#3a4550", dx: 1, dy: 0 },
  { key: "sw", name: "Сектор ЮЗ (пуст)", color: "#3a4550", dx: -1, dy: 1 },
  { key: "s", name: "Сектор Ю (пуст)", color: "#3a4550", dx: 0, dy: 1 },
  { key: "se", name: "Сектор ЮВ (пуст)", color: "#3a4550", dx: 1, dy: 1 },
];

const sectors = SECTOR_LAYOUT.map((slot) => {
  const cx = midX + slot.dx * cell * 0.92;
  const cy = midY + slot.dy * cell * 0.8;
  return {
    id: randomUUID(),
    name: slot.name,
    color: slot.color,
    polygon: hexPoly(cx, cy, R),
    _key: slot.key,
  };
});

const centerSector = sectors.find((s) => s._key === "c");
for (const s of systems) {
  s.sectorId = centerSector.id;
}
for (const s of sectors) delete s._key;

// Fleets & legions
const fleets = [];
const legions = [];
function find(name) {
  return systems.find((s) => s.name === name);
}
function addFleet(name, factionId, sysName, kind, stance, composition) {
  const sys = find(sysName);
  if (!sys) return;
  fleets.push({
    id: randomUUID(),
    name,
    factionId,
    systemId: sys.id,
    kind,
    composition,
    stance,
    route: [],
  });
}
function addLegion(name, factionId, sysName, strength, status) {
  const sys = find(sysName);
  if (!sys) return;
  legions.push({
    id: randomUUID(),
    name,
    factionId,
    systemId: sys.id,
    strength,
    status,
  });
}

addFleet("SOL INVICTUS", "faction_belator", "Солис", "carrier", "repair", [
  { type: "Рагнарек", count: 1 },
  { type: "линкор", count: 4 },
]);
addFleet("Звёздный Адвент", "faction_belator", "Аврентис", "combat", "repair", [
  { type: "крейсер", count: 6 },
]);
addFleet("Громоносец", "faction_belator", "Гурез", "combat", "defend", [
  { type: "линкор", count: 3 },
]);
addFleet("Стремительная", "faction_belator", "Алиот", "patrol", "defend", [
  { type: "фрегат", count: 8 },
]);
addFleet("Роевая масса", "faction_north_swarm", "Улей-Север", "combat", "attack", [
  { type: "корвет", count: 40 },
]);
addFleet(
  "Флот Эт Гильмир Сахале",
  "faction_sahale",
  "Коринфад-Прайм",
  "combat",
  "attack",
  [{ type: "линкор", count: 2 }],
);

addLegion("Золотой Белаторский Легион Сула", "faction_belator", "Солис", 10000, "garrison");
addLegion("Легион Нагааритян", "faction_belator", "Гурез", 10000, "garrison");
addLegion("Красный Легион Рэдмона", "faction_belator", "Элегантия", 10000, "garrison");
addLegion("Легион Единства", "faction_belator", "Десерти", 10000, "garrison");
addLegion("XI «Световой Вал»", "faction_belator", "Аврентис", 8000, "assault");

// Living map: planets/stations/resources, trade, force vectors (Session 2)
enlivenWorld(systems, links, fleets, legions);
for (const s of systems) {
  if (!s.sectorId) s.sectorId = centerSector.id;
}

// Empire intel: Belator has the whole central sector charted
for (const s of systems) {
  const vis = new Set(s.visibleToFactionIds ?? []);
  vis.add("faction_belator");
  s.visibleToFactionIds = [...vis];
}

const diplomacy = [
  dip("faction_belator", "faction_heshah", "alliance"),
  dip("faction_belator", "faction_sikuri", "alliance"),
  dip("faction_belator", "faction_taala", "alliance"),
  dip("faction_belator", "faction_korvun", "alliance"),
  dip("faction_belator", "faction_turon", "neutral"),
  dip("faction_belator", "faction_federation", "vassal"),
  dip("faction_belator", "faction_north_swarm", "war"),
  dip("faction_belator", "faction_south_swarm", "war"),
  dip("faction_belator", "faction_balsagon", "vassal"),
  dip("faction_belator", "faction_huchi", "neutral"),
  dip("faction_heshah", "faction_sikuri", "alliance"),
  dip("faction_heshah", "faction_north_swarm", "war"),
  dip("faction_sahale", "faction_north_swarm", "war"),
  dip("faction_korvun", "faction_or", "war"),
  dip("faction_taala", "faction_or", "war"),
];

const now = new Date().toISOString();
const world = {
  meta: {
    schemaVersion: SCHEMA_VERSION,
    name: "LO GOLDEN PAX — Центральный сектор (Сессия 2)",
    turn: 10,
    createdAt: now,
    updatedAt: now,
    width: Math.ceil(Math.max(...xs, ...sectors.flatMap((s) => s.polygon.filter((_, i) => i % 2 === 0))) - Math.min(...xs, ...sectors.flatMap((s) => s.polygon.filter((_, i) => i % 2 === 0))) + 600),
    height: Math.ceil(Math.max(...ys, ...sectors.flatMap((s) => s.polygon.filter((_, i) => i % 2 === 1))) - Math.min(...ys, ...sectors.flatMap((s) => s.polygon.filter((_, i) => i % 2 === 1))) + 600),
  },
  systems,
  links,
  sectors,
  factions: FACTIONS,
  races: RACES,
  fleets,
  legions,
  diplomacy,
  orders: [],
  turnHistory: [],
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(world, null, 2), "utf8");

const counts = {};
for (const s of systems) {
  counts[s.ownerFactionId] = (counts[s.ownerFactionId] || 0) + 1;
}
console.log(`Wrote ${OUT}`);
console.log(`systems=${systems.length} links=${links.length} sectors=${sectors.length}`);
console.log(`fleets=${fleets.length} legions=${legions.length}`);
console.log("by faction:", counts);
console.log(
  "capitals:",
  systems.filter((s) => s.isCapital).map((s) => s.name),
);
console.log("center sector systems:", systems.filter((s) => s.sectorId === centerSector.id).length);
console.log(
  "trade lanes:",
  systems.filter((s) => s.activity === "trade").length,
  "battle:",
  systems.filter((s) => s.activity === "battle").length,
);
const poiCounts = {};
for (const s of systems) {
  const p = s.poiType || "none";
  poiCounts[p] = (poiCounts[p] || 0) + 1;
}
console.log("poi:", poiCounts);
console.log(
  "unowned:",
  systems.filter((s) => !s.ownerFactionId).length,
  "pirates:",
  systems.filter((s) => s.ownerFactionId === "faction_pirates").length,
);
console.log(
  "avg links/system:",
  (links.length * 2 / systems.length).toFixed(2),
);
console.log(
  "NOTE: Сикури/Хучи — догадки. ПКМ — меню. Не гоняй lore после ручных правок без бэкапа.",
);
