import { useRef, useState, type DragEvent } from "react";
import type { TechnologyDef, EconomyCategory } from "../../state/contentCatalog";
import { ECO_CATEGORY_NAMES, ECO_CATEGORY_COLORS } from "../economyFlowTypes";
import { QUEUE_MAX, TECH_DND_MIME } from "./constants";

function cognitioCost(tech: TechnologyDef): number {
  return Number(tech.cost?.["currency.cognitio"] ?? 0);
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
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [overTrash, setOverTrash] = useState(false);
  const trashRef = useRef<HTMLButtonElement>(null);

  const slots = Array.from({ length: QUEUE_MAX }, (_, i) => queue[i] ?? null);

  const onDropTech = (techId: string, atIndex: number) => {
    if (!techId || busy) return;
    const without = queue.filter((id) => id !== techId);
    const next = [...without];
    const insertAt = Math.min(atIndex, next.length);
    next.splice(insertAt, 0, techId);
    onChangeQueue(next.slice(0, QUEUE_MAX));
  };

  const handleSlotDragOver = (e: DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setOverIndex(index);
  };

  const handleSlotDrop = (e: DragEvent, index: number) => {
    e.preventDefault();
    setOverIndex(null);
    setDragIndex(null);
    const techId =
      e.dataTransfer.getData(TECH_DND_MIME) ||
      e.dataTransfer.getData("text/plain");
    if (!techId) return;
    onDropTech(techId, index);
  };

  const handleSlotDragStart = (e: DragEvent, index: number, techId: string) => {
    e.dataTransfer.setData(TECH_DND_MIME, techId);
    e.dataTransfer.setData("text/plain", techId);
    e.dataTransfer.effectAllowed = "move";
    setDragIndex(index);
  };

  const handleTrashDrop = (e: DragEvent) => {
    e.preventDefault();
    setOverTrash(false);
    const techId =
      e.dataTransfer.getData(TECH_DND_MIME) ||
      e.dataTransfer.getData("text/plain");
    if (!techId) return;
    onChangeQueue(queue.filter((id) => id !== techId));
  };

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
          onDragOver={(e) => {
            e.preventDefault();
            setOverTrash(true);
          }}
          onDragLeave={() => setOverTrash(false)}
          onDrop={handleTrashDrop}
          disabled={busy || queue.length === 0}
        >
          ✕
        </button>
      </header>

      <ol className="research-queue-slots">
        {slots.map((techId, i) => {
          const tech = techId ? byId.get(techId) : undefined;
          const cost = tech ? cognitioCost(tech) : 0;
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
                draggable={!empty && !busy}
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
                onDragStart={(e) => {
                  if (!techId) return;
                  handleSlotDragStart(e, i, techId);
                }}
                onDragEnd={() => {
                  setDragIndex(null);
                  setOverIndex(null);
                }}
                onDragOver={(e) => handleSlotDragOver(e, i)}
                onDragLeave={() => setOverIndex(null)}
                onDrop={(e) => handleSlotDrop(e, i)}
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
