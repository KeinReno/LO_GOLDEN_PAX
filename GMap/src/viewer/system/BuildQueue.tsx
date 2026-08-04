import { useRef, useState, type DragEvent } from "react";
import type { BuildingDef } from "../PlayerPlanetManage";
import { BuildingKindIcon, buildingKindColor } from "../BuildingKindIcon";
import { ECO_CATEGORY_COLORS } from "../economyFlowTypes";
import {
  BUILD_DND_MIME,
  BUILD_QUEUE_MAX,
  type BuildQueueItem,
} from "./types";

type Props = {
  queue: BuildQueueItem[];
  buildings: Record<string, BuildingDef>;
  systemId: string;
  planetId: string;
  stocks?: Record<string, number>;
  busy?: boolean;
  onChangeQueue: (next: BuildQueueItem[]) => void;
};

export function BuildQueue({
  queue,
  buildings,
  systemId,
  planetId,
  stocks,
  busy,
  onChangeQueue,
}: Props) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [overTrash, setOverTrash] = useState(false);
  const trashRef = useRef<HTMLButtonElement>(null);

  const planetQueue = queue.filter(
    (q) => q.systemId === systemId && q.planetId === planetId,
  );
  const otherQueue = queue.filter(
    (q) => !(q.systemId === systemId && q.planetId === planetId),
  );

  const slots = Array.from(
    { length: BUILD_QUEUE_MAX },
    (_, i) => planetQueue[i] ?? null,
  );

  const commitPlanetQueue = (nextPlanet: BuildQueueItem[]) => {
    onChangeQueue([
      ...otherQueue,
      ...nextPlanet.slice(0, BUILD_QUEUE_MAX),
    ].slice(0, BUILD_QUEUE_MAX));
  };

  const onDropBuilding = (buildingId: string, atIndex: number) => {
    if (!buildingId || busy) return;
    if (!buildings[buildingId]) return;
    const without = planetQueue.filter((q) => q.buildingId !== buildingId);
    const item: BuildQueueItem = { systemId, planetId, buildingId };
    const next = [...without];
    const insertAt = Math.min(atIndex, next.length);
    next.splice(insertAt, 0, item);
    commitPlanetQueue(next);
  };

  const handleSlotDrop = (e: DragEvent, index: number) => {
    e.preventDefault();
    setOverIndex(null);
    setDragIndex(null);
    const buildingId =
      e.dataTransfer.getData(BUILD_DND_MIME) ||
      e.dataTransfer.getData("text/plain");
    if (!buildingId) return;
    // Reorder within queue
    const fromIdx = planetQueue.findIndex((q) => q.buildingId === buildingId);
    if (fromIdx >= 0) {
      const next = [...planetQueue];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(Math.min(index, next.length), 0, moved);
      commitPlanetQueue(next);
      return;
    }
    onDropBuilding(buildingId, index);
  };

  const handleTrashDrop = (e: DragEvent) => {
    e.preventDefault();
    setOverTrash(false);
    const buildingId =
      e.dataTransfer.getData(BUILD_DND_MIME) ||
      e.dataTransfer.getData("text/plain");
    if (!buildingId) return;
    commitPlanetQueue(
      planetQueue.filter((q) => q.buildingId !== buildingId),
    );
  };

  return (
    <section className="sys-build-queue" aria-label="Очередь строительства">
      <header className="sys-build-queue__head">
        <strong>Очередь</strong>
        <span className="hint">
          {planetQueue.length}/{BUILD_QUEUE_MAX} · drag из колоды
        </span>
        <button
          ref={trashRef}
          type="button"
          className={`sys-build-queue__trash${overTrash ? " is-hot" : ""}`}
          title="Перетащите сюда, чтобы убрать"
          aria-label="Удалить из очереди"
          onDragOver={(e) => {
            e.preventDefault();
            setOverTrash(true);
          }}
          onDragLeave={() => setOverTrash(false)}
          onDrop={handleTrashDrop}
          disabled={busy || planetQueue.length === 0}
        >
          ✕
        </button>
      </header>

      <ol className="sys-build-queue__slots">
        {slots.map((item, i) => {
          const def = item ? buildings[item.buildingId] : undefined;
          const empty = !def;
          const metal = def?.cost?.["currency.metal"] ?? 0;
          const afford =
            !def || (stocks?.["currency.metal"] ?? 0) >= metal;
          const cat = def?.category ? String(def.category) : null;
          return (
            <li key={`bq-${i}`}>
              <button
                type="button"
                className={[
                  "sys-build-queue__slot",
                  empty ? "is-empty" : "",
                  dragIndex === i ? "is-dragging" : "",
                  overIndex === i ? "is-over" : "",
                  !empty && afford ? "is-ready" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={
                  cat
                    ? ({
                        ["--slot-color" as string]:
                          ECO_CATEGORY_COLORS[cat] ??
                          buildingKindColor(def!.kind),
                      } as React.CSSProperties)
                    : undefined
                }
                draggable={!empty && !busy}
                disabled={busy}
                onDragStart={(e) => {
                  if (!item) return;
                  e.dataTransfer.setData(BUILD_DND_MIME, item.buildingId);
                  e.dataTransfer.setData("text/plain", item.buildingId);
                  e.dataTransfer.effectAllowed = "move";
                  setDragIndex(i);
                }}
                onDragEnd={() => {
                  setDragIndex(null);
                  setOverIndex(null);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setOverIndex(i);
                }}
                onDragLeave={() => setOverIndex(null)}
                onDrop={(e) => handleSlotDrop(e, i)}
                aria-label={
                  def ? `${i + 1}. ${def.name}` : `Пустой слот ${i + 1}`
                }
              >
                {def ? (
                  <>
                    <span className="sys-build-queue__idx tabular">{i + 1}</span>
                    <BuildingKindIcon kind={def.kind} size={14} />
                    <span className="sys-build-queue__name">{def.name}</span>
                    <span className="hint tabular">
                      {metal}M{afford ? " ✓" : " ⏳"}
                    </span>
                  </>
                ) : (
                  <span className="hint">+</span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
