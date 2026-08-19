import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type CSSProperties,
  type SVGProps,
} from "react";
import { Search, Maximize2, Minimize2 } from "lucide-react";
import type { TechnologyDef } from "../../../state/contentCatalog";
import {
  directionColor,
  directionLabel,
  type TechDirectionId,
} from "../../../state/techDirections";
import { computeFocusedOrbitLayout, computeOrbitLayout, type OrbitLayoutTech, type OrbitNode } from "./computeOrbitLayout";
import { computeDirectionProgress, type DirectionProgress } from "./computeDirectionProgress";
import { computeHorizon, type HorizonNodeState } from "./computeHorizon";
import { SILHOUETTE_SHAPES } from "./silhouetteShapes";
import { techGlyph } from "../techGlyph";
import {
  clearTechDragIdDeferred,
  isCognitioDragging,
  setTechDragId,
} from "../researchDragBus";

/**
 * Tier 2 of the science screen (§1a-§1e of SCIENCE_ORBIT_REDESIGN_SPEC.md) —
 * replaces TechGraphCanvas.tsx's column/pan-zoom rendering for the "tree"
 * science mode. Deliberately scoped for this pass (noted in
 * agent-tasks/STATUS.md, not silently dropped): no prerequisite-edge
 * rendering and no minimap yet — horizon clipping (the actual anti-overload
 * mechanism, §1c) is what's load-bearing here, edges/minimap are polish on
 * top of a working horizon that can land in a follow-up without touching
 * this file's math.
 */

const ZOOM_MIN = 0.35;
const ZOOM_MAX = 2.2;
const STAGE_PAD = 80;

type ViewState = { panX: number; panY: number; zoom: number };

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

function zoomToward(view: ViewState, nextZoom: number, originX: number, originY: number): ViewState {
  const zoom = clamp(nextZoom, ZOOM_MIN, ZOOM_MAX);
  const wx = (originX - view.panX) / view.zoom;
  const wy = (originY - view.panY) / view.zoom;
  return { zoom, panX: originX - wx * zoom, panY: originY - wy * zoom };
}

function hexPoints(r: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    return `${(Math.cos(a) * r).toFixed(2)},${(Math.sin(a) * r).toFixed(2)}`;
  }).join(" ");
}

export type OrbitGraphProps = {
  directions: TechDirectionId[];
  /** direction id -> that direction's real (non-catalog-stub) tech list, stable rank order. */
  techsByDirection: Map<string, TechnologyDef[]>;
  unlocked: Set<string>;
  queue: string[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Controlled, not internal state — the science room mirrors this into a
   * global store (useViewerPanelFocusStore) so deep-links from other rooms
   * ("this needs a Military tech") can focus a direction from outside. */
  focusDirection: TechDirectionId | null;
  onFocusDirectionChange: (direction: TechDirectionId | null) => void;
  /** Dropping the header's dragged cognitio chip onto a node — research it now or accelerate its queue slot. */
  onCognitioDrop?: (id: string) => void;
  /** Hide the 6-direction chip bar when the parent already has a task rail. */
  hideDirectionTabs?: boolean;
  /** Palette filter (economy A–F). Layout stays; non-matching nodes fade. */
  categoryFilter?: string | null;
  onCategoryFilterChange?: (id: string | null) => void;
  categoryChips?: { id: string; name: string; color: string; tier: number }[];
};

export function OrbitGraph({
  directions,
  techsByDirection,
  unlocked,
  queue,
  selectedId,
  onSelect,
  focusDirection,
  onFocusDirectionChange,
  onCognitioDrop,
  hideDirectionTabs = false,
  categoryFilter = null,
  onCategoryFilterChange,
  categoryChips,
}: OrbitGraphProps) {
  const [expanded, setExpanded] = useState(false);
  const [view, setView] = useState<ViewState>({ panX: 0, panY: 0, zoom: 1 });
  const [search, setSearch] = useState("");
  const [expandedSectors, setExpandedSectors] = useState<Set<string>>(new Set());
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const panStateRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  useEffect(() => {
    setView({ panX: 0, panY: 0, zoom: 1 });
    setExpanded(false);
  }, [focusDirection]);

  const techById = useMemo(() => {
    const m = new Map<string, TechnologyDef>();
    for (const techs of techsByDirection.values()) for (const t of techs) m.set(t.id, t);
    return m;
  }, [techsByDirection]);

  const progress: DirectionProgress[] = useMemo(
    () => computeDirectionProgress(techsByDirection, unlocked),
    [techsByDirection, unlocked],
  );
  const progressByDirection = useMemo(
    () => new Map(progress.map((p) => [p.direction, p])),
    [progress],
  );

  const layoutTechs: OrbitLayoutTech[] = useMemo(() => {
    const out: OrbitLayoutTech[] = [];
    for (const [direction, techs] of techsByDirection) {
      for (const t of techs) out.push({ id: t.id, direction });
    }
    return out;
  }, [techsByDirection]);

  const layout = useMemo(() => {
    if (focusDirection) {
      return computeFocusedOrbitLayout(
        focusDirection,
        layoutTechs.filter((t) => t.direction === focusDirection),
      );
    }
    return computeOrbitLayout(directions, layoutTechs);
  }, [directions, layoutTechs, focusDirection]);
  const nodeById = useMemo(() => new Map(layout.nodes.map((n) => [n.id, n])), [layout]);

  const horizon = useMemo(
    () => computeHorizon(techsByDirection, unlocked, progress),
    [techsByDirection, unlocked, progress],
  );
  const horizonByDirection = useMemo(() => new Map(horizon.map((h) => [h.direction, h])), [horizon]);

  const maxOuterRadius = useMemo(() => {
    if (focusDirection) {
      return layout.sectors[0]?.outerRadius ?? 100;
    }
    return layout.sectors.reduce(
      (m, s) => Math.max(m, Math.hypot(s.apexX, s.apexY) + s.outerRadius),
      100,
    );
  }, [layout, focusDirection]);
  const ringRadii = useMemo(() => {
    const set = new Set<number>();
    for (const n of layout.nodes) set.add(Math.round(n.radius));
    return [...set].sort((a, b) => a - b);
  }, [layout.nodes]);
  const stageSize = (maxOuterRadius + STAGE_PAD) * 2;

  const searchLower = search.trim().toLowerCase();

  type RenderNode = { node: OrbitNode; state: HorizonNodeState };

  const nodesFor = useCallback(
    (direction: string): RenderNode[] => {
      const sectorFullyOpen = expanded || expandedSectors.has(direction);
      if (sectorFullyOpen) {
        const techs = techsByDirection.get(direction) ?? [];
        return techs
          .map((t): RenderNode | null => {
            const n = nodeById.get(t.id);
            if (!n) return null;
            const state: HorizonNodeState = unlocked.has(t.id) ? "done" : "dim";
            return { node: n, state };
          })
          .filter((x): x is RenderNode => x !== null);
      }
      const h = horizonByDirection.get(direction);
      if (!h || h.mode === "trophy") return [];
      return h.visible
        .map((v): RenderNode | null => {
          const n = nodeById.get(v.id);
          return n ? { node: n, state: v.state } : null;
        })
        .filter((x): x is RenderNode => x !== null);
    },
    [expanded, expandedSectors, techsByDirection, nodeById, unlocked, horizonByDirection],
  );

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const ox = e.clientX - rect.left;
      const oy = e.clientY - rect.top;
      setView((v) =>
        zoomToward(v, v.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12), ox, oy),
      );
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if ((e.target as Element)?.closest("[data-orbit-node], [data-orbit-badge], .orbit-legend")) return;
      panStateRef.current = { x: e.clientX, y: e.clientY, panX: view.panX, panY: view.panY };
      (e.target as Element).setPointerCapture?.(e.pointerId);
    },
    [view.panX, view.panY],
  );
  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const start = panStateRef.current;
    if (!start) return;
    setView((v) => ({ ...v, panX: start.panX + (e.clientX - start.x), panY: start.panY + (e.clientY - start.y) }));
  }, []);
  const onPointerUp = useCallback(() => {
    panStateRef.current = null;
  }, []);

  const zoomBy = (factor: number) => {
    const rect = stageRef.current?.getBoundingClientRect();
    const ox = rect ? rect.width / 2 : 0;
    const oy = rect ? rect.height / 2 : 0;
    setView((v) => zoomToward(v, v.zoom * factor, ox, oy));
  };

  const toggleExpanded = () => {
    setExpanded((v) => !v);
    setView({ panX: 0, panY: 0, zoom: expanded ? 1 : 0.6 });
  };

  const startDrag = (id: string) => (e: { dataTransfer?: DataTransfer }) => {
    setTechDragId(id);
    e.dataTransfer?.setData("text/plain", id);
  };

  return (
    <div className="orbit-graph-panel">
      <div className="orbit-graph-toolbar">
        {!hideDirectionTabs ? (
        <div className="orbit-dir-legend" role="tablist" aria-label="Направления">
          {directions.map((d) => {
            const p = progressByDirection.get(d);
            const on = focusDirection === d;
            return (
              <button
                key={d}
                type="button"
                role="tab"
                aria-selected={on}
                className={`orbit-dir-chip${on ? " on" : ""}`}
                style={{ "--dot-c": directionColor(d) } as CSSProperties}
                onClick={() => onFocusDirectionChange(on ? null : d)}
                title={p ? `${directionLabel(d)}: ${p.researched}/${p.total}` : directionLabel(d)}
              >
                <span className="orbit-dir-dot" />
                {directionLabel(d)}
              </button>
            );
          })}
        </div>
        ) : (
          <span className="orbit-graph-axis">
            {focusDirection ? directionLabel(focusDirection) : "Направление"}
          </span>
        )}
        {categoryChips && onCategoryFilterChange ? (
          <div className="orbit-cat-chips" role="group" aria-label="Потоки экономики">
            <button
              type="button"
              className={`orbit-cat-chip ${categoryFilter == null ? "on" : ""}`}
              onClick={() => onCategoryFilterChange(null)}
            >
              Все
            </button>
            {categoryChips.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`orbit-cat-chip ${categoryFilter === c.id ? "on" : ""}`}
                style={{ "--dot-c": c.color } as CSSProperties}
                title={`${c.name} · тир ${c.tier}`}
                onClick={() =>
                  onCategoryFilterChange(categoryFilter === c.id ? null : c.id)
                }
              >
                <span className="orbit-dir-dot" aria-hidden />
                {c.name}
              </button>
            ))}
          </div>
        ) : null}
        <div className="orbit-toolbar-spacer" />
        <label className="orbit-search-box">
          <Search size={12} strokeWidth={1.8} aria-hidden />
          <input
            type="search"
            placeholder="Поиск…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <div className="orbit-zoom-controls">
          <button type="button" className="orbit-icon-btn" onClick={() => zoomBy(1 / 1.25)} aria-label="Уменьшить">
            −
          </button>
          <span className="orbit-zoom-pct tabular-nums">{Math.round(view.zoom * 100)}%</span>
          <button type="button" className="orbit-icon-btn" onClick={() => zoomBy(1.25)} aria-label="Увеличить">
            +
          </button>
        </div>
        <button type="button" className="orbit-expand-btn" onClick={toggleExpanded}>
          {expanded ? (
            <>
              <Minimize2 size={12} strokeWidth={1.8} aria-hidden /> Свернуть к горизонту
            </>
          ) : (
            <>
              <Maximize2 size={12} strokeWidth={1.8} aria-hidden /> Развернуть всё дерево
            </>
          )}
        </button>
      </div>

      <div
        className="orbit-graph-stage"
        ref={stageRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <svg
          className="orbit-svg"
          width="100%"
          height="100%"
          viewBox={`${-stageSize / 2} ${-stageSize / 2} ${stageSize} ${stageSize}`}
        >
          <g transform={`translate(${view.panX} ${view.panY}) scale(${view.zoom})`}>
            {focusDirection
              ? ringRadii.map((r) => (
                  <circle
                    key={`ring-${r}`}
                    r={r}
                    fill="none"
                    stroke="rgba(120,140,170,0.28)"
                    strokeWidth={1.4}
                    strokeDasharray="5 7"
                  />
                ))
              : layout.sectors.map((s) => {
              const dim = focusDirection != null && focusDirection !== s.direction;
              const large = s.endAngle - s.startAngle > Math.PI ? 1 : 0;
              const r = s.outerRadius + 30;
              const x0 = s.apexX + Math.cos(s.startAngle) * r;
              const y0 = s.apexY + Math.sin(s.startAngle) * r;
              const x1 = s.apexX + Math.cos(s.endAngle) * r;
              const y1 = s.apexY + Math.sin(s.endAngle) * r;
              return (
                <path
                  key={`wedge-${s.direction}`}
                  d={`M ${s.apexX} ${s.apexY} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`}
                  fill={directionColor(s.direction)}
                  opacity={dim ? 0.02 : 0.06}
                />
              );
            })}

            {!focusDirection &&
            layout.sectors.map((s) => (
              <line
                key={`stem-${s.direction}`}
                x1={0}
                y1={0}
                x2={s.apexX}
                y2={s.apexY}
                stroke={directionColor(s.direction)}
                strokeWidth={1}
                opacity={0.18}
              />
            ))}

            <circle r={52} fill="var(--accent, #c9a227)" opacity={0.06} />
            <circle r={26} fill="var(--accent, #c9a227)" opacity={0.16} />
            <circle r={26} fill="none" stroke="var(--line-accent, rgba(201,162,39,.45))" strokeWidth={1.4} />
            {focusDirection ? (
              <text
                y={4}
                textAnchor="middle"
                className="orbit-node-label"
                fill="var(--accent-2, #e8c547)"
              >
                {directionLabel(focusDirection)}
              </text>
            ) : null}

            {layout.sectors.map((s) => {
              const phase = progressByDirection.get(s.direction)?.phase ?? "dormant";
              const dim = focusDirection != null && focusDirection !== s.direction;
              const color = directionColor(s.direction);

              if (phase === "complete") {
                const shape = SILHOUETTE_SHAPES[s.direction];
                if (!shape) return null;
                const rotateDeg = (s.midAngle * 180) / Math.PI + 90;
                // Shape coords are unitless (silhouetteShapes.ts's own doc:
                // origin at the tip, larger |y| = further from hub) — a
                // fixed scale here would put the trophy at the wrong radius
                // for any sector whose real outerRadius isn't near whatever
                // that fixed number assumed. Derive the scale from this
                // sector's actual layout radius instead, so the trophy sits
                // where the sector's real content used to reach regardless
                // of how many techs it holds.
                const allY = [...shape.points.map((p) => p.y), shape.flagship.y];
                const tipY = Math.min(...allY);
                const trophyScale = tipY !== 0 ? s.outerRadius / -tipY : 1;
                return (
                  <g
                    key={`trophy-${s.direction}`}
                    transform={`translate(${s.apexX} ${s.apexY}) rotate(${rotateDeg})`}
                    opacity={dim ? 0.25 : 1}
                  >
                    {shape.points.map((p, i) => (
                      <circle
                        key={i}
                        cx={p.x * trophyScale}
                        cy={p.y * trophyScale}
                        r={4}
                        fill={color}
                        style={{ filter: `drop-shadow(0 0 4px ${color})` }}
                      />
                    ))}
                    <circle
                      cx={shape.flagship.x * trophyScale}
                      cy={shape.flagship.y * trophyScale}
                      r={7}
                      fill="var(--accent-2, #e8c547)"
                      style={{ filter: "drop-shadow(0 0 8px var(--accent-2, #e8c547))" }}
                    />
                  </g>
                );
              }

              const rendered = nodesFor(s.direction);
              const badge =
                !expanded && !expandedSectors.has(s.direction)
                  ? horizonByDirection.get(s.direction)?.badgeCount ?? 0
                  : 0;
              const bx = s.apexX + Math.cos(s.midAngle) * (s.outerRadius + 22);
              const by = s.apexY + Math.sin(s.midAngle) * (s.outerRadius + 22);

              return (
                <g key={`sector-${s.direction}`} opacity={dim ? 0.3 : 1}>
                  {rendered.map(({ node, state }) => {
                    const tech = techById.get(node.id);
                    if (!tech) return null;
                    const matches = searchLower && tech.name.toLowerCase().includes(searchLower);
                    const catMiss =
                      !!categoryFilter && tech.category !== categoryFilter;
                    const faded =
                      (searchLower.length > 0 && !matches) || catMiss;
                    const isSelected = node.id === selectedId;
                    const isQueued = queue.includes(node.id);
                    const isDoor = phase === "dormant";
                    const radius =
                      isDoor || state === "frontier" ? 11 : state === "done" ? 9 : 7;
                    const glyph = techGlyph(tech);
                    // SVG elements support the native `draggable` DOM attribute at
                    // runtime, but React's SVGProps typings omit it (HTML-only) —
                    // spread it in via an explicit cast rather than sprinkling
                    // `as any` through the JSX.
                    const dragProps =
                      state !== "done"
                        ? ({
                            draggable: true,
                            onDragStart: startDrag(node.id),
                            onDragEnd: () => clearTechDragIdDeferred(),
                          } as unknown as SVGProps<SVGCircleElement>)
                        : {};
                    // Header's cognitio chip drop target: drag the "Знание"
                    // number onto a node to research it now (or accelerate
                    // its queue slot) — same interaction the header's
                    // AnimatedTooltip already advertises.
                    const cognitioDropProps =
                      state !== "done" && onCognitioDrop
                        ? ({
                            onDragOver: (e: React.DragEvent) => {
                              if (isCognitioDragging()) e.preventDefault();
                            },
                            onDrop: (e: React.DragEvent) => {
                              if (!isCognitioDragging()) return;
                              e.preventDefault();
                              onCognitioDrop(node.id);
                            },
                          } as unknown as SVGProps<SVGCircleElement>)
                        : {};
                    const kind =
                      state === "frontier"
                        ? "frontier"
                        : state === "done"
                          ? "done"
                          : "dim";
                    return (
                      <g
                        key={node.id}
                        transform={`translate(${node.x} ${node.y})`}
                        opacity={faded ? 0.18 : 1}
                        className={[
                          "orbit-node",
                          `orbit-node--${kind}`,
                          isSelected ? "is-sel" : "",
                          isQueued ? "is-q" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        style={{ "--node-c": color } as CSSProperties}
                        onPointerEnter={() => setHoveredId(node.id)}
                        onPointerLeave={() =>
                          setHoveredId((cur) => (cur === node.id ? null : cur))
                        }
                      >
                        <polygon
                          className="orbit-node-halo"
                          points={hexPoints(radius + 5)}
                        />
                        <polygon
                          className="orbit-node-core"
                          points={hexPoints(radius)}
                        />
                        <circle className="orbit-node-iris" r={Math.max(3.2, radius - 4)} />
                        <circle
                          data-orbit-node
                          className="orbit-node-hit"
                          r={radius + 9}
                          fill="transparent"
                          {...dragProps}
                          {...cognitioDropProps}
                          onClick={() => onSelect(node.id)}
                          role="button"
                          aria-label={`${tech.name}${
                            state === "done"
                              ? " · изучено"
                              : state === "frontier"
                                ? " · можно изучить"
                                : " · закрыто"
                          }`}
                        >
                          <title>{tech.name}</title>
                        </circle>
                        <text
                          y={1.2}
                          textAnchor="middle"
                          className="orbit-node-glyph"
                          style={{ pointerEvents: "none", fontSize: state === "dim" ? 7 : 9 }}
                        >
                          {state === "done" ? "✓" : state === "dim" ? "🔒" : glyph}
                        </text>
                      </g>
                    );
                  })}

                  {badge > 0 && (
                    <g
                      data-orbit-badge
                      transform={`translate(${bx} ${by})`}
                      onClick={() =>
                        setExpandedSectors((prev) => {
                          const next = new Set(prev);
                          next.add(s.direction);
                          return next;
                        })
                      }
                      style={{ cursor: "pointer" }}
                    >
                      <rect
                        x={-16}
                        y={-9}
                        width={32}
                        height={18}
                        rx={9}
                        fill="rgba(0,0,0,0.35)"
                        stroke="rgba(255,255,255,0.25)"
                        strokeDasharray="2 2"
                      />
                      <text x={0} y={4} textAnchor="middle" className="orbit-badge-text" fill="var(--muted, #8a96a8)">
                        +{badge}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
            {hoveredId
              ? (() => {
                  const n = nodeById.get(hoveredId);
                  const tech = techById.get(hoveredId);
                  if (!n || !tech) return null;
                  return (
                    <text
                      key={`label-${hoveredId}`}
                      x={n.x}
                      y={n.y - 22}
                      textAnchor="middle"
                      className="orbit-node-label is-up"
                    >
                      {tech.name}
                    </text>
                  );
                })()
              : null}
          </g>
        </svg>

        <ul className="orbit-legend" aria-label="Состояния узлов">
          <li>
            <span className="orbit-legend__swatch is-done" aria-hidden>
              ✓
            </span>
            изучено
          </li>
          <li>
            <span className="orbit-legend__swatch is-now" aria-hidden />
            можно сейчас
          </li>
          <li>
            <span className="orbit-legend__swatch is-lock" aria-hidden>
              🔒
            </span>
            закрыто
          </li>
          <li>
            <span className="orbit-legend__swatch is-queue" aria-hidden />
            в очереди
          </li>
        </ul>
        <div className="orbit-horizon-caption">
          {expanded
            ? focusDirection
              ? `Все ноды · ${directionLabel(focusDirection)}`
              : `Полный обзор · ${layoutTechs.length} технологий · ${directions.length} направлений`
            : "Зелёные — ближайшие неизученные. За ход идёт только 1-я в очереди, не параллельно."}
        </div>
      </div>
    </div>
  );
}
