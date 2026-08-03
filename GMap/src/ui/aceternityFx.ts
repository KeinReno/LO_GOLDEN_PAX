import { useCallback, type MouseEvent } from "react";

/**
 * Aceternity "Card Spotlight" port — radial gradient follows the pointer.
 * Attach the returned handlers to any element with class `fx-spotlight`.
 * Reads --fx-spot-color (defaults to accent) and --fx-spot-size.
 *
 * Usage:
 *   const sp = useSpotlight();
 *   <button className="fx-spotlight" {...sp.bind} style={{ "--fx-spot-color": catColor }}>
 */
export function useSpotlight() {
  const onMove = useCallback((e: MouseEvent<HTMLElement>) => {
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
 * Aceternity "3D Card Effect" port — pointer-driven tilt with spring settle.
 * Returns bind handlers + a ref. Element needs class `fx-tilt` and an inner
 * layer with `fx-tilt-inner` (translates in Z for parallax).
 */
export function useTilt(max = 8) {
  const onMove = useCallback(
    (e: MouseEvent<HTMLElement>) => {
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
