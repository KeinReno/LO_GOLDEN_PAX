/**
 * Flow engine: 6-category flow accounting with the bottleneck rule.
 *
 * Each category (A–F) has a flow per tier (1–10):
 *   flow[category][tier] = { rate, demand, capacity }
 *
 * RPS edges transform flows: A→B→C→D→E→F→A.
 * Output of an edge = min(inputs) — anti-multiplicative bottleneck.
 *
 * Pure functions; ledger mutation is done by the caller (economyTick).
 */
import { getContent } from "./contentLoader.mjs";
import { CATEGORY_CURRENCY } from "./ledger.mjs";

export const CATEGORIES = ["A", "B", "C", "D", "E", "F"];
export const TIERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export { CATEGORY_CURRENCY };

/** RPS edges from economy_schema.json. */
export function rpsEdges(content) {
  const c = content || getContent();
  return c.economy_schema?.rps_edges || [];
}

export function categoryToCurrency(cat) {
  return CATEGORY_CURRENCY[cat] || null;
}

export function currencyToCategory(currencyId, content) {
  const c = content || getContent();
  const cats = c.economy_schema?.categories || {};
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
      flows[cat][t] = { rate: 0, demand: 0, capacity: 0 };
    }
  }
  return flows;
}

function parseTierMin(spec) {
  if (spec == null) return null;
  const s = String(spec);
  const m = s.match(/(\d+)/);
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

export function addPlanetExtraction(flows, resourceNames, content, opts = {}) {
  const c = content || getContent();
  const maxTiers = opts.maxTiers || null;
  for (const name of resourceNames || []) {
    const def = Object.values(c.map_resources || {}).find(
      (r) => r.name === name || r.id === name,
    );
    if (!def || def.category == null || def.tier == null) continue;
    const t = Number(def.tier);
    if (maxTiers && Number(maxTiers[def.category] ?? 1) < t) continue;
    if (!flows[def.category]?.[t]) continue;
    flows[def.category][t].rate += 1;
  }
}

export function resolveBuildingDef(content, buildingInst) {
  const c = content || getContent();
  const buildings = c.buildings || {};
  if (buildingInst.buildingId && buildings[buildingInst.buildingId]) {
    return buildings[buildingInst.buildingId];
  }
  const zone = buildingInst.zone || "surface";
  const kind = buildingInst.kind;
  const match = Object.values(buildings).find(
    (d) => d.kind === kind && (d.zone || "surface") === zone,
  );
  if (match) return match;
  return Object.values(buildings).find((d) => d.kind === kind) || null;
}

function effectiveTierFromFills(buildingInst, content, fallbackTier) {
  const fills = buildingInst?.slotFills || {};
  const roles = Object.keys(fills);
  if (roles.length === 0) return fallbackTier;
  const c = content || getContent();
  let min = Infinity;
  for (const role of roles) {
    const resId = fills[role];
    const res = Object.values(c.map_resources || {}).find(
      (r) => r.id === resId || r.name === resId,
    );
    if (res?.tier != null) min = Math.min(min, Number(res.tier));
  }
  if (min === Infinity) return fallbackTier;
  return Math.min(fallbackTier, min);
}

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

  if (fromCat === "B" && toCat === "C") {
    const scale = opts.biosScale != null ? opts.biosScale : 1;
    produced = Math.floor(produced * Math.max(0, Math.min(1, scale)));
  }

  if (produced <= 0) return 0;
  flows[toCat][outTier].rate += produced;
  return produced;
}

function inferSecondary(fromCat, toCat, tier) {
  const t = Math.max(1, Number(tier) - 2);
  if (fromCat === "A" && toCat === "B") return { category: "D", tier: `>=${t}` };
  if (fromCat === "B" && toCat === "C") return { category: "E", tier: `>=${t}` };
  if (fromCat === "C" && toCat === "D") return { category: "B", tier: `>=${t}` };
  if (fromCat === "D" && toCat === "E") return { category: "A", tier: `>=${t}` };
  if (fromCat === "E" && toCat === "F") return { category: "C", tier: `>=${Math.max(1, t - 1)}` };
  if (fromCat === "F" && toCat === "A") return { category: "D", tier: `>=${t}` };
  return null;
}

/**
 * Add a building's contribution. Prefers flow_convert over yield_flat.
 */
export function addBuildingFlows(flows, buildingDef, content, buildingInst = null, opts = {}) {
  const c = content || getContent();
  if (!buildingDef) return;
  const cat = buildingDef.category;
  const baseTier = Number(buildingDef.tier) || 1;
  // Soft gate: building above unlocked tier+2 contributes nothing
  if (cat && opts.maxTiers) {
    const unlocked = Number(opts.maxTiers[cat] ?? 1);
    const allow = Math.max(3, unlocked + 1);
    if (baseTier > allow) return;
  }
  const tier = effectiveTierFromFills(buildingInst, c, baseTier);
  const effects = buildingDef.effects || [];
  const hasConvert = effects.some((e) => e.effect === "flow_convert");

  for (const e of effects) {
    if (e.effect === "flow_convert") {
      const args = { ...e.args };
      if (!args.secondary && args.from?.category && args.to?.category) {
        args.secondary = inferSecondary(args.from.category, args.to.category, tier);
      }
      applyFlowConvert(flows, args, {
        buildingTier: tier,
        biosScale: opts.biosScale,
        throughput: Number(e.args?.amount) || Math.max(1, Math.ceil(tier / 2) + 1),
      });
    } else if (e.effect === "capacity_add") {
      const cc = e.args?.category;
      const tt = Number(e.args?.tier);
      const amt = Number(e.args?.amount) || 0;
      if (cc && tt && flows[cc]?.[tt]) flows[cc][tt].capacity += amt;
    } else if (e.effect === "yield_flat" && !hasConvert) {
      const cur = e.args?.currency;
      const amt = Number(e.args?.amount) || 0;
      const mapped = currencyToCategory(cur, c) || cat;
      if (mapped && flows[mapped]?.[tier]) {
        flows[mapped][tier].rate += amt;
      }
    }
  }

  if (
    !hasConvert &&
    !effects.some((e) => e.effect === "yield_flat" || e.effect === "capacity_add")
  ) {
    const edge = rpsEdges(c).find((ed) => ed.to === cat);
    if (edge && ["factory", "lab", "farm"].includes(buildingDef.kind)) {
      applyFlowConvert(
        flows,
        {
          from: { category: edge.from, tier: `>=${Math.max(1, tier - 1)}` },
          to: { category: edge.to, tier: `>=${tier}` },
          secondary: inferSecondary(edge.from, edge.to, tier),
        },
        { buildingTier: tier, biosScale: opts.biosScale },
      );
    }
  }
}

export function addUpkeepDemand(flows, consumerDef) {
  for (const slot of consumerDef.upkeep_slots || []) {
    const cat = slot.require?.category;
    const tierMin = parseTierMin(slot.require?.tier) || 1;
    if (cat && flows[cat]?.[tierMin]) {
      flows[cat][tierMin].demand += Number(slot.count) || 0;
      continue;
    }
    if (slot.require?.properties?.length) {
      flows.D[1].demand += Number(slot.count) || 0;
    }
  }
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
      out[cat][t] = {
        rate,
        demand,
        capacity: cap,
        capped,
        net,
        deficit: net < 0 ? -net : 0,
        surplus: net > 0 ? net : 0,
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

export function applySpaceObjectEffects(flows, objDef) {
  for (const e of objDef.effects || []) {
    const cc = e.args?.category;
    const tt = Number(e.args?.tier);
    const amt = Number(e.args?.amount) || 0;
    if (!cc || !tt) continue;
    if (!flows[cc] || !flows[cc][tt]) continue;
    if (e.effect === "capacity_add") {
      flows[cc][tt].capacity += amt;
    } else if (e.effect === "rate_mod") {
      flows[cc][tt].rate += amt;
    } else if (e.effect === "demand_mod") {
      flows[cc][tt].demand += amt;
    }
  }
}

/** Bios labor scale 0..1 from stock. */
export function biosLaborScale(eco) {
  const bios = Number(eco?.stocks?.["currency.bios"] ?? 0);
  if (bios <= 0) return 0.25;
  if (bios < 8) return 0.5;
  if (bios < 16) return 0.75;
  return 1;
}

export function planetBuildingList(planet) {
  return [
    ...(planet.surfaceBuildings ?? []),
    ...(planet.orbitalBuildings ?? []),
    ...(planet.buildings ?? []),
  ];
}
