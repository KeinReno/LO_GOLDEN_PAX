/**
 * Council seats + portfolios. No dependency on ../courtGovernance's other
 * submodules — the shared base other submodules import from.
 * Extracted from ../courtGovernance.mjs.
 */
import { getContent } from "../contentLoader.mjs";

/** Shared here (not in passiveEffects.mjs/blocs.mjs) so both can import it
 * without creating a circular dependency between those two. */
export function npcAvailable(npc) {
  return npc && npc.status !== "dead" && npc.status !== "hidden";
}

/** Default unlocked seats from content catalog. */
export function defaultUnlockedSeatIds(content = getContent()) {
  const seats = content?.council_seats?.seats || {};
  return Object.values(seats)
    .filter((s) => s?.defaultUnlocked !== false)
    .map((s) => s.id);
}

/** Ensure faction.council exists with unlocked seats. */
export function ensureFactionCouncil(fac, content = getContent()) {
  if (!fac.council || typeof fac.council !== "object") {
    fac.council = {
      unlockedSeatIds: defaultUnlockedSeatIds(content),
      lockedSeatIds: [],
      seatPortfolios: {},
    };
  }
  if (!Array.isArray(fac.council.unlockedSeatIds)) {
    fac.council.unlockedSeatIds = defaultUnlockedSeatIds(content);
  }
  if (!Array.isArray(fac.council.lockedSeatIds)) {
    fac.council.lockedSeatIds = [];
  }
  if (
    !fac.council.seatPortfolios ||
    typeof fac.council.seatPortfolios !== "object"
  ) {
    fac.council.seatPortfolios = {};
  }
  return fac.council;
}

/** Assigned portfolio or catalog default for a seat. */
export function resolveSeatPortfolioId(fac, seatId, content = getContent()) {
  const assigned = fac?.council?.seatPortfolios?.[seatId];
  if (typeof assigned === "string" && assigned) return assigned;
  const def = content?.council_seats?.seats?.[seatId];
  return def?.defaultPortfolio || null;
}

export function getPortfolioDef(portfolioId, content = getContent()) {
  if (!portfolioId) return null;
  return content?.council_seats?.portfolios?.[portfolioId] || null;
}

/** Effects + display label for an occupied seat (portfolio preferred). */
export function resolveOccupiedSeatBonus(fac, seatId, content = getContent()) {
  const seatDef = content?.council_seats?.seats?.[seatId] || null;
  const portfolioId = resolveSeatPortfolioId(fac, seatId, content);
  const portfolioDef = getPortfolioDef(portfolioId, content);
  const effects =
    portfolioDef?.factionEffects?.length > 0
      ? portfolioDef.factionEffects
      : seatDef?.factionEffects || [];
  const label =
    portfolioDef?.label ||
    seatDef?.label ||
    seatId;
  return { seatDef, portfolioId, portfolioDef, effects, label };
}

export function isSeatUnlocked(fac, seatId, content = getContent()) {
  const council = ensureFactionCouncil(fac, content);
  if (council.lockedSeatIds.includes(seatId)) return false;
  if (council.unlockedSeatIds.includes(seatId)) return true;
  const def = content?.council_seats?.seats?.[seatId];
  return def?.defaultUnlocked !== false;
}

export function unlockCouncilSeat(fac, seatId, content = getContent()) {
  const council = ensureFactionCouncil(fac, content);
  council.lockedSeatIds = council.lockedSeatIds.filter((id) => id !== seatId);
  if (!council.unlockedSeatIds.includes(seatId)) {
    council.unlockedSeatIds.push(seatId);
  }
  return council;
}

export function lockCouncilSeat(fac, seatId, content = getContent()) {
  const council = ensureFactionCouncil(fac, content);
  council.unlockedSeatIds = council.unlockedSeatIds.filter(
    (id) => id !== seatId,
  );
  if (!council.lockedSeatIds.includes(seatId)) {
    council.lockedSeatIds.push(seatId);
  }
  // Vacate seat
  for (const npc of fac.npcs ?? []) {
    if (npc.councilSeat === seatId) npc.councilSeat = null;
  }
  return council;
}
