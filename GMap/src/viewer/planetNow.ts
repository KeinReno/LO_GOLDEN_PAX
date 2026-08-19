export type PlanetNowItem = {
  id: string;
  verb: string;
  detail: string;
};

export function buildPlanetNowItems(p: {
  emptySurface: number;
  emptyOrbital: number;
  laborFree: number;
  laborOpen: number;
  idleBuildingName?: string | null;
  canUpgradeSurface: boolean;
}): PlanetNowItem[] {
  const items: PlanetNowItem[] = [];
  if (p.emptySurface > 0) {
    items.push({
      id: "build-surface",
      verb: "Поставить здание",
      detail:
        p.emptySurface === 1
          ? "Свободен слот поверхности"
          : `Свободно ${p.emptySurface} слотов поверхности`,
    });
  }
  if (p.laborFree > 0 && p.laborOpen > 0) {
    items.push({
      id: "labor",
      verb: "Назначить труд",
      detail: p.idleBuildingName
        ? `${p.idleBuildingName} простаивает`
        : "Есть свободный труд и пустые места",
    });
  }
  if (p.emptyOrbital > 0) {
    items.push({
      id: "build-orbit",
      verb: "Орбита",
      detail:
        p.emptyOrbital === 1
          ? "Свободен орбитальный слот"
          : `Свободно ${p.emptyOrbital} орбитальных слотов`,
    });
  }
  if (p.canUpgradeSurface && items.length < 3) {
    items.push({
      id: "grade",
      verb: "Открыть слот",
      detail: "Грейд поверхности. Удержание, не клик.",
    });
  }
  return items.slice(0, 3);
}
