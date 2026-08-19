import { ruCount } from "../state/playerUiTerms.ts";
import type { ViewerPayload } from "../state/types";
import type { ViewerEngagement } from "./PlayerEngagementPanel";
import type { AlertFocusAnchor, AlertItem } from "./ViewerAlertFab";
import type { EconomySystemSignal } from "./economyFlowTypes";

const ENGAGEMENT_STATUS: Record<string, string> = {
  active: "зафиксируйте стойку",
  commit: "к бою",
  contact: "контакт",
};

const ATTENTION_CAP = 5;

function isOpenEngagement(eng: ViewerEngagement): boolean {
  return (
    eng.status === "active" ||
    eng.status === "commit" ||
    eng.status === "contact"
  );
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
  /** Decisions this turn — counted by the caller so this module stays Node-testable. */
  questAttention?: number;
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
    onFocusQuests?: () => void;
  };
};

type OpenEngagementKind = "invite" | "card" | "stance";

function engagementKind(
  eng: ViewerEngagement,
  factionId: string,
): OpenEngagementKind {
  const iRequested = (eng.cardBattleRequests || []).includes(factionId);
  const theyRequested = eng.sides.some(
    (s) =>
      s.factionId !== factionId &&
      (eng.cardBattleRequests || []).includes(s.factionId),
  );
  if (theyRequested && !iRequested) return "invite";
  if (eng.mode === "card") return "card";
  return "stance";
}

function collectOpenEngagements(
  payload: ViewerPayload,
  engagements: ViewerEngagement[],
): { eng: ViewerEngagement; kind: OpenEngagementKind }[] {
  const rows: { eng: ViewerEngagement; kind: OpenEngagementKind }[] = [];
  for (const eng of engagements) {
    if (!isOpenEngagement(eng)) continue;
    if (!eng.sides.some((s) => s.factionId === payload.factionId)) continue;
    rows.push({ eng, kind: engagementKind(eng, payload.factionId) });
  }
  const rank = { invite: 0, card: 1, stance: 2 };
  rows.sort((a, b) => rank[a.kind] - rank[b.kind]);
  return rows;
}

function engagementAlert(
  payload: ViewerPayload,
  rows: { eng: ViewerEngagement; kind: OpenEngagementKind }[],
  onFocus: BuildViewerAlertsInput["callbacks"]["onFocusEngagement"],
): AlertItem | null {
  const first = rows[0];
  if (!first) return null;
  const { eng, kind } = first;
  const extra = rows.length - 1;
  const place = systemName(payload.world, eng.systemId);
  const more = extra > 0 ? ` · ещё ${ruCount(extra, "бой", "боя", "боёв")}` : "";
  const mySide = eng.sides.find((s) => s.factionId === payload.factionId);

  if (kind === "invite") {
    return {
      id: extra > 0 ? "engagements-open" : `card-invite-${eng.id}`,
      kind: "engagement",
      verb: "Принять вызов",
      title:
        extra > 0
          ? `${ruCount(rows.length, "бой", "боя", "боёв")} требуют ответа`
          : "Вызов на карточный бой",
      subtitle: `${place} · нажмите «Принять»${more}`,
      onFocus: (anchor) => onFocus(eng.systemId, eng.id, anchor),
    };
  }
  if (kind === "card") {
    return {
      id: extra > 0 ? "engagements-open" : `card-battle-${eng.id}`,
      kind: "engagement",
      verb: "Открыть бой",
      title: extra > 0 ? ruCount(rows.length, "карточный бой", "карточных боя", "карточных боёв") : "Карточный бой идёт",
      subtitle: `${place}${more}`,
      onFocus: (anchor) => onFocus(eng.systemId, eng.id, anchor),
    };
  }
  return {
    id: extra > 0 ? "engagements-open" : `engagement-${eng.id}`,
    kind: "engagement",
    verb: "Зафиксировать стойку",
    title:
      extra > 0
        ? ruCount(rows.length, "бой", "боя", "боёв")
        : `Бой в системе ${place}`,
    subtitle:
      extra > 0
        ? place
        : mySide && !mySide.locked
          ? "зафиксируйте стойку"
          : ENGAGEMENT_STATUS[eng.status] ?? eng.status,
    onFocus: (anchor) => onFocus(eng.systemId, eng.id, anchor),
  };
}

function economyAlert(
  payload: ViewerPayload,
  economyWarning: string | null | undefined,
  systemSignals: EconomySystemSignal[] | undefined,
  onFocus: BuildViewerAlertsInput["callbacks"]["onFocusEconomy"],
): AlertItem | null {
  const ecoWarn =
    economyWarning ?? buildEconomyWarning(payload.economy, systemSignals);
  const topEco = systemSignals?.[0];
  if (!ecoWarn) return null;
  const when =
    topEco?.turnsUntil === 0
      ? "уже не хватает"
      : topEco?.turnsUntil != null
        ? `через ~${topEco.turnsUntil} ход.`
        : null;
  const subtitle = topEco
    ? [topEco.reason, when, topEco.consequence].filter(Boolean).join(" · ")
    : ecoWarn;
  const pressure = payload.economy?.pressure ?? 0;
  const verb = topEco
    ? "Проверить производство"
    : pressure >= 2
      ? "Открыть политики"
      : "Открыть дефицит";
  return {
    id: "economy-warning",
    kind: "economy",
    verb,
    title: topEco
      ? `Узкое место · ${topEco.systemName}`
      : "Экономика требует внимания",
    subtitle,
    onFocus,
  };
}

function idleFleetAlert(
  payload: ViewerPayload,
  onFocus: BuildViewerAlertsInput["callbacks"]["onFocusIdleFleet"],
): AlertItem | null {
  const idleFleets = findIdleFleets(payload);
  if (!idleFleets.length) return null;
  const first = idleFleets[0]!;
  if (idleFleets.length === 1) {
    return {
      id: `idle-fleet-${first.id}`,
      kind: "idle_fleet",
      verb: "Назначить приказ",
      title: `Флот без приказа: ${first.name}`,
      subtitle: systemName(payload.world, first.systemId),
      onFocus: () => onFocus(first.id, first.systemId),
    };
  }
  return {
    id: "idle-fleets",
    kind: "idle_fleet",
    verb: "Назначить приказ",
    title: `${ruCount(idleFleets.length, "флот", "флота", "флотов")} без приказа`,
    subtitle: first.name,
    onFocus: () => onFocus(first.id, first.systemId),
  };
}

/**
 * Morning inbox. Order is urgency, not discovery time:
 * combat → economy → incoming diplo → RP → queue → idle fleets.
 * Combat collapses to one row so five fights cannot bury a deficit.
 */
export function buildViewerAlerts(input: BuildViewerAlertsInput): AlertItem[] {
  const {
    payload,
    engagements,
    pendingOrderCount,
    rpUnread,
    questAttention = 0,
    economyWarning,
    systemSignals,
    callbacks,
  } = input;

  const urgent: AlertItem[] = [];
  const soon: AlertItem[] = [];
  const later: AlertItem[] = [];

  const fight = engagementAlert(
    payload,
    collectOpenEngagements(payload, engagements),
    callbacks.onFocusEngagement,
  );
  if (fight) urgent.push(fight);

  const eco = economyAlert(
    payload,
    economyWarning,
    systemSignals,
    callbacks.onFocusEconomy,
  );
  if (eco) urgent.push(eco);

  const incomingDiplo = payload.diploOffers?.incoming?.length ?? 0;
  if (incomingDiplo > 0 && callbacks.onFocusDiplo) {
    const firstId = payload.diploOffers?.incoming?.[0]?.id;
    urgent.push({
      id: "diplo-incoming",
      kind: "orders",
      verb: "Ответить на сделку",
      title:
        incomingDiplo === 1
          ? "Входящее дипломатическое предложение"
          : ruCount(incomingDiplo, "входящее предложение", "входящих предложения", "входящих предложений"),
      subtitle: "Требует ответа",
      onFocus: () => callbacks.onFocusDiplo?.(firstId),
    });
  }

  const questN = questAttention;
  if (questN > 0 && callbacks.onFocusQuests) {
    soon.push({
      id: "quests-attention",
      kind: "quest",
      verb: "Открыть квесты",
      title:
        questN === 1
          ? "Есть решение по квесту"
          : ruCount(
              questN,
              "решение по квестам",
              "решения по квестам",
              "решений по квестам",
            ),
      subtitle: "Кубик хода или выбор",
      onFocus: callbacks.onFocusQuests,
    });
  }

  if (rpUnread > 0) {
    soon.push({
      id: "rp-unread",
      kind: "rp",
      verb: "Открыть RP",
      title:
        rpUnread === 1
          ? "Новое сообщение в сцене"
          : `${rpUnread > 9 ? "9+" : rpUnread} сообщений в сцене`,
      subtitle: "Сцена с мастером",
      onFocus: callbacks.onFocusRp,
    });
  }

  if (pendingOrderCount > 0) {
    later.push({
      id: "pending-orders",
      kind: "orders",
      verb: "Проверить очередь",
      title:
        pendingOrderCount === 1
          ? "1 приказ в очереди"
          : ruCount(pendingOrderCount, "приказ в очереди", "приказа в очереди", "приказов в очереди"),
      subtitle: "Можно отменить до тика",
      onFocus: callbacks.onFocusOrders,
    });
  }

  const idle = idleFleetAlert(payload, callbacks.onFocusIdleFleet);
  if (idle) later.push(idle);

  return [...urgent, ...soon, ...later].slice(0, ATTENTION_CAP);
}
