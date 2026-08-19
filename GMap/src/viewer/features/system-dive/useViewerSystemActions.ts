import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { MapCanvasApi } from "../../../renderers/MapCanvas";
import { getCachedContent } from "../../../state/contentCatalog";
import { postPlayerJson } from "../../../state/playerActionClient";
import type { ViewerPayload } from "../../../state/types";
import { useViewerOrderSessionStore } from "../../../state/viewerOrderSessionStore";
import { useViewerPanelFocusStore } from "../../../state/viewerPanelFocusStore";
import { useViewerSessionStore } from "../../../state/viewerSessionStore";
import { useViewerSystemDiveStore } from "../../../state/viewerSystemDiveStore";
import { useWorldStore } from "../../../state/worldStore";
import type { BuildingDef, PlanetActionRequest } from "../../PlayerPlanetManage";
import type { SystemActionRequest } from "../../SystemCommandPanel";
import { findPlanetForBuilding, systemsForTechHighlight } from "../../research";
import type { BuildPreviewResult, BuildQueueItem } from "../../system/types";
import { navigateViewerRoom } from "../rooms-router/navigateViewerRoom";
import {
  planetActionMsg,
  systemActionMsg,
} from "../order-orchestrator/viewerActionCopy";
import {
  patchViewerPayload,
  type ViewerActionSource,
} from "../order-orchestrator/viewerSessionPatch";
import {
  buildingFromResearchNote,
  buildQueueUpdatedMsg,
  hybridFoundedMsg,
  hybridLineageTarget,
  hybridNeedPlanetMsg,
  noPlanetForBuildingMsg,
  techHighlightNote,
  unknownTechMsg,
  type RecruitSessionPatch,
} from "./systemActionCopy";

export type { RecruitSessionPatch };

type ApplySession = (data: ViewerActionSource) => void;

type Opts = {
  payload: ViewerPayload | null;
  password: string;
  setPayload: Dispatch<SetStateAction<ViewerPayload | null>>;
  applySessionFromAction: ApplySession;
  bump: () => void;
  loadWorld: (world: ViewerPayload["world"]) => void;
  mapApiRef: { current: MapCanvasApi | null };
  buildingsCatalog: Record<string, BuildingDef>;
  onOpenSystem: (systemId: string) => void;
  onOpenPlanet: (systemId: string, planetId: string) => void;
};

export function useViewerSystemActions({
  payload,
  password,
  setPayload,
  applySessionFromAction,
  bump,
  loadWorld,
  mapApiRef,
  buildingsCatalog,
  onOpenSystem,
  onOpenPlanet,
}: Opts) {
  const setOrderMsg = useViewerOrderSessionStore((s) => s.setOrderMsg);
  const setResearchHighlightTechId = useViewerPanelFocusStore(
    (s) => s.setResearchHighlightTechId,
  );
  const setTechMapHighlightIds = useViewerPanelFocusStore(
    (s) => s.setTechMapHighlightIds,
  );
  const setSelectedSystemId = useViewerSessionStore(
    (s) => s.setSelectedSystemId,
  );
  const mapFocus = useWorldStore((s) => s.mapFocus);
  const systemFocusId = useViewerSystemDiveStore((s) => s.systemFocusId);

  const postEconomy = async (
    url: string,
    extra: Record<string, unknown>,
  ) => {
    if (!payload) throw new Error("Нет сессии");
    const { ok, status, data } = await postPlayerJson(url, {
      factionId: payload.factionId,
      password,
      ...extra,
    });
    if (!ok) throw new Error(data.error || String(status));
    if (data.economy) {
      setPayload((prev) =>
        prev
          ? patchViewerPayload(prev, {
              economy: data.economy as ViewerPayload["economy"],
            })
          : prev,
      );
    }
    return data;
  };

  const setBuildQueue = async (queue: BuildQueueItem[]) => {
    if (!payload) return;
    const dive = useViewerSystemDiveStore.getState();
    dive.setPlanetBusy(true);
    dive.setPlanetMsg(null);
    try {
      const data = await postEconomy("/api/economy/build-queue", { queue });
      dive.setPlanetMsg(
        buildQueueUpdatedMsg(
          (data.queue as unknown[] | undefined)?.length ?? 0,
        ),
      );
    } catch (err) {
      dive.setPlanetMsg(err instanceof Error ? err.message : String(err));
    } finally {
      dive.setPlanetBusy(false);
    }
  };

  const previewBuild = async (opts: {
    systemId: string;
    planetId: string;
    buildingId: string;
  }) => {
    if (!payload) return null;
    try {
      const { ok, status, data } = await postPlayerJson(
        "/api/economy/preview-build",
        {
          factionId: payload.factionId,
          password,
          ...opts,
        },
      );
      if (!ok) return { ok: false, error: data.error || String(status) };
      return data as unknown as BuildPreviewResult;
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  };

  const openResearchWithTech = useCallback((techId: string) => {
    setResearchHighlightTechId(techId);
    navigateViewerRoom("research");
  }, [setResearchHighlightTechId]);

  const highlightSystemsForTech = useCallback(
    (techId: string) => {
      if (!payload) return;
      const tech = getCachedContent()?.technologies?.[techId];
      if (!tech) {
        setOrderMsg(unknownTechMsg());
        return;
      }
      const ids = systemsForTechHighlight(
        tech,
        payload.world.systems || [],
        payload.factionId,
        {
          techTiers: payload.economy?.techTiers,
          unlockedProperties: payload.economy?.unlockedProperties,
          roleScores: payload.economy?.roleScores,
        },
      );
      setTechMapHighlightIds(ids);
      navigateViewerRoom("map");
      if (ids[0]) {
        setSelectedSystemId(ids[0]);
        window.setTimeout(() => mapApiRef.current?.focusSystem(ids[0]), 80);
      }
      setOrderMsg(techHighlightNote(ids.length, tech.name));
    },
    [payload, mapApiRef, setOrderMsg, setSelectedSystemId, setTechMapHighlightIds],
  );

  const runFoundHybridLineage = async (raceA: string, raceB: string) => {
    if (!payload) return;
    const target = hybridLineageTarget(mapFocus, systemFocusId);
    if (!target) {
      useViewerSystemDiveStore.getState().setPlanetMsg(hybridNeedPlanetMsg());
      return;
    }
    const dive = useViewerSystemDiveStore.getState();
    dive.setPlanetBusy(true);
    dive.setPlanetMsg(null);
    try {
      const { ok, status, data } = await postPlayerJson(
        "/api/society/found-lineage",
        {
          factionId: payload.factionId,
          password,
          systemId: target.systemId,
          planetId: target.planetId,
          raceA,
          raceB,
        },
      );
      if (!ok) throw new Error(data.error || String(status));
      applySessionFromAction(data);
      const lineageId = (data as { lineageId?: string }).lineageId;
      dive.setPlanetMsg(
        hybridFoundedMsg(
          (lineageId
            ? getCachedContent()?.races?.[lineageId]?.name
            : undefined) ??
            lineageId ??
            "",
        ),
      );
      bump();
    } catch (e) {
      dive.setPlanetMsg(e instanceof Error ? e.message : String(e));
    } finally {
      dive.setPlanetBusy(false);
    }
  };

  const runPlanetAction = async (req: PlanetActionRequest) => {
    if (!payload) return;
    const dive = useViewerSystemDiveStore.getState();
    dive.setPlanetBusy(true);
    dive.setPlanetMsg(null);
    try {
      const { ok, status, data } = await postPlayerJson("/api/planet/action", {
        factionId: payload.factionId,
        password,
        ...req,
      });
      if (!ok) throw new Error(data.error || String(status));
      applySessionFromAction(data);
      dive.setPlanetMsg(planetActionMsg(req.action));
      bump();
    } catch (e) {
      dive.setPlanetMsg(e instanceof Error ? e.message : String(e));
    } finally {
      dive.setPlanetBusy(false);
    }
  };

  const applyRecruitSession = (data: RecruitSessionPatch) => {
    setPayload((prev) => (prev ? patchViewerPayload(prev, data) : prev));
    if (data.world) loadWorld(data.world);
    bump();
  };

  const runSystemAction = async (req: SystemActionRequest) => {
    if (!payload) return;
    const dive = useViewerSystemDiveStore.getState();
    dive.setSystemBusy(true);
    dive.setSystemMsg(null);
    try {
      const { ok, status, data } = await postPlayerJson("/api/system/action", {
        factionId: payload.factionId,
        password,
        ...req,
      });
      if (!ok) throw new Error(data.error || String(status));
      applySessionFromAction(data);
      dive.setSystemMsg(systemActionMsg(req.action));
      bump();
    } catch (e) {
      dive.setSystemMsg(e instanceof Error ? e.message : String(e));
    } finally {
      dive.setSystemBusy(false);
    }
  };

  const openBuildingFromResearch = useCallback(
    (buildingId: string) => {
      if (!payload) return;
      const def = buildingsCatalog[buildingId];
      const hit = findPlanetForBuilding(
        buildingId,
        payload.world.systems || [],
        payload.factionId,
      );
      if (!hit) {
        setOrderMsg(noPlanetForBuildingMsg());
        return;
      }
      setTechMapHighlightIds([hit.systemId]);
      navigateViewerRoom("map");
      onOpenSystem(hit.systemId);
      onOpenPlanet(hit.systemId, hit.planetId);
      setOrderMsg(buildingFromResearchNote(hit.systemName, def?.name));
    },
    [
      payload,
      buildingsCatalog,
      onOpenSystem,
      onOpenPlanet,
      setOrderMsg,
      setTechMapHighlightIds,
    ],
  );

  return {
    setBuildQueue,
    previewBuild,
    openResearchWithTech,
    highlightSystemsForTech,
    runFoundHybridLineage,
    runPlanetAction,
    applyRecruitSession,
    runSystemAction,
    openBuildingFromResearch,
  };
}
