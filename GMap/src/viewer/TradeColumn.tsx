import { DIPLOMACY_LABELS } from "../state/defaults";
import {
  BUILD_METAL,
  BUILD_SUPPLY,
  CATEGORY_CURRENCIES,
} from "../state/economyLabels";
import { RESOURCE_META } from "../state/resourcePool.generated";
import { useSpotlight } from "../ui/aceternityFx";
import { DropZone } from "../ui/DropZone";
import type { DiploDealItem } from "./diploTradeTypes";
import { DIPLO_ZONE_ACCEPTS } from "./diploDealCards";

const BASE_CURRENCIES = [
  ...CATEGORY_CURRENCIES.map((c) => ({
    id: c.id,
    label: `${c.name} (${c.short})`,
  })),
  { id: BUILD_METAL.id, label: BUILD_METAL.label },
  { id: BUILD_SUPPLY.id, label: BUILD_SUPPLY.label },
];

function resourceLabel(currencyId: string): string {
  const base = BASE_CURRENCIES.find((c) => c.id === currencyId);
  if (base) return base.label;
  const meta = Object.values(RESOURCE_META).find((m) => m.id === currencyId);
  if (meta) return meta.name;
  return currencyId.replace(/^map\./, "").replace(/^currency\./, "");
}

export function diploItemLabel(
  item: DiploDealItem,
  names?: {
    fleets?: Record<string, string>;
    legions?: Record<string, string>;
    systems?: Record<string, string>;
    techs?: Record<string, string>;
  },
): string {
  switch (item.kind) {
    case "resource":
      return `${item.amount} ${resourceLabel(item.currencyId)}`;
    case "treaty":
      return DIPLOMACY_LABELS[item.treaty] ?? item.treaty;
    case "tech":
      return `Тех: ${names?.techs?.[item.techId] ?? item.techId}`;
    case "fleet":
      return `Флот: ${names?.fleets?.[item.fleetId] ?? item.fleetId}`;
    case "legion":
      return `Легион: ${names?.legions?.[item.legionId] ?? item.legionId}`;
    case "system":
      return `Система: ${names?.systems?.[item.systemId] ?? item.systemId}`;
    default:
      return "?";
  }
}

/** Drop column only. Cards come from DiploDealTray, not an in-column list. */
export function TradeColumn({
  side,
  civName,
  items,
  nameLookup,
  disabled,
  onRemove,
  onDropCard,
}: {
  side: "you" | "them";
  civName: string;
  items: DiploDealItem[];
  nameLookup: {
    fleets: Record<string, string>;
    legions: Record<string, string>;
    systems: Record<string, string>;
    techs: Record<string, string>;
  };
  disabled?: boolean;
  onRemove: (idx: number) => void;
  onDropCard?: (cardId: string) => void;
}) {
  const spot = useSpotlight();
  const title = side === "you" ? "Вы предлагаете" : "Вы запрашиваете";
  const empty =
    side === "you"
      ? "Карты слева — сюда (отдаю)"
      : "Карты справа — сюда (прошу)";

  return (
    <DropZone
      zoneId={side === "you" ? "diplo-give" : "diplo-want"}
      className={`gc-trade-col gc-trade-col--${side} fx-spotlight`}
      contentLayout="stack"
      armWhileDragging
      accepts={DIPLO_ZONE_ACCEPTS}
      onDrop={(cardId) => {
        if (!disabled) onDropCard?.(cardId);
      }}
    >
      <div className="gc-trade-col__inner" {...spot.bind}>
        <header className="gc-trade-col__head">
          <div>
            <h4>{title}</h4>
            <span className="gc-trade-col__civ">{civName}</span>
          </div>
        </header>

        <ul className="gc-trade-col__items">
          {items.length === 0 ? (
            <li className="gc-trade-col__empty hint">{empty}</li>
          ) : (
            items.map((item, i) => (
              <li key={`${item.kind}-${i}`} className="gc-trade-item">
                <span>{diploItemLabel(item, nameLookup)}</span>
                <button
                  type="button"
                  className="gc-trade-item__x"
                  aria-label="Убрать"
                  disabled={disabled}
                  onClick={() => onRemove(i)}
                >
                  ×
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </DropZone>
  );
}
