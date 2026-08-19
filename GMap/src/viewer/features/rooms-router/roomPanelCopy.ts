export function researchFlowLetter(branch: string | null | undefined): string {
  return branch && /^[A-F]$/.test(branch) ? branch : "F";
}

export function researchFlowRates(
  totals:
    | Record<string, { rate?: number; demand?: number }>
    | undefined,
  branch: string | null | undefined,
): { cognitioIncome: number; categoryIncome: number; categoryDemand: number } {
  const letter = researchFlowLetter(branch);
  return {
    cognitioIncome: totals?.F?.rate ?? 0,
    categoryIncome: totals?.[letter]?.rate ?? 0,
    categoryDemand: totals?.[letter]?.demand ?? 0,
  };
}

export type ResearchEffectTarget =
  | { kind: "economy_production"; category?: string; resource?: string }
  | { kind: "forces"; fromDefId?: string; toDefId?: string };

export type ResearchEffectNav = {
  room: "economy" | "forces";
  economyCategory?: string | null;
  forceHighlightIds?: string[] | null;
};

export function researchEffectNav(
  target: ResearchEffectTarget,
): ResearchEffectNav | null {
  if (target.kind === "economy_production") {
    return {
      room: "economy",
      economyCategory: target.category ?? null,
    };
  }
  if (target.kind === "forces") {
    const ids = [target.fromDefId, target.toDefId].filter(
      (id): id is string => Boolean(id),
    );
    return {
      room: "forces",
      forceHighlightIds: ids.length ? ids : null,
    };
  }
  return null;
}

export function diploStanceOkMsg(stance: string): string {
  if (stance === "war") return "Война объявлена";
  if (stance === "embargo") return "Эмбарго введено";
  if (stance === "insult") return "Оскорбление нанесено";
  return "Договор разорван";
}
