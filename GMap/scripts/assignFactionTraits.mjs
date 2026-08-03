/**
 * assignFactionTraits.mjs — назначает faction traits фракциям кампании
 * по курируемому маппингу (на основе лора из названий).
 * Соблюдает: max 3 trait-а, balanceBudget в [-2, 2].
 * Запуск: node scripts/assignFactionTraits.mjs
 * Флаг --apply — перезаписывает campaign JSON. Без флага — dry-run.
 */
import fs from "node:fs";
import { loadContent, getContent } from "../server/contentLoader.mjs";

const CAMPAIGN = "public/campaigns/lo_golden_pax.json";

/** Курируемый маппинг factionId → [traitId, ...] на основе лора. */
const MAPPING = {
  // Империи / милитаристы
  faction_belator: ["trait.war_economy", "trait.standing_army", "trait.void_navy"],
  faction_khanate: ["trait.standing_army", "trait.faction.aggressive"],
  faction_sahale: ["trait.void_navy", "trait.faction.expansionist"],
  // Федерации / дипломаты
  faction_federation: ["trait.faction.diplomatic", "trait.technocracy"],
  faction_amalfea: ["trait.faction.diplomatic", "trait.xenophile"],
  // Рой
  faction_north_swarm: ["trait.swarm_protocol"],
  faction_south_swarm: ["trait.swarm_protocol"],
  faction_nomad_f_6d6fb61623: ["trait.swarm_protocol"], // Вайсы (Рой)
  // Пираты / налётчики
  faction_pirates: ["trait.raider_lords", "trait.faction.aggressive"],
  faction_scavengers: ["trait.raider_lords"],
  // Торговые дома
  faction_free_traders: ["trait.merchant_guilds", "trait.faction.merchant"],
  faction_nomad_f_eb376e7120: ["trait.merchant_guilds"], // Союз Маркштейн
  faction_nomad_f_f8d3f947d6: ["trait.faction.merchant"], // Гничи (торг)
  faction_nomad_f_0610a823c5: ["trait.faction.merchant"], // Охи (торг)
  // Технократы
  faction_nomad_f_38366f84e5: ["trait.faction.technocrat"], // Трины (техно)
  // Экспансионисты
  faction_karned: ["trait.faction.expansionist", "trait.frontier_culture"],
  faction_nomad_f_08a06270a3: ["trait.faction.expansionist"], // Туран (экспанс)
  // Изоляционисты / вассалы
  "30af7a77-fcc0-4231-b4f6-5df0c7b1da7d": ["trait.faction.isolationist"], // Балсагон протекторат
  // Пуритане / ксенофобы (по умолчанию для закрытых фракций)
  faction_or: ["trait.xenophobe", "trait.faction.isolationist"],
};

loadContent(["core"]);
const content = getContent();
const traitDefs = content.faction_traits?.traits || {};

function budgetOf(traitIds) {
  return traitIds.reduce((s, id) => {
    const def = traitIds[id];
    return s + (Number(def?.balanceBudget) || 0);
  }, 0);
}

const apply = process.argv.includes("--apply");
const world = JSON.parse(fs.readFileSync(CAMPAIGN, "utf8"));
let assigned = 0;
let skipped = 0;

for (const f of world.factions) {
  const mapped = MAPPING[f.id];
  if (!mapped) {
    if (!f.traits || f.traits.length === 0) skipped++;
    continue;
  }
  // Валидация: trait-ы существуют, budget в диапазоне, max 3
  const valid = mapped.filter((id) => traitDefs[id]);
  const budget = valid.reduce((s, id) => s + (Number(traitDefs[id].balanceBudget) || 0), 0);
  if (valid.length > 3) {
    console.log(`WARN  ${f.id}: ${valid.length} trait-ов > 3, обрезано`);
    valid.length = 3;
  }
  if (budget < -2 || budget > 2) {
    console.log(`WARN  ${f.id}: budget=${budget} вне [-2,2] — пропущено`);
    continue;
  }
  const traitObjs = valid.map((id) => ({
    id,
    label: traitDefs[id].name || id,
    effects: traitDefs[id].effects || [],
    balanceBudget: Number(traitDefs[id].balanceBudget) || 0,
    ideology: traitDefs[id].ideology,
  }));
  if (apply) f.traits = traitObjs;
  console.log(
    `${apply ? "WRITE" : "DRY  "} ${f.id} | ${f.name} → [${valid.join(", ")}] budget=${budget}`,
  );
  assigned++;
}

if (apply) {
  fs.writeFileSync(CAMPAIGN, JSON.stringify(world, null, 2));
  console.log(`\nСохранено: ${assigned} фракциям назначены trait-ы.`);
} else {
  console.log(`\nDry-run: ${assigned} фракций получат trait-ы, ${skipped} без маппинга. Запусти с --apply для записи.`);
}
