import { motion, useReducedMotion } from "motion/react";
import type { Legion } from "../../state/types";
import { CometCard } from "../quests/CometCard";
import { STANCE_ICONS, STANCE_LABELS } from "./constants";

export function LegionCover({
  legion,
  systemName,
  onOpen,
}: {
  legion: Legion;
  systemName: string;
  onOpen: () => void;
}) {
  const reduce = useReducedMotion();
  const units = (legion.composition ?? []).reduce(
    (s, g) => s + (g.count ?? 0),
    0,
  );
  const isMoving = (legion.route?.length ?? 0) > 0;
  const status = legion.status ?? "idle";
  const StanceIcon = STANCE_ICONS[status] ?? STANCE_ICONS.idle;
  const stanceLabel = STANCE_LABELS[status] ?? status;

  return (
    <CometCard className="forces-cover-comet" rotateDepth={10} disabled={!!reduce}>
      <motion.button
        type="button"
        className="forces-cover forces-cover--legion"
        onClick={onOpen}
        whileHover={reduce ? undefined : { y: -4, scale: 1.02 }}
        whileTap={reduce ? undefined : { scale: 0.97 }}
        initial={reduce ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 28 }}
        aria-label={`Открыть легион ${legion.name}`}
      >
        <span className="forces-cover-pattern" aria-hidden />
        <span className="forces-cover-body">
          <span className="forces-cover-stance" title={stanceLabel}>
            <StanceIcon size={18} strokeWidth={1.75} aria-hidden />
            <span>{stanceLabel}</span>
          </span>
          <strong className="forces-cover-name">{legion.name}</strong>
          <span className="forces-cover-meta">{systemName}</span>
          <span className="forces-cover-count">
            сила{" "}
            <span className="forces-cover-count-num">
              {legion.strength ?? "—"}
            </span>
            {units > 0 ? ` · ${units} отр.` : null}
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
