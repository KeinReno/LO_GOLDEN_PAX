/**
 * C5 GM cockpit helpers — faction compare, session brief, intervention log.
 * Extends existing ops/balance surfaces; does not invent parallel state.
 */
import path from "node:path";
import {
  DATA_DIR,
  TURNS_DIR,
  readJson,
  writeJson,
  readLiveBoard,
  writeLiveBoard,
  backupTurnSnapshot,
  restoreTurnSnapshot,
} from "./tableStore.mjs";
import {
  readLedger,
  ensureFactionEco,
  ensureAllFactions,
} from "./ledger.mjs";
import {
  countFactionForces,
  resolveForceApMax,
} from "./apBudget.mjs";
import { getContent } from "./contentLoader.mjs";
import { listBackupDirs } from "./opsHealth.mjs";
import { processTurn } from "./processTurn.mjs";
import {
  applyGmPegMultiplier,
  gmPegMultiplier,
  normalizeGmPegMultipliers,
  pegCfg,
  resolveTreasuryPeg,
} from "./currencyPeg.mjs";

export const GM_INTERVENTIONS_PATH = path.join(
  DATA_DIR,
  "gm-interventions.json",
);

const TREASURY_SHIFT_MIN = 25;

/** @returns {{ entries: object[] }} */
function readInterventionStore() {
  const raw = readJson(GM_INTERVENTIONS_PATH, null);
  if (!raw || typeof raw !== "object") return { entries: [] };
  return {
    entries: Array.isArray(raw.entries) ? raw.entries : [],
  };
}

/**
 * Append-only GM intervention row (JSON via tableStore — no raw fs).
 * @param {object} entry
 */
export function appendGmIntervention(entry) {
  const store = readInterventionStore();
  const row = {
    id: `gmi_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    at: new Date().toISOString(),
    actor: entry?.actor || "gm",
    action: entry?.action || "unknown",
    before: entry?.before ?? null,
    after: entry?.after ?? null,
    detail: entry?.detail ?? null,
  };
  store.entries.push(row);
  // keep last 500 — never rewrite older payloads, only trim head
  if (store.entries.length > 500) {
    store.entries = store.entries.slice(-500);
  }
  writeJson(GM_INTERVENTIONS_PATH, store);
  return row;
}

export function listGmInterventions(limit = 40) {
  const n = Math.max(1, Math.min(200, Number(limit) || 40));
  const store = readInterventionStore();
  return {
    ok: true,
    path: "data/gm-interventions.json",
    entries: store.entries.slice(-n).reverse(),
    total: store.entries.length,
  };
}

/**
 * Faction comparison for OpsHealthPanel (health domain).
 * Reuses ledger stocks + apBudget countFactionForces / resolveForceApMax.
 */
export function buildFactionComparison(world = readLiveBoard()) {
  if (!world) {
    return { ok: false, error: "live board not loaded", rows: [] };
  }
  const ledger = ensureAllFactions(readLedger(), world);
  const rules = getContent()?.rules;
  const rows = [];

  for (const fac of world.factions ?? []) {
    const eco = ensureFactionEco(ledger, fac.id);
    const { fleets, legions } = countFactionForces(world, fac.id);
    const forceAp = resolveForceApMax(world, fac.id, rules);
    const metal = Number(eco.stocks?.["currency.metal"] ?? 0);
    const cognitio = Number(eco.stocks?.["currency.cognitio"] ?? 0);
    const unlockedTechs = Array.isArray(eco.unlockedTechs)
      ? eco.unlockedTechs.length
      : 0;
    const openPaths = Array.isArray(eco.openPaths) ? eco.openPaths.length : 0;
    const roleScores = eco.roleScores && typeof eco.roleScores === "object" ? eco.roleScores : {};
    const roleScoreTotal = Object.values(roleScores).reduce(
      (sum, v) => sum + (Number(v) || 0),
      0,
    );
    const planets = (world.systems || []).filter((s) => s.ownerFactionId === fac.id).length;

    // Sort formula: power = metal + cognitio×2 + fleets×15 + legions×12 + unlockedTechs×8 + openPaths×20 + forceAp×5 + roleScoreTotal×0.01
    const power =
      metal +
      cognitio * 2 +
      fleets * 15 +
      legions * 12 +
      unlockedTechs * 8 +
      openPaths * 20 +
      forceAp * 5 +
      roleScoreTotal * 0.01;

    rows.push({
      factionId: fac.id,
      name: fac.name || fac.id,
      color: fac.color || "#888",
      planets,
      metal,
      cognitio,
      fleets,
      legions,
      forceAp,
      unlockedTechs,
      openPaths,
      roleScores,
      roleScoreTotal: Math.round(roleScoreTotal),
      power: Math.round(power),
    });
  }

  rows.sort((a, b) => b.power - a.power || a.name.localeCompare(b.name, "ru"));

  // Detect leader runaway / snowball
  const leaderPower = rows[0]?.power ?? 0;
  const runnerPower = rows[1]?.power ?? 0;
  const leadRatio = runnerPower > 0 ? Number((leaderPower / runnerPower).toFixed(2)) : null;
  const isSnowball = leadRatio !== null && leadRatio >= 1.75;

  return {
    ok: true,
    turn: world.meta?.turn ?? null,
    // Documented for GM: same formula as code comment above.
    sortFormula:
      "metal + cognitio×2 + fleets×15 + legions×12 + unlockedTechs×8 + openPaths×20 + forceAp×5 + roleScoreTotal×0.01",
    snowballAlert: isSnowball,
    leadRatio,
    rows,
  };
}

function backupDirPath(name) {
  if (!name || name.includes("..") || name.includes("/") || name.includes("\\")) {
    return null;
  }
  return path.join(TURNS_DIR, name);
}

function loadBackupBundle(dirName) {
  const dir = backupDirPath(dirName);
  if (!dir) return null;
  const meta = readJson(path.join(dir, "backup-meta.json"), null);
  const published = readJson(path.join(dir, "published.json"), null);
  const ledger = readJson(path.join(dir, "ledger.json"), null);
  const diplo = readJson(path.join(dir, "diplo-offers.json"), null);
  return {
    name: dirName,
    meta,
    published,
    ledger,
    diplo,
  };
}

function offerList(diplo) {
  if (!diplo) return [];
  if (Array.isArray(diplo)) return diplo;
  if (Array.isArray(diplo.offers)) return diplo.offers;
  return [];
}

function factionEcoMap(ledger) {
  const out = {};
  const factions = ledger?.factions && typeof ledger.factions === "object"
    ? ledger.factions
    : {};
  for (const [id, eco] of Object.entries(factions)) {
    out[id] = eco;
  }
  return out;
}

function techSet(eco) {
  return new Set(
    Array.isArray(eco?.unlockedTechs) ? eco.unlockedTechs.map(String) : [],
  );
}

/**
 * Human-readable session brief from two data/turns snapshots
 * (produced by backupTurnSnapshot — no parallel snapshot mechanism).
 */
export function buildSessionBrief(opts = {}) {
  const backups = listBackupDirs();
  if (backups.length < 1) {
    return {
      ok: false,
      error: "Нет снимков в data/turns/ — сначала сделайте бэкап или тик",
      text: "",
      backups: [],
    };
  }

  let newerName = opts.to || opts.newer || null;
  let olderName = opts.from || opts.older || null;

  if (!newerName) newerName = backups[0].name;
  if (!olderName) {
    olderName =
      backups.find((b) => b.name !== newerName)?.name ?? backups[0].name;
  }

  const newer = loadBackupBundle(newerName);
  const older = loadBackupBundle(olderName);
  if (!newer || !older) {
    return {
      ok: false,
      error: "Не удалось прочитать один из снимков",
      text: "",
      from: olderName,
      to: newerName,
      backups: backups.slice(0, 12).map((b) => b.name),
    };
  }

  const lines = [];
  const turnFrom = older.meta?.turn ?? older.published?.meta?.turn ?? "?";
  const turnTo = newer.meta?.turn ?? newer.published?.meta?.turn ?? "?";
  lines.push(`Бриф сессии · снимок «${olderName}» → «${newerName}»`);
  lines.push(`Ход ${turnFrom} → ${turnTo}`);
  lines.push("");

  // Diplo events
  const oldOffers = new Map(
    offerList(older.diplo).map((o) => [String(o.id || o.offerId), o]),
  );
  const newOffers = offerList(newer.diplo);
  const diploLines = [];
  for (const o of newOffers) {
    const id = String(o.id || o.offerId || "");
    const prev = oldOffers.get(id);
    const status = o.status || o.state || "?";
    if (!prev) {
      diploLines.push(
        `· новый оффер ${id || "?"} (${o.fromFactionId || "?"}→${o.toFactionId || "?"}) · ${status}`,
      );
    } else {
      const prevStatus = prev.status || prev.state || "?";
      if (prevStatus !== status) {
        diploLines.push(
          `· оффер ${id}: ${prevStatus} → ${status}`,
        );
      }
    }
  }
  lines.push("Дипломатия");
  if (diploLines.length === 0) lines.push("· без заметных изменений");
  else lines.push(...diploLines.slice(0, 12));
  lines.push("");

  // Research completions
  const oldEco = factionEcoMap(older.ledger);
  const newEco = factionEcoMap(newer.ledger);
  const researchLines = [];
  const allIds = new Set([...Object.keys(oldEco), ...Object.keys(newEco)]);
  for (const fid of allIds) {
    const before = techSet(oldEco[fid]);
    const after = techSet(newEco[fid]);
    const gained = [...after].filter((t) => !before.has(t));
    if (gained.length) {
      const name =
        (newer.published?.factions ?? []).find((f) => f.id === fid)?.name ||
        fid;
      researchLines.push(
        `· ${name}: +${gained.length} техн. (${gained.slice(0, 4).join(", ")}${gained.length > 4 ? "…" : ""})`,
      );
    }
  }
  lines.push("Исследования");
  if (researchLines.length === 0) lines.push("· без завершённых исследований");
  else lines.push(...researchLines.slice(0, 16));
  lines.push("");

  // Treasury shifts
  const treasuryLines = [];
  for (const fid of allIds) {
    const before = Number(oldEco[fid]?.stocks?.["currency.metal"] ?? 0);
    const after = Number(newEco[fid]?.stocks?.["currency.metal"] ?? 0);
    const delta = after - before;
    if (Math.abs(delta) >= TREASURY_SHIFT_MIN) {
      const name =
        (newer.published?.factions ?? []).find((f) => f.id === fid)?.name ||
        fid;
      const sign = delta > 0 ? "+" : "";
      treasuryLines.push(
        `· ${name}: металл ${before} → ${after} (${sign}${delta})`,
      );
    }
  }
  lines.push(`Казна (сдвиг ≥ ${TREASURY_SHIFT_MIN} металла)`);
  if (treasuryLines.length === 0) lines.push("· крупных сдвигов нет");
  else lines.push(...treasuryLines.slice(0, 16));
  lines.push("");

  // Open quests (from newer published)
  const quests = Array.isArray(newer.published?.quests)
    ? newer.published.quests
    : [];
  const openQuests = quests.filter(
    (q) =>
      q &&
      q.status !== "resolved" &&
      q.status !== "expired" &&
      q.status !== "failed" &&
      q.status !== "completed",
  );
  lines.push("Открытые квесты");
  if (openQuests.length === 0) {
    lines.push("· нет открытых");
  } else {
    for (const q of openQuests.slice(0, 12)) {
      lines.push(
        `· ${q.title || q.name || q.id || "?"} (${q.factionId || "?"} · ${q.status || "open"})`,
      );
    }
    if (openQuests.length > 12) {
      lines.push(`· …ещё ${openQuests.length - 12}`);
    }
  }

  return {
    ok: true,
    from: olderName,
    to: newerName,
    turnFrom,
    turnTo,
    text: lines.join("\n"),
    backups: backups.slice(0, 16).map((b) => b.name),
  };
}

export function listCockpitBackups(limit = 16) {
  const n = Math.max(1, Math.min(40, Number(limit) || 16));
  return {
    ok: true,
    backups: listBackupDirs()
      .slice(0, n)
      .map((b) => ({ name: b.name, mtime: b.mtime })),
  };
}

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

  try {
    const result = processTurn({ force: true, master: true });
    if (!result?.ok) {
      return {
        ok: false,
        error: result?.error || "processTurn failed",
        dryRun: true,
        applied: false,
        scratchDir: path.basename(scratchDir),
        safetyDir: path.basename(safetyDir),
      };
    }

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

    return {
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
  } catch (err) {
    return {
      ok: false,
      dryRun: true,
      applied: false,
      error: err instanceof Error ? err.message : String(err),
      scratchDir: path.basename(scratchDir),
      safetyDir: path.basename(safetyDir),
    };
  } finally {
    try {
      restoreTurnSnapshot(safetyDir);
    } catch (restoreErr) {
      console.error("[runDryRunTick] safety restore failed:", restoreErr);
    }
  }
}

function pegKnownIds(world, content) {
  const known = new Set();
  for (const fac of world?.factions || []) {
    const peg = resolveTreasuryPeg(fac, content);
    if (peg) known.add(peg);
  }
  const bindings = content?.faction_currency_bindings?.bindings || {};
  for (const bind of Object.values(bindings)) {
    if (typeof bind?.treasuryPeg === "string" && bind.treasuryPeg.trim()) {
      known.add(bind.treasuryPeg.trim());
    }
  }
  return known;
}

/** GM cockpit: current peg dials + picker options (strategic + live pegs). */
export function listGmPegMultipliers(world) {
  const content = getContent();
  const cfg = pegCfg(content);
  const stored = normalizeGmPegMultipliers(world?.meta?.gmPegMultipliers, content);
  const ids = new Set(pegKnownIds(world, content));
  for (const id of Object.keys(stored)) ids.add(id);
  for (const def of Object.values(content?.map_resources || {})) {
    if ((def?.rank === "strategic" || def?.strategic === true) && def.id) {
      ids.add(def.id);
    }
  }
  const peggedBy = {};
  for (const fac of world?.factions || []) {
    const peg = resolveTreasuryPeg(fac, content);
    if (!peg) continue;
    if (!peggedBy[peg]) peggedBy[peg] = [];
    peggedBy[peg].push(fac.id);
  }
  const resources = [...ids]
    .filter(Boolean)
    .sort()
    .map((id) => {
      const def = content?.map_resources?.[id];
      return {
        id,
        name: def?.name || id,
        multiplier: stored[id] ?? cfg.gmDefault,
        peggedBy: peggedBy[id] || [],
      };
    });
  return {
    ok: true,
    min: cfg.gmMin,
    max: cfg.gmMax,
    default: cfg.gmDefault,
    multipliers: stored,
    resources,
  };
}

/**
 * Persist one GM peg multiplier onto the live board.
 * Clamp is in `applyGmPegMultiplier` / `gmPegMultiplier`.
 */
export function setGmPegMultiplier(resourceId, multiplier) {
  const world = readLiveBoard();
  if (!world) return { ok: false, error: "Нет board" };
  const content = getContent();
  const id = typeof resourceId === "string" ? resourceId.trim() : "";
  const beforeRaw = world.meta?.gmPegMultipliers?.[id];
  const before =
    beforeRaw == null || beforeRaw === ""
      ? pegCfg(content).gmDefault
      : gmPegMultiplier(beforeRaw, content);
  const applied = applyGmPegMultiplier(world.meta, resourceId, multiplier, content, {
    knownIds: pegKnownIds(world, content),
  });
  if (!applied.ok) return applied;
  if (!world.meta) world.meta = {};
  world.meta.gmPegMultipliers = applied.gmPegMultipliers;
  const written = writeLiveBoard(world, {
    backup: false,
    reason: "gm_peg_multiplier",
  });
  if (!written?.ok) {
    return { ok: false, error: written?.error || "write failed" };
  }
  appendGmIntervention({
    actor: "gm",
    action: "set_peg_multiplier",
    before: { resourceId: applied.resourceId, multiplier: before },
    after: { resourceId: applied.resourceId, multiplier: applied.multiplier },
    detail: { gmPegMultipliers: applied.gmPegMultipliers },
  });
  return {
    ...applied,
    tableRevision: written.tableRevision,
    updatedAt: written.updatedAt,
  };
}
