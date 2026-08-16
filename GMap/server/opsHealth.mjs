/**
 * Ops health: tick miss detection, backup cron, prune (P8.2).
 */
import fs from "node:fs";
import path from "node:path";
import {
  DATA_DIR,
  TURNS_DIR,
  ensureDataDir,
  getTableMeta,
  setTableMeta,
  backupTurnSnapshot,
  readLiveBoard,
} from "./tableStore.mjs";

const DEFAULT_KEEP = 80;

export function listBackupDirs() {
  ensureDataDir();
  if (!fs.existsSync(TURNS_DIR)) return [];
  return fs
    .readdirSync(TURNS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      const full = path.join(TURNS_DIR, d.name);
      let mtime = 0;
      try {
        mtime = fs.statSync(full).mtimeMs;
      } catch {
        /* ignore */
      }
      return { name: d.name, path: full, mtime };
    })
    .sort((a, b) => b.mtime - a.mtime);
}

export function pruneBackups(keep = DEFAULT_KEEP) {
  const list = listBackupDirs();
  const excess = list.slice(Math.max(0, keep));
  let removed = 0;
  for (const d of excess) {
    try {
      fs.rmSync(d.path, { recursive: true, force: true });
      removed++;
    } catch (e) {
      console.warn("[backup] prune failed", d.name, e.message);
    }
  }
  return { kept: list.length - removed, removed };
}

/** Extended snapshot: board + fog + ledger + intents + engagements + rp index. */
export function runOpsBackup(reason = "cron") {
  const world = readLiveBoard();
  const turn = world?.meta?.turn ?? 0;
  const dir = backupTurnSnapshot(turn, reason);
  const copyIf = (src, name) => {
    try {
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(dir, name));
      }
    } catch {
      /* ignore */
    }
  };
  copyIf(path.join(DATA_DIR, "engagements.json"), "engagements.json");
  copyIf(
    path.join(DATA_DIR, "rp", "golden_pax", "index.json"),
    "rp-index.json",
  );
  const keep = Number(process.env.GMAP_BACKUP_KEEP || DEFAULT_KEEP);
  const pruned = pruneBackups(keep);
  setTableMeta({
    lastBackupAt: new Date().toISOString(),
    lastBackupReason: reason,
    lastBackupDir: path.basename(dir),
  });
  return { ok: true, dir, turn, pruned };
}

function sameMoscowDay(isoA, isoB) {
  if (!isoA || !isoB) return false;
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date(isoA)) === fmt.format(new Date(isoB));
}

/** Minutes since lastTickAt; null if never. */
export function minutesSinceLastTick(meta = getTableMeta()) {
  if (!meta.lastTickAt) return null;
  return Math.floor(
    (Date.now() - new Date(meta.lastTickAt).getTime()) / 60_000,
  );
}

/**
 * Health snapshot for master UI / monitoring.
 */
export function getTurnHealth(opts = {}) {
  const meta = getTableMeta();
  const now = new Date();
  const nowIso = now.toISOString();
  const cron = opts.cron || "1 0 * * *";
  const tz = opts.timezone || "Europe/Moscow";
  const mins = minutesSinceLastTick(meta);
  const missedDaily =
    !!meta.lastTickAt && !sameMoscowDay(meta.lastTickAt, nowIso);
  const alerts = Array.isArray(meta.tickAlerts) ? meta.tickAlerts : [];
  const allBackups = listBackupDirs();
  const backups = allBackups.slice(0, 5);

  let lastBackupAt = meta.lastBackupAt ?? null;
  let lastBackupReason = meta.lastBackupReason ?? null;
  if (!lastBackupAt && allBackups.length > 0) {
    lastBackupAt = new Date(allBackups[0].mtime).toISOString();
    const reasonMatch = allBackups[0].name.match(/_([^_]+)$/);
    if (reasonMatch) lastBackupReason = reasonMatch[1];
  }

  return {
    ok: true,
    now: nowIso,
    timezone: tz,
    cron,
    turn: readLiveBoard()?.meta?.turn ?? null,
    lastTickAt: meta.lastTickAt ?? null,
    minutesSinceLastTick: mins,
    tickFrozen: !!meta.tickFrozen,
    missedDailyTick: missedDaily,
    catchUpPending: missedDaily && !meta.tickFrozen,
    lastBackupAt,
    lastBackupReason,
    lastBackupDir: meta.lastBackupDir ?? null,
    backupCount: listBackupDirs().length,
    recentBackups: backups.map((b) => b.name),
    alerts,
    tableRevision: meta.tableRevision ?? 0,
  };
}

export function pushTickAlert(message, kind = "miss") {
  const meta = getTableMeta();
  const alerts = Array.isArray(meta.tickAlerts) ? [...meta.tickAlerts] : [];
  alerts.push({
    id: `al_${Date.now()}`,
    at: new Date().toISOString(),
    kind,
    message,
  });
  // keep last 20
  while (alerts.length > 20) alerts.shift();
  setTableMeta({ tickAlerts: alerts });
  return alerts;
}

export function clearTickAlerts() {
  setTableMeta({ tickAlerts: [] });
  return { ok: true };
}

let backupTimer = null;

/**
 * Periodic backup (default every 6h). Independent of daily tick.
 */
export function startBackupScheduler(opts = {}) {
  if (backupTimer) return;
  const hours = Number(
    opts.intervalHours ?? process.env.GMAP_BACKUP_HOURS ?? 6,
  );
  const ms = Math.max(1, hours) * 3600_000;
  const tick = () => {
    try {
      const r = runOpsBackup("cron");
      console.log(
        `[backup] cron ok turn=${r.turn} pruned=${r.pruned.removed} → ${path.basename(r.dir)}`,
      );
    } catch (e) {
      console.warn("[backup] cron failed", e);
      pushTickAlert(String(e?.message || e), "backup_fail");
    }
  };
  // first backup ~2 min after boot (not immediate storm)
  setTimeout(tick, 120_000);
  backupTimer = setInterval(tick, ms);
  if (typeof backupTimer.unref === "function") backupTimer.unref();
  console.log(`[backup] scheduler every ${hours}h`);
}
