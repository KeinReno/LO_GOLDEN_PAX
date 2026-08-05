import {
  useMemo,
  useState,
  useCallback,
} from "react";
import { MapPinned, ExternalLink, Star } from "lucide-react";
import type { ViewerPayload } from "../../state/types";
import { ResourceIcon } from "../../ui/ResourceIcon";
import { ActionRing } from "../../ui/ActionRing";
import { useLongPress } from "../../ui/useLongPress";
import type { EconomyFlowBreakdown } from "../economyFlowTypes";
import {
  buildProductionSystemRows,
  edgeKey,
  listFactionBottlenecks,
} from "./productionData";
import { RpsChain } from "./components/RpsChain";
import { EmptyState } from "./components/EmptyState";
import { categoryFilterLabel } from "./ecoCopy";
import { fmtInt } from "../../state/numberFormat";

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
  priorityDisabled,
}: {
  row: ReturnType<typeof buildProductionSystemRows>[number];
  linked: boolean;
  stocks?: Record<string, number>;
  onOpen: () => void;
  onFocus: () => void;
  onPriorityHere: () => void;
  priorityDisabled?: boolean;
}) {
  const [ring, setRing] = useState<{ x: number; y: number } | null>(null);
  const openRing = useCallback((x: number, y: number) => {
    setRing({ x, y });
  }, []);
  const bind = useLongPress({
    onLongPress: ({ x, y }) => openRing(x, y),
    onTap: () => onOpen(),
  });
  const ringItems = useMemo(
    () => [
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
        label: priorityDisabled
          ? "Сначала задайте цикл"
          : "Приоритет сюда",
        icon: <Star size={14} />,
        disabled: !!priorityDisabled,
        onSelect: onPriorityHere,
      },
    ],
    [onOpen, onFocus, onPriorityHere, priorityDisabled],
  );

  return (
    <>
      <li className={`eco-prod-row-wrap ${linked ? "is-linked" : ""}`}>
        <button
          type="button"
          className={`eco-prod-row ${linked ? "is-linked" : ""}`}
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
          <span
            className="eco-prod-row__rate tabular-nums"
            title="Оценка по зданиям и ресурсам, не поток движка"
          >
            ~{fmtInt(row.ratePerTurn)}
          </span>
          <span className="eco-prod-row__open hint">открыть →</span>
        </button>
        <div className="eco-prod-row__actions">
          <button
            type="button"
            className="eco-prod-row__icon-btn"
            title="Открыть систему"
            onClick={onOpen}
          >
            <ExternalLink size={14} strokeWidth={2} aria-hidden />
          </button>
          <button
            type="button"
            className="eco-prod-row__icon-btn"
            title="Фокус на карте"
            onClick={onFocus}
          >
            <MapPinned size={14} strokeWidth={2} aria-hidden />
          </button>
          <button
            type="button"
            className="eco-prod-row__icon-btn"
            title={
              priorityDisabled
                ? "Сначала задайте цикл на цепочке выше"
                : "Приоритет потока сюда"
            }
            disabled={!!priorityDisabled}
            onClick={onPriorityHere}
          >
            <Star size={14} strokeWidth={2} aria-hidden />
          </button>
        </div>
      </li>
      <ActionRing
        open={!!ring}
        x={ring?.x ?? 0}
        y={ring?.y ?? 0}
        onClose={() => setRing(null)}
        items={ringItems}
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

  const factionBn = useMemo(
    () =>
      listFactionBottlenecks(
        flowData,
        payload.economy?.bottlenecks as Record<string, unknown> | undefined,
      ),
    [flowData, payload.economy?.bottlenecks],
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

  const hasFactionEdge = Boolean(factionPri || pendingEdge);

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

      {factionBn.length > 0 && (
        <ul className="eco-warnings" aria-label="Узкие места империи">
          {factionBn.map((b) => (
            <li key={b.letter} className="eco-warning-row">
              <span>
                Узкое место: {b.name} (−{fmtInt(b.deficit)})
              </span>
            </li>
          ))}
        </ul>
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
              ? `Нет систем · ${categoryFilterLabel(filterCategory)}`
              : "Нет производственных систем"
          }
          body={
            filterCategory
              ? `Нет своих систем с акцентом на ${categoryFilterLabel(filterCategory)}. Снимите фильтр в шапке или постройте добычу.`
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
              priorityDisabled={!hasFactionEdge}
              onPriorityHere={() => {
                const pri = factionPri || pendingEdge;
                if (!pri) return;
                applyPriority(pri.from, pri.to, row.systemId);
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
