import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import { postQuestAction } from "../../state/playerActionClient";
import type { ViewerPayload } from "../../state/types";
import type { ActionApPayload } from "../features/order-orchestrator/orderApMerge";

export type QuestActionResult =
  | {
      ok: true;
      world?: ViewerPayload["world"];
      economy?: ViewerPayload["economy"];
      updatedAt?: ViewerPayload["updatedAt"];
      tableRevision?: ViewerPayload["tableRevision"];
      roll?: number;
      rolls?: number[];
      success?: boolean | null;
      message?: string;
      count?: number;
      quests?: { id?: string }[];
    }
  | { ok: false; error: string };

type Opts = {
  payload: ViewerPayload | null;
  password: string;
  setPayload: Dispatch<SetStateAction<ViewerPayload | null>>;
  commitApFromAction: (data: ActionApPayload) => unknown;
  setOrderMsg: (msg: string | null) => void;
};

export function useViewerQuestActions({
  payload,
  password,
  setPayload,
  commitApFromAction,
  setOrderMsg,
}: Opts) {
  const submitQuestAction = useCallback(
    async (
      action: string,
      extra: Record<string, unknown> = {},
    ): Promise<QuestActionResult> => {
      if (!payload) return { ok: false, error: "no payload" };
      try {
        const { ok, data } = await postQuestAction({
          factionId: payload.factionId,
          password,
          action,
          ...extra,
        });
        if (!ok) throw new Error(data.error || "quest failed");
        const payloadData = data as typeof data & {
          world?: ViewerPayload["world"];
          economy?: ViewerPayload["economy"];
          updatedAt?: ViewerPayload["updatedAt"];
          tableRevision?: ViewerPayload["tableRevision"];
          roll?: number;
          rolls?: number[];
          success?: boolean | null;
          message?: string;
          count?: number;
          quests?: { id?: string }[];
        };
        if (payloadData.world) {
          setPayload({
            ...payload,
            world: payloadData.world,
            economy: payloadData.economy ?? payload.economy,
            updatedAt: payloadData.updatedAt ?? payload.updatedAt,
            tableRevision: payloadData.tableRevision ?? payload.tableRevision,
          });
        }
        commitApFromAction(payloadData);
        return { ok: true, ...payloadData };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setOrderMsg(msg);
        return { ok: false, error: msg };
      }
    },
    [payload, password, setPayload, commitApFromAction, setOrderMsg],
  );

  return { submitQuestAction };
}
