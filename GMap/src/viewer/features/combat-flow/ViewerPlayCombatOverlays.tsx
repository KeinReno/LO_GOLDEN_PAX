import type { ViewerPayload } from "../../../state/types";
import { useViewerBattleSessionStore } from "../../../state/viewerBattleSessionStore";
import type { CombatStanceId } from "../../PlayerEngagementPanel";
import { replaceEngagement } from "./engagementCopy";
import { ViewerCombatOverlays } from "./ViewerCombatOverlays";
import type { ContactStrike } from "./useCombatEngagement";

export type ViewerPlayCombatActions = {
  submitUnitOrder: (
    kind: ContactStrike["kind"],
    unitId: string,
    toSystemId: string,
    hops: number,
    orderType: "attack_system",
    extra?: undefined,
    contact?: ContactStrike["contact"],
  ) => unknown;
  submitCombatStance: (engId: string, stance: CombatStanceId) => unknown;
};

export function ViewerPlayCombatOverlays({
  payload,
  password,
  actions,
}: {
  payload: ViewerPayload;
  password: string;
  actions: ViewerPlayCombatActions;
}) {
  return (
    <ViewerCombatOverlays
      payload={payload}
      password={password}
      onSubmitContact={(strike) => {
        void actions.submitUnitOrder(
          strike.kind,
          strike.unitId,
          strike.toSystemId,
          strike.hops ?? 0,
          "attack_system",
          undefined,
          strike.contact,
        );
      }}
      onSubmitStance={(engId, stance) => {
        void actions.submitCombatStance(engId, stance);
      }}
      onEngagementUpdated={(next) => {
        useViewerBattleSessionStore
          .getState()
          .setEngagements((prev) => replaceEngagement(prev, next.id, next));
      }}
    />
  );
}
