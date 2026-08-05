import { motion, useReducedMotion } from "motion/react";
import type { Legion, ShipGroup } from "../../state/types";
import { CometCard } from "../quests/CometCard";
import { STANCE_ICONS, STANCE_LABELS } from "./constants";
import {
  deckBattlePreview,
  formatUpkeepShort,
  compositionUpkeep,
  type ForceEngagementHit,
} from "../../state/forceReadiness";

export function LegionCover({
  legion,
  systemName,
  onOpen,
  engagements,
}: {
  legion: Legion;
  systemName: string;
  onOpen: () => void;
  engagements?: ForceEngagementHit[];
}) {
  const reduce = useReducedMotion();
  const composition =
    Array.isArray(legion.composition) && legion.composition.length
      ? (legion.composition as ShipGroup[])
      : [
          {
            type: "unit.generic_line",
            defId: "unit.generic_line",
            count: Math.max(1, Math.round(legion.strength || 1)),
          },
        ];
  const units = composition.reduce((s, g) => s + (g.count ?? 0), 0);
  const isSynthetic =
    !Array.isArray(legion.composition) || legion.composition.length === 0;
  const isMoving = (legion.route?.length ?? 0) > 0;
  const status = legion.status ?? "idle";
  const StanceIcon = STANCE_ICONS[status] ?? STANCE_ICONS.idle;
  const stanceLabel = STANCE_LABELS[status] ?? status;
  const preview = deckBattlePreview(composition);
  const upkeep = compositionUpkeep(composition, "legion");
  const inBattle = (engagements?.length ?? 0) > 0;

  return (
    <CometCard className="forces-cover-comet" rotateDepth={10} disabled={!!reduce}>
      <motion.button
        type="button"
        className={`forces-cover forces-cover--legion${inBattle ? " is-battle" : ""}`}
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
          {inBattle && <span className="forces-battle-badge">В БОЮ</span>}
          <strong className="forces-cover-name">{legion.name}</strong>
          <span className="forces-cover-meta">{systemName}</span>
          <span className="forces-cover-count">
            сила{" "}
            <span className="forces-cover-count-num">
              {legion.strength ?? units}
            </span>
            {units > 0 ? ` · ${units} отр.` : null}
            {preview.cardCount > 0 ? (
              <span className="forces-cover-deck"> · колода {preview.cardCount}</span>
            ) : null}
          </span>
          <span className="forces-cover-roles">
            {preview.roles.slice(0, 4).map((r) => (
              <span key={r.role} className="forces-role-chip is-mini">
                {r.label}×{r.count}
              </span>
            ))}
          </span>
          <span className="forces-cover-upkeep">{formatUpkeepShort(upkeep)}</span>
          {isSynthetic && (
            <span className="forces-cover-warn" title="Нет отрядов в составе — бой использует силу как заглушку">
              состав-заглушка
            </span>
          )}
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
