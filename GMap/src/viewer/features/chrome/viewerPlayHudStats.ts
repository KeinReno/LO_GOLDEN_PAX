import type { ViewerPayload } from "../../../state/types";
import type { DiploOffer } from "../../diploTradeTypes";

export function diploIncomingOffers(payload: ViewerPayload): DiploOffer[] {
  return (payload.diploOffers?.incoming ?? []) as DiploOffer[];
}

export function warCountForFaction(payload: ViewerPayload): number {
  return (payload.world.diplomacy ?? []).filter(
    (d) =>
      d.relation === "war" &&
      (d.aId === payload.factionId || d.bId === payload.factionId),
  ).length;
}

export function activeQuestCount(payload: ViewerPayload): number {
  return (payload.world.quests ?? []).filter((q) => q.status === "active")
    .length;
}

export function tradePartnerCount(payload: ViewerPayload): number {
  return payload.tradePartnerIds?.length ?? 0;
}

export function factionThemeVars(faction?: {
  color?: string;
  fillColor?: string;
}) {
  return {
    ["--faction" as string]: faction?.color ?? "#c9a227",
    ["--faction-fill" as string]:
      faction?.fillColor ?? faction?.color ?? "#c9a227",
  };
}

export function viewerPlayHudStats(payload: ViewerPayload) {
  return {
    activeQuestCount: activeQuestCount(payload),
    warCount: warCountForFaction(payload),
    diploIncoming: diploIncomingOffers(payload),
    tradePartnerCount: tradePartnerCount(payload),
  };
}
