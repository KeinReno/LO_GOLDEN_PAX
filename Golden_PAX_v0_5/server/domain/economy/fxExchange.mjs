/**
 * v0.5 FX exchange via Exchange Credit (EC).
 * Ported from `GMap/server/fxExchange.mjs` (instantPegCredit + EMA refresh +
 * bilateral fx rates). GMap's version reads/writes `data/fx-exchange.json`
 * via tableStore — this port takes previous state in and returns next state
 * out (CLAUDE.md rule 3: domain never touches disk/DB). Persistence is
 * `server/campaign/fxExchangeStore.mjs`.
 *
 * `instantPegCredit` is exported+pure in GMap and is byte-parity tested.
 * `computeFxExchangeState` is the file-I/O-stripped body of GMap's
 * `refreshFxExchange` — same EMA / pair-rate math, behavior-tested against
 * that source (can't cross-import `refreshFxExchange` without hitting GMap's
 * data dir).
 *
 * Additive vs GMap: `extraPegIds` lets a campaign-set treasury peg that
 * isn't yet in `faction_currencies.json` still get an EC (needed so a
 * playtest faction can peg `map.titan` without inventing a new fx.* id).
 * Pair rates still iterate only content `faction_currencies` with a peg,
 * matching GMap.
 */

export function fxExchangeCfg(content) {
  const fx = content?.economy_schema?.fx_exchange || {};
  const credit = fx.credit || {};
  return {
    alpha: Math.min(1, Math.max(0.05, Number(fx.alpha) || 0.25)),
    reserveWeight: Number(credit.reserveWeight) || 1,
    extractionWeight: Number(credit.extractionWeight) || 2,
    floor: Math.max(0.01, Number(credit.floor) || 0.25),
  };
}

/** Instant EC for one peg commodity. Byte-parity with GMap's instantPegCredit. */
export function instantPegCredit(reserves, extraction, cfg) {
  const r = Math.max(0, Number(reserves) || 0);
  const e = Math.max(0, Number(extraction) || 0);
  const raw = cfg.reserveWeight * Math.log1p(r) + cfg.extractionWeight * Math.log1p(e);
  return Math.max(cfg.floor, raw);
}

export function peggedFxCurrencies(content) {
  const out = [];
  const map = content?.faction_currencies || {};
  for (const def of Object.values(map)) {
    if (!def?.id || !def.peg) continue;
    out.push({ id: def.id, peg: String(def.peg), name: def.name || def.id });
  }
  return out;
}

export function globalPegReserves(ledger, pegId) {
  let sum = 0;
  for (const fac of Object.values(ledger?.factions || {})) {
    sum += Number(fac?.stocks?.[pegId] ?? 0);
  }
  return sum;
}

export function emptyFxExchangeState() {
  return { credits: {}, rates: [], updatedAt: null, turn: null, variant: null };
}

/**
 * Refresh EMA credits + bilateral fx rates. Pure stand-in for GMap's
 * `refreshFxExchange` (that function also wrote JSON + bumped a revision).
 *
 * @param {object} content
 * @param {{ factions?: Record<string, { stocks?: Record<string, number> }> }} ledger
 * @param {Record<string, number>} extractionByPeg  `{ [pegResourceId]: number }` this-turn totals
 * @param {{ credits?: Record<string, number> }} [prevState]
 * @param {number|null} [turn]
 * @param {string[]} [extraPegIds]  campaign pegs not in faction_currencies
 */
export function computeFxExchangeState(content, ledger, extractionByPeg = {}, prevState = {}, turn = null, extraPegIds = []) {
  const cfg = fxExchangeCfg(content);
  const prevCredits = prevState?.credits && typeof prevState.credits === "object" ? prevState.credits : {};
  const pegged = peggedFxCurrencies(content);
  const pegIds = [...new Set([...pegged.map((p) => p.peg), ...extraPegIds.filter(Boolean)])];
  const credits = { ...prevCredits };

  for (const pegId of pegIds) {
    const reserves = globalPegReserves(ledger, pegId);
    const extraction = Number(extractionByPeg[pegId] || 0);
    const instant = instantPegCredit(reserves, extraction, cfg);
    const old = Number(credits[pegId]);
    const next = Number.isFinite(old) && old > 0 ? cfg.alpha * instant + (1 - cfg.alpha) * old : instant;
    credits[pegId] = Math.max(cfg.floor, next);
  }

  const rates = [];
  for (let i = 0; i < pegged.length; i++) {
    for (let j = 0; j < pegged.length; j++) {
      if (i === j) continue;
      const a = pegged[i];
      const b = pegged[j];
      if (a.peg === b.peg) continue;
      const ca = credits[a.peg] || cfg.floor;
      const cb = credits[b.peg] || cfg.floor;
      const mid = ca / cb;
      const buy = Math.max(0.01, mid);
      const sell = Math.max(0.01, mid * 0.92);
      rates.push({
        pair: `${a.id} → ${b.id}`,
        buy: Number(buy.toFixed(4)),
        sell: Number(sell.toFixed(4)),
        note: `EC ${a.peg}↔${b.peg} (EMA α=${cfg.alpha})`,
      });
    }
  }

  return {
    credits,
    rates,
    updatedAt: new Date().toISOString(),
    turn,
    variant: "ema_inertia",
  };
}
