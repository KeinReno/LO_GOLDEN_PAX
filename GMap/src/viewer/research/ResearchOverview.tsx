import { useMemo, type CSSProperties } from "react";
import type { TechnologyDef, EconomyCategory } from "../../state/contentCatalog";
import type { ViewerPayload } from "../../state/types";
import { ECO_CATEGORY_NAMES } from "../economyFlowTypes";
import {
  RESEARCH_ERAS,
  buildCatProgress,
  type CatProgress,
} from "./techCellState";

const CAT_ORDER: EconomyCategory[] = ["A", "B", "C", "D", "E", "F"];
const CAT_COLOR: Record<string, string> = {
  A: "var(--eco-cat-a)",
  B: "var(--eco-cat-b)",
  C: "var(--eco-cat-c)",
  D: "var(--eco-cat-d)",
  E: "var(--eco-cat-e)",
  F: "var(--eco-cat-f)",
};

const VB = 420;
const CX = VB / 2;
const CY = VB / 2;
const HUB_R = 48;
const RING_INNER = 62;
const RING_STEP = 28;
const GAP = 0.04;

function catAngle(i: number) {
  return -Math.PI / 2 + (i * 2 * Math.PI) / CAT_ORDER.length;
}

function polar(angle: number, r: number) {
  return { x: CX + r * Math.cos(angle), y: CY + r * Math.sin(angle) };
}

function arcPath(a0: number, a1: number, r0: number, r1: number): string {
  const p0 = polar(a0, r1);
  const p1 = polar(a1, r1);
  const p2 = polar(a1, r0);
  const p3 = polar(a0, r0);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return [
    `M ${p0.x} ${p0.y}`,
    `A ${r1} ${r1} 0 ${large} 1 ${p1.x} ${p1.y}`,
    `L ${p2.x} ${p2.y}`,
    `A ${r0} ${r0} 0 ${large} 0 ${p3.x} ${p3.y}`,
    "Z",
  ].join(" ");
}

/**
 * Compact radial progress: 6 category sectors × 5 era rings.
 * Status fill only — click cell/label to open matrix workbench.
 */
export function ResearchOverview({
  byCat,
  unlocked,
  cognitio,
  busy,
  isTechBlocked,
  eco,
  onOpenBranch,
}: {
  byCat: Map<EconomyCategory, TechnologyDef[]>;
  unlocked: Set<string>;
  cognitio: number;
  busy?: boolean;
  isTechBlocked?: (tech: TechnologyDef) => boolean;
  eco?: ViewerPayload["economy"];
  onOpenBranch: (cat: EconomyCategory, era?: number) => void;
}) {
  const progress = useMemo(() => {
    const list: CatProgress[] = [];
    for (const cat of CAT_ORDER) {
      list.push(
        buildCatProgress(
          cat,
          byCat.get(cat) ?? [],
          unlocked,
          cognitio,
          busy,
          isTechBlocked,
          eco,
        ),
      );
    }
    return list;
  }, [byCat, unlocked, cognitio, busy, isTechBlocked, eco]);

  const totalDone = progress.reduce((s, p) => s + p.done, 0);
  const totalAll = progress.reduce((s, p) => s + p.total, 0);
  const sectorSpan = (2 * Math.PI) / CAT_ORDER.length;

  return (
    <div className="research-overview">
      <div className="research-overview-head">
        <div>
          <h3 className="research-overview-title">Обзор знаний</h3>
          <p className="hint">
            Сектор / кольцо → ветка ·{" "}
            <span className="tabular">
              {totalDone}/{totalAll || "—"}
            </span>
          </p>
        </div>
      </div>

      <div className="research-overview-stage">
        <svg
          className="research-overview-svg"
          viewBox={`0 0 ${VB} ${VB}`}
          role="img"
          aria-label="Прогресс исследований по категориям и эрам"
        >
          {RESEARCH_ERAS.map((era, ei) => {
            const r = RING_INNER + ei * RING_STEP + RING_STEP * 0.45;
            return (
              <circle
                key={`ring-${era}`}
                className="research-overview-ring"
                cx={CX}
                cy={CY}
                r={r}
              />
            );
          })}

          {progress.map((p, i) => {
            const mid = catAngle(i);
            const a0 = mid - sectorSpan / 2 + GAP;
            const a1 = mid + sectorSpan / 2 - GAP;
            const color = CAT_COLOR[p.cat];
            const labelPos = polar(mid, RING_INNER + 5 * RING_STEP + 16);

            return (
              <g key={p.cat} className="research-overview-sector">
                {p.eras.map((cell, ei) => {
                  const r0 = RING_INNER + ei * RING_STEP;
                  const r1 = r0 + RING_STEP - 3;
                  const ratio = cell.total > 0 ? cell.done / cell.total : 0;
                  const hot = cell.affordable > 0;
                  const empty = cell.total === 0;
                  return (
                    <path
                      key={`${p.cat}-e${cell.era}`}
                      className={[
                        "research-overview-cell",
                        hot ? "is-hot" : "",
                        empty ? "is-empty" : "",
                        ratio >= 1 && cell.total > 0 ? "is-complete" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      d={arcPath(a0, a1, r0, r1)}
                      fillOpacity={empty ? 0.15 : 0.12 + ratio * 0.55}
                      style={{ "--cell-color": color } as CSSProperties}
                      tabIndex={empty ? -1 : 0}
                      role="button"
                      aria-label={`${ECO_CATEGORY_NAMES[p.cat]} · эра ${cell.era}: ${cell.done}/${cell.total}${hot ? `, доступно ${cell.affordable}` : ""}`}
                      onClick={() => onOpenBranch(p.cat, cell.era)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onOpenBranch(p.cat, cell.era);
                        }
                      }}
                    >
                      <title>
                        {ECO_CATEGORY_NAMES[p.cat]} · эра {cell.era}:{" "}
                        {cell.done}/{cell.total}
                      </title>
                    </path>
                  );
                })}

                <text
                  className="research-overview-cat-label"
                  x={labelPos.x}
                  y={labelPos.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  style={{ fill: color }}
                  tabIndex={0}
                  role="button"
                  onClick={() => onOpenBranch(p.cat)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onOpenBranch(p.cat);
                    }
                  }}
                >
                  {p.cat}
                </text>
              </g>
            );
          })}

          <circle
            className="research-overview-hub-ring"
            cx={CX}
            cy={CY}
            r={HUB_R}
          />
        </svg>

        <div className="research-overview-hub" aria-hidden>
          <span>Знание</span>
          <strong className="tabular">{cognitio}</strong>
          <span className="hint tabular">
            {totalDone}/{totalAll || 0}
          </span>
        </div>
      </div>

      <ul className="research-overview-legend" aria-label="Ветви">
        {progress.map((p) => (
          <li key={p.cat}>
            <button
              type="button"
              className={`research-overview-legend-btn ${p.affordable ? "is-hot" : ""}`}
              style={{ "--leg-color": CAT_COLOR[p.cat] } as CSSProperties}
              onClick={() => onOpenBranch(p.cat)}
            >
              <span className="research-overview-legend-swatch" />
              <strong>{ECO_CATEGORY_NAMES[p.cat]}</strong>
              <span className="tabular hint">
                {p.done}/{p.total}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
