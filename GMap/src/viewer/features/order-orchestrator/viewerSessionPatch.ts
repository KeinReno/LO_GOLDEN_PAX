import type { ViewerPayload, WorldState } from "../../../state/types";

export type ViewerActionFields = {
  world?: ViewerPayload["world"];
  economy?: ViewerPayload["economy"];
  intel?: ViewerPayload["intel"];
  visibleSystemIds?: string[];
  knownFactionIds?: string[];
  tradePartnerIds?: string[];
  diploOffers?: ViewerPayload["diploOffers"];
  tableRevision?: number;
  reservedAp?: number;
  apMax?: number;
  forceApMax?: number;
  reservedForceAp?: number;
  briefing?: ViewerPayload["briefing"];
  updatedAt?: string | null;
  factionId?: string;
};

export type ViewerActionSource = {
  world?: unknown;
  economy?: unknown;
  intel?: unknown;
  visibleSystemIds?: string[];
  knownFactionIds?: string[];
  tradePartnerIds?: string[];
  diploOffers?: unknown;
  tableRevision?: number;
  reservedAp?: number;
  apMax?: number;
  forceApMax?: number;
  reservedForceAp?: number;
  briefing?: unknown;
  updatedAt?: string | null;
  factionId?: string;
};

export function sessionPatchFromAction(
  prev: ViewerPayload | null,
  data: ViewerActionSource,
): { next: ViewerPayload | null; world?: ViewerPayload["world"] } {
  const fields = fieldsFromAction(data);
  return {
    next: prev ? patchViewerPayload(prev, fields) : prev,
    world: fields.world,
  };
}

export function applyViewerSessionFromAction(
  data: ViewerActionSource,
  opts: {
    setPayload: (
      updater: (prev: ViewerPayload | null) => ViewerPayload | null,
    ) => void;
    loadWorld: (world: ViewerPayload["world"]) => void;
    commitAp: (data: ViewerActionSource) => void;
  },
) {
  opts.setPayload((prev) => sessionPatchFromAction(prev, data).next);
  const world = fieldsFromAction(data).world;
  if (world) opts.loadWorld(world);
  opts.commitAp(data);
}

export function fieldsFromAction(data: ViewerActionSource): ViewerActionFields {
  return {
    world: data.world as ViewerPayload["world"] | undefined,
    economy: data.economy as ViewerPayload["economy"] | undefined,
    intel: data.intel as ViewerPayload["intel"] | undefined,
    visibleSystemIds: data.visibleSystemIds,
    knownFactionIds: data.knownFactionIds,
    tradePartnerIds: data.tradePartnerIds,
    diploOffers: data.diploOffers as ViewerPayload["diploOffers"] | undefined,
    tableRevision: data.tableRevision,
    reservedAp: data.reservedAp,
    apMax: data.apMax,
    forceApMax: data.forceApMax,
    reservedForceAp: data.reservedForceAp,
    briefing: data.briefing as ViewerPayload["briefing"] | undefined,
    updatedAt: data.updatedAt,
    factionId: data.factionId,
  };
}

export function patchViewerPayload(
  prev: ViewerPayload,
  data: ViewerActionFields,
): ViewerPayload {
  return {
    ...prev,
    world: data.world ?? prev.world,
    economy: data.economy ?? prev.economy,
    intel: data.intel ?? prev.intel,
    visibleSystemIds: data.visibleSystemIds ?? prev.visibleSystemIds,
    knownFactionIds: data.knownFactionIds ?? prev.knownFactionIds,
    tradePartnerIds: data.tradePartnerIds ?? prev.tradePartnerIds,
    diploOffers: data.diploOffers ?? prev.diploOffers,
    tableRevision: data.tableRevision ?? prev.tableRevision,
    reservedAp: data.reservedAp ?? prev.reservedAp,
    apMax: data.apMax ?? prev.apMax,
    forceApMax: data.forceApMax ?? prev.forceApMax,
    reservedForceAp: data.reservedForceAp ?? prev.reservedForceAp,
    briefing: data.briefing ?? prev.briefing,
    updatedAt: data.updatedAt ?? prev.updatedAt,
    factionId: data.factionId ?? prev.factionId,
  };
}

/** Drop a pending order and clear its unit route. */
export function worldAfterCancelOrder(
  world: WorldState,
  orderId: string,
): WorldState {
  const cancelled = world.orders.find((o) => o.id === orderId);
  let next: WorldState = {
    ...world,
    orders: world.orders.filter((x) => x.id !== orderId),
  };
  if (cancelled?.fleetId) {
    next = {
      ...next,
      fleets: next.fleets.map((f) =>
        f.id === cancelled.fleetId ? { ...f, route: [] } : f,
      ),
    };
  }
  if (cancelled?.legionId) {
    next = {
      ...next,
      legions: next.legions.map((l) =>
        l.id === cancelled.legionId ? { ...l, route: [] } : l,
      ),
    };
  }
  return next;
}
