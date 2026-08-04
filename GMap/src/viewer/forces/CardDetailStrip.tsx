import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  X,
  Flame,
  Recycle,
  Settings2,
  Package,
  ChevronLeft,
  AlertTriangle,
} from "lucide-react";
import type { ShipGroup } from "../../state/types";
import {
  buildResourceIndex,
  candidatesForRequire,
  type IndexedResource,
} from "../../state/resourceIndex";
import type { MapResourceDef } from "../../state/contentCatalog";
import {
  FORGE_METAL_COST,
  SLOT_ROLE_LABELS,
  type CatalogShip,
  type StripMode,
} from "./constants";
import type { UnitCardModel } from "./UnitCard";
import { canOutfitUnit } from "./outfitRules";

type CardDetailStripProps = {
  group: UnitCardModel | ShipGroup;
  catalogItem: CatalogShip | null;
  mode: StripMode;
  deckKind: "fleet" | "legion";
  mapResources: Record<string, MapResourceDef> | undefined;
  stocks: Record<string, number>;
  unlockedProperties?: string[];
  metalStock: number;
  onClose: () => void;
  onUpgrade: () => void;
  onRequestDisband: () => void;
  onConfirmDisband: () => void;
  onCancelDisband: () => void;
  onOpenEquip: () => void;
  onFillSlot: (role: string, resourceId: string) => void;
  onClearSlot: (role: string) => void;
  onToReserve: () => void;
};

function formatRequire(req?: {
  category?: string;
  tier?: string;
  properties?: string[];
}): string {
  if (!req) return "любой";
  const parts: string[] = [];
  if (req.category) parts.push(req.category);
  if (req.tier) parts.push(`T${req.tier}`);
  if (req.properties?.length) parts.push(req.properties.join("/"));
  return parts.join(" · ") || "любой";
}

function stockOf(stocks: Record<string, number>, id: string): number {
  return stocks[id] ?? 0;
}

export function CardDetailStrip({
  group,
  catalogItem,
  mode,
  deckKind,
  mapResources,
  stocks,
  unlockedProperties,
  metalStock,
  onClose,
  onUpgrade,
  onRequestDisband,
  onConfirmDisband,
  onCancelDisband,
  onOpenEquip,
  onFillSlot,
  onClearSlot,
  onToReserve,
}: CardDetailStripProps) {
  const reduce = useReducedMotion();
  const level = Math.min(5, Math.max(0, group.level ?? 0));
  const name = catalogItem?.name ?? group.type;
  const slots = catalogItem?.slots ?? [];
  const fills = group.filledSlots ?? {};
  const [openRole, setOpenRole] = useState<string | null>(null);
  const showOutfit = canOutfitUnit(catalogItem, deckKind);

  const index = useMemo(
    () => buildResourceIndex(mapResources),
    [mapResources],
  );

  const unlockSet = useMemo(
    () => (unlockedProperties?.length ? new Set(unlockedProperties) : null),
    [unlockedProperties],
  );

  /** Only resources actually on the faction stock — no catalog dump. */
  const filterCandidates = (list: IndexedResource[]): IndexedResource[] => {
    let out = list.filter((r) => stockOf(stocks, r.id) > 0);
    if (unlockSet) {
      out = out.filter(
        (r) =>
          r.properties.length === 0 ||
          r.properties.some((p) => unlockSet.has(p)),
      );
    }
    return out.sort((a, b) => a.name.localeCompare(b.name, "ru"));
  };

  return (
    <motion.div
      className={[
        "forces-detail-strip",
        mode === "equip" ? "forces-detail-strip--equip" : "",
        mode === "confirm-disband" ? "forces-detail-strip--danger" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      role="region"
      aria-label={
        mode === "equip"
          ? `Экипировка: ${name}`
          : mode === "confirm-disband"
            ? `Подтверждение списания: ${name}`
            : `Детали: ${name}`
      }
      initial={reduce ? false : { y: 48, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={reduce ? undefined : { y: 48, opacity: 0 }}
      transition={{ type: "spring", stiffness: 360, damping: 32 }}
    >
      <button
        type="button"
        className="forces-detail-close"
        onClick={onClose}
        aria-label="Закрыть"
      >
        <X size={16} />
      </button>

      {mode === "confirm-disband" ? (
        <>
          <div className="forces-detail-info">
            <h4>
              <AlertTriangle size={16} aria-hidden /> Списать {name}?
            </h4>
            <p className="forces-detail-stats">
              Безвозвратно уберёт 1 ед. из колоды. Часть металла вернётся на
              склад. Слоты оснащения освободятся.
            </p>
          </div>
          <div className="forces-detail-actions">
            <button type="button" className="btn danger" onClick={onConfirmDisband}>
              <Recycle size={14} aria-hidden /> Подтвердить утиль
            </button>
            <button type="button" className="btn ghost" onClick={onCancelDisband}>
              Отмена
            </button>
          </div>
        </>
      ) : mode === "equip" ? (
        <>
          <div className="forces-detail-info forces-equip-head">
            <button
              type="button"
              className="btn ghost forces-equip-back"
              onClick={onCancelDisband}
            >
              <ChevronLeft size={14} aria-hidden /> Назад
            </button>
            <h4>
              Оснащение · {name}{" "}
              <span className="forces-detail-mul">×{group.count}</span>
            </h4>
            <p className="hint">
              Модули из склада фракции (орудия / щиты / корпус / реактор).
            </p>
          </div>
          <div className="forces-equip-slots">
            {slots.length === 0 ? (
              <p className="hint">У этого типа нет слотов оснащения.</p>
            ) : (
              slots.map((slot) => {
                const filledId = fills[slot.role];
                const filled = filledId
                  ? Object.values(mapResources || {}).find(
                      (r) => r.id === filledId,
                    )
                  : null;
                const isOpen = openRole === slot.role;
                const candidates = filterCandidates(
                  candidatesForRequire(slot.require, index),
                );
                const label =
                  SLOT_ROLE_LABELS[slot.role] ?? slot.role;
                return (
                  <div key={slot.role} className="forces-equip-slot">
                    <button
                      type="button"
                      className={`forces-equip-slot-row ${filled ? "is-filled" : ""}`}
                      onClick={() =>
                        setOpenRole(isOpen ? null : slot.role)
                      }
                    >
                      <span>
                        <strong>{label}</strong>
                        <span className="hint">
                          {" "}
                          ×{slot.count ?? 1} · {formatRequire(slot.require)}
                        </span>
                      </span>
                      <span className={filled ? "ok" : "empty"}>
                        {filled ? filled.name : "пусто · ▾"}
                      </span>
                    </button>
                    {filled && (
                      <button
                        type="button"
                        className="btn ghost forces-equip-clear"
                        onClick={() => {
                          onClearSlot(slot.role);
                          setOpenRole(null);
                        }}
                      >
                        Снять
                      </button>
                    )}
                    {isOpen && (
                      <div className="forces-equip-candidates">
                        {candidates.length === 0 ? (
                          <p className="hint">
                            На складе нет подходящих ресурсов для этого слота.
                          </p>
                        ) : (
                          candidates.slice(0, 12).map((r) => {
                            const qty = stockOf(stocks, r.id);
                            return (
                              <button
                                key={r.id}
                                type="button"
                                className="forces-equip-cand"
                                onClick={() => {
                                  onFillSlot(slot.role, r.id);
                                  setOpenRole(null);
                                }}
                              >
                                <span>{r.name}</span>
                                <span className="hint">
                                  T{r.tier ?? "?"} · склад {qty}
                                </span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </>
      ) : (
        <>
          <div className="forces-detail-info">
            <h4>
              {name} <span className="forces-detail-mul">×{group.count}</span>
            </h4>
            <p className="forces-detail-stats">
              Урон: {catalogItem?.stats?.damage ?? "—"} · Броня:{" "}
              {catalogItem?.stats?.armor ?? "—"} · HP: {group.hp ?? "—"}/
              {catalogItem?.stats?.hp ?? "—"}
            </p>
            <p className="forces-detail-vet">
              Ветеран: {"★".repeat(level)}
              {"☆".repeat(5 - level)} · XP: {group.xp ?? 0}
              {slots.length > 0
                ? ` · слоты ${Object.keys(fills).length}/${slots.length}`
                : ""}
            </p>
          </div>
          <div className="forces-detail-actions">
            <button
              type="button"
              className="btn"
              onClick={onUpgrade}
              disabled={level >= 5 || metalStock < FORGE_METAL_COST}
              title={
                level >= 5
                  ? "Максимальный ранг"
                  : metalStock < FORGE_METAL_COST
                    ? `Нужно ${FORGE_METAL_COST} металла`
                    : `−${FORGE_METAL_COST} металла`
              }
            >
              <Flame size={14} aria-hidden /> Модернизировать
            </button>
            {showOutfit && (
              <button
                type="button"
                className="btn ghost"
                onClick={onOpenEquip}
                title="Модули корабля со склада"
              >
                <Settings2 size={14} aria-hidden /> Оснащение
              </button>
            )}
            <button type="button" className="btn ghost" onClick={onToReserve}>
              <Package size={14} aria-hidden /> В резерв
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={onRequestDisband}
            >
              <Recycle size={14} aria-hidden /> Утиль
            </button>
          </div>
        </>
      )}
    </motion.div>
  );
}
