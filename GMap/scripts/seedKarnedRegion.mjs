/**
 * Seed SYS-561..567 from SYS-0001..0007 lore, add Карнед, resources, fleets.
 * Run: node GMap/scripts/seedKarnedRegion.mjs
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CAMPAIGN = path.join(ROOT, "public/campaigns/lo_golden_pax.json");
const PUBLISHED = path.join(ROOT, "data/published.json");
const LEDGER = path.join(ROOT, "data/ledger.json");

const FACTION_ID = "faction_karned";
const uuid = () => crypto.randomUUID();

function planet(opts) {
  return {
    id: uuid(),
    name: opts.name,
    type: opts.type,
    climate: opts.climate,
    population: opts.population ?? 0,
    raceComposition: opts.raceComposition ?? [],
    resources: opts.resources ?? [],
    orbitIndex: opts.orbitIndex,
    size: opts.size ?? 1,
    habitable: opts.habitable ?? false,
    colonizable: opts.colonizable ?? opts.habitable ?? false,
    surveyed: true,
    colonyType: opts.colonyType ?? "none",
    notes: opts.notes ?? "",
    surfaceSlots: opts.surfaceSlots ?? 8,
    orbitalSlots: opts.orbitalSlots ?? 4,
    surfaceBuildings: opts.surfaceBuildings ?? [],
    orbitalBuildings: opts.orbitalBuildings ?? [],
    ownerFactionId: opts.ownerFactionId ?? null,
    coOwnerFactionIds: [],
    contested: false,
  };
}

function station(name, kind, factionId = null) {
  return { id: uuid(), name, kind, factionId };
}

/** Race shares that sum to 100 for capital world. */
const KARNED_RACES = [
  { id: "race_elanor", name: "Эланор (верные)", count: 70 },
  { id: "race_vendir", name: "Вендиры", count: 3000 },
  { id: "race_elanis", name: "Эланис", count: 15000 },
  { id: "race_elatris", name: "Элатрис", count: 2000 },
  { id: "race_triumvis", name: "Триумвис", count: 1400 },
  { id: "race_horn", name: "Хорны", count: 5000 },
  { id: "race_lithoid", name: "Слуги / литоиды", count: 20000 },
  { id: "race_elacrin", name: "Элакрин", count: 7000 },
  { id: "race_eladon", name: "Эладонцы", count: 400 },
  { id: "race_bistier", name: "Бистьер", count: 300 },
];

const TOTAL_POP = KARNED_RACES.reduce((a, r) => a + r.count, 0);

function karnedRaceComposition() {
  // Fixed integers summing to 100 (approx of headcounts).
  return [
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
}

const SYSTEMS = {
  "SYS-561": {
    loreId: "SYS-0001",
    stars: [{ class: "G", luminosity: 1.05 }],
    resources: [
      "тугоплавкие минералы",
      "редкие кристаллы",
      "пища",
      "вода",
      "органическая биомасса",
      "биотопливо",
      "газ",
      "водород",
      "титан",
      "сплавы",
      "соларид",
      "стройплексы",
    ],
    spaceObjects: ["asteroid", "abandoned_station", "beacon", "storm"],
    stations: [
      station("Покинутая торговая станция", "trade", null),
      station("Старый маяк на астероиде", "relay", null),
    ],
    activity: "trade",
    notes:
      "Умеренная активность звезды; периодические УФ-всплески (мутагенез). Магнитные бури от газового гиганта.",
    gmNotes:
      "Диковинки: атмосферные биолюминесцентные всплески над океаном (редкие органические пигменты); старый маяк на астероиде — локальный источник энергии, непонятная частота.",
    planets: [
      planet({
        name: "Планета 1",
        type: "rocky",
        climate: "infernal",
        orbitIndex: 1,
        size: 0.8,
        resources: ["тугоплавкие минералы", "титан", "хиноварь"],
        notes: "Горячая скалистая (внутренняя) — негостеприимная",
      }),
      planet({
        name: "Планета 2",
        type: "rocky",
        climate: "hot",
        orbitIndex: 2,
        size: 1.1,
        habitable: true,
        colonizable: true,
        resources: ["редкие кристаллы", "блюматид", "кристаллы", "энергия"],
        notes:
          "Суперземля — условно пригодна (тонкая атмосфера, горы). Редкие кристаллы / энергетические ячейки.",
      }),
      planet({
        name: "Планета 3",
        type: "rocky",
        climate: "temperate",
        orbitIndex: 3,
        size: 1,
        habitable: true,
        colonizable: true,
        resources: ["пища", "вода", "органическая биомасса", "биотопливо", "стройплексы"],
        notes:
          "Землеподобная (зона обитаемости) — пригодна. Продовольственные биомассы, пресная вода, сельхозпотенциал.",
        colonyType: "colony",
      }),
      planet({
        name: "Планета 4",
        type: "ocean",
        climate: "temperate",
        orbitIndex: 4,
        size: 1.2,
        habitable: true,
        colonizable: true,
        resources: ["органическая биомасса", "биотопливо", "вода", "пища", "солариевая вода"],
        notes:
          "Океаническая — пригодна (штормы, большая биомасса). Морская биомасса / гидроэнергетика.",
      }),
      planet({
        name: "Планета 5",
        type: "rocky",
        climate: "cold",
        orbitIndex: 5,
        size: 0.5,
        resources: ["редкоземы", "титан", "серебро", "золото", "минералы"],
        notes: "Каменистый астероид (пояс) — минералы; редкие металлы",
        colonyType: "mining",
      }),
      planet({
        name: "Планета 6",
        type: "gas",
        climate: "cold",
        orbitIndex: 6,
        size: 1.8,
        resources: ["газ", "водород", "экзотические газы", "плазмоиды"],
        notes: "Газовый гигант с кольцами — газовые плазмоиды; водородные залежи",
      }),
    ],
  },
  "SYS-562": {
    loreId: "SYS-0002",
    stars: [{ class: "K", luminosity: 0.62 }],
    resources: ["тугоплавкие минералы", "лёд", "аммиак", "изотопы", "никель", "кобальт", "метан", "гелий-3", "газ"],
    spaceObjects: ["comet", "mining_platform", "beacon", "depot"],
    stations: [
      station("Автоматические добычные платформы", "mining", null),
      station("Пассивный голо-колокол", "relay", null),
    ],
    activity: "repair",
    notes:
      "Слабое стабильное магнитное поле — низкая радиация, удобна для дозаправки. Кометный пояс с концентрированными летучими.",
    gmNotes:
      "Диковинки: лёд с редкими изотопами («звёздная пыль»); на орбите — пассивный голо-колокол, низкочастотные импульсы.",
    planets: [
      planet({
        name: "Планета 1",
        type: "rocky",
        climate: "infernal",
        orbitIndex: 1,
        resources: ["тугоплавкие минералы", "железо", "титан"],
        notes: "Горячая скалистая (близко) — тугоплавкие руды",
      }),
      planet({
        name: "Планета 2",
        type: "ice",
        climate: "frozen",
        orbitIndex: 2,
        resources: ["лёд", "аммиак", "изотопы", "вода", "кристаллы"],
        notes: "Холодный ледяной карлик — лёд; аммиак; изотопы",
      }),
      planet({
        name: "Планета 3",
        type: "rocky",
        climate: "cold",
        orbitIndex: 3,
        size: 0.6,
        resources: ["железо", "никель", "кобальт", "минералы"],
        notes: "Малые каменистые (пояс) — руда; никель; кобальт",
        colonyType: "mining",
      }),
      planet({
        name: "Планета 4",
        type: "gas",
        climate: "frozen",
        orbitIndex: 4,
        size: 1.4,
        resources: ["метан", "гелий-3", "газ", "экзотические газы"],
        notes: "Холодный газовый карлик (метановые спутники) — метан; гелий-3",
      }),
    ],
  },
  "SYS-563": {
    loreId: "SYS-0003",
    stars: [{ class: "G", luminosity: 1.35 }],
    resources: [
      "тугоплавкие минералы",
      "токсичные газы",
      "плазмо-кристаллы",
      "титан",
      "сплавы",
      "изотопы",
      "энергия",
      "вулканические минералы",
    ],
    spaceObjects: ["anomaly", "science_arch", "storm", "forge"],
    stations: [station("Частично разрушенная научная арка", "science", null)],
    activity: "none",
    notes:
      "Очень сильная геотермальная активность; исключительная тектоника. Геотермальные фонтанные разломы.",
    gmNotes:
      "Диковинки: поющие шлаки — МГД-поля, нестабильная энергия; огненные штормы, выбрасывающие сплавы для бронирования.",
    planets: [
      planet({
        name: "Планета 1",
        type: "rocky",
        climate: "infernal",
        orbitIndex: 1,
        resources: ["тугоплавкие минералы", "хиноварь"],
        notes: "Ближняя раскалённая скалистая — тугоплавкие компоненты",
      }),
      planet({
        name: "Планета 2",
        type: "toxic",
        climate: "infernal",
        orbitIndex: 2,
        resources: ["токсичные газы", "газ", "катализаторы", "экзотические газы"],
        notes: "Венерианский парниковый мир — токсичные газы; катализаторы",
      }),
      planet({
        name: "Планета 3",
        type: "rocky",
        climate: "infernal",
        orbitIndex: 3,
        resources: ["плазмо-кристаллы", "кристаллы", "энергия", "элирий"],
        notes: "Магма-планета — плазмо-кристаллы; термо-энергия",
      }),
      planet({
        name: "Планета 4",
        type: "rocky",
        climate: "hot",
        orbitIndex: 4,
        resources: ["тугоплавкие минералы", "титан", "железо"],
        notes: "Горячая скалистая (внутренняя) — тугоплавкие металлы",
      }),
      planet({
        name: "Планета 5",
        type: "rocky",
        climate: "hot",
        orbitIndex: 5,
        resources: ["сплавы", "редкоземы", "стеклосталь", "адамантий"],
        notes: "Средняя скалистая (переходная) — редкие металлосплавы",
      }),
      planet({
        name: "Планета 6",
        type: "ice",
        climate: "frozen",
        orbitIndex: 6,
        size: 0.5,
        resources: ["изотопы", "водород", "вода", "лёд"],
        notes: "Малый ледяной спутник (внешний) — концентрированные изотопы водорода",
      }),
      planet({
        name: "Планета 7",
        type: "rocky",
        climate: "infernal",
        orbitIndex: 7,
        size: 0.7,
        resources: ["вулканические минералы", "минералы", "хиноварь"],
        notes: "Внутренний вулканический объект — вулканические минералы",
      }),
    ],
  },
  "SYS-564": {
    loreId: "SYS-0004",
    stars: [{ class: "G", luminosity: 1.0 }],
    resources: [
      "минералы",
      "органическая биомасса",
      "пища",
      "стройплексы",
      "биотопливо",
      "редкоземы",
      "титан",
      "лекарственные соединения",
    ],
    spaceObjects: ["agronomy", "biocupola", "outpost", "sanctuary"],
    stations: [
      station("Старая исследовательская база", "science", null),
      station("Орбитальные биокупола", "science", FACTION_ID),
    ],
    activity: "trade",
    notes:
      "Богатая органическая химия; высокая биологическая конкуренция. Дроны-агрономы на орбите.",
    gmNotes:
      "Диковинки: песнь корней — корневые акустические паттерны ускоряют рост; электрофитные «штормы» — растения выделяют искры.",
    planets: [
      planet({
        name: "Планета 1",
        type: "rocky",
        climate: "hot",
        orbitIndex: 1,
        resources: ["минералы", "железо", "стройплексы"],
        notes: "Внутренняя скалистая — базовые минералы",
      }),
      planet({
        name: "Планета 2",
        type: "rocky",
        climate: "temperate",
        orbitIndex: 2,
        size: 1.3,
        habitable: true,
        colonizable: true,
        resources: ["органическая биомасса", "пища", "стройплексы", "биотопливо", "вода"],
        notes:
          "Терраформируемая супергрунтовая — условно пригодна после модификаций. Культивация / органика / стройресурс.",
        colonyType: "colony",
      }),
      planet({
        name: "Планета 3",
        type: "ocean",
        climate: "temperate",
        orbitIndex: 3,
        size: 1.1,
        habitable: true,
        colonizable: true,
        resources: [
          "органическая биомасса",
          "лекарственные соединения",
          "биотопливо",
          "пища",
          "клакс",
        ],
        notes:
          "Биосфера-полис — пригодна с рисками (агрессивная флора/фауна). Ферменты / лекарственные соединения.",
        colonyType: "colony",
      }),
      planet({
        name: "Планета 4",
        type: "rocky",
        climate: "cold",
        orbitIndex: 4,
        size: 0.55,
        resources: ["редкоземы", "железо", "титан", "серебро"],
        notes: "Астероидный пояс (внешний) — руды; редкоземы",
        colonyType: "mining",
      }),
      planet({
        name: "Планета 5",
        type: "gas",
        climate: "cold",
        orbitIndex: 5,
        size: 1.7,
        resources: ["газ", "минералы", "титан", "платина"],
        notes: "Газовый гигант (множество спутников) — минералы на спутниках",
      }),
    ],
  },
  "SYS-565": {
    loreId: "SYS-0005",
    stars: [{ class: "G", luminosity: 0.78 }],
    isCapital: true,
    resources: [
      "аномальные кристаллы",
      "пища",
      "минералы",
      "газ",
      "соларид",
      "золото",
      "серебро",
      "титан",
      "сплавы",
      "стеклосталь",
      "блюматид",
      "крин",
      "стройплексы",
      "биотопливо",
      "органическая биомасса",
      "вода",
      "железо",
      "элирий",
      "наниты",
    ],
    spaceObjects: ["beacon", "mining_platform", "grav_field", "anomaly", "depot", "outpost"],
    stations: [
      station("Гравитационные маяки", "relay", FACTION_ID),
      station("Частично разрушенная шахтёрская платформа", "mining", FACTION_ID),
      station("Орбитальный форпост Карнед", "military", FACTION_ID),
    ],
    activity: "garrison",
    notes:
      "Столица дуалистической монархии Карнед. Постоянные гравитационные аномалии, искажающие орбиты.",
    gmNotes:
      "Диковинки: кристаллический вихрь — самособирающиеся кластеры, меняющие локальную гравитацию; падающие зеркала — отражающие глыбы.",
    planets: [
      planet({
        name: "Планета 1",
        type: "rocky",
        climate: "hot",
        orbitIndex: 1,
        resources: ["аномальные кристаллы", "кристаллы", "блин", "блюматид", "крин"],
        notes: "Внутренняя каменистая с аномальной гравитацией — аномальные кристаллы; искажённые решётки",
        ownerFactionId: FACTION_ID,
      }),
      planet({
        name: "Планета 2",
        type: "rocky",
        climate: "temperate",
        orbitIndex: 2,
        size: 1.15,
        habitable: true,
        colonizable: true,
        population: TOTAL_POP,
        raceComposition: karnedRaceComposition(),
        resources: [
          "пища",
          "вода",
          "минералы",
          "стройплексы",
          "соларид",
          "золото",
          "серебро",
          "титан",
          "сплавы",
          "стеклосталь",
          "биотопливо",
          "органическая биомасса",
          "железо",
          "хиноварь",
          "блюматид",
          "крин",
        ],
        notes:
          "Средняя каменистая (зона обитаемости) — пригодна. Столичный мир Карнед. Сельхозпотенциал; обычные минералы.",
        colonyType: "core",
        ownerFactionId: FACTION_ID,
        surfaceBuildings: [
          {
            id: uuid(),
            name: "Дворец дуалистической монархии",
            kind: "capitol",
            zone: "surface",
          },
          {
            id: uuid(),
            name: "Агрокомплексы Карнед",
            kind: "farm",
            zone: "surface",
          },
          {
            id: uuid(),
            name: "Шахты Карнед",
            kind: "mine",
            zone: "surface",
          },
          {
            id: uuid(),
            name: "Казармы верных эланор",
            kind: "barracks",
            zone: "surface",
          },
        ],
        orbitalBuildings: [
          {
            id: uuid(),
            name: "Космопорт Карнед",
            kind: "spaceport",
            zone: "orbital",
          },
          {
            id: uuid(),
            name: "Орбитальная верфь",
            kind: "shipyard",
            zone: "orbital",
          },
        ],
      }),
      planet({
        name: "Планета 3",
        type: "gas",
        climate: "cold",
        orbitIndex: 3,
        size: 1.2,
        resources: ["газ", "экзотические газы", "водород", "энергия"],
        notes: "Внешний малый газовый карлик — газ для реакторов",
        ownerFactionId: FACTION_ID,
      }),
    ],
  },
  "SYS-566": {
    loreId: "SYS-0006",
    stars: [{ class: "M", luminosity: 0.32 }],
    resources: [
      "биокатализаторы",
      "органическая биомасса",
      "пища",
      "вода",
      "лёд",
      "железо",
      "энергетические минералы",
      "магнетиты",
      "платина",
      "сплавы",
    ],
    spaceObjects: ["hydro_lab", "asteroid", "debris", "beacon"],
    stations: [
      station("Станция абиссальных организмов", "science", FACTION_ID),
      station("Гидролаборатории", "science", FACTION_ID),
    ],
    activity: "none",
    notes:
      "Частые мелкие метеоритные потоки; активность экстремофилов. Метеоритное поле с платиной.",
    gmNotes:
      "Диковинки: железный дождь — металлические метеоритные дожди; светящиеся хребты — EM-сигналы для навигации.",
    planets: [
      planet({
        name: "Планета 1",
        type: "ocean",
        climate: "temperate",
        orbitIndex: 1,
        habitable: true,
        colonizable: true,
        resources: ["биокатализаторы", "пища", "органическая биомасса", "вода"],
        notes: "Ближний тёплый океанический мир — биокатализаторы; пищевые синтезаторы",
        colonyType: "colony",
      }),
      planet({
        name: "Планета 2",
        type: "ocean",
        climate: "cold",
        orbitIndex: 2,
        habitable: true,
        resources: ["органическая биомасса", "биотопливо", "вода", "экстремофильные ферменты"],
        notes: "Океанический (глубокие абиссы) — экстремофильные ферменты; органика",
      }),
      planet({
        name: "Планета 3",
        type: "ice",
        climate: "frozen",
        orbitIndex: 3,
        size: 0.55,
        resources: ["вода", "лёд", "замёрзшие топлива", "биотопливо"],
        notes: "Малый лёд-камень — вода; замёрзшие топлива",
      }),
      planet({
        name: "Планета 4",
        type: "ice",
        climate: "frozen",
        orbitIndex: 4,
        size: 0.5,
        resources: ["железо", "минералы", "титан"],
        notes: "Малый лёд-камень — базовые металлы",
      }),
      planet({
        name: "Планета 5",
        type: "ice",
        climate: "frozen",
        orbitIndex: 5,
        size: 0.45,
        resources: ["лёд", "вода"],
        notes: "Малый лёд-камень — запасы льда",
      }),
      planet({
        name: "Планета 6",
        type: "rocky",
        climate: "cold",
        orbitIndex: 6,
        resources: ["энергетические минералы", "кристаллы", "соларид"],
        notes: "Каменистая (сильная магнитосфера) — энергетические минералы",
      }),
      planet({
        name: "Планета 7",
        type: "rocky",
        climate: "cold",
        orbitIndex: 7,
        resources: ["магнетиты", "железо", "редкоземы"],
        notes: "Каменистая (сильная магнитосфера) — магнетиты",
      }),
      planet({
        name: "Планета 8",
        type: "gas",
        climate: "frozen",
        orbitIndex: 8,
        size: 1.9,
        resources: ["платина", "сплавы", "редкоземы", "адамантий", "газ"],
        notes: "Газовый гигант (металлическое ядро) — платиновые группы; редкие сплавы",
      }),
    ],
  },
  "SYS-567": {
    loreId: "SYS-0007",
    stars: [{ class: "A", luminosity: 0.55 }],
    resources: [
      "кибер-минералы",
      "наниты",
      "сплавы",
      "лёд",
      "стеклосталь",
      "титан",
      "крин",
      "блюматид",
    ],
    spaceObjects: ["mining_platform", "security_post", "ruin", "beacon"],
    stations: [
      station("Старые автоматические шахты", "mining", FACTION_ID),
      station("Охранная станция", "military", FACTION_ID),
      station("Орбитальный релей", "relay", FACTION_ID),
    ],
    activity: "garrison",
    notes:
      "Низкие температуры; высокая стоимость добычи; стратегическая важность для нанотехники. Коррозионно-стойкие жилы.",
    gmNotes:
      "Диковинки: кристаллические короли — сверхчистые проводящие полимеры с резонаторами; ночное спектральное свечение — картография.",
    planets: [
      planet({
        name: "Планета 1",
        type: "artifact",
        climate: "frozen",
        orbitIndex: 1,
        size: 0.7,
        resources: [
          "кибер-минералы",
          "наниты",
          "сплавы",
          "стеклосталь",
          "титан",
          "живой металл",
          "крин",
        ],
        notes:
          "Чёрная карликовая планета — кибер-минералы (проводящие полимеры; редкие изотопы); сверхтвёрдые сплавы",
        colonyType: "mining",
      }),
      planet({
        name: "Планета 2",
        type: "ice",
        climate: "frozen",
        orbitIndex: 2,
        size: 0.5,
        resources: ["лёд", "газ", "вода", "замёрзшие газы"],
        notes: "Ледяной спутник — лёд; замёрзшие газы",
      }),
    ],
  },
};

// Fix typo in SYS-565 planet 1 resources
SYSTEMS["SYS-565"].planets[0].resources = [
  "аномальные кристаллы",
  "кристаллы",
  "блюматид",
  "крин",
  "фокусирующие кристаллы",
];

function main() {
  const world = JSON.parse(fs.readFileSync(CAMPAIGN, "utf8"));

  // Faction
  if (!world.factions.some((f) => f.id === FACTION_ID)) {
    world.factions.push({
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
      emblemPath: "",
      neutralReputation: 0,
      nameFont: "Spectral, Georgia, serif",
    });
  } else {
    const f = world.factions.find((x) => x.id === FACTION_ID);
    Object.assign(f, {
      name: "Дуалистическая монархия Карнед",
      color: "#3a7bd5",
      borderColor: "#1e6fd9",
      fillColor: "#2a3038",
      systemColor: "#4a8ee0",
      nameColor: "#c8d8f0",
      kind: "state",
    });
  }

  // Races
  for (const r of KARNED_RACES) {
    if (!world.races.some((x) => x.id === r.id)) {
      world.races.push({ id: r.id, name: r.name });
    }
  }

  // Systems (match by current name, legacy SYS-56x, or loreId in gmNotes)
  const NAME_BY_LORE = {
    "SYS-0001": "Ауралис",
    "SYS-0002": "Голоколь",
    "SYS-0003": "Плазмир",
    "SYS-0004": "Корнепеснь",
    "SYS-0005": "Стрида",
    "SYS-0006": "Абиссаль",
    "SYS-0007": "Нанокарст",
  };
  for (const [name, def] of Object.entries(SYSTEMS)) {
    const sys =
      world.systems.find((s) => s.name === name) ||
      world.systems.find((s) => s.name === NAME_BY_LORE[def.loreId]) ||
      world.systems.find((s) => (s.gmNotes || "").includes(def.loreId));
    if (!sys) {
      console.warn("Missing system", name);
      continue;
    }
    sys.stars = def.stars;
    sys.planets = def.planets.map((p) => ({
      ...p,
      ownerFactionId: p.ownerFactionId ?? FACTION_ID,
    }));
    sys.stations = def.stations;
    sys.resources = def.resources;
    sys.ownerFactionId = FACTION_ID;
    sys.spaceObjects = def.spaceObjects;
    sys.poiType = def.spaceObjects[0] ?? "none";
    sys.activity = def.activity;
    sys.notes = def.notes;
    sys.gmNotes = def.gmNotes;
    sys.isCapital = !!def.isCapital;
    sys.locked = false;
    const vis = new Set(sys.visibleToFactionIds ?? []);
    vis.add(FACTION_ID);
    vis.add("faction_belator");
    sys.visibleToFactionIds = [...vis];
    console.log(`Updated ${name} (${def.loreId}): ${sys.planets.length} planets`);
  }

  // FoW whitelist for Карнед: SYS-561..570 only (rest fogged for this player)
  const KARNED_VISIBLE = new Set([
    "SYS-561",
    "SYS-562",
    "SYS-563",
    "SYS-564",
    "SYS-565",
    "SYS-566",
    "SYS-567",
    "SYS-568",
    "SYS-569",
    "SYS-570",
  ]);
  for (const s of world.systems) {
    const vis = new Set(s.visibleToFactionIds ?? []);
    if (KARNED_VISIBLE.has(s.name)) vis.add(FACTION_ID);
    else vis.delete(FACTION_ID);
    s.visibleToFactionIds = [...vis];
  }

  // Fleet — remove old karned fleets then add
  world.fleets = (world.fleets ?? []).filter((f) => f.factionId !== FACTION_ID);
  const capital = world.systems.find((s) => s.name === "SYS-565");
  world.fleets.push({
    id: uuid(),
    name: "Королевский флот Карнед",
    factionId: FACTION_ID,
    systemId: capital.id,
    kind: "combat",
    composition: [
      { type: "линкор", count: 1, defId: "ship.battleship" },
      { type: "фрегат", count: 4, defId: "ship.frigate" },
    ],
    stance: "defend",
    route: [],
  });

  world.meta.updatedAt = new Date().toISOString();
  world.meta.tableRevision = (world.meta.tableRevision ?? 0) + 1;

  fs.writeFileSync(CAMPAIGN, JSON.stringify(world, null, 2) + "\n");
  console.log("Wrote", CAMPAIGN);

  // Sync live board (preserve coords / ids)
  if (fs.existsSync(PUBLISHED)) {
    const pub = JSON.parse(fs.readFileSync(PUBLISHED, "utf8"));
    const fac = world.factions.find((f) => f.id === FACTION_ID);
    const fi = pub.factions.findIndex((f) => f.id === FACTION_ID);
    if (fi >= 0) pub.factions[fi] = fac;
    else pub.factions.push(fac);
    for (const r of world.races) {
      if (!pub.races.some((x) => x.id === r.id)) pub.races.push(r);
    }
    for (const name of Object.keys(SYSTEMS)) {
      const src = world.systems.find((s) => s.name === name);
      const dst = pub.systems.find((s) => s.name === name);
      if (!src || !dst) continue;
      const { x, y, sectorId, id } = dst;
      const vis = new Set([
        ...(dst.visibleToFactionIds ?? []),
        FACTION_ID,
        "faction_belator",
      ]);
      Object.assign(dst, {
        stars: src.stars,
        planets: src.planets,
        stations: src.stations,
        resources: src.resources,
        ownerFactionId: FACTION_ID,
        spaceObjects: src.spaceObjects,
        poiType: src.poiType,
        activity: src.activity,
        notes: src.notes,
        gmNotes: src.gmNotes,
        isCapital: !!src.isCapital,
        locked: false,
        visibleToFactionIds: [...vis],
        x,
        y,
        sectorId,
        id,
        name,
      });
    }
    pub.fleets = (pub.fleets ?? []).filter((f) => f.factionId !== FACTION_ID);
    const fleet = world.fleets.find((f) => f.factionId === FACTION_ID);
    if (fleet) pub.fleets.push(fleet);
    pub.meta.updatedAt = new Date().toISOString();
    pub.meta.tableRevision = (pub.meta.tableRevision ?? 0) + 1;
    fs.writeFileSync(PUBLISHED, JSON.stringify(pub, null, 2) + "\n");
    console.log("Synced", PUBLISHED, "rev", pub.meta.tableRevision);
  }

  // Ledger stocks
  let ledger = { factions: {}, entries: [] };
  if (fs.existsSync(LEDGER)) {
    ledger = JSON.parse(fs.readFileSync(LEDGER, "utf8"));
  }
  if (!ledger.factions) ledger.factions = {};
  if (!ledger.entries) ledger.entries = [];
  ledger.factions[FACTION_ID] = {
    factionId: FACTION_ID,
    stocks: {
      "currency.metal": 25000,
      "currency.supply": 18000,
      "map.solari": 12000,
      "map.gold": 8000,
      "map.silver": 9000,
      "map.alloys": 7000,
      "map.glasssteel": 5000,
      "map.blumatid": 3500,
      "map.krin": 4000,
      "map.buildplex": 10000,
      "map.biofuel": 6000,
      "map.biomass": 8000,
      "map.food": 9000,
      "map.titan": 6000,
      "map.cinnabar": 2500,
      "map.gas": 5000,
    },
    taxes: { "tax.materia": "none", "tax.energia": "none", "tax.bios": "none" },
    pendingPolicy: { taxes: {} },
    laws: [],
    pressure: 0,
    deficit: "ok",
  };
  fs.mkdirSync(path.dirname(LEDGER), { recursive: true });
  fs.writeFileSync(LEDGER, JSON.stringify(ledger, null, 2) + "\n");
  console.log("Wrote ledger for", FACTION_ID);
  console.log("Capital pop", TOTAL_POP, "at SYS-565 planet 2");
}

main();
