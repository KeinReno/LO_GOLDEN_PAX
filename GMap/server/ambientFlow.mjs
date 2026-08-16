/**
 * Population-scaled ambient D/E + primary-before-secondary convert.
 *
 * Port of Golden_PAX_v0_5 flowIncome ambient + flowEngine
 * applyFlowConvertPrimary / reconcileSecondaryDemand
 * (notes/2026-08-14-ambient-flow-economy-grill.md).
 *
 * applyFlowConvert in flowEngine.mjs stays greedy (parity). Tick path
 * passes convertPrimary into addBuildingFlows so catalyst claims wait
 * until every building's primary leg has run.
 */
import {
  sumRateAtLeast,
  consumeRateAtLeast,
  currencyToCategory,
} from "./flowEngine.mjs";

/** Energia (D) per head of total population. First-pass v0.5 coefficient. */
export const AMBIENT_ENERGIA_PER_POP = 0.6;
/** Bios (E) per head of total population. First-pass v0.5 coefficient. */
export const AMBIENT_BIOS_PER_POP = 0.5;

function parseTierMin(spec) {
  if (spec == null) return null;
  const m = String(spec).match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

/**
 * Ambient sun/geo energia + subsistence bios, grounded in total population
 * (not inhabited-planet count, not building count).
 *
 *   D[1] += max(1, ceil(pop * 0.6))
 *   E[1] += max(1, ceil(pop * 0.5))
 *
 * No-op at pop <= 0 (nothing from thin air).
 */
export function applyAmbientDE(flows, population) {
  const pop = Math.max(0, Number(population) || 0);
  if (pop <= 0) return;
  if (flows?.D?.[1]) {
    flows.D[1].rate += Math.max(1, Math.ceil(pop * AMBIENT_ENERGIA_PER_POP));
  }
  if (flows?.E?.[1]) {
    flows.E[1].rate += Math.max(1, Math.ceil(pop * AMBIENT_BIOS_PER_POP));
  }
}

/**
 * Primary-only half of a flow_convert: consume/produce like applyFlowConvert
 * but ignore the secondary/catalyst (no gate, no consume). Caller registers
 * a claim for reconcileSecondaryDemand.
 */
export function applyFlowConvertPrimary(flows, args, opts = {}) {
  const from = args?.from;
  const to = args?.to;
  if (!from || !to) return { produced: 0, secondary: null };
  const fromCat = from.category;
  const toCat = to.category || (to.currency ? currencyToCategory(to.currency) : null);
  if (!fromCat || !toCat || !flows[fromCat] || !flows[toCat]) {
    return { produced: 0, secondary: null };
  }

  const fromTierMin = parseTierMin(from.tier) || 1;
  const toTierSpec = parseTierMin(to.tier) || fromTierMin;
  const buildingTier = opts.buildingTier || toTierSpec;
  const outTier = Math.min(fromTierMin, toTierSpec, buildingTier);

  const inRate = sumRateAtLeast(flows, fromCat, fromTierMin);
  const throughput = Number(args?.amount ?? opts.throughput ?? 2);
  let produced = Math.min(inRate, throughput);
  const pBoost = Number(opts.priorityBoost ?? 1);
  if (pBoost > 1 && produced > 0) produced = Math.min(inRate, produced * pBoost);

  if (fromCat === "B" && toCat === "C") {
    const scale = opts.biosScale != null ? opts.biosScale : 1;
    produced = Math.floor(produced * Math.max(0, Math.min(1, scale)));
  }

  const rateScale = Number(opts.rateScale ?? 1);
  if (rateScale !== 1) produced = produced * rateScale;

  const secondary = args?.secondary || opts.secondary || null;
  if (produced <= 0) return { produced: 0, secondary };

  consumeRateAtLeast(flows, fromCat, fromTierMin, produced);
  flows[toCat][outTier].rate += produced;
  return { produced, secondary, toCat, toTier: outTier };
}

/**
 * Allocate deferred secondary/catalyst claims. Categories that were
 * someone's PRIMARY this pass settle first; leftover supply splits
 * proportionally among secondary claims. Shortfall claws back `to` rate.
 */
export function reconcileSecondaryDemand(flows, claims, primaryCategoriesUsed) {
  const byCategory = new Map();
  for (const claim of claims || []) {
    const cat = claim?.secondary?.category;
    if (!cat) continue;
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat).push(claim);
  }

  const usedPrimary = primaryCategoriesUsed || new Set();
  const order = [...byCategory.keys()].sort((a, b) => {
    const aFirst = usedPrimary.has(a) ? 0 : 1;
    const bFirst = usedPrimary.has(b) ? 0 : 1;
    return aFirst - bFirst;
  });

  for (const cat of order) {
    const catClaims = byCategory.get(cat);
    const tierMins = catClaims.map((c) => parseTierMin(c.secondary.tier) || 1);
    const minTier = Math.min(...tierMins);
    const requested = catClaims.reduce((s, c) => s + c.amount, 0);
    const available = sumRateAtLeast(flows, cat, minTier);
    if (requested <= 0) continue;
    const ratio = available >= requested ? 1 : available / requested;

    let consumedTotal = 0;
    for (const claim of catClaims) {
      const allocated = ratio >= 1 ? claim.amount : Math.floor(claim.amount * ratio);
      const shortfall = claim.amount - allocated;
      if (shortfall > 0 && flows[claim.toCat]?.[claim.toTier]) {
        flows[claim.toCat][claim.toTier].rate = Math.max(
          0,
          flows[claim.toCat][claim.toTier].rate - shortfall,
        );
      }
      consumedTotal += allocated;
    }
    if (consumedTotal > 0) consumeRateAtLeast(flows, cat, minTier, consumedTotal);
  }
}
