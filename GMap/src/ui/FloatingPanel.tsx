import { useDrag } from "@use-gesture/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Minus, Square, X } from "lucide-react";

type Geom = { x: number; y: number; w: number; h: number };

function clampGeom(g: Geom, minW: number, minH: number): Geom {
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const w = Math.min(Math.max(g.w, minW), vw - 16);
  const h = Math.min(Math.max(g.h, minH), vh - 16);
  const x = Math.min(Math.max(g.x, 0), Math.max(0, vw - w));
  const y = Math.min(Math.max(g.y, 0), Math.max(0, vh - 40));
  return { x, y, w, h };
}

function readGeom(key: string, fallback: Geom, minW: number, minH: number): Geom {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return clampGeom(fallback, minW, minH);
    return clampGeom({ ...fallback, ...JSON.parse(raw) }, minW, minH);
  } catch {
    return clampGeom(fallback, minW, minH);
  }
}

/**
 * Generic draggable floating panel (deck / inspect / produce).
 * Position persisted under storageKey.
 */
export function FloatingPanel({
  open,
  onClose,
  title,
  storageKey,
  children,
  defaultGeom = { x: 24, y: 96, w: 280, h: 420 },
  minW = 220,
  minH = 180,
  zIndex = 360,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  storageKey: string;
  children: ReactNode;
  defaultGeom?: Geom;
  minW?: number;
  minH?: number;
  zIndex?: number;
  className?: string;
}) {
  const [geom, setGeom] = useState<Geom>(() =>
    readGeom(storageKey, defaultGeom, minW, minH),
  );
  const [minimized, setMinimized] = useState(false);
  const [dragging, setDragging] = useState(false);
  const geomRef = useRef(geom);
  geomRef.current = geom;

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(geom));
    } catch {
      /* ignore */
    }
  }, [geom, storageKey]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const bindMove = useDrag(
    ({ first, last, movement: [mx, my], memo, event }) => {
      if ((event?.target as HTMLElement | null)?.closest?.("button")) {
        return memo;
      }
      if (first) {
        setDragging(true);
        return { x: geomRef.current.x, y: geomRef.current.y };
      }
      const origin = memo as { x: number; y: number };
      setGeom(
        clampGeom(
          {
            ...geomRef.current,
            x: origin.x + mx,
            y: origin.y + my,
          },
          minW,
          minH,
        ),
      );
      if (last) setDragging(false);
      return origin;
    },
    { filterTaps: true, pointer: { touch: true } },
  );

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={[
        "gmap-float-panel",
        minimized ? "is-minimized" : "",
        dragging ? "is-dragging" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        left: geom.x,
        top: geom.y,
        width: geom.w,
        height: minimized ? undefined : geom.h,
        zIndex,
      }}
      role="dialog"
      aria-label={title}
    >
      <header className="gmap-float-panel__title" {...bindMove()}>
        <span className="gmap-float-panel__title-text">{title}</span>
        <div className="gmap-float-panel__actions">
          <button
            type="button"
            className="gmap-float-panel__btn"
            title={minimized ? "Развернуть" : "Свернуть"}
            onClick={() => setMinimized((m) => !m)}
          >
            {minimized ? (
              <Square size={14} strokeWidth={2} />
            ) : (
              <Minus size={14} strokeWidth={2} />
            )}
          </button>
          <button
            type="button"
            className="gmap-float-panel__btn"
            title="Закрыть"
            onClick={onClose}
          >
            <X size={14} strokeWidth={2} />
          </button>
        </div>
      </header>
      {!minimized && <div className="gmap-float-panel__body">{children}</div>}
    </div>,
    document.body,
  );
}
