import { type MouseEvent, type ReactNode } from "react";
import { motion, useMotionTemplate, useMotionValue } from "framer-motion";
import { cn } from "../../../lib/utils";

type CardSpotlightProps = {
  children: ReactNode;
  className?: string;
  radius?: number;
  color?: string;
};

/** Aceternity Card Spotlight — radial follow cursor. */
export function CardSpotlight({
  children,
  className,
  radius = 280,
  color = "rgba(34, 211, 238, 0.12)",
}: CardSpotlightProps) {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  function handleMouseMove(e: MouseEvent<HTMLDivElement>) {
    const { left, top } = e.currentTarget.getBoundingClientRect();
    mouseX.set(e.clientX - left);
    mouseY.set(e.clientY - top);
  }

  const background = useMotionTemplate`radial-gradient(${radius}px circle at ${mouseX}px ${mouseY}px, ${color}, transparent 72%)`;

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl border border-cyan-500/15 bg-slate-950/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
        className,
      )}
      onMouseMove={handleMouseMove}
    >
      <motion.div
        className="pointer-events-none absolute -inset-px rounded-xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
