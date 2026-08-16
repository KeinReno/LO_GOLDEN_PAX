import type { ViewerPayload } from "../../../state/types";

export type RecruitSessionPatch = {
  world?: ViewerPayload["world"];
  economy?: ViewerPayload["economy"];
  intel?: ViewerPayload["intel"];
  visibleSystemIds?: string[];
};

export function buildQueueUpdatedMsg(queueLen: number): string {
  return `Очередь обновлена: ${queueLen}`;
}

export function unknownTechMsg(): string {
  return "Неизвестная технология";
}

export function techHighlightNote(count: number, techName: string): string {
  return count
    ? `Подсвечено систем: ${count} · «${techName}» (Esc — сброс)`
    : "Нет подходящих систем";
}

export function hybridNeedPlanetMsg(): string {
  return "Откройте планету на схеме системы";
}

export function hybridFoundedMsg(name: string): string {
  return `Линейдж основан: ${name}`;
}

export function noPlanetForBuildingMsg(): string {
  return "Нет своей планеты для постройки";
}

export function buildingFromResearchNote(
  systemName: string,
  buildingName?: string,
): string {
  return buildingName
    ? `Открыта «${systemName}» для «${buildingName}»`
    : `Открыта система ${systemName}`;
}

export function hybridLineageTarget(
  mapFocus: { level: string; systemId?: string; planetId?: string },
  systemFocusId: string | null | undefined,
): { systemId: string; planetId: string } | null {
  const systemId =
    mapFocus.level === "planet"
      ? mapFocus.systemId
      : systemFocusId ?? undefined;
  const planetId =
    mapFocus.level === "planet" ? mapFocus.planetId : undefined;
  if (!systemId || !planetId) return null;
  return { systemId, planetId };
}
