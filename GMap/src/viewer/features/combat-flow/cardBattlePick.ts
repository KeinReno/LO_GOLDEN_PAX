type CardEngSide = { factionId: string };

export type CardBattlePickEng = {
  id: string;
  mode?: string;
  status: string;
  sides: CardEngSide[];
};

/** Active card-table engagement for the overlay, or null when minimized/idle. */
export function pickActiveCardBattle<T extends CardBattlePickEng>(
  engagements: T[],
  factionId: string,
  cardBattleId: string | null,
  minimized: boolean,
): T | null {
  if (minimized && !cardBattleId) return null;
  const pinned = cardBattleId
    ? engagements.find((e) => e.id === cardBattleId)
    : undefined;
  const fallback = engagements.find(
    (e) =>
      e.mode === "card" &&
      (e.status === "active" || e.status === "commit") &&
      e.sides.some((s) => s.factionId === factionId),
  );
  const active = pinned || fallback || null;
  if (!active || active.mode !== "card") return null;
  if (minimized && active.id !== cardBattleId) return null;
  return active;
}
