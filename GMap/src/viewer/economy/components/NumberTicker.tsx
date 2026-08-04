import { useEffect, useRef, useState } from "react";

type Props = {
  value: number;
  className?: string;
  /** Format: signed income/expense or plain. */
  format?: (n: number) => string;
  durationMs?: number;
};

/**
 * NumberTicker-style count — respects prefers-reduced-motion.
 */
export function NumberTicker({
  value,
  className,
  format = (n) => String(Math.round(n)),
  durationMs = 420,
}: Props) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (reduced) {
      setDisplay(value);
      fromRef.current = value;
      return;
    }
    const from = fromRef.current;
    const to = value;
    if (from === to) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - (1 - t) ** 3;
      setDisplay(from + (to - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs, reduced]);

  return (
    <span className={className} aria-label={format(value)}>
      {format(display)}
    </span>
  );
}
