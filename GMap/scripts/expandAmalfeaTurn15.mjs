/**
 * Амальфея к ходу 15:
 * - торговля с Карнед через дамильские врата (пехота): Амальфа → Караванный Хаб → Дамиль-Стык → Голоколь/Никель-Пост
 * - новые заселённые миры + перепись ≤ 3_000_000
 * - хорны и люди (race_human) — меньшинство; большинство synth / гибриды / белаторцы Исхода
 *
 * Run: node GMap/scripts/expandAmalfeaTurn15.mjs
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { loadContent, getContent } from "../server/contentLoader.mjs";
import { computeFlowBreakdown } from "../server/economyTick.mjs";
import { computeLogisticsNetwork } from "../server/logistics.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const WORLD_FILES = [
  path.join(ROOT, "data/published.json"),
  path.join(ROOT, "data/campaign-draft.json"),
  path.join(ROOT, "public/campaigns/lo_golden_pax.json"),
];
const CONTACTS = path.join(ROOT, "data/faction-contacts.json");
const LEDGER = path.join(ROOT, "data/ledger.json");
const FACTION = "faction_amalfea";
const KARNED = "faction_karned";
const uuid = () => crypto.randomUUID();

/** Хорны + люди — меньше всего. */
const MIX = [
  { raceId: "race_synth", percent: 40 },
  { raceId: "race_hybrid.belator_horn", percent: 25 },
  { raceId: "race_belator", percent: 18 },
  { raceId: "race_horn_narburi", percent: 7 },
  { raceId: "race_horn", percent: 5 },
  { raceId: "race_human", percent: 5 },
];

function b(name, kind, zone, buildingId) {
  const o = { id: uuid(), name, kind, zone: zone || "surface" };
  if (buildingId) o.buildingId = buildingId;
  return o;
}
const many = (n, f) => Array.from({ length: n }, () => f());

function findSys(world, names) {
  const set = new Set(names);
  return (world.systems || []).find((s) => set.has(s.name));
}

function ensurePlanet(sys, { name, resources = [] }) {
  let p = (sys.planets || []).find((x) => x.name === name);
  if (p) return p;
  p = {
    id: uuid(),
    name,
    type: "terrestrial",
    climate: "temperate",
    population: 0,
    raceComposition: [],
    resources,
    habitable: true,
    colonizable: true,
    surveyed: true,
    colonyType: "none",
    orbitIndex: (sys.planets || []).length,
    size: "medium",
    surfaceSlots: 24,
    orbitalSlots: 8,
    surfaceBuildings: [],
    orbitalBuildings: [],
    ownerFactionId: FACTION,
    coOwnerFactionIds: [],
    contested: false,
    loyalty: 70,
  };
  sys.planets = sys.planets || [];
  sys.planets.push(p);
  return p;
}

function settle(planet, { pop, colonyType, notes, resources, surface, orbital }) {
  planet.population = pop;
  planet.colonyType = colonyType;
  planet.habitable = true;
  planet.colonizable = true;
  planet.ownerFactionId = FACTION;
  planet.raceComposition = MIX.map((r) => ({ ...r }));
  planet.loyalty = Math.max(68, planet.loyalty || 70);
  planet.censusLocked = true;
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

function colonyKit(label, { farms = 8, mines = 3, geos = 10, resid = 3, bio = false, gate = false }) {
  const surface = [
    b(`Управа ${label}`, "capitol"),
    ...many(resid, () => b(`Квартал ${label}`, "residential")),
    b(`Медпункт ${label}`, "residential", "surface", "bios.medical"),
    ...many(farms, () => b(`Агро ${label}`, "farm")),
    ...many(mines, () => b(`Промысел ${label}`, "mine")),
    ...many(geos, () =>
      b(`Гео ${label}`, "factory", "surface", "energia.geo_hydro"),
    ),
    b(`ПКО ${label}`, "defense"),
  ];
  if (bio) {
    surface.push(b(`Биокузница ${label}`, "lab", "surface", "bios.biolab"));
  }
  if (gate) {
    surface.push(
      b("Дамильские врата (пехота)", "relay", "deep", "mega.gate"),
    );
  }
  const orbital = [
    b(`Космопорт ${label}`, "spaceport", "orbital"),
    ...many(bio || gate ? 4 : 2, () =>
      b(`Гидропоника ${label}`, "farm", "orbital", "bios.hydroponics"),
    ),
  ];
  return { surface, orbital };
}

function wireDamylTrade(world) {
  const amalfa = findSys(world, ["Амальфа"]);
  const hub = findSys(world, ["Караванный Хаб"]);
  const gateSys = findSys(world, ["Дамиль-Стык", "SYS-765"]);
  const holokol = findSys(world, ["Голоколь"]);
  if (!amalfa || !hub || !gateSys || !holokol) {
    console.warn("damyl chain systems missing", {
      amalfa: !!amalfa,
      hub: !!hub,
      gateSys: !!gateSys,
      holokol: !!holokol,
    });
    return;
  }
  if (gateSys.name === "SYS-765") gateSys.name = "Дамиль-Стык";

  const pAmalfa =
    (amalfa.planets || []).find((p) => p.name === "Амальфа") || amalfa.planets?.[0];
  const pHub =
    (hub.planets || []).find((p) => p.name === "Караванный Хаб") || hub.planets?.[0];
  const pGate =
    (gateSys.planets || []).find(
      (p) => p.name === "Дамиль-Стык" || p.name === "Водо-Провиант",
    ) || gateSys.planets?.[0];
  const pNick =
    (holokol.planets || []).find((p) => p.name === "Никель-Пост") ||
    holokol.planets?.[0];

  if (pGate && pGate.name === "Водо-Провиант") pGate.name = "Дамиль-Стык";

  const pairs = [
    [amalfa.id, hub.id, pAmalfa?.id, pHub?.id],
    [hub.id, gateSys.id, pHub?.id, pGate?.id],
    [gateSys.id, holokol.id, pGate?.id, pNick?.id],
  ];

  for (const [fromId, toId, fromPlanetId, toPlanetId] of pairs) {
    let link = (world.links || []).find(
      (l) =>
        l.type === "damyl_planet" &&
        ((l.fromId === fromId && l.toId === toId) ||
          (l.fromId === toId && l.toId === fromId)),
    );
    if (!link) {
      link = {
        id: uuid(),
        fromId,
        toId,
        type: "damyl_planet",
        fromPlanetId: fromPlanetId || null,
        toPlanetId: toPlanetId || null,
      };
      world.links = world.links || [];
      world.links.push(link);
    } else {
      // normalize orientation + planet endpoints
      if (link.fromId === fromId) {
        link.fromPlanetId = fromPlanetId || link.fromPlanetId;
        link.toPlanetId = toPlanetId || link.toPlanetId;
      } else {
        link.fromPlanetId = toPlanetId || link.fromPlanetId;
        link.toPlanetId = fromPlanetId || link.toPlanetId;
      }
    }
  }

  // врата на концах и хабах
  for (const p of [pAmalfa, pHub, pGate, pNick]) {
    if (!p) continue;
    p.surfaceBuildings = p.surfaceBuildings || [];
    const has = p.surfaceBuildings.some(
      (x) =>
        x.buildingId === "mega.gate" ||
        /дамильские врата/i.test(x.name || ""),
    );
    if (!has) {
      p.surfaceBuildings.push(
        b("Дамильские врата (пехота)", "relay", "deep", "mega.gate"),
      );
      p.surfaceSlots = Math.max(
        p.surfaceSlots ?? 8,
        p.surfaceBuildings.length + 2,
      );
    }
    if (p.ownerFactionId === FACTION || !p.ownerFactionId) {
      p.notes = [
        p.notes,
        "Дамильские врата (пехота): торговый коридор Амальфея ↔ Карнед (Голоколь) к ходу 15.",
      ]
        .filter(Boolean)
        .join(" ");
    } else if (p.name === "Никель-Пост") {
      p.notes = [
        p.notes,
        "Дамильские врата (пехота): стык с Амальфеей (Дамиль-Стык). Торговля Альянс ↔ Карнед.",
      ]
        .filter(Boolean)
        .join(" ");
    }
  }

  console.log(
    "damyl trade:",
    "Амальфа",
    pAmalfa?.id?.slice(0, 8),
    "→ Караванный Хаб",
    pHub?.id?.slice(0, 8),
    "→ Дамиль-Стык",
    pGate?.id?.slice(0, 8),
    "→ Никель-Пост",
    pNick?.id?.slice(0, 8),
  );
}

function setTradeDiplomacy(world) {
  world.diplomacy = world.diplomacy || [];
  const id = `diplo_${FACTION}_${KARNED}`;
  const idAlt = `diplo_${KARNED}_${FACTION}`;
  let row = world.diplomacy.find(
    (d) =>
      d &&
      ((d.aId === FACTION && d.bId === KARNED) ||
        (d.aId === KARNED && d.bId === FACTION) ||
        d.id === id ||
        d.id === idAlt),
  );
  if (!row) {
    row = { id, aId: FACTION, bId: KARNED, relation: "trade" };
    world.diplomacy.push(row);
  } else {
    row.relation = "trade";
    row.aId = row.aId || FACTION;
    row.bId = row.bId || KARNED;
  }
  console.log("diplomacy trade", FACTION, "<->", KARNED);
}

function applyCensusAndColonies(world) {
  /** @type {Array<[string[], string, object]>} */
  const plan = [
    // столичный кластер
    [
      ["Амальфа"],
      "Амальфа",
      {
        pop: 900_000,
        colonyType: "capital",
        notes:
          "Амальфа — Gaia. Столица к ходу 15: биокузницы, Кодекс Смешения, дамильские врата на торговом луче к Карнед.",
        resources: ["вода", "органическая биомасса", "пища", "железо", "золото"],
        kit: { farms: 16, mines: 4, geos: 18, resid: 6, bio: true, gate: true },
      },
    ],
    [
      ["Амальфа"],
      "Цветущий Рог",
      {
        pop: 220_000,
        colonyType: "colony",
        notes: "Спутник столицы. Провиант и жилые пояса кальтинско-синтетической культуры.",
        resources: ["пища", "железо"],
        kit: { farms: 12, mines: 3, geos: 12, resid: 4, bio: true },
        renameFrom: ["Планета 1"],
      },
    ],
    [
      ["Амальфа"],
      "Амальфа-Пояс",
      {
        pop: 120_000,
        colonyType: "colony",
        notes: "Новый жилой пояс столичной системы (ход 10–15).",
        resources: ["железо"],
        kit: { farms: 8, mines: 2, geos: 10, resid: 3 },
        renameFrom: ["Планета 2"],
        create: true,
      },
    ],
    // торговый луч
    [
      ["Караванный Хаб"],
      "Караванный Хаб",
      {
        pop: 280_000,
        colonyType: "colony",
        notes:
          "Караванный хаб. Дамильские врата (пехота) на луче Амальфа → Карнед. Торговля к ходу 15.",
        resources: ["железо", "пища"],
        kit: { farms: 12, mines: 4, geos: 14, resid: 4, bio: false, gate: true },
      },
    ],
    [
      ["Караванный Хаб"],
      "Караван-Док",
      {
        pop: 100_000,
        colonyType: "colony",
        notes: "Док и склады провианта на хабе.",
        resources: ["антиматерия", "пища"],
        kit: { farms: 6, mines: 3, geos: 10, resid: 2 },
        renameFrom: ["Планета 2"],
      },
    ],
    [
      ["Дамиль-Стык", "SYS-765"],
      "Дамиль-Стык",
      {
        pop: 240_000,
        colonyType: "colony",
        notes:
          "Дамиль-Стык — врата пехоты к Голоколю (Карнед). Вода/провиант + таможня Альянса.",
        resources: ["вода", "пища"],
        kit: { farms: 14, mines: 2, geos: 12, resid: 4, bio: true, gate: true },
        renameFrom: ["Водо-Провиант", "Планета 1"],
      },
    ],
    // новые колонии на пустых мирах
    [
      ["Кристалл-Харт"],
      "Реликт-Колония",
      {
        pop: 90_000,
        colonyType: "colony",
        notes: "Новая колония у кристалл-харта (реликты).",
        resources: ["реликты"],
        kit: { farms: 7, mines: 4, geos: 10, resid: 2 },
        renameFrom: ["Планета 1"],
      },
    ],
    [
      ["Антимат-Корн"],
      "Железо-Кольцо",
      {
        pop: 85_000,
        colonyType: "colony",
        notes: "Заселённый пояс Антимат-Корна.",
        resources: ["железо"],
        kit: { farms: 7, mines: 5, geos: 10, resid: 2 },
        renameFrom: ["Планета 1"],
      },
    ],
    [
      ["SYS-262"],
      "Газкрай-Колония",
      {
        pop: 80_000,
        colonyType: "colony",
        notes: "Новая колония газо-железного узла.",
        resources: ["железо"],
        kit: { farms: 7, mines: 4, geos: 10, resid: 2 },
        renameFrom: ["Планета 4"],
      },
    ],
    [
      ["SYS-755"],
      "Кристалл-Новь",
      {
        pop: 75_000,
        colonyType: "colony",
        notes: "Новый кристаллический посёлок.",
        resources: ["кристаллы"],
        kit: { farms: 6, mines: 5, geos: 10, resid: 2 },
        renameFrom: ["Планета 1"],
      },
    ],
    [
      ["Титан-Узел Каль"],
      "Титан-Жилой",
      {
        pop: 95_000,
        colonyType: "colony",
        notes: "Жилой контур при титановом промысле (рост к обмену).",
        resources: ["титан", "реликты"],
        kit: { farms: 6, mines: 6, geos: 12, resid: 2 },
        renameFrom: ["Планета 4"],
      },
    ],
    [
      ["SYS-762"],
      "Водокрай",
      {
        pop: 70_000,
        colonyType: "colony",
        notes: "Водная колония у второго титан-узла.",
        resources: ["вода"],
        kit: { farms: 8, mines: 2, geos: 10, resid: 2, bio: true },
        renameFrom: ["Планета 2"],
      },
    ],
    [
      ["Капкан-Войд"],
      "Войд-Полис",
      {
        pop: 65_000,
        colonyType: "colony",
        notes: "Новый полис на окраине Капкан-Войда.",
        resources: ["железо"],
        kit: { farms: 6, mines: 3, geos: 9, resid: 2 },
        renameFrom: ["Мир 3"],
      },
    ],
    [
      ["SYS-760"],
      "Редкозем-Новь",
      {
        pop: 60_000,
        colonyType: "colony",
        notes: "Новая редкоземельная колония.",
        resources: ["редкоземы"],
        kit: { farms: 6, mines: 5, geos: 10, resid: 2 },
        renameFrom: ["Планета 3"],
      },
    ],
  ];

  // Создать миры на пустых COR-системах
  const newCors = [
    ["COR-240", "Симбиоз-Колония", 150_000, ["органическая биомасса", "пища"]],
    ["COR-243", "Кодекс-Полис", 140_000, ["железо", "пища"]],
    ["COR-259", "Интеграл-Харт", 130_000, ["кристаллы", "железо"]],
  ];
  for (const [sysName, planetName, pop, res] of newCors) {
    const sys = findSys(world, [sysName]);
    if (!sys) continue;
    sys.name = planetName; // читаемое имя системы
    const p = ensurePlanet(sys, { name: planetName, resources: res });
    const kit = colonyKit(planetName, {
      farms: 10,
      mines: 3,
      geos: 12,
      resid: 3,
      bio: true,
    });
    settle(p, {
      pop,
      colonyType: "colony",
      notes: `${planetName}: новая колония Альянса (заселение к ходу 15). Биотех и Кодекс Смешения.`,
      resources: res,
      ...kit,
    });
  }

  for (const [sysNames, planetName, cfg] of plan) {
    const sys = findSys(world, sysNames);
    if (!sys) {
      console.warn("missing sys", sysNames);
      continue;
    }
    let p =
      (sys.planets || []).find((x) => x.name === planetName) ||
      (cfg.renameFrom || [])
        .map((n) => (sys.planets || []).find((x) => x.name === n))
        .find(Boolean);
    if (!p && cfg.create) {
      p = ensurePlanet(sys, { name: planetName, resources: cfg.resources || [] });
    }
    if (!p) {
      console.warn("missing planet", planetName, "in", sys.name);
      continue;
    }
    p.name = planetName;
    const kit = colonyKit(planetName, cfg.kit || {});
    // сохранить столичные уникальные здания если уже есть — пересоберём чистым китом + gate
    settle(p, {
      pop: cfg.pop,
      colonyType: cfg.colonyType,
      notes: cfg.notes,
      resources: cfg.resources,
      ...kit,
    });
  }

  // Добывающие посты — малые гарнизоны (остаток переписи)
  const mining = [
    ["Кристалл-Харт", "Кристалл-Харт", 40_000],
    ["Титан-Узел Каль", "Титан-Узел Каль", 45_000],
    ["SYS-762", "Титан-Узел Рог", 35_000],
    ["Антимат-Корн", "Антимат-Корн", 30_000],
    ["SYS-258", "Антимат-Тень", 25_000],
    ["SYS-262", "Газ-Железо Узел", 30_000],
    ["SYS-245", "Кристалл-Пост", 25_000],
    ["SYS-755", "Редкозем-Пост", 25_000],
    ["SYS-760", "Кристалл-Антимат", 25_000],
    ["Капкан-Войд", "Узел Данных", 25_000],
  ];
  for (const [sysName, planetName, pop] of mining) {
    const sys = findSys(world, [sysName]);
    const p = (sys?.planets || []).find((x) => x.name === planetName);
    if (!p) continue;
    const kit = colonyKit(planetName, {
      farms: 4,
      mines: 6,
      geos: 10,
      resid: 2,
    });
    settle(p, {
      pop,
      colonyType: "mining",
      notes:
        (p.notes || "") +
        " Промысловый пост Альянса; перепись к ходу 15.",
      resources: p.resources,
      ...kit,
    });
  }

  // Пересчитать сумму и подрезать столицу если > 3M
  let total = 0;
  for (const sys of world.systems || []) {
    if (sys.ownerFactionId !== FACTION) continue;
    for (const p of sys.planets || []) total += p.population || 0;
  }
  if (total > 3_000_000) {
    const cap = (findSys(world, ["Амальфа"])?.planets || []).find(
      (p) => p.name === "Амальфа",
    );
    if (cap) {
      cap.population = Math.max(0, cap.population - (total - 3_000_000));
      total = 3_000_000;
    }
  }
  console.log("amalfea census total", total);
}

function patchContacts() {
  const raw = JSON.parse(fs.readFileSync(CONTACTS, "utf8"));
  const c = raw.contacts || raw;
  c.faction_amalfea = Array.isArray(c.faction_amalfea)
    ? c.faction_amalfea
    : [];
  c.faction_karned = Array.isArray(c.faction_karned) ? c.faction_karned : [];
  if (!c.faction_amalfea.includes(KARNED)) c.faction_amalfea.push(KARNED);
  if (!c.faction_karned.includes(FACTION)) c.faction_karned.push(FACTION);
  // убрать rebels из контактов если ещё висят
  c.faction_amalfea = c.faction_amalfea.filter((x) => x !== "faction_rebels");
  fs.writeFileSync(CONTACTS, JSON.stringify(raw, null, 2) + "\n", "utf8");
  console.log("contacts: amalfea <-> karned");
}

function bumpLedgerTrade() {
  const led = JSON.parse(fs.readFileSync(LEDGER, "utf8"));
  const eco = led.factions[FACTION];
  if (!eco) return;
  eco.stocks = {
    ...eco.stocks,
    "currency.metal": Math.max(Number(eco.stocks["currency.metal"] || 0), 32000),
    "currency.supply": Math.max(Number(eco.stocks["currency.supply"] || 0), 18000),
    "currency.bios": Math.max(Number(eco.stocks["currency.bios"] || 0), 160),
    "map.food": Math.max(Number(eco.stocks["map.food"] || 0), 22000),
    "map.titan": Math.max(Number(eco.stocks["map.titan"] || 0), 5500),
  };
  fs.writeFileSync(LEDGER, JSON.stringify(led, null, 2) + "\n", "utf8");
}

function main() {
  loadContent();
  let worldForCheck = null;
  for (const file of WORLD_FILES) {
    if (!fs.existsSync(file)) continue;
    const world = JSON.parse(fs.readFileSync(file, "utf8"));
    applyCensusAndColonies(world);
    wireDamylTrade(world);
    setTradeDiplomacy(world);
    computeLogisticsNetwork(world, FACTION, getContent());
    const f = (world.factions || []).find((x) => x.id === FACTION);
    if (f) {
      const note =
        "К ходу 15: торговля с Карнед через дамильские врата (пехота) Амальфа→Караванный Хаб→Дамиль-Стык→Голоколь. Перепись ≤3 млн; synth/гибриды большинство, хорны и люди — меньшинство.";
      if (!(f.notes || "").includes("К ходу 15:")) {
        f.notes = [f.notes, note].filter(Boolean).join("\n");
      }
    }
    if (world.meta) {
      world.meta.updatedAt = new Date().toISOString();
      world.meta.tableRevision = (world.meta.tableRevision ?? 0) + 1;
    }
    fs.writeFileSync(file, JSON.stringify(world, null, 2) + "\n", "utf8");
    console.log("patched", path.basename(file));
    if (!worldForCheck) worldForCheck = world;
  }
  patchContacts();
  bumpLedgerTrade();

  if (worldForCheck) {
    const eco = JSON.parse(fs.readFileSync(LEDGER, "utf8")).factions[FACTION];
    const bd = computeFlowBreakdown(worldForCheck, FACTION, getContent(), eco);
    console.log(
      "NETS",
      Object.fromEntries(
        Object.entries(bd.totals).map(([k, v]) => [k, Math.round(v.net * 10) / 10]),
      ),
    );
    let total = 0;
    const rows = [];
    for (const sys of worldForCheck.systems || []) {
      if (sys.ownerFactionId !== FACTION) continue;
      for (const p of sys.planets || []) {
        if ((p.population || 0) > 0) {
          total += p.population;
          rows.push([sys.name, p.name, p.population]);
        }
      }
    }
    rows.sort((a, b) => b[2] - a[2]);
    console.log(
      rows
        .map(
          (r) =>
            `${r[0]} / ${r[1]}: ${r[2].toLocaleString("ru-RU")}`,
        )
        .join("\n"),
    );
    console.log("TOTAL", total.toLocaleString("ru-RU"), "ok?", total <= 3_000_000);
  }
}

main();
