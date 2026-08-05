/**
 * Белатор: починить баланс после «лорных» легионов + перепись по истории.
 *
 * Лор (I.02 Танет): белаторцы и нагааритяне — титульные народы,
 * равномерно по четырём коренным мирам (Солис, Гурез, Элегантия, Десерти).
 * Столицы формально на Солисе, но демография четырёх миров — паритет.
 *
 * Bios demand = min(pop, housingCap)×0.05 → жильё умеренное, censusLocked.
 * Легионы — игровые когорты (не лорные 10k).
 *
 * Run: node GMap/scripts/rebalanceBelatorCensus.mjs
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { loadContent, getContent } from "../server/contentLoader.mjs";
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

/** Титульные народы — паритет на 4 коренных (I.02). */
const CORE_TITLE_MIX = [
  { raceId: "race_belator", percent: 40 },
  { raceId: "race_nagaar", percent: 40 },
  { raceId: "race_human", percent: 12 },
  { raceId: "race_horn_narburi", percent: 8 },
];
const SHIPYARD_MIX = [
  { raceId: "race_belator", percent: 38 },
  { raceId: "race_nagaar", percent: 38 },
  { raceId: "race_human", percent: 16 },
  { raceId: "race_horn_narburi", percent: 8 },
];
const AGRO_MIX = [
  { raceId: "race_belator", percent: 36 },
  { raceId: "race_nagaar", percent: 36 },
  { raceId: "race_human", percent: 20 },
  { raceId: "race_horn_narburi", percent: 8 },
];
const WEST_MIX = [
  { raceId: "race_belator", percent: 55 },
  { raceId: "race_nagaar", percent: 20 },
  { raceId: "race_human", percent: 20 },
  { raceId: "race_horn_narburi", percent: 5 },
];
const MINE_MIX = [
  { raceId: "race_belator", percent: 45 },
  { raceId: "race_nagaar", percent: 25 },
  { raceId: "race_human", percent: 22 },
  { raceId: "race_horn_narburi", percent: 8 },
];
const FED_MIX = [
  { raceId: "race_human", percent: 70 },
  { raceId: "race_belator", percent: 18 },
  { raceId: "race_nagaar", percent: 8 },
  { raceId: "race_horn_narburi", percent: 4 },
];

function b(name, kind, zone, buildingId) {
  const o = { id: uuid(), name, kind, zone: zone || "surface" };
  if (buildingId) o.buildingId = buildingId;
  return o;
}

function findSys(world, name) {
  return (world.systems || []).find((s) => s.name === name);
}
function findPlanet(sys, name) {
  if (!sys) return null;
  return (sys.planets || []).find((p) => p.name === name) || null;
}

function tuneLegions(world) {
  // E3 capacity узкая (гидро ждёт B3) — когорты держим компактными.
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
    if (next == null) {
      // composition counts drive E3 upkeep — sync even if strength already tuned
      const compSum = (l.composition || []).reduce(
        (s, g) => s + (g.count || 0),
        0,
      );
      if (compSum > 80) next = Math.max(8, l.strength || 40);
      else continue;
    }
    l.strength = next;
    if (Array.isArray(l.composition) && l.composition.length) {
      // один стек = strength; иначе пропорционально
      if (l.composition.length === 1) {
        l.composition[0].count = next;
      } else {
        const sum = l.composition.reduce((s, g) => s + (g.count || 0), 0) || 1;
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

function ensureLogistics(world) {
  const content = getContent();
  const bel = (world.systems || []).filter((s) => s.ownerFactionId === FACTION);
  if (!bel.length) return;
  let capId = resolveCapitalSystemId(world, FACTION);
  const solis = bel.find((s) => s.name === "Солис");
  if (solis) capId = solis.id;
  const faction = (world.factions || []).find((f) => f.id === FACTION);
  if (faction) faction.capitalSystemId = capId;
  for (const s of bel) s.isCapital = s.id === capId;

  // star + depot on each belator system
  for (const s of bel) {
    s.spaceObjects = Array.isArray(s.spaceObjects) ? s.spaceObjects : [];
    if (!s.spaceObjects.includes("star")) s.spaceObjects.push("star");
    const p =
      (s.planets || []).find((x) => (x.population || 0) > 0) ||
      (s.planets || [])[0];
    if (!p) continue;
    p.surfaceBuildings = p.surfaceBuildings || [];
    if (
      !p.surfaceBuildings.some(
        (x) =>
          x.buildingId === "logistics.depot" ||
          x.kind === "depot" ||
          /депо|склад снабжения/i.test(x.name || ""),
      )
    ) {
      p.surfaceBuildings.push(
        b(`Депо ${s.name}`, "depot", "surface", "logistics.depot"),
      );
      p.surfaceSlots = Math.max(
        p.surfaceSlots ?? 8,
        p.surfaceBuildings.length + 2,
      );
    }
  }
  computeLogisticsNetwork(world, content);
}

/**
 * Система → планеты: pop, resid (housing), mix, colonyType, notes.
 * Четыре коренных ≈ по 850k (паритет). Всего ≈ 5.0M.
 */
const POP_PLAN = [
  // ——— 4 коренных (паритет) ———
  {
    sys: "Солис",
    planet: "Домус Солис",
    pop: 850_000,
    resid: 5,
    mix: CORE_TITLE_MIX,
    colonyType: "capital",
    notes:
      "Столица Империи. Титульные народы (белаторцы/нагааритяне) в паритете с Гурезом, Элегантией и Десерти (I.02 Танет).",
  },
  {
    sys: "Гурез",
    planet: "Домус Гурез",
    pop: 780_000,
    resid: 5,
    mix: SHIPYARD_MIX,
    colonyType: "core",
    notes:
      "Верфь Империи. Коренной мир #2 — паритет титульных народов с Солисом.",
  },
  {
    sys: "Гурез",
    planet: "Луна Гурез",
    pop: 70_000,
    resid: 2,
    mix: SHIPYARD_MIX,
    colonyType: "outpost",
    notes: "Лунный аванпост трансмиссии; часть гурезского паритетного контура.",
  },
  {
    sys: "Элегантия",
    planet: "Домус Элегантия",
    pop: 850_000,
    resid: 5,
    mix: AGRO_MIX,
    colonyType: "core",
    notes:
      "Колония-сад / коренной мир #3. Агро-хаб; титульные народы в паритете.",
  },
  {
    sys: "Десерти",
    planet: "Домус Десерти",
    pop: 850_000,
    resid: 5,
    mix: CORE_TITLE_MIX,
    colonyType: "core",
    notes:
      "Коренной мир #4. Добыча + агрокупола; титульные народы в паритете.",
  },

  // ——— агро / промышленность ———
  {
    sys: "Мегрец",
    planet: "Мир Мегрец",
    pop: 220_000,
    resid: 3,
    mix: AGRO_MIX,
    colonyType: "colony",
    notes: "Агропояс Империи вне коренной четвёрки.",
  },
  {
    sys: "Капелла",
    planet: "Мир Капелла",
    pop: 180_000,
    resid: 3,
    mix: AGRO_MIX,
    colonyType: "colony",
  },
  {
    sys: "Регул",
    planet: "Мир Регул",
    pop: 200_000,
    resid: 3,
    mix: MINE_MIX,
    colonyType: "colony",
  },
  {
    sys: "Процион",
    planet: "Мир Процион",
    pop: 180_000,
    resid: 3,
    mix: MINE_MIX,
    colonyType: "colony",
  },

  // ——— добыча ———
  {
    sys: "Мерцак",
    planet: "Мир Мерцак",
    pop: 160_000,
    resid: 3,
    mix: MINE_MIX,
    colonyType: "colony",
    notes: "Добывающий узел (железо/кристаллы).",
  },
  {
    sys: "Велентис",
    planet: "Вихрь-Крак-2",
    pop: 80_000,
    resid: 2,
    mix: MINE_MIX,
    colonyType: "outpost",
  },

  // ——— западный марш ———
  {
    sys: "Алиот",
    planet: "Домус Алиот",
    pop: 200_000,
    resid: 3,
    mix: WEST_MIX,
    colonyType: "colony",
    notes: "Освобождённый логистический узел западного марша.",
  },
  {
    sys: "Адара",
    planet: "Мир Адара",
    pop: 180_000,
    resid: 3,
    mix: WEST_MIX,
    colonyType: "colony",
  },
  {
    sys: "Алькор",
    planet: "Домус Алькор",
    pop: 140_000,
    resid: 2,
    mix: WEST_MIX,
    colonyType: "colony",
  },
  {
    sys: "Альбирео",
    planet: "Мир Альбирео",
    pop: 100_000,
    resid: 2,
    mix: WEST_MIX,
    colonyType: "colony",
  },
  {
    sys: "Йота",
    planet: "Мир Йота",
    pop: 60_000,
    resid: 2,
    mix: WEST_MIX,
    colonyType: "outpost",
  },
  {
    sys: "Антрес",
    planet: "Мир Антрес",
    pop: 60_000,
    resid: 2,
    mix: WEST_MIX,
    colonyType: "outpost",
  },

  // ——— Федерация под управой: админ, не мегаполисы ———
  {
    sys: "Гамма",
    planet: "Домус Данкристо",
    pop: 80_000,
    resid: 2,
    mix: FED_MIX,
    colonyType: "colony",
    notes: "Федеральный админ-мир под имперской управой.",
  },
  {
    sys: "Гамма",
    planet: "Домус Белвор",
    pop: 80_000,
    resid: 2,
    mix: FED_MIX,
    colonyType: "colony",
  },
  {
    sys: "Поллукс",
    planet: "Мир Поллукс",
    pop: 100_000,
    resid: 2,
    mix: FED_MIX,
    colonyType: "colony",
  },
  {
    sys: "Каппа",
    planet: "Мир Каппа",
    pop: 100_000,
    resid: 2,
    mix: FED_MIX,
    colonyType: "colony",
  },
  {
    sys: "Ню",
    planet: "Мир Ню",
    pop: 90_000,
    resid: 2,
    mix: FED_MIX,
    colonyType: "colony",
  },
  {
    sys: "Альдебар",
    planet: "Мир Альдебар",
    pop: 70_000,
    resid: 2,
    mix: FED_MIX,
    colonyType: "outpost",
  },
];

function applyCensus(world) {
  const touched = new Set();
  for (const row of POP_PLAN) {
    const sys = findSys(world, row.sys);
    const p = findPlanet(sys, row.planet);
    if (!p) {
      console.warn("missing", row.sys, row.planet);
      continue;
    }
    touched.add(p.id);
    p.population = row.pop;
    p.censusLocked = true;
    p.colonyType = row.colonyType || p.colonyType || "colony";
    p.habitable = true;
    p.colonizable = true;
    p.ownerFactionId = FACTION;
    p.raceComposition = row.mix.map((r) => ({ ...r }));
    if (row.notes) {
      p.notes = row.notes;
    }
    p.loyalty = Math.max(p.loyalty ?? 70, 72);
    p.surfaceBuildings = p.surfaceBuildings || [];

    // trim excess housing (bios = min(pop,cap))
    let resid = 0;
    p.surfaceBuildings = p.surfaceBuildings.filter((x) => {
      if (x.kind === "residential" && !x.buildingId) {
        resid += 1;
        return resid <= row.resid;
      }
      return true;
    });
    while (
      p.surfaceBuildings.filter((x) => x.kind === "residential" && !x.buildingId)
        .length < row.resid
    ) {
      p.surfaceBuildings.push(b(`Квартал ${row.sys}`, "residential"));
    }
    p.surfaceSlots = Math.max(
      p.surfaceSlots ?? 8,
      p.surfaceBuildings.length + 2,
    );
  }

  // zero stray belator pops not in plan
  for (const sys of world.systems || []) {
    if (sys.ownerFactionId !== FACTION) continue;
    for (const p of sys.planets || []) {
      if (touched.has(p.id)) continue;
      if ((p.population || 0) > 0) {
        p.population = 0;
        p.censusLocked = false;
        p.colonyType = "none";
      }
    }
  }
}

function boostBiosForSurplus(world) {
  const coreNames = new Set(["Солис", "Гурез", "Элегантия", "Десерти", "Мегрец"]);

  for (const sys of world.systems || []) {
    if (sys.ownerFactionId !== FACTION) continue;
    for (const p of sys.planets || []) {
      let labs = 0;
      let capitol = 0;
      p.surfaceBuildings = (p.surfaceBuildings || []).filter((x) => {
        if (x.buildingId === "bios.biolab") {
          labs += 1;
          return labs <= 0;
        }
        // bios.medical даёт capacity_add E3 — при capacity>0 весь E3 rate режется до потолка!
        if (x.buildingId === "bios.medical") return false;
        if (x.kind === "capitol") {
          capitol += 1;
          return capitol <= 1;
        }
        return true;
      });
      let hydro = 0;
      const maxHydro = coreNames.has(sys.name) ? 12 : 3;
      p.orbitalBuildings = (p.orbitalBuildings || []).filter((x) => {
        if (x.buildingId === "bios.hydroponics") {
          hydro += 1;
          return hydro <= maxHydro;
        }
        return true;
      });
    }
  }

  const agroHubs = [
    ["Элегантия", "Домус Элегантия", 40, 10],
    ["Мегрец", "Мир Мегрец", 36, 8],
    ["Солис", "Домус Солис", 32, 10],
    ["Десерти", "Домус Десерти", 28, 6],
    ["Капелла", "Мир Капелла", 24, 4],
    ["Гурез", "Домус Гурез", 24, 8],
  ];
  for (const [sysName, planetName, farms, hydros] of agroHubs) {
    const p = findPlanet(findSys(world, sysName), planetName);
    if (!p) continue;
    p.surfaceBuildings = p.surfaceBuildings || [];
    p.orbitalBuildings = p.orbitalBuildings || [];
    const haveFarms = p.surfaceBuildings.filter((x) => x.kind === "farm").length;
    for (let i = haveFarms; i < farms; i++) {
      p.surfaceBuildings.push(b(`Агроперепись ${sysName}`, "farm"));
    }
    const haveHydro = p.orbitalBuildings.filter(
      (x) => x.buildingId === "bios.hydroponics",
    ).length;
    for (let i = haveHydro; i < hydros; i++) {
      p.orbitalBuildings.push(
        b(`Гидроперепись ${sysName}`, "farm", "orbital", "bios.hydroponics"),
      );
    }
    p.surfaceSlots = Math.max(p.surfaceSlots ?? 8, p.surfaceBuildings.length + 2);
    p.orbitalSlots = Math.max(p.orbitalSlots ?? 4, p.orbitalBuildings.length + 2);
  }
}

function applyWorld(world) {
  tuneLegions(world);
  applyCensus(world);
  boostBiosForSurplus(world);
  ensureLogistics(world);
}

function summarize(world) {
  const rows = [];
  let total = 0;
  const byRace = {};
  for (const sys of world.systems || []) {
    if (sys.ownerFactionId !== FACTION) continue;
    let sp = 0;
    for (const p of sys.planets || []) {
      const pop = p.population || 0;
      sp += pop;
      total += pop;
      for (const r of p.raceComposition || []) {
        byRace[r.raceId] =
          (byRace[r.raceId] || 0) + Math.round((pop * r.percent) / 100);
      }
    }
    if (sp > 0) rows.push({ sys: sys.name, pop: sp });
  }
  rows.sort((a, b) => b.pop - a.pop);
  return { total, rows, byRace };
}

loadContent();
let w0 = null;
for (const f of WORLD_FILES) {
  const w = JSON.parse(fs.readFileSync(f, "utf8"));
  applyWorld(w);
  fs.writeFileSync(f, JSON.stringify(w, null, 2) + "\n", "utf8");
  console.log("wrote", path.basename(f));
  if (!w0) w0 = w;
}

const led = JSON.parse(fs.readFileSync(LEDGER, "utf8"));
const eco = led.factions[FACTION];
eco.stocks["currency.bios"] = Math.max(Number(eco.stocks["currency.bios"] || 0), 400);
eco.stocks["currency.energia"] = Math.max(
  Number(eco.stocks["currency.energia"] || 0),
  280,
);
eco.stocks["currency.cognitio"] = Math.max(
  Number(eco.stocks["currency.cognitio"] || 0),
  5000,
);
fs.writeFileSync(LEDGER, JSON.stringify(led, null, 2) + "\n", "utf8");

const bd = computeFlowBreakdown(w0, FACTION, getContent(), eco);
const nets = Object.fromEntries(
  Object.entries(bd.totals).map(([k, v]) => [k, Math.round(v.net * 10) / 10]),
);
console.log("NETS", nets);
console.log("all+", Object.values(bd.totals).every((v) => v.net >= 0));
const sum = summarize(w0);
console.log("totalPop", sum.total);
console.log(
  "core4",
  sum.rows
    .filter((r) => ["Солис", "Гурез", "Элегантия", "Десерти"].includes(r.sys))
    .map((r) => `${r.sys}:${r.pop}`)
    .join(" | "),
);
console.log(
  "top",
  sum.rows
    .slice(0, 12)
    .map((r) => `${r.sys}:${r.pop}`)
    .join(", "),
);
console.log("byRace", sum.byRace);
const legStr = (w0.legions || [])
  .filter((l) => l.factionId === FACTION)
  .reduce((a, l) => a + (l.strength || 0), 0);
console.log("legionStr", legStr);
