import { useMemo, useState, type CSSProperties } from "react";
import { useDrag } from "@use-gesture/react";
import { CATEGORY_CURRENCIES } from "../../../state/economyLabels";
import {
  ECO_CATEGORY_COLORS,
  ECO_CATEGORY_NAMES,
  type EconomyFlowBreakdown,
} from "../../economyFlowTypes";
import { RPS_CHAIN, edgeKey, isAdjacentRps } from "../productionData";

type Props = {
  flowData?: EconomyFlowBreakdown | null;
  activeEdge?: string | null;
  previewEdge?: string | null;
  onSetPriority?: (from: string, to: string) => void;
  onSelectEdge?: (from: string, to: string) => void;
};

export function RpsChain({
  flowData,
  activeEdge,
  previewEdge,
  onSetPriority,
  onSelectEdge,
}: Props) {
  const [dragFrom, setDragFrom] = useState<string | null>(null);
  const [hoverTo, setHoverTo] = useState<string | null>(null);

  const volumes = useMemo(() => {
    const out: Record<string, number> = {};
    for (let i = 0; i < RPS_CHAIN.length; i++) {
      const from = RPS_CHAIN[i]!;
      const to = RPS_CHAIN[(i + 1) % RPS_CHAIN.length]!;
      const rateFrom = flowData?.totals?.[from]?.rate ?? 0;
      const rateTo = flowData?.totals?.[to]?.rate ?? 0;
      out[edgeKey(from, to)] = Math.max(
        0,
        Math.min(rateFrom, rateTo) || rateFrom * 0.35,
      );
    }
    return out;
  }, [flowData]);

  const maxVol = Math.max(1, ...Object.values(volumes));

  const bindCat = useDrag(
    ({ args, first, last, xy: [x, y] }) => {
      const from = (args as [string])[0];
      if (first) {
        setDragFrom(from);
        setHoverTo(null);
      }
      const el = document.elementFromPoint(x, y);
      const target = el?.closest?.("[data-rps-cat]") as HTMLElement | null;
      const to = target?.dataset?.rpsCat ?? null;
      setHoverTo(to && to !== from ? to : null);
      if (last) {
        if (to && to !== from && isAdjacentRps(from, to)) {
          onSetPriority?.(from, to);
        }
        setDragFrom(null);
        setHoverTo(null);
      }
    },
    { filterTaps: true, pointer: { touch: true } },
  );

  const preview =
    previewEdge ||
    (dragFrom && hoverTo && isAdjacentRps(dragFrom, hoverTo)
      ? edgeKey(dragFrom, hoverTo)
      : null);

  return (
    <div className="eco-rps" aria-label="RPS-цикл">
      <header className="eco-chart-block__head">
        <h4>Цикл A→F</h4>
        <span className="hint">drag категории на следующую = приоритет</span>
      </header>
      <div className="eco-rps__chain">
        {RPS_CHAIN.map((letter, i) => {
          const next = RPS_CHAIN[(i + 1) % RPS_CHAIN.length]!;
          const edge = edgeKey(letter, next);
          const vol = volumes[edge] ?? 0;
          const thickness = 2 + Math.round((vol / maxVol) * 10);
          const isActive = activeEdge === edge;
          const isPreview = preview === edge;
          const cat = CATEGORY_CURRENCIES.find((c) => c.letter === letter);
          return (
            <div key={letter} className="eco-rps__node-wrap">
              <button
                type="button"
                className={`eco-rps__node ${
                  dragFrom === letter ? "is-dragging" : ""
                } ${hoverTo === letter ? "is-drop" : ""}`}
                data-rps-cat={letter}
                style={
                  {
                    "--eco-rps-color": ECO_CATEGORY_COLORS[letter],
                  } as CSSProperties
                }
                title={`${ECO_CATEGORY_NAMES[letter]} · ${cat?.name ?? ""}`}
                {...bindCat(letter)}
              >
                <span className="eco-rps__letter">{letter}</span>
                <span className="eco-rps__name">
                  {ECO_CATEGORY_NAMES[letter]}
                </span>
              </button>
              <button
                type="button"
                className={`eco-rps__arrow ${isActive ? "is-active" : ""} ${
                  isPreview ? "is-preview" : ""
                }`}
                style={{
                  height: thickness,
                  ["--eco-rps-color" as string]: ECO_CATEGORY_COLORS[letter],
                }}
                title={`${letter}→${next}: ~${Math.round(vol)}/ход`}
                onClick={() => onSelectEdge?.(letter, next)}
              >
                <span className="eco-rps__arrow-cap" aria-hidden>
                  →
                </span>
              </button>
            </div>
          );
        })}
      </div>
      {(activeEdge || preview) && (
        <p className="hint eco-rps__status">
          {preview && preview !== activeEdge
            ? `Превью: ${preview} (+35% на следующем тике)`
            : activeEdge
              ? `Приоритет: ${activeEdge}`
              : null}
        </p>
      )}
    </div>
  );
}
