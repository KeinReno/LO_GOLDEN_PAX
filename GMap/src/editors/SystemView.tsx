import { useMemo, useState, useEffect } from "react";
import { useWorldStore } from "../state/worldStore";
import type {
  Climate,
  ColonyType,
  Planet,
  PlanetBuilding,
  PlanetBuildingKind,
  PlanetBuildingZone,
  PlanetType,
  StarSystem,
  StationKind,
  SystemPoiType,
} from "../state/types";
import {
  classifyPlanet,
  HABIT_LABELS,
  isCorridorSystem,
} from "../state/planets";
import {
  CLIMATE_LABELS,
  COLONY_TYPE_LABELS,
  canonicalColonyType,
  colonyTypeLabel,
  PLANET_BUILDING_KIND_LABELS,
  PLANET_TYPE_LABELS,
  SYSTEM_ACTIVITY_LABELS,
  SYSTEM_POI_LABELS,
  STATION_KIND_LABELS,
} from "../state/defaults";
import { paintTagList, resourcesHas, toggleDeposit } from "../state/depositPaint";
import { getCachedContent } from "../state/contentCatalog";
import {
  defaultGmCatalogBuilding,
  gmBuildingOptionLabel,
  listGmCatalogBuildings,
  patchFromCatalogDef,
} from "../state/gmCatalogBuildings";
import { resourceDisplayName } from "../state/economyLabels";
import { buildingZoneLabel } from "../state/displayLabels";
import {
  SystemSchematic,
  type SchematicContextEvent,
  type SchematicFeature,
} from "./SystemSchematic";
import { GmPlanetStage } from "./GmPlanetStage";
import { SystemEditor } from "./SystemEditor";
import { v4 as uuid } from "uuid";
import {
  PlayerPlanetManage,
  type BuildingDef,
  type ColonyDef,
  type PlanetActionRequest,
} from "../viewer/PlayerPlanetManage";
import { SystemStatusStrip } from "../viewer/SystemStatusStrip";
import { SystemDiveDock } from "../viewer/SystemDiveDock";
import { resolvePoiIntel } from "../viewer/poiIntel";
import { GmPlanetSocietyFields } from "./GmPlanetSocietyFields";
import { InlineRename } from "../ui/InlineRename";
import {
  SystemCommandPanel,
  type SystemActionRequest,
} from "../viewer/SystemCommandPanel";
import {
  systemMineInfo,
  systemMineLabel,
} from "../viewer/depositMining";
import { planetContributionChips } from "../viewer/planetContributions";
import { ActionRing, type ActionRingItem } from "../ui/ActionRing";
import type { TechEcoSlice } from "../state/techGate";
import { Pickaxe, Eye, Wrench, Trash2, Rocket, Flag, Plus } from "lucide-react";
import { PlanetRevoltReadout } from "../viewer/PlanetRevoltReadout";
import { isInputFocused } from "../viewer/hooks/isInputFocused";

/** Override galaxy/system/planet navigation (player map layer vs GM dossier). */
export type SystemViewNav = {
  onGalaxyBack: () => void;
  onOpenSystem: (systemId: string) => void;
  onOpenPlanet: (systemId: string, planetId: string) => void;
  selectedPlanetId?: string | null;
};

export type PlayerPlanetManageProps = {
  factionId: string;
  stocks: Record<string, number>;
  reservedAp: number;
  apMax: number;
  buildings: Record<string, BuildingDef>;
  colonies: Record<string, ColonyDef>;
  mapResources?: Record<string, import("../state/contentCatalog").MapResourceDef>;
  techEco?: TechEcoSlice;
  busy?: boolean;
  message?: string | null;
  onAction: (req: PlanetActionRequest) => void;
  onOpenResearch?: (techId: string) => void;
  buildQueue?: import("../viewer/system").BuildQueueItem[];
  onChangeBuildQueue?: (
    next: import("../viewer/system").BuildQueueItem[],
  ) => void;
  onPreviewBuild?: (
    buildingId: string,
  ) => Promise<import("../viewer/system").BuildPreviewResult | null>;
  highlightCategory?: string | null;
  onShowInEconomy?: (category: string) => void;
  defaultCultureId?: string;
  primaryFaith?: string;
  unlockedLineages?: string[];
  onFoundHybrid?: (raceA: string, raceB: string) => void;
  password?: string;
  onForceRecruitSession?: (
    data: import("../state/forceRaiseClient").ForceRecruitSession,
  ) => void;
};

export type PlayerSystemManageProps = {
  factionId: string;
  stocks: Record<string, number>;
  reservedAp: number;
  apMax: number;
  unlockedProperties?: string[];
  ships: Record<string, { id: string; name: string; tier?: number; faction?: string }>;
  units: Record<string, { id: string; name: string; tier?: number; faction?: string }>;
  mapResourceNames?: Record<string, string>;
  busy?: boolean;
  message?: string | null;
  onAction: (req: SystemActionRequest) => void;
  flowData?: import("../viewer/economyFlowTypes").EconomyFlowBreakdown | null;
  buildings?: Record<string, BuildingDef>;
  highlightCategory?: string | null;
  onHighlightCategory?: (letter: string | null) => void;
  /** Open stations/produce deck when diving (e.g. from Forces → верфь). */
  preferDeck?: "stations" | "produce" | null;
  preferProduceTab?: "ships" | "units";
  /** Target fleet/legion when producing from Forces deck. */
  produceFleetId?: string | null;
  produceLegionId?: string | null;
  onSetProduceTab?: (tab: "ships" | "units") => void;
};

/** Full drill-down: Galaxy → System schematic → Planet card. */
export function SystemView({
  system,
  readOnly = false,
  playerFactionId,
  onSelectOwnFleet,
  onSelectOwnLegion,
  planetManage,
  systemManage,
  nav,
}: {
  system: StarSystem;
  /** Player /view — look only, no GM edit tools. */
  readOnly?: boolean;
  playerFactionId?: string;
  onSelectOwnFleet?: (fleetId: string) => void;
  onSelectOwnLegion?: (legionId: string) => void;
  /** When set, owned/empty planets open player construction UI. */
  planetManage?: PlayerPlanetManageProps;
  /** System stations + ship/unit production (player dive). */
  systemManage?: PlayerSystemManageProps;
  /** Player map overlay — avoid GM dossier store hooks. */
  nav?: SystemViewNav;
}) {
  const world = useWorldStore((s) => s.world);
  const mapFocus = useWorldStore((s) => s.mapFocus);
  const selectedFleetIdState = useWorldStore((s) => s.selectedFleetId);
  const selectedLegionIdState = useWorldStore((s) => s.selectedLegionId);
  const openPlanetView = useWorldStore((s) => s.openPlanetView);
  const openSystemView = useWorldStore((s) => s.openSystemView);
  const closeSystemView = useWorldStore((s) => s.closeSystemView);
  const updatePlanet = useWorldStore((s) => s.updatePlanet);
  const updateSelectedSystem = useWorldStore((s) => s.updateSelectedSystem);
  const addPlanet = useWorldStore((s) => s.addPlanet);
  const removePlanet = useWorldStore((s) => s.removePlanet);
  const activeFactionId = useWorldStore((s) => s.activeFactionId);
  const tool = useWorldStore((s) => s.tool);
  const activeResource = useWorldStore((s) => s.activeResource);
  const paintResourceOnSystem = useWorldStore((s) => s.paintResourceOnSystem);
  const paintResourceOnPlanet = useWorldStore((s) => s.paintResourceOnPlanet);
  const paintPlanetOwner = useWorldStore((s) => s.paintPlanetOwner);
  const paintPlanetCoOwner = useWorldStore((s) => s.paintPlanetCoOwner);
  const togglePlanetContested = useWorldStore((s) => s.togglePlanetContested);
  const paintingRes = !readOnly && tool === "paint_resource";
  const paintingOwner = !readOnly && tool === "paint_faction";
  const paintingCo = !readOnly && tool === "paint_coowner";
  const paintingContest = !readOnly && tool === "mark_contested";

  const applyPlanetTool = (planetId: string) => {
    if (paintingRes) {
      paintResourceOnPlanet(system.id, planetId);
      return true;
    }
    if (paintingOwner) {
      paintPlanetOwner(system.id, planetId);
      return true;
    }
    if (paintingCo) {
      paintPlanetCoOwner(system.id, planetId);
      return true;
    }
    if (paintingContest) {
      togglePlanetContested(system.id, planetId);
      return true;
    }
    return false;
  };

  const goGalaxy = nav?.onGalaxyBack ?? closeSystemView;
  const goSystem = nav?.onOpenSystem ?? openSystemView;
  const goPlanet = nav?.onOpenPlanet ?? openPlanetView;

  const selectedPlanetId =
    nav?.selectedPlanetId !== undefined
      ? nav.selectedPlanetId
      : mapFocus.level === "planet" && mapFocus.systemId === system.id
        ? mapFocus.planetId
        : null;

  const planet = useMemo(
    () => system.planets.find((p) => p.id === selectedPlanetId) ?? null,
    [system.planets, selectedPlanetId],
  );

  const fleetsHere = world.fleets.filter((f) => f.systemId === system.id);
  const legionsHere = world.legions.filter((l) => l.systemId === system.id);
  const owner = world.factions.find((f) => f.id === system.ownerFactionId);
  const [selectedStationId, setSelectedStationId] = useState<string | null>(
    null,
  );
  const [selectedFeature, setSelectedFeature] =
    useState<SchematicFeature | null>(null);
  /** Soft planet focus (tap) — not full manage drill. */
  const [previewPlanetId, setPreviewPlanetId] = useState<string | null>(null);
  /** Spatial place-on-belt. */
  const [placeMode, setPlaceMode] = useState(false);
  const [placingKind, setPlacingKind] = useState<StationKind | null>(null);
  const [pendingBeltAngle, setPendingBeltAngle] = useState<number | null>(
    null,
  );
  const [forceDeck, setForceDeck] = useState<"stations" | "produce" | null>(
    null,
  );
  const [ctxRing, setCtxRing] = useState<{
    x: number;
    y: number;
    items: ActionRingItem[];
  } | null>(null);

  useEffect(() => {
    const pref = systemManage?.preferDeck;
    if (pref === "produce" || pref === "stations") {
      setForceDeck(pref);
    }
  }, [system.id, systemManage?.preferDeck]);

  const playerDive = !!(readOnly && systemManage);
  const gmDive = !readOnly;
  const immersive = playerDive || gmDive;
  const canBuildBelt =
    gmDive ||
    (playerDive &&
      !!systemManage &&
      system.ownerFactionId === systemManage.factionId);
  const drilledPlanet = planet;
  const previewPlanet = useMemo(
    () =>
      previewPlanetId
        ? (system.planets.find((p) => p.id === previewPlanetId) ?? null)
        : null,
    [system.planets, previewPlanetId],
  );
  const mineInfo = systemMineInfo(system, systemManage?.factionId);
  const showBeltDock =
    playerDive &&
    (placeMode ||
      !!selectedFeature ||
      !!selectedStationId ||
      forceDeck === "stations" ||
      forceDeck === "produce");

  const clearPlace = () => {
    setPlaceMode(false);
    setPlacingKind(null);
    setPendingBeltAngle(null);
    setForceDeck(null);
  };

  const clearSoft = () => {
    setSelectedFeature(null);
    setSelectedStationId(null);
    setPreviewPlanetId(null);
    clearPlace();
  };

  useEffect(() => {
    if (!immersive || drilledPlanet) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (isInputFocused(e.target)) return;
      if (
        !placeMode &&
        !selectedFeature &&
        !selectedStationId &&
        !previewPlanetId &&
        !forceDeck
      ) {
        return;
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      clearSoft();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [
    immersive,
    drilledPlanet,
    placeMode,
    selectedFeature,
    selectedStationId,
    previewPlanetId,
    forceDeck,
  ]);

  const commitStation = (kind: StationKind, angle: number) => {
    if (!systemManage) return;
    systemManage.onAction({
      action: "build_station",
      systemId: system.id,
      stationKind: kind,
      beltAngle: angle,
    });
    clearPlace();
    setSelectedFeature(null);
  };

  const commitGmStation = (kind: StationKind, angle?: number | null) => {
    const factionId = activeFactionId || system.ownerFactionId;
    updateSelectedSystem({
      stations: [
        ...(system.stations ?? []),
        {
          id: uuid(),
          name: STATION_KIND_LABELS[kind] ?? kind,
          kind,
          factionId,
          beltAngle: angle ?? undefined,
        },
      ],
    });
    clearPlace();
  };

  const removeGmStation = (stationId: string) => {
    updateSelectedSystem({
      stations: (system.stations ?? []).filter((s) => s.id !== stationId),
    });
    setSelectedStationId(null);
  };

  const armPlace = (kind?: StationKind | null) => {
    if (drilledPlanet) goSystem(system.id);
    setPreviewPlanetId(null);
    setSelectedStationId(null);
    setPlaceMode(true);
    setPlacingKind(kind ?? null);
    setForceDeck("stations");
  };

  const handleSchematicContext = (ev: SchematicContextEvent) => {
    const items: ActionRingItem[] = [];
    const t = ev.target;

    if (gmDive) {
      if (t.kind === "planet") {
        const pl = system.planets.find((p) => p.id === t.planetId);
        items.push({
          id: "preview",
          label: "Осмотр",
          icon: <Eye size={14} />,
          onSelect: () => {
            setPreviewPlanetId(t.planetId);
            if (drilledPlanet) goSystem(system.id);
          },
        });
        items.push({
          id: "edit",
          label: "Править",
          icon: <Wrench size={14} />,
          onSelect: () => goPlanet(system.id, t.planetId),
        });
        items.push({
          id: "contest",
          label: pl?.contested ? "Снять спор" : "Спорная",
          icon: <Flag size={14} />,
          onSelect: () => togglePlanetContested(system.id, t.planetId),
        });
        if (paintingRes || paintingOwner) {
          items.push({
            id: "paint",
            label: paintingRes ? "Кисть ресурса" : "Кисть владельца",
            icon: <Pickaxe size={14} />,
            onSelect: () => {
              applyPlanetTool(t.planetId);
            },
          });
        }
        items.push({
          id: "del-planet",
          label: "Удалить мир",
          icon: <Trash2 size={14} />,
          danger: true,
          onSelect: () => {
            removePlanet(t.planetId);
            setPreviewPlanetId(null);
            goSystem(system.id);
          },
        });
      } else if (t.kind === "deposit") {
        items.push({
          id: "inspect",
          label: "Осмотр",
          icon: <Eye size={14} />,
          onSelect: () => {
            setSelectedFeature({ kind: "deposit", resourceId: t.resourceId });
            setPreviewPlanetId(null);
          },
        });
        items.push({
          id: "mine",
          label: "Добыча здесь",
          icon: <Pickaxe size={14} />,
          onSelect: () => commitGmStation("mining", t.beltAngle),
        });
      } else if (t.kind === "station") {
        items.push({
          id: "st-select",
          label: "Выбрать",
          icon: <Eye size={14} />,
          onSelect: () => {
            setSelectedStationId(t.stationId);
            setPlaceMode(false);
            setPreviewPlanetId(null);
          },
        });
        items.push({
          id: "st-del",
          label: "Удалить станцию",
          icon: <Trash2 size={14} />,
          danger: true,
          onSelect: () => removeGmStation(t.stationId),
        });
      } else if (t.kind === "belt") {
        items.push({
          id: "belt-mine",
          label: "Добыча",
          icon: <Pickaxe size={14} />,
          onSelect: () => commitGmStation("mining", t.beltAngle),
        });
        items.push({
          id: "belt-sci",
          label: "Наука",
          icon: <Plus size={14} />,
          onSelect: () => commitGmStation("science", t.beltAngle),
        });
        items.push({
          id: "belt-mil",
          label: "Военная",
          icon: <Flag size={14} />,
          onSelect: () => commitGmStation("military", t.beltAngle),
        });
        if (!isCorridorSystem(system)) {
          items.push({
            id: "add-planet",
            label: "+ Планета",
            icon: <Plus size={14} />,
            onSelect: () => addPlanet(),
          });
        }
      } else if (t.kind === "poi") {
        items.push({
          id: "poi",
          label: "Осмотр",
          icon: <Eye size={14} />,
          onSelect: () => {
            setSelectedFeature({
              kind: "poi",
              tag: t.tag,
              index: t.index,
            });
            setPreviewPlanetId(null);
          },
        });
      }
      if (items.length === 0) return;
      setCtxRing({ x: ev.clientX, y: ev.clientY, items });
      return;
    }

    if (!playerDive || !systemManage) return;

    if (t.kind === "planet") {
      const pl = system.planets.find((p) => p.id === t.planetId);
      items.push({
        id: "preview",
        label: "Осмотр",
        icon: <Eye size={14} />,
        onSelect: () => {
          setPreviewPlanetId(t.planetId);
          if (drilledPlanet) goSystem(system.id);
        },
      });
      items.push({
        id: "manage",
        label: "Управлять",
        icon: <Wrench size={14} />,
        onSelect: () => goPlanet(system.id, t.planetId),
      });
      const empty =
        pl &&
        (pl.population ?? 0) <= 0 &&
        (!pl.colonyType || pl.colonyType === "none");
      if (
        empty &&
        system.ownerFactionId === systemManage.factionId &&
        pl?.colonizable !== false
      ) {
        items.push({
          id: "colonize",
          label: "Колонизировать",
          icon: <Rocket size={14} />,
          onSelect: () => goPlanet(system.id, t.planetId),
        });
      }
    } else if (t.kind === "deposit") {
      items.push({
        id: "inspect",
        label: "Осмотр",
        icon: <Eye size={14} />,
        onSelect: () => {
          setSelectedFeature({ kind: "deposit", resourceId: t.resourceId });
          setPreviewPlanetId(null);
        },
      });
      if (canBuildBelt && mineInfo.status === "none") {
        items.push({
          id: "mine-here",
          label: "Добыча здесь",
          icon: <Pickaxe size={14} />,
          onSelect: () => {
            commitStation("mining", t.beltAngle);
            setSelectedFeature({ kind: "deposit", resourceId: t.resourceId });
          },
        });
        items.push({
          id: "mine-aim",
          label: "Выбрать точку",
          icon: <Pickaxe size={14} />,
          onSelect: () => {
            setSelectedFeature({ kind: "deposit", resourceId: t.resourceId });
            armPlace("mining");
            setPendingBeltAngle(t.beltAngle);
          },
        });
      }
    } else if (t.kind === "station") {
      const st = (system.stations ?? []).find((s) => s.id === t.stationId);
      items.push({
        id: "st-select",
        label: "Выбрать",
        icon: <Eye size={14} />,
        onSelect: () => {
          setSelectedStationId(t.stationId);
          setPlaceMode(false);
          setPreviewPlanetId(null);
        },
      });
      if (st && st.factionId === systemManage.factionId) {
        items.push({
          id: "st-demo",
          label: "Снести",
          icon: <Trash2 size={14} />,
          danger: true,
          onSelect: () => {
            systemManage.onAction({
              action: "demolish_station",
              systemId: system.id,
              stationId: t.stationId,
            });
          },
        });
      }
    } else if (t.kind === "belt") {
      if (canBuildBelt) {
        items.push({
          id: "belt-mine",
          label: "Добыча",
          icon: <Pickaxe size={14} />,
          disabled: mineInfo.status === "own",
          onSelect: () => commitStation("mining", t.beltAngle),
        });
        items.push({
          id: "belt-place",
          label: "Другая станция",
          icon: <Wrench size={14} />,
          onSelect: () => {
            armPlace(null);
            setPendingBeltAngle(t.beltAngle);
          },
        });
      }
    } else if (t.kind === "poi") {
      items.push({
        id: "poi",
        label: "Осмотр",
        icon: <Eye size={14} />,
        onSelect: () => {
          setSelectedFeature({
            kind: "poi",
            tag: t.tag,
            index: t.index,
          });
          setPreviewPlanetId(null);
        },
      });
    }

    if (items.length === 0) return;
    setCtxRing({ x: ev.clientX, y: ev.clientY, items });
  };

  return (
    <div
      className={`system-view${immersive ? " system-view--dive" : ""}${
        immersive && drilledPlanet ? " system-view--planet-manage" : ""
      }${gmDive ? " system-view--gm" : ""}`}
    >
      <nav className="sys-crumb" aria-label="Иерархия">
        <button type="button" className="crumb-link" onClick={goGalaxy}>
          {readOnly ? "К карте" : "Галактика"}
        </button>
        <span className="crumb-sep">›</span>
        <button
          type="button"
          className={
            !drilledPlanet && !previewPlanet ? "crumb-link active" : "crumb-link"
          }
          onClick={() => {
            clearSoft();
            goSystem(system.id);
          }}
        >
          {system.name}
        </button>
        {playerDive && canBuildBelt && systemManage && (
          <InlineRename
            value={system.name}
            affordanceOnly
            title="Переименовать систему"
            onCommit={(name) => {
              systemManage.onAction({
                action: "rename_system",
                systemId: system.id,
                name,
              });
            }}
          />
        )}
        {gmDive && (
          <InlineRename
            value={system.name}
            affordanceOnly
            title="Переименовать систему"
            onCommit={(name) => updateSelectedSystem({ name })}
          />
        )}
        {(drilledPlanet || previewPlanet) && (
          <>
            <span className="crumb-sep">›</span>
            <span className="crumb-current">
              {(() => {
                const p = drilledPlanet ?? previewPlanet!;
                const canRename =
                  gmDive ||
                  (!!playerDive &&
                    !!planetManage &&
                    (p.ownerFactionId || system.ownerFactionId) ===
                      planetManage.factionId);
                if (!canRename) return p.name;
                return (
                  <InlineRename
                    value={p.name}
                    title="Переименовать планету"
                    onCommit={(name) => {
                      if (gmDive) {
                        updatePlanet(p.id, { name });
                        return;
                      }
                      planetManage?.onAction({
                        action: "rename",
                        systemId: system.id,
                        planetId: p.id,
                        name,
                      });
                    }}
                  />
                );
              })()}
              {previewPlanet && !drilledPlanet ? " · осмотр" : ""}
            </span>
          </>
        )}
        {placeMode && !drilledPlanet && (
          <>
            <span className="crumb-sep">›</span>
            <span className="crumb-current">Стройка на поясе</span>
          </>
        )}
        {!placeMode && forceDeck === "produce" && !drilledPlanet && (
          <>
            <span className="crumb-sep">›</span>
            <span className="crumb-current">
              {systemManage?.preferProduceTab === "units" ? "Войска" : "Верфь"}
            </span>
          </>
        )}
      </nav>

      <div className="system-view-grid">
        <div className="system-view-map">
          {!isCorridorSystem(system) ? (
            <SystemSchematic
              system={system}
              selectedPlanetId={selectedPlanetId}
              previewPlanetId={previewPlanetId}
              onSelectPlanet={(id) => {
                if (id && applyPlanetTool(id)) return;
                if (!immersive) {
                  if (id) goPlanet(system.id, id);
                  else goSystem(system.id);
                  return;
                }
                if (!id) {
                  clearSoft();
                  goSystem(system.id);
                }
              }}
              onPlanetPreview={
                immersive
                  ? (id) => {
                      if (applyPlanetTool(id)) return;
                      clearPlace();
                      setSelectedFeature(null);
                      setSelectedStationId(null);
                      setPreviewPlanetId(id);
                      if (drilledPlanet) goSystem(system.id);
                    }
                  : undefined
              }
              onPlanetDrill={
                immersive
                  ? (id) => {
                      if (applyPlanetTool(id)) return;
                      clearPlace();
                      setSelectedFeature(null);
                      setPreviewPlanetId(null);
                      goPlanet(system.id, id);
                    }
                  : undefined
              }
              fleets={fleetsHere}
              legions={legionsHere}
              factions={world.factions}
              playerFactionId={readOnly ? playerFactionId : null}
              selectedFleetId={readOnly ? selectedFleetIdState : null}
              selectedLegionId={readOnly ? selectedLegionIdState : null}
              onSelectFleet={onSelectOwnFleet}
              onSelectLegion={onSelectOwnLegion}
              selectedStationId={selectedStationId}
              onSelectStation={
                immersive
                  ? (id) => {
                      setSelectedFeature(null);
                      setPreviewPlanetId(null);
                      setSelectedStationId(id);
                      setPlaceMode(false);
                    }
                  : undefined
              }
              selectedFeature={selectedFeature}
              onSelectFeature={(f) => {
                setSelectedStationId(null);
                setPreviewPlanetId(null);
                setSelectedFeature(f);
                if (drilledPlanet) goSystem(system.id);
              }}
              mapResourceNames={systemManage?.mapResourceNames}
              systemBeltHot={placeMode}
              canBuildBelt={canBuildBelt}
              pendingBeltAngle={pendingBeltAngle}
              placingKind={placingKind}
              onBeltTap={
                canBuildBelt
                  ? (angle) => {
                      setPreviewPlanetId(null);
                      setSelectedFeature(null);
                      if (placingKind) {
                        if (gmDive) commitGmStation(placingKind, angle);
                        else commitStation(placingKind, angle);
                        return;
                      }
                      setPlaceMode(true);
                      setPendingBeltAngle(angle);
                      if (playerDive) setForceDeck("stations");
                    }
                  : undefined
              }
              onDepositBuildMining={
                canBuildBelt
                  ? (resourceId) => {
                      setSelectedFeature({
                        kind: "deposit",
                        resourceId,
                      });
                      if (gmDive) armPlace("mining");
                      else if (mineInfo.status === "none") armPlace("mining");
                    }
                  : undefined
              }
              onSchematicContext={
                immersive ? handleSchematicContext : undefined
              }
            />
          ) : (
            <div className="sys-corridor-note">
              <p>Узел коридора / врат — без орбитальной схемы.</p>
              <p className="hint">Координаты галактики не меняются.</p>
            </div>
          )}
        </div>

        <div className="system-view-side">
          {playerDive &&
            systemManage &&
            (drilledPlanet || previewPlanet || showBeltDock) && (
              <SystemStatusStrip
                system={system}
                focusPlanet={drilledPlanet ?? previewPlanet}
                races={world.races ?? []}
                mapResourceNames={systemManage.mapResourceNames}
                reservedAp={systemManage.reservedAp}
                apMax={systemManage.apMax}
                metal={systemManage.stocks["currency.metal"] ?? 0}
                supply={systemManage.stocks["currency.supply"] ?? 0}
                factionId={systemManage.factionId}
              />
            )}

          {drilledPlanet &&
            (readOnly && planetManage ? (
              <PlayerPlanetManage
                system={system}
                planet={drilledPlanet}
                factionId={planetManage.factionId}
                stocks={planetManage.stocks}
                reservedAp={planetManage.reservedAp}
                apMax={planetManage.apMax}
                buildings={planetManage.buildings}
                colonies={planetManage.colonies}
                mapResources={planetManage.mapResources}
                techEco={planetManage.techEco}
                busy={planetManage.busy}
                message={planetManage.message}
                onAction={planetManage.onAction}
                onOpenResearch={planetManage.onOpenResearch}
                buildQueue={planetManage.buildQueue}
                onChangeBuildQueue={planetManage.onChangeBuildQueue}
                onPreviewBuild={planetManage.onPreviewBuild}
                highlightCategory={planetManage.highlightCategory}
                onShowInEconomy={planetManage.onShowInEconomy}
                defaultCultureId={planetManage.defaultCultureId}
                primaryFaith={planetManage.primaryFaith}
                unlockedLineages={planetManage.unlockedLineages}
                onFoundHybrid={planetManage.onFoundHybrid}
                password={planetManage.password}
                onForceRecruitSession={planetManage.onForceRecruitSession}
                onBack={() => {
                  setPreviewPlanetId(drilledPlanet.id);
                  goSystem(system.id);
                }}
              />
            ) : gmDive ? (
              <>
                <GmPlanetStage
                  system={system}
                  planet={drilledPlanet}
                  onBack={() => {
                    setPreviewPlanetId(drilledPlanet.id);
                    goSystem(system.id);
                  }}
                  onChange={(patch) => updatePlanet(drilledPlanet.id, patch)}
                />
                <details className="sys-editor-fold">
                  <summary>Поля мира (владелец, климат, население…)</summary>
                  <PlanetDetail
                    planet={drilledPlanet}
                    hideBuildings
                    onBack={() => goSystem(system.id)}
                    onChange={(patch) => updatePlanet(drilledPlanet.id, patch)}
                    onRemove={() => {
                      removePlanet(drilledPlanet.id);
                      goSystem(system.id);
                    }}
                    races={world.races}
                  />
                </details>
              </>
            ) : (
              <PlanetDetail
                planet={drilledPlanet}
                readOnly={readOnly}
                onBack={() => goSystem(system.id)}
                onChange={(patch) => {
                  if (!readOnly) updatePlanet(drilledPlanet.id, patch);
                }}
                onRemove={() => {
                  if (readOnly) return;
                  removePlanet(drilledPlanet.id);
                  goSystem(system.id);
                }}
                races={world.races}
              />
            ))}

          {!drilledPlanet && previewPlanet && immersive && (
            <div className="sys-planet-preview">
              <div className="sys-feature-card__head">
                <strong>
                  {gmDive ? (
                    <InlineRename
                      value={previewPlanet.name}
                      title="Переименовать планету"
                      onCommit={(name) => updatePlanet(previewPlanet.id, { name })}
                    />
                  ) : planetManage &&
                    (previewPlanet.ownerFactionId || system.ownerFactionId) ===
                      planetManage.factionId ? (
                    <InlineRename
                      value={previewPlanet.name}
                      title="Переименовать планету"
                      onCommit={(name) =>
                        planetManage.onAction({
                          action: "rename",
                          systemId: system.id,
                          planetId: previewPlanet.id,
                          name,
                        })
                      }
                    />
                  ) : (
                    previewPlanet.name
                  )}
                </strong>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => setPreviewPlanetId(null)}
                >
                  ✕
                </button>
              </div>
              <p className="hint">
                {PLANET_TYPE_LABELS[previewPlanet.type]} ·{" "}
                {CLIMATE_LABELS[previewPlanet.climate]} ·{" "}
                {HABIT_LABELS[classifyPlanet(previewPlanet)]}
              </p>
              <div className="system-status-strip__yields">
                {planetContributionChips(
                  previewPlanet,
                  system,
                  systemManage?.factionId,
                ).map((c) => (
                  <span
                    key={c.id}
                    className={`system-yield-chip system-yield-chip--${c.tone ?? "muted"}`}
                    title={c.title ?? c.label}
                  >
                    {c.label}
                  </span>
                ))}
              </div>
              <PlanetRevoltReadout
                planet={previewPlanet}
                currentTurn={world.meta.turn ?? 0}
                compact
              />
              <button
                type="button"
                className="btn primary block"
                onClick={() => goPlanet(system.id, previewPlanet.id)}
              >
                {gmDive ? "Открыть мир" : "Управлять миром"}
              </button>
              <p className="hint" style={{ marginTop: 6 }}>
                {gmDive
                  ? "Тап — осмотр, кнопка «Открыть мир» — править · ПКМ на орбите — владелец, станция, спор"
                  : "Своя колония: тап в списке — управлять · глаз — осмотр"}
              </p>
            </div>
          )}

          {!drilledPlanet && showBeltDock && systemManage && (
            <>
              {placeMode && (
                <p className="sys-place-tip">
                  {placingKind && pendingBeltAngle != null
                    ? "Готово — зажми карту или тапни пояс ещё раз"
                    : placingKind
                      ? `Тип «${STATION_KIND_LABELS[placingKind] ?? placingKind}» — тапни пояс`
                      : pendingBeltAngle != null
                        ? "Точка выбрана — выбери тип станции"
                        : "Выбери тип и точку на поясе"}
                  <button
                    type="button"
                    className="btn ghost"
                    style={{ marginLeft: 8 }}
                    onClick={clearPlace}
                  >
                    Отмена
                  </button>
                </p>
              )}
              {selectedFeature && (
                <div className="sys-feature-card">
                  <div className="sys-feature-card__head">
                    <strong>
                      {selectedFeature.kind === "poi"
                        ? (SYSTEM_POI_LABELS[selectedFeature.tag] ??
                          selectedFeature.tag)
                        : selectedFeature.kind === "deposit"
                          ? (systemManage.mapResourceNames?.[
                              selectedFeature.resourceId
                            ] ?? selectedFeature.resourceId)
                          : "Объект"}
                    </strong>
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => setSelectedFeature(null)}
                    >
                      ✕
                    </button>
                  </div>
                  {selectedFeature.kind === "poi" && (
                    <>
                      <p className="hint">
                        Объект пояса · <code>{selectedFeature.tag}</code>
                      </p>
                      <p>{poiPlayerBlurb(selectedFeature.tag)}</p>
                    </>
                  )}
                  {selectedFeature.kind === "deposit" && (
                    <>
                      <p
                        className={`sys-mine-status sys-mine-status--${mineInfo.status}`}
                      >
                        {systemMineLabel(mineInfo.status)}
                      </p>
                      <p className="hint">
                        Ресурс пояса. Добыча — общая для системы
                        (mining-станция).
                      </p>
                      {mineInfo.status === "none" && canBuildBelt && (
                        <button
                          type="button"
                          className="btn primary block"
                          onClick={() => armPlace("mining")}
                        >
                          Добыча → тапни пояс · или ПКМ на депозите
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
              <SystemCommandPanel
                system={system}
                factionId={systemManage.factionId}
                stocks={systemManage.stocks}
                reservedAp={systemManage.reservedAp}
                apMax={systemManage.apMax}
                unlockedProperties={systemManage.unlockedProperties}
                selectedPlanetId={null}
                selectedStationId={selectedStationId}
                ships={systemManage.ships}
                units={systemManage.units}
                busy={systemManage.busy}
                message={systemManage.message}
                onAction={(req) => {
                  systemManage.onAction(req);
                  if (req.action === "build_station") clearPlace();
                }}
                onSelectStation={setSelectedStationId}
                preferKind={placingKind}
                placingKind={placingKind}
                pendingBeltAngle={pendingBeltAngle}
                onArmKind={(kind) => {
                  setPlaceMode(true);
                  setPlacingKind(kind);
                }}
                docked
                forceStationsOpen={
                  placeMode || forceDeck === "stations" ? true : undefined
                }
                forceProduceOpen={
                  forceDeck === "produce" ? true : undefined
                }
                forceProduceTab={systemManage.preferProduceTab}
                produceFleetId={systemManage.produceFleetId}
                produceLegionId={systemManage.produceLegionId}
                onDeckChange={setForceDeck}
              />
            </>
          )}

          {!drilledPlanet && !previewPlanet && !showBeltDock && playerDive && systemManage && (
            <SystemDiveDock
              system={system}
              factionId={systemManage.factionId}
              owner={owner}
              mapResourceNames={systemManage.mapResourceNames}
              reservedAp={systemManage.reservedAp}
              apMax={systemManage.apMax}
              metal={systemManage.stocks["currency.metal"] ?? 0}
              supply={systemManage.stocks["currency.supply"] ?? 0}
              fleetsCount={fleetsHere.length}
              legionsCount={legionsHere.length}
              canBuildBelt={canBuildBelt}
              previewPlanetId={previewPlanetId}
              flowData={systemManage.flowData}
              buildings={systemManage.buildings ?? planetManage?.buildings}
              highlightCategory={systemManage.highlightCategory}
              onHighlightCategory={systemManage.onHighlightCategory}
              onPreviewPlanet={(id) => {
                if (applyPlanetTool(id)) return;
                setPreviewPlanetId(id);
              }}
              onDrillPlanet={(id) => {
                if (applyPlanetTool(id)) return;
                goPlanet(system.id, id);
              }}
              onArmBelt={() => armPlace(null)}
              onQuickMine={() => {
                // Open station deck so success/error message is visible —
                // silent commit left feedback on a hidden panel.
                armPlace("mining");
                if (mineInfo.status !== "none" || systemManage.busy) return;
                const n = Math.max((system.resources ?? []).length, 1);
                const angle = -Math.PI / 2 + (0.5 / n) * Math.PI * 2;
                setPendingBeltAngle(angle);
                systemManage.onAction({
                  action: "build_station",
                  systemId: system.id,
                  stationKind: "mining",
                  beltAngle: angle,
                });
              }}
              message={systemManage.message}
              busy={systemManage.busy}
              onRenameSystem={(name) => {
                systemManage.onAction({
                  action: "rename_system",
                  systemId: system.id,
                  name,
                });
              }}
              onRenamePlanet={(planetId, name) => {
                planetManage?.onAction({
                  action: "rename",
                  systemId: system.id,
                  planetId,
                  name,
                });
              }}
              onOpenProduce={(tab) => {
                setForceDeck("produce");
                setPlaceMode(false);
                setPlacingKind(null);
                setPendingBeltAngle(null);
                systemManage.onSetProduceTab?.(tab);
              }}
            />
          )}

          {/* GM rail: same schematic as player, tools on the side / RMB */}
          {!drilledPlanet && !previewPlanet && !playerDive && gmDive && (
            <>
              {placeMode && (
                <p className="sys-place-tip">
                  {pendingBeltAngle != null
                    ? "Точка пояса · ПКМ — тип станции"
                    : "Тапни пояс или ПКМ на орбите"}
                  <button
                    type="button"
                    className="btn ghost"
                    style={{ marginLeft: 8 }}
                    onClick={clearPlace}
                  >
                    Отмена
                  </button>
                </p>
              )}
              {selectedStationId && (
                <div className="sys-feature-card">
                  <div className="sys-feature-card__head">
                    <strong>
                      {(system.stations ?? []).find((s) => s.id === selectedStationId)
                        ?.name ?? "Станция"}
                    </strong>
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => setSelectedStationId(null)}
                    >
                      ✕
                    </button>
                  </div>
                  <button
                    type="button"
                    className="btn ghost block"
                    onClick={() => removeGmStation(selectedStationId)}
                  >
                    Удалить станцию
                  </button>
                </div>
              )}
              <div className="sys-meta">
                <div className="sys-meta-row">
                  <span>Владелец</span>
                  <strong
                    className="sys-owner-line"
                    style={{ color: owner?.color }}
                  >
                    {owner?.name ?? "—"}
                  </strong>
                </div>
                <div className="sys-meta-row">
                  <span>Ситуация</span>
                  <strong>
                    {SYSTEM_ACTIVITY_LABELS[system.activity ?? "none"]}
                  </strong>
                </div>
                {paintingRes && (
                  <div className="sys-paint-res">
                    <p className="hint">
                      Режим ресурсов
                      {activeResource ? `: «${activeResource}»` : ""}.
                    </p>
                    <button
                      type="button"
                      className="btn primary block"
                      onClick={() => paintResourceOnSystem(system.id)}
                    >
                      Сыпать в систему
                    </button>
                  </div>
                )}
              </div>
              <p className="hint">
                Как у игрока: тап — осмотр, кнопка мира — править. ПКМ на планете,
                поясе, станции — править на месте.
              </p>
              <button
                type="button"
                className="btn ghost block"
                onClick={() => addPlanet()}
                disabled={isCorridorSystem(system)}
              >
                + Планета
              </button>
            </>
          )}
        </div>
      </div>

      {gmDive && (
        <details className="sys-editor-fold">
          <summary>Полная правка (звёзды, владение, список станций)</summary>
          <SystemEditor system={system} />
        </details>
      )}

      {ctxRing && (
        <ActionRing
          open
          x={ctxRing.x}
          y={ctxRing.y}
          items={ctxRing.items}
          onClose={() => setCtxRing(null)}
        />
      )}
    </div>
  );
}

function formatPop(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return String(n);
}

function PlanetDetail({
  planet,
  onBack,
  onChange,
  onRemove,
  races,
  readOnly = false,
  hideBuildings = false,
}: {
  planet: Planet;
  onBack: () => void;
  onChange: (patch: Partial<Planet>) => void;
  onRemove: () => void;
  races: { id: string; name: string; color?: string }[];
  readOnly?: boolean;
  hideBuildings?: boolean;
}) {
  const world = useWorldStore((s) => s.world);
  const habit = classifyPlanet(planet);
  const [zone, setZone] = useState<PlanetBuildingZone>("surface");
  const ownerName =
    world.factions.find((f) => f.id === planet.ownerFactionId)?.name ?? null;

  const surface = planet.surfaceBuildings ?? [];
  const orbital = planet.orbitalBuildings ?? [];
  const surfaceMax = planet.surfaceSlots ?? 8;
  const orbitalMax = planet.orbitalSlots ?? 4;

  const setBuildings = (z: PlanetBuildingZone, list: PlanetBuilding[]) => {
    if (z === "surface") onChange({ surfaceBuildings: list });
    else onChange({ orbitalBuildings: list });
  };

  const addBuilding = (z: PlanetBuildingZone) => {
    const list = z === "surface" ? surface : orbital;
    const max = z === "surface" ? surfaceMax : orbitalMax;
    if (list.length >= max) return;
    const listZone = z === "orbital" ? "orbital" : "surface";
    const def = defaultGmCatalogBuilding(
      getCachedContent()?.buildings,
      listZone,
    );
    if (def) {
      setBuildings(z, [
        ...list,
        { id: uuid(), ...patchFromCatalogDef(def) },
      ]);
      return;
    }
    const kind: PlanetBuildingKind =
      z === "orbital" ? "spaceport" : "residential";
    setBuildings(z, [
      ...list,
      {
        id: uuid(),
        name: PLANET_BUILDING_KIND_LABELS[kind],
        kind,
        zone: z,
      },
    ]);
  };

  if (readOnly) {
    return (
      <div className="planet-detail planet-detail--readonly">
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
              {colonyTypeLabel(planet.colonyType)}
              {planet.population > 0
                ? ` · нас. ${formatPop(planet.population)}`
                : ""}
            </strong>
          </div>
          <div className="sys-meta-row">
            <span>Владелец</span>
            <strong>{ownerName ?? "—"}</strong>
          </div>
          <div className="sys-meta-row">
            <span>Постройки</span>
            <strong>
              пов. {surface.length}/{surfaceMax} · орб. {orbital.length}/
              {orbitalMax}
            </strong>
          </div>
        </div>
        {(surface.length > 0 || orbital.length > 0) && (
          <ul className="sys-force-list">
            {[...surface, ...orbital].map((b) => (
              <li key={b.id}>
                {b.name || PLANET_BUILDING_KIND_LABELS[b.kind]}{" "}
                <span className="hint">({buildingZoneLabel(b.zone)})</span>
              </li>
            ))}
          </ul>
        )}
        <PlanetRevoltReadout
          planet={planet}
          currentTurn={world.meta.turn ?? 0}
          compact
        />
        <p className="hint">Осмотр. Управление — на своих колониях.</p>
      </div>
    );
  }

  return (
    <div className="planet-detail">
      {!hideBuildings && (
      <div className="planet-detail-head">
        <button type="button" className="btn ghost" onClick={onBack}>
          ← К системе
        </button>
        <span className={`habit-badge ${habit}`}>{HABIT_LABELS[habit]}</span>
      </div>
      )}
      {!hideBuildings && (
      <h3 className="planet-detail-title">{planet.name}</h3>
      )}

      <label className="field">
        <span>Название</span>
        <input
          value={planet.name}
          onChange={(e) => onChange({ name: e.target.value })}
        />
      </label>

      <div className="block-title">Владение / спор</div>
      <label className="field">
        <span>Владелец планеты</span>
        <select
          value={planet.ownerFactionId ?? ""}
          onChange={(e) =>
            onChange({
              ownerFactionId: e.target.value || null,
              coOwnerFactionIds: (planet.coOwnerFactionIds ?? []).filter(
                (id) => id !== e.target.value,
              ),
            })
          }
        >
          <option value="">— как у системы / нет —</option>
          {world.factions.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Совладелец</span>
        <select
          value={(planet.coOwnerFactionIds ?? [])[0] ?? ""}
          onChange={(e) =>
            onChange({
              coOwnerFactionIds: e.target.value ? [e.target.value] : [],
            })
          }
        >
          <option value="">— нет —</option>
          {world.factions
            .filter((f) => f.id !== planet.ownerFactionId)
            .map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
        </select>
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={!!planet.contested}
          onChange={(e) => onChange({ contested: e.target.checked })}
        />
        Спорная планета
      </label>

      <div className="planet-detail-2col">
        <label className="field">
          <span>Орбита №</span>
          <input
            type="number"
            min={1}
            value={planet.orbitIndex ?? 1}
            onChange={(e) =>
              onChange({ orbitIndex: Math.max(1, Number(e.target.value) || 1) })
            }
          />
        </label>
        <label className="field">
          <span>Размер схемы</span>
          <input
            type="number"
            min={0.4}
            max={2.5}
            step={0.1}
            value={planet.size ?? 1}
            onChange={(e) =>
              onChange({ size: Number(e.target.value) || 1 })
            }
          />
        </label>
      </div>
      <div className="planet-detail-2col">
        <label className="field">
          <span>Тип</span>
          <select
            value={planet.type}
            onChange={(e) =>
              onChange({ type: e.target.value as PlanetType })
            }
          >
            {(Object.keys(PLANET_TYPE_LABELS) as PlanetType[]).map((t) => (
              <option key={t} value={t}>
                {PLANET_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Климат</span>
          <select
            value={planet.climate}
            onChange={(e) =>
              onChange({ climate: e.target.value as Climate })
            }
          >
            {(Object.keys(CLIMATE_LABELS) as Climate[]).map((c) => (
              <option key={c} value={c}>
                {CLIMATE_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="field">
        <span>Тип колонии</span>
        <select
          value={canonicalColonyType(planet.colonyType)}
          onChange={(e) =>
            onChange({ colonyType: e.target.value as ColonyType })
          }
        >
          {(Object.keys(COLONY_TYPE_LABELS) as ColonyType[]).map((c) => (
            <option key={c} value={c}>
              {COLONY_TYPE_LABELS[c]}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Население</span>
        <input
          type="number"
          min={0}
          value={planet.population}
          onChange={(e) =>
            onChange({ population: Math.max(0, Number(e.target.value) || 0) })
          }
        />
      </label>
      <div className="planet-flags">
        <label className="check">
          <input
            type="checkbox"
            checked={planet.habitable !== false}
            onChange={(e) => onChange({ habitable: e.target.checked })}
          />
          Обитаема
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={planet.colonizable !== false}
            onChange={(e) => onChange({ colonizable: e.target.checked })}
          />
          Колонизируема
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={planet.surveyed !== false}
            onChange={(e) => onChange({ surveyed: e.target.checked })}
          />
          Разведана
        </label>
      </div>

      {!hideBuildings && (
      <div className="planet-zone-tabs">
        <button
          type="button"
          className={zone === "surface" ? "tab active" : "tab"}
          onClick={() => setZone("surface")}
        >
          Поверхность ({surface.length}/{surfaceMax})
        </button>
        <button
          type="button"
          className={zone === "orbital" ? "tab active" : "tab"}
          onClick={() => setZone("orbital")}
        >
          Орбита ({orbital.length}/{orbitalMax})
        </button>
      </div>
      )}
      <div className="planet-detail-2col">
        <label className="field">
          <span>Слоты поверхности</span>
          <input
            type="number"
            min={0}
            value={surfaceMax}
            onChange={(e) =>
              onChange({
                surfaceSlots: Math.max(0, Number(e.target.value) || 0),
              })
            }
          />
        </label>
        <label className="field">
          <span>Слоты орбиты</span>
          <input
            type="number"
            min={0}
            value={orbitalMax}
            onChange={(e) =>
              onChange({
                orbitalSlots: Math.max(0, Number(e.target.value) || 0),
              })
            }
          />
        </label>
      </div>

      {!hideBuildings && (
      <BuildingZoneEditor
        zone={zone}
        buildings={zone === "surface" ? surface : orbital}
        max={zone === "surface" ? surfaceMax : orbitalMax}
        onChange={(list) => setBuildings(zone, list)}
        onAdd={() => addBuilding(zone)}
      />
      )}

      <GmPlanetSocietyFields planet={planet} onChange={onChange} />

      <div className="block-title">Ресурсы</div>
      <div className="tag-row">
        {paintTagList(planet.resources).map((r) => {
          const on = resourcesHas(planet.resources, r);
          return (
            <button
              key={r}
              type="button"
              className={on ? "tag on" : "tag"}
              onClick={() =>
                onChange({ resources: toggleDeposit(planet.resources, r) })
              }
            >
              {resourceDisplayName(r)}
            </button>
          );
        })}
      </div>
      {races.length > 0 && (
        <>
          <div className="block-title">Состав населения</div>
          <p className="hint">
            {(planet.raceComposition ?? [])
              .map((rc) => {
                const name =
                  races.find((r) => r.id === rc.raceId)?.name ?? rc.raceId;
                return `${name} ${rc.percent}%`;
              })
              .join(" · ") || "не задан — правьте в полной форме ниже"}
          </p>
          <div className="loyalty-ring-block" aria-label="Лояльность">
            <div className="block-title">Лояльность</div>
            <LoyaltyRing
              loyalty={planet.loyalty ?? 50}
              composition={planet.raceComposition ?? []}
              races={races}
            />
          </div>
          <div style={{ marginTop: 10 }}>
            <div className="block-title">Стабильность и восстание (3-стадийный бунт)</div>
            <PlanetRevoltReadout
              planet={planet}
              currentTurn={world.meta.turn ?? 0}
            />
          </div>
        </>
      )}
      <label className="field">
        <span>Заметки о мире</span>
        <textarea
          rows={3}
          value={planet.notes ?? ""}
          onChange={(e) => onChange({ notes: e.target.value })}
        />
      </label>
      <button type="button" className="btn danger block" onClick={onRemove}>
        Удалить планету
      </button>
    </div>
  );
}

function GmBuildingCatalogSelect({
  zone,
  building,
  onPatch,
}: {
  zone: PlanetBuildingZone;
  building: PlanetBuilding;
  onPatch: (patch: Partial<PlanetBuilding>) => void;
}) {
  const listZone = zone === "orbital" ? "orbital" : "surface";
  const catalog = listGmCatalogBuildings(
    getCachedContent()?.buildings,
    listZone,
  );
  const known = catalog.some((d) => d.id === building.buildingId);
  const value = building.buildingId ?? "";

  if (catalog.length === 0) {
    return (
      <label className="field">
        <span>Тип</span>
        <select
          value={building.kind}
          onChange={(e) => {
            const kind = e.target.value as PlanetBuildingKind;
            onPatch({
              kind,
              name: PLANET_BUILDING_KIND_LABELS[kind],
              buildingId: undefined,
            });
          }}
        >
          {(listZone === "orbital"
            ? (["spaceport", "shipyard", "habitat", "defense", "lab", "custom"] as PlanetBuildingKind[])
            : ([
                "residential",
                "farm",
                "mine",
                "factory",
                "lab",
                "barracks",
                "capitol",
                "defense",
                "custom",
              ] as PlanetBuildingKind[])
          ).map((k) => (
            <option key={k} value={k}>
              {PLANET_BUILDING_KIND_LABELS[k]}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <label className="field">
      <span>Каталог</span>
      <select
        value={known ? value : value}
        onChange={(e) => {
          const id = e.target.value;
          if (!id) {
            onPatch({ buildingId: undefined });
            return;
          }
          const def = catalog.find((d) => d.id === id);
          if (!def) return;
          onPatch(patchFromCatalogDef(def, building));
        }}
      >
        {!building.buildingId && (
          <option value="">без каталога · {PLANET_BUILDING_KIND_LABELS[building.kind]}</option>
        )}
        {building.buildingId && !known && (
          <option value={building.buildingId}>
            {building.buildingId} (нет в каталоге)
          </option>
        )}
        {catalog.map((d) => (
          <option key={d.id} value={d.id}>
            {gmBuildingOptionLabel(d)}
          </option>
        ))}
      </select>
    </label>
  );
}

function BuildingZoneEditor({
  zone,
  buildings,
  max,
  onChange,
  onAdd,
}: {
  zone: PlanetBuildingZone;
  buildings: PlanetBuilding[];
  max: number;
  onChange: (list: PlanetBuilding[]) => void;
  onAdd: () => void;
}) {
  return (
    <div className="building-zone">
      <p className="hint">
        {zone === "surface"
          ? "Поверхность / недра: из каталога (экономика читает buildingId)."
          : "Орбита: из каталога (космопорт, верфь, хабитат…)."}
      </p>
      {buildings.map((b) => (
        <div
          key={b.id}
          className={b.disabled ? "building-row disabled" : "building-row"}
        >
          <label className="field">
            <span>Имя</span>
            <input
              value={b.name}
              onChange={(e) =>
                onChange(
                  buildings.map((x) =>
                    x.id === b.id ? { ...x, name: e.target.value } : x,
                  ),
                )
              }
            />
          </label>
          <GmBuildingCatalogSelect
            zone={zone}
            building={b}
            onPatch={(patch) =>
              onChange(
                buildings.map((x) =>
                  x.id === b.id ? { ...x, ...patch } : x,
                ),
              )
            }
          />
          <label className="check">
            <input
              type="checkbox"
              checked={!!b.disabled}
              onChange={(e) =>
                onChange(
                  buildings.map((x) =>
                    x.id === b.id ? { ...x, disabled: e.target.checked } : x,
                  ),
                )
              }
            />
            Откл.
          </label>
          <button
            type="button"
            className="btn danger"
            onClick={() => onChange(buildings.filter((x) => x.id !== b.id))}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn ghost block"
        disabled={buildings.length >= max}
        onClick={onAdd}
      >
        +{" "}
        {zone === "surface" ? "Постройка на поверхности" : "Орбитальный объект"}
      </button>
    </div>
  );
}

function LoyaltyRing({
  loyalty,
  composition,
  races,
}: {
  loyalty: number;
  composition: { raceId: string; percent: number }[];
  races: { id: string; name: string }[];
}) {
  const v = Math.max(0, Math.min(100, Math.round(loyalty)));
  const tone = v < 20 ? "low" : v < 40 ? "warn" : v < 60 ? "mid" : "high";
  const r = 36;
  const c = 2 * Math.PI * r;
  const filled = (v / 100) * c;
  const slices = (composition.length
    ? composition
    : [{ raceId: "_", percent: 100 }]
  ).filter((s) => (s.percent ?? 0) > 0);
  let acc = 0;
  const palette = [
    "var(--signal-move)",
    "var(--signal-build)",
    "var(--signal-raid)",
    "var(--signal-warning)",
    "var(--signal-attack)",
    "var(--text-secondary)",
  ];

  return (
    <div className={`loyalty-ring loyalty-ring-${tone}`}>
      <svg viewBox="0 0 100 100" width="88" height="88" aria-hidden>
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="var(--line-hairline)"
          strokeWidth="8"
        />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${c - filled}`}
          transform="rotate(-90 50 50)"
        />
        {slices.length > 1
          ? slices.map((s, i) => {
              const start = acc;
              const sweep = (s.percent / 100) * 360;
              acc += sweep;
              const a0 = ((start - 90) * Math.PI) / 180;
              const a1 = ((start + sweep - 90) * Math.PI) / 180;
              const x0 = 50 + 22 * Math.cos(a0);
              const y0 = 50 + 22 * Math.sin(a0);
              const x1 = 50 + 22 * Math.cos(a1);
              const y1 = 50 + 22 * Math.sin(a1);
              const large = sweep > 180 ? 1 : 0;
              return (
                <path
                  key={`${s.raceId}-${i}`}
                  d={`M 50 50 L ${x0} ${y0} A 22 22 0 ${large} 1 ${x1} ${y1} Z`}
                  fill={palette[i % palette.length]}
                  opacity={0.55}
                />
              );
            })
          : null}
        <text
          x="50"
          y="54"
          textAnchor="middle"
          className="loyalty-ring-value"
          fill="var(--text-primary)"
          fontSize="16"
          fontFamily="var(--font-mono)"
        >
          {v}
        </text>
      </svg>
      <ul className="loyalty-ring-legend">
        {slices.map((s) => {
          const name =
            races.find((r) => r.id === s.raceId)?.name ?? s.raceId;
          return (
            <li key={s.raceId}>
              <span>{name}</span>
              <span className="mono">{s.percent}%</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function poiPlayerBlurb(tag: SystemPoiType): string {
  const intel = resolvePoiIntel(tag);
  return [intel.description, intel.actionTip].filter(Boolean).join(" ");
}
