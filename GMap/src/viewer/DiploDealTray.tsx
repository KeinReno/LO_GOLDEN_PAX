import { CardBoard } from "../ui/cardBoardContext";
import { DragCard } from "../ui/DragCard";
import { DropZone } from "../ui/DropZone";
import { ResourceIcon } from "../ui/ResourceIcon";
import { CATEGORY_CURRENCIES } from "../state/economyLabels";
import { DIPLOMACY_LABELS } from "../state/defaults";
import type { DiplomacyRelation } from "../state/types";
import type { DiploDealItem } from "./diploTradeTypes";

const QUICK_TREATIES: DiplomacyRelation[] = [
  "trade",
  "nap",
  "research_pact",
  "alliance",
  "truce",
];

/**
 * Gesture tray: drag resource / treaty cards into give or want drop zones
 * (Aceternity Draggable Card + DropZone — GC trade desk).
 */
export function DiploDealTray({
  stocks,
  disabled,
  onAddGive,
  onAddWant,
}: {
  stocks?: Record<string, number>;
  disabled?: boolean;
  onAddGive: (item: DiploDealItem) => void;
  onAddWant: (item: DiploDealItem) => void;
}) {
  const parseDrop = (cardId: string, side: "give" | "want") => {
    if (disabled) return;
    const add = side === "give" ? onAddGive : onAddWant;
    if (cardId.startsWith("res:")) {
      const currencyId = cardId.slice(4);
      const stock = stocks?.[currencyId] ?? 0;
      const amount = stock > 0 ? Math.min(100, Math.max(1, Math.floor(stock / 4) || 1)) : 50;
      if (side === "give" && stock <= 0) return;
      add({ kind: "resource", currencyId, amount });
      return;
    }
    if (cardId.startsWith("treaty:")) {
      const treaty = cardId.slice(7) as DiplomacyRelation;
      add({ kind: "treaty", treaty });
    }
  };

  return (
    <div className="gc-deal-tray">
      <p className="hint gc-deal-tray__hint">
        Перетащите карту в «Отдаю» или «Прошу» · жест вместо кликов
      </p>
      <CardBoard>
        <div className="gc-deal-tray__zones">
          <DropZone
            zoneId="diplo-give"
            label="Отдаю"
            className="gc-deal-tray__zone gc-deal-tray__zone--give"
            armWhileDragging
            accepts={["*"]}
            onDrop={(id) => parseDrop(id, "give")}
          />
          <DropZone
            zoneId="diplo-want"
            label="Прошу"
            className="gc-deal-tray__zone gc-deal-tray__zone--want"
            armWhileDragging
            accepts={["*"]}
            onDrop={(id) => parseDrop(id, "want")}
          />
        </div>
        <div className="gc-deal-tray__hand" aria-label="Карты для сделки">
          {CATEGORY_CURRENCIES.map((c) => (
            <DragCard
              key={c.id}
              cardId={`res:${c.id}`}
              title={c.short}
              subtitle={`${stocks?.[c.id] ?? 0}`}
              accent={c.cssVar}
              tilt
              pinned={!!disabled}
              onDropZone={(zoneId) => {
                if (zoneId === "diplo-give") parseDrop(`res:${c.id}`, "give");
                if (zoneId === "diplo-want") parseDrop(`res:${c.id}`, "want");
              }}
              icon={
                <ResourceIcon resourceId={c.id} stocks={stocks} size={16} />
              }
            />
          ))}
          {QUICK_TREATIES.map((t) => (
            <DragCard
              key={t}
              cardId={`treaty:${t}`}
              title={DIPLOMACY_LABELS[t] ?? t}
              subtitle="договор"
              accent="var(--accent)"
              tilt
              pinned={!!disabled}
              onDropZone={(zoneId) => {
                if (zoneId === "diplo-give") parseDrop(`treaty:${t}`, "give");
                if (zoneId === "diplo-want") parseDrop(`treaty:${t}`, "want");
              }}
            />
          ))}
        </div>
      </CardBoard>
    </div>
  );
}
