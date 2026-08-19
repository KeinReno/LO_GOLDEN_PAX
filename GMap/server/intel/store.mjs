/**
 * Intel store I/O + per-faction knowledge-level bookkeeping.
 * Extracted from ../intel.mjs.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readJson, writeJson } from "../tableStore.mjs";
import { rememberedContacts } from "../factionIntel.mjs";
import { getContent } from "../contentLoader.mjs";

const DATA_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../data",
);
export const INTEL_PATH = path.join(DATA_DIR, "faction-intel.json");

/** @typedef {0|1|2|3|4} KnowledgeLevel */
/** @typedef {'race'|'faction'|'tech'|'building'|'unit'} EntityType */

const ENTITY_KEYS = {
  faction: "knownFactions",
  race: "knownRaces",
  tech: "knownTechs",
  building: "knownBuildings",
  unit: "knownUnits",
};

const DEFAULT_RULES = {
  intelPerBlockadeTurn: 1,
  thresholdLevel1: 1,
  thresholdLevel2: 3,
  thresholdLevel3: 6,
  thresholdLevel4: 10,
  scoutWorldIntel: 2,
  espionageIntel: 3,
  espionageDetectionChance: 0.3,
  espionageCognitioCost: 10,
  espionageCooldownTurns: 3,
  tradeIntel: 2,
  allianceIntel: 3,
};

function emptyFactionIntel(factionId) {
  return {
    factionId,
    knownFactions: {},
    knownRaces: {},
    knownTechs: {},
    knownBuildings: {},
    knownUnits: {},
    /** Accumulated intel progress per system (blockade / scout). */
    systemProgress: {},
    /** lastEspionageTurn[targetFactionId] = turn */
    espionageCooldown: {},
    intelHistory: [],
  };
}

function emptyStore() {
  return { factions: {} };
}

export function getIntelRules() {
  const rules = getContent()?.rules?.intel ?? {};
  return { ...DEFAULT_RULES, ...rules };
}

/**
 * Clamp to KnowledgeLevel 0–4.
 * @param {unknown} n
 * @returns {KnowledgeLevel}
 */
export function clampLevel(n) {
  const v = Math.floor(Number(n) || 0);
  if (v <= 0) return 0;
  if (v >= 4) return 4;
  return /** @type {KnowledgeLevel} */ (v);
}

/**
 * Progress points → knowledge level via thresholds.
 * @param {number} progress
 * @param {ReturnType<typeof getIntelRules>} [rules]
 * @returns {KnowledgeLevel}
 */
export function levelFromProgress(progress, rules) {
  const r = rules ?? getIntelRules();
  const p = Number(progress) || 0;
  if (p >= r.thresholdLevel4) return 4;
  if (p >= r.thresholdLevel3) return 3;
  if (p >= r.thresholdLevel2) return 2;
  if (p >= r.thresholdLevel1) return 1;
  return 0;
}

export function readIntelStore() {
  const raw = readJson(INTEL_PATH, null);
  if (!raw || typeof raw !== "object" || typeof raw.factions !== "object") {
    return emptyStore();
  }
  return { factions: { ...raw.factions } };
}

export function writeIntelStore(store) {
  writeJson(INTEL_PATH, { factions: store?.factions ?? {} });
}

/**
 * Ensure faction bucket exists; migrate contacts → knownFactions level 1 once.
 * @param {string} factionId
 * @param {ReturnType<typeof readIntelStore>} [store]
 */
export function ensureFactionIntel(factionId, store) {
  const s = store ?? readIntelStore();
  if (!factionId) return emptyFactionIntel("");
  let row = s.factions[factionId];
  let dirty = false;
  if (!row || typeof row !== "object") {
    row = emptyFactionIntel(factionId);
    // Seed from boolean contacts
    const contacts = rememberedContacts(factionId);
    for (const id of contacts) {
      if (id && id !== factionId) {
        row.knownFactions[id] = 1;
      }
    }
    row.knownFactions[factionId] = 4;
    s.factions[factionId] = row;
    dirty = true;
  } else {
    row.factionId = factionId;
    row.knownFactions = row.knownFactions ?? {};
    row.knownRaces = row.knownRaces ?? {};
    row.knownTechs = row.knownTechs ?? {};
    row.knownBuildings = row.knownBuildings ?? {};
    row.knownUnits = row.knownUnits ?? {};
    row.systemProgress = row.systemProgress ?? {};
    row.espionageCooldown = row.espionageCooldown ?? {};
    row.intelHistory = Array.isArray(row.intelHistory) ? row.intelHistory : [];
    if ((row.knownFactions[factionId] ?? 0) < 4) {
      row.knownFactions[factionId] = 4;
      dirty = true;
    }
    // Merge any new contacts at least level 1
    const contacts = rememberedContacts(factionId);
    for (const id of contacts) {
      if (!id || id === factionId) continue;
      const cur = clampLevel(row.knownFactions[id]);
      if (cur < 1) {
        row.knownFactions[id] = 1;
        dirty = true;
      }
    }
    s.factions[factionId] = row;
  }
  if (dirty && !store) writeIntelStore(s);
  return row;
}

/**
 * @param {string} factionId
 * @param {EntityType} entityType
 * @param {string} entityId
 * @returns {KnowledgeLevel}
 */
export function getLevel(factionId, entityType, entityId) {
  if (!factionId || !entityId) return 0;
  if (entityType === "faction" && entityId === factionId) return 4;
  const row = ensureFactionIntel(factionId);
  const key = ENTITY_KEYS[entityType];
  if (!key) return 0;
  return clampLevel(row[key]?.[entityId]);
}

/**
 * Raise knowledge to at least `level` (monotonic). Returns whether changed.
 * @param {string} factionId
 * @param {EntityType} entityType
 * @param {string} entityId
 * @param {KnowledgeLevel|number} level
 * @param {{ source?: string, turn?: number, store?: ReturnType<typeof readIntelStore>, persist?: boolean }} [opts]
 */
export function setKnowledgeLevel(
  factionId,
  entityType,
  entityId,
  level,
  opts = {},
) {
  if (!factionId || !entityId) return false;
  const target = clampLevel(level);
  if (target <= 0) return false;
  const key = ENTITY_KEYS[entityType];
  if (!key) return false;

  const store = opts.store ?? readIntelStore();
  const row = ensureFactionIntel(factionId, store);
  const oldLevel = clampLevel(row[key][entityId]);
  if (oldLevel >= target) return false;

  row[key][entityId] = target;
  const turn = opts.turn ?? 0;
  row.intelHistory.push({
    entityId,
    entityType,
    oldLevel,
    newLevel: target,
    source: opts.source ?? "gm",
    turn,
  });
  // Cap history length
  if (row.intelHistory.length > 200) {
    row.intelHistory = row.intelHistory.slice(-200);
  }
  store.factions[factionId] = row;
  if (opts.persist !== false && !opts.store) writeIntelStore(store);
  return true;
}

export function canEspionage(factionId, targetFactionId, turn) {
  const rules = getIntelRules();
  const row = ensureFactionIntel(factionId);
  const last = Number(row.espionageCooldown?.[targetFactionId] ?? -999);
  return turn - last >= rules.espionageCooldownTurns;
}

export function markEspionageUsed(factionId, targetFactionId, turn) {
  const store = readIntelStore();
  const row = ensureFactionIntel(factionId, store);
  row.espionageCooldown[targetFactionId] = turn;
  store.factions[factionId] = row;
  writeIntelStore(store);
}
