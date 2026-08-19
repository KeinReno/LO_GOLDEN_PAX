import { useState, type CSSProperties } from "react";
import { useTouchDrag } from "../../shared/useTouchDrag";
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
  /** Click highlight only — does not commit priority. */
  onSelectEdge?: (from: string, to: string) => void;
};

export function RpsChain({
  activeEdge,
  previewEdge,
  onSetPriority,
  onSelectEdge,
}: Props) {
  const [dragFrom, setDragFrom] = useState<string | null>(null);
  const [hoverTo, setHoverTo] = useState<string | null>(null);
  const [pickedEdge, setPickedEdge] = useState<string | null>(null);

  const bindCat = useTouchDrag(
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
          setPickedEdge(null);
          onSetPriority?.(from, to);
        }
        setDragFrom(null);
        setHoverTo(null);
      }
    },
  );

  const preview =
    previewEdge ||
    (dragFrom && hoverTo && isAdjacentRps(dragFrom, hoverTo)
      ? edgeKey(dragFrom, hoverTo)
      : null) ||
    pickedEdge;

  const pickEdge = (from: string, to: string) => {
    if (!isAdjacentRps(from, to)) return;
    const edge = edgeKey(from, to);
    setPickedEdge(edge);
    onSelectEdge?.(from, to);
  };

  return (
    <div className="eco-rps" aria-label="Цикл ресурсов">
      <header className="eco-chart-block__head">
        <h4>Цикл производства</h4>
        <span className="hint">
          перетащите на соседнюю — приоритет · клик только подсветит, не применит
        </span>
      </header>
      <div className="eco-rps__chain">
        {RPS_CHAIN.map((letter, i) => {
          const next = RPS_CHAIN[(i + 1) % RPS_CHAIN.length]!;
          const edge = edgeKey(letter, next);
          const thickness = 4;
          const isActive = activeEdge === edge;
          const isPreview = preview === edge;
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
                title={`${ECO_CATEGORY_NAMES[letter] ?? letter} · перетащите на соседнюю`}
                {...bindCat(letter)}
                onClick={() => pickEdge(letter, next)}
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
                title={`${letter}→${next} · клик — превью, перетащите буквы — приоритет`}
                onClick={() => pickEdge(letter, next)}
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
            ? `Превью: ${preview.replace("->", " → ")} — перетащите, чтобы применить`
            : activeEdge
              ? `Приоритет: ${activeEdge.replace("->", " → ")}`
              : null}
        </p>
      )}
    </div>
  );
}
