/**
 * Currency peg: rate formula + conversion + tick extra metal/supply.
 * Usage: node scripts/smokeCurrencyPeg.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA = path.join(ROOT, "data");
const LEDGER_PATH = path.join(DATA, "ledger.json");
const FX_PATH = path.join(DATA, "fx-exchange.json");

function snapshot(p) {
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

function restore(p, raw) {
  if (raw == null) {
    if (fs.existsSync(p)) fs.unlinkSync(p);
    return;
  }
  fs.writeFileSync(p, raw, "utf8");
}

const {
  pegExchangeRate,
  gmPegMultiplier,
  convertPeggedResource,
  convertPegExtractionToTreasury,
  pegTransitionMultiplier,
  applyTreasuryPegIncome,
  applyGmPegMultiplier,
  PEG_DOMINANCE_K,
  PEG_TRANSITION_START,
  PEG_TRANSITION_TURNS,
  GM_PEG_MULT_MIN,
  GM_PEG_MULT_MAX,
  GM_PEG_MULT_DEFAULT,
} = await import("../server/currencyPeg.mjs");

const { getContent } = await import("../server/contentLoader.mjs");
const { runEconomyTick, computeFlowBreakdown } = await import("../server/economyTick.mjs");
const { readLedger, writeLedger, ensureFactionEco } = await import("../server/ledger.mjs");
const { normalizeWorld } = await import("../server/normalizeWorld.mjs");

const content = {
  economy_balance: {
    currencyPeg: {
      baseRate: 1,
      dominanceK: PEG_DOMINANCE_K,
      rarityRef: 20,
      rarityExp: 0.35,
      rateMin: 0.01,
      rateMax: 12,
    },
  },
};

const checks = [];
function pass(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail });
  console.log(ok ? "PASS" : "FAIL", name, detail ?? "");
}

// --- rate ---
{
  const totals = { "map.titan": 100 };
  const rate90 = pegExchangeRate(
    { id: "a", extractionByResource: { "map.titan": 90 } },
    "map.titan",
    totals,
    content,
  );
  const rate10 = pegExchangeRate(
    { id: "b", extractionByResource: { "map.titan": 10 } },
    "map.titan",
    totals,
    content,
  );
  pass("rate_90_beats_10", rate90 > rate10, `${rate90.toFixed(4)} > ${rate10.toFixed(4)}`);
  pass(
    "rate_superlinear_vs_share",
    rate90 / rate10 > 90 / 10 && PEG_DOMINANCE_K > 1,
    `ratio ${(rate90 / rate10).toFixed(3)} vs linear 9`,
  );
  const rate50 = pegExchangeRate(
    { id: "c", extractionByResource: { "map.titan": 50 } },
    "map.titan",
    totals,
    content,
  );
  pass("rate_not_linear_90_vs_50", Math.abs(rate90 / rate50 - 90 / 50) > 0.01, `${(rate90 / rate50).toFixed(3)} ≠ 1.8`);
}

// --- gm dial ---
{
  pass("gm_default", gmPegMultiplier(null) === GM_PEG_MULT_DEFAULT);
  pass("gm_in_band", gmPegMultiplier(1.2) === 1.2);
  pass("gm_floor", gmPegMultiplier(0.5) === GM_PEG_MULT_MIN);
  pass("gm_ceil", gmPegMultiplier(3) === GM_PEG_MULT_MAX);
  pass("gm_invalid", gmPegMultiplier("nope") === GM_PEG_MULT_DEFAULT);

  const facPeg = { id: "a", treasuryPeg: "map.titan" };
  const totalsTitan = { "map.titan": 10 };
  const convDefault = convertPeggedResource(facPeg, 10, content, {
    globalExtractionTotals: totalsTitan,
  });
  const convBoosted = convertPeggedResource(facPeg, 10, content, {
    globalExtractionTotals: totalsTitan,
    gmMultipliers: { "map.titan": 1.2 },
  });
  pass(
    "gm_boosts_conversion",
    convBoosted["currency.metal"] > convDefault["currency.metal"],
    `default=${convDefault["currency.metal"]} boosted=${convBoosted["currency.metal"]}`,
  );
  const applied = applyGmPegMultiplier({}, "map.titan", 1.2, content);
  pass("apply_sets_map", applied.ok && applied.gmPegMultipliers["map.titan"] === 1.2);
  const convFromApply = convertPeggedResource(facPeg, 10, content, {
    globalExtractionTotals: totalsTitan,
    gmMultipliers: applied.gmPegMultipliers,
  });
  pass(
    "apply_changes_conversion_vs_default",
    convFromApply["currency.metal"] === convBoosted["currency.metal"] &&
      convFromApply["currency.metal"] > convDefault["currency.metal"],
    `applied=${convFromApply["currency.metal"]} default=${convDefault["currency.metal"]}`,
  );
  const clampedApply = applyGmPegMultiplier({}, "map.titan", 9, content);
  pass("apply_clamps_ceil", clampedApply.ok && clampedApply.multiplier === GM_PEG_MULT_MAX);
  const floorApply = applyGmPegMultiplier({}, "map.titan", 0.1, content);
  pass("apply_clamps_floor", floorApply.ok && floorApply.multiplier === GM_PEG_MULT_MIN);
  const nw = normalizeWorld({
    meta: { gmPegMultipliers: { "map.solari": 1.2 } },
    systems: [],
    factions: [],
  });
  pass(
    "normalize_keeps_peg_dial",
    nw.meta.gmPegMultipliers?.["map.solari"] === 1.2,
  );
  const nwClamped = normalizeWorld({
    meta: { gmPegMultipliers: { "map.solari": 9 } },
    systems: [],
    factions: [],
  });
  pass(
    "normalize_clamps_peg_dial",
    nwClamped.meta.gmPegMultipliers?.["map.solari"] === GM_PEG_MULT_MAX,
  );
}

// --- conversion ---
{
  const small = convertPegExtractionToTreasury(4, 3);
  const large = convertPegExtractionToTreasury(40, 3);
  pass("convert_uncapped", large["currency.metal"] === 120 && small["currency.metal"] === 12);
  pass("convert_equal_supply", large["currency.supply"] === large["currency.metal"]);
  const fac = { id: "a", treasuryPeg: "map.titan" };
  const conv = convertPeggedResource(fac, 10, content, {
    globalExtractionTotals: { "map.titan": 10 },
  });
  pass("convert_pegged_nonzero", conv["currency.metal"] > 0, String(conv["currency.metal"]));
  pass("convert_unpegged_zero", convertPeggedResource({ id: "b" }, 10, content)["currency.metal"] === 0);
}

// --- transition N=3 ---
{
  pass("transition_never_switched", pegTransitionMultiplier(null, 10) === 1);
  pass("transition_switch_turn", pegTransitionMultiplier(10, 10) === PEG_TRANSITION_START);
  pass("transition_done", pegTransitionMultiplier(10, 10 + PEG_TRANSITION_TURNS) === 1);
  pass("transition_n_is_3", PEG_TRANSITION_TURNS === 3);
}

// --- tick: pegged extraction yields extra metal/supply vs the floor ---
const liveContent = getContent();
const tag = `pegtest_${Date.now().toString(36)}`;
const peggedId = `${tag}_peg`;
const floorId = `${tag}_floor`;
const PEG = "map.solari";

function planet(id, ownerHint) {
  return {
    id,
    name: id,
    type: "rocky",
    climate: "temperate",
    resources: [PEG],
    population: 8,
    colonyType: "colony",
    habitable: true,
    buildings: [{ buildingId: "energia.thermal_plant" }],
  };
}

function faction(id, peg) {
  return {
    id,
    name: id,
    color: "#888",
    traits: [],
    npcs: [],
    treasuryPeg: peg,
  };
}

function system(id, owner, planetId) {
  return {
    id,
    name: id,
    ownerFactionId: owner,
    planets: [planet(planetId, owner)],
    stations: [],
    spaceObjects: [],
    resources: [],
  };
}

const world = {
  meta: { turn: 4, gmPegMultipliers: {} },
  factions: [faction(peggedId, PEG), faction(floorId, null)],
  systems: [
    system(`${tag}_sys_p`, peggedId, `${tag}_p`),
    system(`${tag}_sys_f`, floorId, `${tag}_f`),
  ],
  fleets: [],
  legions: [],
};

const ledgerSnap = snapshot(LEDGER_PATH);
const fxSnap = snapshot(FX_PATH);

try {
  const seeded = readLedger();
  for (const id of [peggedId, floorId]) {
    const eco = ensureFactionEco(seeded, id);
    eco.techTiers = { A: 10, B: 10, C: 10, D: 10, E: 10, F: 10 };
    eco.stocks["currency.metal"] = 100;
    eco.stocks["currency.supply"] = 70;
  }
  writeLedger(seeded);

  const flowP = computeFlowBreakdown(world, peggedId, liveContent, seeded.factions[peggedId]);
  const extracted = Number(flowP.strategicExtraction?.[PEG] || 0);
  pass("tick_extracts_solari", extracted > 0, `extracted=${extracted}`);

  const before = structuredClone(readLedger());
  const result = runEconomyTick(world, 5);
  const after = readLedger();

  const metalP = Number(after.factions[peggedId]?.stocks?.["currency.metal"] ?? 0);
  const metalF = Number(after.factions[floorId]?.stocks?.["currency.metal"] ?? 0);
  const metalP0 = Number(before.factions[peggedId]?.stocks?.["currency.metal"] ?? 0);
  const metalF0 = Number(before.factions[floorId]?.stocks?.["currency.metal"] ?? 0);
  const dMetalP = metalP - metalP0;
  const dMetalF = metalF - metalF0;
  const supplyP = Number(after.factions[peggedId]?.stocks?.["currency.supply"] ?? 0);
  const supplyF = Number(after.factions[floorId]?.stocks?.["currency.supply"] ?? 0);
  const dSupplyP = supplyP - Number(before.factions[peggedId]?.stocks?.["currency.supply"] ?? 0);
  const dSupplyF = supplyF - Number(before.factions[floorId]?.stocks?.["currency.supply"] ?? 0);

  const pegConverted = result?.breakdowns?.[peggedId]?.channels?.["currency.metal"]?.pegConverted || 0;
  pass(
    "tick_pegged_extra_metal",
    dMetalP > dMetalF && pegConverted > 0,
    `Δmetal pegged=${dMetalP} floor=${dMetalF} pegConverted=${pegConverted}`,
  );
  pass(
    "tick_pegged_extra_supply",
    dSupplyP > dSupplyF,
    `Δsupply pegged=${dSupplyP} floor=${dSupplyF}`,
  );
  pass(
    "tick_floor_untouched_shape",
    result?.breakdowns?.[floorId]?.channels?.["currency.metal"]?.bridgedFrom === "legacy_only" &&
      !(result?.breakdowns?.[floorId]?.channels?.["currency.metal"]?.pegConverted),
    result?.breakdowns?.[floorId]?.channels?.["currency.metal"]?.bridgedFrom,
  );

  const expected = applyTreasuryPegIncome(
    { id: peggedId, treasuryPeg: PEG, lastTreasuryPeg: PEG },
    { [PEG]: extracted },
    { [PEG]: extracted * 2 },
    liveContent,
    { currentTurn: 5 },
  );
  pass(
    "tick_matches_formula",
    pegConverted === expected["currency.metal"],
    `channel=${pegConverted} formula=${expected["currency.metal"]}`,
  );
  const rateDefault = pegExchangeRate(
    { id: peggedId, treasuryPeg: PEG, extractionByResource: { [PEG]: extracted } },
    PEG,
    { [PEG]: extracted * 2 },
    liveContent,
  );
  const rateBoosted = pegExchangeRate(
    { id: peggedId, treasuryPeg: PEG, extractionByResource: { [PEG]: extracted } },
    PEG,
    { [PEG]: extracted * 2 },
    liveContent,
    { gmMultipliers: { [PEG]: 1.2 } },
  );
  pass(
    "tick_gm_1_2_beats_default",
    rateBoosted > rateDefault && Math.abs(rateBoosted / rateDefault - 1.2) < 1e-9,
    `default=${rateDefault.toFixed(4)} gm1.2=${rateBoosted.toFixed(4)}`,
  );
  const liveApplied = applyGmPegMultiplier({}, PEG, 1.2, liveContent);
  pass(
    "apply_live_solari",
    liveApplied.ok && liveApplied.gmPegMultipliers[PEG] === 1.2,
    liveApplied.error,
  );
  const liveUnknown = applyGmPegMultiplier({}, "map.not_a_resource", 1.2, liveContent);
  pass("apply_rejects_unknown", liveUnknown.ok === false, liveUnknown.error);
} catch (err) {
  pass("tick_runs", false, String(err?.stack || err));
} finally {
  restore(LEDGER_PATH, ledgerSnap);
  restore(FX_PATH, fxSnap);
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
if (failed.length) {
  process.exit(1);
}
assert.equal(failed.length, 0);
console.log("OK currency peg");
