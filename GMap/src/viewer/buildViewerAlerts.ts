import type { ViewerPayload } from "../state/types";
import type { ViewerEngagement } from "./PlayerEngagementPanel";
import type { AlertFocusAnchor, AlertItem } from "./ViewerAlertFab";
import type { EconomySystemSignal } from "./economyFlowTypes";

const ENGAGEMENT_STATUS: Record<string, string> = {
  commit: "к бою",
  contact: "контакт",
};

function isOpenEngagement(eng: ViewerEngagement): boolean {
  return eng.status === "commit" || eng.status === "contact";
}

function systemName(world: ViewerPayload["world"], id: string): string {
  return world.systems.find((s) => s.id === id)?.name ?? id;
}

function findIdleFleets(
  payload: ViewerPayload,
): { id: string; name: string; systemId: string }[] {
  const pendingFleetIds = new Set(
    payload.world.orders
      .filter((o) => o.status === "pending" && o.fleetId)
      .map((o) => o.fleetId as string),
  );
  return payload.world.fleets
    .filter(
      (f) =>
        f.factionId === payload.factionId &&
        !pendingFleetIds.has(f.id) &&
        (f.stance === "idle" ||
          ((!f.route || f.route.length === 0) && f.stance !== "move")),
    )
    .map((f) => ({ id: f.id, name: f.name, systemId: f.systemId }));
}

export function buildEconomyWarning(
  eco: ViewerPayload["economy"],
  systemSignals?: EconomySystemSignal[],
): string | null {
  if (!eco) return null;
  const parts: string[] = [];
  if (eco.deficit && eco.deficit !== "none" && eco.deficit !== "ok") {
    parts.push(`дефицит ${eco.deficit}`);
  }
  const bn =
    eco.bottlenecks && typeof eco.bottlenecks === "object"
      ? Object.keys(eco.bottlenecks).length
      : 0;
  if (bn > 0) parts.push(`${bn} узких мест`);
  if (typeof eco.pressure === "number" && eco.pressure > 0) {
    parts.push(`давление ${eco.pressure}`);
  }
  const attributed = (systemSignals ?? []).filter((s) => s.systemId);
  if (attributed.length > 0) {
    const names = [...new Set(attributed.map((s) => s.systemName))];
    const preview = names.slice(0, 2).join(", ");
    parts.push(
      names.length > 2
        ? `${names.length} систем: ${preview}…`
        : `${names.length} систем: ${preview}`,
    );
  }
  return parts.length ? parts.join(" · ") : null;
}

export type BuildViewerAlertsInput = {
  payload: ViewerPayload;
  engagements: ViewerEngagement[];
  pendingOrderCount: number;
  rpUnread: number;
  economyWarning?: string | null;
  systemSignals?: EconomySystemSignal[];
  callbacks: {
    onFocusIdleFleet: (fleetId: string, systemId: string) => void;
    onFocusEngagement: (
      systemId: string,
      engagementId: string,
      anchor?: AlertFocusAnchor,
    ) => void;
    onFocusOrders: (anchor?: AlertFocusAnchor) => void;
    onFocusRp: (anchor?: AlertFocusAnchor) => void;
    onFocusEconomy: (anchor?: AlertFocusAnchor) => void;
    onFocusDiplo?: (offerId?: string) => void;
  };
};

export function buildViewerAlerts(input: BuildViewerAlertsInput): AlertItem[] {
  const {
    payload,
    engagements,
    pendingOrderCount,
    rpUnread,
    economyWarning,
    systemSignals,
    callbacks,
  } = input;
  const items: AlertItem[] = [];
  const idleFleets = findIdleFleets(payload);

  if (idleFleets.length === 1) {
    const f = idleFleets[0]!;
    items.push({
      id: `idle-fleet-${f.id}`,
      kind: "idle_fleet",
      title: `Флот без приказа: ${f.name}`,
      subtitle: systemName(payload.world, f.systemId),
      onFocus: () => callbacks.onFocusIdleFleet(f.id, f.systemId),
    });
  } else if (idleFleets.length > 1) {
    const first = idleFleets[0]!;
    items.push({
      id: "idle-fleets",
      kind: "idle_fleet",
      title: `${idleFleets.length} флота без приказа`,
      subtitle: first.name,
      onFocus: () => callbacks.onFocusIdleFleet(first.id, first.systemId),
    });
  }

  for (const eng of engagements) {
    if (!isOpenEngagement(eng)) continue;
    if (!eng.sides.some((s) => s.factionId === payload.factionId)) continue;
    items.push({
      id: `engagement-${eng.id}`,
      kind: "engagement",
      title: `Бой: ${systemName(payload.world, eng.systemId)}`,
      subtitle: ENGAGEMENT_STATUS[eng.status] ?? eng.status,
      onFocus: (anchor) =>
        callbacks.onFocusEngagement(eng.systemId, eng.id, anchor),
    });
  }

  if (pendingOrderCount > 0) {
    items.push({
      id: "pending-orders",
      kind: "orders",
      title:
        pendingOrderCount === 1
          ? "1 приказ в очереди"
          : `${pendingOrderCount} приказов в очереди`,
      subtitle: "Можно отменить до тика",
      onFocus: callbacks.onFocusOrders,
    });
  }

  const incomingDiplo = payload.diploOffers?.incoming?.length ?? 0;
  if (incomingDiplo > 0 && callbacks.onFocusDiplo) {
    const firstId = payload.diploOffers?.incoming?.[0]?.id;
    items.push({
      id: "diplo-incoming",
      kind: "orders",
      title:
        incomingDiplo === 1
          ? "Входящее дипломатическое предложение"
          : `${incomingDiplo} входящих предложений`,
      subtitle: "Требует ответа",
      onFocus: () => callbacks.onFocusDiplo?.(firstId),
    });
  }

  if (rpUnread > 0) {
    items.push({
      id: "rp-unread",
      kind: "rp",
      title:
        rpUnread === 1
          ? "Новое сообщение в сцене"
          : `${rpUnread > 9 ? "9+" : rpUnread} сообщений в сцене`,
      subtitle: "Сцена с мастером",
      onFocus: callbacks.onFocusRp,
    });
  }

  const ecoWarn =
    economyWarning ??
    buildEconomyWarning(payload.economy, systemSignals);
  if (ecoWarn) {
    items.push({
      id: "economy-warning",
      kind: "economy",
      title: "Экономика требует внимания",
      subtitle: ecoWarn,
      onFocus: callbacks.onFocusEconomy,
    });
  }

  return items;
}
