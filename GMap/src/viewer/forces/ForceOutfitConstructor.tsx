import { useMemo, useState } from "react";
import {
  buildResourceIndex,
  candidatesForRequire,
  type IndexedResource,
} from "../../state/resourceIndex";
import type { MapResourceDef } from "../../state/contentCatalog";
import { formatSlotRequire } from "../../state/displayLabels";
import { factionHasProperty } from "../../state/techGate";
import type { ShipGroup } from "../../state/types";
import {
  SLOT_ROLE_LABELS,
  type CatalogShip,
} from "./constants";
import { canOutfitUnit } from "./outfitRules";
import type { UnitCardModel } from "./UnitCard";

type Props = {
  group: UnitCardModel | ShipGroup | null;
  catalogItem: CatalogShip | null;
  deckKind: "fleet" | "legion";
  mapResources: Record<string, MapResourceDef> | undefined;
  stocks: Record<string, number>;
  unlockedProperties?: string[];
  onFillSlot: (role: string, resourceId: string) => void;
  onClearSlot: (role: string) => void;
};

function stockOf(stocks: Record<string, number>, id: string): number {
  return stocks[id] ?? 0;
}

function warehouseCandidates(
  list: IndexedResource[],
  stocks: Record<string, number>,
  unlockedProperties?: string[],
): IndexedResource[] {
  const unlockSet = unlockedProperties?.length
    ? new Set(unlockedProperties)
    : null;
  let out = list.filter((r) => stockOf(stocks, r.id) > 0);
  if (unlockSet) {
    out = out.filter(
      (r) =>
        r.properties.length === 0 ||
        r.properties.some((p) =>
          factionHasProperty({ unlockedProperties }, p),
        ),
    );
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

/**
 * Player-facing outfit constructor: hull in the center, slots on a ring,
 * warehouse candidates for the selected slot.
 */
export function ForceOutfitConstructor({
  group,
  catalogItem,
  deckKind,
  mapResources,
  stocks,
  unlockedProperties,
  onFillSlot,
  onClearSlot,
}: Props) {
  const slots = catalogItem?.slots ?? [];
  const fills = group?.filledSlots ?? {};
  const [openRole, setOpenRole] = useState<string | null>(
    slots[0]?.role ?? null,
  );
  const index = useMemo(
    () => buildResourceIndex(mapResources),
    [mapResources],
  );
  const activeRole =
    openRole && slots.some((s) => s.role === openRole)
      ? openRole
      : (slots[0]?.role ?? null);
  const activeSlot = slots.find((s) => s.role === activeRole);
  const candidates = activeSlot
    ? warehouseCandidates(
        candidatesForRequire(activeSlot.require, index),
        stocks,
        unlockedProperties,
      )
    : [];
  const canOutfit = canOutfitUnit(catalogItem, deckKind);
  const name = catalogItem?.name ?? group?.type ?? "Сила";

  if (!group) {
    return (
      <div className="force-ctor" aria-label="Конструктор сил">
        <p className="hint">
          Кликните карту корабля/отряда <strong>сверху</strong> — здесь появятся
          слоты. Модуль берётся со склада, не из воздуха.
        </p>
      </div>
    );
  }

  if (!canOutfit) {
    return (
      <div className="force-ctor" aria-label="Конструктор сил">
        <div className="force-ctor__hull-fallback">
          <strong>{name}</strong>
          <span className="hint">×{group.count}</span>
        </div>
        <p className="hint">У этого типа нет слотов оснащения.</p>
      </div>
    );
  }

  return (
    <div className="force-ctor" aria-label={`Конструктор: ${name}`}>
      <p className="hint force-ctor__rule">
        <strong>1.</strong> Слот · <strong>2.</strong> Модуль со склада. Пустой
        слот бьёт слабее.
      </p>
      <div className="force-ctor__hull-fallback">
        <strong>{name}</strong>
        <span className="hint">×{group.count}</span>
      </div>
      <ul className="force-ctor__slots">
        {slots.map((slot) => {
          const filledId = fills[slot.role];
          const filled = filledId
            ? Object.values(mapResources || {}).find((r) => r.id === filledId)
            : null;
          const on = activeRole === slot.role;
          const label = SLOT_ROLE_LABELS[slot.role] ?? slot.role;
          return (
            <li key={slot.role}>
              <button
                type="button"
                className={`force-ctor__chip ${filled ? "is-filled" : ""} ${on ? "is-on" : ""}`}
                onClick={() => setOpenRole(slot.role)}
              >
                <span>{label}</span>
                <span className="hint">{filled ? filled.name : "пусто"}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {activeSlot ? (
        <div className="force-ctor__bay">
          <header>
            <strong>
              Модули · {SLOT_ROLE_LABELS[activeSlot.role] ?? activeSlot.role}
            </strong>
            <span className="hint">
              ×{activeSlot.count ?? 1} ·{" "}
              {formatSlotRequire(activeSlot.require ?? {}) || "любой"}
            </span>
            {fills[activeSlot.role] ? (
              <button
                type="button"
                className="btn ghost sm"
                onClick={() => onClearSlot(activeSlot.role)}
              >
                Снять
              </button>
            ) : null}
          </header>
          {candidates.length === 0 ? (
            <p className="hint">
              На складе нет модуля под этот слот. Металл сюда не кладётся —
              нужны орудия/щиты/корпус из запасов.
            </p>
          ) : (
            <ul className="force-ctor__cands">
              {candidates.slice(0, 16).map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className={`force-ctor__cand ${fills[activeSlot.role] === r.id ? "is-on" : ""}`}
                    onClick={() => onFillSlot(activeSlot.role, r.id)}
                  >
                    <span>{r.name}</span>
                    <span className="tabular-nums hint">
                      T{r.tier ?? "?"} · {stockOf(stocks, r.id)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

