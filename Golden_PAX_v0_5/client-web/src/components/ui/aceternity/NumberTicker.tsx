import { useEffect, useRef } from "react";
import { useInView, useMotionValue, useSpring } from "framer-motion";
import { cn } from "../../../lib/utils";

type NumberTickerProps = {
  value: number;
  className?: string;
  decimalPlaces?: number;
};

/** Aceternity NumberTicker — spring-animated stat readout. */
export function NumberTicker({ value, className, decimalPlaces = 0 }: NumberTickerProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const motionValue = useMotionValue(0);
  const spring = useSpring(motionValue, { damping: 28, stiffness: 120 });
  const inView = useInView(ref, { once: true, margin: "-20px" });

  useEffect(() => {
    if (inView) motionValue.set(value);
    else motionValue.set(0);
  }, [inView, motionValue, value]);

  useEffect(() => {
    const unsub = spring.on("change", (latest) => {
      if (ref.current) {
        ref.current.textContent = latest.toFixed(decimalPlaces);
      }
    });
    return unsub;
  }, [spring, decimalPlaces]);

  return (
    <span ref={ref} className={cn("gp-mono inline-block tabular-nums", className)}>
      0
    </span>
  );
}
