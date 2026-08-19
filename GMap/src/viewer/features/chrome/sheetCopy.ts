import { ruCount } from "../../../state/playerUiTerms.ts";

export function systemSheetMetaLine(p: {
  kind?: string;
  starCount: number;
  planetCount: number;
  ownerName?: string | null;
}): string {
  const kind =
    p.kind === "corridor" || p.starCount === 0
      ? "Коридор"
      : `${p.starCount}★ · ${ruCount(p.planetCount, "планета", "планеты", "планет")}`;
  return `${kind}${p.ownerName ? ` · ${p.ownerName}` : " · нейтрал"}`;
}

export function systemSheetColonyHint(
  inhabited: number,
  resourceLabels: string[],
): string {
  const res = resourceLabels.length ? resourceLabels.join(", ") : "—";
  return `Колоний: ${inhabited} · ресурсы: ${res}`;
}

export function scoutRevealButtonLabel(
  apCost: number,
  formatCost: (n: number) => string,
): string {
  const base = "Разведка · открыть систему";
  return apCost > 0 ? `${base} (${formatCost(apCost)})` : base;
}

/** Owned capital/system opens dive; foreign still costs scout AP. */
export function systemSheetOpenButtonLabel(p: {
  owned: boolean;
  apCost: number;
  formatCost: (n: number) => string;
}): string {
  if (p.owned) return "Управлять";
  return scoutRevealButtonLabel(p.apCost, p.formatCost);
}
