export function systemDiveBackLabel(economyLinked: boolean): string {
  return economyLinked ? "← Экономика" : "← Галактика";
}

export function catalogDisplayNames(
  catalog: Record<string, { name?: string }> | undefined,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(catalog ?? {}).map(([id, d]) => [id, d.name ?? id]),
  );
}

export function claimSystemTitle(opts: {
  hasFleet: boolean;
  ownSystem: boolean;
}): string {
  if (!opts.hasFleet) return "Выберите свой флот на карте";
  if (opts.ownSystem) return "Система уже под вашим контролем";
  return "Заявить права на систему (флот должен быть на месте)";
}

export function attackSystemTitle(opts: {
  hasFleet: boolean;
  ownSystem: boolean;
}): string {
  if (!opts.hasFleet) return "Выберите свой флот на карте";
  if (opts.ownSystem) return "Система под вашим контролем";
  return "Атаковать систему";
}
