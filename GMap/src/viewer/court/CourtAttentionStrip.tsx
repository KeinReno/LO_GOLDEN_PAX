import { motion } from "motion/react";
import type { CourtTabId } from "./courtTabs";
import type { CourtAttentionItem } from "./courtAttention";

export function CourtAttentionStrip({
  items,
  onJump,
}: {
  items: CourtAttentionItem[];
  onJump?: (tab: CourtTabId) => void;
}) {
  if (items.length === 0) return null;
  return (
    <ul className="court-attention-strip" aria-label="Внимание двора">
      {items.map((item, i) => (
        <motion.li
          key={item.id}
          className={`court-attention-chip court-attention-chip--${item.tone || "info"}`}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: Math.min(i, 4) * 0.04 }}
        >
          {item.jump && onJump ? (
            <button
              type="button"
              className="court-attention-chip__btn"
              onClick={() => onJump(item.jump!)}
            >
              {item.text}
            </button>
          ) : (
            <span>{item.text}</span>
          )}
        </motion.li>
      ))}
    </ul>
  );
}
