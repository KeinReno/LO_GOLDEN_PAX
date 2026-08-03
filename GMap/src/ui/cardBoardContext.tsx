import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
} from "react";

export type DropZoneHit = {
  zoneId: string;
  accepts?: string[];
  onDrop?: (cardId: string) => void;
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
};

const CardBoardContext = createContext<CardBoardApi | null>(null);

function zoneAccepts(zone: DropZoneHit, cardId: string): boolean {
  if (!zone.accepts || zone.accepts.length === 0) return true;
  return zone.accepts.includes(cardId) || zone.accepts.includes("*");
}

/** Shared registry so DragCard can hit-test DropZone rects during drag. */
export function CardBoard({ children }: { children: ReactNode }) {
  const zonesRef = useRef(new Map<string, ZoneRecord>());

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
      for (const z of zonesRef.current.values()) {
        if (!zoneAccepts(z, cardId)) continue;
        const r = z.el.getBoundingClientRect();
        if (
          clientX >= r.left &&
          clientX <= r.right &&
          clientY >= r.top &&
          clientY <= r.bottom
        ) {
          return { zoneId: z.zoneId, accepts: z.accepts, onDrop: z.onDrop };
        }
      }
      return null;
    },
    [],
  );

  const api = useMemo<CardBoardApi>(
    () => ({ registerZone, hitTest, setHoverZone, clearHover }),
    [registerZone, hitTest, setHoverZone, clearHover],
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
