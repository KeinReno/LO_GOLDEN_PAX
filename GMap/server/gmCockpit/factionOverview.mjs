/**
 * GM reporting: faction power comparison + human-readable session brief
 * diffed from two data/turns snapshots.
 * Extracted from ../gmCockpit.mjs.
 */
import path from "node:path";
import { TURNS_DIR, readJson, readLiveBoard } from "../tableStore.mjs";
import { readLedger, ensureFactionEco, ensureAllFactions } from "../ledger.mjs";
import { countFactionForces, resolveForceApMax } from "../apBudget.mjs";
import { getContent } from "../contentLoader.mjs";
import { listBackupDirs } from "../opsHealth.mjs";

const TREASURY_SHIFT_MIN = 25;

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
