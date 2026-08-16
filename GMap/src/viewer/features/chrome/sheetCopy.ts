export function systemSheetMetaLine(p: {
  kind?: string;
  starCount: number;
  planetCount: number;
  ownerName?: string | null;
}): string {
  const kind =
    p.kind === "corridor" || p.starCount === 0
      ? "Коридор"
      : `${p.starCount}★ · ${p.planetCount} планет`;
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
