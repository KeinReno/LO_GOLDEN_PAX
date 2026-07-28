import { useMemo, useState } from "react";
import type { Planet, StarSystem } from "../state/types";
import {
  COLONY_TYPE_LABELS,
  PLANET_BUILDING_KIND_LABELS,
} from "../state/defaults";
import { HABIT_LABELS, classifyPlanet } from "../state/planets";
import {
  CLIMATE_LABELS,
  PLANET_TYPE_LABELS,
} from "../state/defaults";

export type BuildingDef = {
  id: string;
  kind: string;
  zone: "surface" | "orbital";
  name: string;
  ap?: number;
  cost?: Record<string, number>;
  maxPerPlanet?: number;
};

export type ColonyDef = {
  id: string;
  colonyType: string;
  name: string;
  colonizeAp?: number;
  colonizeCost?: Record<string, number>;
  setTypeAp?: number;
  setTypeCost?: Record<string, number>;
};

export type PlanetActionRequest = {
  action: "build" | "demolish" | "colonize" | "set_colony_type";
  systemId: string;
  planetId: string;
  buildingId?: string;
  instanceId?: string;
  colonyType?: string;
};

function formatCost(cost?: Record<string, number>): string {
  if (!cost) return "—";
  const parts: string[] = [];
  if (cost["currency.metal"]) parts.push(`M${cost["currency.metal"]}`);
  if (cost["currency.supply"]) parts.push(`S${cost["currency.supply"]}`);
  return parts.join(" · ") || "—";
}

function normalizeColonyType(t?: string | null): string {
  if (!t || t === "none") return "none";
  if (t === "capital") return "core";
  return t;
}

export function PlayerPlanetManage({
  system,
  planet,
  factionId,
  stocks,
  reservedAp,
  apMax,
  buildings,
  colonies,
  busy,
  message,
  onAction,
  onBack,
}: {
  system: StarSystem;
  planet: Planet;
  factionId: string;
  stocks: Record<string, number>;
  reservedAp: number;
  apMax: number;
  buildings: Record<string, BuildingDef>;
  colonies: Record<string, ColonyDef>;
  busy?: boolean;
  message?: string | null;
  onAction: (req: PlanetActionRequest) => void;
  onBack: () => void;
}) {
  const [zone, setZone] = useState<"surface" | "orbital">("surface");
  const habit = classifyPlanet(planet);
  const ownerId = planet.ownerFactionId || system.ownerFactionId || null;
  const managed = ownerId === factionId;
  const empty =
    (planet.population ?? 0) <= 0 &&
    normalizeColonyType(planet.colonyType) === "none";
  const canColonize =
    system.ownerFactionId === factionId &&
    empty &&
    planet.colonizable !== false &&
    (!planet.ownerFactionId || planet.ownerFactionId === factionId);

  const surface = planet.surfaceBuildings ?? [];
  const orbital = planet.orbitalBuildings ?? [];
  const surfaceMax = planet.surfaceSlots ?? 8;
  const orbitalMax = planet.orbitalSlots ?? 4;
  const list = zone === "surface" ? surface : orbital;
  const max = zone === "surface" ? surfaceMax : orbitalMax;

  const catalog = useMemo(
    () =>
      Object.values(buildings).filter((b) => b.zone === zone),
    [buildings, zone],
  );

  const colonyOptions = useMemo(
    () => Object.values(colonies),
    [colonies],
  );

  const apLeft = Math.max(0, apMax - reservedAp);
  const metal = stocks["currency.metal"] ?? 0;
  const supply = stocks["currency.supply"] ?? 0;

  return (
    <div className="planet-detail planet-detail--manage">
      <div className="planet-detail-head">
        <button type="button" className="btn ghost" onClick={onBack}>
          ← К системе
        </button>
        <span className={`habit-badge ${habit}`}>{HABIT_LABELS[habit]}</span>
      </div>
      <h3 className="planet-detail-title">{planet.name}</h3>

      <div className="sys-meta">
        <div className="sys-meta-row">
          <span>Тип / климат</span>
          <strong>
            {PLANET_TYPE_LABELS[planet.type]} · {CLIMATE_LABELS[planet.climate]}
          </strong>
        </div>
        <div className="sys-meta-row">
          <span>Колония</span>
          <strong>
            {COLONY_TYPE_LABELS[normalizeColonyType(planet.colonyType)] ??
              planet.colonyType ??
              "—"}
            {planet.population > 0 ? ` · нас. ${planet.population}` : ""}
          </strong>
        </div>
        <div className="sys-meta-row">
          <span>Казна / AP</span>
          <strong>
            M{metal} · S{supply} · AP {reservedAp}/{apMax}
            {apLeft === 0 ? " · нет AP" : ""}
          </strong>
        </div>
        <div className="sys-meta-row">
          <span>Слоты</span>
          <strong>
            пов. {surface.length}/{surfaceMax} · орб. {orbital.length}/
            {orbitalMax}
          </strong>
        </div>
      </div>

      {message && <p className="hint planet-manage-msg">{message}</p>}

      {canColonize && (
        <section className="planet-manage-block">
          <h4>Колонизация</h4>
          <p className="hint">Мгновенно: списывает ресурсы и AP, колония появляется сразу.</p>
          <div className="planet-manage-grid">
            {colonyOptions.map((c) => (
              <button
                key={c.id}
                type="button"
                className="btn ghost planet-manage-card"
                disabled={busy || apLeft < (c.colonizeAp ?? 1)}
                onClick={() =>
                  onAction({
                    action: "colonize",
                    systemId: system.id,
                    planetId: planet.id,
                    colonyType: c.colonyType,
                  })
                }
              >
                <strong>{c.name}</strong>
                <span className="hint">
                  {formatCost(c.colonizeCost)} · {c.colonizeAp ?? 1} AP
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {!canColonize && !managed && (
        <p className="hint">Чужая или недоступная планета — только осмотр.</p>
      )}

      {managed && !empty && (
        <>
          <section className="planet-manage-block">
            <h4>Тип колонии</h4>
            <div className="order-type-chips">
              {colonyOptions.map((c) => {
                const on =
                  normalizeColonyType(planet.colonyType) === c.colonyType;
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={`order-type-chip ${on ? "on" : ""}`}
                    disabled={busy || on || apLeft < (c.setTypeAp ?? 1)}
                    title={`${formatCost(c.setTypeCost)} · ${c.setTypeAp ?? 1} AP`}
                    onClick={() =>
                      onAction({
                        action: "set_colony_type",
                        systemId: system.id,
                        planetId: planet.id,
                        colonyType: c.colonyType,
                      })
                    }
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="planet-manage-block">
            <div className="planet-detail-head" style={{ marginBottom: 8 }}>
              <h4 style={{ margin: 0 }}>Строительство</h4>
              <div className="order-type-chips">
                <button
                  type="button"
                  className={`order-type-chip ${zone === "surface" ? "on" : ""}`}
                  onClick={() => setZone("surface")}
                >
                  Поверхность {surface.length}/{surfaceMax}
                </button>
                <button
                  type="button"
                  className={`order-type-chip ${zone === "orbital" ? "on" : ""}`}
                  onClick={() => setZone("orbital")}
                >
                  Орбита {orbital.length}/{orbitalMax}
                </button>
              </div>
            </div>

            <ul className="hq-list hq-list-compact">
              {list.length === 0 && (
                <li>
                  <p className="hint">Пусто</p>
                </li>
              )}
              {list.map((b) => (
                <li key={b.id} className="hq-order-row">
                  <span>
                    <strong>
                      {b.name || PLANET_BUILDING_KIND_LABELS[b.kind] || b.kind}
                    </strong>
                    {b.disabled && <span className="hint"> · откл.</span>}
                  </span>
                  <button
                    type="button"
                    className="btn ghost"
                    disabled={busy}
                    onClick={() =>
                      onAction({
                        action: "demolish",
                        systemId: system.id,
                        planetId: planet.id,
                        instanceId: b.id,
                      })
                    }
                  >
                    Снести
                  </button>
                </li>
              ))}
            </ul>

            <div className="planet-manage-grid" style={{ marginTop: 10 }}>
              {catalog.map((def) => {
                const full = list.length >= max;
                const needAp = def.ap ?? 1;
                const needM = def.cost?.["currency.metal"] ?? 0;
                const needS = def.cost?.["currency.supply"] ?? 0;
                const blocked =
                  busy || full || apLeft < needAp || metal < needM || supply < needS;
                return (
                  <button
                    key={def.id}
                    type="button"
                    className="btn ghost planet-manage-card"
                    disabled={blocked}
                    onClick={() =>
                      onAction({
                        action: "build",
                        systemId: system.id,
                        planetId: planet.id,
                        buildingId: def.id,
                      })
                    }
                  >
                    <strong>{def.name}</strong>
                    <span className="hint">
                      {formatCost(def.cost)} · {needAp} AP
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
