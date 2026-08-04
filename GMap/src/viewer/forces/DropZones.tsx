import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CanvasRevealEffect } from "../../ui/CanvasRevealEffect";
import {
  DROP_ZONES,
  FORGE_METAL_COST,
  type CatalogShip,
  type DropZoneId,
} from "./constants";
import { filledSlotCount } from "./compositionOps";
import { canOutfitUnit } from "./outfitRules";
import type { UnitCardModel } from "./UnitCard";

type DropZonesProps = {
  active: boolean;
  deckKind: "fleet" | "legion";
  draggedCard: UnitCardModel | null;
  catalogItem: CatalogShip | null;
  hoveredZone: DropZoneId | null;
  metalStock: number;
  onHover: (zone: DropZoneId | null) => void;
  canDrop: (
    zone: DropZoneId,
    card: UnitCardModel,
  ) => { ok: boolean; reason?: string };
};

export function canDropZone(
  zone: DropZoneId,
  card: UnitCardModel,
  metalStock: number,
  catalogItem?: CatalogShip | null,
  deckKind: "fleet" | "legion" = "fleet",
): { ok: boolean; reason?: string } {
  switch (zone) {
    case "forge": {
      const level = card.level ?? 0;
      if (level >= 5) return { ok: false, reason: "Максимальный ранг" };
      const ok = metalStock >= FORGE_METAL_COST;
      return {
        ok,
        reason: ok ? undefined : `Нужно ${FORGE_METAL_COST} металла`,
      };
    }
    case "disband":
      return { ok: true };
    case "reserve":
      return { ok: card.count > 0 };
    case "equip": {
      if (!canOutfitUnit(catalogItem, deckKind)) {
        return {
          ok: false,
          reason:
            deckKind === "legion"
              ? "Пехоте оснащение не нужно"
              : "Нет модульных слотов",
        };
      }
      const slots = catalogItem?.slots ?? [];
      const filled = filledSlotCount(card);
      return {
        ok: true,
        reason:
          filled >= slots.length
            ? "Все слоты заняты — можно заменить"
            : undefined,
      };
    }
    default:
      return { ok: false, reason: "Неизвестная зона" };
  }
}

export function DropZones({
  active,
  deckKind,
  draggedCard,
  catalogItem,
  hoveredZone,
  metalStock,
  onHover,
  canDrop,
}: DropZonesProps) {
  const reduce = useReducedMotion();

  const zones = DROP_ZONES.filter((zone) => {
    if (zone.id !== "equip") return true;
    return canOutfitUnit(catalogItem, deckKind);
  });

  return (
    <AnimatePresence>
      {active && draggedCard && (
        <motion.div
          className="forces-drop-zones"
          initial={reduce ? false : { opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={reduce ? undefined : { opacity: 0, height: 0 }}
          transition={{ duration: 0.2 }}
        >
          {zones.map((zone) => {
            const { ok, reason } = canDrop(zone.id, draggedCard);
            const isHovered = hoveredZone === zone.id;
            const Icon = zone.Icon;
            const hint =
              !ok && reason
                ? reason
                : zone.id === "forge"
                  ? `${zone.hint} · −${FORGE_METAL_COST} мет. (${metalStock})`
                  : zone.id === "equip" && catalogItem
                    ? `${zone.hint} · ${Object.keys(draggedCard.filledSlots ?? {}).length}/${catalogItem.slots?.length ?? 0}`
                    : zone.hint;
            return (
              <div
                key={zone.id}
                data-drop-zone={zone.id}
                className={[
                  "forces-drop-zone",
                  ok ? "" : "is-disabled",
                  isHovered && ok ? "is-hovered" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onPointerEnter={() => onHover(zone.id)}
                onPointerLeave={() => onHover(null)}
                title={hint}
              >
                <AnimatePresence>
                  {isHovered && ok && !reduce && (
                    <motion.div
                      className="forces-drop-reveal"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <CanvasRevealEffect
                        active
                        animationSpeed={zone.id === "disband" ? 4.2 : 3.2}
                        colors={zone.revealColors}
                        dotSize={2}
                        showGradient
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
                <div className="forces-drop-zone-body">
                  <Icon size={22} strokeWidth={1.6} aria-hidden />
                  <span className="forces-drop-label">{zone.label}</span>
                  <span className="forces-drop-hint">{hint}</span>
                </div>
              </div>
            );
          })}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
