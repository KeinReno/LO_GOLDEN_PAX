/**
 * Racial / factional tech pool — three layers:
 * 1) base pool (tags ∩ availableRaces / general)
 * 2) acquiredTechs (trade / historical)
 * 3) market listings (NPC bazaar — content)
 */
import { getContent } from "./contentLoader.mjs";

/**
 * @param {object} faction
 * @returns {string[]}
 */
export function factionAvailableRaces(faction) {
  if (Array.isArray(faction?.availableRaces) && faction.availableRaces.length) {
    return faction.availableRaces.map(String);
  }
  if (Array.isArray(faction?.baseTechPool?.races)) {
    return faction.baseTechPool.races.map(String);
  }
  const primary =
    faction?.primaryRaceId ||
    faction?.primaryRace ||
    faction?.dominantRaceId ||
    null;
  return primary ? [String(primary)] : [];
}

/**
 * @param {object} eco
 * @returns {Array<{ techId: string, source?: string, transferable?: boolean }>}
 */
export function acquiredTechRecords(eco) {
  return Array.isArray(eco?.acquiredTechs) ? eco.acquiredTechs : [];
}

export function hasAcquiredTech(eco, techId) {
  return acquiredTechRecords(eco).some((a) => a.techId === techId);
}

function normalizeRaceId(id) {
  const s = String(id || "");
  return s.startsWith("race_") ? s : `race_${s}`;
}

/**
 * Base/acquired pool gate. raceLock / factionTraitLock stay in checkTechLocks.
 */
export function factionCanAccessTech(def, factionId, eco, _content, world) {
  if (!def) return { ok: false, error: "Нет технологии" };

  if (hasAcquiredTech(eco, def.id)) {
    return { ok: true, via: "acquired" };
  }
  if ((eco?.unlockedTechs || []).includes(def.id)) {
    return { ok: true, via: "unlocked" };
  }

  const tags = (def.tags || []).map(String);
  const isGeneral =
    tags.length === 0 ||
    tags.includes("general") ||
    tags.includes("baseline");
  if (isGeneral) return { ok: true, via: "base" };

  const faction = (world?.factions || []).find((f) => f.id === factionId);
  const races = new Set(factionAvailableRaces(faction).map(normalizeRaceId));

  // No pool configured → backward compatible open access
  if (races.size === 0) return { ok: true, via: "base" };

  const raceTags = tags
    .filter((t) => t.startsWith("race_"))
    .map(normalizeRaceId);
  if (raceTags.length === 0) return { ok: true, via: "base" };

  if (!raceTags.some((t) => races.has(t))) {
    return { ok: false, error: "Технология вне расового пула державы" };
  }
  return { ok: true, via: "base" };
}

export function transferTech(fromEco, toEco, techId, meta = {}) {
  if (!(fromEco.unlockedTechs || []).includes(techId)) {
    return { ok: false, error: "У отправителя нет этой технологии" };
  }
  const fromAcquired = acquiredTechRecords(fromEco).find(
    (a) => a.techId === techId,
  );
  if (
    fromAcquired &&
    (fromAcquired.transferable === false ||
      fromAcquired.source === "historical")
  ) {
    return { ok: false, error: "Наследственная технология не передаётся" };
  }
  if ((toEco.unlockedTechs || []).includes(techId)) {
    return { ok: false, error: "Получатель уже имеет технологию" };
  }
  if (!Array.isArray(toEco.unlockedTechs)) toEco.unlockedTechs = [];
  toEco.unlockedTechs.push(techId);
  if (!Array.isArray(toEco.acquiredTechs)) toEco.acquiredTechs = [];
  toEco.acquiredTechs.push({
    techId,
    source: meta.source || "trade",
    acquiredTurn: meta.turn ?? null,
    tradedWith: meta.fromFactionId || null,
    transferable: true,
    note: meta.note || null,
  });
  return { ok: true };
}

export function markTechsHistorical(eco, techIds, turn, note) {
  if (!Array.isArray(eco.acquiredTechs)) eco.acquiredTechs = [];
  for (const techId of techIds || []) {
    const existing = eco.acquiredTechs.find((a) => a.techId === techId);
    if (existing) {
      existing.source = "historical";
      existing.transferable = false;
      existing.note = note || existing.note;
    } else {
      eco.acquiredTechs.push({
        techId,
        source: "historical",
        acquiredTurn: turn ?? 0,
        transferable: false,
        note: note || null,
      });
    }
  }
}

export function listTechMarket(content) {
  const c = content || getContent();
  const markets = c.tech_market || {};
  const listings = [];
  for (const [marketId, market] of Object.entries(markets)) {
    for (const row of market.listings || []) {
      listings.push({ marketId, ...row });
    }
  }
  return listings;
}
