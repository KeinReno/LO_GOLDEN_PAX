/**
 * Generate content/core/technologies.json — 6-category tech tree.
 * Each tech unlocks tiers, properties, or buildings. Organized by category A–F.
 * Re-runnable: overwrites technologies.json.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "content/core/technologies.json");

const T = {
  // ===== A — EXTRACTA (добыча) =====
  "tech.geology": {
    id: "tech.geology", name: "Геология", category: "A", era: 1, cost: { "currency.cognitio": 20 },
    effects: [{ effect: "unlock_tech_tier", args: { category: "A", to: 2 } }],
    prerequisites: []
  },
  "tech.deep_prospecting": {
    id: "tech.deep_prospecting", name: "Глубинный анализ планет", category: "A", era: 2, cost: { "currency.cognitio": 40 },
    effects: [{ effect: "unlock_tech_tier", args: { category: "A", to: 4 } }],
    prerequisites: ["tech.geology"]
  },
  "tech.asteroid_mining": {
    id: "tech.asteroid_mining", name: "Астероидная добыча", category: "A", era: 3, cost: { "currency.cognitio": 80 },
    effects: [{ effect: "unlock_tech_tier", args: { category: "A", to: 6 } }],
    prerequisites: ["tech.deep_prospecting"]
  },
  "tech.anomaly_tapping": {
    id: "tech.anomaly_tapping", name: "Аномальная добыча", category: "A", era: 4, cost: { "currency.cognitio": 160 },
    effects: [{ effect: "unlock_tech_tier", args: { category: "A", to: 9 } }],
    prerequisites: ["tech.asteroid_mining"]
  },

  // ===== B — MATERIA (переработка) =====
  "tech.materials_science": {
    id: "tech.materials_science", name: "Наука о материалах", category: "B", era: 1, cost: { "currency.cognitio": 20 },
    effects: [{ effect: "unlock_tech_tier", args: { category: "B", to: 2 } }],
    prerequisites: []
  },
  "tech.pyrometallurgy": {
    id: "tech.pyrometallurgy", name: "Пирометаллургия", category: "B", era: 2, cost: { "currency.cognitio": 40 },
    effects: [{ effect: "unlock_tech_tier", args: { category: "B", to: 4 } }],
    prerequisites: ["tech.materials_science"]
  },
  "tech.crystal_integration": {
    id: "tech.crystal_integration", name: "Интеграция кристаллов", category: "B", era: 3, cost: { "currency.cognitio": 80 },
    effects: [
      { effect: "unlock_tech_tier", args: { category: "B", to: 6 } },
      { effect: "unlock_property", args: { property: "shield" } }
    ],
    prerequisites: ["tech.pyrometallurgy"]
  },
  "tech.metamaterials": {
    id: "tech.metamaterials", name: "Метаматериалы", category: "B", era: 4, cost: { "currency.cognitio": 160 },
    effects: [{ effect: "unlock_tech_tier", args: { category: "B", to: 9 } }],
    prerequisites: ["tech.crystal_integration"]
  },

  // ===== C — INDUSTRIA (производство) =====
  "tech.industrial_org": {
    id: "tech.industrial_org", name: "Промышленная организация", category: "C", era: 1, cost: { "currency.cognitio": 25 },
    effects: [{ effect: "unlock_tech_tier", args: { category: "C", to: 3 } }],
    prerequisites: []
  },
  "tech.modular_construction": {
    id: "tech.modular_construction", name: "Модульная стройка", category: "C", era: 2, cost: { "currency.cognitio": 50 },
    effects: [{ effect: "unlock_tech_tier", args: { category: "C", to: 5 } }],
    prerequisites: ["tech.industrial_org"]
  },
  "tech.cybernetics": {
    id: "tech.cybernetics", name: "Кибернетика", category: "C", era: 3, cost: { "currency.cognitio": 100 },
    effects: [{ effect: "unlock_tech_tier", args: { category: "C", to: 7 } }],
    prerequisites: ["tech.modular_construction"]
  },
  "tech.nanotech": {
    id: "tech.nanotech", name: "Нанотехнологии", category: "C", era: 4, cost: { "currency.cognitio": 200 },
    effects: [{ effect: "unlock_tech_tier", args: { category: "C", to: 8 } }],
    prerequisites: ["tech.cybernetics"]
  },

  // ===== D — ENERGIA (энергия) =====
  "tech.energy_grid": {
    id: "tech.energy_grid", name: "Энергосеть", category: "D", era: 1, cost: { "currency.cognitio": 20 },
    effects: [{ effect: "unlock_tech_tier", args: { category: "D", to: 2 } }],
    prerequisites: []
  },
  "tech.plasma_engineering": {
    id: "tech.plasma_engineering", name: "Плазменная инженерия", category: "D", era: 2, cost: { "currency.cognitio": 50 },
    effects: [{ effect: "unlock_tech_tier", args: { category: "D", to: 4 } }],
    prerequisites: ["tech.energy_grid"]
  },
  "tech.fusion": {
    id: "tech.fusion", name: "Термояд", category: "D", era: 3, cost: { "currency.cognitio": 100 },
    effects: [{ effect: "unlock_tech_tier", args: { category: "D", to: 6 } }],
    prerequisites: ["tech.plasma_engineering"]
  },
  "tech.antimatter": {
    id: "tech.antimatter", name: "Антиматерия", category: "D", era: 4, cost: { "currency.cognitio": 200 },
    effects: [{ effect: "unlock_tech_tier", args: { category: "D", to: 8 } }],
    prerequisites: ["tech.fusion"]
  },

  // ===== E — BIOS (жизнь) =====
  "tech.hydroponics": {
    id: "tech.hydroponics", name: "Гидропоника", category: "E", era: 1, cost: { "currency.cognitio": 20 },
    effects: [{ effect: "unlock_tech_tier", args: { category: "E", to: 3 } }],
    prerequisites: []
  },
  "tech.medicine": {
    id: "tech.medicine", name: "Медицина", category: "E", era: 2, cost: { "currency.cognitio": 40 },
    effects: [{ effect: "unlock_tech_tier", args: { category: "E", to: 5 } }],
    prerequisites: ["tech.hydroponics"]
  },
  "tech.biocatalysis": {
    id: "tech.biocatalysis", name: "Биокатализ", category: "E", era: 3, cost: { "currency.cognitio": 80 },
    effects: [{ effect: "unlock_tech_tier", args: { category: "E", to: 7 } }],
    prerequisites: ["tech.medicine"]
  },
  "tech.xenobiology": {
    id: "tech.xenobiology", name: "Ксенобиология", category: "E", era: 4, cost: { "currency.cognitio": 160 },
    effects: [{ effect: "unlock_tech_tier", args: { category: "E", to: 8 } }],
    prerequisites: ["tech.biocatalysis"]
  },

  // ===== F — COGNITIO (знание) =====
  "tech.scientific_charter": {
    id: "tech.scientific_charter", name: "Научная хартия", category: "F", era: 1, cost: { "currency.cognitio": 30 },
    effects: [{ effect: "unlock_tech_tier", args: { category: "F", to: 3 } }],
    prerequisites: []
  },
  "tech.archaeology": {
    id: "tech.archaeology", name: "Археология", category: "F", era: 2, cost: { "currency.cognitio": 60 },
    effects: [{ effect: "unlock_tech_tier", args: { category: "F", to: 5 } }],
    prerequisites: ["tech.scientific_charter"]
  },
  "tech.psionics": {
    id: "tech.psionics", name: "Псионика", category: "F", era: 3, cost: { "currency.cognitio": 120 },
    effects: [
      { effect: "unlock_tech_tier", args: { category: "F", to: 7 } },
      { effect: "unlock_property", args: { property: "psion_store" } },
      { effect: "unlock_property", args: { property: "psion_emit" } }
    ],
    prerequisites: ["tech.archaeology"]
  },
  "tech.white_corridors": {
    id: "tech.white_corridors", name: "Белые коридоры", category: "F", era: 4, cost: { "currency.cognitio": 240 },
    effects: [
      { effect: "unlock_tech_tier", args: { category: "F", to: 9 } },
      { effect: "unlock_property", args: { property: "corridor_open" } },
      { effect: "unlock_property", args: { property: "psion_suppress" } }
    ],
    prerequisites: ["tech.psionics"]
  },
  "tech.matter_destruction": {
    id: "tech.matter_destruction", name: "Разрушение материи", category: "F", era: 5, cost: { "currency.cognitio": 400 },
    effects: [
      { effect: "unlock_tech_tier", args: { category: "F", to: 10 } },
      { effect: "unlock_property", args: { property: "matter_destroy" } }
    ],
    prerequisites: ["tech.white_corridors"]
  }
};

fs.writeFileSync(OUT, JSON.stringify(T, null, 2) + "\n", "utf8");
console.log("Wrote", Object.keys(T).length, "technologies →", OUT);
