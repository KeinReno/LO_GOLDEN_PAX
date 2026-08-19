export type RecruitMapTab = "ships" | "units";

export type RecruitMapPick = {
  tab: RecruitMapTab;
  hubIds: string[];
};

export function recruitOpenGate(
  pick: RecruitMapPick | null | undefined,
  systemId: string,
):
  | { action: "pass" }
  | { action: "block"; reason: string }
  | { action: "consume"; tab: RecruitMapTab } {
  if (!pick) return { action: "pass" };
  if (pick.hubIds.includes(systemId)) {
    return { action: "consume", tab: pick.tab };
  }
  return {
    action: "block",
    reason:
      pick.tab === "ships"
        ? "Нужна верфь или военная станция — подсвеченные системы."
        : "Нужны казармы — подсвеченные системы.",
  };
}

export function recruitPickNote(tab: RecruitMapTab, hubCount: number): string {
  if (hubCount <= 0) {
    return tab === "ships"
      ? "Нет верфи. Постройте космопорт/верфь на своей планете."
      : "Нет казарм. Постройте казармы — ополчение можно набрать с планеты.";
  }
  return tab === "ships"
    ? "Кликни подсвеченную систему с верфью. Набор списывает металл, снабжение и население."
    : "Кликни подсвеченную систему с казармами. Набор списывает металл, снабжение и население.";
}
