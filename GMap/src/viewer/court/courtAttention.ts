import type { FactionNpc, InternalBloc, ViewerPayload } from "../../state/types.ts";
import type { CourtTabId } from "./courtTabs.ts";

export type CourtAttentionItem = {
  id: string;
  text: string;
  tone?: "warn" | "info" | "good";
  jump?: CourtTabId;
};

function hasGovernor(npcs: FactionNpc[] | undefined, systemId: string): boolean {
  return (npcs ?? []).some(
    (n) =>
      n.status !== "dead" &&
      n.status !== "hidden" &&
      n.posting?.kind === "governor" &&
      n.posting?.systemId === systemId,
  );
}

export function courtAttentionCounts(payload: ViewerPayload): {
  ungoverned: number;
  vacantHouses: number;
} {
  const fac = payload.world.factions.find((f) => f.id === payload.factionId);
  const npcs = (fac?.npcs ?? []).filter(
    (n) => n.status !== "hidden" && n.status !== "dead",
  );
  const ungoverned = payload.world.systems.filter(
    (s) =>
      s.ownerFactionId === payload.factionId &&
      (s.planets ?? []).some((p) => (p.population || 0) > 0) &&
      !hasGovernor(npcs, s.id),
  ).length;
  const vacantHouses = (fac?.internalBlocs ?? []).filter((b) => {
    const needs =
      b.kind === "house" || b.kind === "church" || b.kind === "race_caucus";
    return needs && !b.leaderNpcId;
  }).length;
  return { ungoverned, vacantHouses };
}

export function countCourtAttention(payload: ViewerPayload): number {
  const c = courtAttentionCounts(payload);
  return c.ungoverned + c.vacantHouses;
}

export function buildCourtAttention(opts: {
  ungovernedCount: number;
  vacantHouses: InternalBloc[];
  seated: number;
  seatSlots: number;
  fieldPosted: number;
}): CourtAttentionItem[] {
  const items: CourtAttentionItem[] = [];
  if (opts.ungovernedCount > 0) {
    items.push({
      id: "ungoverned",
      text: `${opts.ungovernedCount} систем без наместника`,
      tone: "warn",
      jump: "field",
    });
  }
  if (opts.vacantHouses.length > 0) {
    items.push({
      id: "vacant-houses",
      text: `${opts.vacantHouses.length} домов без главы`,
      tone: "warn",
      jump: "houses",
    });
  }
  if (opts.seated === 0 && opts.seatSlots > 0) {
    items.push({
      id: "empty-table",
      text: "Стол пуст — посадите советников",
      tone: "info",
      jump: "council",
    });
  }
  if (items.length === 0 && opts.fieldPosted > 0) {
    items.push({
      id: "calm",
      text: "Двор спокоен",
      tone: "good",
    });
  }
  return items;
}
