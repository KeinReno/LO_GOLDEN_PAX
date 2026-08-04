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
  const paletteKey = colors.map((c) => c.join(",")).join("|");

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let raf = 0;
    let start = performance.now();
    let running = true;
    let lastW = 0;
    let lastH = 0;

    const resize = () => {
      const r = wrap.getBoundingClientRect();
      const w = Math.max(1, Math.floor(r.width));
      const h = Math.max(1, Math.floor(r.height));
      if (w === lastW && h === lastH) return;
      lastW = w;
      lastH = h;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    const ro = new ResizeObserver(() => {
      // Avoid feedback loops during parent height animations.
      if (!running) return;
      resize();
    });
    ro.observe(wrap);

    const cell = Math.max(8, dotSize * 3);
    const palette = colors.length ? colors : [[0, 255, 255]];

    const hash = (x: number, y: number) => {
      const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
      return n - Math.floor(n);
    };

    const draw = (now: number) => {
      if (!running) return;
      const w = lastW || wrap.clientWidth;
      const h = lastH || wrap.clientHeight;
      if (w < 2 || h < 2) {
        raf = requestAnimationFrame(draw);
        return;
      }
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
          const c =
            palette[Math.floor(hash(x + 1, y) * palette.length) % palette.length];
          const a = (0.25 + hash(y, x) * 0.75) * fade;
          ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${a.toFixed(3)})`;
          const s = dotSize * (0.7 + hash(x, y + 3) * 0.6);
          ctx.fillRect(x - s / 2, y - s / 2, s, s);
        }
      }
      // Cap: after reveal settles, stop the loop to avoid permanent GPU load.
      if (t > 2.8) {
        running = false;
        return;
      }
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
    // paletteKey avoids re-running when colors array identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, animationSpeed, paletteKey, dotSize]);

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
