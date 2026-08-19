/**
 * Выдать логичные технологии Белатору / Амальфее / Карнеду под развитие ~ход 20.
 *
 * Принцип:
 * - era 1–3 по профилю заполняем плотно;
 * - era 4 — точечно под доктрину;
 * - era 5 / planet-cracking / dyson — не трогаем (ранний эндгейм);
 * - Амальфея: без псионики и белых коридоров (II.18);
 * - raceLock проверяем по доле населения (≥30%).
 *
 * Run: node GMap/scripts/grantTechsTurn20.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadContent, getContent } from "../server/contentLoader.mjs";
import { recomputeUnlocksFromTechs } from "../server/techActions.mjs";
import { computeFlowBreakdown } from "../server/economyTick.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const LEDGER = path.join(ROOT, "data/ledger.json");
const WORLD = path.join(ROOT, "data/published.json");
const TURN_TAG = "canon_t20";

/** Белатор: военная экономика, верфи, пси-линия, логистика империи. */
const BELATOR = [
  // Materia / броня / сплавы
  "tech.b_metallurgy",
  "tech.b_basic_alloys",
  "tech.b_alloy_refinement",
  "tech.b_composite_materials",
  "tech.b_ceramic_engineering",
  "tech.b_material_recycling",
  "tech.b_surface_treatment",
  "tech.b_advanced_composites",
  "tech.b_self_healing_alloys",
  "tech.b_plasma_forging",
  "tech.b_exotic_alloys",
  "tech.b_ablative_hull_plates",
  "tech.b_layered_reactive_armor",
  "tech.b_radiation_hard_ceramics",
  // Industria / верфи / военпром
  "tech.c_automation",
  "tech.c_robotic_assembly",
  "tech.c_quality_control",
  "tech.c_lean_manufacturing",
  "tech.c_just_in_time",
  "tech.c_construction_robotics",
  "tech.c_orbital_manufacturing",
  "tech.c_zero_g_fabrication",
  "tech.c_drydock_expansion",
  "tech.c_prefab_bay_standards",
  "tech.c_fleet_batch_builds",
  "tech.c_rapid_repair_bays",
  "tech.c_spare_parts_caches",
  "tech.c_siege_works_kits",
  "tech.c_civilian_yard_conversion",
  "tech.c_hull_section_rails",
  "tech.c_mobile_shipyards",
  // Energia / флотское питание
  "tech.d_fusion_power",
  "tech.d_plasma_containment",
  "tech.d_magnetic_confinement",
  "tech.d_superconducting_lines",
  "tech.d_fusion_reactors",
  "tech.d_plasma_fusion",
  "tech.d_pulse_capacitors",
  "tech.d_reactor_safeguards",
  "tech.d_capacitor_banks",
  "tech.d_fleet_tanker_doctrine",
  "tech.d_overcharge_protocols",
  "tech.d_heat_sink_armor",
  "tech.d_plasma_thruster_stacks",
  // Bios / мобилизация
  "tech.e_population_growth",
  "tech.e_cloning",
  "tech.e_crowd_health_nets",
  "tech.e_clone_draft_pools",
  "tech.e_creche_networks",
  "tech.e_pandemic_filters",
  "tech.e_neural_rehab",
  // Cognitio / пси + штаб
  "tech.f_scientific_method",
  "tech.f_basic_research",
  "tech.f_data_analysis",
  "tech.f_astronomy",
  "tech.f_quantum_mechanics",
  "tech.f_advanced_research",
  "tech.f_experimental_physics",
  "tech.f_psionic_theory",
  "tech.f_psionic_practices",
  "tech.f_psionic_amplification",
  "tech.f_psionic_networks",
  "tech.f_counterintel_labs",
  "tech.f_doctrine_simulators",
  "tech.f_relic_decoding",
  "tech.f_psi_shield_training",
  // общие зрелые
  "tech.metamaterials",
  "tech.nanotech",
  "tech.anomaly_tapping",
];

/** Амальфея: биотех / кибер / кристаллы / симбиоз; БЕЗ пси. */
const AMALFEA = [
  // Extracta / кристаллы и редкозем
  "tech.a_deep_drilling",
  "tech.a_geological_scanning",
  "tech.a_resource_mapping",
  "tech.a_subsurface_extraction",
  "tech.a_mineral_surveying",
  "tech.a_automated_miners",
  "tech.a_ore_refinement",
  "tech.a_crystal_resonance",
  "tech.a_orbital_extraction",
  "tech.a_tailings_reprocessing",
  // Materia / биокомпозиты
  "tech.b_metallurgy",
  "tech.b_basic_alloys",
  "tech.b_composite_materials",
  "tech.b_crystal_growing",
  "tech.b_bio_composites",
  "tech.b_nanomaterials",
  "tech.b_polymer_synthesis",
  "tech.b_smart_materials",
  "tech.b_self_healing_alloys",
  "tech.b_molecular_assembly",
  // Industria / интеграция без мегафлота
  "tech.c_automation",
  "tech.c_quality_control",
  "tech.c_industrial_sensors",
  "tech.c_construction_robotics",
  "tech.c_industrial_symbiosis",
  "tech.c_advanced_automation",
  "tech.c_nano_assembly",
  // Energia
  "tech.d_energy_storage",
  "tech.d_fission_reactors",
  "tech.d_fusion_power",
  "tech.d_energy_recycling",
  "tech.d_energy_crystals",
  "tech.d_fusion_reactors",
  "tech.d_quantum_batteries",
  "tech.d_distributed_microgrids",
  "tech.d_reactor_safeguards",
  // Bios — ядро Амальфеи
  "tech.e_population_growth",
  "tech.e_cloning",
  "tech.e_genetic_diversity",
  "tech.e_gene_editing",
  "tech.e_genetic_optimization",
  "tech.e_synthetic_biology",
  "tech.e_bioaugmentation",
  "tech.e_cybernetic_enhancement",
  "tech.e_neural_interfaces",
  "tech.e_bio_computing",
  "tech.e_ecosystem_engineering",
  "tech.e_terraforming",
  "tech.e_gene_bank_vaults",
  "tech.e_xenobiological_integration",
  "tech.e_habitat_biome_kits",
  "tech.e_synthetic_life",
  "tech.e_bio_digital_fusion",
  "tech.e_symbiote_labor",
  "tech.e_biosphere_patching",
  "tech.e_longevity_clinics",
  "tech.e_creche_networks",
  "tech.e_exowomb_arrays",
  "tech.e_xeno_diet_adapt",
  // Cognitio (без пси)
  "tech.f_scientific_method",
  "tech.f_basic_research",
  "tech.f_data_analysis",
  "tech.f_advanced_research",
  "tech.f_ai_research",
  "tech.f_neural_networks",
  "tech.f_information_theory",
  "tech.f_quantum_computing",
  "tech.f_lab_safety_codes",
  "tech.f_field_expeditions",
  "tech.f_open_science_pacts",
  // общие + синт-линия
  "tech.metamaterials",
  "tech.nanotech",
  "tech.synth.uplift",
];

/** Карнед: камень, руда, литьё, промышленный фронтир, торг. */
const KARNED = [
  // Extracta — главный профиль
  "tech.a_deep_drilling",
  "tech.a_geological_scanning",
  "tech.a_resource_mapping",
  "tech.a_resource_sensors",
  "tech.a_mineral_surveying",
  "tech.a_subsurface_extraction",
  "tech.a_automated_miners",
  "tech.a_ore_refinement",
  "tech.a_mineral_catalysts",
  "tech.a_geothermal_tapping",
  "tech.a_orbital_extraction",
  "tech.a_crystal_mining",
  "tech.a_rare_earth_extraction",
  "tech.a_magnetic_separation",
  "tech.a_ore_enrichment",
  "tech.a_plasma_drilling",
  "tech.a_orbital_refineries",
  "tech.a_tailings_reprocessing",
  "tech.a_mass_driver_lift",
  "tech.a_strip_mine_logistics",
  "tech.a_ore_train_networks",
  "tech.a_slag_reclamation",
  "tech.a_high_g_drills",
  "tech.a_fault_line_extractors",
  // Materia
  "tech.b_metallurgy",
  "tech.b_basic_alloys",
  "tech.b_alloy_refinement",
  "tech.b_ceramic_engineering",
  "tech.b_chemical_processing",
  "tech.b_material_recycling",
  "tech.b_material_testing",
  "tech.b_composite_materials",
  "tech.b_surface_treatment",
  "tech.b_advanced_composites",
  "tech.b_metallic_glass",
  "tech.b_plasma_forging",
  "tech.b_exotic_alloys",
  "tech.b_stress_test_alloys",
  "tech.b_scrap_to_billet",
  "tech.b_pressure_cast_frames",
  "tech.b_isotope_enriched_steel",
  // Industria
  "tech.c_factory_networks",
  "tech.c_supply_chain_mgmt",
  "tech.c_automation",
  "tech.c_quality_control",
  "tech.c_lean_manufacturing",
  "tech.c_material_handling",
  "tech.c_industrial_sensors",
  "tech.c_construction_robotics",
  "tech.c_planetary_forges",
  "tech.c_orbital_manufacturing",
  "tech.c_asteroid_forges",
  "tech.c_advanced_automation",
  "tech.c_industrial_ai",
  "tech.c_spare_parts_caches",
  "tech.c_printer_foundries",
  "tech.c_build_queue_optimizers",
  // Energia / гео
  "tech.d_thermal_efficiency",
  "tech.d_energy_storage",
  "tech.d_fission_reactors",
  "tech.d_fusion_power",
  "tech.d_energy_recycling",
  "tech.d_fusion_reactors",
  "tech.d_waste_heat_radiators",
  "tech.d_distributed_microgrids",
  "tech.d_reactor_safeguards",
  "tech.d_blackout_resilience",
  // Bios — достаточно для горняцких миров
  "tech.e_population_growth",
  "tech.e_bio_recycling",
  "tech.e_ecosystem_mgmt",
  "tech.e_crowd_health_nets",
  "tech.e_rad_tolerant_crops",
  "tech.e_deep_ocean_farms",
  // Cognitio
  "tech.f_scientific_method",
  "tech.f_basic_research",
  "tech.f_data_analysis",
  "tech.f_advanced_research",
  "tech.f_experimental_physics",
  "tech.f_lab_safety_codes",
  "tech.f_field_expeditions",
  "tech.f_predictive_models",
  // общие под камень/кристаллы
  "tech.crystal_integration",
  "tech.cybernetics",
  "tech.metamaterials",
  "tech.hybrid.cold_foundry",
];

const PACKS = {
  faction_belator: BELATOR,
  faction_amalfea: AMALFEA,
  faction_karned: KARNED,
};

const AMALFEA_DENY =
  /psionic|psi_|white_corridor|white_gate|psi_doctrine|psi_armada/i;

function factionRaceSharePercent(world, factionId, raceId) {
  let total = 0;
  let race = 0;
  for (const s of world.systems || []) {
    if (s.ownerFactionId !== factionId) continue;
    for (const p of s.planets || []) {
      const pop = Number(p.population || 0);
      if (pop <= 0) continue;
      total += pop;
      for (const share of p.raceComposition || []) {
        if (share.raceId === raceId) {
          race += (pop * Number(share.percent || 0)) / 100;
        }
      }
    }
  }
  if (total <= 0) return 0;
  return (race / total) * 100;
}

function traitIdsOf(faction) {
  if (!faction) return [];
  if (Array.isArray(faction.traitIds)) return faction.traitIds;
  return (faction.traits || []).map((t) => (typeof t === "string" ? t : t.id)).filter(Boolean);
}

function canGrant(def, id, { world, factionId, faction }) {
  if (!def) return { ok: false, reason: "missing" };
  if (def.catalogPending) return { ok: false, reason: "catalogPending" };
  if (factionId === "faction_amalfea" && AMALFEA_DENY.test(id)) {
    return { ok: false, reason: "amalfea-no-psi" };
  }
  if (def.raceLock) {
    const pct = factionRaceSharePercent(world, factionId, def.raceLock);
    if (pct < 30) return { ok: false, reason: `raceLock ${def.raceLock} ${pct.toFixed(1)}%` };
  }
  if (def.factionTraitLock) {
    if (!traitIdsOf(faction).includes(def.factionTraitLock)) {
      return { ok: false, reason: `traitLock ${def.factionTraitLock}` };
    }
  }
  return { ok: true };
}

function grantFaction(eco, factionId, pack, world, content) {
  const techs = content.technologies || {};
  const faction = (world.factions || []).find((f) => f.id === factionId);
  const before = new Set(eco.unlockedTechs || []);
  const added = [];
  const skipped = [];

  for (const id of pack) {
    const def = techs[id];
    const gate = canGrant(def, id, { world, factionId, faction });
    if (!gate.ok) {
      skipped.push(`${id} (${gate.reason})`);
      continue;
    }
    if (!before.has(id)) added.push(id);
    before.add(id);
  }

  if (factionId === "faction_amalfea") {
    for (const id of [...before]) {
      if (AMALFEA_DENY.test(id)) {
        before.delete(id);
        skipped.push(`${id} (stripped-psi)`);
      }
    }
  }

  eco.unlockedTechs = [...before].sort();
  eco.acquiredTechs = Array.isArray(eco.acquiredTechs) ? eco.acquiredTechs : [];
  for (const id of added) {
    if (!eco.acquiredTechs.some((a) => a && a.techId === id)) {
      eco.acquiredTechs.push({
        techId: id,
        source: TURN_TAG,
        at: world.meta?.turn ?? 20,
      });
    }
  }

  recomputeUnlocksFromTechs(eco, content, factionId, world);

  // мягкий пол под игровые здания t20
  const floors = {
    faction_belator: { A: 6, B: 7, C: 8, D: 7, E: 7, F: 8 },
    faction_amalfea: { A: 6, B: 6, C: 6, D: 6, E: 8, F: 6 },
    faction_karned: { A: 8, B: 7, C: 7, D: 6, E: 6, F: 5 },
  };
  for (const [k, v] of Object.entries(floors[factionId] || {})) {
    eco.techTiers[k] = Math.max(Number(eco.techTiers[k] ?? 1), v);
  }

  return { added, skipped, total: eco.unlockedTechs.length, tiers: { ...eco.techTiers } };
}

loadContent();
const content = getContent();
const world = JSON.parse(fs.readFileSync(WORLD, "utf8"));
const led = JSON.parse(fs.readFileSync(LEDGER, "utf8"));

for (const [factionId, pack] of Object.entries(PACKS)) {
  const eco = led.factions[factionId];
  if (!eco) {
    console.warn("no ledger", factionId);
    continue;
  }
  const r = grantFaction(eco, factionId, pack, world, content);
  console.log("\n===", factionId, "===");
  console.log("added", r.added.length, "total", r.total, "tiers", r.tiers);
  if (r.added.length) console.log(" +", r.added.join("\n + "));
  if (r.skipped.length) console.log(" skip", r.skipped.join(" | "));

  const bd = computeFlowBreakdown(world, factionId, content, eco);
  const nets = Object.fromEntries(
    Object.entries(bd.totals).map(([k, v]) => [k, Math.round(v.net * 10) / 10]),
  );
  console.log("NETS", nets, "all+", Object.values(bd.totals).every((v) => v.net >= 0));
}

fs.writeFileSync(LEDGER, JSON.stringify(led, null, 2) + "\n", "utf8");
console.log("\nwrote ledger.json");
