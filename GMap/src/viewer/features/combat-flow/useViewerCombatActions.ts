import { useCallback } from "react";
import { postEngagementCardRequest, postEngagementStance } from "../../../state/playerActionClient";
import type { ViewerPayload } from "../../../state/types";
import { useViewerBattleSessionStore } from "../../../state/viewerBattleSessionStore";
import { useViewerMapOverlayStore } from "../../../state/viewerMapOverlayStore";
import { useViewerOrderSessionStore } from "../../../state/viewerOrderSessionStore";
import {
  COMBAT_STANCE_LABELS,
  type CombatStanceId,
  type ViewerEngagement,
} from "../../PlayerEngagementPanel";
import { canOpenStanceRing } from "./useCombatEngagement";
import {
  cardBattleRequestMsg,
  replaceEngagement,
  stanceLockedMsg,
} from "./engagementCopy";

type Opts = {
  payload: ViewerPayload | null;
  password: string;
  refreshEngagements: (factionId: string) => Promise<unknown>;
};

export function useViewerCombatActions({
  payload,
  password,
  refreshEngagements,
}: Opts) {
  const setOrderMsg = useViewerOrderSessionStore((s) => s.setOrderMsg);
  const openCardBattle = useViewerBattleSessionStore((s) => s.openCardBattle);
  const setStanceRing = useViewerMapOverlayStore((s) => s.setStanceRing);

  const submitCombatStance = async (
    engagementId: string,
    stance: CombatStanceId,
  ) => {
    if (!payload) return;
    const battle = useViewerBattleSessionStore.getState();
    battle.setStanceBusy(true);
    try {
      const { ok, data } = await postEngagementStance(engagementId, {
        factionId: payload.factionId,
        password,
        stance,
      });
      if (!ok) throw new Error(data.error || "stance failed");
      setOrderMsg(stanceLockedMsg(COMBAT_STANCE_LABELS[stance] ?? stance));
      if (data.engagement) {
        battle.setEngagements((prev) =>
          replaceEngagement(
            prev,
            engagementId,
            data.engagement as ViewerEngagement,
          ),
        );
      } else {
        await refreshEngagements(payload.factionId);
      }
    } catch (err) {
      setOrderMsg(err instanceof Error ? err.message : String(err));
    } finally {
      battle.setStanceBusy(false);
    }
  };

  const submitRequestCardBattle = async (engagementId: string) => {
    if (!payload) return;
    const battle = useViewerBattleSessionStore.getState();
    battle.setStanceBusy(true);
    try {
      const { ok, data } = await postEngagementCardRequest(engagementId, {
        factionId: payload.factionId,
        password,
      });
      if (!ok) throw new Error(data.error || "card request failed");
      setOrderMsg(cardBattleRequestMsg(Boolean(data.mutual)));
      const eng = data.engagement as ViewerEngagement | undefined;
      if (eng) {
        battle.setEngagements((prev) =>
          replaceEngagement(prev, engagementId, eng),
        );
        if (eng.mode === "card") {
          openCardBattle(engagementId);
        }
      } else {
        await refreshEngagements(payload.factionId);
      }
    } catch (err) {
      setOrderMsg(err instanceof Error ? err.message : String(err));
    } finally {
      battle.setStanceBusy(false);
    }
  };

  const openStanceRing = useCallback(
    (
      engagementId: string,
      anchor?: { clientX: number; clientY: number },
    ) => {
      if (!payload) return;
      const eng = useViewerBattleSessionStore
        .getState()
        .engagements.find((e) => e.id === engagementId);
      if (!canOpenStanceRing(eng, payload.factionId)) return;
      setStanceRing({
        engagementId,
        x: anchor?.clientX ?? window.innerWidth / 2,
        y: anchor?.clientY ?? window.innerHeight / 2,
      });
    },
    [payload, setStanceRing],
  );

  return {
    submitCombatStance,
    submitRequestCardBattle,
    openStanceRing,
  };
}
