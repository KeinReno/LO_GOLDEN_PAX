import {
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactNode,
} from "react";

type HoldRevealButtonProps = {
  children: ReactNode;
  /** Hold duration before commit. */
  holdMs?: number;
  /** Red reveal for demolish / destructive. */
  danger?: boolean;
  disabled?: boolean;
  className?: string;
  title?: string;
  /** Fired once when hold reaches 100%. */
  onHoldComplete: () => void;
  /** Fired when press starts (e.g. select card). */
  onPressStart?: () => void;
  /** If pointer moves this far, cancel hold (drag). */
  moveCancelPx?: number;
  onMoveCancel?: (clientX: number, clientY: number) => void;
} & Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "onClick" | "children" | "disabled" | "className" | "title"
>;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Hold-to-confirm with a canvas-reveal-like expanding dot veil.
 * Plain click does not commit — must hold (shorter if reduced-motion).
 */
export function HoldRevealButton({
  children,
  holdMs = 700,
  danger = false,
  disabled,
  className,
  title,
  style,
  onHoldComplete,
  onPressStart,
  moveCancelPx,
  onMoveCancel,
  ...rest
}: HoldRevealButtonProps) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const rafRef = useRef(0);
  const startRef = useRef(0);
  const originPt = useRef({ x: 0, y: 0 });
  const doneRef = useRef(false);
  const activeRef = useRef(false);
  const progressRef = useRef(0);
  const completeFn = useRef(onHoldComplete);
  completeFn.current = onHoldComplete;

  const [holding, setHolding] = useState(false);
  const [progress, setProgress] = useState(0);
  const [origin, setOrigin] = useState({ x: 50, y: 50 });

  const effectiveMs = prefersReducedMotion() ? Math.min(holdMs, 220) : holdMs;

  const stopRaf = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
  };

  const resetVisual = () => {
    stopRaf();
    startRef.current = 0;
    activeRef.current = false;
    progressRef.current = 0;
    setHolding(false);
    setProgress(0);
  };

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    activeRef.current = false;
    stopRaf();
    setHolding(false);
    setProgress(1);
    try {
      completeFn.current();
    } finally {
      window.setTimeout(() => {
        progressRef.current = 0;
        setProgress(0);
        doneRef.current = false;
      }, 120);
    }
  };

  useEffect(() => () => stopRaf(), []);

  const tick = () => {
    if (!activeRef.current || doneRef.current) return;
    const elapsed = performance.now() - startRef.current;
    const p = Math.min(1, elapsed / effectiveMs);
    progressRef.current = p;
    setProgress(p);
    if (p >= 1) {
      finish();
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  };

  const begin = (clientX: number, clientY: number) => {
    if (disabled || doneRef.current) return;
    const el = btnRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      setOrigin({
        x: ((clientX - r.left) / Math.max(r.width, 1)) * 100,
        y: ((clientY - r.top) / Math.max(r.height, 1)) * 100,
      });
    }
    stopRaf();
    doneRef.current = false;
    activeRef.current = true;
    originPt.current = { x: clientX, y: clientY };
    startRef.current = performance.now();
    progressRef.current = 0;
    setHolding(true);
    setProgress(0);
    onPressStart?.();
    rafRef.current = requestAnimationFrame(tick);
  };

  const cancelHold = () => {
    if (doneRef.current) return;
    resetVisual();
  };

  return (
    <button
      {...rest}
      ref={btnRef}
      type="button"
      disabled={disabled}
      title={title}
      className={[
        "hold-reveal",
        danger ? "hold-reveal--danger" : "hold-reveal--commit",
        holding ? "is-holding" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={
        {
          ...style,
          ["--hold" as string]: progress,
          ["--hold-x" as string]: `${origin.x}%`,
          ["--hold-y" as string]: `${origin.y}%`,
        } as CSSProperties
      }
      aria-busy={holding || undefined}
      onPointerDown={(e) => {
        if (disabled || e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        (e.currentTarget as HTMLButtonElement).setPointerCapture?.(e.pointerId);
        begin(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (!activeRef.current || doneRef.current || moveCancelPx == null) return;
        const dist = Math.hypot(
          e.clientX - originPt.current.x,
          e.clientY - originPt.current.y,
        );
        if (dist > moveCancelPx) {
          cancelHold();
          onMoveCancel?.(e.clientX, e.clientY);
        }
      }}
      onPointerUp={() => {
        if (doneRef.current) return;
        // Near-complete release still commits (jitter / early release).
        if (activeRef.current && progressRef.current >= 0.88) {
          finish();
          return;
        }
        cancelHold();
      }}
      onPointerCancel={cancelHold}
      onLostPointerCapture={() => {
        if (doneRef.current) return;
        if (activeRef.current && progressRef.current >= 0.88) {
          finish();
          return;
        }
        cancelHold();
      }}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          if (!activeRef.current) {
            const r = btnRef.current?.getBoundingClientRect();
            begin(
              (r?.left ?? 0) + (r?.width ?? 0) / 2,
              (r?.top ?? 0) + (r?.height ?? 0) / 2,
            );
          }
        }
      }}
      onKeyUp={(e) => {
        if (e.key === " " || e.key === "Enter") {
          if (doneRef.current) return;
          if (activeRef.current && progressRef.current >= 0.88) {
            finish();
            return;
          }
          cancelHold();
        }
      }}
    >
      <span className="hold-reveal__veil" aria-hidden />
      <span className="hold-reveal__bar" aria-hidden />
      <span className="hold-reveal__content">{children}</span>
      {holding && (
        <span className="hold-reveal__hint" aria-hidden>
          {Math.round(progress * 100)}%
        </span>
      )}
    </button>
  );
}
