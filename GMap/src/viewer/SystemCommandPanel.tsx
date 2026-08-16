import { useMemo, useState, useEffect } from "react";
import type { StarSystem, StationKind } from "../state/types";
import { stationKindLabel } from "../state/displayLabels";
import { formatPlayerCost } from "../state/economyLabels";
import { HoldRevealButton } from "../ui/HoldRevealButton";
import { produceForceCostClient } from "../state/forceEconomy";
import {
  Pickaxe,
  Shield,
  FlaskConical,
  Store,
  Radio,
  Rocket,
  Swords,
} from "lucide-react";

export type SystemActionRequest = {
  action:
    | "build_station"
    | "demolish_station"
    | "produce_ship"
    | "produce_unit"
    | "rename_system";
  systemId: string;
  stationKind?: StationKind;
  stationId?: string;
  shipId?: string;
  unitId?: string;
  count?: number;
  planetId?: string;
  /** Orbital-plane angle for place-on-belt. */
  beltAngle?: number;
  /** New display name for rename_system. */
  name?: string;
  fleetId?: string;
  legionId?: string;
};

type StationCat = {
  kind: StationKind;
  name: string;
  ap: number;
  cost: Record<string, number>;
};

type UnitLike = {
  id: string;
  name: string;
  tier?: number;
  faction?: string;
  raisableWithoutBuilding?: boolean;
};

const STATION_ICON: Record<StationKind, typeof Pickaxe> = {
  mining: Pickaxe,
  military: Shield,
  science: FlaskConical,
  trade: Store,
  relay: Radio,
};

export const DEFAULT_STATIONS: StationCat[] = [
  {
    kind: "mining",
    name: "Добывающая станция",
    ap: 1,
    cost: { "currency.metal": 24, "currency.supply": 6 },
  },
  {
    kind: "military",
    name: "Оборонная платформа",
    ap: 2,
    cost: { "currency.metal": 36, "currency.supply": 12 },
  },
  {
    kind: "science",
    name: "Научная станция",
    ap: 1,
    cost: { "currency.metal": 18, "currency.supply": 10 },
  },
  {
    kind: "trade",
    name: "Торговый узел",
    ap: 1,
    cost: { "currency.metal": 22, "currency.supply": 8 },
  },
  {
    kind: "relay",
    name: "Релейный маяк",
    ap: 1,
    cost: { "currency.metal": 28, "currency.supply": 6 },
  },
];


export function SystemCommandPanel({
  system,
  factionId,
  stocks,
  reservedAp,
  apMax,
  selectedPlanetId,
  selectedStationId,
  ships,
  units,
  busy,
  message,
  onAction,
  onSelectStation,
  /** Prefer mining card (e.g. after deposit CTA). */
  preferKind,
  /** Show station / produce decks inline (gesture dock). */
  docked = true,
  forceStationsOpen,
  forceProduceOpen,
  forceProduceTab,
  produceFleetId,
  produceLegionId,
  onDeckChange,
  /** Angle chosen on schematic belt. */
  pendingBeltAngle,
  /** Kind armed for next belt tap / hold. */
  placingKind,
  onArmKind,
}: {
  system: StarSystem;
  factionId: string;
  stocks: Record<string, number>;
  reservedAp: number;
  apMax: number;
  selectedPlanetId?: string | null;
  selectedStationId?: string | null;
  ships: Record<string, UnitLike>;
  units: Record<string, UnitLike>;
  busy?: boolean;
  message?: string | null;
  onAction: (req: SystemActionRequest) => void;
  onSelectStation?: (id: string | null) => void;
  preferKind?: StationKind | null;
  docked?: boolean;
  forceStationsOpen?: boolean;
  forceProduceOpen?: boolean;
  forceProduceTab?: "ships" | "units";
  produceFleetId?: string | null;
  produceLegionId?: string | null;
  onDeckChange?: (deck: "stations" | "produce" | null) => void;
  pendingBeltAngle?: number | null;
  placingKind?: StationKind | null;
  onArmKind?: (kind: StationKind) => void;
}) {
  const owned = system.ownerFactionId === factionId;
  const apLeft = Math.max(0, apMax - reservedAp);
  const [stationsOpen, setStationsOpen] = useState(false);
  const [produceOpen, setProduceOpen] = useState(false);
  const [tab, setTab] = useState<"ships" | "units">("ships");

  useEffect(() => {
    if (forceProduceTab === "ships" || forceProduceTab === "units") {
      setTab(forceProduceTab);
    }
  }, [forceProduceTab, system.id]);
  const [count, setCount] = useState(1);

  const showStations = forceStationsOpen ?? stationsOpen;
  const showProduce = forceProduceOpen ?? produceOpen;

  const openStations = (v: boolean) => {
    setStationsOpen(v);
    if (v) setProduceOpen(false);
    onDeckChange?.(v ? "stations" : null);
  };
  const openProduce = (v: boolean) => {
    setProduceOpen(v);
    if (v) setStationsOpen(false);
    onDeckChange?.(v ? "produce" : null);
  };

  const hasShipyard = useMemo(() => {
    for (const p of system.planets ?? []) {
      const owner = p.ownerFactionId || system.ownerFactionId;
      if (owner !== factionId) continue;
      for (const b of [
        ...(p.orbitalBuildings ?? []),
        ...(p.surfaceBuildings ?? []),
      ]) {
        if (b.kind === "shipyard" || b.kind === "spaceport") return true;
      }
    }
    return (system.stations ?? []).some(
      (s) => s.kind === "military" && s.factionId === factionId,
    );
  }, [system, factionId]);

  const hasBarracks = useMemo(() => {
    for (const p of system.planets ?? []) {
      const owner = p.ownerFactionId || system.ownerFactionId;
      if (owner !== factionId) continue;
      if ((p.surfaceBuildings ?? []).some((b) => b.kind === "barracks"))
        return true;
    }
    return false;
  }, [system, factionId]);

  const raisePop = useMemo(() => {
    const owned = (system.planets ?? []).filter(
      (p) => (p.ownerFactionId || system.ownerFactionId) === factionId,
    );
    const planet = selectedPlanetId
      ? owned.find((p) => p.id === selectedPlanetId)
      : [...owned].sort(
          (a, b) => (Number(b.population) || 0) - (Number(a.population) || 0),
        )[0];
    return Number(planet?.population) || 0;
  }, [system, factionId, selectedPlanetId]);

  const shipList = useMemo(
    () =>
      Object.values(ships).filter(
        (s) => !s.faction || s.faction === "generic" || s.faction === factionId,
      ),
    [ships, factionId],
  );
  const unitList = useMemo(
    () =>
      Object.values(units).filter(
        (u) => !u.faction || u.faction === "generic" || u.faction === factionId,
      ),
    [units, factionId],
  );

  const stationDefs = useMemo(() => {
    if (!preferKind) return DEFAULT_STATIONS;
    return [
      ...DEFAULT_STATIONS.filter((d) => d.kind === preferKind),
      ...DEFAULT_STATIONS.filter((d) => d.kind !== preferKind),
    ];
  }, [preferKind]);

  const selectedStation = (system.stations ?? []).find(
    (s) => s.id === selectedStationId,
  );

  if (!owned) {
    return (
      <p className="hint system-cmd-locked">
        Системарные постройки и верфь доступны владельцу системы.
      </p>
    );
  }

  const stationDeck = (
    <div className="system-cmd-deck-block">
      <p className="hint hold-reveal-tip">
        {pendingBeltAngle != null
          ? "Точка на поясе выбрана — зажми карту или тапни пояс ещё раз с выбранным типом."
          : placingKind
            ? `Тип «${placingKind}» — тапни пояс, куда поставить.`
            : "Тапни тип (или зажми), затем тапни пояс на схеме."}
      </p>
      <div className="system-cmd-deck">
        {stationDefs.map((def) => {
          const Icon = STATION_ICON[def.kind];
          const metal = stocks["currency.metal"] ?? 0;
          const supply = stocks["currency.supply"] ?? 0;
          const ok =
            !busy &&
            apLeft >= def.ap &&
            metal >= (def.cost["currency.metal"] ?? 0) &&
            supply >= (def.cost["currency.supply"] ?? 0);
          const preferred =
            preferKind === def.kind || placingKind === def.kind;
          const canCommit = ok && pendingBeltAngle != null;
          return (
            <HoldRevealButton
              key={def.kind}
              className={`system-cmd-card${preferred ? " is-prefer" : ""}`}
              disabled={!ok}
              holdMs={720}
              title={
                canCommit
                  ? `${def.name} — зажми, чтобы поставить в точку`
                  : `${def.name} — тап = выбрать тип · зажми = поставить (нужна точка на поясе)`
              }
              onPressStart={() => onArmKind?.(def.kind)}
              onHoldComplete={() => {
                if (pendingBeltAngle == null) {
                  onArmKind?.(def.kind);
                  return;
                }
                onAction({
                  action: "build_station",
                  systemId: system.id,
                  stationKind: def.kind,
                  planetId: selectedPlanetId ?? undefined,
                  beltAngle: pendingBeltAngle,
                });
              }}
            >
              <span className="system-cmd-card__icon">
                <Icon size={16} />
              </span>
              <span className="system-cmd-card__body">
                <strong>{def.name}</strong>
                <span className="hint">
                  {formatPlayerCost(def.cost)} · {def.ap} ОД
                  {canCommit ? " · зажми → сюда" : " · тап тип"}
                </span>
              </span>
            </HoldRevealButton>
          );
        })}
      </div>
    </div>
  );

  const produceDeck = (
    <div className="system-cmd-deck-block">
      <div className="order-type-chips" style={{ marginBottom: 8 }}>
        <button
          type="button"
          className={`order-type-chip ${tab === "ships" ? "on" : ""}`}
          onClick={() => setTab("ships")}
        >
          <Rocket size={12} /> Корабли
        </button>
        <button
          type="button"
          className={`order-type-chip ${tab === "units" ? "on" : ""}`}
          onClick={() => setTab("units")}
        >
          <Swords size={12} /> Войска
        </button>
      </div>
      <label className="system-cmd-count">
        Кол-во
        <input
          type="number"
          min={1}
          max={20}
          value={count}
          onChange={(e) => setCount(Math.max(1, Number(e.target.value) || 1))}
        />
      </label>
      {tab === "ships" && !hasShipyard && (
        <p className="hint">
          Нужна верфь/космопорт на планете или военная станция.
        </p>
      )}
      {tab === "units" && !hasBarracks && (
        <p className="hint">
          Нужны казармы (ополчение — без них). Набор стоит население.
        </p>
      )}
      <p className="hint hold-reveal-tip">
        Стоит население (потолок 30%) + металл/снабжение. ОД сил — налог
        приказа, валюта не списывается дважды. Зажми карту.
      </p>
      {raisePop <= 0 && (
        <p className="hint">Нет населения для набора на выбранной планете.</p>
      )}
      <div className="system-cmd-deck">
        {(tab === "ships" ? shipList : unitList).map((def) => {
          const cost = produceForceCostClient(
            tab === "ships" ? "ship" : "unit",
            def,
            count,
          );
          const costM = cost["currency.metal"] ?? 0;
          const costS = cost["currency.supply"] ?? 0;
          const buildingOk =
            tab === "ships"
              ? hasShipyard
              : hasBarracks || !!def.raisableWithoutBuilding;
          const ok =
            !busy &&
            buildingOk &&
            raisePop > 0 &&
            apLeft >= 1 &&
            (stocks["currency.metal"] ?? 0) >= costM &&
            (stocks["currency.supply"] ?? 0) >= costS;
          return (
            <HoldRevealButton
              key={def.id}
              className="system-cmd-card"
              disabled={!ok}
              holdMs={720}
              title={`${def.name} — зажми, чтобы произвести (стоит население)`}
              onHoldComplete={() =>
                onAction(
                  tab === "ships"
                    ? {
                        action: "produce_ship",
                        systemId: system.id,
                        shipId: def.id,
                        count,
                        ...(selectedPlanetId
                          ? { planetId: selectedPlanetId }
                          : {}),
                        ...(produceFleetId ? { fleetId: produceFleetId } : {}),
                      }
                    : {
                        action: "produce_unit",
                        systemId: system.id,
                        unitId: def.id,
                        count,
                        ...(selectedPlanetId
                          ? { planetId: selectedPlanetId }
                          : {}),
                        ...(produceLegionId
                          ? { legionId: produceLegionId }
                          : {}),
                      },
                )
              }
            >
              <span className="system-cmd-card__body">
                <strong>{def.name}</strong>
                <span className="hint">
                  T{def.tier ?? "?"} · M{costM} · S{costS} · нас. · ×{count} ·
                  зажми
                </span>
              </span>
            </HoldRevealButton>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className={`system-cmd${docked ? " system-cmd--docked" : ""}`}>
      <div className="system-cmd-toolbar">
        <button
          type="button"
          className={`btn ghost ${showStations ? "active" : ""}`}
          onClick={() => openStations(!showStations)}
        >
          Станции
        </button>
        <button
          type="button"
          className={`btn ghost ${showProduce ? "active" : ""}`}
          onClick={() => openProduce(!showProduce)}
        >
          Верфь / войска
        </button>
      </div>
      {message && <p className="hint planet-manage-msg">{message}</p>}

      {selectedStation && (
        <div className="system-cmd-selected">
          <strong>{selectedStation.name}</strong>
          <span className="hint">{stationKindLabel(selectedStation.kind)}</span>
          {selectedStation.factionId === factionId && (
            <HoldRevealButton
              className="btn ghost"
              danger
              holdMs={850}
              disabled={busy}
              title="Зажми, чтобы снести станцию"
              onHoldComplete={() =>
                onAction({
                  action: "demolish_station",
                  systemId: system.id,
                  stationId: selectedStation.id,
                })
              }
            >
              Зажми · снести
            </HoldRevealButton>
          )}
          <button
            type="button"
            className="btn ghost"
            onClick={() => onSelectStation?.(null)}
          >
            ✕
          </button>
        </div>
      )}

      {docked && showStations && stationDeck}
      {docked && showProduce && produceDeck}
    </div>
  );
}
