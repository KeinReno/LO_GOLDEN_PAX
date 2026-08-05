import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  DROP_ZONES,
  type CatalogShip,
  type DropZoneId,
} from "./constants";
import { filledSlotCount } from "./compositionOps";
import { canOutfitUnit } from "./outfitRules";
import type { UnitCardModel } from "./UnitCard";
import { forgeMetalCostClient } from "../../state/forceEconomy";
import { groupNeedsRepair } from "../../state/forceReadiness";

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
  const repairCost = forgeMetalCostClient();
  switch (zone) {
    case "forge": {
      if (!groupNeedsRepair(card)) {
        return { ok: false, reason: "Уже на полной прочности" };
      }
      const ok = metalStock >= repairCost;
      return {
        ok,
        reason: ok ? undefined : `Нужно ${repairCost} металла`,
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
      const roles = slots.length;
      return {
        ok: true,
        reason:
          roles > 0 && filled >= roles
            ? "Все роли заняты — можно заменить"
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
  const repairCost = forgeMetalCostClient();

  const zones = DROP_ZONES.filter((zone) => {
    if (zone.id !== "equip") return true;
    return canOutfitUnit(catalogItem, deckKind);
  });

  return (
    <AnimatePresence>
      {active && draggedCard && (
        <motion.div
          className="forces-drop-zones"
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduce ? undefined : { opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {zones.map((zone) => {
            const { ok, reason } = canDrop(zone.id, draggedCard);
            const isHovered = hoveredZone === zone.id;
            const Icon = zone.Icon;
            const hint =
              !ok && reason
                ? reason
                : zone.id === "forge"
                  ? `${zone.hint} · −${repairCost} мет. (${Math.floor(metalStock)})`
                  : zone.id === "equip" && catalogItem
                    ? `${zone.hint} · ${filledSlotCount(draggedCard)}/${catalogItem.slots?.length ?? 0} ролей`
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
                {isHovered && ok && !reduce && (
                  <div
                    className="forces-drop-reveal forces-drop-reveal--css"
                    aria-hidden
                  />
                )}
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
