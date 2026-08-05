import type { SystemPoiType } from "../state/types";
import { spaceObjectKindLabel } from "../state/displayLabels";
import { getCachedContent } from "../state/contentCatalog";

/** Player-facing “what do I do?” tips — complements content description. */
const ACTION_TIP: Partial<Record<SystemPoiType, string>> = {
  anomaly: "Осмотри систему флотом — событие или научный бонус.",
  asteroid: "Поставь станцию добычи на поясе — больше ресурсов с пояса.",
  pirate: "Нужен патруль или военная станция; слабые флоты под угрозой.",
  nebula: "Сканеры слабее; учитывай в бою и разведке.",
  debris: "Можно разобрать на ресурсы — или потерять корабль.",
  hub: "Узел обмена и трафика; полезен для логистики.",
  ruin: "Археология и исследования (наука).",
  dead_zone: "Разведка здесь слабее — не жди, что увидишь всё на карте.",
  quest: "Сверь журнал квестов и сцену с мастером.",
  wormhole: "Нестабильный переход — риск и потенциал энергии.",
  minefield: "Проход опасен без тральщиков / осторожного маршрута.",
  storm: "Портит щиты и навигацию — не стой без нужды.",
  relay: "Связь и логистика державы.",
  beacon: "Навигационный ориентир.",
  shipyard: "Ускоряет / разрешает постройку кораблей в системе.",
  mining_platform: "Работает с системными депозитами пояса.",
  black_hole: "Гравитационный колосс — осторожно с флотом.",
  pulsar: "Импульсы энергии — риск для щитов, бонус к D.",
  comet: "Транзитный объект — временный бонус/риск.",
  outpost: "Форпост присутствия — логистика и контроль.",
  fortress: "Укрепление — сильная оборона узла.",
};

export type PoiIntel = {
  tag: SystemPoiType;
  name: string;
  kind?: string;
  description: string;
  actionTip?: string;
};

export function resolvePoiIntel(tag: SystemPoiType): PoiIntel {
  const def = getCachedContent()?.space_objects?.objects?.[tag];
  return {
    tag,
    name: def?.name ?? tag,
    kind: def?.kind ? spaceObjectKindLabel(def.kind) : undefined,
    description:
      def?.description ??
      "Объект пояса системы. Следи за эффектами на потоки и миссии.",
    actionTip: ACTION_TIP[tag],
  };
}
