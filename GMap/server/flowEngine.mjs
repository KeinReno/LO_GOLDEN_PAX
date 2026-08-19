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
import { resolveAlias } from "./normalizeWorld.mjs";
import { canExtractDeposit } from "./depositExtract.mjs";
import { resolveUpkeepCategory } from "./techSockets.mjs";
import { isMapDeposit } from "./slotResolver.mjs";

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
      // sources: strategic resourceId → contribution to this cell's rate (B1 T1.2)
      flows[cat][t] = { rate: 0, demand: 0, capacity: 0, sources: {} };
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

/** Consume `amount` of available rate from tiers >= minTier (low→high). */
export function consumeRateAtLeast(flows, cat, minTier, amount) {
  let remaining = Math.max(0, Number(amount) || 0);
  if (remaining <= 0) return 0;
  for (let t = minTier; t <= 10 && remaining > 0; t++) {
    const cell = flows[cat]?.[t];
    if (!cell) continue;
    const available =
      cell.capacity > 0 ? Math.min(cell.rate || 0, cell.capacity) : cell.rate || 0;
    if (available <= 0) continue;
    const take = Math.min(available, remaining);
    cell.rate = (cell.rate || 0) - take;
    remaining -= take;
  }
  return (Number(amount) || 0) - remaining;
}

/**
 * Strategic map resource ids.
 * Accepts any of: economy_schema.resource_ranks.strategic[],
 * def.rank === "strategic", or def.strategic === true (B1 T1.1 reconcile).
 */
export function strategicResourceIdSet(content) {
  const c = content || getContent();
  const ids = new Set(c.economy_schema?.resource_ranks?.strategic || []);
  for (const def of Object.values(c.map_resources || {})) {
    if (!def?.id) continue;
    if (def.rank === "strategic" || def.strategic === true) ids.add(def.id);
  }
  return ids;
}

export function isStrategicResource(def, strategicIds = null) {
  if (!def?.id) return false;
  if (def.rank === "strategic" || def.strategic === true) return true;
  const set = strategicIds || strategicResourceIdSet();
  return set.has(def.id);
}

/** Per-deposit extraction units before rateScale (matches category flow yield logic). */
export function extractionYieldUnits(def) {
  const entries = Object.entries(def?.yield || {}).filter(
    ([, amt]) => Number(amt) > 0,
  );
  if (entries.length === 0) return 1;
  return entries.reduce((sum, [, amt]) => sum + Number(amt), 0);
}

/**
 * T1–T3 deposits extract at start (same freeBuildTier as buildings).
 * Higher tiers need researched techTiers[cat]. Own treasury peg skips this.
 */
export function depositTechCeiling(content, techTiers, category) {
  const free =
    Number(content?.economy_balance?.principles?.freeBuildTier) || 3;
  const researched = Number(techTiers?.[category] ?? 1);
  return Math.max(free, researched);
}

export function isTreasuryPegDeposit(def, treasuryPeg) {
  if (!def || treasuryPeg == null || treasuryPeg === "") return false;
  const peg = String(treasuryPeg);
  const id = String(def.id || "");
  const name = String(def.name || "");
  if (id && (id === peg || name === peg)) return true;
  const pegBare = peg.replace(/^map\./, "");
  const idBare = id.replace(/^map\./, "");
  return Boolean(idBare && idBare === pegBare);
}

/** Resolve map resource by id, Russian name, or id-aliases (соларид→map.solari). */
export function lookupMapResource(content, nameOrId) {
  const c = content || getContent();
  if (!nameOrId) return null;
  const raw = String(nameOrId);
  const aliased = resolveAlias("resources", raw);
  const bags = [c.map_resources, c.modules];
  for (const bag of bags) {
    if (!bag) continue;
    if (bag[aliased]) return bag[aliased];
    if (bag[raw]) return bag[raw];
    const hit = Object.values(bag).find(
      (r) => r.name === raw || r.id === raw || r.name === aliased || r.id === aliased,
    );
    if (hit) return hit;
  }
  return null;
}

export function addPlanetExtraction(flows, resourceNames, content, opts = {}) {
  const c = content || getContent();
  const maxTiers = opts.maxTiers || null;
  const rateScale = Number(opts.rateScale ?? 1);
  const strategicOut = opts.strategicExtraction || null;
  const roleOut = opts.roleExtraction || null;
  const strategicIds = opts.strategicIds || strategicResourceIdSet(c);
  // Belt + mining station is a different path (`skipExtractGate`).
  const skipExtractGate = opts.skipExtractGate === true;
  const buildings =
    opts.buildings ?? (opts.planet ? planetBuildingList(opts.planet) : []);
  for (const name of resourceNames || []) {
    if (!skipExtractGate) {
      const { allowed } = canExtractDeposit({
        buildings,
        depositType: name,
        content: c,
        planet: opts.planet || null,
      });
      if (!allowed) continue;
    }
    const def = lookupMapResource(c, name);
    if (!def || !isMapDeposit(def) || def.category == null || def.tier == null) continue;
    const t = Number(def.tier);
    if (
      maxTiers &&
      !isTreasuryPegDeposit(def, opts.treasuryPeg)
    ) {
      const ceil = depositTechCeiling(c, maxTiers, def.category);
      if (ceil < t) continue;
    }
    if (!flows[def.category]?.[t]) continue;
    let laborScale = 1;
    if (typeof opts.laborScaleForDeposit === "function") {
      const ls = Number(opts.laborScaleForDeposit(def, name));
      laborScale = Number.isFinite(ls) ? Math.max(0, ls) : 0;
    }
    const scale = rateScale * laborScale;
    const strategic = isStrategicResource(def, strategicIds);
    const rid = def.id;
    const yieldEntries = Object.entries(def.yield || {}).filter(
      ([, amt]) => Number(amt) > 0,
    );
    if (yieldEntries.length === 0) {
      const cell = flows[def.category][t];
      const amt = 1 * scale;
      cell.rate += amt;
      if (strategic) {
        if (!cell.sources) cell.sources = {};
        cell.sources[rid] = (cell.sources[rid] || 0) + amt;
      }
    } else {
      const cat = def.category;
      const cell = flows[cat]?.[t];
      if (!cell) continue;
      let amt = 0;
      for (const [, y] of yieldEntries) amt += Number(y) * scale;
      cell.rate += amt;
      if (strategic) {
        if (!cell.sources) cell.sources = {};
        cell.sources[rid] = (cell.sources[rid] || 0) + amt;
      }
    }
    const extracted = extractionYieldUnits(def) * scale;
    if (strategicOut && strategic) {
      strategicOut[rid] = (strategicOut[rid] || 0) + extracted;
    }
    // RoleScore counts bulk + strategic (B2 T2.4). Named stocks stay strategic-only.
    if (roleOut) {
      roleOut[rid] = (roleOut[rid] || 0) + extracted;
    }
  }
}

export function resolveBuildingDef(content, buildingInst) {
  const c = content || getContent();
  const buildings = c.buildings || {};
  const id = buildingInst.buildingId;
  if (id && buildings[id]) {
    const raw = buildings[id];
    if (raw.base && buildings[raw.base]) {
      // Lazy merge to avoid circular import with variantResolver at top-level cycles
      return {
        ...buildings[raw.base],
        ...raw,
        id: raw.id,
        effects: [
          ...(buildings[raw.base].effects || []),
          ...(raw.extra_effects || []),
          ...(raw.effects || []),
        ],
        cost: raw.cost || buildings[raw.base].cost,
      };
    }
    return raw;
  }
  const baseId = buildingInst.baseBuildingId;
  if (baseId && buildings[baseId]) return buildings[baseId];
  const zone = buildingInst.zone || "surface";
  const kind = buildingInst.kind;
  const match = Object.values(buildings).find(
    (d) => d.kind === kind && (d.zone || "surface") === zone && !d.base,
  );
  if (match) return match;
  return Object.values(buildings).find((d) => d.kind === kind && !d.base) || null;
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
  // Consume upstream inputs so later converters see a real bottleneck
  consumeRateAtLeast(flows, fromCat, fromTierMin, produced);
  if (secondary?.category) {
    const secMin = parseTierMin(secondary.tier) || 1;
    consumeRateAtLeast(flows, secondary.category, secMin, produced);
  }
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

function runBuildingConvert(flows, args, convertOpts, opts) {
  const pending = opts.pendingSecondary;
  const convertPrimary = opts.convertPrimary;
  if (pending && typeof convertPrimary === "function") {
    const fromC = args.from?.category;
    if (fromC) opts.primaryCategoriesUsed?.add(fromC);
    const result = convertPrimary(flows, args, convertOpts);
    if (result?.produced > 0 && result.secondary?.category) {
      pending.push({
        toCat: result.toCat,
        toTier: result.toTier,
        secondary: result.secondary,
        amount: result.produced,
      });
    }
    return;
  }
  applyFlowConvert(flows, args, convertOpts);
}

/**
 * Add a building's contribution. Prefers flow_convert over yield_flat.
 * Tick path may pass pendingSecondary + convertPrimary (ambientFlow.mjs)
 * so catalyst demand is reconciled after every building's primary leg.
 */
export function addBuildingFlows(flows, buildingDef, content, buildingInst = null, opts = {}) {
  const c = content || getContent();
  if (!buildingDef) return;
  const rateScale = Number(opts.rateScale ?? 1);
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
      const fromC = args.from?.category;
      const toC = args.to?.category;
      const pri = opts.priorityEdge;
      const boost =
        pri && fromC === pri.from && toC === pri.to ? Number(opts.priorityBoost ?? 1.35) : 1;
      runBuildingConvert(
        flows,
        args,
        {
          buildingTier: tier,
          biosScale: opts.biosScale,
          rateScale,
          throughput: Number(e.args?.amount) || Math.max(1, Math.ceil(tier / 2) + 1),
          priorityBoost: boost,
        },
        opts,
      );
    } else if (e.effect === "capacity_add") {
      const cc = e.args?.category;
      const tt = Number(e.args?.tier);
      const amt = Number(e.args?.amount) || 0;
      if (cc && tt && flows[cc]?.[tt]) flows[cc][tt].capacity += amt;
    } else if (
      (e.effect === "yield_flat" || e.effect === "production_flat") &&
      !hasConvert
    ) {
      const cur = e.args?.currency || e.args?.resource;
      const amt = (Number(e.args?.amount) || 0) * rateScale;
      if (typeof cur === "string" && cur.startsWith("module.")) {
        if (opts.namedProduction) {
          opts.namedProduction[cur] = (opts.namedProduction[cur] || 0) + amt;
        }
        continue;
      }
      const mapped = currencyToCategory(cur, c) || cat;
      if (mapped && flows[mapped]?.[tier]) {
        flows[mapped][tier].rate += amt;
      }
    }
  }

  if (
    !hasConvert &&
    !effects.some(
      (e) =>
        e.effect === "yield_flat" ||
        e.effect === "production_flat" ||
        e.effect === "capacity_add",
    )
  ) {
    const edge = rpsEdges(c).find((ed) => ed.to === cat);
    if (edge && ["factory", "lab", "farm"].includes(buildingDef.kind)) {
      runBuildingConvert(
        flows,
        {
          from: { category: edge.from, tier: `>=${Math.max(1, tier - 1)}` },
          to: { category: edge.to, tier: `>=${tier}` },
          secondary: inferSecondary(edge.from, edge.to, tier),
        },
        { buildingTier: tier, biosScale: opts.biosScale, rateScale },
        opts,
      );
    }
  }
}

/**
 * Add upkeep demand. If buildingInst.slotFills[role] is a strategic resource,
 * debit that named stock instead of the category bucket (B1 T1.6).
 * Unfilled slots keep category demand (legacy saves).
 *
 * Empire-wide tech sockets (TECH_TREE_2 P1): pre-resolved `opts.socketEffects`
 * may swap which flow category a matching building class demands. Named
 * strategic slotFills still win. Category swap lives in techSockets.mjs.
 */
export function addUpkeepDemand(flows, consumerDef, opts = {}) {
  const scale = Number(opts.demandScale ?? 1);
  const namedDemand = opts.namedDemand || null;
  const fills = opts.buildingInst?.slotFills || {};
  const content = opts.content || null;
  const strategicIds = opts.strategicIds || null;
  const socketEffects = opts.socketEffects || null;
  for (const slot of consumerDef.upkeep_slots || []) {
    const amt = (Number(slot.count) || 0) * scale;
    if (amt <= 0) continue;
    const filledId = fills[slot.role];
    if (namedDemand && filledId && content) {
      const resDef = lookupMapResource(content, filledId);
      if (resDef && isStrategicResource(resDef, strategicIds)) {
        namedDemand[resDef.id] = (namedDemand[resDef.id] || 0) + amt;
        continue;
      }
    }
    const cat = resolveUpkeepCategory(slot.require?.category, consumerDef, socketEffects);
    const tierMin = parseTierMin(slot.require?.tier) || 1;
    if (cat && flows[cat]?.[tierMin]) {
      flows[cat][tierMin].demand += amt;
      continue;
    }
    if (slot.require?.properties?.length) {
      flows.D[1].demand += amt;
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
      const sources =
        cell.sources && Object.keys(cell.sources).length > 0
          ? { ...cell.sources }
          : {};
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

export function applySpaceObjectEffects(flows, objDef, opts = {}) {
  const scale = Number(opts.rateScale ?? 1);
  for (const e of objDef.effects || []) {
    const cc = e.args?.category;
    const tt = Number(e.args?.tier);
    const amt = Number(e.args?.amount) || 0;
    if (!cc || !tt) continue;
    if (!flows[cc] || !flows[cc][tt]) continue;
    if (e.effect === "capacity_add") {
      flows[cc][tt].capacity += amt;
    } else if (e.effect === "rate_mod") {
      flows[cc][tt].rate += amt * scale;
    } else if (e.effect === "demand_mod") {
      flows[cc][tt].demand += amt * scale;
    }
  }
}

/** Legacy bios-stock proxy. Production now uses `laborAllocation.mjs` job slots. */
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
