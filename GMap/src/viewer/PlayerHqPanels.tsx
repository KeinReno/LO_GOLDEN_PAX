import { useMemo, useState } from "react";
import type { TurnBriefing, TurnBriefingEvent, ViewerPayload, WorldState } from "../state/types";
import { formatHopDistance, formatHopTurns, hopDistance } from "../state/pathfinding";
import { isWithinMoveRange } from "../state/movementRange";
import {
  formatOdMeter,
  formatForceOdMeter,
  OD,
  OD_TOOLTIP,
  FORCE_OD_TOOLTIP,
  QUEUE_UNTIL_TURN_LABEL,
  TURN_RESOLVE_HINT,
  ruCount,
} from "../state/playerUiTerms";
import { orderTypeLabel } from "./orderEtaLabels";
import type { AlertItem } from "./ViewerAlertFab";
import { countCourtAttention } from "./court/courtAttention";
import {
  computeMetrics,
  resolveFactionTreasuryCurrency,
} from "./economy/economyMath";
import { currencyShortLabel } from "./economy/chartData";
import { hqOwnedWorlds } from "./hqOwnedWorlds";

function alertTone(kind: AlertItem["kind"]): "danger" | "warn" | "hot" | "info" {
  switch (kind) {
    case "engagement":
      return "danger";
    case "economy":
      return "warn";
    case "rp":
      return "hot";
    default:
      return "info";
  }
}

function roleScoreLeader(
  scores?: Record<string, number>,
): string | null {
  if (!scores) return null;
  const labels: Record<string, string> = {
    structural: "Структура",
    energy: "Энергия",
    offensive: "Удар",
    defensive: "Защита",
    mobility: "Мобильность",
    cognitive: "Когниция",
    biological: "Биология",
    exotic: "Экзотика",
  };
  const rows = Object.entries(scores)
    .map(([id, v]) => ({ id, label: labels[id] ?? id, v: Number(v) || 0 }))
    .filter((r) => r.v > 0);
  if (!rows.length) return null;
  rows.sort((a, b) => b.v - a.v);
  return `${rows[0]!.label} ${Math.round(rows[0]!.v)}`;
}

function systemName(world: WorldState, id: string | null | undefined): string {
  if (!id) return "—";
  return world.systems.find((s) => s.id === id)?.name ?? id;
}

function factionName(world: WorldState, id: string | null | undefined): string {
  if (!id) return "—";
  return world.factions.find((f) => f.id === id)?.name ?? id;
}

const ECO_SHORT: Record<string, string> = {
  "currency.extracta": "A",
  "currency.materia": "B",
  "currency.industria": "C",
  "currency.energia": "D",
  "currency.bios": "E",
  "currency.cognitio": "F",
  "currency.metal": "мет.",
  "currency.supply": "снаб.",
};

function formatEcoNet(net?: Record<string, number>): string | null {
  if (!net) return null;
  const parts = Object.entries(net)
    .filter(([, v]) => typeof v === "number" && v !== 0)
    .map(([id, v]) => {
      const label = ECO_SHORT[id] ?? id.replace("currency.", "");
      return `${label} ${v > 0 ? `+${v}` : v}`;
    });
  return parts.length ? parts.join(", ") : null;
}

function formatBriefingEvent(
  e: TurnBriefingEvent,
  world: WorldState,
  factionId: string,
): string | null {
  const sys = (id?: string) => systemName(world, id);
  const fac = (id?: string) => factionName(world, id);

  switch (e.type) {
    case "economy":
      return null;
    case "move_fleet":
      return `Флот → ${sys(e.toId)}`;
    case "move_legion":
      return `Легион → ${sys(e.toId)}`;
    case "claim_system":
      return `Захват ${sys(e.systemId ?? e.toId)}`;
    case "claim_contested":
      return `Спорный захват ${sys(e.systemId ?? e.toId)}`;
    case "attack_committed":
      return `Атака на ${sys(e.toId ?? e.systemId)}`;
    case "attack_unopposed":
      return `Атака без сопротивления: ${sys(e.systemId)}`;
    case "engagement_created":
      return e.attacker === factionId
        ? `Бой начат: ${sys(e.systemId)} vs ${fac(e.defender)}`
        : `Бой начат: ${sys(e.systemId)} (защита)`;
    case "engagement_awaiting_stance":
      return `Бой в системе ${sys(e.systemId)}, зафиксируйте стойку`;
    case "engagement_phase":
      return `Фаза боя ${e.phase ?? "—"} в ${sys(e.systemId)}`;
    case "engagement_auto_resolve":
      return `Автобой в ${sys(e.systemId)} (таймаут stance)`;
    case "engagement_resolved":
      return `Бой завершён в ${sys(e.systemId)}: ${e.outcome ?? "—"}`;
    case "engagement_cancelled":
      return `Бой отменён в ${sys(e.systemId)}`;
    case "combat_stance":
      return `Боевая стойка: ${e.stance ?? "—"}`;
    case "scout_reveal":
      return `Разведка: ${sys(e.systemId)}`;
    case "set_tax_queued":
      return `Налог ${e.taxSlot ?? "—"} → ${e.tierId ?? "—"}`;
    case "transfer":
      return e.factionId === factionId
        ? `Перевод → ${fac(e.toFactionId)}: ${e.amount ?? "?"} ${ECO_SHORT[e.currencyId ?? ""] ?? ""}`
        : `Перевод ← ${fac(e.factionId)}: ${e.amount ?? "?"} ${ECO_SHORT[e.currencyId ?? ""] ?? ""}`;
    case "market_convert":
      return `Обмен валют на рынке`;
    case "market_offer":
      return `Заявка на рынке: ${e.giveAmount ?? "?"} → ${e.wantAmount ?? "?"}`;
    case "market_cancel":
      return `Отмена заявки на рынке`;
    case "market_match":
      return e.sellerFactionId === factionId || e.buyerFactionId === factionId
        ? `Сделка на рынке: ${e.giveAmount ?? "?"} ${ECO_SHORT[e.giveCurrency ?? ""] ?? ""}`
        : null;
    case "refugee_convoy":
      return `Караван беженцев → ${sys(e.toSystemId ?? e.systemId)}`;
    case "population": {
      const d = typeof e.delta === "number" ? e.delta : 0;
      return `Население ${sys(e.systemId)}: ${d > 0 ? "+" : ""}${d}`;
    }
    case "refugees_camp":
      return `Лагерь беженцев в ${sys(e.systemId)}`;
    default:
      return null;
  }
}

function buildTurnBriefingBullets(
  briefing: TurnBriefing,
  world: WorldState,
  factionId: string,
): string[] {
  const bullets: string[] = [];
  const ecoLine = formatEcoNet(briefing.economy?.net);
  if (ecoLine) {
    let s = `Экономика: ${ecoLine}`;
    if (briefing.economy?.deficit && briefing.economy.deficit !== "none") {
      s += ` · дефицит ${briefing.economy.deficit}`;
    }
    bullets.push(s);
  }

  const battles = briefing.events.filter((e) =>
    [
      "engagement_created",
      "engagement_awaiting_stance",
      "engagement_phase",
      "engagement_auto_resolve",
      "engagement_resolved",
      "engagement_cancelled",
      "attack_committed",
      "attack_unopposed",
    ].includes(e.type),
  );
  for (const e of battles) {
    const line = formatBriefingEvent(e, world, factionId);
    if (line) bullets.push(line);
  }

  const transfers = briefing.events.filter((e) => e.type === "transfer");
  for (const e of transfers) {
    const line = formatBriefingEvent(e, world, factionId);
    if (line) bullets.push(line);
  }

  const intents = briefing.events.filter((e) =>
    [
      "move_fleet",
      "move_legion",
      "claim_system",
      "claim_contested",
      "scout_reveal",
      "set_tax_queued",
      "combat_stance",
      "market_convert",
      "market_offer",
      "market_cancel",
      "market_match",
      "refugee_convoy",
    ].includes(e.type),
  );
  for (const e of intents) {
    const line = formatBriefingEvent(e, world, factionId);
    if (line) bullets.push(line);
  }

  const misc = briefing.events.filter(
    (e) =>
      ![
        "economy",
        "engagement_created",
        "engagement_awaiting_stance",
        "engagement_phase",
        "engagement_auto_resolve",
        "engagement_resolved",
        "engagement_cancelled",
        "attack_committed",
        "attack_unopposed",
        "transfer",
        "move_fleet",
        "move_legion",
        "claim_system",
        "claim_contested",
        "scout_reveal",
        "set_tax_queued",
        "combat_stance",
        "market_convert",
        "market_offer",
        "market_cancel",
        "market_match",
        "refugee_convoy",
      ].includes(e.type),
  );
  for (const e of misc) {
    const line = formatBriefingEvent(e, world, factionId);
    if (line) bullets.push(line);
  }

  return bullets;
}

export function TurnBriefingCard({
  briefing,
  world,
  factionId,
  compact = false,
}: {
  briefing?: TurnBriefing | null;
  world: WorldState;
  factionId: string;
  compact?: boolean;
}) {
  if (!briefing) {
    return compact ? (
      <p className="hint">Нет данных о последнем тике.</p>
    ) : (
      <section className="hq-card turn-briefing-card">
        <h3>Сводка хода</h3>
        <p className="hint">Нет данных о последнем тике — дождитесь обработки хода.</p>
      </section>
    );
  }

  const bullets = buildTurnBriefingBullets(briefing, world, factionId);

  const list =
    bullets.length === 0 ? (
      <p className="hint">За этот ход нет заметных изменений для вашей державы.</p>
    ) : (
      <ul className="turn-briefing-list" aria-label="Сводка последнего хода">
        {bullets.map((b, i) => (
          <li key={`${i}-${b.slice(0, 24)}`}>{b}</li>
        ))}
      </ul>
    );

  if (compact) return list;

  return (
    <section className="hq-card turn-briefing-card">
      <h3>
        Сводка хода{" "}
        <span className="hint">
          {briefing.turnFrom}→{briefing.turnTo}
        </span>
      </h3>
      {list}
    </section>
  );
}

export function PlayerHqHome({
  payload,
  reservedAp,
  apMax,
  forceApUsed = 0,
  forceApMax = 0,
  attentionItems = [],
  orderMsg,
  onOpenForces,
  onOpenOrders,
  onOpenDiplomacy,
  onOpenQuests,
  onOpenCourt,
  onOpenRp,
  onOpenMap,
  onOpenResearch,
  onOpenMarket,
  onOpenEconomy,
  onOpenWorld,
  affordableResearch,
  activeQuestCount,
  warCount,
  openEngagementCount,
}: {
  payload: ViewerPayload;
  /** @deprecated Kept for call-site compat; HQ no longer embeds FlowPanel. */
  password?: string;
  reservedAp: number;
  apMax: number;
  forceApUsed?: number;
  forceApMax?: number;
  /** Shared with ViewerAlertFab — buildViewerAlerts(). */
  attentionItems?: AlertItem[];
  orderMsg?: string | null;
  onOpenForces: () => void;
  onOpenOrders: () => void;
  onOpenDiplomacy: () => void;
  onOpenQuests: () => void;
  onOpenCourt?: () => void;
  onOpenRp: () => void;
  onOpenMap: () => void;
  onOpenResearch?: () => void;
  onOpenMarket?: () => void;
  onOpenEconomy?: () => void;
  onOpenWorld?: (systemId: string, planetId: string) => void;
  affordableResearch?: number;
  activeQuestCount?: number;
  warCount?: number;
  openEngagementCount?: number;
}) {
  const eco = payload.economy;
  const fac = payload.world.factions.find((f) => f.id === payload.factionId);
  const visibleNpcs =
    fac?.npcs?.filter((n) => n.status !== "hidden" && n.status !== "dead") ?? [];
  const courtNpc = visibleNpcs.length;
  const npcPreview = visibleNpcs.slice(0, 6);
  const courtAttention = countCourtAttention(payload);

  const treasuryCurrencyId = resolveFactionTreasuryCurrency(payload);
  const treasuryHint = currencyShortLabel(treasuryCurrencyId);
  const metrics = eco
    ? computeMetrics(eco, payload.world.meta.turn, treasuryCurrencyId)
    : null;
  const fleetCount = (payload.world.fleets ?? []).filter(
    (f) => f.factionId === payload.factionId,
  ).length;
  const legionCount = (payload.world.legions ?? []).filter(
    (l) => l.factionId === payload.factionId,
  ).length;
  const roleLeader = roleScoreLeader(eco?.roleScores);
  const attentionShown = attentionItems.slice(0, 5);
  const worlds = hqOwnedWorlds(payload).slice(0, 8);
  const briefingBullets = payload.briefing
    ? buildTurnBriefingBullets(payload.briefing, payload.world, payload.factionId)
    : [];

  return (
    <div className="hq-command">
      <header className="hq-command__identity" aria-label="Держава">
        <div className="hq-command__faction">
          <span
            className="hq-command__swatch"
            style={{ background: fac?.color }}
            aria-hidden
          />
          <div>
            <strong className="hq-command__name">{fac?.name ?? "—"}</strong>
            <p className="hint">
              Ход {payload.world.meta.turn} · видно {payload.visibleSystemIds.length}{" "}
              систем
            </p>
          </div>
        </div>
        {orderMsg ? <p className="hq-command__toast hint">{orderMsg}</p> : null}
      </header>

      <section className="hq-command__attention" aria-label="Требует внимания">
        <div className="hq-command__section-label">Внимание</div>
        {attentionShown.length === 0 ? (
          <p className="hint hq-command__calm">
            Спокойный ход — нет срочных сигналов. Приказы отдавайте на карте.
          </p>
        ) : (
          <ul className="hq-attention-list">
            {attentionShown.map((item, idx) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={`hq-attention-item hq-attention-item--${alertTone(item.kind)}${
                    idx === 0 ? " hq-attention-item--lead" : ""
                  }`}
                  onClick={(e) =>
                    item.onFocus({ clientX: e.clientX, clientY: e.clientY })
                  }
                >
                  <strong>{item.verb}</strong>
                  <span>
                    {item.title}
                    {item.subtitle ? ` · ${item.subtitle}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {onOpenWorld && worlds.length > 0 ? (
        <section className="hq-command__worlds" aria-label="Миры">
          <div className="hq-command__section-label">Миры</div>
          <ul className="hq-worlds-list">
            {worlds.map((w) => (
              <li key={`${w.systemId}:${w.planetId}`}>
                <button
                  type="button"
                  className="hq-worlds-item"
                  onClick={() => onOpenWorld(w.systemId, w.planetId)}
                >
                  <strong>{w.planetName}</strong>
                  <span>
                    {w.systemName}
                    {w.population > 0
                      ? ` · ${Math.round(w.population).toLocaleString("ru-RU")}`
                      : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {briefingBullets.length > 0 ? (
        <section className="hq-command__briefing" aria-label="Сводка хода">
          <div className="hq-command__section-label">
            Сводка хода
            {payload.briefing
              ? ` ${payload.briefing.turnFrom}→${payload.briefing.turnTo}`
              : ""}
          </div>
          <TurnBriefingCard
            briefing={payload.briefing}
            world={payload.world}
            factionId={payload.factionId}
            compact
          />
        </section>
      ) : null}

      <section className="hq-command__summary" aria-label="Сводка державы">
        <div className="hq-command__section-label">Сводка</div>
        <dl className="hq-summary-grid">
          <div className="hq-summary-stat">
            <dt>Казна</dt>
            <dd>
              {metrics != null
                ? `${Math.round(metrics.treasury)} ${treasuryHint}`
                : "—"}
            </dd>
          </div>
          <div className="hq-summary-stat" title={OD_TOOLTIP}>
            <dt>{OD}</dt>
            <dd>{formatOdMeter(reservedAp, apMax)}</dd>
          </div>
          <div className="hq-summary-stat" title={FORCE_OD_TOOLTIP}>
            <dt>Силы</dt>
            <dd>
              {formatForceOdMeter(forceApUsed, forceApMax)} · {fleetCount}ф/
              {legionCount}л
            </dd>
          </div>
          {roleLeader ? (
            <div className="hq-summary-stat">
              <dt>Путь</dt>
              <dd>{roleLeader}</dd>
            </div>
          ) : null}
        </dl>
      </section>

      <section className="hq-command__deep" aria-label="Перейти в комнату">
        <div className="hq-command__section-label">Комнаты</div>
        <div className="hq-deep-secondary">
          {onOpenEconomy ? (
            <button type="button" className="hq-deep-chip" onClick={onOpenEconomy}>
              Экономика
            </button>
          ) : null}
          {onOpenResearch ? (
            <button
              type="button"
              className={`hq-deep-chip ${
                (affordableResearch ?? 0) > 0 ? "is-hot" : ""
              }`}
              onClick={onOpenResearch}
            >
              Наука
              {(affordableResearch ?? 0) > 0 ? " · есть что изучить" : ""}
            </button>
          ) : null}
          <button type="button" className="hq-deep-chip" onClick={onOpenMap}>
            Карта
          </button>
          <button type="button" className="hq-deep-chip" onClick={onOpenForces}>
            Силы
            {(openEngagementCount ?? 0) > 0
              ? ` · ${ruCount(openEngagementCount ?? 0, "бой", "боя", "боёв")}`
              : ""}
          </button>
          <button type="button" className="hq-deep-chip" onClick={onOpenDiplomacy}>
            Дипломатия
            {(warCount ?? 0) > 0
              ? ` · ${ruCount(warCount ?? 0, "война", "войны", "войн")}`
              : ""}
          </button>
          {onOpenMarket ? (
            <button type="button" className="hq-deep-chip" onClick={onOpenMarket}>
              Биржа
            </button>
          ) : null}
          <button
            type="button"
            className={`hq-deep-chip ${(activeQuestCount ?? 0) > 0 ? "is-pulse" : ""}`}
            onClick={onOpenQuests}
          >
            Квесты
            {activeQuestCount ? ` · ${activeQuestCount} ждут` : ""}
          </button>
          {onOpenCourt ? (
            <button type="button" className="hq-deep-chip" onClick={onOpenCourt}>
              Двор
              {courtAttention > 0 ? ` · ${courtAttention} ждут` : ""}
            </button>
          ) : null}
          <button type="button" className="hq-deep-chip" onClick={onOpenRp}>
            RP
          </button>
          <button type="button" className="hq-deep-chip" onClick={onOpenOrders}>
            Очередь
          </button>
        </div>
      </section>

      {courtNpc > 0 ? (
        <details className="hq-command__more">
          <summary>
            Двор
            {courtNpc > 6 ? ` · ${courtNpc}` : ""}
          </summary>
          <ul className="hq-npc-list">
            {npcPreview.map((n) => {
              const where = [n.locationPlanetName, n.locationSystemName]
                .filter(Boolean)
                .join(" · ");
              return (
                <li key={n.id} className="hq-npc-item">
                  <strong>{n.name}</strong>
                  {n.title ? <span className="hint"> — {n.title}</span> : null}
                  {where ? <span className="hint"> · {where}</span> : null}
                </li>
              );
            })}
          </ul>
          {courtNpc > 6 ? (
            <p className="hint">ещё {courtNpc - 6}</p>
          ) : null}
          {onOpenCourt ? (
            <button type="button" className="btn sm" onClick={onOpenCourt}>
              Открыть двор
            </button>
          ) : null}
        </details>
      ) : null}
    </div>
  );
}

/** Pending-intent inbox — map remains primary for issuing orders. */
export function PlayerOrdersPanel({
  payload,
  orderType,
  setOrderType,
  orderNote,
  setOrderNote,
  orderMsg,
  selectedFleetId,
  setSelectedFleetId,
  selectedFleetName,
  selectedLegionId,
  setSelectedLegionId,
  selectedLegionName,
  targetSystemId,
  setTargetSystemId,
  onSubmit,
  onCancelOrder,
  onPickTargetOnMap,
  onOpenMap,
}: {
  payload: ViewerPayload;
  orderType: string;
  setOrderType: (t: string) => void;
  orderNote: string;
  setOrderNote: (n: string) => void;
  orderMsg: string | null;
  selectedFleetId: string | null;
  setSelectedFleetId: (id: string | null) => void;
  selectedFleetName: string | null;
  selectedLegionId: string | null;
  setSelectedLegionId: (id: string | null) => void;
  selectedLegionName: string | null;
  targetSystemId: string | null;
  setTargetSystemId: (id: string | null) => void;
  onSubmit: () => void;
  onCancelOrder: (orderId: string) => void;
  onPickTargetOnMap?: () => void;
  onOpenMap?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [draftOpen, setDraftOpen] = useState(false);
  const systems = payload.world.systems;
  const fleets = (payload.world.fleets ?? []).filter(
    (f) => f.factionId === payload.factionId,
  );
  const legions = (payload.world.legions ?? []).filter(
    (l) => l.factionId === payload.factionId,
  );
  const q = query.trim().toLowerCase();
  const matches = q
    ? systems
        .filter((s) => s.name.toLowerCase().includes(q) || s.id.includes(q))
        .slice(0, 40)
    : [];

  const targetName =
    systems.find((s) => s.id === targetSystemId)?.name ?? null;

  const fromSystemId =
    orderType === "move_legion"
      ? (legions.find((l) => l.id === selectedLegionId)?.systemId ?? null)
      : (fleets.find((f) => f.id === selectedFleetId)?.systemId ?? null);

  const hops = useMemo(
    () =>
      hopDistance(
        payload.world,
        fromSystemId,
        targetSystemId,
        orderType === "move_legion" ? "legion" : "fleet",
      ),
    [payload.world, fromSystemId, targetSystemId, orderType],
  );
  const moveMode = orderType === "move_legion" ? "legion" : "fleet";
  const inMoveRange =
    !fromSystemId ||
    !targetSystemId ||
    fromSystemId === targetSystemId ||
    isWithinMoveRange(payload.world, fromSystemId, targetSystemId, moveMode);

  const needsFleet =
    orderType === "move_fleet" || orderType === "attack_system";
  const needsLegion = orderType === "move_legion";
  const canSubmit =
    !!targetSystemId &&
    (orderType === "claim_system"
      ? !!selectedFleetId || !!selectedLegionId
      : needsLegion
        ? !!selectedLegionId && Number.isFinite(hops) && hops > 0 && inMoveRange
        : !!selectedFleetId &&
          (orderType !== "move_fleet" ||
            (Number.isFinite(hops) && hops > 0 && inMoveRange)));

  const unitLabel =
    orderType === "move_legion"
      ? (selectedLegionName ?? "не выбран")
      : (selectedFleetName ?? "не выбран");

  const pending = payload.world.orders.filter((o) => o.status === "pending");

  const orderTypes: { id: string; label: string }[] = [
    { id: "move_fleet", label: "Флот" },
    { id: "move_legion", label: "Легион" },
    { id: "claim_system", label: "Захват" },
    { id: "attack_system", label: "Атака" },
  ];

  return (
    <div className="hq-panel">
      <header className="hq-panel-head">
        <h2>Очередь</h2>
        <p className="hint">
          {TURN_RESOLVE_HINT} Отмена приказа возвращает потраченные {OD}.
          Новые приказы — перетаскивание или меню на карте.
        </p>
        {onOpenMap && (
          <button type="button" className="btn ghost" onClick={onOpenMap}>
            На карту
          </button>
        )}
      </header>

      <section className="hq-card hq-outliner">
        <h3>{QUEUE_UNTIL_TURN_LABEL} · {pending.length}</h3>
        {pending.length === 0 && (
          <div className="hq-empty">
            <span className="hq-empty-reveal" aria-hidden />
            <p className="hint">
              Пусто — перетащите флот/легион или отдайте приказ с карты.
            </p>
          </div>
        )}
        {pending.length > 0 && (
          <ol className="order-timeline" aria-label="Очередь до тика">
            {pending.map((o, idx) => {
              const fleetName =
                payload.world.fleets.find((f) => f.id === o.fleetId)?.name ??
                null;
              const legionName =
                payload.world.legions.find((l) => l.id === o.legionId)?.name ??
                null;
              const label = orderTypeLabel(o.type);
              return (
                <li key={o.id} className="order-timeline-item">
                  <span className="order-timeline-idx" aria-hidden>
                    {idx + 1}
                  </span>
                  <div className="order-timeline-body">
                    <strong>{label}</strong>
                    <span className="hint">
                      {fleetName || legionName
                        ? `${fleetName ?? legionName} · `
                        : ""}
                      {o.toSystemId
                        ? systemName(payload.world, o.toSystemId)
                        : o.note || "—"}
                      {o.note && o.toSystemId ? ` · ${o.note}` : ""}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn ghost sm"
                    onClick={() => onCancelOrder(o.id)}
                  >
                    Отменить
                  </button>
                </li>
              );
            })}
          </ol>
        )}
        {orderMsg && <p className="hint">{orderMsg}</p>}
      </section>

      <details
        className="hq-card order-draft-card"
        open={draftOpen}
        onToggle={(e) => setDraftOpen((e.target as HTMLDetailsElement).open)}
      >
        <summary>Запасной черновик (без карты)</summary>
        <p className="hint">
          Если карта недоступна — оформите приказ здесь. Обычно удобнее drag.
        </p>
        <div className="order-draft-summary">
          <div>
            <span className="hq-stat-label">
              {orderType === "move_legion" ? "Легион" : "Флот"}
            </span>
            <strong>{unitLabel}</strong>
          </div>
          <div>
            <span className="hq-stat-label">Цель</span>
            <strong>{targetName ?? "—"}</strong>
          </div>
          <div>
            <span className="hq-stat-label">Дистанция</span>
            <strong>
              {targetSystemId && fromSystemId
                ? needsFleet || needsLegion
                  ? inMoveRange
                    ? formatHopDistance(hops)
                    : Number.isFinite(hops) && hops > 0
                      ? "вне радиуса"
                      : formatHopDistance(hops)
                  : formatHopTurns(hops)
                : "—"}
            </strong>
          </div>
        </div>

        <div className="order-type-chips" role="group" aria-label="Тип приказа">
          {orderTypes.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`order-type-chip ${orderType === t.id ? "on" : ""}`}
              onClick={() => setOrderType(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {needsLegion ? (
          <label className="field">
            <span>Легион</span>
            <select
              value={selectedLegionId ?? ""}
              onChange={(e) => {
                const id = e.target.value || null;
                setSelectedLegionId(id);
                if (id) setSelectedFleetId(null);
              }}
            >
              <option value="">— выберите легион —</option>
              {legions.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} · {systemName(payload.world, l.systemId)}
                </option>
              ))}
            </select>
          </label>
        ) : orderType !== "claim_system" ? (
          <label className="field">
            <span>Флот</span>
            <select
              value={selectedFleetId ?? ""}
              onChange={(e) => {
                const id = e.target.value || null;
                setSelectedFleetId(id);
                if (id) setSelectedLegionId(null);
              }}
            >
              <option value="">— выберите флот —</option>
              {fleets.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} · {systemName(payload.world, f.systemId)}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <div className="order-target-row">
          <label className="field" style={{ flex: 1, margin: 0 }}>
            <span>Цель</span>
            <input
              value={query || targetName || ""}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Имя системы…"
            />
          </label>
          {onPickTargetOnMap && (
            <button
              type="button"
              className="btn ghost"
              onClick={onPickTargetOnMap}
            >
              На карте
            </button>
          )}
        </div>
        {matches.length > 0 && (
          <ul className="hq-list hq-list-compact">
            {matches.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className={`hq-list-item ${targetSystemId === s.id ? "on" : ""}`}
                  onClick={() => {
                    setTargetSystemId(s.id);
                    setQuery(s.name);
                  }}
                >
                  <strong>{s.name}</strong>
                </button>
              </li>
            ))}
          </ul>
        )}

        <label className="field">
          <span>Заметка</span>
          <input
            value={orderNote}
            onChange={(e) => setOrderNote(e.target.value)}
            placeholder="по желанию"
          />
        </label>
        <button
          type="button"
          className="btn primary block"
          disabled={!canSubmit}
          onClick={onSubmit}
        >
          Заверить
          {(needsFleet && orderType === "move_fleet") ||
          (needsLegion && orderType === "move_legion")
            ? ` · ${formatHopDistance(hops)}`
            : needsFleet || needsLegion
              ? ` · ${formatHopTurns(hops)}`
              : ""}
        </button>
        {!canSubmit && (
          <p className="hint">
            {needsLegion
              ? "Нужны легион и достижимая система-цель."
              : orderType === "claim_system"
                ? "Нужна система-цель."
                : "Нужны флот и достижимая система-цель."}
          </p>
        )}
      </details>
    </div>
  );
}
