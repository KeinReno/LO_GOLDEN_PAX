import type { ViewerPayload } from "../../../state/types";
import { postPlayerJson } from "../../../state/playerActionClient";
import { useViewerBattleSessionStore } from "../../../state/viewerBattleSessionStore";
import { useViewerOrderSessionStore } from "../../../state/viewerOrderSessionStore";
import { useViewerSessionStore } from "../../../state/viewerSessionStore";
import type { ViewerActionSource } from "../order-orchestrator/viewerSessionPatch";
import { ForcesDeck } from "../../forces/ForcesDeck";
import { navigateViewerRoom } from "./navigateViewerRoom";

type Recruit = {
  world?: ViewerPayload["world"];
  economy?: ViewerPayload["economy"];
  intel?: ViewerPayload["intel"];
  visibleSystemIds?: string[];
};

type Props = {
  payload: ViewerPayload;
  password: string;
  mobile: boolean;
  highlightDefIds: string[] | null;
  onFocusSystem: (systemId: string) => void;
  onOrderWithFleet: (id: string) => void;
  onOrderWithLegion: (id: string) => void;
  onOpenCardBattle: (engId: string) => void;
  onOpenProduce: (opts: {
    systemId: string;
    tab: "ships" | "units";
    fleetId?: string;
    legionId?: string;
  }) => void;
  onBeginRecruit: (tab: "ships" | "units") => void;
  onRecruitSession: (data: Recruit) => void;
  onSessionPatch: (data: ViewerActionSource) => void;
};

export function ViewerForcesRoom({
  payload,
  password,
  mobile,
  highlightDefIds,
  onFocusSystem,
  onOrderWithFleet,
  onOrderWithLegion,
  onOpenCardBattle,
  onOpenProduce,
  onBeginRecruit,
  onRecruitSession,
  onSessionPatch,
}: Props) {
  const engagements = useViewerBattleSessionStore((s) => s.engagements);
  const selectedFleetId = useViewerSessionStore((s) => s.selectedFleetId);
  const selectedLegionId = useViewerSessionStore((s) => s.selectedLegionId);
  const selectFleet = useViewerSessionStore((s) => s.selectFleet);
  const selectLegion = useViewerSessionStore((s) => s.selectLegion);
  const setOrderMsg = useViewerOrderSessionStore((s) => s.setOrderMsg);

  return (
    <ForcesDeck
      compact={mobile}
      payload={payload}
      selectedFleetId={selectedFleetId}
      selectedLegionId={selectedLegionId}
      onSelectFleet={(id) => {
        const fleet = payload.world.fleets.find((f) => f.id === id);
        selectFleet(id, fleet?.systemId);
        setOrderMsg(`Флот выбран: ${fleet?.name ?? id}`);
      }}
      onSelectLegion={(id) => {
        const leg = payload.world.legions.find((l) => l.id === id);
        selectLegion(id, leg?.systemId);
        setOrderMsg(`Легион выбран: ${leg?.name ?? id}`);
      }}
      onFocusOnMap={onFocusSystem}
      onOrderWithFleet={onOrderWithFleet}
      onOrderWithLegion={onOrderWithLegion}
      onForcesMutate={async ({
        kind,
        id,
        composition,
        stockDeltas,
        forceReserve,
      }) => {
        try {
          const { ok, status, data } = await postPlayerJson(
            "/api/forces/mutate",
            {
              factionId: payload.factionId,
              password,
              kind,
              id,
              composition,
              stockDeltas,
              forceReserve,
            },
          );
          if (!ok) {
            const err = data.error || String(status);
            setOrderMsg(err);
            return { ok: false, error: err };
          }
          onSessionPatch(data);
          return { ok: true };
        } catch (e) {
          const err = e instanceof Error ? e.message : String(e);
          setOrderMsg(err);
          return { ok: false, error: err };
        }
      }}
      password={password}
      onForceRecruitSession={onRecruitSession}
      onToast={(msg) => setOrderMsg(msg)}
      highlightDefIds={highlightDefIds}
      engagements={engagements}
      onOpenEngagement={(engId) => {
        const eng = engagements.find((e) => e.id === engId);
        if (eng?.systemId) onFocusSystem(eng.systemId);
        setOrderMsg(`Бой · ${engId}`);
      }}
      onOpenCardBattle={onOpenCardBattle}
      onOpenEconomy={() => navigateViewerRoom("economy")}
      onOpenProduce={onOpenProduce}
      onBeginRecruit={onBeginRecruit}
    />
  );
}
