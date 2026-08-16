import type { ViewerPayload } from "../../../state/types";
import type { ViewerPlayCatalogs } from "../../hooks/viewerContentCatalogs";
import type { PlanetActionRequest } from "../../PlayerPlanetManage";
import type { SystemActionRequest } from "../../SystemCommandPanel";
import type { BuildPreviewResult, BuildQueueItem } from "../../system/types";
import type { RecruitSessionPatch } from "./systemActionCopy";
import { ViewerSystemDive } from "./ViewerSystemDive";

export type ViewerPlayDiveActions = {
  onClose: () => void;
  onOpenPlanet: (systemId: string, planetId: string) => void;
  onFocusSystem: (systemId: string) => void;
  onPlanetAction: (req: PlanetActionRequest) => void | Promise<unknown>;
  onSystemAction: (req: SystemActionRequest) => void | Promise<unknown>;
  onFoundHybrid: (raceA: string, raceB: string) => void | Promise<unknown>;
  onRecruitSession: (data: RecruitSessionPatch) => void;
  onOpenResearch: (techId: string) => void;
  onChangeBuildQueue: (next: BuildQueueItem[]) => void | Promise<unknown>;
  onPreviewBuild: (opts: {
    systemId: string;
    planetId: string;
    buildingId: string;
  }) => Promise<BuildPreviewResult | null>;
  onClaim: (systemId: string, fleetId?: string | null) => void;
  onAttack: (fleetId: string, systemId: string) => void;
};

type Props = {
  payload: ViewerPayload;
  password: string;
  catalogs: ViewerPlayCatalogs;
  actions: ViewerPlayDiveActions;
};

export function ViewerPlaySystemDive({
  payload,
  password,
  catalogs,
  actions,
}: Props) {
  return (
    <ViewerSystemDive
      payload={payload}
      password={password}
      buildingsCatalog={catalogs.buildingsCatalog}
      coloniesCatalog={catalogs.coloniesCatalog}
      mapResourcesCatalog={catalogs.mapResourcesCatalog}
      shipsCatalog={catalogs.shipsCatalog}
      unitsCatalog={catalogs.unitsCatalog}
      onClose={actions.onClose}
      onOpenPlanet={actions.onOpenPlanet}
      onFocusSystem={actions.onFocusSystem}
      onPlanetAction={(req) => void actions.onPlanetAction(req)}
      onSystemAction={(req) => void actions.onSystemAction(req)}
      onFoundHybrid={(raceA, raceB) => void actions.onFoundHybrid(raceA, raceB)}
      onRecruitSession={actions.onRecruitSession}
      onOpenResearch={actions.onOpenResearch}
      onChangeBuildQueue={(next) => void actions.onChangeBuildQueue(next)}
      onPreviewBuild={actions.onPreviewBuild}
      onClaim={actions.onClaim}
      onAttack={actions.onAttack}
    />
  );
}
