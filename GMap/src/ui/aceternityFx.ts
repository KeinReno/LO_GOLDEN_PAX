import {
  useCallback,
  useRef,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { isLikelyMobile } from "../viewer/useViewerViewport";

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

/** Skip pointer-driven polish on touch-first viewports (saves CPU + avoids sticky hover). */
function skipPointerFx(): boolean {
  return prefersReducedMotion() || isLikelyMobile();
}

/**
 * Aceternity "Card Spotlight" port — radial gradient follows the pointer.
 * Attach handlers to any element with class `fx-spotlight`.
 */
export function useSpotlight() {
  const onMove = useCallback((e: MouseEvent<HTMLElement>) => {
    if (skipPointerFx()) return;
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
 */
export function useTilt(max = 8) {
  const onMove = useCallback(
    (e: MouseEvent<HTMLElement>) => {
      if (skipPointerFx()) return;
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

/**
 * Aceternity "Magnetic Button" — element drifts toward pointer within a radius.
 * Apply class `fx-magnetic` (uses --mag-x / --mag-y).
 */
export function useMagnetic(strength = 0.28, radius = 90) {
  const onMove = useCallback(
    (e: MouseEvent<HTMLElement>) => {
      if (skipPointerFx()) return;
      const el = e.currentTarget;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.hypot(dx, dy);
      if (dist > radius) {
        el.style.setProperty("--mag-x", "0px");
        el.style.setProperty("--mag-y", "0px");
        return;
      }
      el.style.setProperty("--mag-x", `${(dx * strength).toFixed(1)}px`);
      el.style.setProperty("--mag-y", `${(dy * strength).toFixed(1)}px`);
    },
    [radius, strength],
  );
  const onLeave = useCallback((e: MouseEvent<HTMLElement>) => {
    const el = e.currentTarget;
    el.style.setProperty("--mag-x", "0px");
    el.style.setProperty("--mag-y", "0px");
  }, []);
  return { bind: { onMouseMove: onMove, onMouseLeave: onLeave } };
}

/**
 * Click ripple (Background Ripple lite). Spawns a temporary span in the element.
 * Element should be `position: relative; overflow: hidden`.
 */
export function useRipple() {
  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    if (prefersReducedMotion()) return;
    if (e.button !== 0) return;
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const size = Math.max(r.width, r.height) * 1.35;
    const rip = document.createElement("span");
    rip.className = "fx-ripple";
    rip.style.left = `${x - size / 2}px`;
    rip.style.top = `${y - size / 2}px`;
    rip.style.width = `${size}px`;
    rip.style.height = `${size}px`;
    el.appendChild(rip);
    window.setTimeout(() => rip.remove(), 650);
  }, []);
  return { bind: { onPointerDown } };
}

/** Soft pointer parallax for a stage (sets --par-x / --par-y in % of half-size). */
export function usePointerParallax(intensity = 6) {
  const ref = useRef<HTMLDivElement | null>(null);
  const onMove = useCallback(
    (e: MouseEvent<HTMLElement>) => {
      if (skipPointerFx()) return;
      const el = ref.current ?? e.currentTarget;
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      el.style.setProperty("--par-x", `${(px * intensity).toFixed(2)}px`);
      el.style.setProperty("--par-y", `${(py * intensity).toFixed(2)}px`);
    },
    [intensity],
  );
  const onLeave = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--par-x", "0px");
    el.style.setProperty("--par-y", "0px");
  }, []);
  return {
    ref,
    bind: { onMouseMove: onMove, onMouseLeave: onLeave },
    style: {
      ["--par-x" as string]: "0px",
      ["--par-y" as string]: "0px",
    } as CSSProperties,
  };
}
