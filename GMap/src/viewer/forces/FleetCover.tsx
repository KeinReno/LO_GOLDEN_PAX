import { motion, useReducedMotion } from "motion/react";
import type { Fleet } from "../../state/types";
import { CometCard } from "../quests/CometCard";
import { STANCE_ICONS, STANCE_LABELS } from "./constants";

export function FleetCover({
  fleet,
  systemName,
  onOpen,
}: {
  fleet: Fleet;
  systemName: string;
  onOpen: () => void;
}) {
  const reduce = useReducedMotion();
  const totalUnits = (fleet.composition ?? []).reduce(
    (s, g) => s + (g.count ?? 0),
    0,
  );
  const isMoving = (fleet.route?.length ?? 0) > 0;
  const StanceIcon = STANCE_ICONS[fleet.stance] ?? STANCE_ICONS.idle;
  const stanceLabel = STANCE_LABELS[fleet.stance] ?? fleet.stance;

  return (
    <CometCard className="forces-cover-comet" rotateDepth={10} disabled={!!reduce}>
      <motion.button
        type="button"
        className="forces-cover forces-cover--fleet"
        onClick={onOpen}
        whileHover={reduce ? undefined : { y: -4, scale: 1.02 }}
        whileTap={reduce ? undefined : { scale: 0.97 }}
        initial={reduce ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 28 }}
        aria-label={`Открыть флот ${fleet.name}`}
      >
        <span className="forces-cover-pattern" aria-hidden />
        <span className="forces-cover-body">
          <span className="forces-cover-stance" title={stanceLabel}>
            <StanceIcon size={18} strokeWidth={1.75} aria-hidden />
            <span>{stanceLabel}</span>
          </span>
          <strong className="forces-cover-name">{fleet.name}</strong>
          <span className="forces-cover-meta">{systemName}</span>
          <span className="forces-cover-count">
            <span className="forces-cover-count-num">{totalUnits}</span> юнитов
          </span>
          {isMoving && (
            <span className="forces-cover-moving" aria-live="polite">
              В ДВИЖЕНИИ
            </span>
          )}
        </span>
      </motion.button>
    </CometCard>
  );
}
