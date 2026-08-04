import { useMemo, useState } from "react";
import type { PlanetBuilding } from "../state/types";
import {
  economyCategoryLabel,
  formatSlotRequire,
} from "../state/displayLabels";
import { SLOT_ROLE_LABELS } from "./forces/constants";
import {
  buildResourceIndex,
  candidatesForRequire,
  CATEGORY_META,
  type ResourceIndex,
  type IndexedResource,
} from "../state/resourceIndex";
import type { MapResourceDef } from "../state/contentCatalog";
import {
  canFillResourceProperties,
  type TechEcoSlice,
} from "../state/techGate";
import { resourceFaithTabooHit } from "../state/societyRegistry";

export type BuildingSlotDef = {
  role: string;
  require: { category?: string; tier?: string; properties?: string[] };
  count: number;
};

export type BuildingDefWithSlots = {
  id: string;
  kind: string;
  zone: "surface" | "orbital" | "subsurface" | "deep";
  name: string;
  slots?: BuildingSlotDef[];
};

function formatRequire(req: {
  category?: string;
  tier?: string;
  properties?: string[];
}): string {
  return formatSlotRequire(req);
}

/**
 * Panel: shows slots of a building instance + lets the player fill them with resources.
 * Calls onFill(role, resourceId) which dispatches a fill_slot planet action.
 * When localResourceNames is set, candidates are filtered to planet-local resources.
 */
export function BuildingSlotsPanel({
  building,
  buildingDef,
  mapResources,
  localResourceNames,
  techEco,
  faithTabooProperties,
  onFill,
  onUnfill,
  busy,
}: {
  building: PlanetBuilding;
  buildingDef: BuildingDefWithSlots;
  mapResources: Record<string, MapResourceDef> | undefined;
  /** Planet.resources names — when set, only those resources are offered. */
  localResourceNames?: string[];
  techEco?: TechEcoSlice;
  /** Property ids taboo for planet faith — blocks slot fill UI. */
  faithTabooProperties?: Set<string>;
  onFill: (role: string, resourceId: string) => void;
  /** Clear a filled slot (fill_slot with "" / "__clear__"). */
  onUnfill?: (role: string) => void;
  busy?: boolean;
}) {
  const index = useMemo<ResourceIndex>(
    () => buildResourceIndex(mapResources),
    [mapResources],
  );
  const [openRole, setOpenRole] = useState<string | null>(null);

  const localSet = useMemo(() => {
    if (!localResourceNames || localResourceNames.length === 0) return null;
    return new Set(localResourceNames.map((n) => n.toLowerCase()));
  }, [localResourceNames]);

  const slots = buildingDef.slots || [];
  if (slots.length === 0) return null;
  const fills = building.slotFills || {};

  const filterLocal = (list: IndexedResource[]): IndexedResource[] => {
    if (!localSet) return list;
    return list.filter(
      (r) =>
        localSet.has(r.name.toLowerCase()) ||
        localSet.has(r.id.toLowerCase()),
    );
  };

  return (
    <div className="building-slots-panel">
      <div className="building-slots-head">
        СЛОТЫ ({slots.length})
        {localSet && (
          <span className="hint"> · только местные ресурсы</span>
        )}
      </div>
      <div className="building-slots-list">
        {slots.map((slot) => {
          const filledId = fills[slot.role];
          const filled = filledId
            ? Object.values(mapResources || {}).find(
                (r) => r.id === filledId,
              )
            : null;
          const isOpen = openRole === slot.role;
          const candidates = filterLocal(
            candidatesForRequire(slot.require, index),
          );
          return (
            <div key={slot.role}>
              <div
                className={`building-slot-row ${filled ? "is-filled" : ""}`}
                style={{
                  cursor: busy ? "wait" : "pointer",
                  opacity: busy ? 0.6 : 1,
                }}
                onClick={() => busy || setOpenRole(isOpen ? null : slot.role)}
              >
                <span>
                  <strong>{SLOT_ROLE_LABELS[slot.role] ?? slot.role}</strong>
                  <span className="hint" style={{ marginLeft: 6 }}>
                    ×{slot.count} · {formatRequire(slot.require)}
                  </span>
                </span>
                {filled ? (
                  <span style={{ color: "var(--ok)" }}>▸ {filled.name}</span>
                ) : (
                  <span style={{ color: "var(--eco-cat-d)" }}>пусто · ▾</span>
                )}
              </div>
              {filled && onUnfill && !busy && (
                <button
                  type="button"
                  className="btn ghost building-slot-unfill"
                  onClick={(e) => {
                    e.stopPropagation();
                    onUnfill(slot.role);
                    setOpenRole(null);
                  }}
                >
                  Очистить
                </button>
              )}
              {isOpen && !busy && (
                <div className="building-slot-candidates">
                  {candidates.length === 0 ? (
                    <div style={{ fontSize: 10, color: "var(--danger)" }}>
                      {localSet
                        ? "Нет подходящих ресурсов на этой планете."
                        : "Нет подходящих ресурсов — узкое место. Изучите технологию или торгуйте."}
                    </div>
                  ) : (
                    <div className="building-slot-grid">
                      {candidates.slice(0, 24).map((r: IndexedResource) => {
                        const meta =
                          CATEGORY_META[r.category || ""] || {
                            color: "var(--muted)",
                          };
                        const on = filledId === r.id;
                        const propGate = canFillResourceProperties(
                          techEco,
                          slot.require.properties,
                          r.properties,
                        );
                        const tabooHit = resourceFaithTabooHit(
                          r.properties,
                          faithTabooProperties ?? new Set(),
                        );
                        const locked = !propGate.ok || !!tabooHit;
                        return (
                          <button
                            key={r.id}
                            type="button"
                            disabled={locked}
                            onClick={() => {
                              if (locked) return;
                              onFill(slot.role, r.id);
                              setOpenRole(null);
                            }}
                            className={`building-slot-cand${on ? " on" : ""}${locked ? " is-locked" : ""}${tabooHit ? " is-taboo" : ""}`}
                            style={{
                              borderColor: on ? meta.color : undefined,
                              color: on ? meta.color : undefined,
                            }}
                            title={
                              tabooHit
                                ? `${r.name} — табу веры: ${tabooHit}`
                                : locked
                                  ? `${r.name} — ${propGate.error}`
                                  : `${r.name} · ${economyCategoryLabel(r.category ?? "")} T${r.tier} · ${r.properties.join(", ") || "—"}`
                            }
                          >
                            <span style={{ color: meta.color }}>T{r.tier}</span>{" "}
                            {r.name}
                            {r.properties.length > 0 && (
                              <span className="hint" style={{ fontSize: 9, marginLeft: 4 }}>
                                {r.properties.slice(0, 2).join(",")}
                              </span>
                            )}
                          </button>
                        );
                      })}
                      {candidates.length > 24 && (
                        <span className="hint" style={{ fontSize: 9, gridColumn: "1/-1" }}>
                          …и ещё {candidates.length - 24}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
