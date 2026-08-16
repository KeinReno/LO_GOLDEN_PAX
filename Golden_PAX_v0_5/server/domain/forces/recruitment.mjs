import { produceForceCost } from "./forceCost.mjs";
import { systemHasShipyard, systemHasBarracks } from "./buildingGate.mjs";
import { mobilizableRecruits, populationCostForRaise, crewCountForRaise } from "./recruits.mjs";
import { canAffordCost } from "../tech/afford.mjs";
import { adjustStock } from "../economy/adjustStock.mjs";

/**
 * Whether `factionId` may raise `def` (a ships.json/units.json entry) on
 * `planet` right now. NOT a port — new design (grill Q10/Q12). A def
 * flagged `raisableWithoutBuilding` (currently only `unit.militia` — the
 * baseline levy, raisable for emergency defense with zero infrastructure)
 * skips the building gate entirely; everything else reuses GMap's real
 * building gate verbatim (`systemHasShipyard` for kind:"ship",
 * `systemHasBarracks` for kind:"unit" — see buildingGate.mjs).
 *
 * Tech Tree 2.0 Priority 5a (NOT a port — GMap's raise path never checked
 * tech): if `def.requiresTech` is set, `techAccount.unlockedTechs` must
 * include it. Omitting `techAccount` is "nothing researched", not a bypass
 * (same convention as construction.mjs's tier-gate).
 *
 * Priority 5b weapon-type slots (NOT a port of GMap slotResolver): GMap
 * DOES consume `slots[]` at runtime, but as resource-fill matching
 * (`GMap/server/slotResolver.mjs`, planetActions fill-slot, forcesActions
 * `slotNeedForRole`, combatResolve `slotDefs`). That is an economy/
 * resource-slot system, not a weapon-type equipment inventory. This pass
 * does not port slotResolver. Weapon types are `unlock_property` ids
 * (`weapon.plasma`, etc.). Raising a unit/ship whose slots require a
 * dotted `weapon.*` property (not the generic always-available `"weapon"`
 * / `"weapon_amp"`) is blocked until that property is on
 * `techAccount.unlockedProperties`. Content authoring of which units
 * require which weapon types is a later pass.
 */
export function canRaiseUnit(system, planet, def, kind, factionId, techAccount) {
  if (planet.ownerFactionId !== factionId) return { ok: false, error: "not your planet" };
  if (!def?.raisableWithoutBuilding) {
    const gated = kind === "ship" ? systemHasShipyard(system, factionId) : systemHasBarracks(system, factionId);
    if (!gated) return { ok: false, error: kind === "ship" ? "requires a shipyard/spaceport" : "requires a barracks" };
  }
  if (def?.requiresTech) {
    const unlocked = techAccount?.unlockedTechs || [];
    if (!unlocked.includes(def.requiresTech)) {
      return { ok: false, error: `requires tech: ${def.requiresTech}` };
    }
  }
  const missingWeapon = missingWeaponProperty(def, techAccount);
  if (missingWeapon) return { ok: false, error: `requires property: ${missingWeapon}` };
  return { ok: true };
}

/** Dotted weapon-type properties (`weapon.plasma`), not the generic `"weapon"` base. */
function missingWeaponProperty(def, techAccount) {
  const have = new Set(techAccount?.unlockedProperties || []);
  for (const slot of def?.slots || []) {
    for (const prop of slot.require?.properties || []) {
      if (typeof prop !== "string" || !prop.startsWith("weapon.")) continue;
      if (!have.has(prop)) return prop;
    }
  }
  return null;
}

/**
 * Raise `count` of `def` from a planet's population — where legions/fleets
 * actually come from (grill Q7-Q11's "Легион и флот откуда берется? Пока
 * тоже из воздуха" complaint). NOT a port: GMap's `forcesActions.mjs` only
 * ever edits an EXISTING fleet/legion's composition against currency —
 * it explicitly refuses to create new units ("Нельзя создавать юниты
 * напрямую"), so there's no prior creation flow to preserve here.
 *
 * Costs recruits AND currency together (grill Q8), additively:
 * - recruits: 1 population-unit per unit raised within the planet's
 *   mobilization ceiling (recruits.mjs) — a real, permanent transfer out
 *   of the planet's population, same as domain/planets' colonization
 *   transfers. Race composition percentages are left as-is (unlike
 *   colonization's race-targeted deduction, recruiting isn't
 *   race-specific — it draws proportionally across whichever population
 *   is already there, same as natural growth/emigration already do).
 *   `opts.overrideCeiling` (grill Q10) lets the caller push past the
 *   ceiling: overflow recruits still produce 1 unit each, but cost
 *   extra population via `populationCostForRaise`. First-pass default.
 * - currency: `produceForceCost` — GMap's real formula, unchanged
 *   (charged per unit raised, not per population spent).
 *
 * No AP gating (this project hasn't ported GMap's AP-budget system, same
 * scope cut as domain/planets' colonize/build).
 *
 * @param {object} system @param {object} planet @param {object} def  a ships.json/units.json entry
 * @param {"ship"|"unit"} kind
 * @param {string} factionId @param {number} count
 * @param {Record<string, number>} stocks @param {object} content
 * @param {{ overrideCeiling?: boolean, techAccount?: object }} [opts]
 * @returns {{ ok: boolean, error?: string, planet?: object, stocks?: object, journal?: object[], group?: object }}
 */
export function raiseUnit(system, planet, def, kind, factionId, count, stocks, content, opts = {}) {
  const gate = canRaiseUnit(system, planet, def, kind, factionId, opts.techAccount);
  if (!gate.ok) return gate;

  const n = Math.max(1, Math.floor(Number(count) || 0));
  const mobilizationRate = content?.economy_balance?.forces?.mobilizationRate ?? 0.3;
  const ceiling = mobilizableRecruits(planet, mobilizationRate);
  const overrideCeiling = opts.overrideCeiling === true;
  // Ship raises also mobilize a militia-shaped crew (boarding.mjs). Crew
  // is real recruitment against the same ceiling, not a free floating
  // formula at boarding time.
  const crewCount = crewCountForRaise(kind, def, n, content?.economy_balance?.forces?.crewPerTier);
  const recruitAsk = n + crewCount;
  if (!overrideCeiling && ceiling < recruitAsk) {
    return { ok: false, error: `not enough mobilizable population (have ${ceiling}, need ${recruitAsk})` };
  }

  const popCost = populationCostForRaise(recruitAsk, ceiling, overrideCeiling);
  const pop = Number(planet.population) || 0;
  if (popCost > pop) {
    return { ok: false, error: `not enough population for raise (have ${pop}, need ${popCost})` };
  }

  const cost = produceForceCost(content?.economy_balance, kind, def, n);
  const afford = canAffordCost(stocks, cost);
  if (!afford.ok) return afford;

  let nextStocks = stocks;
  const journal = [];
  for (const [currencyId, amount] of Object.entries(cost)) {
    const amt = Number(amount || 0);
    if (!amt) continue;
    const result = adjustStock({ factionId, stocks: nextStocks }, currencyId, -amt, { reason: "raise_unit" });
    nextStocks = result.stocks;
    if (result.journalEntry) journal.push(result.journalEntry);
  }

  const nextPlanet = { ...planet, population: Math.max(0, pop - popCost) };
  const stats = def.stats || {};
  // tier is carried on the group (not just the def) so upkeep.mjs can compute
  // per-turn cost later without needing the original def around.
  const group = { defId: def.id, tier: Number(def.tier) || 1, roles: def.roles || [], count: n, ...stats, maxHp: stats.hp ?? 0 };
  if (kind === "ship") group.crewCount = crewCount;

  return { ok: true, planet: nextPlanet, stocks: nextStocks, journal, group };
}

/**
 * Disband `count` units, returning that much population to the planet
 * (grill's open "demobilization" flag, resolved minimally: population
 * comes back, no currency refund — GMap's disband-refund model belongs to
 * its much larger arbitrary-composition-edit system, forcesActions.mjs,
 * which isn't ported here, see README.md).
 */
export function disbandUnits(planet, count) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  return { ...planet, population: (Number(planet.population) || 0) + n };
}

/**
 * Reduce a force's composition by `count` units. NOT a port — the raise
 * route always creates a one-group force, but a force can grow multiple
 * groups later (or after combat leftovers). Domain owns this so the
 * HTTP route stays a thin persist wrapper (CLAUDE.md rule 3).
 *
 * - `defId` omitted: reduce the last group (legacy LIFO). `count` omitted
 *   means the whole composition.
 * - `defId` set: reduce the last group with that defId only (no spill to
 *   other groups). `count` omitted means that whole group.
 *
 * `disbandedCount` is the actual units removed (what `disbandUnits` should
 * return as population) — never more than the targeted group's count.
 *
 * @param {object[]} composition
 * @param {number} [count]
 * @param {string} [defId]
 * @returns {{ ok: boolean, error?: string, composition?: object[], disbandedCount?: number }}
 */
export function reduceComposition(composition, count, defId) {
  const groups = Array.isArray(composition) ? composition.map((g) => ({ ...g })) : [];
  const total = groups.reduce((s, g) => s + (Number(g.count) || 0), 0);

  if (!defId && (count == null || count >= total)) {
    return { ok: true, composition: [], disbandedCount: total };
  }

  let idx = -1;
  if (defId) {
    for (let i = groups.length - 1; i >= 0; i--) {
      if (groups[i].defId === defId) {
        idx = i;
        break;
      }
    }
    if (idx < 0) return { ok: false, error: `no group with defId ${defId}` };
  } else {
    idx = groups.length - 1;
    if (idx < 0) return { ok: true, composition: [], disbandedCount: 0 };
  }

  const groupCount = Number(groups[idx].count) || 0;
  const take = count == null ? groupCount : Math.min(Math.max(0, Math.floor(Number(count) || 0)), groupCount);
  groups[idx] = { ...groups[idx], count: groupCount - take };
  return { ok: true, composition: groups.filter((g) => (g.count || 0) > 0), disbandedCount: take };
}
