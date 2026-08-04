import { useEffect, useRef } from "react";

type CanvasRevealEffectProps = {
  /** Higher = faster expand. Typical 2–5 for hover reveal. */
  animationSpeed?: number;
  colors?: number[][];
  dotSize?: number;
  className?: string;
  showGradient?: boolean;
  /** When false, pause the loop (e.g. reduced motion / unmounted hover). */
  active?: boolean;
};

/**
 * Lightweight 2D port of Aceternity CanvasRevealEffect (no three.js).
 * Expanding dot-matrix reveal for drop-zone / card hover highlights.
 */
export function CanvasRevealEffect({
  animationSpeed = 3,
  colors = [[0, 255, 255]],
  dotSize = 2,
  className = "",
  showGradient = true,
  active = true,
}: CanvasRevealEffectProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let start = performance.now();
    let running = true;

    const resize = () => {
      const r = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(r.width * dpr));
      canvas.height = Math.max(1, Math.floor(r.height * dpr));
      canvas.style.width = `${r.width}px`;
      canvas.style.height = `${r.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const cell = Math.max(6, dotSize * 3);
    const palette = colors.length ? colors : [[0, 255, 255]];

    const hash = (x: number, y: number) => {
      const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
      return n - Math.floor(n);
    };

    const draw = (now: number) => {
      if (!running) return;
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      ctx.clearRect(0, 0, w, h);

      const t = ((now - start) / 1000) * animationSpeed;
      const cx = w / 2;
      const cy = h / 2;
      const maxDist = Math.hypot(cx, cy) + cell;

      for (let y = cell / 2; y < h; y += cell) {
        for (let x = cell / 2; x < w; x += cell) {
          const dist = Math.hypot(x - cx, y - cy);
          const intro = dist / maxDist + hash(x, y) * 0.18;
          if (t < intro) continue;
          const fade = Math.min(1, (t - intro) * 4);
          const c = palette[Math.floor(hash(x + 1, y) * palette.length) % palette.length];
          const a = (0.25 + hash(y, x) * 0.75) * fade;
          ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${a.toFixed(3)})`;
          const s = dotSize * (0.7 + hash(x, y + 3) * 0.6);
          ctx.fillRect(x - s / 2, y - s / 2, s, s);
        }
      }
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [active, animationSpeed, colors, dotSize]);

  return (
    <div
      ref={wrapRef}
      className={`canvas-reveal ${className}`.trim()}
      aria-hidden
    >
      <canvas ref={canvasRef} className="canvas-reveal__canvas" />
      {showGradient && <div className="canvas-reveal__fade" />}
    </div>
  );
}
