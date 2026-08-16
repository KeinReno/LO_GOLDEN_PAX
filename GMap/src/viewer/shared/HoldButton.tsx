import { useCallback, useRef, useState, type ReactNode } from "react";
import { playStaffCue } from "../../audio/staffSfx";
import { GESTURE } from "../../ui/gestureMap";

type Props = {
  children: ReactNode;
  onConfirm: () => void;
  disabled?: boolean;
  className?: string;
  /** Hold duration override (default GESTURE.longPressMs). */
  ms?: number;
  /** Accessible name while holding. */
  holdHint?: string;
  title?: string;
};

/**
 * Intentional friction: press-and-hold to fire irreversible / dangerous actions.
 * Progress fills via CSS --hold-p; reduced-motion → short click still requires hold.
 */
export function HoldButton({
  children,
  onConfirm,
  disabled,
  className = "",
  ms = GESTURE.longPressMs,
  holdHint = "Удерживайте…",
  title,
}: Props) {
  const [progress, setProgress] = useState(0);
  const [holding, setHolding] = useState(false);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef(0);
  const firedRef = useRef(false);

  const stop = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setHolding(false);
    setProgress(0);
    firedRef.current = false;
  }, []);

  const tick = useCallback(() => {
    const elapsed = performance.now() - startRef.current;
    const p = Math.min(1, elapsed / ms);
    setProgress(p);
    if (p >= 1 && !firedRef.current) {
      firedRef.current = true;
      playStaffCue("seal_stamp");
      onConfirm();
      stop();
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [ms, onConfirm, stop]);

  const start = useCallback(() => {
    if (disabled) return;
    firedRef.current = false;
    startRef.current = performance.now();
    setHolding(true);
    setProgress(0);
    rafRef.current = requestAnimationFrame(tick);
  }, [disabled, tick]);

  return (
    <button
      type="button"
      className={`hold-btn ${holding ? "is-holding" : ""} ${className}`.trim()}
      disabled={disabled}
      title={title ?? holdHint}
      aria-label={holding ? holdHint : undefined}
      style={{ ["--hold-p" as string]: String(progress) }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        start();
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onPointerLeave={() => {
        if (holding) stop();
      }}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          if (!holding) start();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === " " || e.key === "Enter") stop();
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className="hold-btn-fill" aria-hidden />
      <span className="hold-btn-label">{children}</span>
    </button>
  );
}
