/**
 * Intel-gated view transforms: player-facing payload + entity/faction masking.
 * Extracted from ../intel.mjs.
 */
import { ensureFactionIntel, clampLevel } from "./store.mjs";

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

function opinionTowardViewerOf(faction, viewerFactionId) {
  const n = Number(faction?.diplomacy?.opinions?.[viewerFactionId]);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Mask foreign faction row for payload.
 */
export function maskFactionForIntel(faction, level, viewerFactionId) {
  if (!faction) return null;
  if (faction.id === viewerFactionId) {
    const { gmNotes: _g, password: _p, passwordHash: _h, ...rest } = faction;
    return rest;
  }
  const lv = clampLevel(level);
  if (lv <= 0) return null;

  const towardViewer = opinionTowardViewerOf(faction, viewerFactionId);

  if (lv >= 4) {
    const {
      gmNotes: _g,
      password: _p,
      passwordHash: _h,
      notes: _n,
      npcs: _npc,
      ...rest
    } = faction;
    return rest;
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
      opinionTowardViewer: towardViewer,
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
      opinionTowardViewer: towardViewer,
      level: 2,
    };
  }

  return {
    id: faction.id,
    name: faction.name,
    color: faction.color,
    capitalSystemId: faction.capitalSystemId,
    opinionTowardViewer: towardViewer,
    level: 1,
  };
}
