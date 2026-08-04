import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { TechnologyDef, EconomyCategory } from "../state/contentCatalog";
import { effectiveCognitioCost } from "../state/researchCosts";
import type { ViewerPayload } from "../state/types";
import { ECO_CATEGORY_NAMES } from "./economyFlowTypes";
import type { ResearchFilter } from "./research/constants";
import { TECH_DND_MIME, COGNITIO_DND_MIME } from "./research/constants";

const CAT_ORDER: EconomyCategory[] = ["A", "B", "C", "D", "E", "F"];
const CAT_COLOR: Record<string, string> = {
  A: "var(--eco-cat-a)",
  B: "var(--eco-cat-b)",
  C: "var(--eco-cat-c)",
  D: "var(--eco-cat-d)",
  E: "var(--eco-cat-e)",
  F: "var(--eco-cat-f)",
};

/** Square canvas in viewBox units — HTML nodes sized as % of this. */
const VB = 1400;
const CX = VB / 2;
const CY = VB / 2;
const HUB_R = 58;

/** Node box in viewBox units (matches CSS % width/height). */
const NODE_W = 108;
const NODE_H = 52;
const NODE_GAP = 22;

/**
 * Minimum radial step so axis-aligned node AABBs never overlap on any spoke angle.
 * No-overlap when s*|cos| >= NODE_W OR s*|sin| >= NODE_H
 * ⇒ s >= min(NODE_W/|cos|, NODE_H/|sin|) for that angle.
 */
function minRingStep(angles: number[]): number {
  let need = Math.max(NODE_W, NODE_H) + NODE_GAP;
  for (const a of angles) {
    const c = Math.abs(Math.cos(a));
    const s = Math.abs(Math.sin(a));
    const byX = c > 1e-6 ? NODE_W / c : Infinity;
    const byY = s > 1e-6 ? NODE_H / s : Infinity;
    need = Math.max(need, Math.min(byX, byY) + NODE_GAP);
  }
  return need;
}

function catAngle(cat: EconomyCategory): number {
  const i = CAT_ORDER.indexOf(cat);
  return -Math.PI / 2 + (i * 2 * Math.PI) / CAT_ORDER.length;
}

const SPOKE_ANGLES = CAT_ORDER.map(catAngle);
const RING_STEP = minRingStep(SPOKE_ANGLES);
const RING0 = HUB_R + NODE_H * 0.85 + 36;

export type RadialNode = {
  tech: TechnologyDef;
  x: number;
  y: number;
  angle: number;
  r: number;
  done: boolean;
  locked: boolean;
  /** Instant research affordable now. */
  canBuy: boolean;
  /** Prereqs met; can enter queue even if cognitio short. */
  canQueue: boolean;
  cost: number;
  upgradeStars: number;
  upgradeTotal: number;
  exclusive: boolean;
  breakthrough: boolean;
};

type Edge = {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  done: boolean;
  active: boolean;
  color: string;
};

function polar(angle: number, r: number) {
  return {
    x: CX + r * Math.cos(angle),
    y: CY + r * Math.sin(angle),
  };
}

function cognitioCost(
  tech: TechnologyDef,
  eco?: ViewerPayload["economy"],
): number {
  return effectiveCognitioCost(tech, eco, tech.category);
}

function scramble(name: string): string {
  return name.replace(/[^\s·\-–—]/g, "·");
}

/**
 * Radial tech wheel: hub + 6 category spokes.
 * Node size and ring spacing share the same viewBox units → no overlap.
 */
export function ResearchRadialTree({
  byCat,
  unlocked,
  unlockedUpgrades,
  cognitio,
  selectedId,
  focusBranch,
  busy,
  onSelect,
  filter = "all",
  search = "",
  highlightId = null,
  queueIds,
  onNodeDragStart,
  isTechBlocked,
  onCognitioDrop,
  onNodeLongPress,
  eco,
}: {
  byCat: Map<EconomyCategory, TechnologyDef[]>;
  unlocked: Set<string>;
  unlockedUpgrades?: Set<string>;
  cognitio: number;
  selectedId: string | null;
  focusBranch: EconomyCategory | null;
  busy?: boolean;
  onSelect: (techId: string) => void;
  filter?: ResearchFilter;
  search?: string;
  highlightId?: string | null;
  queueIds?: Set<string>;
  onNodeDragStart?: (techId: string) => void;
  /** Race/trait/property lock — blocks buy & queue (red). */
  isTechBlocked?: (tech: TechnologyDef) => boolean;
  /** Drop cognitio chip onto node → research / accelerate. */
  onCognitioDrop?: (techId: string) => void;
  onNodeLongPress?: (techId: string, x: number, y: number) => void;
  eco?: ViewerPayload["economy"];
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(0.92);
  const drag = useRef<{
    px: number;
    py: number;
    ox: number;
    oy: number;
  } | null>(null);
  const longPressRef = useRef<{
    timer: number | null;
    techId: string | null;
  }>({ timer: null, techId: null });

  const clearLongPress = () => {
    if (longPressRef.current.timer != null) {
      window.clearTimeout(longPressRef.current.timer);
      longPressRef.current.timer = null;
    }
    longPressRef.current.techId = null;
  };

  const maxDepth = useMemo(() => {
    let m = 1;
    for (const c of CAT_ORDER) m = Math.max(m, (byCat.get(c) ?? []).length);
    return m;
  }, [byCat]);

  const outerR = RING0 + (maxDepth - 1) * RING_STEP + NODE_H;

  const { nodes, edges, rings } = useMemo(() => {
    const nodeList: RadialNode[] = [];
    const edgeList: Edge[] = [];
    const ups = unlockedUpgrades || new Set<string>();

    for (const cat of CAT_ORDER) {
      const techs = byCat.get(cat) ?? [];
      const angle = catAngle(cat);
      const color = CAT_COLOR[cat];
      let prev: RadialNode | null = null;

      for (let i = 0; i < techs.length; i++) {
        const tech = techs[i];
        const breakthrough = !!tech.isBreakthrough;
        // Breakthroughs sit on a farther ring for visual separation
        const ringIndex = breakthrough
          ? Math.max(i, techs.filter((t) => !t.isBreakthrough).length)
          : i;
        const r = RING0 + ringIndex * RING_STEP + (breakthrough ? RING_STEP * 0.35 : 0);
        const { x, y } = polar(angle, r);
        const done = unlocked.has(tech.id);
        const prereqOk = (tech.prerequisites || []).every((p) =>
          unlocked.has(p),
        );
        const cost = cognitioCost(tech, eco);
        const lockBlocked = !!isTechBlocked?.(tech);
        const canQueue =
          !done && prereqOk && !lockBlocked && !busy;
        const canBuy = canQueue && cognitio >= cost;
        const upgradeTotal = (tech.upgrades || []).length;
        const upgradeStars = (tech.upgrades || []).filter((u) =>
          ups.has(u.id),
        ).length;
        const node: RadialNode = {
          tech,
          x,
          y,
          angle,
          r,
          done,
          locked: (!prereqOk || lockBlocked) && !done,
          canBuy,
          canQueue,
          cost,
          upgradeStars,
          upgradeTotal,
          exclusive: !!(
            tech.raceLock ||
            tech.factionTraitLock ||
            tech.hybridOf?.length ||
            tech.requiresLineage
          ),
          breakthrough,
        };
        nodeList.push(node);

        if (prev) {
          edgeList.push({
            id: `${prev.tech.id}->${tech.id}`,
            x1: prev.x,
            y1: prev.y,
            x2: x,
            y2: y,
            done: prev.done && done,
            active: prev.done && !done && prereqOk,
            color,
          });
        } else {
          const hub = polar(angle, HUB_R);
          edgeList.push({
            id: `hub->${tech.id}`,
            x1: hub.x,
            y1: hub.y,
            x2: x,
            y2: y,
            done,
            active: !done && prereqOk,
            color,
          });
        }
        prev = node;
      }
    }

    const ringRs = Array.from(
      { length: maxDepth + 1 },
      (_, i) => RING0 + i * RING_STEP,
    );

    return { nodes: nodeList, edges: edgeList, rings: ringRs };
  }, [byCat, unlocked, unlockedUpgrades, cognitio, busy, maxDepth, isTechBlocked, eco]);

  const searchLc = search.trim().toLowerCase();

  const nodeVisible = (n: RadialNode): boolean => {
    if (filter === "available") {
      if (n.done || n.locked || !(n.canBuy || n.canQueue)) return false;
    } else if (filter === "exclusive") {
      if (!n.exclusive) return false;
    } else if (filter === "breakthrough") {
      if (!n.breakthrough) return false;
    } else if (filter === "researched") {
      if (!n.done) return false;
    }
    if (searchLc) {
      const name = n.tech.name.toLowerCase();
      if (!name.includes(searchLc) && !n.tech.id.toLowerCase().includes(searchLc)) {
        return false;
      }
    }
    return true;
  };

  const hasSearch = searchLc.length > 0;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((z) =>
        Math.min(1.6, Math.max(0.45, z - e.deltaY * 0.0012)),
      );
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = (e: ReactPointerEvent) => {
    if ((e.target as HTMLElement).closest(".research-radial-node")) return;
    drag.current = { px: e.clientX, py: e.clientY, ox: pan.x, oy: pan.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (!drag.current) return;
    setPan({
      x: drag.current.ox + (e.clientX - drag.current.px),
      y: drag.current.oy + (e.clientY - drag.current.py),
    });
  };

  const onPointerUp = () => {
    drag.current = null;
  };

  const resetView = () => {
    setPan({ x: 0, y: 0 });
    setZoom(0.92);
  };

  return (
    <div
      ref={wrapRef}
      className="research-radial"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="research-radial-toolbar">
        <button type="button" className="btn ghost sm" onClick={resetView}>
          Сброс вида
        </button>
        <span className="hint">колёсико · зум · drag</span>
      </div>

      <div
        className="research-radial-stage"
        style={{
          ["--vb" as string]: String(VB),
          ["--node-w" as string]: String(NODE_W),
          ["--node-h" as string]: String(NODE_H),
          transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${zoom})`,
        }}
      >
        <svg
          className="research-radial-svg"
          viewBox={`0 0 ${VB} ${VB}`}
          role="img"
          aria-label="Дерево технологий"
        >
          <defs>
            <radialGradient id="research-hub-glow" cx="50%" cy="50%" r="50%">
              <stop
                offset="0%"
                stopColor="var(--accent)"
                stopOpacity="0.35"
              />
              <stop
                offset="100%"
                stopColor="var(--accent)"
                stopOpacity="0"
              />
            </radialGradient>
          </defs>

          {rings.map((r, i) => (
            <circle
              key={`ring-${i}`}
              className="research-radial-ring"
              cx={CX}
              cy={CY}
              r={r}
            />
          ))}

          <circle
            cx={CX}
            cy={CY}
            r={HUB_R + 40}
            fill="url(#research-hub-glow)"
          />

          {CAT_ORDER.map((cat) => {
            const a = catAngle(cat);
            const depth = byCat.get(cat)?.length ?? 1;
            const labelR = RING0 + (depth - 1) * RING_STEP + NODE_H * 0.9 + 28;
            const { x, y } = polar(a, Math.min(labelR, outerR + 20));
            const dim =
              focusBranch != null && focusBranch !== cat ? "is-dim" : "";
            return (
              <g
                key={`label-${cat}`}
                className={`research-radial-cat-label ${dim}`}
              >
                <text
                  x={x}
                  y={y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill={CAT_COLOR[cat]}
                >
                  {cat} · {ECO_CATEGORY_NAMES[cat]}
                </text>
              </g>
            );
          })}

          {edges.map((e) => {
            const cat = e.id.includes("hub->")
              ? nodes.find((n) => e.id.endsWith(n.tech.id))?.tech.category
              : (() => { const from = e.id.split("->")[0]; return nodes.find((n) => n.tech.id === from)?.tech.category; })();
            const dim =
              focusBranch != null && cat && focusBranch !== cat
                ? "is-dim"
                : "";
            return (
              <line
                key={e.id}
                className={`research-radial-edge ${e.done ? "is-done" : ""} ${e.active ? "is-active" : ""} ${dim}`}
                x1={e.x1}
                y1={e.y1}
                x2={e.x2}
                y2={e.y2}
                stroke={e.color}
              />
            );
          })}

          <circle
            className="research-radial-hub-ring"
            cx={CX}
            cy={CY}
            r={HUB_R}
          />
        </svg>

        <div
          className="research-radial-hub"
          style={{
            left: `${(CX / VB) * 100}%`,
            top: `${(CY / VB) * 100}%`,
          }}
        >
          <strong>Знание</strong>
          <span className="tabular">{cognitio}</span>
        </div>

        {nodes.map((n) => {
          const visible = nodeVisible(n);
          const dim =
            (focusBranch != null && focusBranch !== n.tech.category) ||
            (!visible && (filter !== "all" || hasSearch))
              ? "is-dim"
              : "";
          const selected = selectedId === n.tech.id;
          const highlighted = highlightId === n.tech.id;
          const searchHit =
            hasSearch &&
            visible &&
            n.tech.name.toLowerCase().includes(searchLc);
          const inQueue = queueIds?.has(n.tech.id);
          const label = n.locked ? scramble(n.tech.name) : n.tech.name;
          const stars =
            n.done && n.upgradeTotal > 0
              ? "★".repeat(n.upgradeStars) +
                "☆".repeat(Math.max(0, n.upgradeTotal - n.upgradeStars))
              : "";

          const onDragStart = (e: ReactDragEvent) => {
            if (n.done || n.locked || busy) {
              e.preventDefault();
              return;
            }
            e.dataTransfer.setData(TECH_DND_MIME, n.tech.id);
            e.dataTransfer.setData("text/plain", n.tech.id);
            e.dataTransfer.effectAllowed = "copyMove";
            onNodeDragStart?.(n.tech.id);
          };

          const onDragOver = (e: ReactDragEvent) => {
            if (!onCognitioDrop || n.done || n.locked || busy) return;
            const types = Array.from(e.dataTransfer.types || []);
            if (
              types.includes(COGNITIO_DND_MIME) ||
              types.includes("text/plain")
            ) {
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
            }
          };

          const onDrop = (e: ReactDragEvent) => {
            if (!onCognitioDrop || n.done || n.locked || busy) return;
            e.preventDefault();
            e.stopPropagation();
            const fromCognitio =
              e.dataTransfer.getData(COGNITIO_DND_MIME) ||
              e.dataTransfer.getData("text/plain");
            if (
              fromCognitio === "cognitio" ||
              fromCognitio === "currency.cognitio"
            ) {
              onCognitioDrop(n.tech.id);
            }
          };

          return (
            <button
              key={n.tech.id}
              type="button"
              draggable={!n.done && !n.locked && !busy}
              className={[
                "research-radial-node",
                n.done && "is-done",
                n.locked && "is-locked",
                n.canBuy && "is-affordable",
                !n.canBuy && n.canQueue && "is-queueable",
                selected && "is-selected",
                n.breakthrough && "is-breakthrough",
                n.exclusive && "is-exclusive",
                highlighted && "is-highlight",
                searchHit && "is-search-hit",
                inQueue && "is-queued",
                dim,
              ]
                .filter(Boolean)
                .join(" ")}
              style={{
                left: `${(n.x / VB) * 100}%`,
                top: `${(n.y / VB) * 100}%`,
                ["--node-color" as string]: n.breakthrough
                  ? "var(--accent, #c9a227)"
                  : CAT_COLOR[n.tech.category],
              }}
              onClick={() => onSelect(n.tech.id)}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDrop={onDrop}
              onPointerDown={(e) => {
                if (!onNodeLongPress || n.done || busy) return;
                const { clientX, clientY } = e;
                clearLongPress();
                longPressRef.current.techId = n.tech.id;
                longPressRef.current.timer = window.setTimeout(() => {
                  if (longPressRef.current.techId === n.tech.id) {
                    onNodeLongPress(n.tech.id, clientX, clientY);
                  }
                  clearLongPress();
                }, 420);
              }}
              onPointerUp={clearLongPress}
              onPointerLeave={clearLongPress}
              onPointerCancel={clearLongPress}
              title={
                n.locked
                  ? "Закрыто"
                  : n.canBuy
                    ? `${n.tech.name} · ${n.cost} Знание · доступно`
                    : n.canQueue
                      ? `${n.tech.name} · ${n.cost} Знание · в очередь`
                      : `${n.tech.name} · ${n.cost} Знание${
                          n.exclusive ? " · эксклюзив" : ""
                        }${n.breakthrough ? " · брейкро" : ""}${
                          inQueue ? " · в очереди" : ""
                        }`
              }
            >
              <span className="research-radial-node-top">
                <span className="research-radial-node-era">
                  {n.exclusive ? "🔒" : ""}
                  {ECO_CATEGORY_NAMES[n.tech.category] ?? n.tech.category}
                  {" · "}
                  {n.tech.era}
                </span>
                <span className="research-radial-node-cost tabular">
                  {n.done ? (stars || "✓") : n.cost}
                </span>
              </span>
              <span
                className={`research-radial-node-name ${n.locked ? "is-encrypted" : ""}`}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
