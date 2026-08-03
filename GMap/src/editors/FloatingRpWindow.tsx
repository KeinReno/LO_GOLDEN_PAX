import { useDrag } from "@use-gesture/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Minus, Square, X } from "lucide-react";
import { RpChat, type RpChatProps } from "./RpChat";

type Geom = { x: number; y: number; w: number; h: number };

const DEFAULT_GEOM: Geom = { x: 48, y: 48, w: 920, h: 620 };
const MIN_W = 280;
const MIN_H = 280;

function clampGeom(g: Geom): Geom {
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const w = Math.min(Math.max(g.w, MIN_W), vw - 16);
  const h = Math.min(Math.max(g.h, MIN_H), vh - 16);
  const x = Math.min(Math.max(g.x, 0), Math.max(0, vw - w));
  const y = Math.min(Math.max(g.y, 0), Math.max(0, vh - 40));
  return { x, y, w, h };
}

function readGeom(key: string): Geom {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return clampGeom(DEFAULT_GEOM);
    return clampGeom({ ...DEFAULT_GEOM, ...JSON.parse(raw) });
  } catch {
    return clampGeom(DEFAULT_GEOM);
  }
}

function writeGeom(key: string, g: Geom): void {
  try {
    localStorage.setItem(key, JSON.stringify(g));
  } catch {
    /* ignore */
  }
}

export type FloatingRpWindowProps = RpChatProps & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  /** Persist position/size under this key. */
  storageKey?: string;
  unread?: number;
  zIndex?: number;
  /** Replace default RpChat body (e.g. CourtPanel). */
  children?: ReactNode;
};

/** Draggable + resizable floating RP chat — @use-gesture. */
export function FloatingRpWindow({
  open,
  onOpenChange,
  title = "Сцена · мастер",
  storageKey = "gmap-rp-float-geom",
  unread = 0,
  zIndex = 220,
  children,
  ...chatProps
}: FloatingRpWindowProps) {
  const [geom, setGeom] = useState<Geom>(() => readGeom(storageKey));
  const [minimized, setMinimized] = useState(false);
  const [dragging, setDragging] = useState(false);
  const geomRef = useRef(geom);
  geomRef.current = geom;

  useEffect(() => {
    writeGeom(storageKey, geom);
  }, [geom, storageKey]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

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
        clampGeom({
          ...geomRef.current,
          x: origin.x + mx,
          y: origin.y + my,
        }),
      );
      if (last) setDragging(false);
      return origin;
    },
    { filterTaps: true, pointer: { touch: true } },
  );

  const bindResize = useDrag(
    ({ first, last, movement: [mx, my], memo }) => {
      if (first) {
        setDragging(true);
        return { w: geomRef.current.w, h: geomRef.current.h };
      }
      const origin = memo as { w: number; h: number };
      setGeom(
        clampGeom({
          ...geomRef.current,
          w: origin.w + mx,
          h: origin.h + my,
        }),
      );
      if (last) setDragging(false);
      return origin;
    },
    { filterTaps: true, pointer: { touch: true } },
  );

  if (!open || typeof document === "undefined") return null;

  const body = (
    <div
      className={`rp-float ${minimized ? "minimized" : ""} ${dragging ? "dragging" : ""}`}
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
      <header className="rp-float-title" {...bindMove()}>
        <span className="rp-float-title-text">
          {title}
          {unread > 0 && !minimized && (
            <span className="rp-float-unread">{unread > 9 ? "9+" : unread}</span>
          )}
        </span>
        <div className="rp-float-actions">
          <button
            type="button"
            className="rp-float-btn"
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
            className="rp-float-btn"
            title="Закрыть (Esc)"
            onClick={() => onOpenChange(false)}
          >
            <X size={14} strokeWidth={2} />
          </button>
        </div>
      </header>
      {!minimized && (
        <>
          <div className="rp-float-body">
            {children ?? <RpChat {...chatProps} layout="fill" />}
          </div>
          <div
            className="rp-float-resize"
            title="Потяни за угол"
            {...bindResize()}
          />
        </>
      )}
    </div>
  );

  return createPortal(body, document.body);
}

/** Compact launcher chip (topbar / dock). */
export function RpFloatLauncher({
  open,
  onToggle,
  unread = 0,
  label = "RP",
}: {
  open: boolean;
  onToggle: () => void;
  unread?: number;
  label?: string;
}) {
  return (
    <button
      type="button"
      className={`rp-float-launcher ${open ? "on" : ""}`}
      onClick={onToggle}
      title="Окно RP-чата"
    >
      {label}
      {unread > 0 && !open && (
        <span className="rp-float-unread">{unread > 9 ? "9+" : unread}</span>
      )}
    </button>
  );
}
