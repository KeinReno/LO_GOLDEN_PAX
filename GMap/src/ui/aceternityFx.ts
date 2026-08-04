import { useCallback, type MouseEvent } from "react";

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Aceternity "Card Spotlight" port — radial gradient follows the pointer.
 * Attach handlers to any element with class `fx-spotlight`.
 * Color: `--fx-spot-color` (default imperial gold / accent-holo).
 *
 * Usage:
 *   const sp = useSpotlight();
 *   <button className="fx-spotlight" {...sp.bind}>
 */
export function useSpotlight() {
  const onMove = useCallback((e: MouseEvent<HTMLElement>) => {
    if (prefersReducedMotion()) return;
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mouse-x", `${e.clientX - r.left}px`);
    el.style.setProperty("--mouse-y", `${e.clientY - r.top}px`);
  }, []);
  const onLeave = useCallback((e: MouseEvent<HTMLElement>) => {
    const el = e.currentTarget;
    el.style.setProperty("--mouse-x", `-9999px`);
    el.style.setProperty("--mouse-y", `-9999px`);
  }, []);
  return { bind: { onMouseMove: onMove, onMouseLeave: onLeave } };
}

/**
 * Aceternity "3D Card Effect" port — pointer-driven tilt.
 * Disabled under prefers-reduced-motion.
 */
export function useTilt(max = 8) {
  const onMove = useCallback(
    (e: MouseEvent<HTMLElement>) => {
      if (prefersReducedMotion()) return;
      const el = e.currentTarget;
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      el.style.setProperty("--tilt-x", `${(-py * max).toFixed(2)}deg`);
      el.style.setProperty("--tilt-y", `${(px * max).toFixed(2)}deg`);
    },
    [max],
  );
  const onLeave = useCallback((e: MouseEvent<HTMLElement>) => {
    const el = e.currentTarget;
    el.style.setProperty("--tilt-x", `0deg`);
    el.style.setProperty("--tilt-y", `0deg`);
  }, []);
  return { bind: { onMouseMove: onMove, onMouseLeave: onLeave } };
}
