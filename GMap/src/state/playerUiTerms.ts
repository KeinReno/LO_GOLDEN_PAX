/** Plain-Russian player UI wording (no dev jargon). */

/** Short label for action points per turn. */
export const OD = "ОД";

export const OD_TOOLTIP =
  "ОД — очки действия империи: политика, колонии, дипломатия. ОД сил — отдельно для флотов и легионов.";

export const FORCE_OD = "ОД сил";

export const FORCE_OD_TOOLTIP =
  "ОД сил — приказы флотам и легионам (ход, блокада, разведка, атака). Лимит растёт с числом сил.";

export function formatOdCost(n: number): string {
  return `${n} ${OD}`;
}

export function formatForceOdCost(n: number): string {
  return `${n} ${FORCE_OD}`;
}

export function formatOdMeter(used: number, cap: number): string {
  return `${OD} ${used}/${cap}`;
}

export function formatForceOdMeter(used: number, cap: number): string {
  return `${FORCE_OD} ${used}/${cap}`;
}

/** Prefer force label when only force cost; empire when only empire; both when split. */
export function formatIntentOdCost(ap: number, forceAp = 0): string | null {
  const a = Math.max(0, ap | 0);
  const f = Math.max(0, forceAp | 0);
  if (a <= 0 && f <= 0) return null;
  if (a > 0 && f > 0) return `${formatOdCost(a)} + ${formatForceOdCost(f)}`;
  if (f > 0) return formatForceOdCost(f);
  return formatOdCost(a);
}

export const TURN_RESOLVE_HINT =
  "В конце хода все приказы из очереди выполняются автоматически.";

export const QUEUE_UNTIL_TURN_LABEL = "Ждут конца хода";
