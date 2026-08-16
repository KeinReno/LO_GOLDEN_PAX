export function stanceLockedMsg(label: string): string {
  return `Поза «${label}» зафиксирована`;
}

export function cardBattleRequestMsg(mutual: boolean): string {
  return mutual
    ? "Карточный бой начат (взаимное согласие)"
    : "Запрос карточного боя отправлен";
}

export function replaceEngagement<T extends { id: string }>(
  list: T[],
  id: string,
  next: T,
): T[] {
  return list.map((e) => (e.id === id ? next : e));
}
