import type { ViewerPayload } from "../../../state/types";
import {
  postCourtNpcPosting,
  postCourtNpcRecall,
  postCourtNpcSeat,
  postCourtNpcUnseat,
} from "../../../state/courtRoster";
import { useViewerOrderSessionStore } from "../../../state/viewerOrderSessionStore";
import { CourtPanel } from "../../CourtPanel";
import {
  worldAfterBlocLeader,
  worldAfterRaceLeader,
  worldAfterSeatPortfolio,
} from "./courtWorldPatch";

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
  factionColor?: string;
  onRecruitSession: (data: Recruit) => void;
  onWorld: (world: ViewerPayload["world"]) => void;
  submitIntent: (
    defId: string,
    args: Record<string, unknown>,
    note: string,
  ) => Promise<boolean>;
};

export function ViewerCourtRoom({
  payload,
  password,
  mobile,
  factionColor,
  onRecruitSession,
  onWorld,
  submitIntent,
}: Props) {
  const setOrderMsg = useViewerOrderSessionStore((s) => s.setOrderMsg);

  const applyCourt = async (
    result: { ok: true; data: Recruit } | { ok: false; error: string },
    okMsg: string,
  ) => {
    if (!result.ok) {
      setOrderMsg(result.error);
      return false;
    }
    onRecruitSession(result.data);
    setOrderMsg(okMsg);
    return true;
  };

  return (
    <CourtPanel
      payload={payload}
      password={password}
      layout="fill"
      compact={mobile}
      factionColor={factionColor}
      onMsg={(m) => setOrderMsg(m)}
      onGiveNpcTask={async (npcId, opts) => {
        return submitIntent(
          "intent.give_npc_task",
          {
            npcId,
            taskLabel: opts.taskLabel,
            etaTurn: opts.etaTurn,
            linkedQuestId: opts.linkedQuestId,
            taskId: opts.taskId,
          },
          "Поручение для двора принято",
        );
      }}
      onAssignPosting={async (npcId, opts) => {
        const result = await postCourtNpcPosting({
          factionId: payload.factionId,
          password,
          npcId,
          kind: opts.kind,
          systemId: opts.systemId,
          legionId: opts.legionId,
          fleetId: opts.fleetId,
          forceId: opts.forceId || opts.legionId || opts.fleetId,
          targetId: opts.systemId || opts.legionId || opts.fleetId,
        });
        return applyCourt(result, "Назначение принято");
      }}
      onRecallPosting={async (npcId) => {
        const result = await postCourtNpcRecall({
          factionId: payload.factionId,
          password,
          npcId,
        });
        return applyCourt(result, "NPC отозван ко двору");
      }}
      onSeatCouncil={async (npcId, seatId) => {
        if (seatId === "seat.ruler") return false;
        const result = await postCourtNpcSeat({
          factionId: payload.factionId,
          password,
          npcId,
          seatId,
        });
        return applyCourt(result, "Место за столом занято");
      }}
      onUnseatCouncil={async (npcId) => {
        const result = await postCourtNpcUnseat({
          factionId: payload.factionId,
          password,
          npcId,
        });
        return applyCourt(result, "Отправлен в пул двора");
      }}
      onSetSeatPortfolio={async (seatId, portfolioId) => {
        const ok = await submitIntent(
          "intent.set_council_portfolio",
          { seatId, portfolioId },
          "Роль советника обновлена",
        );
        if (ok) {
          onWorld(
            worldAfterSeatPortfolio(
              payload.world,
              payload.factionId,
              seatId,
              portfolioId,
            ),
          );
        }
        return ok;
      }}
      onAssignBlocLeader={async (npcId, blocId) => {
        const ok = await submitIntent(
          "intent.assign_bloc_leader",
          { npcId, blocId },
          "Глава дома назначен",
        );
        if (ok) {
          onWorld(
            worldAfterBlocLeader(
              payload.world,
              payload.factionId,
              npcId,
              blocId,
            ),
          );
        }
        return ok;
      }}
      onAssignRaceLeader={async (npcId, raceId, title) => {
        const ok = await submitIntent(
          "intent.assign_race_leader",
          { npcId, raceId, title },
          "Лидер народа назначен",
        );
        if (ok) {
          onWorld(
            worldAfterRaceLeader(
              payload.world,
              payload.factionId,
              npcId,
              raceId,
              title,
            ),
          );
        }
        return ok;
      }}
    />
  );
}
