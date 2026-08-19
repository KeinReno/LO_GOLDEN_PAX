import { useEffect, useMemo } from "react";
import type { ViewerPayload } from "../../../state/types";
import type { MapResourceDef } from "../../../state/contentCatalog";
import { useWorldStore } from "../../../state/worldStore";
import { useViewerPanelFocusStore } from "../../../state/viewerPanelFocusStore";
import { useViewerSessionStore } from "../../../state/viewerSessionStore";
import { useViewerOrderSessionStore } from "../../../state/viewerOrderSessionStore";
import { useViewerSystemDiveStore } from "../../../state/viewerSystemDiveStore";
import { SystemView } from "../../../editors/SystemView";
import { SystemCodex } from "../../SystemCodex";
import type {
  BuildingDef,
  ColonyDef,
  PlanetActionRequest,
} from "../../PlayerPlanetManage";
import type { SystemActionRequest } from "../../SystemCommandPanel";
import type { BuildPreviewResult, BuildQueueItem } from "../../system/types";
import { isInputFocused } from "../../hooks/isInputFocused";
import { navigateViewerRoom } from "../rooms-router/navigateViewerRoom";
import { diveLayerHiddenByRoom } from "./diveNav";
import {
  attackSystemTitle,
  catalogDisplayNames,
  claimSystemTitle,
  systemDiveBackLabel,
} from "./systemDiveCopy";

type Recruit = {
  world?: ViewerPayload["world"];
  economy?: ViewerPayload["economy"];
  intel?: ViewerPayload["intel"];
  visibleSystemIds?: string[];
};

type UnitCat = Record<
  string,
  { id: string; name: string; tier?: number; faction?: string }
>;

type Props = {
  payload: ViewerPayload;
  password: string;
  buildingsCatalog: Record<string, BuildingDef>;
  coloniesCatalog: Record<string, ColonyDef>;
  mapResourcesCatalog: Record<string, MapResourceDef> | undefined;
  shipsCatalog: UnitCat;
  unitsCatalog: UnitCat;
  onClose: () => void;
  onOpenPlanet: (systemId: string, planetId: string) => void;
  onFocusSystem: (systemId: string) => void;
  onPlanetAction: (req: PlanetActionRequest) => void;
  onSystemAction: (req: SystemActionRequest) => void;
  onFoundHybrid: (raceA: string, raceB: string) => void;
  onRecruitSession: (data: Recruit) => void;
  onOpenResearch: (techId: string) => void;
  onChangeBuildQueue: (next: BuildQueueItem[]) => void;
  onPreviewBuild: (opts: {
    systemId: string;
    planetId: string;
    buildingId: string;
  }) => Promise<BuildPreviewResult | null>;
  onClaim: (systemId: string, fleetId?: string | null) => void;
  onAttack: (fleetId: string, systemId: string) => void;
};

export function ViewerSystemDive({
  payload,
  password,
  buildingsCatalog,
  coloniesCatalog,
  mapResourcesCatalog,
  shipsCatalog,
  unitsCatalog,
  onClose,
  onOpenPlanet,
  onPlanetAction,
  onSystemAction,
  onFoundHybrid,
  onRecruitSession,
  onOpenResearch,
  onChangeBuildQueue,
  onPreviewBuild,
  onClaim,
  onAttack,
}: Props) {
  const reservedAp = useViewerOrderSessionStore((s) => s.reservedAp);
  const apMax = useViewerOrderSessionStore((s) => s.apMax);
  const flowData = useViewerOrderSessionStore((s) => s.flowData);
  const planetBusy = useViewerSystemDiveStore((s) => s.planetBusy);
  const planetMsg = useViewerSystemDiveStore((s) => s.planetMsg);
  const systemBusy = useViewerSystemDiveStore((s) => s.systemBusy);
  const systemMsg = useViewerSystemDiveStore((s) => s.systemMsg);
  const systemFocusId = useViewerSystemDiveStore((s) => s.systemFocusId);
  const setSystemFocusId = useViewerSystemDiveStore((s) => s.setSystemFocusId);
  const systemPreferDeck = useViewerSystemDiveStore((s) => s.systemPreferDeck);
  const systemProduceTab = useViewerSystemDiveStore((s) => s.systemProduceTab);
  const systemProduceFleetId = useViewerSystemDiveStore(
    (s) => s.systemProduceFleetId,
  );
  const systemProduceLegionId = useViewerSystemDiveStore(
    (s) => s.systemProduceLegionId,
  );
  const mapFocus = useWorldStore((s) => s.mapFocus);
  const economyLinkedSystemId = useViewerPanelFocusStore(
    (s) => s.economyLinkedSystemId,
  );
  const setEconomyLinkedSystemId = useViewerPanelFocusStore(
    (s) => s.setEconomyLinkedSystemId,
  );
  const ecoHighlightCategory = useViewerPanelFocusStore(
    (s) => s.ecoHighlightCategory,
  );
  const setEcoHighlightCategory = useViewerPanelFocusStore(
    (s) => s.setEcoHighlightCategory,
  );
  const selectedFleetId = useViewerSessionStore((s) => s.selectedFleetId);
  const viewMode = useViewerSessionStore((s) => s.viewMode);
  const selectFleet = useViewerSessionStore((s) => s.selectFleet);
  const selectLegion = useViewerSessionStore((s) => s.selectLegion);
  const setSelectedSystemId = useViewerSessionStore(
    (s) => s.setSelectedSystemId,
  );

  const focusedSystem = useMemo(
    () => payload.world.systems.find((s) => s.id === systemFocusId) ?? null,
    [payload, systemFocusId],
  );

  const playerSystemNav = useMemo(() => {
    if (!systemFocusId) return undefined;
    return {
      onGalaxyBack: onClose,
      onOpenSystem: (id: string) => {
        setSystemFocusId(id);
        setSelectedSystemId(id);
        useWorldStore.setState({
          dossierSystemId: null,
          mapFocus: { level: "system" as const, systemId: id },
        });
      },
      onOpenPlanet,
      selectedPlanetId:
        mapFocus.level === "planet" && mapFocus.systemId === systemFocusId
          ? mapFocus.planetId
          : null,
    };
  }, [
    systemFocusId,
    mapFocus,
    onClose,
    onOpenPlanet,
    setSystemFocusId,
    setSelectedSystemId,
  ]);

  useEffect(() => {
    if (!systemFocusId) return;
    const onKey = (e: KeyboardEvent) => {
      const vm = useViewerSessionStore.getState().viewMode;
      if (vm !== "map" && vm !== "orders") return;
      if (e.key === "Escape") {
        if (isInputFocused(e.target)) return;
        if (document.querySelector(".gmap-float-panel")) return;
        if (document.querySelector(".action-ring, .eco-doctrine-modal")) return;
        const dossierOpen = useWorldStore.getState().dossierSystemId;
        if (dossierOpen) {
          useWorldStore.setState({ dossierSystemId: null });
          return;
        }
        const focus = useWorldStore.getState().mapFocus;
        if (focus.level === "planet" && focus.systemId === systemFocusId) {
          e.preventDefault();
          useWorldStore.setState({
            mapFocus: { level: "system" as const, systemId: systemFocusId },
          });
          return;
        }
        onClose();
        return;
      }
      if (
        (e.key === "i" || e.key === "I" || e.key === "ш" || e.key === "Ш") &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        if (isInputFocused(e.target)) return;
        e.preventDefault();
        const open = useWorldStore.getState().dossierSystemId;
        useWorldStore.setState({
          dossierSystemId: open ? null : systemFocusId,
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [systemFocusId, onClose]);

  const resourceNames = catalogDisplayNames(mapResourcesCatalog);
  const faction = payload.world.factions.find((f) => f.id === payload.factionId);
  const ownSystem =
    focusedSystem?.ownerFactionId === payload.factionId;
  const hasFleet = Boolean(selectedFleetId);
  const economyLinked =
    Boolean(focusedSystem) && economyLinkedSystemId === focusedSystem?.id;
  const atPlanet =
    mapFocus.level === "planet" && mapFocus.systemId === systemFocusId;
  const roomOverDive = diveLayerHiddenByRoom(viewMode, economyLinked);

  return (
    <>
      {systemFocusId && focusedSystem && !roomOverDive && (
        <div
          className={`viewer-system-layer viewer-system-layer--compact-dock ${
            economyLinked ? "viewer-system-layer--docked-right" : ""
          }${atPlanet ? " viewer-system-layer--planet" : ""}`}
          role="region"
          aria-label={focusedSystem.name}
        >
          {!atPlanet && (
          <header className="viewer-system-head">
            <button
              type="button"
              className="btn viewer-system-back"
              onClick={() => {
                const atPlanet =
                  mapFocus.level === "planet" &&
                  mapFocus.systemId === systemFocusId;
                if (atPlanet) {
                  playerSystemNav?.onOpenSystem(systemFocusId);
                  return;
                }
                onClose();
              }}
            >
              {mapFocus.level === "planet" && mapFocus.systemId === systemFocusId
                ? "К системе"
                : systemDiveBackLabel(economyLinked)}
              <span className="viewer-system-back-kbd">Esc</span>
            </button>
            <h2 className="viewer-system-title">
              {economyLinked ? (
                <span className="viewer-system-crumbs">
                  <span className="hint">Экономика</span>
                  <span className="hint" aria-hidden>
                    →
                  </span>
                  <span>{focusedSystem.name}</span>
                </span>
              ) : (
                focusedSystem.name
              )}
            </h2>
            <button
              type="button"
              className="btn ghost"
              onClick={() =>
                useWorldStore.setState({ dossierSystemId: focusedSystem.id })
              }
              title="Сведения: объекты, добыча, постройки"
            >
              Сведения
              <kbd className="sys-codex__kbd">I</kbd>
            </button>
          </header>
          )}
          <div className="viewer-system-body">
            <SystemView
              system={focusedSystem}
              readOnly
              playerFactionId={payload.factionId}
              nav={playerSystemNav}
              onSelectOwnFleet={(fleetId) => {
                const fleet = payload.world.fleets.find((f) => f.id === fleetId);
                selectFleet(fleetId, fleet?.systemId);
              }}
              onSelectOwnLegion={(legionId) => {
                const leg = payload.world.legions.find((l) => l.id === legionId);
                selectLegion(legionId, leg?.systemId);
              }}
              planetManage={{
                factionId: payload.factionId,
                stocks: payload.economy?.stocks ?? {},
                reservedAp,
                apMax,
                buildings: buildingsCatalog,
                colonies: coloniesCatalog,
                mapResources: mapResourcesCatalog,
                techEco: {
                  techTiers: payload.economy?.techTiers,
                  unlockedProperties: payload.economy?.unlockedProperties,
                  unlockedLineages: payload.economy?.unlockedLineages,
                  roleScores: payload.economy?.roleScores,
                },
                defaultCultureId: faction?.defaultCultureId ?? "culture.baseline",
                primaryFaith: faction?.primaryFaith ?? "faith.secular",
                unlockedLineages: payload.economy?.unlockedLineages ?? [],
                onFoundHybrid: (raceA, raceB) => onFoundHybrid(raceA, raceB),
                password,
                onForceRecruitSession: onRecruitSession,
                busy: planetBusy,
                message: planetMsg,
                onAction: onPlanetAction,
                onOpenResearch,
                buildQueue: payload.economy?.buildQueue ?? [],
                onChangeBuildQueue,
                onPreviewBuild: (buildingId) => {
                  const planetId =
                    mapFocus.level === "planet" &&
                    mapFocus.systemId === focusedSystem.id
                      ? mapFocus.planetId
                      : "";
                  if (!planetId) return Promise.resolve(null);
                  return onPreviewBuild({
                    systemId: focusedSystem.id,
                    planetId,
                    buildingId,
                  });
                },
                highlightCategory: ecoHighlightCategory,
                onShowInEconomy: (category) => {
                  setEcoHighlightCategory(category);
                  setEconomyLinkedSystemId(focusedSystem.id);
                  navigateViewerRoom("economy");
                },
              }}
              systemManage={{
                factionId: payload.factionId,
                stocks: payload.economy?.stocks ?? {},
                reservedAp,
                apMax,
                unlockedProperties: payload.economy?.unlockedProperties,
                ships: shipsCatalog,
                units: unitsCatalog,
                mapResourceNames: resourceNames,
                busy: systemBusy,
                message: systemMsg,
                onAction: onSystemAction,
                flowData,
                buildings: buildingsCatalog,
                highlightCategory: ecoHighlightCategory,
                onHighlightCategory: setEcoHighlightCategory,
                preferDeck: systemPreferDeck,
                preferProduceTab: systemProduceTab,
                produceFleetId: systemProduceFleetId,
                produceLegionId: systemProduceLegionId,
                onSetProduceTab: (tab) => {
                  useViewerSystemDiveStore.getState().setSystemProduceTab(tab);
                  useViewerSystemDiveStore.getState().setSystemPreferDeck("produce");
                },
              }}
            />
          </div>
          {!atPlanet && (
          <footer className="viewer-system-actions">
            <button
              type="button"
              className="btn ghost"
              disabled={!hasFleet || ownSystem}
              title={claimSystemTitle({ hasFleet, ownSystem })}
              onClick={() => onClaim(focusedSystem.id, selectedFleetId)}
            >
              Захват
            </button>
            <button
              type="button"
              className="btn ghost"
              disabled={
                !focusedSystem.ownerFactionId || ownSystem || !hasFleet
              }
              title={attackSystemTitle({ hasFleet, ownSystem })}
              onClick={() => {
                if (selectedFleetId) {
                  onAttack(selectedFleetId, focusedSystem.id);
                }
              }}
            >
              Атака
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={() => navigateViewerRoom("rp")}
            >
              Сцена с ГМом
            </button>
          </footer>
          )}
        </div>
      )}
      <SystemCodex
        factionId={payload.factionId}
        mapResourceNames={resourceNames}
        onClose={() => useWorldStore.setState({ dossierSystemId: null })}
      />
    </>
  );
}
