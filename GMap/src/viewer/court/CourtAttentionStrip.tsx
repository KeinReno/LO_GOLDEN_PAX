import { motion } from "motion/react";
import type { InternalBloc } from "../../state/types";
import type { CourtTabId } from "./courtTabs";

export type CourtAttentionItem = {
  id: string;
  text: string;
  tone?: "warn" | "info" | "good";
  jump?: CourtTabId;
};

export function buildCourtAttention(opts: {
  ungovernedCount: number;
  vacantHouses: InternalBloc[];
  seated: number;
  seatSlots: number;
  fieldPosted: number;
}): CourtAttentionItem[] {
  const items: CourtAttentionItem[] = [];
  if (opts.ungovernedCount > 0) {
    items.push({
      id: "ungoverned",
      text: `${opts.ungovernedCount} систем без наместника`,
      tone: "warn",
      jump: "field",
    });
  }
  for (const b of opts.vacantHouses.slice(0, 3)) {
    items.push({
      id: `vacant-${b.id}`,
      text: `${b.name}: нет главы`,
      tone: "warn",
      jump: "houses",
    });
  }
  if (opts.seated === 0 && opts.seatSlots > 0) {
    items.push({
      id: "empty-table",
      text: "Стол пуст — посадите советников",
      tone: "info",
      jump: "council",
    });
  }
  if (items.length === 0 && opts.fieldPosted > 0) {
    items.push({
      id: "calm",
      text: "Двор спокоен",
      tone: "good",
    });
  }
  return items;
}

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
