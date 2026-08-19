import { useEffect, useRef } from "react";

function usePrefersReducedMotion(): boolean {
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  return Boolean(reduced);
}

function LoginBeams() {
  return (
    <svg
      className="login-beams"
      viewBox="0 0 800 600"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      <path d="M-50 80 L200 320 L450 120" stroke="url(#login-beam-a)" strokeWidth="1.2" />
      <path d="M100 600 L350 280 L650 480" stroke="url(#login-beam-b)" strokeWidth="1" opacity="0.7" />
      <path d="M750 0 L520 260 L780 420" stroke="url(#login-beam-a)" strokeWidth="0.8" opacity="0.55" />
      <path d="M40 240 L280 80 L520 260" stroke="url(#login-beam-b)" strokeWidth="0.7" opacity="0.35" />
      <defs>
        <linearGradient id="login-beam-a" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="var(--accent)" stopOpacity="0" />
          <stop offset="0.5" stopColor="var(--accent-holo)" stopOpacity="0.45" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="login-beam-b" x1="0" y1="1" x2="1" y2="0">
          <stop stopColor="var(--accent-holo)" stopOpacity="0" />
          <stop offset="0.5" stopColor="var(--accent)" stopOpacity="0.32" />
          <stop offset="1" stopColor="var(--accent-holo)" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function LoginSparkles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const density = reduced ? 18 : 56;
    const particles = Array.from({ length: density }, (_, i) => ({
      x: Math.random(),
      y: Math.random(),
      r: 0.4 + Math.random() * 0.9,
      a: 0.18 + Math.random() * 0.5,
      vx: (Math.random() - 0.5) * 0.003,
      vy: (Math.random() - 0.5) * 0.003,
      gold: i % 3 !== 0,
    }));

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
    };
    resize();
    const ro = new ResizeObserver(resize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    let frame = 0;
    let raf = 0;
    const draw = () => {
      frame += 1;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of particles) {
        if (!reduced) {
          p.x += p.vx;
          p.y += p.vy;
          if (p.x < 0 || p.x > 1) p.vx *= -1;
          if (p.y < 0 || p.y > 1) p.vy *= -1;
        }
        const twinkle = reduced
          ? p.a
          : p.a * (0.65 + 0.35 * Math.sin(frame * 0.035 + p.x * 18));
        ctx.beginPath();
        ctx.arc(p.x * canvas.width, p.y * canvas.height, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.gold ? "#c9a227" : "#7a9bb8";
        ctx.globalAlpha = twinkle;
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (!reduced) raf = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [reduced]);

  return <canvas ref={canvasRef} className="login-sparkles" aria-hidden />;
}

export function LoginAtmosphere() {
  return (
    <div className="login-atmosphere" aria-hidden>
      <LoginBeams />
      <LoginSparkles />
    </div>
  );
}
