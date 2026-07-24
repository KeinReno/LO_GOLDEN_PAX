/**
 * Post-process LO GOLDEN PAX world: planets, stations, resources, activities,
 * trade lanes, extra fleets/routes from Session-2 lore.
 */
import { randomUUID } from "node:crypto";

const PLANET_TYPES = ["rocky", "gas", "ice", "desert", "ocean", "toxic", "artifact"];
const CLIMATES = ["frozen", "cold", "temperate", "hot", "infernal", "tidal_locked"];

function pick(arr, i) {
  return arr[i % arr.length];
}

function planet(name, type, climate, pop, raceId, resources) {
  return {
    id: randomUUID(),
    name,
    type,
    climate,
    population: pop,
    raceComposition: raceId ? [{ raceId, percent: 100 }] : [],
    resources,
  };
}

function station(name, kind, factionId) {
  return { id: randomUUID(), name, kind, factionId };
}

/** Faction flavour packs for infrastructure. */
const PACKS = {
  faction_belator: {
    resources: ["железо", "титан", "кристаллы", "соларид-руда", "псайрит"],
    stations: ["military", "relay", "trade", "science"],
    planetBias: ["rocky", "desert", "ocean"],
  },
  faction_federation: {
    resources: ["провиант", "медикаменты", "электроника", "изотопы"],
    stations: ["trade", "relay", "military", "science"],
    planetBias: ["ocean", "rocky", "ice"],
  },
  faction_turon: {
    resources: ["железо", "порох-сплав", "тяжёлая броня", "топливо"],
    stations: ["military", "mining", "relay"],
    planetBias: ["desert", "rocky", "hot"],
  },
  faction_korvun: {
    resources: ["пси-глушители", "костяной сплав", "тишина-руда", "реликвии"],
    stations: ["relay", "military", "science"],
    planetBias: ["ice", "artifact", "rocky"],
  },
  faction_taala: {
    resources: ["пси-кристаллы", "стекло-ткань", "данные-узлы", "оболочка-сырьё"],
    stations: ["science", "relay", "trade"],
    planetBias: ["artifact", "ice", "ocean"],
  },
  faction_heshah: {
    resources: ["зелёный сплав", "храмовое топливо", "клинок-руда", "благовония"],
    stations: ["military", "trade", "relay"],
    planetBias: ["rocky", "hot", "desert"],
  },
  faction_sikuri: {
    resources: ["караванные товары", "карты-маршруты", "провиант", "редкозём"],
    stations: ["trade", "relay", "mining"],
    planetBias: ["ocean", "temperate", "rocky"],
  },
  faction_huchi: {
    resources: ["хитин-ткань", "биосмола", "тихая руда"],
    stations: ["trade", "relay"],
    planetBias: ["rocky", "cold", "ocean"],
  },
  faction_north_swarm: {
    resources: ["биомасса", "споры", "хитин", "яйца-мат"],
    stations: ["military"],
    planetBias: ["toxic", "infernal", "rocky"],
  },
  faction_south_swarm: {
    resources: ["пепел", "мёртвый хитин", "обломки"],
    stations: [],
    planetBias: ["toxic", "frozen", "desert"],
  },
  faction_balsagon: {
    resources: ["Т11-обломки", "синхро-руда", "чёрный сплав", "ОР-хвост"],
    stations: ["military", "mining", "science"],
    planetBias: ["toxic", "artifact", "rocky"],
  },
  faction_pirates: {
    resources: ["трофеи", "контрабанда", "лом", "рабы-чёрный рынок"],
    stations: ["military", "trade"],
    planetBias: ["rocky", "desert", "toxic"],
  },
  null: {
    resources: ["пыль", "лёд", "руда"],
    stations: ["relay", "mining"],
    planetBias: ["rocky", "ice", "desert"],
  },
};

function enrichSystem(sys, index) {
  const pack = PACKS[sys.ownerFactionId] ?? PACKS.null ?? PACKS.faction_belator;
  const raceByFaction = {
    faction_belator: "race_belator",
    faction_federation: "race_corinfad",
    faction_turon: "race_human",
    faction_korvun: "race_korvun",
    faction_taala: "race_taala",
    faction_heshah: "race_heshah",
    faction_sikuri: "race_sikuri",
    faction_huchi: "race_huchi",
    faction_north_swarm: "race_swarm",
    faction_south_swarm: "race_swarm",
    faction_balsagon: "race_belator",
    faction_pirates: "race_human",
  };
  const raceId = raceByFaction[sys.ownerFactionId] ?? "race_belator";

  if (sys.kind === "corridor") {
    sys.planets = [];
    sys.stars = [];
    sys.stations = [
      station(`Релей «${sys.name}»`, "relay", sys.ownerFactionId),
      ...(index % 2 === 0
        ? [station(`Док транзита`, "trade", sys.ownerFactionId)]
        : []),
    ];
    sys.resources = ["транзит-пошлина"];
    sys.activity = sys.activity === "none" ? "transit" : sys.activity;
    return sys;
  }

  const nPlanets = sys.isCapital ? 3 + (index % 2) : 1 + (index % 3);
  const planets = [];
  for (let i = 0; i < nPlanets; i++) {
    const inhabited = i === 0 || (sys.isCapital && i < 2) || index % 4 === i;
    const pType = pick(pack.planetBias, index + i);
    const climate = pick(CLIMATES, index * 3 + i);
    const pop = inhabited
      ? sys.isCapital
        ? 2_000_000_000 + index * 17_000_000
        : 200_000_000 + ((index * 97 + i * 13) % 1_500_000_000)
      : 0;
    planets.push(
      planet(
        i === 0 ? `Мир ${sys.name}` : `${sys.name}-${["II", "III", "IV", "V"][i - 1] ?? i + 1}`,
        PLANET_TYPES.includes(pType) ? pType : "rocky",
        climate,
        pop,
        inhabited ? raceId : null,
        inhabited ? [pick(pack.resources, i), pick(pack.resources, i + 2)].filter(Boolean) : [],
      ),
    );
  }
  sys.planets = planets;

  const stations = [];
  if (sys.isCapital) {
    stations.push(station(`Орбитальный дворец`, "military", sys.ownerFactionId));
    stations.push(station(`Биржа ${sys.name}`, "trade", sys.ownerFactionId));
    stations.push(station(`Узел связи`, "relay", sys.ownerFactionId));
  } else if (pack.stations.length) {
    const kind = pick(pack.stations, index);
    stations.push(station(`${kind}-пост ${sys.name}`, kind, sys.ownerFactionId));
    if (index % 3 === 0) {
      stations.push(
        station(`Шахта`, "mining", sys.ownerFactionId),
      );
    }
  }
  // Keep existing unique stations (Belator yards etc.)
  const existing = (sys.stations ?? []).filter((s) => s.name && !s.name.startsWith("Орбитальный"));
  sys.stations = [...existing, ...stations].slice(0, 5);

  sys.resources = [
    ...new Set([
      ...(sys.resources ?? []),
      pick(pack.resources, index),
      pick(pack.resources, index + 1),
    ]),
  ].slice(0, 4);

  return sys;
}

function findByName(systems, name) {
  return systems.find((s) => s.name === name);
}

function linkOf(fromId, toId, type = "corridor") {
  return { id: randomUUID(), fromId, toId, type };
}

function fleet(name, factionId, systemId, kind, stance, composition, route = []) {
  return {
    id: randomUUID(),
    name,
    factionId,
    systemId,
    kind,
    composition,
    stance,
    route,
  };
}

function legion(name, factionId, systemId, strength, status) {
  return {
    id: randomUUID(),
    name,
    factionId,
    systemId,
    strength,
    status,
  };
}

/**
 * Apply living-map pass: enrich systems, set activities, trade, force vectors.
 */
export function enlivenWorld(systems, links, fleets, legions) {
  systems.forEach((s, i) => enrichSystem(s, i));

  // ——— Activity hotspots from Session 2 ———
  const setAct = (name, activity, notes) => {
    const s = findByName(systems, name);
    if (!s) return;
    s.activity = activity;
    if (notes) s.notes = [s.notes, notes].filter(Boolean).join(" · ");
  };

  setAct("Солис", "repair", "SOL INVICTUS в доке; столица отстояна");
  setAct("Алиот", "garrison", "Горный Венец — перемирие, гарнизоны Турона до нового Корвуда");
  setAct("Альбирео", "garrison", "Заложники / западный рубеж");
  setAct("Йота", "garrison", "");
  setAct("Антрес", "garrison", "");
  setAct("Адара", "garrison", "");
  setAct("Аврентис", "battle", "Кузница ОР — residual ≠ 0; расследование СБ");
  setAct("Улей-Север", "battle", "Северная Королева — удар в сердце Империи");
  setAct("Коринфад-Прайм", "garrison", "Военное управление Белатора; беженцы");
  setAct("Агора-Дельта", "battle", "Фронт Северного Роя — 5 систем под угрозой");
  setAct("Политея", "battle", "Федеральный флот уничтожен");
  setAct("Истмион", "transit", "Гуманитарный коридор Астры");
  setAct("Складки Тишины", "garrison", "Протокол Трёх Рогов; давление на Балсагон");
  setAct("Кузница-Шрам", "battle", "Хвост сети ОР");
  setAct("Охадор-Трон", "garrison", "Крестовый поход vs Рой");
  setAct("Туранмал", "repair", "Отход по перемирию; Молот Наследия подбит");
  setAct("Улей-Пепел", "none", "Южный Рой уничтожен");
  setAct("Садальмелик-Руин", "none", "Плацдарм Сессии 1");
  setAct("Сикури-Прайм", "trade", "Торговый край / слухи о маяках");
  setAct("Хучи-Прайм", "trade", "Нейтральная торговля у Ригеля");
  setAct("Капелла", "trade", "1-й контакт Таала");
  setAct("Икилан-Трон", "garrison", "Наблюдатели; дар оболочки");

  // ——— Trade lanes (activity + tradeWithSystemId) ———
  const trade = (a, b) => {
    const sa = findByName(systems, a);
    const sb = findByName(systems, b);
    if (!sa || !sb) return;
    sa.activity = "trade";
    sa.tradeWithSystemId = sb.id;
    sb.activity = sb.activity === "battle" ? "battle" : "trade";
    if (sb.activity === "trade") sb.tradeWithSystemId = sa.id;
    links.push(linkOf(sa.id, sb.id, "corridor"));
  };

  trade("Сикури-Прайм", "Охадор-Трон");
  trade("Сикури-Прайм", "Поллукс");
  trade("Хучи-Прайм", "Ригель");
  trade("Коринфад-Прайм", "Солис");
  trade("Истмион", "Элегантия");
  trade("Икилан-Трон", "Капелла");
  trade("Складки Тишины", "Аврентис");
  trade("Михр-Шах", "Сикури-Пристань");
  trade("Агора-Дельта", "Коринфад-Прайм");

  // ——— Corridor transit nodes between blocs ———
  const corridors = [
    {
      name: "Гуманитарный Узел-Север",
      x: -40,
      y: -620,
      owner: "faction_federation",
      notes: "Коридор беженцев Федерации → Белатор",
    },
    {
      name: "Западный Перевал",
      x: -720,
      y: 80,
      owner: "faction_belator",
      notes: "Линия перемирия Турон/Белатор",
    },
    {
      name: "Стык Складок",
      x: 1180,
      y: -280,
      owner: "faction_korvun",
      notes: "Корвун'тай → Балсагон",
    },
    {
      name: "Южный Крестовый Релей",
      x: 480,
      y: 980,
      owner: "faction_heshah",
      notes: "ХэШах → пепел Южного Роя",
    },
  ];

  // corridors are in flat space — caller applies iso; we add after iso in build script instead
  // So return corridor defs for build script to place

  // ——— Extra fleets / routes (Session 2 vectors) ———
  const id = (name) => findByName(systems, name)?.id;
  const extraFleets = [];
  const extraLegions = [];

  const pushF = (...args) => {
    const f = fleet(...args);
    if (f.systemId) extraFleets.push(f);
  };

  // Northern Swarm drives south into Federation / toward Belator heart
  if (id("Улей-Север") && id("Агора-Дельта") && id("Коринфад-Прайм")) {
    pushF(
      "Клык Северной Королевы",
      "faction_north_swarm",
      id("Улей-Север"),
      "combat",
      "attack",
      [{ type: "корвет", count: 60 }, { type: "носитель-спор", count: 4 }],
      [id("Агора-Дельта"), id("Коринфад-Прайм")],
    );
    pushF(
      "Волна-Шрам",
      "faction_north_swarm",
      id("Матка-Шрам") ?? id("Улей-Север"),
      "combat",
      "attack",
      [{ type: "корвет", count: 35 }],
      [id("Политея"), id("Истмион")].filter(Boolean),
    );
  }

  // Sahale fleet already exists — reinforce northern defense
  if (id("Делос-9")) {
    pushF(
      "Дозор Федерации",
      "faction_federation",
      id("Делос-9"),
      "patrol",
      "defend",
      [{ type: "фрегат", count: 6 }],
      [id("Агора-Дельта")].filter(Boolean),
    );
  }

  // Belator northern transfer
  if (id("Элегантия") && id("Коринфад-Прайм")) {
    pushF(
      "Северная Переброска",
      "faction_belator",
      id("Элегантия"),
      "transport",
      "move",
      [{ type: "транспорт", count: 8 }, { type: "эскорт", count: 4 }],
      [id("Гуманитарный Узел-Север"), id("Коринфад-Прайм")].filter(Boolean),
    );
  }

  // West — Turanmal withdrawing
  if (id("Туранмал") && id("Қызыл-Вал")) {
    pushF(
      "Отход Корвуда",
      "faction_turon",
      id("Қызыл-Вал") ?? id("Туранмал"),
      "combat",
      "move",
      [{ type: "крейсер", count: 5 }],
      [id("Туранмал")],
    );
    pushF(
      "Эскорт Молота (остатки)",
      "faction_turon",
      id("Молот-Наследия") ?? id("Туранмал"),
      "combat",
      "defend",
      [{ type: "эскорт", count: 3 }],
      [],
    );
  }

  // East — Corvun cut Balsagon / OR logistics
  if (id("Складки Тишины") && id("Аврентис")) {
    pushF(
      "Три Рога",
      "faction_korvun",
      id("Складки Тишины"),
      "combat",
      "attack",
      [{ type: "рейдер", count: 7 }],
      [id("Стык Складок"), id("Аврентис")].filter(Boolean),
    );
  }

  // HeShah crusade toward southern ash / east
  if (id("Охадор-Трон") && id("Улей-Пепел")) {
    pushF(
      "Крестовый Клинок Охадора",
      "faction_heshah",
      id("Охадор-Трон"),
      "combat",
      "attack",
      [{ type: "линкор", count: 2 }, { type: "фрегат", count: 12 }],
      [id("Южный Крестовый Релей"), id("Улей-Пепел")].filter(Boolean),
    );
  }

  // Taala support toward beacon south ( Capella / southern vector )
  if (id("Икилан-Трон") && id("Капелла")) {
    pushF(
      "Нить Икилана",
      "faction_taala",
      id("Икилан-Трон"),
      "support",
      "defend",
      [{ type: "пси-крейсер", count: 2 }],
      [id("Капелла")],
    );
  }

  // Sikuri trade flotilla
  if (id("Сикури-Прайм")) {
    pushF(
      "Караван Многообразов",
      "faction_sikuri",
      id("Сикури-Прайм"),
      "trade",
      "move",
      [{ type: "торговец", count: 5 }],
      [id("Охадор-Трон"), id("Поллукс")].filter(Boolean),
    );
  }

  // Pirates
  for (const name of ["Клык Налётчиков", "Дрейф-Форт", "Костяной Притон", "Падальщики Юга", "Нора Шакалов"]) {
    if (id(name)) {
      pushF(
        `Банда «${name}»`,
        "faction_pirates",
        id(name),
        "combat",
        "attack",
        [{ type: "корвет", count: 4 + (name.length % 5) }],
        [],
      );
    }
  }

  // Balsagon residual OR pressure
  if (id("Кузница-Шрам")) {
    pushF(
      "Хвост Кузницы",
      "faction_or",
      id("Кузница-Шрам"),
      "combat",
      "attack",
      [{ type: "дрон-узел", count: 20 }],
      [id("Аврентис")].filter(Boolean),
    );
  }

  // Legions — northern transfer + western watch
  if (id("Коринфад-Прайм")) {
    extraLegions.push(
      legion("Гуманитарный Корпус Астры", "faction_belator", id("Коринфад-Прайм"), 4000, "garrison"),
    );
  }
  if (id("Алиот")) {
    extraLegions.push(
      legion("Наблюдатели Турона (Алиот)", "faction_turon", id("Алиот"), 2500, "garrison"),
    );
  }
  if (id("Аврентис")) {
    extraLegions.push(
      legion("СБ — хвост Кузницы", "faction_belator", id("Аврентис"), 1500, "assault"),
    );
  }
  if (id("Охадор-Трон")) {
    extraLegions.push(
      legion("Храмовая Гвардия Охадора", "faction_heshah", id("Охадор-Трон"), 6000, "garrison"),
    );
  }

  fleets.push(...extraFleets);
  legions.push(...extraLegions);

  return { corridorDefs: corridors };
}
