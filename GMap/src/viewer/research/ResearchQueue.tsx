import { useRef, useState } from "react";
import type { TechnologyDef, EconomyCategory } from "../../state/contentCatalog";
import { effectiveCognitioCost } from "../../state/researchCosts";
import type { ViewerPayload } from "../../state/types";
import { useTouchDrag } from "../shared/useTouchDrag";
import { ECO_CATEGORY_NAMES, ECO_CATEGORY_COLORS } from "../economyFlowTypes";
import { QUEUE_MAX } from "./constants";
import {
  getTechDragId,
  setTechDragId,
} from "./researchDragBus";

function cognitioCost(tech: TechnologyDef, eco?: ViewerPayload["economy"]): number {
  return effectiveCognitioCost(tech, eco, tech.category);
}

function resolveDropTarget(x: number, y: number) {
  const el = document.elementFromPoint(x, y);
  if (el?.closest("[data-queue-trash]")) return { kind: "trash" as const };
  const slotEl = el?.closest("[data-queue-slot]") as HTMLElement | null;
  if (slotEl?.dataset.queueSlot != null) {
    const index = Number(slotEl.dataset.queueSlot);
    if (!Number.isNaN(index)) return { kind: "slot" as const, index };
  }
  return null;
}

export type QueueForecastItem = {
  techId: string;
  turns: number | null;
  ready: boolean;
};

export function ResearchQueue({
  queue,
  byId,
  cognitio,
  income,
  selectedId,
  busy,
  forecasts,
  onSelect,
  onChangeQueue,
  onAccelerate,
  eco,
}: {
  queue: string[];
  byId: Map<string, TechnologyDef>;
  cognitio: number;
  income: number;
  selectedId: string | null;
  busy?: boolean;
  forecasts?: QueueForecastItem[];
  onSelect: (techId: string) => void;
  onChangeQueue: (next: string[]) => void;
  /** Rush: pay 150% → unlock now. */
  onAccelerate?: (techId: string) => void;
  eco?: ViewerPayload["economy"];
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [overTrash, setOverTrash] = useState(false);
  const trashRef = useRef<HTMLButtonElement>(null);
  const externalDragRef = useRef(false);

  const slots = Array.from({ length: QUEUE_MAX }, (_, i) => queue[i] ?? null);

  const onDropTech = (techId: string, atIndex: number) => {
    if (!techId || busy) return;
    const without = queue.filter((id) => id !== techId);
    const next = [...without];
    const insertAt = Math.min(atIndex, next.length);
    next.splice(insertAt, 0, techId);
    onChangeQueue(next.slice(0, QUEUE_MAX));
  };

  const updateHover = (x: number, y: number) => {
    const target = resolveDropTarget(x, y);
    if (target?.kind === "trash") {
      setOverTrash(true);
      setOverIndex(null);
      return;
    }
    setOverTrash(false);
    setOverIndex(target?.kind === "slot" ? target.index : null);
  };

  const finishDrop = (techId: string, x: number, y: number) => {
    const target = resolveDropTarget(x, y);
    if (target?.kind === "trash") {
      onChangeQueue(queue.filter((id) => id !== techId));
      return;
    }
    if (target?.kind === "slot") {
      onDropTech(techId, target.index);
    }
  };

  const bindSlotDrag = useTouchDrag(
    ({ args, first, last, xy: [x, y] }) => {
      const slotIndex = (args as [number])[0];
      const techId = queue[slotIndex];
      if (!techId || busy) return;
      if (first) {
        setDragIndex(slotIndex);
        setTechDragId(techId);
        externalDragRef.current = false;
      }
      updateHover(x, y);
      if (last) {
        finishDrop(techId, x, y);
        setDragIndex(null);
        setOverIndex(null);
        setOverTrash(false);
        setTechDragId(null);
      }
    },
    { filterTaps: true },
  );

  const bindExternalDrop = useTouchDrag(
    ({ first, last, xy: [x, y], movement: [mx, my] }) => {
      const techId = getTechDragId();
      if (!techId || busy) return;
      if (dragIndex != null) return;
      if (first) {
        externalDragRef.current = true;
        if (Math.hypot(mx, my) < 4) return;
      }
      updateHover(x, y);
      if (last && externalDragRef.current) {
        finishDrop(techId, x, y);
        setOverIndex(null);
        setOverTrash(false);
        if (!getTechDragId()) return;
        setTechDragId(null);
      }
    },
    { filterTaps: false },
  );

  return (
    <section className="research-queue" aria-label="Очередь исследований">
      <header className="research-queue-head">
        <strong>Очередь</strong>
        <span className="hint">
          {queue.length}/{QUEUE_MAX} · drag из дерева
        </span>
        <button
          ref={trashRef}
          type="button"
          className={`research-queue-trash ${overTrash ? "is-hot" : ""}`}
          title="Перетащите сюда, чтобы убрать"
          aria-label="Удалить из очереди"
          data-queue-trash
          disabled={busy || queue.length === 0}
        >
          ✕
        </button>
      </header>

      <ol className="research-queue-slots" {...bindExternalDrop()}>
        {slots.map((techId, i) => {
          const tech = techId ? byId.get(techId) : undefined;
          const cost = tech ? cognitioCost(tech, eco) : 0;
          const cat = (tech?.category ?? "A") as EconomyCategory;
          const forecast = forecasts?.find((f) => f.techId === techId);
          const empty = !tech;
          return (
            <li key={`slot-${i}`}>
              <div
                className={[
                  "research-queue-slot",
                  empty ? "is-empty" : "",
                  selectedId === techId ? "is-selected" : "",
                  dragIndex === i ? "is-dragging" : "",
                  overIndex === i ? "is-over" : "",
                  forecast?.ready ? "is-ready" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={
                  tech
                    ? ({
                        ["--slot-color" as string]: ECO_CATEGORY_COLORS[cat],
                      } as React.CSSProperties)
                    : undefined
                }
                data-queue-slot={i}
                onClick={() => {
                  if (techId) onSelect(techId);
                }}
                onKeyDown={(e) => {
                  if ((e.key === "Enter" || e.key === " ") && techId) {
                    e.preventDefault();
                    onSelect(techId);
                  }
                }}
                role="button"
                tabIndex={busy ? -1 : 0}
                {...(tech && !busy ? bindSlotDrag(i) : {})}
                aria-label={
                  tech
                    ? `${i + 1}. ${tech.name}`
                    : `Пустой слот ${i + 1}`
                }
              >
                {tech ? (
                  <>
                    <span className="research-queue-slot-idx">{i + 1}</span>
                    <strong className="research-queue-slot-name">
                      {tech.name}
                    </strong>
                    <span className="hint">
                      {cat}
                      {tech.era} · {ECO_CATEGORY_NAMES[cat]}
                    </span>
                    <span className="tabular research-queue-slot-cost">
                      {cost}
                      {forecast?.ready
                        ? " ✓"
                        : forecast?.turns != null
                          ? ` · ${forecast.turns}х`
                          : ""}
                    </span>
                    {onAccelerate && techId ? (
                      <button
                        type="button"
                        className="research-queue-rush"
                        disabled={
                          busy || cognitio < Math.ceil(cost * 1.5)
                        }
                        title={`Ускорить: ${Math.ceil(cost * 1.5)} cognitio → сейчас`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onAccelerate(techId);
                        }}
                      >
                        ⚡ {Math.ceil(cost * 1.5)}
                      </button>
                    ) : null}
                  </>
                ) : (
                  <span className="hint">+</span>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <p className="hint research-queue-stock">
        Знание: <strong className="tabular">{cognitio}</strong>
        {income !== 0 ? (
          <span className="tabular">
            {" "}
            ({income > 0 ? "+" : ""}
            {income}/ход)
          </span>
        ) : null}
      </p>
    </section>
  );
}
