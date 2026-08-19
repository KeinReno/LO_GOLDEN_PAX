/** Plain-Russian player UI wording (no dev jargon). */

/** Short label for action points per turn. */
export const OD = "ОД";

export const OD_TOOLTIP =
  "Первое число — сколько ОД ещё можно потратить в этот ход, второе — лимит. ОД сил — отдельно для флотов и легионов.";

export const FORCE_OD = "ОД сил";

export const FORCE_OD_TOOLTIP =
  "Первое число — свободные ОД сил на приказы флотам и легионам, второе — лимит (растёт с числом сил).";

export function formatOdCost(n: number): string {
  return `${n} ${OD}`;
}

export function formatForceOdCost(n: number): string {
  return `${n} ${FORCE_OD}`;
}

/** 1 флот, 2 флота, 5 флотов / 11 флотов / 22 флота. */
export function ruCount(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(Math.floor(Number(n) || 0));
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  const word =
    mod100 >= 11 && mod100 <= 14
      ? many
      : mod10 === 1
        ? one
        : mod10 >= 2 && mod10 <= 4
          ? few
          : many;
  return `${abs} ${word}`;
}

export function formatOdMeter(used: number, cap: number): string {
  const max = Math.max(0, Math.floor(Number(cap) || 0));
  const spent = Math.max(0, Math.floor(Number(used) || 0));
  const free = Math.max(0, max - spent);
  return `${OD} свободно ${free}/${max}`;
}

export function formatForceOdMeter(used: number, cap: number): string {
  const max = Math.max(0, Math.floor(Number(cap) || 0));
  const spent = Math.max(0, Math.floor(Number(used) || 0));
  const free = Math.max(0, max - spent);
  return `${FORCE_OD} свободно ${free}/${max}`;
}

/** Topbar HUD — same numbers, no wrapping sentence. */
export function formatOdHud(used: number, cap: number): string {
  const max = Math.max(0, Math.floor(Number(cap) || 0));
  const spent = Math.max(0, Math.floor(Number(used) || 0));
  const free = Math.max(0, max - spent);
  return `${OD} ${free}/${max}`;
}

export function formatForceOdHud(used: number, cap: number): string {
  const max = Math.max(0, Math.floor(Number(cap) || 0));
  const spent = Math.max(0, Math.floor(Number(used) || 0));
  const free = Math.max(0, max - spent);
  return `Сил ${free}/${max}`;
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

