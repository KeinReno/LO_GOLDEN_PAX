import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type JSX,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { TechnologyDef } from "../../../state/contentCatalog";
import { isTechInOffer, OFFER_BYPASS_COGNITIO_MULT } from "../../../state/researchCosts";
import { directionColor } from "../../../state/techDirections";
import type { ViewerPayload } from "../../../state/types";
import { useTouchDrag } from "../../shared/useTouchDrag";
import { type ResearchFilter } from "../constants";
import {
  isCognitioDragging,
  setCognitioDragging,
  setTechDragId,
} from "../researchDragBus";
import { matchesResearchFilter, techUiState } from "../techCellState";
import { buildTechGraphLayout } from "./techGraphLayout";
import {
  collectOfferCandidateIds,
  isBypassFrontierTech,
  visibleGraphTechs,
} from "./visibleGraphTechs";

const COL_W = 200;
const LANE_H = 56;
const PAD_X = 28;
const PAD_Y = 36;
const NODE_W = 168;
const NODE_H = 46;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 1.75;

const CAT_COLOR: Record<string, string> = {
  A: "var(--eco-cat-a)",
  B: "var(--eco-cat-b)",
  C: "var(--eco-cat-c)",
  D: "var(--eco-cat-d)",
  E: "var(--eco-cat-e)",
  F: "var(--eco-cat-f)",
};

type ViewState = { panX: number; panY: number; zoom: number };

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

function nodeColor(
  tech: TechnologyDef,
  directionOf?: (techId: string) => string | null,
): string {
  if (directionOf) {
    const dir = directionOf(tech.id);
    if (dir) return directionColor(dir);
  }
  return CAT_COLOR[tech.category] || "var(--accent)";
}

function nodePx(x: number, y: number) {
  return { left: PAD_X + x * COL_W, top: PAD_Y + y * LANE_H };
}

function edgePath(x1: number, y1: number, x2: number, y2: number): string {
  const dx = Math.max(36, Math.abs(x2 - x1) * 0.45);
  const s = x2 >= x1 ? 1 : -1;
  return `M ${x1} ${y1} C ${x1 + dx * s} ${y1}, ${x2 - dx * s} ${y2}, ${x2} ${y2}`;
}

function zoomToward(
  view: ViewState,
  nextZoom: number,
  originX: number,
  originY: number,
): ViewState {
  const zoom = clamp(nextZoom, ZOOM_MIN, ZOOM_MAX);
  const wx = (originX - view.panX) / view.zoom;
  const wy = (originY - view.panY) / view.zoom;
  return {
    zoom,
    panX: originX - wx * zoom,
    panY: originY - wy * zoom,
  };
}

function isPanTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return !target.closest("[data-graph-tech], .research-graph-controls");
}

function viewTransform(view: ViewState): string {
  return `translate(${view.panX}px, ${view.panY}px) scale(${view.zoom})`;
}

/**
 * Pan/zoom tech graph: SVG edges under HTML nodes. Self-contained —
 * parent chooses the tech set (one direction or all). The canvas then
 * keeps only unlocked + current offers + queue — not the full catalog.
 * Pan/zoom is applied to the world DOM node on rAF — React state here
 * re-renders every chip and stalls the tab.
 */
export function TechGraphCanvas(props: {
  techs: TechnologyDef[];
  directionOf?: (techId: string) => string | null;
  unlocked: Set<string>;
  cognitio: number;
  selectedId: string | null;
  busy?: boolean;
  filter?: ResearchFilter;
  search?: string;
  queueIds?: Set<string>;
  isTechBlocked?: (tech: TechnologyDef) => boolean;
  eco?: ViewerPayload["economy"];
  onSelect: (techId: string) => void;
  onCognitioDrop?: (techId: string) => void;
  onTechDragStart?: (techId: string) => void;
  onOpenDirection?: (techId: string) => void;
}): JSX.Element {
  const {
    techs,
    directionOf,
    unlocked,
    cognitio,
    selectedId,
    busy,
    filter = "all",
    search = "",
    queueIds,
    isTechBlocked,
    eco,
    onSelect,
    onCognitioDrop,
    onTechDragStart,
    onOpenDirection,
  } = props;

  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [showBypass, setShowBypass] = useState(false);
  const viewRef = useRef<ViewState>({ panX: 0, panY: 0, zoom: 1 });
  const pendingViewRef = useRef<ViewState | null>(null);
  const rafRef = useRef(0);
  const viewportRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const panRef = useRef<{ lastX: number; lastY: number } | null>(null);
  const pinchRef = useRef<{
    dist: number;
    zoom: number;
    panX: number;
    panY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const readView = () => pendingViewRef.current ?? viewRef.current;

  const commitView = useCallback((next: ViewState) => {
    pendingViewRef.current = next;
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const v = pendingViewRef.current;
      if (!v) return;
      viewRef.current = v;
      pendingViewRef.current = null;
      const el = worldRef.current;
      if (el) el.style.transform = viewTransform(v);
    });
  }, []);

  const graphTechs = useMemo(
    () =>
      visibleGraphTechs(techs, unlocked, eco?.currentOffers, queueIds, {
        includeBypass: showBypass,
      }),
    [techs, unlocked, eco?.currentOffers, queueIds, showBypass],
  );
  const bypassCount = useMemo(() => {
    const offers = collectOfferCandidateIds(eco?.currentOffers);
    let n = 0;
    for (const t of techs) {
      if (isBypassFrontierTech(t, unlocked, offers) && !queueIds?.has(t.id)) n += 1;
    }
    return n;
  }, [techs, unlocked, eco?.currentOffers, queueIds]);
  const layout = useMemo(() => buildTechGraphLayout(graphTechs), [graphTechs]);
  const nodeById = useMemo(() => {
    const m = new Map<string, (typeof layout.nodes)[number]>();
    for (const n of layout.nodes) m.set(n.id, n);
    return m;
  }, [layout.nodes]);

  const worldW = PAD_X * 2 + (layout.maxX + 1) * COL_W;
  const worldH = PAD_Y * 2 + (layout.maxY + 1) * LANE_H;

  const dimmed = useMemo(() => {
    const set = new Set<string>();
    for (const n of layout.nodes) {
      const st = techUiState(
        n.tech,
        unlocked,
        cognitio,
        busy,
        queueIds,
        isTechBlocked,
        eco,
      );
      if (!matchesResearchFilter(n.tech, st, filter, search)) set.add(n.id);
    }
    return set;
  }, [
    layout.nodes,
    unlocked,
    cognitio,
    busy,
    queueIds,
    isTechBlocked,
    eco,
    filter,
    search,
  ]);

  const resolveTechAt = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y);
    const chip = el?.closest("[data-graph-tech]") as HTMLElement | null;
    return chip?.dataset.graphTech ?? null;
  };

  const bindTechDrag = useTouchDrag(
    ({ args, first, last }) => {
      const techId = (args as [string])[0];
      if (first) {
        setTechDragId(techId);
        onTechDragStart?.(techId);
      }
      if (last) setTechDragId(null);
    },
    { filterTaps: true },
  );

  const bindCognitioDrop = useTouchDrag(
    ({ last, xy: [x, y] }) => {
      if (!onCognitioDrop || !isCognitioDragging()) return;
      const overId = resolveTechAt(x, y);
      setDragOverId(overId);
      if (last && overId) {
        onCognitioDrop(overId);
        setDragOverId(null);
        setCognitioDragging(false);
      }
    },
    { filterTaps: false },
  );

  const applyZoom = useCallback(
    (next: number, ox: number, oy: number) => {
      commitView(zoomToward(readView(), next, ox, oy));
    },
    [commitView],
  );

  const fitView = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp || layout.nodes.length === 0) {
      commitView({ panX: 0, panY: 0, zoom: 1 });
      return;
    }
    const vw = vp.clientWidth;
    const vh = vp.clientHeight;
    if (vw < 8 || vh < 8) return;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of layout.nodes) {
      const p = nodePx(n.x, n.y);
      minX = Math.min(minX, p.left);
      minY = Math.min(minY, p.top);
      maxX = Math.max(maxX, p.left + NODE_W);
      maxY = Math.max(maxY, p.top + NODE_H);
    }
    const cw = Math.max(1, maxX - minX);
    const ch = Math.max(1, maxY - minY);
    const pad = 20;
    const zoom = clamp(
      Math.min((vw - pad * 2) / cw, (vh - pad * 2) / ch),
      ZOOM_MIN,
      ZOOM_MAX,
    );
    commitView({
      zoom,
      panX: (vw - cw * zoom) / 2 - minX * zoom,
      panY: (vh - ch * zoom) / 2 - minY * zoom,
    });
  }, [commitView, layout.nodes]);

  useLayoutEffect(() => {
    const el = worldRef.current;
    if (!el) return;
    el.style.transform = viewTransform(pendingViewRef.current ?? viewRef.current);
  });

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const rect = el.getBoundingClientRect();
      const cur = readView();
      commitView(
        zoomToward(
          cur,
          cur.zoom * (e.deltaY > 0 ? 0.9 : 1.1),
          e.clientX - rect.left,
          e.clientY - rect.top,
        ),
      );
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    };
  }, [commitView]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size >= 2) {
      panRef.current = null;
      const pts = [...pointersRef.current.values()];
      const a = pts[0];
      const b = pts[1];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const rect = viewportRef.current?.getBoundingClientRect();
      const v = readView();
      pinchRef.current = {
        dist,
        zoom: v.zoom,
        panX: v.panX,
        panY: v.panY,
        originX: rect ? (a.x + b.x) / 2 - rect.left : 0,
        originY: rect ? (a.y + b.y) / 2 - rect.top : 0,
      };
      return;
    }
    if (!isPanTarget(e.target)) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    panRef.current = { lastX: e.clientX, lastY: e.clientY };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (pointersRef.current.has(e.pointerId)) {
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    if (pointersRef.current.size >= 2 && pinchRef.current) {
      const pts = [...pointersRef.current.values()];
      const a = pts[0];
      const b = pts[1];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const start = pinchRef.current;
      const factor = start.dist > 0 ? dist / start.dist : 1;
      const next = clamp(start.zoom * factor, ZOOM_MIN, ZOOM_MAX);
      const wx = (start.originX - start.panX) / start.zoom;
      const wy = (start.originY - start.panY) / start.zoom;
      commitView({
        zoom: next,
        panX: start.originX - wx * next,
        panY: start.originY - wy * next,
      });
      return;
    }
    if (!panRef.current) return;
    const dx = e.clientX - panRef.current.lastX;
    const dy = e.clientY - panRef.current.lastY;
    panRef.current.lastX = e.clientX;
    panRef.current.lastY = e.clientY;
    const cur = readView();
    commitView({ ...cur, panX: cur.panX + dx, panY: cur.panY + dy });
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    panRef.current = null;
  };

  const eraCount = layout.maxX + 1;

  return (
    <div className="research-graph" style={{ touchAction: "none" }} {...bindCognitioDrop()}>
      <div
        ref={viewportRef}
        className="research-graph-viewport"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {layout.nodes.length === 0 ? (
          <p className="research-graph-empty hint">
            Дерево растёт от изученного и текущих предложений.
          </p>
        ) : null}
        <div
          ref={worldRef}
          className="research-graph-world"
          hidden={layout.nodes.length === 0}
          style={{ width: worldW, height: worldH }}
        >
          <svg
            className="research-graph-edges"
            width={worldW}
            height={worldH}
            aria-hidden
          >
            {Array.from({ length: eraCount }, (_, i) => {
              const x = PAD_X + i * COL_W + NODE_W / 2;
              return (
                <g key={`era-${i}`}>
                  <line
                    className="research-graph-col-guide"
                    x1={x}
                    y1={PAD_Y - 8}
                    x2={x}
                    y2={worldH - PAD_Y / 2}
                  />
                  <text
                    className="research-graph-era-label"
                    x={x}
                    y={16}
                    textAnchor="middle"
                  >
                    Эра {i + 1}
                  </text>
                </g>
              );
            })}
            {layout.edges.map((e) => {
              const from = nodeById.get(e.from);
              const to = nodeById.get(e.to);
              if (!from || !to) return null;
              const a = nodePx(from.x, from.y);
              const b = nodePx(to.x, to.y);
              const x1 = a.left + NODE_W;
              const y1 = a.top + NODE_H / 2;
              const x2 = b.left;
              const y2 = b.top + NODE_H / 2;
              const bothDone = unlocked.has(from.id) && unlocked.has(to.id);
              const edgeDimmed = dimmed.has(from.id) || dimmed.has(to.id);
              return (
                <path
                  key={`${e.from}->${e.to}`}
                  className={[
                    "research-graph-edge",
                    bothDone ? "is-done" : "is-pending",
                    edgeDimmed ? "is-dimmed" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  d={edgePath(x1, y1, x2, y2)}
                  fill="none"
                />
              );
            })}
          </svg>

          {layout.nodes.map((n) => {
            const t = n.tech;
            const st = techUiState(
              t,
              unlocked,
              cognitio,
              busy,
              queueIds,
              isTechBlocked,
              eco,
            );
            const inOffer = isTechInOffer(t, eco);
            const canDrag = st.done || !!onTechDragStart;
            const pos = nodePx(n.x, n.y);
            const accent = nodeColor(t, directionOf);
            return (
              <button
                key={t.id}
                type="button"
                className={[
                  "research-graph-node",
                  selectedId === t.id ? "is-selected" : "",
                  st.done ? "is-done" : "",
                  st.locked ? "is-locked" : "",
                  st.canBuy ? "is-affordable" : "",
                  st.canQueue && !st.canBuy ? "is-queueable" : "",
                  st.inQueue ? "is-queued" : "",
                  t.isBreakthrough ? "is-breakthrough" : "",
                  dragOverId === t.id ? "is-drop" : "",
                  !st.done && inOffer ? "is-offer" : "",
                  !st.done && !inOffer ? "is-bypass" : "",
                  dimmed.has(t.id) ? "is-dimmed" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={
                  {
                    left: pos.left,
                    top: pos.top,
                    "--graph-accent": accent,
                  } as CSSProperties
                }
                data-graph-tech={t.id}
                {...(canDrag && !busy ? bindTechDrag(t.id) : {})}
                onClick={() => {
                  onSelect(t.id);
                  onOpenDirection?.(t.id);
                }}
                title={
                  st.done
                    ? t.name
                    : inOffer
                      ? t.name
                      : `${t.name} · вне предложения ×${OFFER_BYPASS_COGNITIO_MULT}`
                }
              >
                <span className="research-graph-node-name">
                  {st.locked && !st.done ? (
                    <span className="research-graph-node-lock" aria-hidden>
                      🔒
                    </span>
                  ) : null}
                  {t.name}
                </span>
                <span className="research-graph-node-meta tabular">
                  {st.done ? "✓" : st.locked ? "—" : st.cost}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="research-graph-controls" role="toolbar" aria-label="Граф">
        <button
          type="button"
          className={`research-graph-ctrl research-graph-ctrl--bypass${showBypass ? " on" : ""}`}
          aria-pressed={showBypass}
          aria-label={`Показать доступное вне предложения, надбавка ×${OFFER_BYPASS_COGNITIO_MULT}`}
          title="Пререки выполнены, не в текущем предложении"
          onClick={() => setShowBypass((v) => !v)}
        >
          ×{OFFER_BYPASS_COGNITIO_MULT}
          {bypassCount > 0 ? (
            <span className="tabular"> · {bypassCount}</span>
          ) : null}
        </button>
        <button
          type="button"
          className="research-graph-ctrl"
          onClick={() => {
            const vp = viewportRef.current;
            if (!vp) return;
            applyZoom(
              readView().zoom * 1.15,
              vp.clientWidth / 2,
              vp.clientHeight / 2,
            );
          }}
          aria-label="Приблизить"
        >
          +
        </button>
        <button
          type="button"
          className="research-graph-ctrl"
          onClick={() => {
            const vp = viewportRef.current;
            if (!vp) return;
            applyZoom(
              readView().zoom / 1.15,
              vp.clientWidth / 2,
              vp.clientHeight / 2,
            );
          }}
          aria-label="Отдалить"
        >
          −
        </button>
        <button
          type="button"
          className="research-graph-ctrl"
          onClick={fitView}
          aria-label="Вписать граф"
        >
          Fit
        </button>
      </div>
    </div>
  );
}
