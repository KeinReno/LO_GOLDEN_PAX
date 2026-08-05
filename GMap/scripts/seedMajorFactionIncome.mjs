/**
 * Положительный доход (metal bridge_income) для Белатора / Амальфеи / Карнеда.
 * - убирает ledger-записи с turn > текущего хода кампании
 * - ставит мягкие налоги (low)
 * - прогоняет economy tick на текущем ходе
 *
 * Run: node GMap/scripts/seedMajorFactionIncome.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadContent, getContent } from "../server/contentLoader.mjs";
import { runEconomyTick, computeFlowBreakdown } from "../server/economyTick.mjs";
import { readLedger, writeLedger, getFactionPublicEco } from "../server/ledger.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORLD = path.join(ROOT, "data/published.json");
const TARGETS = ["faction_belator", "faction_amalfea", "faction_karned"];

loadContent();
const world = JSON.parse(fs.readFileSync(WORLD, "utf8"));
const turn = Number(world.meta?.turn ?? 15);

let ledger = readLedger();
const beforeLen = (ledger.entries || []).length;
ledger.entries = (ledger.entries || []).filter((e) => {
  if (!TARGETS.includes(e.factionId)) return true;
  if (e.turn == null) return true;
  // убрать «призрачные» будущие ходы
  if (Number(e.turn) > turn) return false;
  // текущий ход: чистый лист по металлу — тик запишет свежий bridge_income
  if (Number(e.turn) === turn && e.currencyId === "currency.metal") {
    return false;
  }
  return true;
});
console.log(
  "pruned entries",
  beforeLen - ledger.entries.length,
  "keep turn ≤",
  turn,
);

for (const id of TARGETS) {
  const eco = ledger.factions[id];
  if (!eco) continue;
  eco.taxes = {
    "tax.industry": "low",
    "tax.supply": "low",
    "tax.materia": "low",
    "tax.bios": "low",
    "tax.energia": "low",
  };
  eco.pendingPolicy = eco.pendingPolicy || { taxes: {} };
  eco.pendingPolicy.taxes = {};
  eco.pressure = Math.min(Number(eco.pressure || 0), 12);
}
writeLedger(ledger);

// economyTick reads ledger from disk
const result = runEconomyTick(world, turn);
const bdAll = result.breakdowns || {};

for (const id of TARGETS) {
  const ch = bdAll[id]?.channels?.["currency.metal"];
  const pub = getFactionPublicEco(id);
  const recentMetal = (pub.recent || []).filter(
    (r) => r.currencyId === "currency.metal" && r.turn === turn,
  );
  const income = recentMetal
    .filter((r) => r.delta > 0)
    .reduce((s, r) => s + r.delta, 0);
  const expense = recentMetal
    .filter((r) => r.delta < 0)
    .reduce((s, r) => s + Math.abs(r.delta), 0);
  const flows = computeFlowBreakdown(world, id, getContent(), pub);
  console.log(id, {
    metalChannel: ch
      ? { base: ch.base, upkeep: ch.upkeep, net: ch.net, tax: ch.tax }
      : null,
    uiIncome: income,
    uiExpense: expense,
    balance: income - expense,
    flowB: Math.round((flows.totals.B?.net || 0) * 10) / 10,
  });
}
