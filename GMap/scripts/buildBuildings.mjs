/**
 * Generate content/core/buildings.json from a compact JS catalog.
 * Costs/yields follow content/core/economy_balance.json (even-growth curve).
 * Converters use `flow_convert` (RPS A→B→C→D→E→F→A); extractors use `yield_flat`.
 * Dual costs: legacy metal/supply + category-currency tax by tier.
 *
 * Re-runnable: overwrites buildings.json.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "content/core/buildings.json");
const BAL = JSON.parse(
  fs.readFileSync(path.join(ROOT, "content/core/economy_balance.json"), "utf8"),
);

const CAT_CURRENCY = {
  A: "currency.extracta",
  B: "currency.materia",
  C: "currency.industria",
  D: "currency.energia",
  E: "currency.bios",
  F: "currency.cognitio",
};

/** RPS primary edge: from category → to category at tier floor. */
function flowConvert(fromCat, toCat, tierMin = 1) {
  const t = `>=${Math.max(1, Number(tierMin) || 1)}`;
  return {
    effect: "flow_convert",
    args: {
      from: { category: fromCat, tier: t },
      to: { category: toCat, tier: t },
    },
  };
}

function yieldFlat(currency, amount) {
  return { effect: "yield_flat", args: { currency, amount } };
}

function capacityAdd(category, tier, amount) {
  return { effect: "capacity_add", args: { category, tier, amount } };
}

/** Even-growth cost: metal/supply by tier + optional extras + category tax. */
function tierCost(category, tier, extras = {}, mult = 1) {
  const t = String(Math.max(1, Math.min(10, Number(tier) || 1)));
  const metal = Math.round((BAL.buildings.metalByTier[t] || 15) * mult);
  const supply = Math.max(1, Math.round(metal * (BAL.buildings.supplyRatio || 0.42)));
  const tax = BAL.buildings.categoryTaxByTier[t] || 0;
  const cost = {
    "currency.metal": metal,
    "currency.supply": supply,
    ...extras,
  };
  if (tax > 0 && CAT_CURRENCY[category]) {
    const cur = CAT_CURRENCY[category];
    cost[cur] = (cost[cur] || 0) + tax;
  }
  return cost;
}

function tierYield(tier, volume = false) {
  const t = String(Math.max(1, Math.min(10, Number(tier) || 1)));
  const base = BAL.buildings.yieldFlatByTier[t] || 1;
  if (!volume) return base;
  return Math.max(base + 1, Math.floor(base * (BAL.buildings.volumeBonusMult || 1.5)));
}

const B = {
  // ===== LEGACY 13 (preserved with cost/effects; slot metadata added) =====
  "building.residential": {
    id: "building.residential", kind: "residential", zone: "surface", name: "Жилой район", ap: 1,
    category: "E", tier: 1, faction: "generic",
    cost: tierCost("E", 1),
    effects: [{ effect: "pop_cap_add", args: { amount: 15 } }],
    slots: [{ role: "structure", require: { category: "B", tier: ">=1" }, count: 6 }],
    upkeep_slots: [{ require: { category: "E", tier: ">=1" }, count: 1, per: "turn" }],
    signature: "+pop_cap", tradeoff: "требует Bios upkeep"
  },
  "building.farm": {
    id: "building.farm", kind: "farm", zone: "surface", name: "Агрокомплекс", ap: 1,
    category: "E", tier: 3, faction: "generic",
    cost: tierCost("E", 3, { "currency.energia": 2 }),
    effects: [flowConvert("D", "E", 1)],
    slots: [{ role: "structure", require: { category: "B", tier: ">=1" }, count: 4 }],
    upkeep_slots: [{ require: { category: "D", tier: ">=1" }, count: 1, per: "turn" }],
    signature: "D→E: Energia → Bios T1–T3 (пища)", tradeoff: "занимает плодородную землю (-1 Materia cap)"
  },
  "building.mine": {
    id: "building.mine", kind: "mine", zone: "surface", name: "Шахта", ap: 1,
    category: "A", tier: 3, faction: "generic",
    cost: tierCost("A", 3),
    effects: [yieldFlat("currency.extracta", tierYield(3))],
    slots: [{ role: "structure", require: { category: "B", tier: ">=1" }, count: 4 }],
    upkeep_slots: [{ require: { category: "D", tier: ">=1" }, count: 1, per: "turn" }],
    signature: "Добывает Extracta T1–T3", tradeoff: "-1 Bios cap"
  },
  "building.factory": {
    id: "building.factory", kind: "factory", zone: "surface", name: "Завод", ap: 1,
    category: "C", tier: 3, faction: "generic",
    cost: tierCost("C", 3, { "currency.materia": 3 }),
    effects: [flowConvert("B", "C", 1)],
    slots: [{ role: "structure", require: { category: "B", tier: ">=2" }, count: 6 }],
    upkeep_slots: [{ require: { category: "D", tier: ">=2" }, count: 2, per: "turn" }],
    signature: "B→C: Materia+Bios → Industria слоты T1–T3", tradeoff: "-1 Energia upkeep"
  },
  "building.lab": {
    id: "building.lab", kind: "lab", zone: "surface", name: "Лаборатория", ap: 1,
    category: "F", tier: 3, faction: "generic",
    cost: tierCost("F", 3, { "currency.bios": 2 }),
    effects: [flowConvert("E", "F", 1)],
    slots: [{ role: "structure", require: { category: "B", tier: ">=2" }, count: 5 }],
    upkeep_slots: [{ require: { category: "E", tier: ">=2" }, count: 2, per: "turn" }],
    signature: "E→F: Bios → Cognitio T1–T3 (базовая наука)", tradeoff: "-1 E upkeep (учёные едят)"
  },
  "building.barracks": {
    id: "building.barracks", kind: "barracks", zone: "surface", name: "Казарма", ap: 1,
    category: "C", tier: 2, faction: "generic",
    cost: tierCost("C", 2),
    effects: [capacityAdd("C", 2, 1)],
    slots: [{ role: "structure", require: { category: "B", tier: ">=1" }, count: 4 }],
    upkeep_slots: [{ require: { category: "E", tier: ">=1" }, count: 1, per: "turn" }],
    signature: "Слоты десанта (милиция→линия); early force-gate", tradeoff: "-1 мораль в мирное время"
  },
  "building.capitol": {
    id: "building.capitol", kind: "capitol", zone: "surface", name: "Администрация", ap: 1,
    category: "C", tier: 5, faction: "generic", maxPerPlanet: 1,
    cost: tierCost("C", 5),
    effects: [{ effect: "pop_cap_add", args: { amount: 10 } }, capacityAdd("C", 3, 1)],
    slots: [{ role: "structure", require: { category: "B", tier: ">=3" }, count: 8 }],
    upkeep_slots: [{ require: { category: "E", tier: ">=3" }, count: 2, per: "turn" }],
    signature: "+pop_cap, +AP/ход, налоги", tradeoff: "1 на планету"
  },
  "building.defense": {
    id: "building.defense", kind: "defense", zone: "surface", name: "Оборона", ap: 1,
    category: "B", tier: 4, faction: "generic",
    cost: tierCost("B", 4),
    effects: [capacityAdd("B", 3, 1)],
    slots: [{ role: "hull", require: { properties: ["strong"], tier: ">=3" }, count: 6 }],
    upkeep_slots: [{ require: { category: "D", tier: ">=2" }, count: 1, per: "turn" }],
    signature: "Планетарный щит/орудия; +capacity B", tradeoff: "-1 Energia upkeep"
  },
  "building.spaceport": {
    id: "building.spaceport", kind: "spaceport", zone: "orbital", name: "Космопорт", ap: 1,
    category: "C", tier: 3, faction: "generic", maxPerPlanet: 1,
    cost: tierCost("C", 3),
    effects: [yieldFlat("currency.industria", 1), capacityAdd("C", 2, 1)],
    slots: [{ role: "structure", require: { category: "B", tier: ">=2" }, count: 5 }],
    upkeep_slots: [{ require: { category: "D", tier: ">=2" }, count: 1, per: "turn" }],
    signature: "Открывает орбиту / торговлю; free-tier", tradeoff: "1 на планету"
  },
  "building.shipyard": {
    id: "building.shipyard", kind: "shipyard", zone: "orbital", name: "Верфь", ap: 1,
    category: "C", tier: 3, faction: "generic",
    cost: tierCost("C", 3, { "currency.materia": 2 }),
    effects: [flowConvert("B", "C", 2)],
    slots: [{ role: "structure", require: { category: "B", tier: ">=2" }, count: 6 }],
    upkeep_slots: [{ require: { category: "D", tier: ">=2" }, count: 2, per: "turn" }],
    signature: "Производство флота (scout→corvette+); early force-gate", tradeoff: "нужен космопорт желателен"
  },
  "building.habitat": {
    id: "building.habitat", kind: "habitat", zone: "orbital", name: "Орбитальный хабитат", ap: 1,
    category: "E", tier: 4, faction: "generic",
    cost: tierCost("E", 4),
    effects: [{ effect: "pop_cap_add", args: { amount: 18 } }],
    slots: [{ role: "structure", require: { category: "B", tier: ">=3" }, count: 6 }],
    upkeep_slots: [{ require: { category: "D", tier: ">=3" }, count: 2, per: "turn" }],
    signature: "+pop_cap без занятия surface", tradeoff: "-1 E upkeep, -1 Materia upkeep"
  },
  "building.orbital_defense": {
    id: "building.orbital_defense", kind: "defense", zone: "orbital", name: "Орбитальная оборона", ap: 1,
    category: "D", tier: 5, faction: "generic",
    cost: tierCost("D", 5),
    effects: [capacityAdd("D", 3, 1)],
    slots: [{ role: "weapon", require: { properties: ["weapon_amp"], tier: ">=3" }, count: 4 }],
    upkeep_slots: [{ require: { category: "D", tier: ">=3" }, count: 2, per: "turn" }],
    signature: "Щит/орудия системы; +capacity D", tradeoff: "-1 Energia upkeep"
  },
  "building.orbital_lab": {
    id: "building.orbital_lab", kind: "lab", zone: "orbital", name: "Орбитальная лаборатория", ap: 1,
    category: "F", tier: 5, faction: "generic",
    cost: tierCost("F", 5, { "currency.bios": 3 }),
    effects: [flowConvert("E", "F", 3)],
    slots: [{ role: "structure", require: { category: "B", tier: ">=3" }, count: 6 }],
    upkeep_slots: [{ require: { category: "D", tier: ">=3" }, count: 2, per: "turn" }],
    signature: "E→F: Cognitio T4–T5 без штрафа Bios", tradeoff: "орбитальный слот"
  },

  // ===== A — EXTRACTA (8) =====
  "extract.deep_shaft": {
    id: "extract.deep_shaft", kind: "mine", zone: "subsurface", name: "Глубинный ствол", ap: 1,
    category: "A", tier: 6, faction: "generic",
    cost: tierCost("A", 6, { "currency.industria": 3 }),
    effects: [
      yieldFlat("currency.extracta", tierYield(6)),
      flowConvert("F", "A", 4),
    ],
    slots: [{ role: "structure", require: { category: "B", tier: ">=4" }, count: 6 }],
    upkeep_slots: [{ require: { category: "D", tier: ">=4" }, count: 2, per: "turn" }],
    signature: "Extracta T4–T6 + soft F→A", tradeoff: "риск обвала"
  },
  "extract.strip_pit": {
    id: "extract.strip_pit", kind: "mine", zone: "surface", name: "Карьер-стрип", ap: 1,
    category: "A", tier: 3, faction: "generic",
    cost: tierCost("A", 3, {}, 1.2),
    effects: [yieldFlat("currency.extracta", tierYield(3, true))],
    slots: [{ role: "structure", require: { category: "B", tier: ">=2" }, count: 4 }],
    upkeep_slots: [
      { require: { category: "D", tier: ">=2" }, count: 1, per: "turn" },
      { require: { category: "E", tier: ">=1" }, count: 1, per: "turn" },
    ],
    signature: "Объёмная добыча Extracta (+50% к T3 yield)", tradeoff: "дороже шахты, жрёт Bios upkeep (истощает почву)"
  },
  "extract.gas_well": {
    id: "extract.gas_well", kind: "mine", zone: "subsurface", name: "Газовая скважина", ap: 1,
    category: "A", tier: 3, faction: "generic",
    cost: tierCost("A", 3),
    effects: [yieldFlat("currency.energia", tierYield(3))],
    slots: [{ role: "structure", require: { category: "B", tier: ">=2" }, count: 4 }],
    upkeep_slots: [{ require: { category: "D", tier: ">=2" }, count: 1, per: "turn" }],
    signature: "Добывает D-газы T1–T3", tradeoff: "только на газоносных биомах",
    biome_restrictions: ["gas_giant", "swamp", "volcanic"]
  },
  "extract.asteroid_harvester": {
    id: "extract.asteroid_harvester", kind: "mine", zone: "orbital", name: "Астероидный гарвец", ap: 1,
    category: "A", tier: 7, faction: "generic",
    cost: tierCost("A", 7, { "currency.industria": 4 }),
    effects: [
      yieldFlat("currency.extracta", tierYield(7)),
      yieldFlat("currency.materia", 1),
    ],
    slots: [{ role: "structure", require: { category: "B", tier: ">=4" }, count: 8 }],
    upkeep_slots: [{ require: { category: "D", tier: ">=4" }, count: 2, per: "turn" }],
    signature: "Добывает A и Materia T4–T7 без занятой поверхности", tradeoff: "нужен космопорт"
  },
  "extract.anomaly_collector": {
    id: "extract.anomaly_collector", kind: "mine", zone: "deep", name: "Аномальный коллектор", ap: 2,
    category: "A", tier: 10, faction: "generic", maxPerSystem: 1,
    cost: tierCost("A", 10, { "currency.cognitio": 6, "currency.energia": 4 }),
    effects: [
      yieldFlat("currency.extracta", tierYield(10)),
      flowConvert("F", "A", 8),
    ],
    slots: [{ role: "structure", require: { category: "B", tier: ">=6" }, count: 10 }],
    upkeep_slots: [{ require: { category: "D", tier: ">=6" }, count: 3, per: "turn" }],
    signature: "Добывает A T8–T10 (тёмная материя, блакула); F→A", tradeoff: "1 на систему, только аномальные системы"
  },
  "extract.slurry_plant": {
    id: "extract.slurry_plant", kind: "factory", zone: "surface", name: "Шлам-установка", ap: 1,
    category: "A", tier: 2, faction: "generic",
    cost: tierCost("A", 2),
    effects: [yieldFlat("currency.extracta", tierYield(2))],
    slots: [{ role: "structure", require: { category: "B", tier: ">=1" }, count: 3 }],
    upkeep_slots: [{ require: { category: "D", tier: ">=1" }, count: 1, per: "turn" }],
    signature: "Перерабатывает хвосты в Extracta T2", tradeoff: "-1 мораль, -1 лекарственные"
  },
  "extract.relays": {
    id: "extract.relays", kind: "relay", zone: "orbital", name: "Дрон-реле", ap: 1,
    category: "A", tier: 4, faction: "generic",
    cost: tierCost("A", 4, { "currency.industria": 2 }),
    effects: [capacityAdd("A", 2, 2)],
    slots: [{ role: "structure", require: { category: "B", tier: ">=3" }, count: 4 }],
    upkeep_slots: [{ require: { category: "D", tier: ">=3" }, count: 1, per: "turn" }],
    signature: "+capacity A (буст добычи системы)", tradeoff: "сам почти не добывает"
  },

  // ===== B — MATERIA (7) =====
  "materia.smelter": {
    id: "materia.smelter", kind: "factory", zone: "surface", name: "Плавильня", ap: 1,
    category: "B", tier: 3, faction: "generic",
    cost: tierCost("B", 3, { "currency.extracta": 4 }),
    effects: [flowConvert("A", "B", 1)],
    slots: [{ role: "structure", require: { category: "B", tier: ">=2" }, count: 5 }],
    upkeep_slots: [{ require: { category: "D", tier: ">=2" }, count: 2, per: "turn" }],
    signature: "A→B: Extracta T1–T3 → Materia T1–T3", tradeoff: "-1 Bios cap (дым)"
  },
  "materia.rolling_mill": {
    id: "materia.rolling_mill", kind: "factory", zone: "surface", name: "Прокатный цех", ap: 1,
    category: "B", tier: 4, faction: "generic",
    cost: tierCost("B", 4),
    effects: [capacityAdd("B", 3, 2)],
    slots: [{ role: "structure", require: { category: "B", tier: ">=3" }, count: 6 }],
    upkeep_slots: [{ require: { category: "D", tier: ">=3" }, count: 2, per: "turn" }],
    signature: "Повышает capacity потока B на +2 (не rate)", tradeoff: "требует Materia T3 на стройку"
  },
  "materia.crystal_workshop": {
    id: "materia.crystal_workshop", kind: "factory", zone: "surface", name: "Кристальная мастерская", ap: 1,
    category: "B", tier: 5, faction: "generic",
    cost: tierCost("B", 5, { "currency.extracta": 5 }),
    effects: [flowConvert("A", "B", 3)],
    slots: [{ role: "structure", require: { category: "B", tier: ">=3" }, count: 6 }],
    upkeep_slots: [{ require: { category: "D", tier: ">=3" }, count: 2, per: "turn" }],
    signature: "A→B: B T3–T5 (кристаллы, фокусирующие)", tradeoff: "только при наличии кристалльного месторождения"
  },
  "materia.alloy_lab": {
    id: "materia.alloy_lab", kind: "lab", zone: "surface", name: "Лаб. сплавов", ap: 1,
    category: "B", tier: 6, faction: "generic",
    cost: tierCost("B", 6, { "currency.cognitio": 2 }),
    effects: [
      flowConvert("A", "B", 4),
      { effect: "unlock_tech_tier", args: { category: "B", to: 6 } },
    ],
    slots: [{ role: "structure", require: { category: "B", tier: ">=4" }, count: 8 }],
    upkeep_slots: [{ require: { category: "F", tier: ">=3" }, count: 2, per: "turn" }],
    signature: "A→B T4–T6 + unlock Materia tier 6", tradeoff: "-2 Cognitio upkeep (нужны учёные)"
  },
  "materia.metamaterial_forge": {
    id: "materia.metamaterial_forge", kind: "factory", zone: "orbital", name: "Метаматериальная фабрика", ap: 1,
    category: "B", tier: 9, faction: "generic",
    cost: tierCost("B", 9, { "currency.extracta": 8, "currency.energia": 4 }),
    effects: [flowConvert("A", "B", 7)],
    slots: [{ role: "structure", require: { category: "B", tier: ">=6" }, count: 10 }],
    upkeep_slots: [{ require: { category: "D", tier: ">=6" }, count: 3, per: "turn" }],
    signature: "A→B: B T7–T9 (архит, иссридил, клакс)", tradeoff: "требует вакуума, -2 Energia upkeep"
  },
  "materia.refinery_gas": {
    id: "materia.refinery_gas", kind: "factory", zone: "surface", name: "Газовый рафинер", ap: 1,
    category: "B", tier: 2, faction: "generic",
    cost: tierCost("B", 2, { "currency.energia": 2 }),
    effects: [flowConvert("D", "B", 1)],
    slots: [{ role: "structure", require: { category: "B", tier: ">=1" }, count: 4 }],
    upkeep_slots: [{ require: { category: "D", tier: ">=1" }, count: 1, per: "turn" }],
    signature: "D→B: D-газ T1–T2 → B-катализатор T2", tradeoff: "-1 Bios cap (токсичные отходы)"
  },
  "materia.mint": {
    id: "materia.mint", kind: "capitol", zone: "surface", name: "Монетный двор", ap: 1,
    category: "B", tier: 5, faction: "generic", maxPerPlanet: 1,
    cost: tierCost("B", 5, { "currency.materia": 2 }),
    effects: [capacityAdd("B", 5, 2), yieldFlat("currency.materia", 1)],
    slots: [{ role: "structure", require: { properties: [], tier: ">=5" }, count: 6 }],
    upkeep_slots: [{ require: { category: "E", tier: ">=3" }, count: 2, per: "turn" }],
    signature: "B T5 → торговое значение + лёгкий Materia yield", tradeoff: "1 на планету, требует закон «Валюта»"
  },

  // ===== C — INDUSTRIA (6) =====
  "industria.assembly": {
    id: "industria.assembly", kind: "factory", zone: "surface", name: "Сборочный комплекс", ap: 1,
    category: "C", tier: 5, faction: "generic",
    cost: tierCost("C", 5, { "currency.materia": 4, "currency.bios": 2 }),
    effects: [flowConvert("B", "C", 3)],
    slots: [{ role: "structure", require: { category: "B", tier: ">=4" }, count: 8 }],
    upkeep_slots: [{ require: { category: "D", tier: ">=4" }, count: 2, per: "turn" }],
    signature: "B→C: открывает слоты T3–T5 (юниты/корабли среднего класса)", tradeoff: "требует C T3 (стройплексы)"
  },
  "industria.nanoforge": {
    id: "industria.nanoforge", kind: "factory", zone: "orbital", name: "Наносборочный цех", ap: 1,
    category: "C", tier: 8, faction: "generic",
    cost: tierCost("C", 8, { "currency.materia": 6, "currency.bios": 3 }),
    effects: [flowConvert("B", "C", 6)],
    slots: [{ role: "structure", require: { category: "B", tier: ">=6" }, count: 10 }],
    upkeep_slots: [{ require: { category: "D", tier: ">=6" }, count: 3, per: "turn" }],
    signature: "B→C: слоты T6–T8 (наниты, живой металл)", tradeoff: "требует C T6+, -2 Energia upkeep"
  },
  "industria.modular_yard": {
    id: "industria.modular_yard", kind: "factory", zone: "surface", name: "Модульная стройка", ap: 1,
    category: "C", tier: 4, faction: "generic",
    cost: tierCost("C", 4),
    effects: [
      { effect: "cost_mult", args: { mult: BAL.buildings.buildCostMultDefault || 0.9, tag: "build" } },
      capacityAdd("C", 2, 1),
    ],
    slots: [{ role: "structure", require: { category: "B", tier: ">=3" }, count: 5 }],
    upkeep_slots: [{ require: { category: "D", tier: ">=3" }, count: 1, per: "turn" }],
    signature: "−10% cost стройки на планете + capacity C", tradeoff: "сам почти не производит"
  },
  "industria.repair_dock": {
    id: "industria.repair_dock", kind: "shipyard", zone: "orbital", name: "Ремонтный док", ap: 1,
    category: "C", tier: 5, faction: "generic",
    cost: tierCost("C", 5, { "currency.materia": 3 }),
    effects: [capacityAdd("C", 4, 1)],
    slots: [{ role: "structure", require: { category: "B", tier: ">=4" }, count: 6 }],
    upkeep_slots: [{ require: { category: "D", tier: ">=4" }, count: 2, per: "turn" }],
    signature: "Ремонт флота + capacity C", tradeoff: "требует Materia того же tier, что и корпус"
  },

  // ===== D — ENERGIA (7) =====
  "energia.thermal_plant": {
    id: "energia.thermal_plant", kind: "factory", zone: "surface", name: "Теплоэлектростанция", ap: 1,
    category: "D", tier: 2, faction: "generic",
    cost: tierCost("D", 2, { "currency.industria": 2 }),
    effects: [flowConvert("C", "D", 1)],
    slots: [{ role: "structure", require: { category: "B", tier: ">=1" }, count: 4 }],
    upkeep_slots: [{ require: { properties: ["fuel"], tier: ">=1" }, count: 1, per: "turn" }],
    signature: "C→D: Industria → Energia T1–T2 (массовая энергия)", tradeoff: "-1 Bios cap (выбросы)"
  },
  "energia.geo_hydro": {
    id: "energia.geo_hydro", kind: "factory", zone: "surface", name: "Гео/Гидро станция", ap: 1,
    category: "D", tier: 4, faction: "generic",
    cost: tierCost("D", 4, { "currency.materia": 2 }),
    effects: [yieldFlat("currency.energia", tierYield(4))],
    slots: [{ role: "structure", require: { category: "B", tier: ">=2" }, count: 5 }],
    upkeep_slots: [],
    signature: "D T2–T4, без штрафа Bios (природный yield)", tradeoff: "только на геотермальных/океанических биомах",
    biome_restrictions: ["ocean", "volcanic", "mountainous"]
  },
  "energia.fusion_reactor": {
    id: "energia.fusion_reactor", kind: "factory", zone: "subsurface", name: "Термояд", ap: 1,
    category: "D", tier: 6, faction: "generic",
    cost: tierCost("D", 6, { "currency.industria": 4, "currency.materia": 3 }),
    effects: [flowConvert("C", "D", 5)],
    slots: [{ role: "structure", require: { category: "B", tier: ">=4" }, count: 8 }],
    upkeep_slots: [{ require: { properties: ["fuel"], tier: ">=5" }, count: 1, per: "turn" }],
    signature: "C→D: D T5–T6 (гелий-3, изотопы)", tradeoff: "требует техн. Термояд"
  },
  "energia.antimatter_plant": {
    id: "energia.antimatter_plant", kind: "factory", zone: "orbital", name: "Антиматерия-реактор", ap: 2,
    category: "D", tier: 8, faction: "generic", maxPerSystem: 1,
    cost: tierCost("D", 8, { "currency.industria": 6, "currency.cognitio": 3 }),
    effects: [flowConvert("C", "D", 7)],
    slots: [{ role: "structure", require: { category: "B", tier: ">=6" }, count: 10 }],
    upkeep_slots: [{ require: { properties: ["energy"], tier: ">=7" }, count: 2, per: "turn" }],
    signature: "C→D: D T8 (антиматерия) — открывает корабли T8", tradeoff: "1 на систему, требует Cognitio T7"
  },
  "energia.solar_catcher": {
    id: "energia.solar_catcher", kind: "factory", zone: "deep", name: "Солнечный ловец", ap: 3,
    category: "D", tier: 7, faction: "generic", maxPerSystem: 1,
    cost: tierCost("D", 7, { "currency.materia": 6 }, 1.15),
    effects: [yieldFlat("currency.energia", tierYield(7, true))],
    slots: [{ role: "structure", require: { category: "B", tier: ">=6" }, count: 12 }],
    upkeep_slots: [],
    signature: "Мегапроект: объёмный D yield без топлива; питает систему", tradeoff: "требует нестабильное ядро звезды; риск взрыва"
  },
  "energia.plasma_condenser": {
    id: "energia.plasma_condenser", kind: "factory", zone: "orbital", name: "Плазмо-конденсатор", ap: 1,
    category: "D", tier: 6, faction: "generic",
    cost: tierCost("D", 6, { "currency.industria": 3 }),
    effects: [flowConvert("C", "D", 4)],
    slots: [{ role: "structure", require: { category: "B", tier: ">=4" }, count: 6 }],
    upkeep_slots: [{ require: { properties: ["fuel"], tier: ">=4" }, count: 1, per: "turn" }],
    signature: "C→D: Energia+газ → плазмоиды (D T6)", tradeoff: "-1 Materia upkeep"
  },
  "energia.zro_reactor": {
    id: "energia.zro_reactor", kind: "factory", zone: "surface", name: "Зро-реактор", ap: 1,
    category: "D", tier: 7, faction: "generic",
    cost: tierCost("D", 7, { "currency.cognitio": 2 }),
    effects: [
      yieldFlat("currency.energia", tierYield(7)),
      yieldFlat("currency.cognitio", 1),
    ],
    slots: [{ role: "structure", require: { properties: ["psion_emit"], tier: ">=6" }, count: 6 }],
    upkeep_slots: [{ require: { properties: ["psion_emit"], tier: ">=6" }, count: 1, per: "turn" }],
    signature: "D T7 (зро) + буст псион-потока F", tradeoff: "только при наличии зро-месторождения, -1 мораль"
  },

  // ===== E — BIOS (7) =====
  "bios.hydroponics": {
    id: "bios.hydroponics", kind: "farm", zone: "orbital", name: "Гидропоника", ap: 1,
    category: "E", tier: 5, faction: "generic",
    cost: tierCost("E", 5, { "currency.energia": 3 }),
    effects: [flowConvert("D", "E", 3)],
    slots: [{ role: "structure", require: { category: "B", tier: ">=3" }, count: 6 }],
    upkeep_slots: [{ require: { category: "D", tier: ">=3" }, count: 2, per: "turn" }],
    signature: "D→E: E T3–T5, не занимает surface", tradeoff: "-1 вода/ход"
  },
  "bios.biolab": {
    id: "bios.biolab", kind: "lab", zone: "surface", name: "Биолаборатория", ap: 1,
    category: "E", tier: 6, faction: "generic",
    cost: tierCost("E", 6, { "currency.energia": 3, "currency.cognitio": 2 }),
    effects: [
      flowConvert("D", "E", 4),
      yieldFlat("currency.bios", 1),
    ],
    slots: [{ role: "structure", require: { category: "B", tier: ">=3" }, count: 6 }],
    upkeep_slots: [{ require: { category: "F", tier: ">=3" }, count: 1, per: "turn" }],
    signature: "D→E: E T4–T6 (лекарства, биокатализаторы)", tradeoff: "требует Cognitio T3"
  },
  "bios.medical": {
    id: "bios.medical", kind: "residential", zone: "surface", name: "Медицинский комплекс", ap: 1,
    category: "E", tier: 4, faction: "generic",
    cost: tierCost("E", 4),
    effects: [
      { effect: "stability_add", args: { amount: 1 } },
      capacityAdd("E", 3, 1),
    ],
    slots: [{ role: "structure", require: { category: "B", tier: ">=3" }, count: 5 }],
    upkeep_slots: [{ require: { category: "E", tier: ">=3" }, count: 1, per: "turn" }],
    signature: "+мораль, +рост, capacity E", tradeoff: "-1 E upkeep (медикаменты)"
  },
  "bios.clone_vats": {
    id: "bios.clone_vats", kind: "residential", zone: "subsurface", name: "Клональные ванны", ap: 1,
    category: "E", tier: 8, faction: "generic",
    cost: tierCost("E", 8, { "currency.industria": 3 }),
    effects: [
      { effect: "pop_growth_mult", args: { mult: 1.35 } },
      capacityAdd("E", 5, 2),
    ],
    slots: [{ role: "structure", require: { category: "B", tier: ">=5" }, count: 8 }],
    upkeep_slots: [{ require: { category: "E", tier: ">=5" }, count: 2, per: "turn" }],
    signature: "E T6–T8 (быстрый рост населения)", tradeoff: "-2 мораль, требует закон об этике"
  },
  "bios.extreme_station": {
    id: "bios.extreme_station", kind: "residential", zone: "surface", name: "Экстремофильная станция", ap: 1,
    category: "E", tier: 6, faction: "generic",
    cost: tierCost("E", 6),
    effects: [
      { effect: "habitability_mult", args: { mult: 1.25 } },
      capacityAdd("E", 4, 1),
    ],
    slots: [{ role: "structure", require: { category: "B", tier: ">=4" }, count: 6 }],
    upkeep_slots: [{ require: { category: "D", tier: ">=4" }, count: 2, per: "turn" }],
    signature: "Заселяет негостеприимные биомы (T6 ферменты)", tradeoff: "только на экстремальных биомах",
    biome_restrictions: ["volcanic", "ice", "toxic", "desert"]
  },
  "bios.leviathan_sanctuary": {
    id: "bios.leviathan_sanctuary", kind: "farm", zone: "deep", name: "Санctуарий левиафана", ap: 2,
    category: "E", tier: 8, faction: "generic", maxPerSystem: 1,
    cost: tierCost("E", 8, { "currency.energia": 4 }),
    effects: [
      flowConvert("D", "E", 6),
      yieldFlat("currency.bios", 2),
    ],
    slots: [{ role: "structure", require: { category: "B", tier: ">=6" }, count: 10 }],
    upkeep_slots: [{ require: { category: "E", tier: ">=6" }, count: 2, per: "turn" }],
    signature: "D→E: E T8 (гидромель, солариевая вода) из ихор-источника", tradeoff: "1 на систему, требует мирный договор с левиафаном"
  },

  // ===== F — COGNITIO (6) =====
  "cognitio.archaeology": {
    id: "cognitio.archaeology", kind: "lab", zone: "surface", name: "Археологический институт", ap: 1,
    category: "F", tier: 5, faction: "generic",
    cost: tierCost("F", 5, { "currency.bios": 3 }),
    effects: [
      flowConvert("E", "F", 3),
      yieldFlat("currency.cognitio", 1),
    ],
    slots: [{ role: "structure", require: { category: "B", tier: ">=3" }, count: 6 }],
    upkeep_slots: [{ require: { category: "E", tier: ">=3" }, count: 2, per: "turn" }],
    signature: "E→F: F T5 (малые артефакты) → буст исследований", tradeoff: "только на реликтовых биомах",
    biome_restrictions: ["artifact", "ruin"]
  },
  "cognitio.psi_temple": {
    id: "cognitio.psi_temple", kind: "lab", zone: "surface", name: "Псион-храм", ap: 1,
    category: "F", tier: 8, faction: "generic",
    cost: tierCost("F", 8, { "currency.bios": 4, "currency.energia": 3 }),
    effects: [
      flowConvert("E", "F", 6),
      { effect: "unlock_property", args: { property: "psion_emit" } },
    ],
    slots: [{ role: "structure", require: { properties: ["psion_store"], tier: ">=6" }, count: 6 }],
    upkeep_slots: [{ require: { properties: ["psion_emit"], tier: ">=6" }, count: 1, per: "turn" }],
    signature: "E→F: F T7–T8 + unlock psion_emit", tradeoff: "-2 мораль не-псиоников, требует расу псиоников"
  },
  "cognitio.anomaly_detector": {
    id: "cognitio.anomaly_detector", kind: "lab", zone: "orbital", name: "Аномальный детектор", ap: 1,
    category: "F", tier: 7, faction: "generic",
    cost: tierCost("F", 7),
    effects: [yieldFlat("currency.cognitio", 2), capacityAdd("F", 5, 1)],
    slots: [{ role: "structure", require: { category: "B", tier: ">=4" }, count: 6 }],
    upkeep_slots: [{ require: { category: "D", tier: ">=4" }, count: 2, per: "turn" }],
    signature: "Аномальные события T5–T7 + Cognitio yield", tradeoff: "-1 Energia upkeep"
  },
  "cognitio.archive": {
    id: "cognitio.archive", kind: "lab", zone: "deep", name: "Архив Древних", ap: 3,
    category: "F", tier: 9, faction: "generic", maxPerSystem: 1,
    cost: tierCost("F", 9, { "currency.bios": 5 }),
    effects: [
      flowConvert("E", "F", 7),
      { effect: "unlock_tech_tier", args: { category: "F", to: 9 } },
    ],
    slots: [
      { role: "knowledge", require: { category: "F", tier: ">=7" }, count: 5 },
      { role: "relic", require: { properties: ["info_store"], tier: ">=7" }, count: 2 }
    ],
    upkeep_slots: [{ require: { category: "E", tier: ">=5" }, count: 2, per: "turn" }],
    signature: "E→F: unlock Cognitio tier 9", tradeoff: "1 на систему, требует Cognitio T7"
  },
  "cognitio.astral_loom": {
    id: "cognitio.astral_loom", kind: "relay", zone: "orbital", name: "Астральный ткач", ap: 1,
    category: "F", tier: 6, faction: "generic",
    cost: tierCost("F", 6, { "currency.energia": 2 }),
    effects: [flowConvert("E", "F", 5)],
    slots: [{ role: "structure", require: { properties: ["psion_emit"], tier: ">=5" }, count: 5 }],
    upkeep_slots: [{ require: { category: "D", tier: ">=4" }, count: 1, per: "turn" }],
    signature: "E→F: F T6 (астральные нити) → дальняя связь между системами", tradeoff: "требует Cognitio T5 на обеих концах"
  },

  // ===== MEGAPROJECTS + FACTION VARIANTS (5) =====
  "mega.gate": {
    id: "mega.gate", kind: "relay", zone: "deep", name: "Межпланетарные Врата", ap: 3,
    category: "F", tier: 8, faction: "generic", maxPerSystem: 1,
    cost: tierCost("F", 8, { "currency.energia": 6 }, 1.2),
    effects: [
      { effect: "unlock_property", args: { property: "corridor_open" } },
      capacityAdd("F", 7, 1),
    ],
    slots: [
      { role: "structure", require: { category: "B", tier: ">=6" }, count: 8 },
      { role: "corridor", require: { properties: ["corridor_open"], tier: ">=7" }, count: 2 }
    ],
    upkeep_slots: [{ require: { category: "D", tier: ">=6" }, count: 3, per: "turn" }],
    signature: "Мгновенный перенос флота + unlock corridor_open", tradeoff: "требует Cognitio T6 + Energia T6 на обоих концах"
  },
  "mega.gate.damyl": {
    id: "mega.gate.damyl", base: "mega.gate", kind: "relay", zone: "deep", name: "Дамильские врата",
    faction: "damyl", maxPerSystem: 1,
    extra_slots: [{ role: "white_corridor", require: { properties: ["corridor_open"], tier: ">=8" }, count: 2 }],
    extra_effects: [{ effect: "unlock_property", args: { property: "corridor_open" } }],
    prerequisites: { race: "damilian" },
    signature: "Улучшенные врата на вайтиде (белые коридоры)", tradeoff: "только для дамилян"
  },
  "mega.archive.belator": {
    id: "mega.archive.belator", base: "cognitio.archive", kind: "lab", zone: "deep",
    name: "Архив Дая-Чины", faction: "belator", maxPerSystem: 1,
    extra_slots: [{ role: "norborian_logic", require: { properties: ["info_store"], tier: ">=7" }, count: 2 }],
    extra_effects: [
      { effect: "unlock_tech_tier", args: { category: "F", to: 10 } },
      { effect: "ap_add", args: { amount: 1 } }
    ],
    prerequisites: { race: "norborian" },
    signature: "Открывает секретную ветку T10; +1 AP/ход", tradeoff: "только для Белатор (норбуррийцы)"
  },
  "mega.sula_code": {
    id: "mega.sula_code", kind: "lab", zone: "deep", name: "Сула-Код", ap: 2,
    category: "F", tier: 9, faction: "belator", maxPerSystem: 1,
    cost: tierCost("F", 9),
    effects: [
      flowConvert("E", "F", 7),
      { effect: "ap_add", args: { amount: 1 } },
    ],
    slots: [{ role: "logic", require: { properties: ["info_store"], tier: ">=7" }, count: 6 }],
    upkeep_slots: [{ require: { category: "D", tier: ">=6" }, count: 2, per: "turn" }],
    prerequisites: { race: "norborian" },
    signature: "E→F: цифровой код на норбурийской логике; +1 AP/ход, +разведка", tradeoff: "закрыт для чужаков"
  },
  "mega.quiet_fire": {
    id: "mega.quiet_fire", kind: "defense", zone: "orbital", name: "Лаб. «Тихий Огонь»", ap: 2,
    category: "C", tier: 7, faction: "belator", maxPerSystem: 1,
    cost: tierCost("C", 7, { "currency.materia": 3 }),
    effects: [
      flowConvert("B", "C", 5),
      { effect: "stat_mult", args: { stat: "shields", mult: 1.25 } },
    ],
    slots: [{ role: "structure", require: { category: "B", tier: ">=5" }, count: 8 }],
    upkeep_slots: [{ require: { category: "D", tier: ">=5" }, count: 2, per: "turn" }],
    prerequisites: { races: ["night_goblin", "resun"] },
    signature: "B→C: второй контур щита + полевой сплав из отходов", tradeoff: "требует ночных гоблинов + рэсунов"
  }
};

fs.writeFileSync(OUT, JSON.stringify(B, null, 2) + "\n", "utf8");
console.log("Wrote", Object.keys(B).length, "buildings →", OUT);

// Summary of flow_convert buildings for CI/dev feedback
const converters = Object.values(B).filter((b) =>
  (b.effects || []).some((e) => e.effect === "flow_convert")
    || (b.extra_effects || []).some((e) => e.effect === "flow_convert")
);
console.log("flow_convert buildings:", converters.length);
for (const b of converters) {
  const edges = (b.effects || [])
    .filter((e) => e.effect === "flow_convert")
    .map((e) => `${e.args.from.category}→${e.args.to.category} (${e.args.from.tier})`);
  console.log(`  ${b.id}: ${edges.join(", ")}`);
}
