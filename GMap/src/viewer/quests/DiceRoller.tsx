import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";

export type QuestDiceRollerProps = {
  sides?: number;
  /** Known final face (server). When omitted and rolling starts via trigger, rolls client-side. */
  value?: number;
  rolling?: boolean;
  label?: string;
  className?: string;
  onSettled?: (value: number) => void;
  /** Spec API: called once when a fresh roll completes. */
  onResult?: (value: number) => void;
};

/**
 * Animated dN with shake → settle. Prefer server `value` when available.
 * Callbacks are held in refs so parent re-renders don't cancel the RAF loop.
 */
export function QuestDiceRoller({
  sides = 6,
  value,
  rolling = false,
  label,
  className = "",
  onSettled,
  onResult,
}: QuestDiceRollerProps) {
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(value ?? 1);
  const [spinning, setSpinning] = useState(false);
  const settledRef = useRef(onSettled);
  const resultRef = useRef(onResult);
  settledRef.current = onSettled;
  resultRef.current = onResult;
  const runIdRef = useRef(0);

  useEffect(() => {
    if (!rolling) {
      if (value != null) setDisplay(value);
      setSpinning(false);
      return;
    }

    const final =
      value ?? 1 + Math.floor(Math.random() * Math.max(1, sides));
    const runId = ++runIdRef.current;

    if (reduce) {
      setDisplay(final);
      setSpinning(false);
      settledRef.current?.(final);
      resultRef.current?.(final);
      return;
    }

    setSpinning(true);
    const start = performance.now();
    const duration = 1400;
    let raf = 0;
    const tick = (t: number) => {
      if (runId !== runIdRef.current) return;
      const elapsed = t - start;
      if (elapsed < duration) {
        setDisplay(1 + Math.floor(Math.random() * Math.max(1, sides)));
        raf = requestAnimationFrame(tick);
      } else {
        setDisplay(final);
        setSpinning(false);
        settledRef.current?.(final);
        resultRef.current?.(final);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      // Invalidate only if this effect is genuinely replaced mid-roll
      // (deps changed). Parent callback identity must NOT be a dep.
    };
  }, [rolling, value, sides, reduce]);

  return (
    <div
      className={`quest-dice ${spinning ? "is-rolling" : "is-settled"} ${className}`.trim()}
      aria-live="polite"
      aria-label={label ?? `Кубик d${sides}: ${display}`}
    >
      {label ? <p className="quest-dice__label">{label}</p> : null}
      <motion.div
        className="quest-dice__cube"
        animate={
          spinning
            ? { rotate: [0, 25, -20, 15, -10, 0], scale: [1, 1.08, 0.96, 1.04, 1] }
            : { rotate: 0, scale: 1 }
        }
        transition={
          spinning
            ? { duration: 0.35, repeat: 3, ease: "easeInOut" }
            : { type: "spring", stiffness: 420, damping: 18 }
        }
      >
        <span className="quest-dice__face">{display}</span>
      </motion.div>
      <p className="quest-dice__result" data-reveal={!spinning || undefined}>
        {spinning ? "…" : display}
      </p>
    </div>
  );
}
