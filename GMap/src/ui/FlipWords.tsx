import { AnimatePresence, motion } from "motion/react";

/**
 * Aceternity Flip Words port — word swaps with vertical blur slide.
 */
export function FlipWords({
  word,
  className = "",
  tone,
}: {
  word: string;
  className?: string;
  tone?: "good" | "warm" | "cold" | "bad";
}) {
  const toneCls = tone ? `flip-words--${tone}` : "";
  return (
    <span
      className={["flip-words", toneCls, className].filter(Boolean).join(" ")}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={word}
          className="flip-words__word"
          initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -14, filter: "blur(6px)" }}
          transition={{ duration: 0.32, ease: [0.22, 0.8, 0.22, 1] }}
        >
          {word}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
