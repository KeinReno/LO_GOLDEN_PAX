import { useEffect, useRef } from "react";
import { cn } from "../../../lib/utils";

type SparklesProps = {
  className?: string;
  particleColor?: string;
  particleDensity?: number;
  minSize?: number;
  maxSize?: number;
  speed?: number;
};

/** Lightweight canvas sparkles (Aceternity Sparkles pattern, no tsparticles). */
export function Sparkles({
  className,
  particleColor = "#c9a239",
  particleDensity = 60,
  minSize = 0.4,
  maxSize = 1.2,
  speed = 0.15,
}: SparklesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let frame = 0;
    let raf = 0;

    const particles = Array.from({ length: particleDensity }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: minSize + Math.random() * (maxSize - minSize),
      a: 0.15 + Math.random() * 0.55,
      vx: (Math.random() - 0.5) * speed * 0.02,
      vy: (Math.random() - 0.5) * speed * 0.02,
    }));

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement!);

    const draw = () => {
      frame += 1;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > 1) p.vx *= -1;
        if (p.y < 0 || p.y > 1) p.vy *= -1;
        const twinkle = p.a * (0.65 + 0.35 * Math.sin(frame * 0.04 + p.x * 20));
        ctx.beginPath();
        ctx.arc(p.x * canvas.width, p.y * canvas.height, p.r, 0, Math.PI * 2);
        ctx.fillStyle = particleColor;
        ctx.globalAlpha = twinkle;
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [maxSize, minSize, particleColor, particleDensity, speed]);

  return (
    <canvas
      ref={canvasRef}
      className={cn("pointer-events-none absolute inset-0 h-full w-full", className)}
      aria-hidden
    />
  );
}
