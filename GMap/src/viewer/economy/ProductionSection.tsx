import { useMemo, useState, type CSSProperties } from "react";
import { MapPinned, ExternalLink, Star } from "lucide-react";
import type { ViewerPayload } from "../../state/types";
import { ResourceIcon } from "../../ui/ResourceIcon";
import { ActionRing } from "../../ui/ActionRing";
import { useLongPress } from "../../ui/useLongPress";
import type { EconomyFlowBreakdown } from "../economyFlowTypes";
import { buildProductionSystemRows, edgeKey } from "./productionData";
import { RpsChain } from "./components/RpsChain";
import { EmptyState } from "./components/EmptyState";

type Props = {
  payload: ViewerPayload;
  flowData?: EconomyFlowBreakdown | null;
  filterCategory?: string | null;
  linkedSystemId?: string | null;
  onOpenSystem?: (systemId: string) => void;
  onFocusOnMap?: (systemId: string) => void;
  onSetFlowPriority?: (opts: {
    from: string;
    to: string;
    systemId?: string | null;
  }) => void;
  priorityBusy?: boolean;
};

function SystemRow({
  row,
  linked,
  stocks,
  onOpen,
  onFocus,
  onPriorityHere,
}: {
  row: ReturnType<typeof buildProductionSystemRows>[number];
  linked: boolean;
  stocks?: Record<string, number>;
  onOpen: () => void;
  onFocus: () => void;
  onPriorityHere: () => void;
}) {
  const [ring, setRing] = useState<{ x: number; y: number } | null>(null);
  const bind = useLongPress({
    onLongPress: ({ x, y }) => setRing({ x, y }),
    onTap: () => onOpen(),
  });

  return (
    <>
      <li>
        <button
          type="button"
          className={`eco-prod-row ${linked ? "is-linked" : ""} ${
            row.bottleneck ? "is-warn" : ""
          }`}
          {...bind()}
        >
          <span className="eco-prod-row__name">{row.name}</span>
          <span className="eco-prod-row__res">
            {row.resourceIds.length > 0 ? (
              row.resourceIds.map((id, i) => (
                <ResourceIcon
                  key={`${id}-${i}`}
                  resourceId={id}
                  stocks={stocks}
                  size={16}
                  className="eco-prod-row__icon"
                />
              ))
            ) : (
              <span className="hint">нет добычи</span>
            )}
            {row.resourceLabels.length > 0 && (
              <span className="hint eco-prod-row__labels">
                {row.resourceLabels.join(", ")}
              </span>
            )}
          </span>
          <span className="eco-prod-row__rate tabular-nums">
            ⚙ {row.ratePerTurn}/ход
            {row.bottleneck ? " ⚠" : ""}
          </span>
          <span className="eco-prod-row__open hint">открыть →</span>
        </button>
      </li>
      <ActionRing
        open={!!ring}
        x={ring?.x ?? 0}
        y={ring?.y ?? 0}
        onClose={() => setRing(null)}
        items={[
          {
            id: "open",
            label: "Открыть",
            icon: <ExternalLink size={14} />,
            onSelect: onOpen,
          },
          {
            id: "focus",
            label: "Фокус на карте",
            icon: <MapPinned size={14} />,
            onSelect: onFocus,
          },
          {
            id: "priority",
            label: "Приоритет сюда",
            icon: <Star size={14} />,
            onSelect: onPriorityHere,
          },
        ]}
      />
    </>
  );
}

export function ProductionSection({
  payload,
  flowData,
  filterCategory,
  linkedSystemId,
  onOpenSystem,
  onFocusOnMap,
  onSetFlowPriority,
  priorityBusy,
}: Props) {
  const [pendingEdge, setPendingEdge] = useState<{
    from: string;
    to: string;
  } | null>(null);

  const rows = useMemo(
    () => buildProductionSystemRows(payload, flowData, filterCategory),
    [payload, flowData, filterCategory],
  );

  const priorities = payload.economy?.flowPriorities ?? {};
  const factionPri = priorities._faction;
  const linkedPri = linkedSystemId ? priorities[linkedSystemId] : null;
  const activeEdge =
    linkedPri?.edge ||
    (linkedPri ? edgeKey(linkedPri.from, linkedPri.to) : null) ||
    factionPri?.edge ||
    (factionPri ? edgeKey(factionPri.from, factionPri.to) : null);

  const previewEdge = pendingEdge
    ? edgeKey(pendingEdge.from, pendingEdge.to)
    : null;

  const applyPriority = (from: string, to: string, systemId?: string | null) => {
    setPendingEdge({ from, to });
    onSetFlowPriority?.({ from, to, systemId });
    window.setTimeout(() => setPendingEdge(null), 1600);
  };

  return (
    <div className="eco-production">
      <RpsChain
        flowData={flowData}
        activeEdge={activeEdge}
        previewEdge={previewEdge}
        onSetPriority={(from, to) =>
          applyPriority(from, to, linkedSystemId ?? null)
        }
        onSelectEdge={(from, to) =>
          applyPriority(from, to, linkedSystemId ?? null)
        }
      />

      {filterCategory && (
        <p className="hint eco-production__filter">
          Фильтр: категория {filterCategory}
        </p>
      )}

      {priorityBusy && (
        <p className="hint" role="status">
          Приоритет в очереди…
        </p>
      )}

      {rows.length === 0 ? (
        <EmptyState
          title={
            filterCategory
              ? `Нет систем · ${filterCategory}`
              : "Нет производственных систем"
          }
          body={
            filterCategory
              ? `Нет своих систем с категорией ${filterCategory}. Снимите фильтр или постройте добычу.`
              : "Захватите или колонизируйте систему и постройте шахту."
          }
        />
      ) : (
        <ul className="eco-prod-list" aria-label="Системы с производством">
          {rows.map((row) => (
            <SystemRow
              key={row.systemId}
              row={row}
              linked={linkedSystemId === row.systemId}
              stocks={payload.economy?.stocks}
              onOpen={() => onOpenSystem?.(row.systemId)}
              onFocus={() => onFocusOnMap?.(row.systemId)}
              onPriorityHere={() => {
                const pri = factionPri || pendingEdge;
                if (pri) {
                  applyPriority(pri.from, pri.to, row.systemId);
                } else {
                  applyPriority("A", "B", row.systemId);
                }
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

// silence unused CSSProperties if tree-shaken — used via RpsChain styles
void (0 as unknown as CSSProperties);
