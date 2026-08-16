/**
 * Resource sockets on researched techs. Port of
 * Golden_PAX_v0_5/server/domain/tech/techSocket.mjs (Tech Tree 2.0 P1).
 *
 * Fill/swap is instant, one-time spend, permanent until replaced.
 * State is per-tech on the faction eco (empire-wide), not per-building.
 * First-pass fill cost is `currency.metal: 10` when the option omits `fillCost`.
 */

export const DEFAULT_SOCKET_FILL_COST = { "currency.metal": 10 };

function resolveDef(content, techId) {
  if (!techId) return null;
  return content?.technologies?.[techId] || content?.tech_combos?.[techId] || null;
}

export function socketOptions(def) {
  const socket = def?.socket;
  if (!socket || typeof socket !== "object" || Array.isArray(socket)) return null;
  return socket;
}

export function fillCostForOption(option) {
  if (option?.fillCost && typeof option.fillCost === "object") return option.fillCost;
  return DEFAULT_SOCKET_FILL_COST;
}

/**
 * Currently slotted structural effects. Callers (flowEngine.addUpkeepDemand)
 * consume this list — they should not re-read tech defs.
 */
export function activeSocketEffects(eco, content) {
  const out = [];
  const unlocked = new Set(eco?.unlockedTechs || []);
  for (const [techId, resourceId] of Object.entries(eco?.techSockets || {})) {
    if (!unlocked.has(techId) || !resourceId) continue;
    const def = resolveDef(content, techId);
    const option = socketOptions(def)?.[resourceId];
    if (!option) continue;
    out.push({ techId, resourceId, ...option });
  }
  return out;
}

/**
 * Redirect a building upkeep slot's category via active socket effects.
 * Last matching swap wins. Match is by building kind and/or category.
 */
export function resolveUpkeepCategory(slotCat, def, socketEffects) {
  let cat = slotCat;
  for (const fx of socketEffects || []) {
    const swap = fx.swapUpkeepCurrency;
    if (!swap) continue;
    const matchKind = swap.match?.kind ?? swap.buildingKind;
    const matchCat = swap.match?.category ?? swap.buildingCategory;
    if (matchKind && def?.kind !== matchKind) continue;
    if (matchCat && def?.category !== matchCat) continue;
    const from = swap.fromCategory || swap.from;
    const to = swap.toCategory || swap.to;
    if (from && cat !== from) continue;
    if (to) cat = to;
  }
  return cat;
}

function canAffordStocks(stocks, cost) {
  for (const [cur, amt] of Object.entries(cost || {})) {
    const n = Number(amt || 0);
    if (n < 0) return { ok: false, error: "Отрицательная стоимость недопустима" };
    if ((stocks?.[cur] ?? 0) < n) {
      return { ok: false, error: `Не хватает ${cur} (нужно ${n})` };
    }
  }
  return { ok: true };
}

function spendStocks(stocks, cost) {
  const next = { ...stocks };
  for (const [cur, amt] of Object.entries(cost || {})) {
    const n = Number(amt || 0);
    if (!n) continue;
    next[cur] = Math.max(0, Number(next[cur] || 0) - n);
  }
  return next;
}

/**
 * Validate + cost for a fill/swap. Does not spend. Overwrite is allowed.
 */
export function prepareSocketFill(eco, techId, resourceId, content) {
  const def = resolveDef(content, techId);
  if (!def) return { ok: false, error: "unknown tech" };
  if (!(eco?.unlockedTechs || []).includes(techId)) {
    return { ok: false, error: "tech not researched" };
  }
  const options = socketOptions(def);
  if (!options) return { ok: false, error: "tech has no socket" };
  const option = options[resourceId];
  if (!option) return { ok: false, error: "resource is not a valid socket option" };

  return {
    ok: true,
    cost: fillCostForOption(option),
    techSockets: { ...(eco.techSockets || {}), [techId]: resourceId },
    resourceId,
  };
}

/**
 * Fill or replace a tech's resource socket. Overwrite pays again.
 * @returns {{ ok: true, eco, stocks } | { ok: false, error: string }}
 */
export function fillTechSocket(eco, techId, resourceId, stocks, content) {
  const prepared = prepareSocketFill(eco, techId, resourceId, content);
  if (!prepared.ok) return prepared;
  const afford = canAffordStocks(stocks, prepared.cost);
  if (!afford.ok) return afford;
  return {
    ok: true,
    eco: { ...eco, techSockets: prepared.techSockets },
    stocks: spendStocks(stocks, prepared.cost),
    cost: prepared.cost,
    resourceId: prepared.resourceId,
  };
}
