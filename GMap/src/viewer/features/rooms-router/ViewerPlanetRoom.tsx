import { useMemo } from "react";
import type { ViewerPayload } from "../../../state/types";
import { useViewerOrderSessionStore } from "../../../state/viewerOrderSessionStore";
import { useViewerSystemDiveStore } from "../../../state/viewerSystemDiveStore";
import { useWorldStore } from "../../../state/worldStore";
import { hqOwnedWorlds } from "../../hqOwnedWorlds";
import { useViewerContentCatalogs } from "../../hooks/useViewerContentCatalogs";
import { PlayerPlanetManage } from "../../PlayerPlanetManage";
import type { PlanetActionRequest } from "../../PlayerPlanetManage";
import type { BuildPreviewResult, BuildQueueItem } from "../../system/types";
import type { ForceRecruitSession } from "../../../state/forceRaiseClient";
import { navigateViewerRoom } from "./navigateViewerRoom";

type Props = {
  payload: ViewerPayload;
  password: string;
  onPlanetAction: (req: PlanetActionRequest) => void | Promise<unknown>;
  onChangeBuildQueue: (next: BuildQueueItem[]) => void | Promise<unknown>;
  onPreviewBuild: (opts: {
    systemId: string;
    planetId: string;
    buildingId: string;
  }) => Promise<BuildPreviewResult | null>;
  onOpenResearch: (techId: string) => void;
  onOpenSystem: (systemId: string) => void;
  onFoundHybrid: (raceA: string, raceB: string) => void | Promise<unknown>;
  onRecruitSession: (data: ForceRecruitSession) => void;
  onShowInEconomy?: (category: string) => void;
};

export function ViewerPlanetRoom({
  payload,
  password,
  onPlanetAction,
  onChangeBuildQueue,
  onPreviewBuild,
  onOpenResearch,
  onOpenSystem,
  onFoundHybrid,
  onRecruitSession,
  onShowInEconomy,
}: Props) {
  const catalogs = useViewerContentCatalogs();
  const reservedAp = useViewerOrderSessionStore((s) => s.reservedAp);
  const apMax = useViewerOrderSessionStore((s) => s.apMax);
  const planetBusy = useViewerSystemDiveStore((s) => s.planetBusy);
  const planetMsg = useViewerSystemDiveStore((s) => s.planetMsg);
  const mapFocus = useWorldStore((s) => s.mapFocus);

  const owned = useMemo(() => hqOwnedWorlds(payload), [payload]);

  const pin = useMemo(() => {
    if (mapFocus && mapFocus.level === "planet") {
      return { systemId: mapFocus.systemId, planetId: mapFocus.planetId };
    }
    const first = owned[0];
    if (!first) return null;
    return { systemId: first.systemId, planetId: first.planetId };
  }, [mapFocus, owned]);

  const system = pin
    ? payload.world.systems.find((s) => s.id === pin.systemId)
    : null;
  const planet = system?.planets.find((p) => p.id === pin?.planetId) ?? null;
  const faction = payload.world.factions.find((f) => f.id === payload.factionId);

  if (!system || !planet) {
    return (
      <div className="planet-command planet-command--empty">
        <p className="hint">Нет своей планеты в фокусе.</p>
        <button
          type="button"
          className="btn"
          onClick={() => navigateViewerRoom("map")}
        >
          На карту
        </button>
      </div>
    );
  }

  return (
    <PlayerPlanetManage
      chrome="workbench"
      system={system}
      planet={planet}
      factionId={payload.factionId}
      stocks={payload.economy?.stocks ?? {}}
      reservedAp={reservedAp}
      apMax={apMax}
      buildings={catalogs.buildingsCatalog}
      colonies={catalogs.coloniesCatalog}
      mapResources={catalogs.mapResourcesCatalog}
      techEco={{
        techTiers: payload.economy?.techTiers,
        unlockedProperties: payload.economy?.unlockedProperties,
        unlockedLineages: payload.economy?.unlockedLineages,
        roleScores: payload.economy?.roleScores,
      }}
      busy={planetBusy}
      message={planetMsg}
      onAction={(req) => void onPlanetAction(req)}
      onBack={() => onOpenSystem(system.id)}
      onOpenResearch={onOpenResearch}
      buildQueue={payload.economy?.buildQueue ?? []}
      onChangeBuildQueue={(next) => void onChangeBuildQueue(next)}
      onPreviewBuild={(buildingId) =>
        onPreviewBuild({
          systemId: system.id,
          planetId: planet.id,
          buildingId,
        })
      }
      defaultCultureId={faction?.defaultCultureId ?? "culture.baseline"}
      primaryFaith={faction?.primaryFaith ?? "faith.secular"}
      unlockedLineages={payload.economy?.unlockedLineages ?? []}
      onFoundHybrid={(a, b) => void onFoundHybrid(a, b)}
      password={password}
      onForceRecruitSession={onRecruitSession}
      onShowInEconomy={onShowInEconomy}
    />
  );
}
