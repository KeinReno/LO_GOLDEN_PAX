import { canAffordCost } from "../tech/afford.mjs";
import { adjustStock } from "../economy/adjustStock.mjs";

/**
 * NOT a port — new design from notes/2026-08-13-galaxy-migration-grill.md
 * (Q3/3a/3b/3c). GMap never had a slot-expansion mechanic (surfaceSlots/
 * orbitalSlots were static hand-placed numbers; confirmed no tech/building
 * /formula touches them). This module is the earned 5-grade ladder that
 * replaces those unearned counts: surface 8→48, orbital 4→12 on a
 * separate counter, advanced by a purchasable player action.
 *
 * Slot tables and upgrade costs live in content/core/economy_balance.json
 * (`planetGrade`). The arrays below are the documented first-pass defaults
 * used when content is omitted (unit tests); content wins when present.
 *
 * Instant, same shape as construction.mjs's placeBuilding — no multi-turn
 * construction queue (that system doesn't exist here either). "Turn cost"
 * from the grill is the currency spend, not a delay.
 */

export const MAX_GRADE = 5;

/** First-pass even steps: 8 / 18 / 28 / 38 / 48. Easy to invert by search. */
const DEFAULT_SURFACE_SLOTS = [8, 18, 28, 38, 48];
/** First-pass even steps on a smaller scale: 4 / 6 / 8 / 10 / 12. */
const DEFAULT_ORBITAL_SLOTS = [4, 6, 8, 10, 12];
/** First-pass costs for steps 1→2, 2→3, 3→4, 4→5. Index 0 unused. */
const DEFAULT_UPGRADE_COST = [
  null,
  { "currency.metal": 30, "currency.supply": 15 },
  { "currency.metal": 60, "currency.supply": 30 },
  { "currency.metal": 100, "currency.supply": 50 },
  { "currency.metal": 160, "currency.supply": 80 },
];

function clampGrade(grade) {
  const n = Math.floor(Number(grade) || 1);
  return Math.max(1, Math.min(MAX_GRADE, n));
}

function slotTable(content, key, fallback) {
  const table = content?.economy_balance?.planetGrade?.[key];
  return Array.isArray(table) && table.length >= MAX_GRADE ? table : fallback;
}

export function surfaceSlotsForGrade(grade, content) {
  const table = slotTable(content, "surfaceSlots", DEFAULT_SURFACE_SLOTS);
  return Number(table[clampGrade(grade) - 1]) || DEFAULT_SURFACE_SLOTS[0];
}

export function orbitalSlotsForGrade(orbitalGrade, content) {
  const table = slotTable(content, "orbitalSlots", DEFAULT_ORBITAL_SLOTS);
  return Number(table[clampGrade(orbitalGrade) - 1]) || DEFAULT_ORBITAL_SLOTS[0];
}

/**
 * Smallest grade whose surfaceSlots >= `needed`. Caps at MAX_GRADE — the
 * lookup the galaxy-migration script will use (Q3c: grade from migrated
 * building count). Exported so that later work doesn't have to reverse
 * the curve by hand.
 */
export function smallestGradeForSurfaceSlots(needed, content) {
  const n = Math.max(0, Number(needed) || 0);
  for (let g = 1; g <= MAX_GRADE; g++) {
    if (surfaceSlotsForGrade(g, content) >= n) return g;
  }
  return MAX_GRADE;
}

/** Same invert for the orbital curve (4→12). Caps at MAX_GRADE. */
export function smallestGradeForOrbitalSlots(needed, content) {
  const n = Math.max(0, Number(needed) || 0);
  for (let g = 1; g <= MAX_GRADE; g++) {
    if (orbitalSlotsForGrade(g, content) >= n) return g;
  }
  return MAX_GRADE;
}

export function gradeUpgradeCost(currentGrade, content) {
  const g = clampGrade(currentGrade);
  if (g >= MAX_GRADE) return null;
  const table = content?.economy_balance?.planetGrade?.upgradeCost;
  if (Array.isArray(table) && table[g]) return table[g];
  return DEFAULT_UPGRADE_COST[g];
}

function withDerivedSlots(planet, content) {
  const grade = clampGrade(planet.grade ?? 1);
  const orbitalGrade = clampGrade(planet.orbitalGrade ?? 1);
  return {
    ...planet,
    grade,
    orbitalGrade,
    surfaceSlots: surfaceSlotsForGrade(grade, content),
    orbitalSlots: orbitalSlotsForGrade(orbitalGrade, content),
  };
}

function spendCost(factionId, stocks, cost, reason) {
  let nextStocks = stocks;
  const journal = [];
  for (const [currencyId, amount] of Object.entries(cost || {})) {
    const n = Number(amount || 0);
    if (!n) continue;
    const result = adjustStock({ factionId, stocks: nextStocks }, currencyId, -n, { reason });
    nextStocks = result.stocks;
    if (result.journalEntry) journal.push(result.journalEntry);
  }
  return { stocks: nextStocks, journal };
}

function upgradeOne(planet, factionId, stocks, content, zone) {
  if (!planet?.ownerFactionId || planet.ownerFactionId !== factionId) {
    return { ok: false, error: "planet_not_owned" };
  }
  const isOrbital = zone === "orbital";
  const key = isOrbital ? "orbitalGrade" : "grade";
  const current = clampGrade(planet[key] ?? 1);
  if (current >= MAX_GRADE) return { ok: false, error: `max ${zone} grade reached` };

  const cost = gradeUpgradeCost(current, content);
  const afford = canAffordCost(stocks, cost);
  if (!afford.ok) return afford;

  const spent = spendCost(factionId, stocks, cost, "upgrade_grade");
  const nextPlanet = withDerivedSlots({ ...planet, [key]: current + 1 }, content);
  return { ok: true, planet: nextPlanet, stocks: spent.stocks, journal: spent.journal };
}

export function upgradeSurfaceGrade(planet, factionId, stocks, content) {
  return upgradeOne(planet, factionId, stocks, content, "surface");
}

export function upgradeOrbitalGrade(planet, factionId, stocks, content) {
  return upgradeOne(planet, factionId, stocks, content, "orbital");
}

export function derivePlanetSlots(planet, content) {
  return withDerivedSlots(planet, content);
}
