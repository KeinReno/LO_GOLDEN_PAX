import { useCallback, useEffect, useMemo, useState } from "react";
import { formatOdMeter } from "../state/playerUiTerms";
import { createPortal } from "react-dom";
import type {
  Planet,
  PlanetBuilding,
  PlanetBuildingZone,
  StarSystem,
} from "../state/types";
import { useWorldStore } from "../state/worldStore";
import { COLONY_TYPE_LABELS } from "../state/defaults";
import { HABIT_LABELS, classifyPlanet } from "../state/planets";
import {
  CLIMATE_LABELS,
  PLANET_TYPE_LABELS,
} from "../state/defaults";
import {
  PlanetRadialSlots,
  type PlanetRadialInspect,
} from "./PlanetRadialSlots";
import {
  canFactionBuildDef,
  raceIdsFromComposition,
} from "../state/buildingAccess";
import { planetAllowsBuildingBiome } from "../state/biomeMatch";
import { BuildingSlotsPanel } from "./BuildingSlotsPanel";
import {
  buildingKindLabel,
  buildingZoneLabel,
  economyCategoryLabel,
} from "../state/displayLabels";
import { formatPlayerCost } from "../state/economyLabels";
import {
  gradeUpgradeCost,
  MAX_PLANET_GRADE,
  orbitalSlotsForGrade,
  planetOrbitalGrade,
  planetSurfaceGrade,
  surfaceSlotsForGrade,
} from "../state/planetGrade";
import { BuildingKindIcon } from "./BuildingKindIcon";
import { BuildingLaborPanel } from "./BuildingLaborPanel";
import { PlanetLaborTray, type LaborDragFrom } from "./PlanetLaborTray";
import { planetLaborSummary } from "../state/planetLabor";
import { FloatingPanel } from "../ui/FloatingPanel";
import { HoldRevealButton } from "../ui/HoldRevealButton";
import type { MapResourceDef } from "../state/contentCatalog";
import { canBuildWithTech, type TechEcoSlice } from "../state/techGate";
import { collectFaithTabooProperties } from "../state/societyRegistry";
import { InlineRename } from "../ui/InlineRename";
import { BuildDeck } from "./BuildDeck";
import {
  BuildPreview,
  BuildQueue,
  PlanetListSlots,
  planetsThatCanBuildCategory,
  type BuildPreviewResult,
  type BuildQueueItem,
  type SlotViewMode,
} from "./system";
import { PlanetSocietyPanel } from "./society/PlanetSocietyPanel";
import { PlanetRaisePanel } from "./PlanetRaisePanel";
import { PlanetRevoltReadout } from "./PlanetRevoltReadout";
import type { ForceRecruitSession } from "../state/forceRaiseClient";

export type BuildingSlotDef = {
  role: string;
  fillOnly?: boolean;
  require: { category?: string; tier?: string; properties?: string[] };
  count: number;
};

export type BuildingDef = {
  id: string;
  kind: string;
  zone: PlanetBuildingZone;
  name: string;
  ap?: number;
  cost?: Record<string, number>;
  maxPerPlanet?: number;
  maxPerSystem?: number;
  category?: string;
  tier?: number;
  faction?: string;
  requireRoleMilestone?: string;
  prerequisites?: { race?: string; races?: string[] };
  biome_restrictions?: string[];
  slots?: BuildingSlotDef[];
  upkeep_slots?: BuildingSlotDef[];
  laborSlots?: number;
  extractsCategory?: string | string[];
  extractsDeposits?: string | string[];
  effects?: Array<{ effect: string; args: Record<string, unknown> }>;
};

function resolveBuildingDef(
  buildings: Record<string, BuildingDef>,
  b: PlanetBuilding,
): BuildingDef | undefined {
  if (b.buildingId && buildings[b.buildingId]) return buildings[b.buildingId];
  if (buildings[b.id]) return buildings[b.id];
  const byName = Object.values(buildings).find((d) => d.name === b.name);
  if (byName) return byName;
  return Object.values(buildings).find(
    (d) => d.kind === b.kind && (d.zone === b.zone || b.zone === "surface"),
  );
}

export type ColonyDef = {
  id: string;
  colonyType: string;
  name: string;
  colonizeAp?: number;
  colonizeCost?: Record<string, number>;
  colonizePopulation?: number;
  setTypeAp?: number;
  setTypeCost?: Record<string, number>;
};

export type PlanetActionRequest = {
  action:
    | "build"
    | "demolish"
    | "colonize"
    | "set_colony_type"
    | "fill_slot"
    | "staff"
    | "staff_transfer"
    | "rename"
    | "upgrade_grade";
  systemId: string;
  planetId: string;
  buildingId?: string;
  instanceId?: string;
  colonyType?: string;
  sourcePlanetId?: string;
  slotRole?: string;
  slotResourceId?: string;
  assignedLabor?: number | null;
  fromInstanceId?: string | "idle";
  transferAmount?: number;
  name?: string;
  zone?: "surface" | "orbital";
};

function normalizeColonyType(t?: string | null): string {
  if (!t || t === "none") return "none";
  if (t === "capital") return "core";
  return t;
}

function preferListView(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 768px)").matches;
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
  mapResources,
  techEco,
  busy,
  message,
  onAction,
  onBack,
  onOpenResearch,
  buildQueue,
  onChangeBuildQueue,
  onPreviewBuild,
  highlightCategory,
  onShowInEconomy,
  defaultCultureId,
  primaryFaith,
  unlockedLineages,
  onFoundHybrid,
  password,
  onForceRecruitSession,
}: {
  system: StarSystem;
  planet: Planet;
  factionId: string;
  stocks: Record<string, number>;
  reservedAp: number;
  apMax: number;
  buildings: Record<string, BuildingDef>;
  colonies: Record<string, ColonyDef>;
  mapResources?: Record<string, MapResourceDef>;
  techEco?: TechEcoSlice;
  busy?: boolean;
  message?: string | null;
  password?: string;
  onForceRecruitSession?: (data: ForceRecruitSession) => void;
  onAction: (req: PlanetActionRequest) => void;
  onBack: () => void;
  onOpenResearch?: (techId: string) => void;
  buildQueue?: BuildQueueItem[];
  onChangeBuildQueue?: (next: BuildQueueItem[]) => void;
  onPreviewBuild?: (buildingId: string) => Promise<BuildPreviewResult | null>;
  highlightCategory?: string | null;
  onShowInEconomy?: (category: string) => void;
  defaultCultureId?: string;
  primaryFaith?: string;
  unlockedLineages?: string[];
  onFoundHybrid?: (raceA: string, raceB: string) => void;
}) {
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
  const surfaceGrade = planetSurfaceGrade(planet);
  const orbitalGrade = planetOrbitalGrade(planet);
  const surfaceUpgradeCost = gradeUpgradeCost(surfaceGrade);
  const orbitalUpgradeCost = gradeUpgradeCost(orbitalGrade);

  const colonyOptions = useMemo(() => Object.values(colonies), [colonies]);
  const systems = useWorldStore((s) => s.world.systems);
  const currentTurn = useWorldStore((s) => s.world.meta.turn ?? 0);
  const colonizeSources = useMemo(() => {
    if (!canColonize) return [];
    const ownerOf = (sys: StarSystem, p: Planet) =>
      p.ownerFactionId || sys.ownerFactionId || null;
    const same: Array<{
      id: string;
      name: string;
      population: number;
      systemName: string;
      sameSystem: boolean;
    }> = [];
    const other: typeof same = [];
    for (const sys of systems ?? []) {
      for (const p of sys.planets ?? []) {
        if (p.id === planet.id) continue;
        if (ownerOf(sys, p) !== factionId) continue;
        if ((p.population ?? 0) <= 0) continue;
        const row = {
          id: p.id,
          name: p.name || p.id,
          population: p.population ?? 0,
          systemName: sys.name || sys.id,
          sameSystem: sys.id === system.id,
        };
        (row.sameSystem ? same : other).push(row);
      }
    }
    same.sort((a, b) => b.population - a.population);
    other.sort((a, b) => b.population - a.population);
    return same.length ? [...same, ...other] : other;
  }, [canColonize, systems, system.id, planet.id, factionId]);
  const [colonizeSourceId, setColonizeSourceId] = useState("");
  useEffect(() => {
    setColonizeSourceId((prev) => {
      if (prev && colonizeSources.some((p) => p.id === prev)) return prev;
      return colonizeSources[0]?.id ?? "";
    });
  }, [planet.id, colonizeSources]);
  const apLeft = Math.max(0, apMax - reservedAp);
  const [inspect, setInspect] = useState<PlanetRadialInspect | null>(null);
  const [viewMode, setViewMode] = useState<SlotViewMode>(() =>
    preferListView() ? "list" : "radial",
  );
  const [preview, setPreview] = useState<BuildPreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [listDeckZone, setListDeckZone] = useState<"surface" | "orbital" | null>(
    null,
  );
  const [laborPick, setLaborPick] = useState<{
    from: LaborDragFrom;
    amount: number;
  } | null>(null);
  const [laborDrag, setLaborDrag] = useState<{
    from: LaborDragFrom;
    amount: number;
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    setInspect(null);
    setPreview(null);
    setListDeckZone(null);
    setLaborPick(null);
    setLaborDrag(null);
  }, [planet.id]);

  const highlightBuildingIds = useMemo(() => {
    if (!highlightCategory) return [];
    const match = planetsThatCanBuildCategory(
      system,
      factionId,
      highlightCategory,
      buildings,
    ).find((m) => m.planetId === planet.id);
    return match?.buildingIds ?? [];
  }, [highlightCategory, system, factionId, buildings, planet.id]);

  const inspectBuilding = useMemo(() => {
    if (!inspect) return null;
    const all = [...surface, ...orbital];
    const inst = all.find((b) => b.id === inspect.instanceId);
    if (!inst) return null;
    const def = resolveBuildingDef(buildings, inst);
    return { inst, def };
  }, [inspect, surface, orbital, buildings]);

  const laborSum = useMemo(
    () => planetLaborSummary(planet, buildings),
    [planet, buildings],
  );

  const clearLaborUi = () => {
    setLaborPick(null);
    setLaborDrag(null);
  };

  const transferLabor = useCallback(
    (from: LaborDragFrom, to: LaborDragFrom, amount = 1) => {
      if (busy) return;
      if (from === to) {
        clearLaborUi();
        return;
      }
      onAction({
        action: "staff_transfer",
        systemId: system.id,
        planetId: planet.id,
        fromInstanceId: from,
        instanceId: to,
        transferAmount: amount,
      });
      clearLaborUi();
    },
    [busy, onAction, system.id, planet.id],
  );

  useEffect(() => {
    if (!laborDrag) return;
    const onMove = (e: PointerEvent) => {
      setLaborDrag((d) => (d ? { ...d, x: e.clientX, y: e.clientY } : null));
    };
    const onUp = (e: PointerEvent) => {
      const stack = document.elementsFromPoint(e.clientX, e.clientY);
      let dest: LaborDragFrom | null = null;
      for (const el of stack) {
        if (!(el instanceof Element)) continue;
        const tray = el.closest("[data-labor-tray]");
        if (tray) {
          dest = "idle";
          break;
        }
        const drop = el.closest("[data-labor-drop]") as HTMLElement | null;
        if (drop?.dataset.laborDrop) {
          dest = drop.dataset.laborDrop;
          break;
        }
      }
      const src = laborDrag.from;
      const amt = laborDrag.amount;
      setLaborDrag(null);
      if (dest && dest !== src) transferLabor(src, dest, amt);
      else setLaborPick(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [laborDrag?.from, laborDrag?.amount, busy, transferLabor]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        clearLaborUi();
        return;
      }
      if (!inspectBuilding?.inst || !inspectBuilding.def) return;
      if (e.key !== "[" && e.key !== "]") return;
      e.preventDefault();
      const amount = e.shiftKey ? 5 : 1;
      const id = inspectBuilding.inst.id;
      if (e.key === "]") transferLabor("idle", id, amount);
      else transferLabor(id, "idle", amount);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [inspectBuilding, busy, transferLabor]);

  const faithTaboos = useMemo(
    () => collectFaithTabooProperties(planet, primaryFaith),
    [planet, primaryFaith],
  );

  const requestPreview = async (buildingId: string) => {
    if (!onPreviewBuild) return;
    setPreviewLoading(true);
    try {
      setPreview(await onPreviewBuild(buildingId));
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <div className="planet-detail planet-detail--manage">
      <div className="planet-detail-head">
        <button type="button" className="btn ghost" onClick={onBack}>
          ← К системе
        </button>
        <span className={`habit-badge ${habit}`}>{HABIT_LABELS[habit]}</span>
      </div>
      <h3 className="planet-detail-title">
        {managed ? (
          <InlineRename
            value={planet.name}
            title="Переименовать планету"
            onCommit={(name) =>
              onAction({
                action: "rename",
                systemId: system.id,
                planetId: planet.id,
                name,
              })
            }
          />
        ) : (
          planet.name
        )}
      </h3>

      <div
        className="planet-manage-metrics planet-manage-metrics--slim"
        aria-label="Сводка планеты"
      >
        <div className="planet-manage-metric">
          <span className="hint">Тип</span>
          <strong>
            {PLANET_TYPE_LABELS[planet.type]} · {CLIMATE_LABELS[planet.climate]}
          </strong>
        </div>
        <div className="planet-manage-metric">
          <span className="hint">Колония</span>
          <strong>
            {COLONY_TYPE_LABELS[normalizeColonyType(planet.colonyType)] ??
              planet.colonyType ??
              "—"}
            {planet.population > 0 ? ` · ${planet.population}` : ""}
          </strong>
        </div>
        <div className="planet-manage-metric">
          <span className="hint">Слоты</span>
          <strong>
            пов. {surface.length}/{surfaceMax} · г.{surfaceGrade}/{MAX_PLANET_GRADE}
            {" · "}
            орб. {orbital.length}/{orbitalMax} · г.{orbitalGrade}/{MAX_PLANET_GRADE}
          </strong>
        </div>
      </div>

      <PlanetRevoltReadout planet={planet} currentTurn={currentTurn} />

      {highlightCategory && (
        <div className="sys-eco-hint fx-glow" role="status">
          <strong>Дефицит категории {highlightCategory}</strong>
          <em>
            Подсвечены слоты, где можно построить производство{" "}
            {highlightCategory}
          </em>
        </div>
      )}

      {message && <p className="hint planet-manage-msg">{message}</p>}

      {canColonize && (
        <section className="planet-manage-block">
          <h4>Колонизация</h4>
          <p className="hint">
            Переселенцы уходят с выбранной планеты (расовый состав колонии —
            с источника). Зажми карту: ресурсы и ОД списываются сразу.
          </p>
          {colonizeSources.length === 0 ? (
            <p className="hint">
              Нет своей населённой планеты — переселять некого.
            </p>
          ) : (
            <label className="hint">
              Источник населения
              <select
                value={colonizeSourceId}
                onChange={(e) => setColonizeSourceId(e.target.value)}
                disabled={busy}
              >
                {colonizeSources.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.sameSystem
                      ? `${p.name} · ${p.population}`
                      : `${p.name} · ${p.systemName} · ${p.population}`}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="planet-manage-grid">
            {colonyOptions.map((c) => (
              <HoldRevealButton
                key={c.id}
                className="btn ghost planet-manage-card"
                disabled={
                  busy ||
                  !colonizeSourceId ||
                  apLeft < (c.colonizeAp ?? 1)
                }
                holdMs={800}
                title={`${c.name} — зажми, чтобы колонизировать`}
                onHoldComplete={() =>
                  onAction({
                    action: "colonize",
                    systemId: system.id,
                    planetId: planet.id,
                    colonyType: c.colonyType,
                    sourcePlanetId: colonizeSourceId,
                  })
                }
              >
                <strong>{c.name}</strong>
                <span className="hint">
                  {formatPlayerCost(c.colonizeCost)} · {c.colonizeAp ?? 1} ОД
                  {c.colonizePopulation
                    ? ` · ${c.colonizePopulation} нас.`
                    : ""}{" "}
                  · зажми
                </span>
              </HoldRevealButton>
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
            <h4>Грейд слотов</h4>
            <p className="hint">
              Слоты растут покупкой грейда (1–5), не от размера столицы.
              Поверхность {surfaceSlotsForGrade(surfaceGrade)} →{" "}
              {surfaceGrade < MAX_PLANET_GRADE
                ? surfaceSlotsForGrade(surfaceGrade + 1)
                : surfaceSlotsForGrade(MAX_PLANET_GRADE)}
              ; орбита {orbitalSlotsForGrade(orbitalGrade)} →{" "}
              {orbitalGrade < MAX_PLANET_GRADE
                ? orbitalSlotsForGrade(orbitalGrade + 1)
                : orbitalSlotsForGrade(MAX_PLANET_GRADE)}
              .
            </p>
            <div className="planet-manage-grid">
              <HoldRevealButton
                className="btn ghost planet-manage-card"
                disabled={
                  busy ||
                  !surfaceUpgradeCost ||
                  apLeft < 1
                }
                holdMs={800}
                title="Зажми, чтобы расширить поверхность"
                onHoldComplete={() =>
                  onAction({
                    action: "upgrade_grade",
                    systemId: system.id,
                    planetId: planet.id,
                    zone: "surface",
                  })
                }
              >
                <strong>Поверхность {surfaceGrade}→{Math.min(MAX_PLANET_GRADE, surfaceGrade + 1)}</strong>
                <span className="hint">
                  {surfaceUpgradeCost
                    ? `${formatPlayerCost(surfaceUpgradeCost)} · 1 ОД · зажми`
                    : "максимум"}
                </span>
              </HoldRevealButton>
              <HoldRevealButton
                className="btn ghost planet-manage-card"
                disabled={
                  busy ||
                  !orbitalUpgradeCost ||
                  apLeft < 1
                }
                holdMs={800}
                title="Зажми, чтобы расширить орбиту"
                onHoldComplete={() =>
                  onAction({
                    action: "upgrade_grade",
                    systemId: system.id,
                    planetId: planet.id,
                    zone: "orbital",
                  })
                }
              >
                <strong>Орбита {orbitalGrade}→{Math.min(MAX_PLANET_GRADE, orbitalGrade + 1)}</strong>
                <span className="hint">
                  {orbitalUpgradeCost
                    ? `${formatPlayerCost(orbitalUpgradeCost)} · 1 ОД · зажми`
                    : "максимум"}
                </span>
              </HoldRevealButton>
            </div>
          </section>
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
                    title={`${formatPlayerCost(c.setTypeCost)} · ${c.setTypeAp ?? 1} ОД`}
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

          <PlanetSocietyPanel
            planet={planet}
            managed={managed}
            busy={busy}
            apLeft={apLeft}
            defaultCultureId={defaultCultureId}
            primaryFaith={primaryFaith}
            unlockedLineages={unlockedLineages}
            onFoundHybrid={onFoundHybrid}
          />

          {password && onForceRecruitSession && (
            <PlanetRaisePanel
              system={system}
              planet={planet}
              factionId={factionId}
              password={password}
              stocks={stocks}
              busy={busy}
              techEco={techEco}
              onSession={onForceRecruitSession}
            />
          )}

          <section className="planet-manage-block">
            <div className="planet-detail-head" style={{ marginBottom: 8 }}>
              <h4 style={{ margin: 0 }}>Строительство</h4>
              <div className="planet-radial-stats">
                <span className="hint tabular">
                  занято {Math.round(laborSum.used)}/{Math.round(laborSum.slots)} · свободно{" "}
                  {Math.round(laborSum.free)}
                </span>
                <span className="hint">
                  {formatOdMeter(reservedAp, apMax)}
                  {apLeft === 0 ? " · нет ОД" : ""}
                </span>
                <div
                  className="sys-view-toggle"
                  role="group"
                  aria-label="Вид слотов"
                >
                  <button
                    type="button"
                    className={viewMode === "radial" ? "is-on" : ""}
                    onClick={() => setViewMode("radial")}
                  >
                    Кольцо
                  </button>
                  <button
                    type="button"
                    className={viewMode === "list" ? "is-on" : ""}
                    onClick={() => setViewMode("list")}
                  >
                    Список
                  </button>
                </div>
              </div>
            </div>

            {onChangeBuildQueue && (
              <BuildQueue
                queue={buildQueue ?? []}
                buildings={buildings}
                systemId={system.id}
                planetId={planet.id}
                stocks={stocks}
                busy={busy}
                onChangeQueue={onChangeBuildQueue}
              />
            )}

            {(preview || previewLoading) && (
              <BuildPreview
                preview={preview}
                loading={previewLoading}
                stocks={stocks}
                onCancel={() => setPreview(null)}
              />
            )}

            <PlanetLaborTray
              planet={planet}
              catalog={buildings}
              busy={busy}
              pickFrom={laborPick?.from ?? null}
              dragging={!!laborDrag}
              onPickIdle={() =>
                setLaborPick({ from: "idle", amount: 1 })
              }
              onDragIdle={(x, y, amount) =>
                setLaborDrag({ from: "idle", amount, x, y })
              }
            />

            {viewMode === "radial" ? (
              <PlanetRadialSlots
                planet={planet}
                systemId={system.id}
                planetId={planet.id}
                factionId={factionId}
                raceIds={raceIdsFromComposition(planet.raceComposition)}
                buildings={buildings}
                stocks={stocks}
                reservedAp={reservedAp}
                apMax={apMax}
                techEco={techEco}
                busy={busy}
                onAction={onAction}
                onInspect={setInspect}
                onOpenResearch={onOpenResearch}
                highlightCategory={highlightCategory}
                highlightBuildingIds={highlightBuildingIds}
                onSelectBuilding={(id) => void requestPreview(id)}
                laborPickFrom={laborPick?.from ?? null}
                laborDragging={!!laborDrag}
                onLaborPickBuilding={(id, amount) =>
                  setLaborPick({ from: id, amount })
                }
                onLaborDragBuilding={(id, x, y, amount) =>
                  setLaborDrag({ from: id, amount, x, y })
                }
                onLaborTapBuilding={(id) => {
                  if (laborPick) {
                    transferLabor(laborPick.from, id, laborPick.amount);
                  }
                }}
              />
            ) : (
              <PlanetListSlots
                planet={planet}
                systemId={system.id}
                planetId={planet.id}
                buildings={buildings}
                busy={busy}
                highlightCategory={highlightCategory}
                highlightBuildingIds={highlightBuildingIds}
                onAction={onAction}
                onInspect={(instanceId, kind) => {
                  const all = [...surface, ...orbital];
                  const inst = all.find((b) => b.id === instanceId);
                  setInspect({
                    instanceId,
                    name: inst?.name ?? kind,
                    kind,
                    zone: inst?.zone === "orbital" ? "orbital" : "surface",
                  });
                }}
                onRequestBuild={(zone) => setListDeckZone(zone)}
                laborPickFrom={laborPick?.from ?? null}
                laborDragging={!!laborDrag}
                onLaborPickBuilding={(id, amount) =>
                  setLaborPick({ from: id, amount })
                }
                onLaborDragBuilding={(id, x, y, amount) =>
                  setLaborDrag({ from: id, amount, x, y })
                }
                onLaborTapBuilding={(id) => {
                  if (laborPick) {
                    transferLabor(laborPick.from, id, laborPick.amount);
                  }
                }}
              />
            )}

            {viewMode === "list" && listDeckZone && (
              <FloatingPanel
                open
                onClose={() => setListDeckZone(null)}
                title={`Колода · ${listDeckZone === "orbital" ? "Орбита" : "Поверхность"}`}
                storageKey="gmap-planet-build-deck-list"
                defaultGeom={{ x: 20, y: 120, w: 270, h: 420 }}
                minW={220}
                minH={200}
                zIndex={370}
                className="gmap-float-panel--build-deck"
              >
                <BuildDeck
                  embedded
                  defs={Object.values(buildings).filter(
                    (b) =>
                      (listDeckZone === "orbital"
                        ? b.zone === "orbital"
                        : b.zone !== "orbital") &&
                      canFactionBuildDef(b, factionId, {
                        raceIds: raceIdsFromComposition(planet.raceComposition),
                      }) &&
                      canBuildWithTech(techEco, b).ok &&
                      planetAllowsBuildingBiome(planet, b.biome_restrictions),
                  )}
                  stocks={stocks}
                  apLeft={apLeft}
                  techEco={techEco}
                  busy={busy}
                  selectedId={null}
                  dragId={null}
                  zoneLabel={
                    listDeckZone === "orbital" ? "Орбита" : "Поверхность"
                  }
                  slotArmed
                  highlightCategory={highlightCategory}
                  highlightBuildingIds={highlightBuildingIds}
                  onSelect={(id) => void requestPreview(id)}
                  onHoldBuild={(id) => {
                    onAction({
                      action: "build",
                      systemId: system.id,
                      planetId: planet.id,
                      buildingId: id,
                    });
                    setListDeckZone(null);
                  }}
                  onDragStart={(id) => void requestPreview(id)}
                  onClose={() => setListDeckZone(null)}
                  onOpenResearch={onOpenResearch}
                />
              </FloatingPanel>
            )}
          </section>

          {inspectBuilding?.def && inspectBuilding.inst && (
            <FloatingPanel
              open={!!inspect}
              onClose={() => setInspect(null)}
              title={inspectBuilding.def.name}
              storageKey="gmap-planet-inspect"
              defaultGeom={{ x: 320, y: 100, w: 340, h: 460 }}
              minW={260}
              minH={220}
              zIndex={372}
              className="gmap-float-panel--inspect"
            >
              <div className="planet-manage-inspect-head">
                <BuildingKindIcon kind={inspect!.kind} size={18} />
                <div>
                  <strong>{inspectBuilding.def.name}</strong>
                  <div className="hint" style={{ fontSize: 10 }}>
                    {buildingZoneLabel(inspectBuilding.def.zone)} ·{" "}
                    {buildingKindLabel(inspectBuilding.def.kind)}
                    {inspectBuilding.def.tier != null
                      ? ` · T${inspectBuilding.def.tier}`
                      : ""}
                  </div>
                </div>
              </div>
              {inspectBuilding.def.category && onShowInEconomy && (
                <button
                  type="button"
                  className="btn ghost"
                  style={{ marginBottom: 8 }}
                  onClick={() =>
                    onShowInEconomy(String(inspectBuilding.def!.category))
                  }
                >
                  В экономике ({economyCategoryLabel(String(inspectBuilding.def!.category))})
                </button>
              )}
              <BuildingLaborPanel
                planet={planet}
                inst={inspectBuilding.inst}
                def={inspectBuilding.def}
                catalog={buildings}
                busy={busy}
                onStaff={(assignedLabor) =>
                  onAction({
                    action: "staff",
                    systemId: system.id,
                    planetId: planet.id,
                    instanceId: inspectBuilding.inst.id,
                    assignedLabor,
                  })
                }
              />
              <p className="hint">
                Слоты ресурсов: tier режет узкое место. Тап по кольцу выбирает
                постройку.
              </p>
              <BuildingSlotsPanel
                building={inspectBuilding.inst}
                buildingDef={inspectBuilding.def}
                mapResources={mapResources}
                localResourceNames={planet.resources}
                techEco={techEco}
                faithTabooProperties={faithTaboos}
                busy={busy}
                onFill={(role, resourceId) =>
                  onAction({
                    action: "fill_slot",
                    systemId: system.id,
                    planetId: planet.id,
                    instanceId: inspectBuilding.inst.id,
                    slotRole: role,
                    slotResourceId: resourceId,
                  })
                }
                onUnfill={(role) =>
                  onAction({
                    action: "fill_slot",
                    systemId: system.id,
                    planetId: planet.id,
                    instanceId: inspectBuilding.inst.id,
                    slotRole: role,
                    slotResourceId: "",
                  })
                }
              />
            </FloatingPanel>
          )}
        </>
      )}
      {laborDrag &&
        createPortal(
          <div
            className="labor-token-ghost"
            style={{ left: laborDrag.x, top: laborDrag.y }}
          >
            <i className="labor-pip is-on" />
            {laborDrag.amount > 1 ? (
              <span>×{laborDrag.amount}</span>
            ) : null}
          </div>,
          document.body,
        )}
    </div>
  );
}
