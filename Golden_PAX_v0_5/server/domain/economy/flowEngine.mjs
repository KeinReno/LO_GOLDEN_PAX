/**
 * Ported verbatim from GMap/server/flowEngine.mjs's category-general
 * mechanics (exported + pure there — diffed directly in
 * flowEngine.parity.test.mjs). This is Stage 2 of the resource-extraction
 * port (see domain/planets/README.md, notes/2026-08-13-resource-extraction-
 * grill.md): the 6-category (A-F) RPS flow matrix — rate/demand/capacity
 * per tier, the bottleneck rule (output = min(inputs)), and the RPS
 * conversion edges from content/core/economy_schema.json.
 *
 * What's deliberately NOT here (see the grill notes — explicit, agreed
 * scope cuts, not oversights): the modifier stack (a separate, cross-
 * cutting system used by combat/diplomacy/tech too, already an accepted
 * gap everywhere else in this project), the "legacy metal/supply bridge"
 * (GMap-specific double-count guard that doesn't apply the same way here
 * since this project's currency landscape already diverged in Stage 1),
 * strategic-resource dual-tracking (deferred, see the currency-peg design
 * notes — not needed until that feature is actually built).
 *
 * Planet/building-specific feeders (extraction, building yields/converts,
 * upkeep demand) live in domain/planets/* — this file only holds the
 * category-general grid mechanics.
 */
export const CATEGORIES = ["A", "B", "C", "D", "E", "F"];
export const TIERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const CATEGORY_CURRENCY = {
  A: "currency.extracta",
  B: "currency.materia",
  C: "currency.industria",
  D: "currency.energia",
  E: "currency.bios",
  F: "currency.cognitio",
};

/** RPS edges from economy_schema.json. */
export function rpsEdges(content) {
  return content?.economy_schema?.rps_edges || [];
}

export function categoryToCurrency(cat) {
  return CATEGORY_CURRENCY[cat] || null;
}

/**
 * Ported verbatim from GMap/server/flowEngine.mjs's currencyToCategory:
 * resolves via content.economy_schema.categories (matching currencyId),
 * falling back to two hardcoded legacy cases (currency.metal -> B,
 * currency.supply -> E, same ones GMap hardcodes).
 */
export function currencyToCategory(currencyId, content) {
  const cats = content?.economy_schema?.categories || {};
  for (const [id, def] of Object.entries(cats)) {
    if (def.currencyId === currencyId) return id;
  }
  if (currencyId === "currency.metal") return "B";
  if (currencyId === "currency.supply") return "E";
  return null;
}

export function emptyFlows() {
  const flows = {};
  for (const cat of CATEGORIES) {
    flows[cat] = {};
    for (const t of TIERS) {
      flows[cat][t] = { rate: 0, demand: 0, capacity: 0, sources: {} };
    }
  }
  return flows;
}

function parseTierMin(spec) {
  if (spec == null) return null;
  const m = String(spec).match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

export function sumRateAtLeast(flows, cat, minTier = 1) {
  let sum = 0;
  for (let t = minTier; t <= 10; t++) {
    const cell = flows[cat]?.[t];
    if (!cell) continue;
    const rate = cell.rate || 0;
    const cap = cell.capacity || 0;
    sum += cap > 0 ? Math.min(rate, cap) : rate;
  }
  return sum;
}

/** Consume `amount` of available rate from tiers >= minTier (low->high). */
export function consumeRateAtLeast(flows, cat, minTier, amount) {
  let remaining = Math.max(0, Number(amount) || 0);
  if (remaining <= 0) return 0;
  for (let t = minTier; t <= 10 && remaining > 0; t++) {
    const cell = flows[cat]?.[t];
    if (!cell) continue;
    const available = cell.capacity > 0 ? Math.min(cell.rate || 0, cell.capacity) : cell.rate || 0;
    if (available <= 0) continue;
    const take = Math.min(available, remaining);
    cell.rate = (cell.rate || 0) - take;
    remaining -= take;
  }
  return (Number(amount) || 0) - remaining;
}

/**
 * Apply one RPS conversion edge: consume up to `throughput` rate from the
 * `from` category (>= its tier min), optionally gated by a secondary input
 * category too (bottleneck = min of both), produce into the `to` category.
 * Mutates `flows` (consumes upstream, adds downstream) — same as GMap;
 * calling order matters, same as it does there.
 */
export function applyFlowConvert(flows, args, opts = {}) {
  const from = args?.from;
  const to = args?.to;
  if (!from || !to) return 0;
  const fromCat = from.category;
  const toCat = to.category || (to.currency ? currencyToCategory(to.currency) : null);
  if (!fromCat || !toCat || !flows[fromCat] || !flows[toCat]) return 0;

  const fromTierMin = parseTierMin(from.tier) || 1;
  const toTierSpec = parseTierMin(to.tier) || fromTierMin;
  const buildingTier = opts.buildingTier || toTierSpec;
  const outTier = Math.min(fromTierMin, toTierSpec, buildingTier);

  let inRate = sumRateAtLeast(flows, fromCat, fromTierMin);

  const secondary = args?.secondary || opts.secondary;
  if (secondary?.category) {
    const secMin = parseTierMin(secondary.tier) || 1;
    const secRate = sumRateAtLeast(flows, secondary.category, secMin);
    inRate = Math.min(inRate, secRate);
  }

  const throughput = Number(args?.amount ?? opts.throughput ?? 2);
  let produced = Math.min(inRate, throughput);
  const pBoost = Number(opts.priorityBoost ?? 1);
  if (pBoost > 1 && produced > 0) {
    produced = Math.min(inRate, produced * pBoost);
  }

  if (fromCat === "B" && toCat === "C") {
    const scale = opts.biosScale != null ? opts.biosScale : 1;
    produced = Math.floor(produced * Math.max(0, Math.min(1, scale)));
  }

  const rateScale = Number(opts.rateScale ?? 1);
  if (rateScale !== 1) produced = produced * rateScale;

  if (produced <= 0) return 0;
  consumeRateAtLeast(flows, fromCat, fromTierMin, produced);
  if (secondary?.category) {
    const secMin = parseTierMin(secondary.tier) || 1;
    consumeRateAtLeast(flows, secondary.category, secMin, produced);
  }
  flows[toCat][outTier].rate += produced;
  return produced;
}

/**
 * NOT a port — new design (2026-08-14, see
 * notes/2026-08-14-ambient-flow-economy-grill.md). GMap's `applyFlowConvert`
 * (above, unchanged, still byte-parity tested) consumes primary AND
 * secondary in one greedy pass — whichever building's conversion runs
 * first wins a contested category, regardless of whether it needed that
 * category as its main product or just a catalyst. Live-verified failure
 * mode: a lab (E→F, E primary) and a factory (B→C, E secondary) both
 * competing for the same scarce ambient E — factory (processed first)
 * drained it entirely, leaving the lab permanently starved of real
 * science income even with a textbook-correct, fully-staffed build order.
 *
 * This function is the primary-only half of the fix: consumes/produces
 * exactly like `applyFlowConvert`, but ignores the secondary category
 * entirely (no gating, no consumption) and instead returns the secondary
 * spec + produced amount so the caller can register a *claim* — see
 * `reconcileSecondaryDemand`. Primary consumption still happens
 * immediately and sequentially (unchanged from today — real chain
 * dependencies, e.g. a smelter's output existing before a factory reads
 * it, still require this), so ordering among different buildings' PRIMARY
 * claims is unaffected. Only secondary/catalyst claims get deferred.
 */
export function applyFlowConvertPrimary(flows, args, opts = {}) {
  const from = args?.from;
  const to = args?.to;
  if (!from || !to) return { produced: 0, secondary: null };
  const fromCat = from.category;
  const toCat = to.category || (to.currency ? currencyToCategory(to.currency) : null);
  if (!fromCat || !toCat || !flows[fromCat] || !flows[toCat]) return { produced: 0, secondary: null };

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
 * NOT a port — pass-2 half of the fix above. `claims` is every pending
 * secondary/catalyst demand collected while `applyFlowConvertPrimary` ran
 * for every building on every owned planet (`{ toCat, toTier, secondary:
 * {category, tier}, amount }`). `primaryCategoriesUsed` is the set of
 * categories consumed as someone's PRIMARY input this pass (known once
 * every building's primary leg has run).
 *
 * Two-phase order, not a fully general equilibrium solver (documented
 * limitation, first-pass): categories that are anyone's PRIMARY target
 * reconcile first (their true remaining supply is independent of any
 * secondary clawback), then secondary-only categories reconcile using the
 * now-accurate numbers. This correctly resolves the found bug (E has a
 * real primary claimant, so it settles before C — which only exists as a
 * byproduct of a secondary-gated conversion) without needing a full
 * topological solve of the A→B→C→D→E→F ring, which can be genuinely
 * cyclic. A deeper multi-hop cascade beyond the 2-category case found here
 * is not guaranteed exact — revisit if that turns out to matter in play.
 *
 * Within a category: if total demand exceeds available supply, claims
 * split proportionally and each claim's `to` production is clawed back by
 * its shortfall. Consumes only what's actually allocated.
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
        flows[claim.toCat][claim.toTier].rate = Math.max(0, flows[claim.toCat][claim.toTier].rate - shortfall);
      }
      consumedTotal += allocated;
    }
    if (consumedTotal > 0) consumeRateAtLeast(flows, cat, minTier, consumedTotal);
  }
}

/**
 * Which category feeds a given RPS edge as a secondary input — ported
 * verbatim from GMap's inferSecondary (module-private there).
 */
export function inferSecondary(fromCat, toCat, tier) {
  const t = Math.max(1, Number(tier) - 2);
  if (fromCat === "A" && toCat === "B") return { category: "D", tier: `>=${t}` };
  if (fromCat === "B" && toCat === "C") return { category: "E", tier: `>=${t}` };
  if (fromCat === "C" && toCat === "D") return { category: "B", tier: `>=${t}` };
  if (fromCat === "D" && toCat === "E") return { category: "A", tier: `>=${t}` };
  if (fromCat === "E" && toCat === "F") return { category: "C", tier: `>=${Math.max(1, t - 1)}` };
  if (fromCat === "F" && toCat === "A") return { category: "D", tier: `>=${t}` };
  return null;
}

export function computeNets(flows) {
  const out = emptyFlows();
  for (const cat of CATEGORIES) {
    for (const t of TIERS) {
      const cell = flows[cat][t];
      const rate = cell.rate || 0;
      const demand = cell.demand || 0;
      const cap = cell.capacity || 0;
      const capped = cap > 0 ? Math.min(rate, cap) : rate;
      const net = capped - demand;
      const sources = cell.sources && Object.keys(cell.sources).length > 0 ? { ...cell.sources } : {};
      out[cat][t] = {
        rate,
        demand,
        capacity: cap,
        capped,
        net,
        deficit: net < 0 ? -net : 0,
        surplus: net > 0 ? net : 0,
        sources,
      };
    }
  }
  return out;
}

export function categoryTotals(flows) {
  const out = {};
  for (const cat of CATEGORIES) {
    let rate = 0,
      demand = 0,
      net = 0;
    for (const t of TIERS) {
      const cell = flows[cat][t];
      rate += cell.rate || 0;
      demand += cell.demand || 0;
      net += cell.net != null ? cell.net : (cell.rate || 0) - (cell.demand || 0);
    }
    out[cat] = { rate, demand, net };
  }
  return out;
}

export function bottlenecks(flows) {
  const out = {};
  for (const cat of CATEGORIES) {
    let worst = null;
    for (const t of TIERS) {
      const cell = flows[cat][t];
      if ((cell.deficit || 0) > 0) {
        if (!worst || t < worst.tier) worst = { tier: t, deficit: cell.deficit };
      }
    }
    if (worst) out[cat] = worst;
  }
  return out;
}
