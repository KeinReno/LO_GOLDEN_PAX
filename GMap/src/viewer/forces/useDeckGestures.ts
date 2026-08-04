import type { DropZoneId } from "./constants";

/** Hit-test a point against elements with data-drop-zone. */
export function hitDropZone(x: number, y: number): DropZoneId | null {
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  const zone = (el as HTMLElement).closest?.("[data-drop-zone]");
  if (!zone) return null;
  const id = zone.getAttribute("data-drop-zone");
  if (id === "forge" || id === "disband" || id === "reserve" || id === "equip") {
    return id;
  }
  return null;
}

/** Hit-test another unit card under the pointer (for merge / reorder). */
export function hitCardIndex(
  x: number,
  y: number,
  excludeIndex: number,
): number | null {
  const els = document.elementsFromPoint(x, y);
  for (const el of els) {
    const card = (el as HTMLElement).closest?.("[data-unit-card-index]");
    if (!card) continue;
    const raw = card.getAttribute("data-unit-card-index");
    if (raw == null) continue;
    const idx = Number(raw);
    if (!Number.isFinite(idx) || idx === excludeIndex) continue;
    return idx;
  }
  return null;
}

export type DeckGestureHandlers = {
  onSelect: (index: number) => void;
  onDragStart: (index: number) => void;
  onDragEnd: (
    index: number,
    result: { zone: DropZoneId | null; mergeIndex: number | null },
  ) => void;
  onLongPress: (index: number) => void;
};
