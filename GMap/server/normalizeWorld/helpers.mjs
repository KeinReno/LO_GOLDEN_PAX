/**
 * Shared normalization helpers: id-alias/diplomacy-stance catalogs,
 * composition-group normalization, order migration.
 * Extracted from ../normalizeWorld.mjs.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HOURS_PER_TURN = 24;

function gameHourAtTurn(turn) {
  return Math.max(0, Math.floor(Number(turn) || 0)) * HOURS_PER_TURN;
}

/** Local copy of orderEngine.normalizePlayerOrder — avoid circular import. */
export function normalizePlayerOrder(raw, currentTurn = 0) {
  if (!raw || typeof raw !== "object") return raw;
  const category = raw.category ?? "eta";
  let status = raw.status ?? "pending";
  if (category === "eta" && raw.resolvesAt == null) {
    if (status === "pending" || status === "applied" || status === "accepted") {
      status = "resolved";
    }
  }
  if (status === "applied") status = "resolved";
  const { apCost, forceApCost } =
    raw.apCost != null
      ? { apCost: raw.apCost, forceApCost: raw.forceApCost ?? 0 }
      : { apCost: 0, forceApCost: 0 };
  return {
    ...raw,
    category,
    status,
    resolvesAt: raw.resolvesAt ?? null,
    startedAt: raw.startedAt ?? gameHourAtTurn(raw.turn ?? currentTurn),
    baseDuration: raw.baseDuration ?? null,
    modifiers: Array.isArray(raw.modifiers) ? raw.modifiers : [],
    progress: raw.progress ?? undefined,
    ratePerTurn: raw.ratePerTurn ?? undefined,
    apCost,
    forceApCost,
  };
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ALIASES_PATH = path.resolve(
  __dirname,
  "../../content/core/id-aliases.json",
);
const STANCES_PATH = path.resolve(
  __dirname,
  "../../content/core/diplomacy_stances.json",
);

let aliasesCache = null;
let stancesCache = null;

export function loadAliases() {
  if (aliasesCache) return aliasesCache;
  try {
    aliasesCache = JSON.parse(fs.readFileSync(ALIASES_PATH, "utf8"));
  } catch {
    aliasesCache = { ships: {}, resources: {}, units: {} };
  }
  return aliasesCache;
}

export function loadDiplomacyStances() {
  if (stancesCache) return stancesCache;
  try {
    stancesCache = JSON.parse(fs.readFileSync(STANCES_PATH, "utf8"));
  } catch {
    stancesCache = {};
  }
  return stancesCache;
}

export function resolveAlias(kind, id) {
  if (!id || typeof id !== "string") return id;
  const a = loadAliases();
  const map = a[kind] || {};
  return map[id] ?? map[id.toLowerCase?.()] ?? id;
}

export function normalizeCompGroup(g, kind) {
  const defId =
    kind === "ships"
      ? resolveAlias("ships", g.defId || g.type)
      : resolveAlias("units", g.defId || g.type);
  return {
    ...g,
    ...(kind === "ships"
      ? {
          type: resolveAlias("ships", g.type ?? g.defId),
          defId,
        }
      : { defId }),
    count: g.count ?? 1,
    xp: typeof g.xp === "number" ? g.xp : 0,
    level: typeof g.level === "number" ? g.level : 0,
  };
}
