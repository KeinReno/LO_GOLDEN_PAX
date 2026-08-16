/**
 * v0.5 economy smoke: one tick, assert strategic / peg / RoleScore / FX, restore files.
 * Usage: node scripts/smoke-economy-v05.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

function facEco(ledger, id) {
  return ledger?.factions?.[id] || null;
}

function pickFaction(world, content, peg) {
  const bindings = content.faction_currency_bindings?.bindings || {};
  for (const fac of world.factions || []) {
    const b = bindings[fac.id];
    const pegId = fac.treasuryPeg || b?.treasuryPeg;
    if (pegId === peg) return fac;
  }
  return (
    (world.factions || []).find((f) => f.id === "faction_belator") ||
    world.factions?.[0]
  );
}

async function main() {
  const { readLiveBoard } = await import("../server/tableStore.mjs");
  const { getContent } = await import("../server/contentLoader.mjs");
  const { readLedger } = await import("../server/ledger.mjs");
  const { runEconomyTick, computeFlowBreakdown, resolveTreasuryPeg } =
    await import("../server/economyTick.mjs");
  const { getMarketRatesPayload } = await import("../server/marketRates.mjs");
  const { readFxExchangeState } = await import("../server/fxExchange.mjs");

  const content = getContent();
  const world = readLiveBoard();
  if (!world?.factions?.length) {
    console.error("FAIL: no published world");
    process.exit(1);
  }

  const turn = Number(world.meta?.turn) || 0;
  const belator =
    pickFaction(world, content, "map.solari") ||
    world.factions.find((f) => f.id === "faction_belator");
  const amalfea =
    pickFaction(world, content, "map.blumatid") ||
    world.factions.find((f) => f.id === "faction_amalfea");

  const ledgerBefore = structuredClone(readLedger());
  const ledgerSnap = snapshot(LEDGER_PATH);
  const fxSnap = snapshot(FX_PATH);

  const facId = belator?.id || "faction_belator";
  const peg = resolveTreasuryPeg(belator || { id: facId }, content) || "map.solari";
  const before = facEco(ledgerBefore, facId);
  const beforeStock = Number(before?.stocks?.[peg] ?? 0);
  const beforeRole = {
    structural: Number(before?.roleScores?.structural ?? 0),
    energy: Number(before?.roleScores?.energy ?? 0),
  };

  const flow = computeFlowBreakdown(world, facId, content, before);
  const extracted = Number(flow.strategicExtraction?.[peg] ?? 0);
  const strategicKeys = Object.keys(flow.strategicExtraction || {}).filter(
    (k) => (flow.strategicExtraction[k] || 0) > 0,
  );

  console.log("--- smoke economy v0.5 ---");
  console.log("turn", turn, "faction", facId, "peg", peg);
  console.log("strategicExtraction keys", strategicKeys.slice(0, 12));
  console.log("peg extraction this tick (forecast)", extracted);
  console.log("before stock", peg, beforeStock, "roleScores", beforeRole);

  let tickErr = null;
  let result = null;
  try {
    result = runEconomyTick(world, turn + 1);
  } catch (e) {
    tickErr = e;
  }

  const ledgerAfter = readLedger();
  const after = facEco(ledgerAfter, facId);
  const afterStock = Number(after?.stocks?.[peg] ?? 0);
  const afterRole = {
    structural: Number(after?.roleScores?.structural ?? 0),
    energy: Number(after?.roleScores?.energy ?? 0),
  };
  const ROLE_IDS = [
    "structural",
    "energy",
    "offensive",
    "defensive",
    "mobility",
    "cognitive",
    "biological",
    "exotic",
  ];
  const channel = result?.breakdowns?.[facId]?.channels?.[peg];
  const fxState = readFxExchangeState();
  const ratesPayload = getMarketRatesPayload(content);
  const fxPairs = (ratesPayload.rates || []).filter(
    (r) => String(r.pair || "").includes("fx.") && String(r.pair).includes("→"),
  );

  // Restore immediately
  restore(LEDGER_PATH, ledgerSnap);
  restore(FX_PATH, fxSnap);

  const checks = [];
  const pass = (name, ok, detail) => {
    checks.push({ name, ok: !!ok, detail });
    console.log(ok ? "PASS" : "FAIL", name, detail ?? "");
  };

  pass("tick_runs", !tickErr, tickErr ? String(tickErr.message || tickErr) : "ok");
  pass(
    "rolescore_eight_keys",
    ROLE_IDS.every((id) => typeof after?.roleScores?.[id] === "number"),
    ROLE_IDS.map((id) => `${id}=${after?.roleScores?.[id] ?? "?"}`).join(" "),
  );
  pass(
    "strategic_extraction_present",
    strategicKeys.length > 0 || extracted > 0,
    strategicKeys.length
      ? `${strategicKeys.length} resources`
      : "no strategic deposits on owned systems (soft)",
  );
  if (extracted > 0) {
    pass(
      "named_stock_increases",
      afterStock >= beforeStock + Math.floor(extracted),
      `${beforeStock} → ${afterStock} (need +${Math.floor(extracted)})`,
    );
    pass(
      "treasury_channel_is_peg_not_materia",
      channel?.bridgedFrom === `${peg}→treasury`,
      channel?.bridgedFrom || "no channel",
    );
    pass(
      "rolescore_energy_grows_for_solari",
      peg === "map.solari" ? afterRole.energy > beforeRole.energy : true,
      `${beforeRole.energy} → ${afterRole.energy}`,
    );
  } else {
    pass(
      "named_stock_stable_without_extract",
      afterStock === beforeStock || afterStock >= beforeStock,
      `${beforeStock} → ${afterStock}`,
    );
    pass("treasury_channel_shape", !channel || channel.bridgedFrom?.includes("→treasury"), channel?.bridgedFrom);
  }

  // Blumatid faction RoleScore structural if they extract
  if (amalfea?.id) {
    const aFlow = computeFlowBreakdown(world, amalfea.id, content, facEco(ledgerBefore, amalfea.id));
    const blu = Number(aFlow.strategicExtraction?.["map.blumatid"] ?? 0);
    const aAfter = facEco(ledgerAfter, amalfea.id);
    const aBefore = facEco(ledgerBefore, amalfea.id);
    if (blu > 0) {
      pass(
        "rolescore_structural_blumatid",
        Number(aAfter?.roleScores?.structural ?? 0) >
          Number(aBefore?.roleScores?.structural ?? 0),
        `${aBefore?.roleScores?.structural ?? 0} → ${aAfter?.roleScores?.structural ?? 0}`,
      );
    }
  }

  pass(
    "fx_rates_or_credits",
    fxPairs.length > 0 || Object.keys(fxState.credits || {}).length > 0,
    `pairs=${fxPairs.length} credits=${Object.keys(fxState.credits || {}).length} variant=${fxState.variant}`,
  );
  if (fxPairs.length >= 2) {
    const buys = fxPairs.map((r) => Number(r.buy));
    pass(
      "fx_pairs_not_all_identical",
      new Set(buys.map((b) => b.toFixed(4))).size > 1,
      `sample buy ${buys.slice(0, 3).join(", ")}`,
    );
  }

  // B1 / C1.T1.1: positive category nets must NOT mirror into metal/supply.
  const metalCh = result?.breakdowns?.[facId]?.channels?.["currency.metal"];
  const supplyCh = result?.breakdowns?.[facId]?.channels?.["currency.supply"];
  const materiaNetCh = Number(
    result?.breakdowns?.[facId]?.channels?.["currency.materia"]?.net ?? 0,
  );
  const energiaNetCh = Number(
    result?.breakdowns?.[facId]?.channels?.["currency.energia"]?.net ?? 0,
  );
  const biosNetCh = Number(
    result?.breakdowns?.[facId]?.channels?.["currency.bios"]?.net ?? 0,
  );
  pass(
    "bridge_not_mirroring_category_nets",
    metalCh?.bridgedFrom === "legacy_only" &&
      supplyCh?.bridgedFrom === "legacy_only",
    `metal=${metalCh?.bridgedFrom} supply=${supplyCh?.bridgedFrom}`,
  );
  // If materia/energia/bios nets are largely positive, metal/supply channel base
  // must stay near legacy-only scale (not ≈ category net). Soft numeric guard.
  if (materiaNetCh > 50) {
    const metalBase = Number(metalCh?.base ?? 0);
    pass(
      "metal_base_not_materia_mirror",
      metalBase < materiaNetCh * 0.5,
      `metal.base=${metalBase} materia.net=${materiaNetCh}`,
    );
  }
  if (biosNetCh + energiaNetCh > 50) {
    const supplyBase = Number(supplyCh?.base ?? 0);
    pass(
      "supply_base_not_bios_energia_mirror",
      supplyBase < (biosNetCh + energiaNetCh) * 0.5,
      `supply.base=${supplyBase} bios+energia=${biosNetCh + energiaNetCh}`,
    );
  }

  const failed = checks.filter((c) => !c.ok);
  console.log("---");
  console.log(
    failed.length
      ? `SMOKE FAIL ${failed.length}/${checks.length}`
      : `SMOKE OK ${checks.length}/${checks.length}`,
  );
  console.log("(ledger + fx-exchange restored)");

  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
