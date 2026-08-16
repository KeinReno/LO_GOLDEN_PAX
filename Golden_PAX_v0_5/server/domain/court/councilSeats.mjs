/**
 * Council seats & portfolios. Verbatim ports of GMap/server/courtGovernance.mjs
 * seat helpers (`defaultUnlockedSeatIds`, `ensureFactionCouncil`,
 * `resolveSeatPortfolioId`, `getPortfolioDef`, `resolveOccupiedSeatBonus`,
 * `isSeatUnlocked`, `unlockCouncilSeat`, `lockCouncilSeat`) and of
 * GMap/server/narrative.mjs `applySeatNpcCouncil` / `applyUnseatNpcCouncil`
 * / `applySetCouncilPortfolio` (player seat/unseat; portfolio assign).
 *
 * Reshaped to plain data in / plain data out — callers assign the returned
 * council / npcs rather than mutating a world object. Unlock/lock remain
 * manual GM actions; no automatic unlock-trigger system (same as GMap).
 */
import { npcAvailable } from "./npcRoster.mjs";

export function defaultUnlockedSeatIds(content) {
  const seats = content?.council_seats?.seats || {};
  return Object.values(seats)
    .filter((s) => s?.defaultUnlocked !== false)
    .map((s) => s.id);
}

export function ensureFactionCouncil(fac, content) {
  const src = fac?.council && typeof fac.council === "object" ? fac.council : null;
  const council = {
    unlockedSeatIds: Array.isArray(src?.unlockedSeatIds)
      ? [...src.unlockedSeatIds]
      : defaultUnlockedSeatIds(content),
    lockedSeatIds: Array.isArray(src?.lockedSeatIds) ? [...src.lockedSeatIds] : [],
    seatPortfolios:
      src?.seatPortfolios && typeof src.seatPortfolios === "object" ? { ...src.seatPortfolios } : {},
  };
  return council;
}

export function resolveSeatPortfolioId(fac, seatId, content) {
  const assigned = fac?.council?.seatPortfolios?.[seatId];
  if (typeof assigned === "string" && assigned) return assigned;
  const def = content?.council_seats?.seats?.[seatId];
  return def?.defaultPortfolio || null;
}

export function getPortfolioDef(portfolioId, content) {
  if (!portfolioId) return null;
  return content?.council_seats?.portfolios?.[portfolioId] || null;
}

export function resolveOccupiedSeatBonus(fac, seatId, content) {
  const seatDef = content?.council_seats?.seats?.[seatId] || null;
  const portfolioId = resolveSeatPortfolioId(fac, seatId, content);
  const portfolioDef = getPortfolioDef(portfolioId, content);
  const effects =
    portfolioDef?.factionEffects?.length > 0
      ? portfolioDef.factionEffects
      : seatDef?.factionEffects || [];
  const label = portfolioDef?.label || seatDef?.label || seatId;
  return { seatDef, portfolioId, portfolioDef, effects, label };
}

export function isSeatUnlocked(fac, seatId, content) {
  const council = ensureFactionCouncil(fac, content);
  if (council.lockedSeatIds.includes(seatId)) return false;
  if (council.unlockedSeatIds.includes(seatId)) return true;
  const def = content?.council_seats?.seats?.[seatId];
  return def?.defaultUnlocked !== false;
}

export function unlockCouncilSeat(fac, seatId, content) {
  const council = ensureFactionCouncil(fac, content);
  council.lockedSeatIds = council.lockedSeatIds.filter((id) => id !== seatId);
  if (!council.unlockedSeatIds.includes(seatId)) council.unlockedSeatIds.push(seatId);
  return council;
}

export function lockCouncilSeat(fac, seatId, content) {
  const council = ensureFactionCouncil(fac, content);
  council.unlockedSeatIds = council.unlockedSeatIds.filter((id) => id !== seatId);
  if (!council.lockedSeatIds.includes(seatId)) council.lockedSeatIds.push(seatId);
  const npcs = (fac.npcs ?? []).map((n) =>
    n.councilSeat === seatId ? { ...n, councilSeat: null } : n,
  );
  return { council, npcs };
}

export function setSeatPortfolio(fac, seatId, portfolioId, content) {
  const seatDef = content?.council_seats?.seats?.[seatId];
  if (!seatId || !portfolioId) return { ok: false, error: "council_portfolio_params" };
  if (!seatDef) return { ok: false, error: "council_seat_unknown" };
  if (seatDef?.kind === "ruler" || seatId === "seat.ruler") {
    return { ok: false, error: "council_portfolio_ruler" };
  }
  if (!isSeatUnlocked(fac, seatId, content)) return { ok: false, error: "council_seat_locked" };
  if (!getPortfolioDef(portfolioId, content)) return { ok: false, error: "council_portfolio_unknown" };
  const council = ensureFactionCouncil(fac, content);
  council.seatPortfolios = { ...council.seatPortfolios, [seatId]: portfolioId };
  const preferred = getPortfolioDef(portfolioId, content)?.roles?.[0];
  const npcs = preferred
    ? (fac.npcs ?? []).map((n) =>
        n.councilSeat === seatId && n.role !== "ruler" ? { ...n, role: preferred } : n,
      )
    : fac.npcs ?? [];
  return { ok: true, council, npcs };
}

export function seatNpcCouncil(fac, npcId, seatId, content) {
  const seatDef = content?.council_seats?.seats?.[seatId];
  if (!npcId || !seatId || !seatDef) return { ok: false, error: "council_seat_params" };
  if (!isSeatUnlocked(fac, seatId, content)) return { ok: false, error: "council_seat_locked" };
  const npcs = (fac.npcs ?? []).map((n) => ({ ...n }));
  const npc = npcs.find((n) => n.id === npcId);
  if (!npc) return { ok: false, error: "npc_missing" };
  if (npc.status === "dead" || npc.status === "hidden") return { ok: false, error: "npc_unavailable" };
  if (seatDef?.kind === "ruler" || seatId === "seat.ruler") {
    return { ok: false, error: "council_seat_ruler_locked" };
  }
  if (npc.isPlayerRuler || fac.rulerNpcId === npc.id) return { ok: false, error: "npc_is_player_ruler" };

  const fromSeat = typeof npc.councilSeat === "string" && npc.councilSeat ? npc.councilSeat : null;
  let displacedNpcId = null;
  let swapped = false;
  for (const other of npcs) {
    if (other.id === npc.id) continue;
    if (other.councilSeat !== seatId) continue;
    if (other.isPlayerRuler || fac.rulerNpcId === other.id) {
      return { ok: false, error: "council_seat_ruler_locked" };
    }
    displacedNpcId = other.id;
    if (fromSeat && fromSeat !== seatId && fromSeat !== "seat.ruler") {
      other.councilSeat = fromSeat;
      swapped = true;
    } else {
      other.councilSeat = null;
    }
  }
  npc.councilSeat = seatId;
  return { ok: true, npcs, fromSeat, swapped, displacedNpcId };
}

export function unseatNpcCouncil(fac, npcId) {
  if (!npcId) return { ok: false, error: "council_seat_params" };
  const npcs = (fac.npcs ?? []).map((n) => ({ ...n }));
  const npc = npcs.find((n) => n.id === npcId);
  if (!npc) return { ok: false, error: "npc_missing" };
  if (!npc.councilSeat) return { ok: false, error: "npc_not_seated" };
  if (npc.isPlayerRuler || fac.rulerNpcId === npc.id || npc.councilSeat === "seat.ruler") {
    return { ok: false, error: "council_seat_ruler_locked" };
  }
  const fromSeat = npc.councilSeat;
  npc.councilSeat = null;
  return { ok: true, npcs, fromSeat };
}

export { npcAvailable };
