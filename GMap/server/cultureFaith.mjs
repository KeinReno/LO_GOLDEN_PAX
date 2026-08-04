/**
 * Culture & faith effects — data-driven from cultures.json / faiths.json.
 */
import { factionHasProperty } from "./techActions.mjs";

function cultureDef(content, cultureId) {
  const id = cultureId || "culture.baseline";
  return content?.cultures?.cultures?.[id] || content?.cultures?.[id] || null;
}

function faithDef(content, faithId) {
  return content?.faiths?.faiths?.[faithId] || content?.faiths?.[faithId] || null;
}

function pushTraitEffects(out, traitList, sourceKind, sourceId, label, weight = 1) {
  for (const trait of traitList || []) {
    for (const eff of trait.effects || []) {
      out.push({
        ...eff,
        source: {
          kind: sourceKind,
          id: `${sourceId}:${trait.id || sourceId}`,
          label,
        },
        _weight: weight,
      });
    }
  }
  // flat culture/faith defs use effects[] directly on root
}

function propertyLabel(content, propertyId) {
  return (
    content?.economy_schema?.properties?.[propertyId]?.label ?? propertyId
  );
}

/** Collect culture effects for a planet (single cultureId). */
export function collectCultureEffects(content, cultureId, opts = {}) {
  const def = cultureDef(content, cultureId);
  if (!def) return [];
  const out = [];
  const label = def.name || cultureId;
  if (Array.isArray(def.effects) && def.effects.length) {
    for (const eff of def.effects) {
      out.push({
        ...eff,
        source: { kind: "culture", id: def.id, label },
      });
    }
  }
  pushTraitEffects(out, def.traits, "culture", def.id, label);
  if (opts.raceId && def.compatibleRaces?.length) {
    if (!def.compatibleRaces.includes(opts.raceId)) {
      out.push({
        effect: "loyalty_add",
        args: { amount: -1 },
        source: {
          kind: "culture",
          id: `${def.id}:mismatch`,
          label: `${label} (чужая раса)`,
        },
      });
    }
  }
  return out;
}

/** Weighted faith shares: [{ faithId, percent }]. */
export function collectFaithEffects(content, faithShares, eco, opts = {}) {
  const out = [];
  for (const row of faithShares || []) {
    const fid = row.faithId || row.id;
    if (!fid) continue;
    const w = (Number(row.percent ?? row.share ?? 0) || 0) / 100;
    if (w <= 0) continue;
    const def = faithDef(content, fid);
    if (!def) continue;
    const label = def.name || fid;
    if (Array.isArray(def.effects)) {
      for (const eff of def.effects) {
        out.push({
          ...eff,
          args: scaleWeightedArgs(eff, w),
          source: { kind: "faith", id: def.id, label },
        });
      }
    }
    for (const taboo of def.taboo_properties || []) {
      if (eco && !factionHasProperty(eco, taboo)) {
        out.push({
          effect: "production_mult",
          args: { mult: 1 - 0.05 * w },
          source: {
            kind: "faith_taboo",
            id: `${def.id}:${taboo}`,
            label: `${label}: табу ${propertyLabel(content, taboo)}`,
          },
        });
      }
    }
  }
  return out;
}

function scaleWeightedArgs(eff, w) {
  const args = { ...(eff.args || {}) };
  if (typeof args.amount === "number") args.amount = args.amount * w;
  if (typeof args.mult === "number") args.mult = 1 + (args.mult - 1) * w;
  return args;
}

/** Resolve planet culture id (planet → faction default → baseline). */
export function resolvePlanetCultureId(planet, faction) {
  if (planet?.cultureId) return planet.cultureId;
  if (faction?.defaultCultureId) return faction.defaultCultureId;
  return "culture.baseline";
}

/** Resolve faith shares on planet. */
export function resolvePlanetFaithShares(planet, faction) {
  if (Array.isArray(planet?.faithShare) && planet.faithShare.length) {
    return planet.faithShare;
  }
  if (faction?.primaryFaith) {
    return [{ faithId: faction.primaryFaith, percent: 100 }];
  }
  return [{ faithId: "faith.secular", percent: 100 }];
}

/** Primary race on planet for culture compatibility check. */
export function primaryRaceFromComposition(composition) {
  let best = null;
  let max = 0;
  for (const row of composition || []) {
    const p = Number(row.percent ?? 0);
    if (p > max) {
      max = p;
      best = row.raceId;
    }
  }
  return best;
}
