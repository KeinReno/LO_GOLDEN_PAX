import { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "../../../lib/utils";

type CanvasRevealEffectProps = {
  children: ReactNode;
  className?: string;
  /** Run reveal animation once on mount. */
  once?: boolean;
  /** Duration ms before canvas fades out. */
  durationMs?: number;
};

/**
 * Aceternity Canvas Reveal Effect (adapted) — dot-matrix wipe, single play.
 * Not tied to map pan; use for login→table or dossier open only.
 */
export function CanvasRevealEffect({
  children,
  className,
  once = true,
  durationMs = 700,
}: CanvasRevealEffectProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [done, setDone] = useState(false);
  const playedRef = useRef(false);

  useEffect(() => {
    if (once && playedRef.current) {
      setDone(true);
      return;
    }
    playedRef.current = true;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let start = 0;
    const dots: { x: number; y: number; delay: number }[] = [];
    const cols = 24;
    const rows = 16;

    const resize = () => {
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
      dots.length = 0;
      for (let y = 0; y < rows; y += 1) {
        for (let x = 0; x < cols; x += 1) {
          dots.push({
            x: ((x + 0.5) / cols) * canvas.width,
            y: ((y + 0.5) / rows) * canvas.height,
            delay: (x + y) * 18,
          });
        }
      }
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(parent);

    const draw = (ts: number) => {
      if (!start) start = ts;
      const elapsed = ts - start;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const d of dots) {
        const t = Math.max(0, elapsed - d.delay);
        const p = Math.min(1, t / 280);
        if (p <= 0) continue;
        const alpha = 1 - p;
        if (alpha <= 0) continue;
        ctx.fillStyle = `rgba(34, 211, 238, ${alpha * 0.35})`;
        ctx.beginPath();
        ctx.arc(d.x, d.y, 2.2 * p, 0, Math.PI * 2);
        ctx.fill();
      }

      if (elapsed < durationMs) {
        raf = requestAnimationFrame(draw);
      } else {
        setDone(true);
      }
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [durationMs, once]);

  return (
    <div className={cn("relative h-full w-full", className)}>
      {!done && (
        <canvas
          ref={canvasRef}
          className="pointer-events-none absolute inset-0 z-30 h-full w-full"
          aria-hidden
        />
      )}
      <div className={cn("h-full w-full transition-opacity duration-300", !done && "opacity-0")}>
        {children}
      </div>
    </div>
  );
}
