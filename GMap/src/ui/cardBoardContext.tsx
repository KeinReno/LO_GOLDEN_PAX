import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type DropZoneHit = {
  zoneId: string;
  accepts?: string[];
  onDrop?: (cardId: string, pos: { x: number; y: number }) => void;
};

type ZoneRecord = DropZoneHit & {
  el: HTMLElement;
  setHover: (active: boolean) => void;
};

type CardBoardApi = {
  registerZone: (zone: ZoneRecord) => () => void;
  hitTest: (clientX: number, clientY: number, cardId: string) => DropZoneHit | null;
  setHoverZone: (zoneId: string | null) => void;
  clearHover: () => void;
  /** Currently dragged card id (null when idle). */
  draggingCardId: string | null;
  setDraggingCardId: (cardId: string | null) => void;
};

const CardBoardContext = createContext<CardBoardApi | null>(null);

function zoneAccepts(zone: DropZoneHit, cardId: string): boolean {
  if (!zone.accepts || zone.accepts.length === 0) return true;
  return zone.accepts.includes(cardId) || zone.accepts.includes("*");
}

/** Shared registry so DragCard can hit-test DropZone rects during drag. */
export function CardBoard({ children }: { children: ReactNode }) {
  const zonesRef = useRef(new Map<string, ZoneRecord>());
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);

  const registerZone = useCallback((zone: ZoneRecord) => {
    zonesRef.current.set(zone.zoneId, zone);
    return () => {
      zonesRef.current.delete(zone.zoneId);
    };
  }, []);

  const setHoverZone = useCallback((zoneId: string | null) => {
    for (const [id, z] of zonesRef.current) {
      z.setHover(zoneId !== null && id === zoneId);
    }
  }, []);

  const clearHover = useCallback(() => {
    for (const z of zonesRef.current.values()) z.setHover(false);
  }, []);

  const hitTest = useCallback(
    (clientX: number, clientY: number, cardId: string): DropZoneHit | null => {
      // Prefer the smallest overlapping zone (e.g. card over frontline).
      let best: DropZoneHit | null = null;
      let bestArea = Infinity;
      for (const z of zonesRef.current.values()) {
        if (!zoneAccepts(z, cardId)) continue;
        const r = z.el.getBoundingClientRect();
        if (
          clientX >= r.left &&
          clientX <= r.right &&
          clientY >= r.top &&
          clientY <= r.bottom
        ) {
          const area = Math.max(1, r.width * r.height);
          if (area < bestArea) {
            bestArea = area;
            best = { zoneId: z.zoneId, accepts: z.accepts, onDrop: z.onDrop };
          }
        }
      }
      return best;
    },
    [],
  );

  const api = useMemo<CardBoardApi>(
    () => ({
      registerZone,
      hitTest,
      setHoverZone,
      clearHover,
      draggingCardId,
      setDraggingCardId,
    }),
    [
      registerZone,
      hitTest,
      setHoverZone,
      clearHover,
      draggingCardId,
      setDraggingCardId,
    ],
  );

  return (
    <CardBoardContext.Provider value={api}>{children}</CardBoardContext.Provider>
  );
}

export function useCardBoard(): CardBoardApi {
  const ctx = useContext(CardBoardContext);
  if (!ctx) {
    throw new Error("DragCard / DropZone must be used inside <CardBoard>");
  }
  return ctx;
}

export function useCardBoardOptional(): CardBoardApi | null {
  return useContext(CardBoardContext);
}
