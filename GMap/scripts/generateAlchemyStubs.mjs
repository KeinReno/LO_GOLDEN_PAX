/**
 * Generate content/core/tech_combos.json + tech_recipes.json from seed tables.
 * Usage: node scripts/generateAlchemyStubs.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "../content/core");

const CAT = {
  A: { res: "currency.extracta", icon: "extraction" },
  B: { res: "currency.materia", icon: "metallurgy" },
  C: { res: "currency.industria", icon: "industry" },
  D: { res: "currency.energia", icon: "energy" },
  E: { res: "currency.bios", icon: "biology" },
  F: { res: "currency.cognitio", icon: "psionics" },
};

const ERA_COST = { 1: 10, 2: 22, 3: 36, 4: 120, 5: 200 };

/** [key, name, a, b, result, cat, era, kind] */
const SEEDS = [
  ["geo_materials", "Гео-материалы", "tech.a_geology", "tech.b_materials_science", "tech.combo_geo_materials", "B", 1, "prod"],
  ["ore_alloys", "Рудные сплавы", "tech.a_ore_extraction", "tech.b_basic_alloys", "tech.combo_ore_alloys", "B", 1, "prod"],
  ["drill_composites", "Буровые композиты", "tech.a_deep_drilling", "tech.b_composite_materials", "tech.combo_drill_composites", "B", 1, "prod"],
  ["mining_metallurgy", "Шахтная металлургия", "tech.a_mining_networks", "tech.b_metallurgy", "tech.combo_mining_metallurgy", "B", 1, "prod"],
  ["crystal_prospect", "Кристалл-разведка", "tech.a_crystal_mining", "tech.b_crystal_growing", "tech.combo_crystal_prospect", "A", 2, "flat"],
  ["slag_recycle", "Шлак-цикл", "tech.a_slag_reclamation", "tech.b_material_recycling", "tech.combo_slag_recycle", "B", 4, "upkeep"],
  ["quantum_mining", "Квантовая добыча", "tech.a_quantum_extraction", "tech.b_quantum_materials", "tech.combo_quantum_mining", "A", 3, "prod"],
  ["nano_extract", "Нано-экстракция", "tech.a_nanite_mining", "tech.b_nanomaterials", "tech.combo_nano_extract", "A", 2, "prod"],
  ["alloy_lines", "Сплавные линии", "tech.b_basic_alloys", "tech.c_assembly_lines", "tech.combo_alloy_lines", "C", 1, "prod"],
  ["plasma_forging", "Плазменная кузница", "tech.b_metallurgy", "tech.c_planetary_forges", "tech.combo_plasma_yard", "C", 2, "prod"],
  ["armor_yards", "Броневые верфи", "tech.b_ablative_hull_plates", "tech.c_fleet_batch_builds", "tech.combo_armor_yards", "C", 4, "stat"],
  ["printer_matter", "Печать материи", "tech.b_programmable_matter", "tech.c_printer_foundries", "tech.combo_matter_printers", "C", 5, "flat"],
  ["composite_prefab", "Композит-префаб", "tech.b_advanced_composites", "tech.c_prefab_bay_standards", "tech.combo_composite_prefab", "C", 3, "cost"],
  ["shield_modules", "Щитовые модули", "tech.b_transparent_armor", "tech.c_module_hotswap", "tech.combo_shield_modules", "B", 4, "prop"],
  ["powered_lines", "Энерголинии цехов", "tech.c_assembly_lines", "tech.d_power_grid_mgmt", "tech.combo_powered_lines", "D", 1, "prod"],
  ["yard_reactors", "Реакторы верфей", "tech.c_orbital_manufacturing", "tech.d_fusion_reactors", "tech.combo_yard_reactors", "D", 2, "prod"],
  ["mobile_power", "Мобильное питание", "tech.c_mobile_shipyards", "tech.d_fleet_tanker_doctrine", "tech.combo_mobile_power", "C", 4, "move"],
  ["siege_beams", "Осадные лучи", "tech.c_siege_works_kits", "tech.d_beam_artillery_power", "tech.combo_siege_beams", "D", 4, "stat"],
  ["drydock_caps", "Конденсаторы доков", "tech.c_drydock_expansion", "tech.d_capacitor_banks", "tech.combo_drydock_caps", "D", 3, "cap"],
  ["night_grid", "Ночная сеть", "tech.c_night_shift_ai", "tech.d_distributed_microgrids", "tech.combo_night_grid", "C", 4, "prod"],
  ["bio_fusion", "Био-термояд", "tech.d_fusion_reactors", "tech.e_bioengineering", "tech.combo_bio_fusion", "E", 2, "prod"],
  ["greenhouse_power", "Энерго-теплицы", "tech.d_solar_arrays", "tech.e_hydroponics", "tech.combo_greenhouse_power", "E", 1, "prod"],
  ["med_batteries", "Медбатареи", "tech.d_battery_tech", "tech.e_medical_advances", "tech.combo_med_batteries", "E", 1, "upkeep"],
  ["cryo_power", "Криопитание", "tech.d_energy_storage", "tech.e_cryosleep_wards", "tech.combo_cryo_power", "E", 3, "pop"],
  ["terra_heat", "Геотерма-терраформ", "tech.d_geothermal_taps", "tech.e_terraforming", "tech.combo_terra_heat", "E", 2, "prod"],
  ["life_support_bus", "Шина жизнеобеспечения", "tech.d_fleet_power_bus", "tech.e_closed_ecology_ships", "tech.combo_life_support_bus", "D", 5, "upkeep"],
  ["psionic_genetics", "Псио-генетика", "tech.e_genetic_engineering", "tech.f_psionic_theory", "tech.combo_psionic_genetics", "F", 1, "prop"],
  ["bio_compute", "Био-вычисления", "tech.e_bio_computing", "tech.f_neural_networks", "tech.combo_bio_compute", "F", 2, "research"],
  ["gene_archives", "Геноархивы", "tech.e_gene_bank_vaults", "tech.f_archive_compression", "tech.combo_gene_archives", "F", 3, "cap"],
  ["mind_rehab", "Реабилитация разума", "tech.e_neural_rehab", "tech.f_cognitive_enhancement", "tech.combo_mind_rehab", "E", 4, "stat"],
  ["species_oracle", "Оракул видов", "tech.e_species_design_labs", "tech.f_oracle_clusters", "tech.combo_species_oracle", "F", 5, "research"],
  ["memory_labs", "Лаборатории памяти", "tech.e_memory_inheritance", "tech.f_mnemonic_implants", "tech.combo_memory_labs", "F", 5, "prod"],
  ["survey_science", "Наука разведки недр", "tech.f_astronomy", "tech.a_mineral_surveying", "tech.combo_survey_science", "A", 1, "prop"],
  ["anomaly_prospect", "Аномальная разведка", "tech.f_anomaly_detection", "tech.a_anomaly_tapping", "tech.combo_anomaly_prospect", "A", 3, "flat"],
  ["ore_oracle_link", "Связь рудного оракула", "tech.f_hypothesis_engines", "tech.a_ore_oracle", "tech.combo_ore_oracle_link", "A", 5, "prop"],
  ["relic_seams", "Реликтовые жилы", "tech.f_relic_decoding", "tech.a_isotope_prospecting", "tech.combo_relic_seams", "F", 4, "flat"],
  ["extract_doctrine", "Логистика экстракции", "tech.a_mining_networks", "tech.a_ore_train_networks", "tech.combo_extract_logistics", "A", 4, "cap"],
  ["hull_doctrine", "Доктрина корпуса", "tech.b_ablative_hull_plates", "tech.b_layered_reactive_armor", "tech.combo_hull_doctrine", "B", 4, "stat"],
  ["yard_doctrine", "Доктрина верфей", "tech.c_fleet_batch_builds", "tech.c_rapid_repair_bays", "tech.combo_yard_doctrine", "C", 4, "stat"],
  ["grid_doctrine", "Доктрина сетей", "tech.d_power_grid_mgmt", "tech.d_grid_islanding", "tech.combo_grid_doctrine", "D", 3, "cap"],
  ["pop_doctrine", "Доктрина населения", "tech.e_population_growth", "tech.e_creche_networks", "tech.combo_pop_doctrine", "E", 4, "pop"],
  ["lab_doctrine", "Доктрина лабораторий", "tech.f_basic_research", "tech.f_experiment_schedulers", "tech.combo_lab_doctrine", "F", 4, "ap"],
];

/**
 * Live bridges — work against current technologies.json (no catalog migration).
 * Prefer unique tech.combo_live_* results so they don't collide with catalog stubs.
 */
const LIVE_BRIDGES = [
  // A–B
  ["live_geo_materials", "Гео-материалы", "tech.geology", "tech.materials_science", "tech.combo_live_geo_materials", "B", 1, "prod"],
  ["live_deep_pyro", "Глубинная пирометаллургия", "tech.deep_prospecting", "tech.pyrometallurgy", "tech.combo_live_deep_pyro", "B", 2, "prod"],
  ["live_asteroid_crystal", "Астероидный кристалл", "tech.asteroid_mining", "tech.crystal_integration", "tech.combo_live_asteroid_crystal", "A", 3, "flat"],
  ["live_anomaly_meta", "Аномальные метаматериалы", "tech.anomaly_tapping", "tech.metamaterials", "tech.combo_live_anomaly_meta", "B", 4, "prod"],
  ["live_geo_pyro", "Гео-плавка", "tech.geology", "tech.pyrometallurgy", "tech.combo_live_geo_pyro", "B", 2, "upkeep"],
  // B–C
  ["live_mat_industry", "Материалы цеха", "tech.materials_science", "tech.industrial_org", "tech.combo_live_mat_industry", "C", 1, "prod"],
  ["live_pyro_modular", "Модульная плавка", "tech.pyrometallurgy", "tech.modular_construction", "tech.combo_live_pyro_modular", "C", 2, "cost"],
  ["live_crystal_cyber", "Кристалл-кибернетика", "tech.crystal_integration", "tech.cybernetics", "tech.combo_live_crystal_cyber", "C", 3, "stat"],
  ["live_meta_nano", "Мета-нано", "tech.metamaterials", "tech.nanotech", "tech.combo_live_meta_nano", "C", 4, "prod"],
  ["live_black_iron_mega", "Чёрное железо мегаструктур", "tech.black_iron_forges", "tech.planetary_megastructures", "tech.combo_live_black_iron_mega", "C", 5, "flat"],
  ["live_cold_foundry_synth", "Холодный синтуплифт", "tech.hybrid.cold_foundry", "tech.synth.uplift", "tech.combo_live_cold_synth", "C", 3, "prod"],
  // C–D
  ["live_industry_grid", "Цех-сеть", "tech.industrial_org", "tech.energy_grid", "tech.combo_live_industry_grid", "D", 1, "prod"],
  ["live_modular_plasma", "Плазмо-модули", "tech.modular_construction", "tech.plasma_engineering", "tech.combo_live_modular_plasma", "D", 2, "stat"],
  ["live_cyber_fusion", "Кибер-термояд", "tech.cybernetics", "tech.fusion", "tech.combo_live_cyber_fusion", "D", 3, "prod"],
  ["live_nano_antimatter", "Нано-антиматерия", "tech.nanotech", "tech.antimatter", "tech.combo_live_nano_antimatter", "D", 4, "prod"],
  ["live_war_plasma", "Военная плазма", "tech.war_economy.doctrine", "tech.plasma_engineering", "tech.combo_live_war_plasma", "D", 2, "stat"],
  ["live_mega_singularity", "Мега-сингулярность", "tech.planetary_megastructures", "tech.antimatter_singularity", "tech.combo_live_mega_singularity", "D", 5, "cap"],
  // D–E
  ["live_grid_hydro", "Энерго-теплицы", "tech.energy_grid", "tech.hydroponics", "tech.combo_live_grid_hydro", "E", 1, "prod"],
  ["live_plasma_med", "Плазмомедицина", "tech.plasma_engineering", "tech.medicine", "tech.combo_live_plasma_med", "E", 2, "upkeep"],
  ["live_fusion_bio", "Био-термояд", "tech.fusion", "tech.biocatalysis", "tech.combo_live_fusion_bio", "E", 3, "prod"],
  ["live_antimatter_xeno", "Ксено-антиматерия", "tech.antimatter", "tech.xenobiology", "tech.combo_live_antimatter_xeno", "E", 4, "prop"],
  ["live_void_swarm", "Пустотный рой", "tech.hybrid.void_interface", "tech.swarm.adaptation", "tech.combo_live_void_swarm", "E", 3, "pop"],
  // E–F
  ["live_hydro_charter", "Хартия теплиц", "tech.hydroponics", "tech.scientific_charter", "tech.combo_live_hydro_charter", "F", 1, "research"],
  ["live_med_archaeology", "Медархеология", "tech.medicine", "tech.archaeology", "tech.combo_live_med_archaeology", "F", 2, "flat"],
  ["live_bio_psi", "Биопсионика", "tech.biocatalysis", "tech.psionics", "tech.combo_live_bio_psi", "F", 3, "prop"],
  ["live_xeno_corridors", "Ксено-коридоры", "tech.xenobiology", "tech.white_corridors", "tech.combo_live_xeno_corridors", "F", 4, "research"],
  ["live_med_psi", "Псио-генетика", "tech.medicine", "tech.psionics", "tech.combo_live_med_psi", "F", 2, "prop"],
  ["live_swarm_chorus", "Роевой хор", "tech.swarm.adaptation", "tech.psi_doctrine.chorus", "tech.combo_live_swarm_chorus", "F", 3, "stat"],
  // F–A (ring close)
  ["live_charter_geo", "Хартия недр", "tech.scientific_charter", "tech.geology", "tech.combo_live_charter_geo", "A", 1, "prop"],
  ["live_arch_deep", "Архео-скважины", "tech.archaeology", "tech.deep_prospecting", "tech.combo_live_arch_deep", "A", 2, "flat"],
  ["live_psi_asteroid", "Пси-астероиды", "tech.psionics", "tech.asteroid_mining", "tech.combo_live_psi_asteroid", "A", 3, "prod"],
  ["live_corridors_anomaly", "Коридоры аномалий", "tech.white_corridors", "tech.anomaly_tapping", "tech.combo_live_corridors_anomaly", "A", 4, "prop"],
  ["live_ai_geo", "ИИ-разведка недр", "tech.technocracy.ai_research", "tech.geology", "tech.combo_live_ai_geo", "A", 2, "research"],
  // same-category doctrines
  ["live_extract_chain", "Цепь экстракции", "tech.geology", "tech.deep_prospecting", "tech.combo_live_extract_chain", "A", 2, "cap"],
  ["live_alloy_chain", "Цепь сплавов", "tech.materials_science", "tech.pyrometallurgy", "tech.combo_live_alloy_chain", "B", 2, "prod"],
  ["live_yard_chain", "Цепь верфей", "tech.industrial_org", "tech.modular_construction", "tech.combo_live_yard_chain", "C", 2, "prod"],
  ["live_grid_chain", "Цепь сетей", "tech.energy_grid", "tech.plasma_engineering", "tech.combo_live_grid_chain", "D", 2, "cap"],
  ["live_life_chain", "Цепь жизни", "tech.hydroponics", "tech.medicine", "tech.combo_live_life_chain", "E", 2, "pop"],
  ["live_lab_chain", "Цепь лабораторий", "tech.scientific_charter", "tech.archaeology", "tech.combo_live_lab_chain", "F", 2, "research"],
];

function effectsFor(kind, cat) {
  const c = CAT[cat];
  switch (kind) {
    case "prod":
      return [{ effect: "production_mult", args: { resource: c.res, mult: 1.05 } }];
    case "flat":
      return [{ effect: "production_flat", args: { resource: c.res, amount: 1 } }];
    case "upkeep":
      return [{ effect: "upkeep_mult", args: { resource: c.res, mult: 0.95 } }];
    case "cap":
      return [{ effect: "capacity_add", args: { category: cat, amount: 1 } }];
    case "stat":
      return [{
        effect: "stat_mult",
        args: {
          stat: cat === "B" ? "armor" : cat === "D" ? "weapon_power" : "repair_rate",
          mult: 1.05,
        },
      }];
    case "prop":
      return [{ effect: "unlock_property", args: { property: `alchemy.${cat.toLowerCase()}_synergy` } }];
    case "cost":
      return [{ effect: "cost_mult", args: { mult: 0.95, tag: "build" } }];
    case "move":
      return [{ effect: "move_cost_mult", args: { mult: 0.95 } }];
    case "pop":
      return [{ effect: "pop_growth_mult", args: { mult: 1.05 } }];
    case "research":
      return [{ effect: "research_cost_mult", args: { mult: 0.95 } }];
    case "ap":
      return [{ effect: "ap_add", args: { amount: 1 } }];
    default:
      return [{ effect: "production_mult", args: { resource: c.res, mult: 1.05 } }];
  }
}

const combos = {};
const recipes = {};

function addCombo(result, name, cat, era, kind, a, b) {
  if (combos[result]) return;
  const c = CAT[cat];
  const breakthrough = era >= 5;
  const baseCost = ERA_COST[era] || 36;
  combos[result] = {
    id: result,
    name,
    category: cat,
    era,
    cost: { "currency.cognitio": baseCost },
    iconTag: c.icon,
    flavor: `Алхимический синтез: ${name}. Открывается только через лабораторию.`,
    tags: ["alchemy", "combo", "general"],
    prerequisites: [],
    alchemyOnly: true,
    alchemyOf: [a, b].slice().sort(),
    effects: effectsFor(kind, cat),
    balanceBudget: 0,
  };
  if (breakthrough) {
    combos[result].isBreakthrough = true;
  } else {
    combos[result].upgrades = [
      {
        id: `${result}.efficiency`,
        name: "Углубление синтеза",
        cost: { "currency.cognitio": Math.max(4, Math.round(baseCost * 0.5)) },
        effects: effectsFor("prod", cat),
        prerequisites: [],
        balanceBudget: 0,
      },
    ];
  }
}

function addRecipe(row, opts = {}) {
  const [key, name, a, b, result, cat, era, kind] = row;
  const ingredients = [a, b].slice().sort();
  const id = `recipe.${key}`;
  addCombo(result, name.replace(/ \(live\)$/, ""), cat, era, kind, a, b);
  recipes[id] = {
    id,
    name,
    ingredients,
    results: [result],
    era,
    tags: opts.live ? ["alchemy", "live_bridge"] : ["alchemy", "catalog"],
    costOverride: null,
    flavor: opts.live
      ? "Live-мост: ингредиенты из текущего technologies.json."
      : "Каталожный рецепт: ингредиенты появятся после миграции каталога.",
    discoverableBlind: era <= 3,
    catalogPending: !opts.live,
  };
}

for (const row of SEEDS) addRecipe(row);
for (const row of LIVE_BRIDGES) addRecipe(row, { live: true });

fs.writeFileSync(path.join(root, "tech_combos.json"), `${JSON.stringify(combos, null, 2)}\n`);
fs.writeFileSync(path.join(root, "tech_recipes.json"), `${JSON.stringify(recipes, null, 2)}\n`);
console.log(`tech_combos.json: ${Object.keys(combos).length}`);
console.log(`tech_recipes.json: ${Object.keys(recipes).length}`);
