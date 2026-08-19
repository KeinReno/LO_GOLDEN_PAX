/**
 * C5 T5.3 — dry-run tick over a scratch copy, with before/after stock diffs.
 * Extracted from ../gmCockpit.mjs.
 */
import path from "node:path";
import {
  readLiveBoard,
  backupTurnSnapshot,
  restoreTurnSnapshot,
} from "../tableStore.mjs";
import { readLedger, ensureFactionEco, ensureAllFactions } from "../ledger.mjs";
import { processTurn } from "../processTurn.mjs";

const METRIC_STOCKS = [
  "currency.metal",
  "currency.cognitio",
  "currency.materia",
  "currency.energia",
  "currency.bios",
  "currency.supply",
];

/**
 * Snapshot key treasury stocks per faction (for dry-run before/after).
 * @param {object|null} world
 * @param {object} ledger
 */
function captureFactionStockMetrics(world, ledger) {
  const rows = [];
  for (const fac of world?.factions ?? []) {
    const eco = ensureFactionEco(ledger, fac.id);
    const stocks = {};
    for (const id of METRIC_STOCKS) {
      stocks[id] = Number(eco.stocks?.[id] ?? 0);
    }
    rows.push({
      factionId: fac.id,
      name: fac.name || fac.id,
      stocks,
    });
  }
  return rows;
}

/**
 * Income/expense from economyTick breakdown channels (net ≥0 = income).
 * @param {Record<string, object>|null|undefined} breakdowns
 * @param {object|null} world
 */
function summarizeEconomyBreakdowns(breakdowns, world) {
  const out = [];
  for (const [factionId, b] of Object.entries(breakdowns || {})) {
    const channels = b?.channels && typeof b.channels === "object" ? b.channels : {};
    let income = 0;
    let expense = 0;
    const nets = {};
    for (const [cur, ch] of Object.entries(channels)) {
      const net = Number(ch?.net) || 0;
      nets[cur] = net;
      if (net >= 0) income += net;
      else expense += Math.abs(net);
    }
    const name =
      (world?.factions ?? []).find((f) => f.id === factionId)?.name || factionId;
    out.push({
      factionId,
      name,
      income: Math.round(income),
      expense: Math.round(expense),
      net: Math.round(income - expense),
      nets,
    });
  }
  out.sort((a, b) => a.name.localeCompare(b.name, "ru"));
  return out;
}

function stockDiffRows(beforeRows, afterRows) {
  const afterMap = new Map(afterRows.map((r) => [r.factionId, r]));
  const diffs = [];
  for (const before of beforeRows) {
    const after = afterMap.get(before.factionId);
    if (!after) continue;
    const delta = {};
    let changed = false;
    for (const id of METRIC_STOCKS) {
      const d = (after.stocks[id] ?? 0) - (before.stocks[id] ?? 0);
      delta[id] = d;
      if (d !== 0) changed = true;
    }
    diffs.push({
      factionId: before.factionId,
      name: before.name,
      before: before.stocks,
      after: after.stocks,
      delta,
      changed,
    });
  }
  return diffs;
}

/**
 * C5 T5.3 — dry-run tick over a scratch copy.
 * Pattern: backupTurnSnapshot (safety + scratch audit) → processTurn({ force }) →
 * capture metric diffs → always restoreTurnSnapshot so live ledger/published/intents
 * are unchanged after the call returns.
 */
export function runDryRunTick() {
  const world = readLiveBoard();
  if (!world) {
    return { ok: false, error: "Нет published board", dryRun: true };
  }
  const turn = world.meta?.turn ?? 0;
  // Scratch audit copy (same file set as backupTurnSnapshot / pre_tick).
  const scratchDir = backupTurnSnapshot(turn, "dry_run_scratch");
  const safetyDir = backupTurnSnapshot(turn, "pre_dry_run");

  const beforeLedger = ensureAllFactions(readLedger(), world);
  const beforeStocks = captureFactionStockMetrics(world, beforeLedger);
  const startedAt = new Date().toISOString();

  /** @type {Record<string, unknown>} */
  let payload;
  try {
    const result = processTurn({ force: true, master: true });
    if (!result?.ok) {
      payload = {
        ok: false,
        error: result?.error || "processTurn failed",
        dryRun: true,
        applied: false,
        scratchDir: path.basename(scratchDir),
        safetyDir: path.basename(safetyDir),
      };
    } else {
      const afterWorld = readLiveBoard();
      const afterLedger = ensureAllFactions(readLedger(), afterWorld || world);
      const afterStocks = captureFactionStockMetrics(
        afterWorld || world,
        afterLedger,
      );
      const stockDiffs = stockDiffRows(beforeStocks, afterStocks);
      const economy = summarizeEconomyBreakdowns(
        result.journal?.economy,
        afterWorld || world,
      );

      payload = {
        ok: true,
        dryRun: true,
        applied: false,
        turnFrom: result.journal?.turnFrom ?? turn,
        turnTo: result.journal?.turnTo ?? turn + 1,
        startedAt,
        finishedAt: new Date().toISOString(),
        scratchDir: path.basename(scratchDir),
        safetyDir: path.basename(safetyDir),
        economy,
        stockDiffs,
        eventCount: Array.isArray(result.journal?.events)
          ? result.journal.events.length
          : 0,
        note:
          "Пробный прогон завершён; live board восстановлен из pre_dry_run (изменения не применены).",
      };
    }
  } catch (err) {
    payload = {
      ok: false,
      dryRun: true,
      applied: false,
      error: err instanceof Error ? err.message : String(err),
      scratchDir: path.basename(scratchDir),
      safetyDir: path.basename(safetyDir),
    };
  }

  try {
    restoreTurnSnapshot(safetyDir);
  } catch (restoreErr) {
    console.error("[runDryRunTick] safety restore failed:", restoreErr);
    payload = markDryRunRestoreFailed(payload, restoreErr);
  }
  return payload;
}

/** If safety restore fails, never report ok — live board may still be the dry-run tick. */
export function markDryRunRestoreFailed(payload, restoreErr) {
  const detail =
    restoreErr instanceof Error ? restoreErr.message : String(restoreErr);
  return {
    ...payload,
    ok: false,
    restoreFailed: true,
    applied: true,
    error: `Не удалось откатить пробный тик: ${detail}`,
  };
}
