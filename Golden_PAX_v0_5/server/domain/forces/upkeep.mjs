import { forceUpkeepRates } from "./forceCost.mjs";

/**
 * Ported from GMap/server/economyTick.mjs's `fleetUpkeep` — module-private
 * there (never exported), re-derived from source rather than diffed
 * directly. Takes plain `fleets`/`legions` arrays instead of a `world`
 * object (CLAUDE.md rule 3).
 *
 * GMap's real full tick only ever applies this function's `currency.metal`
 * part (ship upkeep) — legions' `currency.supply` part is deliberately
 * dropped there, because legion/fleet D/E upkeep is *also* fed into the
 * flow engine as category demand (see economyTick.mjs's comment "Supply
 * fleet/pop already represented as D/E demand in flows — avoid full
 * double"). This project hasn't ported the flow engine (see domain/
 * economy's README), so there is no D/E demand system standing in for
 * legion upkeep here — using BOTH currency.metal (ships) and
 * currency.supply (legions) from this function, unlike GMap's real tick,
 * is the correct match for what's actually implemented, not a deviation.
 *
 * @param {object[]} fleets  each { factionId, composition: [{defId, count}] }
 * @param {object[]} legions  same shape
 * @param {string} factionId
 * @param {object} content  needs .ships, .units, .economy_balance
 * @returns {{ "currency.metal": number, "currency.supply": number }}
 */
export function fleetUpkeep(fleets, legions, factionId, content) {
  const ships = content?.ships || {};
  const units = content?.units || {};
  const bal = content?.economy_balance;

  let metal = 0;
  for (const f of fleets ?? []) {
    if (f.factionId !== factionId) continue;
    const groups = f.composition ?? [];
    if (!groups.length) {
      metal += forceUpkeepRates(bal, "ship", 1, 1).metal;
      continue;
    }
    for (const g of groups) {
      const def = ships[g.defId] || ships[g.type];
      const tier = Number(def?.tier ?? g.tier ?? 1) || 1;
      metal += forceUpkeepRates(bal, "ship", tier, g.count || 0).metal;
    }
  }

  let supply = 0;
  for (const l of legions ?? []) {
    if (l.factionId !== factionId) continue;
    const groups = l.composition ?? [];
    if (!groups.length) {
      supply += Math.ceil(forceUpkeepRates(bal, "unit", 2, l.strength || 1).e);
      continue;
    }
    for (const g of groups) {
      const def = units[g.defId] || units[g.type];
      const tier = Number(def?.tier ?? g.tier ?? 2) || 2;
      supply += forceUpkeepRates(bal, "unit", tier, g.count || 0).e;
    }
  }

  return {
    "currency.metal": Math.ceil(metal),
    "currency.supply": Math.ceil(supply),
  };
}
