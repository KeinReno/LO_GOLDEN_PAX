/**
 * Generate content/core/buildings.json from a compact JS catalog.
 * Legacy 13 buildings keep cost/effects for backward compat with current economyTick.
 * New buildings use the slot schema (slots/upkeep_slots) from economy_schema.json.
 *
 * Phase 2: converter buildings use `flow_convert` (RPS edges A→B→C→D→E→F→A)
 * matching flowEngine.mjs; extractors/plants may `yield_flat` category currencies
 * (currency.extracta/materia/industria/energia/bios/cognitio). Dual costs keep
 * legacy metal/supply and add small category-currency costs (T1–T3 stay cheap).
 *
 * Re-runnable: overwrites buildings.json.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "content/core/buildings.json");

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

const B = {
  // ===== LEGACY 13 (preserved with cost/effects; slot metadata added) =====
  "building.residential": {
    id: "building.residential", kind: "residential", zone: "surface", name: "Жилой район", ap: 1,
    category: "E", tier: 1, faction: "generic",
    cost: { "currency.metal": 10, "currency.supply": 6 },
    effects: [{ effect: "pop_cap_add", args: { amount: 15 } }],
    slots: [{ role: "structure", require: { category: "B", tier: ">=1" }, count: 6 }],
    upkeep_slots: [{ require: { category: "E", tier: ">=1" }, count: 1, per: "turn" }],
    signature: "+pop_cap", tradeoff: "требует Bios upkeep"
  },
  "building.farm": {
    id: "building.farm", kind: "farm", zone: "surface", name: "Агрокомплекс", ap: 1,
    category: "E", tier: 3, faction: "generic",
    cost: { "currency.metal": 8, "currency.supply": 4, "currency.energia": 2 },
    effects: [flowConvert("D", "E", 1)],
    slots: [{ role: "structure", require: { category: "B", tier: ">=1" }, count: 4 }],
    upkeep_slots: [{ require: { category: "D", tier: ">=1" }, count: 1, per: "turn" }],
    signature: "D→E: Energia → Bios T1–T3 (пища)", tradeoff: "занимает плодородную землю (-1 Materia cap)"
  },
  "building.mine": {
    id: "building.mine", kind: "mine", zone: "surface", name: "Шахта", ap: 1,
    category: "A", tier: 3, faction: "generic",
    cost: { "currency.metal": 12, "currency.supply": 3 },
    effects: [yieldFlat("currency.extracta", 2)],
    slots: [{ role: "structure", require: { category: "B", tier: ">=1" }, count: 4 }],
    upkeep_slots: [{ require: { category: "D", tier: ">=1" }, count: 1, per: "turn" }],
    signature: "Добывает Extracta T1–T3", tradeoff: "-1 Bios cap"
  },
  "building.factory": {
    id: "building.factory", kind: "factory", zone: "surface", name: "Завод", ap: 1,
    category: "C", tier: 3, faction: "generic",
    cost: { "currency.metal": 16, "currency.supply": 5, "currency.materia": 3 },
    effects: [flowConvert("B", "C", 1)],
    slots: [{ role: "structure", require: { category: "B", tier: ">=2" }, count: 6 }],
    upkeep_slots: [{ require: { category: "D", tier: ">=2" }, count: 2, per: "turn" }],
    signature: "B→C: Materia+Bios → Industria слоты T1–T3", tradeoff: "-1 Energia upkeep"
  },
  "building.lab": {
    id: "building.lab", kind: "lab", zone: "surface", name: "Лаборатория", ap: 1,
    category: "F", tier: 3, faction: "generic",
    cost: { "currency.metal": 14, "currency.supply": 6, "currency.bios": 2 },
    effects: [flowConvert("E", "F", 1)],
    slots: [{ role: "structure", require: { category: "B", tier: ">=2" }, count: 5 }],
    upkeep_slots: [{ require: { category: "E", tier: ">=2" }, count: 2, per: "turn" }],
    signature: "E→F: Bios → Cognitio T1–T3 (базовая наука)", tradeoff: "-1 E upkeep (учёные едят)"
  },
  "building.barracks": {
    id: "building.barracks", kind: "barracks", zone: "surface", name: "Казарма", ap: 1,
    category: "C", tier: 4, faction: "generic",
    cost: { "currency.metal": 12, "currency.supply": 8, "currency.industria": 2 },
    effects: [],
    slots: [{ role: "structure", require: { category: "B", tier: ">=2" }, count: 5 }],
    upkeep_slots: [{ require: { category: "E", tier: ">=2" }, count: 2, per: "turn" }],
    signature: "Слоты десанта T1–T4", tradeoff: "-1 мораль в мирное время"
  },
  "building.capitol": {
    id: "building.capitol", kind: "capitol", zone: "surface", name: "Администрация", ap: 1,
    category: "C", tier: 5, faction: "generic", maxPerPlanet: 1,
    cost: { "currency.metal": 20, "currency.supply": 10, "currency.industria": 3 },
    effects: [{ effect: "pop_cap_add", args: { amount: 10 } }],
    slots: [{ role: "structure", require: { category: "B", tier: ">=3" }, count: 8 }],
    upkeep_slots: [{ require: { category: "E", tier: ">=3" }, count: 2, per: "turn" }],
    signature: "+AP/ход, налоги в торговое значение", tradeoff: "1 на планету"
  },
  "building.defense": {
    id: "building.defense", kind: "defense", zone: "surface", name: "Оборона", ap: 1,
    category: "B", tier: 4, faction: "generic",
    cost: { "currency.metal": 14, "currency.supply": 4, "currency.materia": 2 },
    effects: [],
    slots: [{ role: "hull", require: { properties: ["strong"], tier: ">=3" }, count: 6 }],
    upkeep_slots: [{ require: { category: "D", tier: ">=2" }, count: 1, per: "turn" }],
    signature: "Планетарный щит/орудия; tier = Materia tier корпуса", tradeoff: "-1 Energia upkeep"
  },
  "building.spaceport": {
    id: "building.spaceport", kind: "spaceport", zone: "orbital", name: "Космопорт", ap: 1,
    category: "C", tier: 4, faction: "generic", maxPerPlanet: 1,
    cost: { "currency.metal": 18, "currency.supply": 6, "currency.industria": 2 },
    effects: [yieldFlat("currency.industria", 1)],
    slots: [{ role: "structure", require: { category: "B", tier: ">=3" }, count: 6 }],
    upkeep_slots: [{ require: { category: "D", tier: ">=3" }, count: 2, per: "turn" }],
    signature: "Открывает орбитальные здания и торговлю", tradeoff: "1 на планету"
  },
  "building.shipyard": {
    id: "building.shipyard", kind: "shipyard", zone: "orbital", name: "Верфь", ap: 1,
    category: "C", tier: 5, faction: "generic",
    cost: { "currency.metal": 24, "currency.supply": 8, "currency.materia": 4, "currency.industria": 3 },
    effects: [flowConvert("B", "C", 3)],
    slots: [{ role: "structure", require: { category: "B", tier: ">=3" }, count: 8 }],
    upkeep_slots: [{ require: { category: "D", tier: ">=3" }, count: 2, per: "turn" }],
    signature: "B→C слоты кораблей; tier верфи = макс. класс", tradeoff: "нужен космопорт"
  },
  "building.habitat": {
    id: "building.habitat", kind: "habitat", zone: "orbital", name: "Орбитальный хабитат", ap: 1,
    category: "E", tier: 4, faction: "generic",
    cost: { "currency.metal": 16, "currency.supply": 10, "currency.bios": 2 },
    effects: [{ effect: "pop_cap_add", args: { amount: 15 } }],
    slots: [{ role: "structure", require: { category: "B", tier: ">=3" }, count: 6 }],
    upkeep_slots: [{ require: { category: "D", tier: ">=3" }, count: 2, per: "turn" }],
    signature: "+pop_cap без занятия surface", tradeoff: "-1 E upkeep, -1 Materia upkeep"
  },
  "building.orbital_defense": {
    id: "building.orbital_defense", kind: "defense", zone: "orbital", name: "Орбитальная оборона", ap: 1,
    category: "D", tier: 5, faction: "generic",
    cost: { "currency.metal": 16, "currency.supply": 5, "currency.energia": 3 },
    effects: [],
    slots: [{ role: "weapon", require: { properties: ["weapon_amp"], tier: ">=3" }, count: 4 }],
    upkeep_slots: [{ require: { category: "D", tier: ">=3" }, count: 2, per: "turn" }],
    signature: "Щит/орудия системы; tier = Energia tier", tradeoff: "-1 Energia upkeep"
  },
  "building.orbital_lab": {
    id: "building.orbital_lab", kind: "lab", zone: "orbital", name: "Орбитальная лаборатория", ap: 1,
    category: "F", tier: 5, faction: "generic",
    cost: { "currency.metal": 18, "currency.supply": 7, "currency.bios": 3 },
    effects: [flowConvert("E", "F", 3)],
    slots: [{ role: "structure", require: { category: "B", tier: ">=3" }, count: 6 }],
    upkeep_slots: [{ require: { category: "D", tier: ">=3" }, count: 2, per: "turn" }],
    signature: "E→F: Cognitio T4–T5 без штрафа Bios", tradeoff: "орбитальный слот"
  },

  // ===== A — EXTRACTA (8) =====
  "extract.deep_shaft": {
    id: "extract.deep_shaft", kind: "mine", zone: "subsurface", name: "Глубинный ствол", ap: 1,
    category: "A", tier: 6, faction: "generic",
    cost: { "currency.metal": 20, "currency.supply": 6, "currency.industria": 3 },
    effects: [
      yieldFlat("currency.extracta", 3),
      flowConvert("F", "A", 4), // soft F→A unlock-ish for higher extract tiers
    ],
    slots: [{ role: "structure", require: { category: "B", tier: ">=4" }, count: 6 }],
    upkeep_slots: [{ require: { category: "D", tier: ">=4" }, count: 2, per: "turn" }],
    signature: "Поднимает tier месторождения на +1 (T4–T6); soft F→A", tradeoff: "риск обвала"
  },
  "extract.strip_pit": {
    id: "extract.strip_pit", kind: "mine", zone: "surface", name: "Карьер-стрип", ap: 1,
    category: "A", tier: 3, faction: "generic",
    cost: { "currency.metal": 14, "currency.supply": 4 },
    effects: [yieldFlat("currency.extracta", 6)],
    slots: [{ role: "structure", require: { category: "B", tier: ">=2" }, count: 4 }],
    upkeep_slots: [{ require: { category: "D", tier: ">=2" }, count: 1, per: "turn" }],
    signature: "×3 объём Extracta T1–T3", tradeoff: "-1 Bios cap, -1 Materia cap (истощает почву)"
  },
  "extract.gas_well": {
    id: "extract.gas_well", kind: "mine", zone: "subsurface", name: "Газовая скважина", ap: 1,
    category: "A", tier: 3, faction: "generic",
    cost: { "currency.metal": 12, "currency.supply": 5 },
    effects: [yieldFlat("currency.energia", 2)],
    slots: [{ role: "structure", require: { category: "B", tier: ">=2" }, count: 4 }],
    upkeep_slots: [{ require: { category: "D", tier: ">=2" }, count: 1, per: "turn" }],
    signature: "Добывает D-газы T1–T3", tradeoff: "только на газоносных биомах",
    biome_restrictions: ["gas_giant", "swamp", "volcanic"]
  },
  "extract.asteroid_harvester": {
    id: "extract.asteroid_harvester", kind: "mine", zone: "orbital", name: "Астероидный гарвец", ap: 1,
    category: "A", tier: 7, faction: "generic",
    cost: { "currency.metal": 26, "currency.supply": 8, "currency.industria": 4 },
    effects: [
      yieldFlat("currency.extracta", 4),
      yieldFlat("currency.materia", 1),
    ],
    slots: [{ role: "structure", require: { category: "B", tier: ">=4" }, count: 8 }],
    upkeep_slots: [{ require: { category: "D", tier: ">=4" }, count: 2, per: "turn" }],
    signature: "Добывает A и Materia T4–T7 без занятой поверхности", tradeoff: "нужен космопорт"
  },
  "extract.anomaly_collector": {
    id: "extract.anomaly_collector", kind: "mine", zone: "deep", name: "Аномальный коллектор", ap: 2,
    category: "A", tier: 10, faction: "generic", maxPerSystem: 1,
    cost: { "currency.metal": 40, "currency.supply": 15, "currency.cognitio": 6, "currency.energia": 4 },
    effects: [
      yieldFlat("currency.extracta", 2),
      flowConvert("F", "A", 8), // F→A soft unlock for T8–T10 extract
    ],
    slots: [{ role: "structure", require: { category: "B", tier: ">=6" }, count: 10 }],
    upkeep_slots: [{ require: { category: "D", tier: ">=6" }, count: 3, per: "turn" }],
    signature: "Добывает A T8–T10 (тёмная материя, блакула); F→A", tradeoff: "1 на систему, только аномальные системы"
  },
  "extract.slurry_plant": {
    id: "extract.slurry_plant", kind: "factory", zone: "surface", name: "Шлам-установка", ap: 1,
    category: "A", tier: 2, faction: "generic",
    cost: { "currency.metal": 10, "currency.supply": 4 },
    effects: [yieldFlat("currency.extracta", 1)],
    slots: [{ role: "structure", require: { category: "B", tier: ">=1" }, count: 3 }],
    upkeep_slots: [{ require: { category: "D", tier: ">=1" }, count: 1, per: "turn" }],
    signature: "Перерабатывает хвосты в Extracta T2", tradeoff: "-1 мораль, -1 лекарственные"
  },
  "extract.relays": {
    id: "extract.relays", kind: "relay", zone: "orbital", name: "Дрон-реле", ap: 1,
    category: "A", tier: 4, faction: "generic",
    cost: { "currency.metal": 16, "currency.supply": 5, "currency.industria": 2 },
    effects: [],
    slots: [{ role: "structure", require: { category: "B", tier: ">=3" }, count: 4 }],
    upkeep_slots: [{ require: { category: "D", tier: ">=3" }, count: 1, per: "turn" }],
    signature: "+50% дальности добычи в системе (буст соседних шахт)", tradeoff: "ничего не добывает сам"
  },

  // ===== B — MATERIA (7) =====
  "materia.smelter": {
    id: "materia.smelter", kind: "factory", zone: "surface", name: "Плавильня", ap: 1,
    category: "B", tier: 3, faction: "generic",
    cost: { "currency.metal": 14, "currency.supply": 5, "currency.extracta": 4 },
    effects: [flowConvert("A", "B", 1)],
    slots: [{ role: "structure", require: { category: "B", tier: ">=2" }, count: 5 }],
    upkeep_slots: [{ require: { category: "D", tier: ">=2" }, count: 2, per: "turn" }],
    signature: "A→B: Extracta T1–T3 → Materia T1–T3", tradeoff: "-1 Bios cap (дым)"
  },
  "materia.rolling_mill": {
    id: "materia.rolling_mill", kind: "factory", zone: "surface", name: "Прокатный цех", ap: 1,
    category: "B", tier: 4, faction: "generic",
    cost: { "currency.metal": 18, "currency.supply": 6, "currency.materia": 3 },
    effects: [{ effect: "capacity_add", args: { category: "B", tier: 3, amount: 2 } }],
    slots: [{ role: "structure", require: { category: "B", tier: ">=3" }, count: 6 }],
    upkeep_slots: [{ require: { category: "D", tier: ">=3" }, count: 2, per: "turn" }],
    signature: "Повышает capacity потока B на +2 (не rate)", tradeoff: "требует Materia T3 на стройку"
  },
  "materia.crystal_workshop": {
    id: "materia.crystal_workshop", kind: "factory", zone: "surface", name: "Кристальная мастерская", ap: 1,
    category: "B", tier: 5, faction: "generic",
    cost: { "currency.metal": 20, "currency.supply": 7, "currency.extracta": 5 },
    effects: [flowConvert("A", "B", 3)],
    slots: [{ role: "structure", require: { category: "B", tier: ">=3" }, count: 6 }],
    upkeep_slots: [{ require: { category: "D", tier: ">=3" }, count: 2, per: "turn" }],
    signature: "A→B: B T3–T5 (кристаллы, фокусирующие)", tradeoff: "только при наличии кристалльного месторождения"
  },
  "materia.alloy_lab": {
    id: "materia.alloy_lab", kind: "lab", zone: "surface", name: "Лаб. сплавов", ap: 1,
    category: "B", tier: 6, faction: "generic",
    cost: { "currency.metal": 22, "currency.supply": 8, "currency.materia": 4, "currency.cognitio": 2 },
    effects: [{ effect: "unlock_tech_tier", args: { category: "B", to: 6 } }],
    slots: [{ role: "structure", require: { category: "B", tier: ">=4" }, count: 8 }],
    upkeep_slots: [{ require: { category: "F", tier: ">=3" }, count: 2, per: "turn" }],
    signature: "Открывает tier T4–T6 для Materia", tradeoff: "-2 Cognitio upkeep (нужны учёные)"
  },
  "materia.metamaterial_forge": {
    id: "materia.metamaterial_forge", kind: "factory", zone: "orbital", name: "Метаматериальная фабрика", ap: 1,
    category: "B", tier: 9, faction: "generic",
    cost: { "currency.metal": 32, "currency.supply": 12, "currency.extracta": 8, "currency.energia": 4 },
    effects: [flowConvert("A", "B", 7)],
    slots: [{ role: "structure", require: { category: "B", tier: ">=6" }, count: 10 }],
    upkeep_slots: [{ require: { category: "D", tier: ">=6" }, count: 3, per: "turn" }],
    signature: "A→B: B T7–T9 (архит, иссридил, клакс)", tradeoff: "требует вакуума, -2 Energia upkeep"
  },
  "materia.refinery_gas": {
    id: "materia.refinery_gas", kind: "factory", zone: "surface", name: "Газовый рафинер", ap: 1,
    category: "B", tier: 2, faction: "generic",
    cost: { "currency.metal": 12, "currency.supply": 5, "currency.energia": 2 },
    effects: [flowConvert("D", "B", 1)], // special D→B catalyst path
    slots: [{ role: "structure", require: { category: "B", tier: ">=1" }, count: 4 }],
    upkeep_slots: [{ require: { category: "D", tier: ">=1" }, count: 1, per: "turn" }],
    signature: "D→B: D-газ T1–T2 → B-катализатор T2", tradeoff: "-1 Bios cap (токсичные отходы)"
  },
  "materia.mint": {
    id: "materia.mint", kind: "capitol", zone: "surface", name: "Монетный двор", ap: 1,
    category: "B", tier: 5, faction: "generic", maxPerPlanet: 1,
    cost: { "currency.metal": 24, "currency.supply": 10, "currency.materia": 5 },
    effects: [],
    slots: [{ role: "structure", require: { properties: [], tier: ">=5" }, count: 6 }],
    upkeep_slots: [{ require: { category: "E", tier: ">=3" }, count: 2, per: "turn" }],
    signature: "B T5 (золото/серебро/соларид) → торговое значение", tradeoff: "1 на планету, требует закон «Валюта»"
  },

  // ===== C — INDUSTRIA (6) =====
  "industria.assembly": {
    id: "industria.assembly", kind: "factory", zone: "surface", name: "Сборочный комплекс", ap: 1,
    category: "C", tier: 5, faction: "generic",
    cost: { "currency.metal": 22, "currency.supply": 8, "currency.materia": 4, "currency.bios": 2 },
    effects: [flowConvert("B", "C", 3)],
    slots: [{ role: "structure", require: { category: "B", tier: ">=4" }, count: 8 }],
    upkeep_slots: [{ require: { category: "D", tier: ">=4" }, count: 2, per: "turn" }],
    signature: "B→C: открывает слоты T3–T5 (юниты/корабли среднего класса)", tradeoff: "требует C T3 (стройплексы)"
  },
  "industria.nanoforge": {
    id: "industria.nanoforge", kind: "factory", zone: "orbital", name: "Наносборочный цех", ap: 1,
    category: "C", tier: 8, faction: "generic",
    cost: { "currency.metal": 30, "currency.supply": 12, "currency.materia": 6, "currency.bios": 3 },
    effects: [flowConvert("B", "C", 6)],
    slots: [{ role: "structure", require: { category: "B", tier: ">=6" }, count: 10 }],
    upkeep_slots: [{ require: { category: "D", tier: ">=6" }, count: 3, per: "turn" }],
    signature: "B→C: слоты T6–T8 (наниты, живой металл)", tradeoff: "требует C T6+, -2 Energia upkeep"
  },
  "industria.modular_yard": {
    id: "industria.modular_yard", kind: "factory", zone: "surface", name: "Модульная стройка", ap: 1,
    category: "C", tier: 4, faction: "generic",
    cost: { "currency.metal": 16, "currency.supply": 6, "currency.industria": 2 },
    effects: [{ effect: "cost_mult", args: { mult: 0.5, tag: "build" } }],
    slots: [{ role: "structure", require: { category: "B", tier: ">=3" }, count: 5 }],
    upkeep_slots: [{ require: { category: "D", tier: ">=3" }, count: 1, per: "turn" }],
    signature: "Ускоряет стройку всех зданий T1–T4 на планете на +50%", tradeoff: "ничего не производит сам"
  },
  "industria.repair_dock": {
    id: "industria.repair_dock", kind: "shipyard", zone: "orbital", name: "Ремонтный док", ap: 1,
    category: "C", tier: 5, faction: "generic",
    cost: { "currency.metal": 20, "currency.supply": 7, "currency.materia": 3 },
    effects: [],
    slots: [{ role: "structure", require: { category: "B", tier: ">=4" }, count: 6 }],
    upkeep_slots: [{ require: { category: "D", tier: ">=4" }, count: 2, per: "turn" }],
    signature: "Восстанавливает корпус/HP флота без возврата на столицу", tradeoff: "требует Materia того же tier, что и корпус"
  },

  // ===== D — ENERGIA (7) =====
  "energia.thermal_plant": {
    id: "energia.thermal_plant", kind: "factory", zone: "surface", name: "Теплоэлектростанция", ap: 1,
    category: "D", tier: 2, faction: "generic",
    cost: { "currency.metal": 12, "currency.supply": 5, "currency.industria": 2 },
    effects: [flowConvert("C", "D", 1)],
    slots: [{ role: "structure", require: { category: "B", tier: ">=1" }, count: 4 }],
    upkeep_slots: [{ require: { properties: ["fuel"], tier: ">=1" }, count: 1, per: "turn" }],
    signature: "C→D: Industria → Energia T1–T2 (массовая энергия)", tradeoff: "-1 Bios cap (выбросы)"
  },
  "energia.geo_hydro": {
    id: "energia.geo_hydro", kind: "factory", zone: "surface", name: "Гео/Гидро станция", ap: 1,
    category: "D", tier: 4, faction: "generic",
    cost: { "currency.metal": 16, "currency.supply": 6, "currency.materia": 2 },
    effects: [yieldFlat("currency.energia", 3)],
    slots: [{ role: "structure", require: { category: "B", tier: ">=2" }, count: 5 }],
    upkeep_slots: [],
    signature: "D T2–T4, без штрафа Bios (природный yield)", tradeoff: "только на геотермальных/океанических биомах",
    biome_restrictions: ["ocean", "volcanic", "mountainous"]
  },
  "energia.fusion_reactor": {
    id: "energia.fusion_reactor", kind: "factory", zone: "subsurface", name: "Термояд", ap: 1,
    category: "D", tier: 6, faction: "generic",
    cost: { "currency.metal": 24, "currency.supply": 10, "currency.industria": 4, "currency.materia": 3 },
    effects: [flowConvert("C", "D", 5)],
    slots: [{ role: "structure", require: { category: "B", tier: ">=4" }, count: 8 }],
    upkeep_slots: [{ require: { properties: ["fuel"], tier: ">=5" }, count: 1, per: "turn" }],
    signature: "C→D: D T5–T6 (гелий-3, изотопы)", tradeoff: "требует техн. Термояд"
  },
  "energia.antimatter_plant": {
    id: "energia.antimatter_plant", kind: "factory", zone: "orbital", name: "Антиматерия-реактор", ap: 2,
    category: "D", tier: 8, faction: "generic", maxPerSystem: 1,
    cost: { "currency.metal": 36, "currency.supply": 14, "currency.industria": 6, "currency.cognitio": 3 },
    effects: [flowConvert("C", "D", 7)],
    slots: [{ role: "structure", require: { category: "B", tier: ">=6" }, count: 10 }],
    upkeep_slots: [{ require: { properties: ["energy"], tier: ">=7" }, count: 2, per: "turn" }],
    signature: "C→D: D T8 (антиматерия) — открывает корабли T8", tradeoff: "1 на систему, требует Cognitio T7"
  },
  "energia.solar_catcher": {
    id: "energia.solar_catcher", kind: "factory", zone: "deep", name: "Солнечный ловец", ap: 3,
    category: "D", tier: 7, faction: "generic", maxPerSystem: 1,
    cost: { "currency.metal": 40, "currency.supply": 16, "currency.materia": 6 },
    effects: [yieldFlat("currency.energia", 8)],
    slots: [{ role: "structure", require: { category: "B", tier: ">=6" }, count: 12 }],
    upkeep_slots: [],
    signature: "Мегапроект: D T7+ без топлива; питает всю систему", tradeoff: "требует нестабильное ядро звезды; риск взрыва"
  },
  "energia.plasma_condenser": {
    id: "energia.plasma_condenser", kind: "factory", zone: "orbital", name: "Плазмо-конденсатор", ap: 1,
    category: "D", tier: 6, faction: "generic",
    cost: { "currency.metal": 22, "currency.supply": 9, "currency.industria": 3 },
    effects: [flowConvert("C", "D", 4)],
    slots: [{ role: "structure", require: { category: "B", tier: ">=4" }, count: 6 }],
    upkeep_slots: [{ require: { properties: ["fuel"], tier: ">=4" }, count: 1, per: "turn" }],
    signature: "C→D: Energia+газ → плазмоиды (D T6)", tradeoff: "-1 Materia upkeep"
  },
  "energia.zro_reactor": {
    id: "energia.zro_reactor", kind: "factory", zone: "surface", name: "Зро-реактор", ap: 1,
    category: "D", tier: 7, faction: "generic",
    cost: { "currency.metal": 26, "currency.supply": 10, "currency.energia": 3, "currency.cognitio": 2 },
    effects: [
      yieldFlat("currency.energia", 4),
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
    cost: { "currency.metal": 16, "currency.supply": 7, "currency.energia": 3 },
    effects: [flowConvert("D", "E", 3)],
    slots: [{ role: "structure", require: { category: "B", tier: ">=3" }, count: 6 }],
    upkeep_slots: [{ require: { category: "D", tier: ">=3" }, count: 2, per: "turn" }],
    signature: "D→E: E T3–T5, не занимает surface", tradeoff: "-1 вода/ход"
  },
  "bios.biolab": {
    id: "bios.biolab", kind: "lab", zone: "surface", name: "Биолаборатория", ap: 1,
    category: "E", tier: 6, faction: "generic",
    cost: { "currency.metal": 18, "currency.supply": 8, "currency.energia": 3, "currency.cognitio": 2 },
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
    cost: { "currency.metal": 16, "currency.supply": 7, "currency.bios": 2 },
    effects: [{ effect: "stability_add", args: { amount: 1 } }],
    slots: [{ role: "structure", require: { category: "B", tier: ">=3" }, count: 5 }],
    upkeep_slots: [{ require: { category: "E", tier: ">=3" }, count: 1, per: "turn" }],
    signature: "+мораль, +рост, снижает потери от боя", tradeoff: "-1 E upkeep (медикаменты)"
  },
  "bios.clone_vats": {
    id: "bios.clone_vats", kind: "residential", zone: "subsurface", name: "Клональные ванны", ap: 1,
    category: "E", tier: 8, faction: "generic",
    cost: { "currency.metal": 28, "currency.supply": 12, "currency.bios": 5, "currency.industria": 3 },
    effects: [{ effect: "pop_growth_mult", args: { mult: 1.5 } }],
    slots: [{ role: "structure", require: { category: "B", tier: ">=5" }, count: 8 }],
    upkeep_slots: [{ require: { category: "E", tier: ">=5" }, count: 2, per: "turn" }],
    signature: "E T6–T8 (быстрый рост населения)", tradeoff: "-2 мораль, требует закон об этике"
  },
  "bios.extreme_station": {
    id: "bios.extreme_station", kind: "residential", zone: "surface", name: "Экстремофильная станция", ap: 1,
    category: "E", tier: 6, faction: "generic",
    cost: { "currency.metal": 20, "currency.supply": 9, "currency.bios": 3 },
    effects: [{ effect: "habitability_mult", args: { mult: 1.3 } }],
    slots: [{ role: "structure", require: { category: "B", tier: ">=4" }, count: 6 }],
    upkeep_slots: [{ require: { category: "D", tier: ">=4" }, count: 2, per: "turn" }],
    signature: "Заселяет негостеприимные биомы (T6 ферменты)", tradeoff: "только на экстремальных биомах",
    biome_restrictions: ["volcanic", "ice", "toxic", "desert"]
  },
  "bios.leviathan_sanctuary": {
    id: "bios.leviathan_sanctuary", kind: "farm", zone: "deep", name: "Санctуарий левиафана", ap: 2,
    category: "E", tier: 8, faction: "generic", maxPerSystem: 1,
    cost: { "currency.metal": 34, "currency.supply": 14, "currency.energia": 4, "currency.bios": 4 },
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
    cost: { "currency.metal": 18, "currency.supply": 8, "currency.bios": 3 },
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
    cost: { "currency.metal": 24, "currency.supply": 10, "currency.bios": 4, "currency.energia": 3 },
    effects: [
      flowConvert("E", "F", 6),
      { effect: "unlock_property", args: { property: "psion_emit" } },
    ],
    slots: [{ role: "structure", require: { properties: ["psion_store"], tier: ">=6" }, count: 6 }],
    upkeep_slots: [{ require: { properties: ["psion_emit"], tier: ">=6" }, count: 1, per: "turn" }],
    signature: "E→F: F T7–T8 (гринид, рэдид, грёзный туман) + псион-бафы", tradeoff: "-2 мораль не-псиоников, требует расу псиоников"
  },
  "cognitio.anomaly_detector": {
    id: "cognitio.anomaly_detector", kind: "lab", zone: "orbital", name: "Аномальный детектор", ap: 1,
    category: "F", tier: 7, faction: "generic",
    cost: { "currency.metal": 22, "currency.supply": 9, "currency.cognitio": 2 },
    effects: [yieldFlat("currency.cognitio", 1)],
    slots: [{ role: "structure", require: { category: "B", tier: ">=4" }, count: 6 }],
    upkeep_slots: [{ require: { category: "D", tier: ">=4" }, count: 2, per: "turn" }],
    signature: "Открывает аномальные события T5–T7; лёгкий Cognitio yield", tradeoff: "ничего не конвертирует, -1 Energia upkeep"
  },
  "cognitio.archive": {
    id: "cognitio.archive", kind: "lab", zone: "deep", name: "Архив Древних", ap: 3,
    category: "F", tier: 9, faction: "generic", maxPerSystem: 1,
    cost: { "currency.metal": 40, "currency.supply": 16, "currency.bios": 5, "currency.cognitio": 4 },
    effects: [
      flowConvert("E", "F", 7),
      { effect: "unlock_tech_tier", args: { category: "F", to: 9 } },
    ],
    slots: [
      { role: "knowledge", require: { category: "F", tier: ">=7" }, count: 5 },
      { role: "relic", require: { properties: ["info_store"], tier: ">=7" }, count: 2 }
    ],
    upkeep_slots: [{ require: { category: "E", tier: ">=5" }, count: 2, per: "turn" }],
    signature: "E→F: открывает технологии T9–T10", tradeoff: "1 на систему, требует Cognitio T7"
  },
  "cognitio.astral_loom": {
    id: "cognitio.astral_loom", kind: "relay", zone: "orbital", name: "Астральный ткач", ap: 1,
    category: "F", tier: 6, faction: "generic",
    cost: { "currency.metal": 20, "currency.supply": 8, "currency.cognitio": 3, "currency.energia": 2 },
    effects: [flowConvert("E", "F", 5)],
    slots: [{ role: "structure", require: { properties: ["psion_emit"], tier: ">=5" }, count: 5 }],
    upkeep_slots: [{ require: { category: "D", tier: ">=4" }, count: 1, per: "turn" }],
    signature: "E→F: F T6 (астральные нити) → дальняя связь между системами", tradeoff: "требует Cognitio T5 на обеих концах"
  },

  // ===== MEGAPROJECTS + FACTION VARIANTS (5) =====
  "mega.gate": {
    id: "mega.gate", kind: "relay", zone: "deep", name: "Межпланетарные Врата", ap: 3,
    category: "F", tier: 8, faction: "generic", maxPerSystem: 1,
    cost: { "currency.metal": 50, "currency.supply": 20, "currency.energia": 6, "currency.cognitio": 6 },
    effects: [],
    slots: [
      { role: "structure", require: { category: "B", tier: ">=6" }, count: 8 },
      { role: "corridor", require: { properties: ["corridor_open"], tier: ">=7" }, count: 2 }
    ],
    upkeep_slots: [{ require: { category: "D", tier: ">=6" }, count: 3, per: "turn" }],
    signature: "Мгновенный перенос флота между системами с Вратами", tradeoff: "требует Cognitio T6 + Energia T6 на обоих концах"
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
    cost: { "currency.metal": 36, "currency.supply": 14, "currency.cognitio": 5 },
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
    cost: { "currency.metal": 30, "currency.supply": 12, "currency.industria": 4, "currency.materia": 3 },
    effects: [
      flowConvert("B", "C", 5),
      { effect: "stat_mult", args: { stat: "shields", mult: 1.3 } },
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
