import type { SystemPoiType } from "../state/types";
import { getCachedContent } from "../state/contentCatalog";

/** Player-facing “what do I do?” tips — complements content description. */
const ACTION_TIP: Partial<Record<SystemPoiType, string>> = {
  anomaly: "Осмотри систему флотом — событие или научный бонус.",
  asteroid: "Ставь mining-станцию на поясе — усиливает добычу Extracta.",
  pirate: "Патруль / военная станция; слабозащищённые флоты в риске.",
  nebula: "Сканеры слабее; учитывай в бою и разведке.",
  debris: "Можно разобрать на ресурсы — или потерять корабль.",
  hub: "Узел обмена и трафика; полезен для логистики.",
  ruin: "Археология / исследования (Cognitio).",
  dead_zone: "Разведка здесь слабее — не жди полного покрытия тумана.",
  quest: "Сверь квест-лог и RP-сцену с ГМом.",
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
    kind: def?.kind,
    description:
      def?.description ??
      "Объект пояса системы. Следи за эффектами на потоки и миссии.",
    actionTip: ACTION_TIP[tag],
  };
}
