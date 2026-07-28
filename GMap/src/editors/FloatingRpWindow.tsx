import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { Minus, Square, X } from "lucide-react";
import { RpChat, type RpChatProps } from "./RpChat";

type Geom = { x: number; y: number; w: number; h: number };

const DEFAULT_GEOM: Geom = { x: 72, y: 72, w: 400, h: 520 };
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
};

/** Draggable + resizable floating RP chat window. */
export function FloatingRpWindow({
  open,
  onOpenChange,
  title = "Сцена · мастер",
  storageKey = "gmap-rp-float-geom",
  unread = 0,
  zIndex = 220,
  ...chatProps
}: FloatingRpWindowProps) {
  const [geom, setGeom] = useState<Geom>(() => readGeom(storageKey));
  const [minimized, setMinimized] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{
    kind: "move" | "resize";
    ox: number;
    oy: number;
    sx: number;
    sy: number;
    sw: number;
    sh: number;
  } | null>(null);
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

  const onPointerMove = useCallback((e: PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    if (d.kind === "move") {
      setGeom(
        clampGeom({
          ...geomRef.current,
          x: d.sx + (e.clientX - d.ox),
          y: d.sy + (e.clientY - d.oy),
        }),
      );
    } else {
      setGeom(
        clampGeom({
          ...geomRef.current,
          w: d.sw + (e.clientX - d.ox),
          h: d.sh + (e.clientY - d.oy),
        }),
      );
    }
  }, []);

  const endDrag = useCallback(() => {
    dragRef.current = null;
    setDragging(false);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", endDrag);
  }, [onPointerMove]);

  const startMove = (e: ReactPointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    dragRef.current = {
      kind: "move",
      ox: e.clientX,
      oy: e.clientY,
      sx: geom.x,
      sy: geom.y,
      sw: geom.w,
      sh: geom.h,
    };
    setDragging(true);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", endDrag);
  };

  const startResize = (e: ReactPointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = {
      kind: "resize",
      ox: e.clientX,
      oy: e.clientY,
      sx: geom.x,
      sy: geom.y,
      sw: geom.w,
      sh: geom.h,
    };
    setDragging(true);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", endDrag);
  };

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
      <header className="rp-float-title" onPointerDown={startMove}>
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
            <RpChat {...chatProps} layout="fill" />
          </div>
          <div
            className="rp-float-resize"
            onPointerDown={startResize}
            title="Потяни за угол"
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
