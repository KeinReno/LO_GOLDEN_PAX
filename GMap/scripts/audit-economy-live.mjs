/**
 * Read-only live economy audit. Does not write ledger/world.
 * Run from GMap/: node scripts/audit-economy-live.mjs
 */
import { getContent } from "../server/contentLoader.mjs";
import { readPublishedRaw } from "../server/tableStore.mjs";
import { normalizeWorld } from "../server/normalizeWorld.mjs";
import { readLedger, ensureFactionEco } from "../server/ledger.mjs";
import { computeFlowBreakdown } from "../server/economyTick.mjs";
import {
  lookupMapResource,
  planetBuildingList,
  resolveBuildingDef,
  currencyToCategory,
} from "../server/flowEngine.mjs";
import { canExtractDeposit } from "../server/depositExtract.mjs";
import {
  allocateLabor,
  consumesLabor,
  laborSlotsForDef,
  laborKey,
} from "../server/laborAllocation.mjs";
import { laborPopulation } from "../server/populationScale.mjs";

const CATS = ["A", "B", "C", "D", "E", "F"];

function asList(v) {
  if (v == null || v === "") return [];
  return Array.isArray(v) ? v : [v];
}

function round1(n) {
  return Math.round(Number(n || 0) * 10) / 10;
}

const content = getContent();
const raw = readPublishedRaw();
if (!raw) {
  console.error("NO published board");
  process.exit(1);
}
const world = normalizeWorld(raw);
const ledger = readLedger();

const buildings = Object.values(content.buildings || {});
const resources = Object.values(content.map_resources || {});

const extractorCover = { A: [], B: [], C: [], D: [], E: [], F: [] };
const emptyExtracts = [];
let noLaborSlots = 0;
let laborConsumers = 0;
for (const def of buildings) {
  if (consumesLabor(def)) {
    laborConsumers += 1;
    const explicit = Number(def.laborSlots);
    if (!(Number.isFinite(explicit) && explicit > 0)) noLaborSlots += 1;
  }
  const hasCat = Object.prototype.hasOwnProperty.call(def, "extractsCategory");
  const cats = asList(def.extractsCategory);
  if (hasCat && cats.length === 0) emptyExtracts.push(def.id);
  if (hasCat) {
    for (const c of cats) if (extractorCover[c]) extractorCover[c].push(def.id);
  } else if (def.category && extractorCover[def.category] && consumesLabor(def)) {
    extractorCover[def.category].push(`${def.id}(fallback)`);
  }
}

const resByCat = {};
const yieldToCat = {};
for (const r of resources) {
  const cat = r.category ?? "?";
  resByCat[cat] = (resByCat[cat] || 0) + 1;
  const yields = Object.entries(r.yield || {}).filter(([, a]) => Number(a) > 0);
  if (yields.length === 0) {
    yieldToCat[`${cat}->${cat}(default1)`] =
      (yieldToCat[`${cat}->${cat}(default1)`] || 0) + 1;
  } else {
    for (const [cur] of yields) {
      const mapped = currencyToCategory(cur, content) || cat;
      const key = `${cat} yield ${cur} → flow ${mapped}`;
      yieldToCat[key] = (yieldToCat[key] || 0) + 1;
    }
  }
}

console.log("=== CONTENT ===");
console.log(
  JSON.stringify(
    {
      buildings: buildings.length,
      laborConsumers,
      laborConsumersMissingLaborSlots: noLaborSlots,
      emptyExtractsCategory: emptyExtracts,
      extractorCoverCounts: Object.fromEntries(
        CATS.map((c) => [c, extractorCover[c].length]),
      ),
      dedicatedExtractors: Object.fromEntries(
        CATS.map((c) => [
          c,
          extractorCover[c].filter((id) => !id.includes("fallback")).slice(0, 8),
        ]),
      ),
      resourcesByCategory: resByCat,
      yieldRemap: yieldToCat,
    },
    null,
    2,
  ),
);

const facStats = [];

for (const fac of world.factions || []) {
  const owned = (world.systems || []).filter((s) => s.ownerFactionId === fac.id);
  if (owned.length === 0) continue;
  let pop = 0;
  let laborUnits = 0;
  let planets = 0;
  let inhabited = 0;
  let deposits = 0;
  let gated = 0;
  let unlocked = 0;
  let laborNeed = 0;
  let laborZeroBuildings = 0;
  let laborPartial = 0;
  const gatedSamples = [];
  const staffingSamples = [];

  for (const sys of owned) {
    for (const p of sys.planets || []) {
      planets += 1;
      const pPop = Number(p.population) || 0;
      pop += pPop;
      laborUnits += laborPopulation(p, content);
      if (pPop > 0) inhabited += 1;
      const staffing = allocateLabor(p, content);
      const blist = planetBuildingList(p);
      blist.forEach((b, i) => {
        if (b?.disabled) return;
        const def = resolveBuildingDef(content, b);
        if (!consumesLabor(def)) return;
        laborNeed += laborSlotsForDef(def);
        const frac = staffing[laborKey(b, i)] ?? 0;
        if (frac <= 0) {
          laborZeroBuildings += 1;
          if (staffingSamples.length < 6) {
            staffingSamples.push({
              sys: sys.name || sys.id,
              planet: p.name || p.id,
              pop: pPop,
              building: def?.id || b.buildingId,
              need: laborSlotsForDef(def),
              frac,
            });
          }
        } else if (frac < 1) laborPartial += 1;
      });
      for (const name of p.resources || []) {
        deposits += 1;
        const def = lookupMapResource(content, name);
        const { allowed } = canExtractDeposit({
          buildings: blist,
          depositType: name,
          content,
        });
        if (allowed) unlocked += 1;
        else {
          gated += 1;
          if (gatedSamples.length < 8) {
            gatedSamples.push({
              sys: sys.name || sys.id,
              planet: p.name || p.id,
              pop: pPop,
              deposit: def?.id || name,
              cat: def?.category,
              tier: def?.tier,
              buildings: blist
                .map((b) => b.buildingId || b.kind)
                .filter(Boolean)
                .slice(0, 6),
            });
          }
        }
      }
    }
  }

  const eco = ensureFactionEco(ledger, fac.id);
  const flow = computeFlowBreakdown(world, fac.id, content, eco);
  const totals = flow.totals || {};
  const strat = flow.strategicExtraction || {};
  const peg = fac.treasuryPeg || null;
  const stocks = eco.stocks || {};

  facStats.push({
    id: fac.id,
    name: fac.name,
    peg,
    systems: owned.length,
    planets,
    inhabited,
    pop,
    laborUnits,
    laborNeed,
    laborGap: Math.max(0, laborNeed - laborUnits),
    laborZeroBuildings,
    laborPartial,
    deposits,
    unlocked,
    gated,
    gatedPct: deposits ? Math.round((100 * gated) / deposits) : 0,
    flowRate: Object.fromEntries(CATS.map((c) => [c, round1(totals[c]?.rate)])),
    flowNet: Object.fromEntries(CATS.map((c) => [c, round1(totals[c]?.net)])),
    strategic: Object.fromEntries(
      Object.entries(strat)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([k, v]) => [k, round1(v)]),
    ),
    pegStock: peg ? stocks[peg] ?? 0 : null,
    metal: stocks["currency.metal"] ?? 0,
    extracta: stocks["currency.extracta"] ?? 0,
    techTiers: eco.techTiers,
    gatedSamples,
    staffingSamples,
  });
}

facStats.sort((a, b) => b.pop - a.pop);
console.log("=== LIVE FACTIONS (top by pop) ===");
for (const f of facStats.slice(0, 12)) {
  const { gatedSamples, staffingSamples, ...rest } = f;
  console.log(JSON.stringify(rest));
}

console.log("=== GATED DEPOSIT SAMPLES ===");
for (const f of facStats.filter((x) => x.gated > 0).slice(0, 6)) {
  console.log(f.id, "gated", f.gated, "/", f.deposits);
  console.log(JSON.stringify(f.gatedSamples));
}

console.log("=== LABOR STARVE SAMPLES ===");
for (const f of facStats
  .filter((x) => x.laborZeroBuildings > 0)
  .sort((a, b) => b.laborZeroBuildings - a.laborZeroBuildings)
  .slice(0, 6)) {
  console.log(
    f.id,
    "zero",
    f.laborZeroBuildings,
    "gap",
    f.laborGap,
    "need",
    f.laborNeed,
    "pop",
    f.pop,
  );
  console.log(JSON.stringify(f.staffingSamples));
}

const deadFlow = facStats.filter((f) => {
  const rates = Object.values(f.flowRate);
  return rates.every((n) => n <= 0) && f.inhabited > 0;
});
console.log(
  "=== INHABITED WITH ZERO FLOW RATE ===",
  deadFlow.map((f) => f.id),
);

const deadPeg = facStats.filter(
  (f) =>
    f.peg &&
    String(f.peg).startsWith("map.") &&
    !(f.strategic[f.peg] > 0) &&
    f.inhabited > 0,
);
console.log(
  "=== PEG EXTRACTION ZERO ===",
  JSON.stringify(deadPeg.map((f) => ({ id: f.id, peg: f.peg, gatedPct: f.gatedPct }))),
);

console.log(
  "=== BOARD ===",
  JSON.stringify({
    turn: world.meta?.turn,
    factionsWithLand: facStats.length,
    systems: (world.systems || []).length,
  }),
);
