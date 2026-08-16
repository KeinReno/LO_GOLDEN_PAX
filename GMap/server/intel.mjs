/**
 * Intel Fog — knowledge levels 0–4 per entity type for each faction.
 * Monotonic only (never decreases). Own entities always level 4.
 * No decay, no disinformation.
 * Local DATA_DIR avoids TDZ on circular import through tableStore/normalizeWorld.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readJson, writeJson } from "./tableStore.mjs";
import { rememberedContacts } from "./factionIntel.mjs";
import { getContent } from "./contentLoader.mjs";

const DATA_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../data",
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

/**
 * Bootstrap own race / techs / buildings / units to level 4.
 * @param {object} world
 * @param {string} factionId
 * @param {{ turn?: number, store?: ReturnType<typeof readIntelStore>, persist?: boolean, unlockedTechs?: string[] }} [opts]
 */
export function bootstrapOwnKnowledge(world, factionId, opts = {}) {
  if (!world || !factionId) return;
  const store = opts.store ?? readIntelStore();
  const turn = opts.turn ?? world.meta?.turn ?? 0;
  const faction = (world.factions ?? []).find((f) => f.id === factionId);
  setKnowledgeLevel(factionId, "faction", factionId, 4, {
    source: "own",
    turn,
    store,
    persist: false,
  });

  const raceIds = new Set();
  if (Array.isArray(faction?.races)) {
    for (const r of faction.races) {
      const id = typeof r === "string" ? r : r?.id;
      if (id) raceIds.add(id);
    }
  }
  if (faction?.primaryRaceId) raceIds.add(faction.primaryRaceId);
  for (const id of raceIds) {
    setKnowledgeLevel(factionId, "race", id, 4, {
      source: "own",
      turn,
      store,
      persist: false,
    });
  }

  for (const tid of opts.unlockedTechs ?? []) {
    if (tid) {
      setKnowledgeLevel(factionId, "tech", tid, 4, {
        source: "own",
        turn,
        store,
        persist: false,
      });
    }
  }

  // Owned systems → buildings present (legacy + surface/orbital)
  for (const sys of world.systems ?? []) {
    if (sys.ownerFactionId !== factionId) continue;
    for (const p of sys.planets ?? []) {
      const lists = [
        ...(p.buildings ?? []),
        ...(p.surfaceBuildings ?? []),
        ...(p.orbitalBuildings ?? []),
      ];
      for (const b of lists) {
        const bid = typeof b === "string" ? b : b?.buildingId ?? b?.id;
        if (bid) {
          setKnowledgeLevel(factionId, "building", bid, 4, {
            source: "own",
            turn,
            store,
            persist: false,
          });
        }
      }
    }
  }

  const seedUnitId = (uid) => {
    if (!uid || typeof uid !== "string") return;
    // Skip display-name leftovers (non catalog ids)
    if (!uid.includes(".") && !uid.startsWith("ship") && !uid.startsWith("unit")) {
      return;
    }
    setKnowledgeLevel(factionId, "unit", uid, 4, {
      source: "own",
      turn,
      store,
      persist: false,
    });
  };
  for (const f of world.fleets ?? []) {
    if (f.factionId !== factionId) continue;
    seedUnitId(f.unitDefId ?? f.templateId ?? f.classId);
    for (const g of f.composition ?? []) {
      seedUnitId(g?.defId || g?.type);
    }
  }
  for (const l of world.legions ?? []) {
    if (l.factionId !== factionId) continue;
    seedUnitId(l.unitDefId ?? l.templateId ?? l.classId);
    for (const g of l.composition ?? []) {
      seedUnitId(g?.defId || g?.type);
    }
  }

  if (opts.persist !== false && !opts.store) writeIntelStore(store);
}

/**
 * Add progress points toward system intel; apply resulting levels to entities there.
 * @param {object} world
 * @param {string} factionId
 * @param {string} systemId
 * @param {number} amount
 * @param {{ source?: string, turn?: number }} [opts]
 */
export function bumpSystemIntel(world, factionId, systemId, amount, opts = {}) {
  if (!world || !factionId || !systemId || !(amount > 0)) return;
  const store = readIntelStore();
  const row = ensureFactionIntel(factionId, store);
  const prev = Number(row.systemProgress[systemId] ?? 0);
  const next = prev + amount;
  row.systemProgress[systemId] = next;
  store.factions[factionId] = row;
  writeIntelStore(store);

  const level = levelFromProgress(next);
  if (level < 1) return;

  const turn = opts.turn ?? world.meta?.turn ?? 0;
  const source = opts.source ?? "scout";
  applySystemDiscovery(world, factionId, systemId, level, { source, turn });
}

/**
 * Discover entities in a system at least to `level`.
 */
export function applySystemDiscovery(
  world,
  factionId,
  systemId,
  level,
  opts = {},
) {
  const sys = (world.systems ?? []).find((s) => s.id === systemId);
  if (!sys) return;
  const turn = opts.turn ?? world.meta?.turn ?? 0;
  const source = opts.source ?? "fleet";
  const store = opts.store ?? readIntelStore();
  const lv = clampLevel(level);

  if (sys.ownerFactionId && sys.ownerFactionId !== factionId) {
    setKnowledgeLevel(factionId, "faction", sys.ownerFactionId, lv, {
      source,
      turn,
      store,
      persist: false,
    });
  }

  for (const p of sys.planets ?? []) {
    // Population race composition if present
    for (const slice of p.raceComposition ?? p.raceMix ?? p.races ?? []) {
      const rid =
        typeof slice === "string" ? slice : slice?.raceId ?? slice?.id;
      if (rid) {
        setKnowledgeLevel(factionId, "race", rid, Math.min(lv, 2), {
          source,
          turn,
          store,
          persist: false,
        });
      }
    }
    const lists = [
      ...(p.buildings ?? []),
      ...(p.surfaceBuildings ?? []),
      ...(p.orbitalBuildings ?? []),
    ];
    for (const b of lists) {
      const bid = typeof b === "string" ? b : b?.buildingId ?? b?.id;
      if (bid) {
        setKnowledgeLevel(factionId, "building", bid, lv, {
          source,
          turn,
          store,
          persist: false,
        });
      }
    }
  }

  for (const f of world.fleets ?? []) {
    if (f.systemId !== systemId || f.factionId === factionId) continue;
    if (f.factionId) {
      setKnowledgeLevel(factionId, "faction", f.factionId, lv, {
        source,
        turn,
        store,
        persist: false,
      });
    }
    const uid = f.unitDefId ?? f.templateId ?? f.classId;
    if (uid) {
      setKnowledgeLevel(factionId, "unit", uid, lv, {
        source,
        turn,
        store,
        persist: false,
      });
    }
  }
  for (const l of world.legions ?? []) {
    if (l.systemId !== systemId || l.factionId === factionId) continue;
    if (l.factionId) {
      setKnowledgeLevel(factionId, "faction", l.factionId, lv, {
        source,
        turn,
        store,
        persist: false,
      });
    }
    const uid = l.unitDefId ?? l.templateId ?? l.classId;
    if (uid) {
      setKnowledgeLevel(factionId, "unit", uid, lv, {
        source,
        turn,
        store,
        persist: false,
      });
    }
  }

  if (opts.persist !== false) writeIntelStore(store);
}

/** Diplomacy relation → faction knowledge floor. */
const DIPLO_FACTION_LEVEL = {
  neutral: 1,
  truce: 1,
  nap: 1,
  war: 1,
  vassal: 2,
  trade: 2,
  alliance: 3,
  research_pact: 3,
  migration_treaty: 2,
};

/**
 * Raise intel from diplomacy relation between two factions (mutual).
 */
export function updateIntelFromDiplomacy(
  world,
  factionId,
  targetFactionId,
  relation,
  opts = {},
) {
  if (!factionId || !targetFactionId || factionId === targetFactionId) return;
  const level = DIPLO_FACTION_LEVEL[relation] ?? 0;
  if (level < 1) return;
  const turn = opts.turn ?? world?.meta?.turn ?? 0;
  const store = opts.store ?? readIntelStore();

  setKnowledgeLevel(factionId, "faction", targetFactionId, level, {
    source: `diplomacy:${relation}`,
    turn,
    store,
    persist: false,
  });

  // Research pact → tech category bump for partner's unlocked techs if available
  if (relation === "research_pact" || relation === "alliance") {
    const techLevel = relation === "research_pact" ? 4 : 3;
    const partnerEco = opts.partnerUnlockedTechs;
    if (Array.isArray(partnerEco)) {
      for (const tid of partnerEco) {
        setKnowledgeLevel(factionId, "tech", tid, techLevel, {
          source: `diplomacy:${relation}`,
          turn,
          store,
          persist: false,
        });
      }
    }
  }

  if (relation === "trade") {
    // Economy peek: discover partner race at 2 if known
    const partner = (world?.factions ?? []).find(
      (f) => f.id === targetFactionId,
    );
    const raceIds = new Set();
    if (partner?.primaryRaceId) raceIds.add(partner.primaryRaceId);
    for (const r of partner?.races ?? []) {
      const rid = typeof r === "string" ? r : r?.id;
      if (rid) raceIds.add(rid);
    }
    for (const rid of raceIds) {
      setKnowledgeLevel(factionId, "race", rid, 2, {
        source: "trade_agreement",
        turn,
        store,
        persist: false,
      });
    }
  }

  if (opts.persist !== false) writeIntelStore(store);
}

/**
 * Tick: fleets on blockade gather intel; sync contacts into intel.
 */
export function processIntelTick(world, getVisibleSystemIds) {
  if (!world) return;
  const rules = getIntelRules();
  const turn = world.meta?.turn ?? 0;
  const store = readIntelStore();

  for (const faction of world.factions ?? []) {
    if (!faction?.id) continue;
    ensureFactionIntel(faction.id, store);
    bootstrapOwnKnowledge(world, faction.id, {
      turn,
      store,
      persist: false,
    });

    const visible = new Set(
      getVisibleSystemIds
        ? getVisibleSystemIds(world, faction.id)
        : (world.systems ?? []).map((s) => s.id),
    );

    // Presence discover level 1
    for (const fleet of world.fleets ?? []) {
      if (fleet.factionId !== faction.id) continue;
      if (!visible.has(fleet.systemId)) continue;
      const sys = (world.systems ?? []).find((s) => s.id === fleet.systemId);
      if (!sys) continue;
      const foreign =
        (sys.ownerFactionId && sys.ownerFactionId !== faction.id) ||
        (world.fleets ?? []).some(
          (f) =>
            f.systemId === fleet.systemId && f.factionId !== faction.id,
        );
      if (foreign) {
        applySystemDiscovery(world, faction.id, fleet.systemId, 1, {
          source: "fleet",
          turn,
          store,
          persist: false,
        });
      }
      if (fleet.stance === "blockade") {
        const prev = Number(
          store.factions[faction.id]?.systemProgress?.[fleet.systemId] ?? 0,
        );
        const next = prev + rules.intelPerBlockadeTurn;
        store.factions[faction.id].systemProgress[fleet.systemId] = next;
        const level = levelFromProgress(next, rules);
        if (level >= 1) {
          applySystemDiscovery(world, faction.id, fleet.systemId, level, {
            source: "blockade",
            turn,
            store,
            persist: false,
          });
        }
      }
    }

    for (const legion of world.legions ?? []) {
      if (legion.factionId !== faction.id) continue;
      if (!visible.has(legion.systemId)) continue;
      applySystemDiscovery(world, faction.id, legion.systemId, 1, {
        source: "legion",
        turn,
        store,
        persist: false,
      });
    }
  }

  writeIntelStore(store);
}

/**
 * Public slice for ViewerPayload (no raw progress secrets beyond levels).
 */
export function publicIntelPayload(factionId) {
  const row = ensureFactionIntel(factionId);
  return {
    knownFactions: { ...row.knownFactions },
    knownRaces: { ...row.knownRaces },
    knownTechs: { ...row.knownTechs },
    knownBuildings: { ...row.knownBuildings },
    knownUnits: { ...row.knownUnits },
    intelHistory: (row.intelHistory ?? []).slice(-40),
  };
}

/**
 * Approximate numeric stats for level 2 masking (honest bands).
 */
export function approximateStat(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return n;
  if (v === 0) return 0;
  const mag = Math.abs(v);
  const step = mag < 10 ? 1 : mag < 50 ? 5 : mag < 200 ? 10 : 25;
  const lo = Math.floor(mag / step) * step;
  const hi = lo + step;
  const band = v < 0 ? `−${hi}…−${lo || step}` : `${lo}…${hi}`;
  return band;
}

/**
 * Mask a plain object of numeric stats.
 */
export function approximateStats(stats) {
  if (!stats || typeof stats !== "object") return stats;
  const out = {};
  for (const [k, v] of Object.entries(stats)) {
    out[k] = typeof v === "number" ? approximateStat(v) : v;
  }
  return out;
}

/**
 * Mask entity fields by knowledge level. Returns null if level 0.
 * @param {object} entity
 * @param {KnowledgeLevel} level
 * @param {{ kind?: string }} [ctx]
 */
export function maskEntityByLevel(entity, level, ctx = {}) {
  if (!entity) return null;
  const lv = clampLevel(level);
  if (lv <= 0) return null;

  if (lv >= 4) {
    const { gmNotes: _g, password: _p, ...rest } = entity;
    return rest;
  }

  if (lv === 3) {
    const {
      gmNotes: _g,
      password: _p,
      hiddenProperties: _h,
      hiddenTraits: _ht,
      secret: _s,
      notes: _n,
      ...rest
    } = entity;
    return rest;
  }

  if (lv === 2) {
    return {
      id: entity.id,
      name: entity.name,
      category: entity.category ?? entity.kind ?? ctx.kind,
      kind: entity.kind,
      color: entity.color,
      tier: entity.tier ?? entity.techTier,
      approximateTier: entity.tier ?? entity.techTier ?? entity.approximateTier,
      specialization: entity.specialization,
      stats: entity.stats ? approximateStats(entity.stats) : undefined,
      power: entity.power != null ? approximateStat(entity.power) : undefined,
      level: 2,
    };
  }

  // level 1
  return {
    id: entity.id,
    name: entity.name,
    category: entity.category ?? entity.kind ?? ctx.kind,
    kind: entity.kind,
    color: entity.color,
    level: 1,
  };
}

/**
 * Mask foreign faction row for payload.
 */
export function maskFactionForIntel(faction, level, viewerFactionId) {
  if (!faction) return null;
  if (faction.id === viewerFactionId) {
    const { gmNotes: _g, ...rest } = faction;
    return rest;
  }
  const lv = clampLevel(level);
  if (lv <= 0) return null;

  if (lv >= 4) {
    const { gmNotes: _g, password: _p, notes: _n, npcs: _npc, ...rest } =
      faction;
    return { ...rest, password: "••••" };
  }

  if (lv === 3) {
    return {
      id: faction.id,
      name: faction.name,
      color: faction.color,
      capitalSystemId: faction.capitalSystemId,
      primaryRaceId: faction.primaryRaceId,
      races: faction.races,
      techTier: faction.techTier,
      specialization: faction.specialization,
      password: "••••",
    };
  }

  if (lv === 2) {
    return {
      id: faction.id,
      name: faction.name,
      color: faction.color,
      capitalSystemId: faction.capitalSystemId,
      primaryRaceId: faction.primaryRaceId,
      races: faction.races,
      approximateTier: faction.techTier ?? "?",
      specialization: faction.specialization,
      password: "••••",
      level: 2,
    };
  }

  return {
    id: faction.id,
    name: faction.name,
    color: faction.color,
    capitalSystemId: faction.capitalSystemId,
    password: "••••",
    level: 1,
  };
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
