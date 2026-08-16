import { planetAllowsBuildingBiome } from "./biomeMatch.mjs";
import { canFactionBuildDef, raceIdsFromComposition } from "./buildingAccess.mjs";
import { canAffordCost } from "../tech/afford.mjs";
import { adjustStock } from "../economy/adjustStock.mjs";
import { orbitalSlotsForGrade, surfaceSlotsForGrade } from "./planetGrade.mjs";
import { canBuildWithTech } from "../tech/techGate.mjs";

/** Ported verbatim from GMap/server/planetActions.mjs's countBuildingInSystem. */
function countBuildingInSystem(system, buildingId) {
  let n = 0;
  for (const p of system?.planets || []) {
    for (const b of [...(p.surfaceBuildings || []), ...(p.orbitalBuildings || [])]) {
      if (b?.disabled) continue;
      if (b.buildingId === buildingId || b.baseBuildingId === buildingId) n += 1;
    }
  }
  return n;
}

/** Grade is the source of truth when set; stored slots remain a denormalized fallback. */
function zoneSlotCap(planet, listKey) {
  if (listKey === "orbitalBuildings") {
    return planet.orbitalGrade != null ? orbitalSlotsForGrade(planet.orbitalGrade) : (planet.orbitalSlots ?? 4);
  }
  return planet.grade != null ? surfaceSlotsForGrade(planet.grade) : (planet.surfaceSlots ?? 8);
}

/**
 * Whether `factionId` may place `def` (a content/core/buildings.json entry)
 * on `planet` right now — the real placement rules from GMap's
 * applyPlanetAction's "build" branch (slot capacity, per-planet/per-system
 * limits, biome, faction/race access, tech tier), minus racial-variant
 * resolution (GMap's variantResolver.mjs). Behavior-tested (this exact
 * rule sequence was inline in GMap, not its own function).
 *
 * `techAccount` is optional — omitting it (or passing one with no
 * `techTiers`) is equivalent to a faction that has researched nothing yet
 * (tier cap 3 in every category, `domain/tech/techGate.mjs`'s own
 * fallback), the correct default, not a bypass. Found live 2026-08-14:
 * before this parameter existed, NOTHING anywhere in domain/planets ever
 * read tech tiers — see notes/2026-08-14-tech-tree-audit.md.
 */
export function canPlaceBuilding(system, planet, def, factionId, techAccount) {
  if (!planetAllowsBuildingBiome(planet, def.biome_restrictions)) {
    return { ok: false, error: `requires biome: ${(def.biome_restrictions || []).join(", ")}` };
  }
  if (!canFactionBuildDef(def, factionId, { raceIds: raceIdsFromComposition(planet.raceComposition) })) {
    return { ok: false, error: "not available to your faction" };
  }
  const techGate = canBuildWithTech(techAccount, def);
  if (!techGate.ok) return techGate;

  const listKey = def.zone === "orbital" ? "orbitalBuildings" : "surfaceBuildings";
  const zone = def.zone || "surface";
  const list = planet[listKey] ?? [];
  const max = zoneSlotCap(planet, listKey);
  if (list.length >= max) return { ok: false, error: `no free slots (${zone})` };

  if (def.maxPerPlanet) {
    const all = [...(planet.surfaceBuildings ?? []), ...(planet.orbitalBuildings ?? [])];
    const same = all.filter((b) => (b.buildingId === def.id || b.baseBuildingId === def.id) && !b.disabled).length;
    if (same >= def.maxPerPlanet) return { ok: false, error: `per-planet limit reached for "${def.name}"` };
  }
  if (def.maxPerSystem) {
    if (countBuildingInSystem(system, def.id) >= def.maxPerSystem) {
      return { ok: false, error: `per-system limit reached for "${def.name}"` };
    }
  }
  return { ok: true };
}

/**
 * Place a building: pay its cost, add the instance to the planet's
 * surface/orbital list. Scoped like colonization.mjs — real affordability
 * and placement rules, no AP gating/intents (see README.md "Status").
 *
 * @param {object} system @param {object} planet @param {object} def  a buildings.json entry
 * @param {string} factionId @param {Record<string, number>} stocks @param {object} content
 * @param {object} [techAccount]  see canPlaceBuilding's header
 */
export function placeBuilding(system, planet, def, factionId, stocks, content, techAccount) {
  const gate = canPlaceBuilding(system, planet, def, factionId, techAccount);
  if (!gate.ok) return gate;

  const cost = def.cost || {};
  const afford = canAffordCost(stocks, cost);
  if (!afford.ok) return afford;

  let nextStocks = stocks;
  const journal = [];
  for (const [currencyId, amount] of Object.entries(cost)) {
    const n = Number(amount || 0);
    if (!n) continue;
    const result = adjustStock({ factionId, stocks: nextStocks }, currencyId, -n, { reason: "build" });
    nextStocks = result.stocks;
    if (result.journalEntry) journal.push(result.journalEntry);
  }

  const zone = def.zone || "surface";
  const listKey = zone === "orbital" ? "orbitalBuildings" : "surfaceBuildings";
  const instance = { id: `bld_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`, buildingId: def.id, name: def.name, kind: def.kind, zone };
  const nextPlanet = { ...planet, [listKey]: [...(planet[listKey] ?? []), instance] };

  return { ok: true, planet: nextPlanet, stocks: nextStocks, journal, building: instance };
}
