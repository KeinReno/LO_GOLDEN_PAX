/**
 * Soft-deficit state from critical category stocks. Ported from GMap/
 * server/economyTick.mjs's updateDeficit — same thresholds, reshaped from
 * "mutate eco.deficit in place" to a pure function returning the state,
 * matching this domain's plain-data-in/plain-data-out convention (see
 * README.md). Parity verified in deficit.parity.test.mjs.
 *
 * Critical empty: B Materia, D Energia, E Bios, supply. Legacy metal alone
 * must NOT mark empty — many empires run metal=0 while materia>0.
 */
export function resolveDeficit(stocks, content) {
  const lowRatio = content?.rules?.deficit?.lowRatio ?? 0.15;
  const critical = {
    "currency.materia": 40,
    "currency.energia": 40,
    "currency.bios": 40,
    "currency.supply": 80,
  };
  const soft = { "currency.metal": 80 };

  let anyEmpty = false;
  let anyLow = false;
  for (const [cur, ref] of Object.entries(critical)) {
    const v = Number(stocks[cur] ?? 0);
    if (v <= 0) anyEmpty = true;
    else if (v < ref * lowRatio) anyLow = true;
  }
  for (const [cur, ref] of Object.entries(soft)) {
    const v = Number(stocks[cur] ?? 0);
    if (v > 0 && v < ref * lowRatio) anyLow = true;
  }

  if (anyEmpty) return "empty";
  if (anyLow) return "low";
  return "ok";
}
