/**
 * Белатор: залежи соларита/блюматида + характерная добыча.
 *
 * - чинит мёртвые «соларид-руда» / «соларид» на поясах и планетах
 * - раскидывает map.solari + map.blumatid по ядру / пустыням / добычным мирам
 * - ставит mining-станции на пояса
 * - добавляет шахты на планеты с этими залежами
 *
 * Run: node GMap/scripts/seedBelatorDeposits.mjs
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
const FACTION = "faction_belator";
const uuid = () => crypto.randomUUID();

/** System name → preferred planet deposit set (canonical map.* ids). */
const PLANET_BY_SYS = {
  Солис: ["map.iron", "map.solari", "map.gold", "map.silver", "map.blumatid"],
  Десерти: ["map.iron", "map.minerals", "map.solari", "map.blumatid"],
  Процион: ["map.iron", "map.solari", "map.food", "map.blumatid"],
  Гурез: ["map.iron", "map.titan", "map.minerals", "map.solari"],
  Элегантия: [
    "map.iron",
    "map.biomass",
    "map.food",
    "map.solari",
  ],
  Мегрец: ["map.iron", "map.biomass", "map.food"],
  Регул: ["map.iron", "map.minerals", "map.blumatid", "map.titan"],
  Мерцак: ["map.iron", "map.crystals", "map.gas", "map.blumatid", "map.titan"],
  Велентис: ["map.titan", "map.blumatid", "map.minerals"],
  Адара: ["map.iron", "map.titan", "map.minerals", "map.solari", "map.blumatid"],
  Алиот: ["map.iron", "map.buildplex", "map.gas", "map.solari"],
  Альбирео: ["map.iron", "map.water", "map.solari"],
  Йота: ["map.iron", "map.solari", "map.minerals"],
  Антрес: ["map.iron", "map.solari", "map.blumatid"],
  Алькор: ["map.iron", "map.solari"],
  Альдебар: ["map.iron", "map.minerals"],
  Гамма: ["map.iron", "map.blumatid"],
  Капелла: ["map.iron", "map.food", "map.solari"],
  Каппа: ["map.iron", "map.food"],
  Ню: ["map.iron", "map.food", "map.solari"],
  Поллукс: ["map.iron", "map.minerals", "map.blumatid"],
  Сириус: ["map.iron", "map.solari", "map.crystals"],
  Ригель: ["map.iron", "map.solari", "map.titan"],
  Денеб: ["map.iron", "map.solari", "map.blumatid"],
  Тета: ["map.iron", "map.crystals", "map.solari"],
  Кси: ["map.iron", "map.solari"],
  Ро: ["map.iron", "map.solari", "map.minerals"],
  Кастор: ["map.iron", "map.titan"],
  Альфа: ["map.iron", "map.minerals"],
  Альнаир: ["map.titan", "map.crystals", "map.blumatid"],
  Дубхе: ["map.titan", "map.crystals"],
  Омикрон: ["map.titan", "map.crystals", "map.solari"],
  Пи: ["map.iron", "map.titan"],
  Фи: ["map.iron", "map.solari"],
  "Пепельный Хаб": ["map.iron", "map.minerals"],
};

/** System belts — always include solari/blumatid where lore fits. */
const BELT_BY_SYS = {
  Солис: ["map.iron", "map.titan", "map.crystals", "map.solari"],
  Десерти: ["map.iron", "map.titan", "map.crystals", "map.solari", "map.blumatid"],
  Процион: ["map.solari", "map.iron", "map.blumatid"],
  Гурез: ["map.iron", "map.titan", "map.crystals", "map.solari"],
  Элегантия: ["map.iron", "map.titan", "map.crystals", "map.solari"],
  Мерцак: ["map.iron", "map.titan", "map.gas", "map.blumatid", "map.crystals"],
  Велентис: ["map.blumatid", "map.titan", "map.relics"],
  Адара: ["map.solari", "map.blumatid", "map.titan"],
  Алиот: ["map.solari", "map.iron", "map.gas"],
  Альбирео: ["map.iron", "map.titan", "map.solari"],
  Йота: ["map.titan", "map.crystals", "map.solari"],
  Антрес: ["map.crystals", "map.solari", "map.blumatid"],
  Капелла: ["map.solari", "map.iron"],
  Ню: ["map.crystals", "map.solari"],
  Сириус: ["map.crystals", "map.solari"],
  Ригель: ["map.crystals", "map.solari"],
  Денеб: ["map.crystals", "map.solari", "map.blumatid"],
  Тета: ["map.crystals", "map.solari"],
  Кси: ["map.solari", "map.iron"],
  Ро: ["map.solari", "map.iron"],
  Регул: ["map.titan", "map.crystals", "map.blumatid"],
  Альнаир: ["map.titan", "map.crystals", "map.blumatid"],
  Омикрон: ["map.titan", "map.crystals", "map.solari"],
};

const DEAD_BELT = {
  "соларид-руда": "map.solari",
  "соларит-руда": "map.solari",
  соларид: "map.solari",
  соларит: "map.solari",
  псайрит: "map.anomaly_crystals",
  блюматид: "map.blumatid",
  железо: "map.iron",
  титан: "map.titan",
  кристаллы: "map.crystals",
  газ: "map.gas",
  минералы: "map.minerals",
  золото: "map.gold",
  серебро: "map.silver",
  вода: "map.water",
  пища: "map.food",
  "органическая биомасса": "map.biomass",
  биомасса: "map.biomass",
  стройплексы: "map.buildplex",
  биосмола: "map.biomass",
  пыль: "map.minerals",
  "транзит-пошлина": "map.trade_value",
};

function canonRes(list) {
  const out = [];
  const seen = new Set();
  for (const r of list || []) {
    const id = DEAD_BELT[r] || (String(r).startsWith("map.") ? r : r);
    if (!String(id).startsWith("map.")) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function ensureMine(planet, label) {
  const surface = planet.surfaceBuildings || (planet.surfaceBuildings = []);
  const mines = surface.filter(
    (b) => b.kind === "mine" || b.buildingId === "building.mine",
  );
  const need = Math.max(0, 4 - mines.length);
  for (let i = 0; i < need; i++) {
    surface.push({
      id: uuid(),
      name: `Шахта ${label}`,
      kind: "mine",
      zone: "surface",
      buildingId: "building.mine",
    });
  }
  // Solari catcher when solari present
  const hasSolari = (planet.resources || []).includes("map.solari");
  if (hasSolari) {
    const deep = surface.filter((b) => b.buildingId === "energia.solar_catcher");
    if (deep.length < 1) {
      surface.push({
        id: uuid(),
        name: `Ловец соларита (${label})`,
        kind: "factory",
        zone: "deep",
        buildingId: "energia.solar_catcher",
      });
    }
  }
  // Deep shaft when blumatid present
  const hasBlu = (planet.resources || []).includes("map.blumatid");
  if (hasBlu) {
    const shafts = surface.filter((b) => b.buildingId === "extract.deep_shaft");
    if (shafts.length < 1) {
      surface.push({
        id: uuid(),
        name: `Глубинная выработка (${label})`,
        kind: "mine",
        zone: "deep",
        buildingId: "extract.deep_shaft",
      });
    }
  }
  return need;
}

function ensureBeltMine(sys) {
  const stations = sys.stations || (sys.stations = []);
  const own = stations.filter(
    (s) => s.kind === "mining" && s.factionId === FACTION,
  );
  if (own.length > 0) return 0;
  if (!(sys.resources?.length > 0)) return 0;
  stations.push({
    id: uuid(),
    name: `Поясная шахта · ${sys.name}`,
    kind: "mining",
    factionId: FACTION,
    beltAngle: Math.random() * Math.PI * 2,
  });
  return 1;
}

function patchWorld(world) {
  let planetsTouched = 0;
  let beltsTouched = 0;
  let minesAdded = 0;
  let stationsAdded = 0;
  let solariPlanets = 0;
  let blumatidPlanets = 0;

  for (const sys of world.systems ?? []) {
    if (sys.ownerFactionId !== FACTION) continue;

    // Belt
    const presetBelt = BELT_BY_SYS[sys.name];
    const belt = canonRes(presetBelt || sys.resources || []);
    // Guarantee solari/blumatid on key systems even if preset missed
    if (
      ["Солис", "Десерти", "Процион", "Адара", "Капелла", "Сириус"].includes(
        sys.name,
      ) &&
      !belt.includes("map.solari")
    ) {
      belt.push("map.solari");
    }
    if (
      ["Десерти", "Мерцак", "Велентис", "Регул", "Адара", "Антрес"].includes(
        sys.name,
      ) &&
      !belt.includes("map.blumatid")
    ) {
      belt.push("map.blumatid");
    }
    if (JSON.stringify(belt) !== JSON.stringify(sys.resources || [])) {
      sys.resources = belt;
      beltsTouched++;
    } else {
      sys.resources = belt;
    }

    stationsAdded += ensureBeltMine(sys);

    const presetPlanet = PLANET_BY_SYS[sys.name];
    const planets = sys.planets || [];
    if (!planets.length) continue;

    for (let i = 0; i < planets.length; i++) {
      const p = planets[i];
      let next;
      if (presetPlanet && i === 0) {
        next = [...presetPlanet];
      } else if (presetPlanet && planets.length > 1) {
        // Secondary bodies: lighter slice
        next = canonRes([
          ...(p.resources || []),
          presetPlanet.includes("map.blumatid") ? "map.blumatid" : null,
          presetPlanet.includes("map.solari") ? "map.solari" : null,
          "map.iron",
        ].filter(Boolean));
      } else {
        next = canonRes(p.resources || []);
        if (!next.length) {
          next = ["map.iron", "map.minerals"];
          if (belt.includes("map.solari")) next.push("map.solari");
          if (belt.includes("map.blumatid")) next.push("map.blumatid");
        } else {
          if (belt.includes("map.solari") && !next.includes("map.solari")) {
            next.push("map.solari");
          }
          if (belt.includes("map.blumatid") && !next.includes("map.blumatid")) {
            next.push("map.blumatid");
          }
        }
      }
      // Dedup
      next = [...new Set(next)];
      p.resources = next;
      planetsTouched++;
      if (next.includes("map.solari")) solariPlanets++;
      if (next.includes("map.blumatid")) blumatidPlanets++;
      minesAdded += ensureMine(p, p.name || sys.name);
    }
  }

  return {
    planetsTouched,
    beltsTouched,
    minesAdded,
    stationsAdded,
    solariPlanets,
    blumatidPlanets,
  };
}

for (const file of WORLD_FILES) {
  if (!fs.existsSync(file)) {
    console.log("skip", path.relative(ROOT, file));
    continue;
  }
  const world = JSON.parse(fs.readFileSync(file, "utf8"));
  const stats = patchWorld(world);
  fs.writeFileSync(file, JSON.stringify(world, null, 2));
  console.log(path.relative(ROOT, file), stats);
}
console.log("done");
