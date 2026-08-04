import { useEffect, useMemo, useState } from "react";
import type { TurnBriefing, TurnBriefingEvent, ViewerPayload, WorldState } from "../state/types";
import { formatHopTurns, hopDistance } from "../state/pathfinding";
import { FlowPanel } from "./FlowPanel";
import { ResourceIcon } from "../ui/ResourceIcon";
import { ExpandableSection } from "../ui/ExpandableSection";
import { intentApCost, getCachedContent } from "../state/contentCatalog";
import { CATEGORY_CURRENCIES } from "../state/economyLabels";
import {
  PlayerEngagementPanel,
  type CombatStanceId,
  type ViewerEngagement,
} from "./PlayerEngagementPanel";

export const ORDER_TYPE_LABELS: Record<string, string> = {
  move_fleet: "Переместить флот",
  claim_system: "Захватить / экспансия",
  attack_system: "Атака",
  move_legion: "Переместить легион",
  blockade: "Блокада",
  fortify: "Укрепление",
  transfer: "Перевод ресурсов",
  market_convert: "Обмен на рынке",
  market_offer: "Заявка на рынке",
  market_cancel: "Отмена заявки",
  set_tax: "Смена налога",
  scout_reveal: "Разведка",
  refugee_convoy: "Караван беженцев",
  combat_stance: "Боевая стойка",
  build: "Постройка",
  demolish: "Снос",
  colonize: "Колонизация",
  set_colony_type: "Тип колонии",
};

const LEGACY_CURRENCIES: { id: string; label: string }[] = [
  { id: "currency.metal", label: "Металл" },
  { id: "currency.supply", label: "Обеспечение" },
];

function bottleneckCount(
  eco: ViewerPayload["economy"],
): number | null {
  if (!eco) return null;
  if (eco.bottlenecks && typeof eco.bottlenecks === "object") {
    return Object.keys(eco.bottlenecks).length;
  }
  return null;
}

/** Per-currency net for the current turn. */
function useEconomyBreakdown(
  eco: ViewerPayload["economy"],
  turn: number,
): Record<string, { net: number }> {
  return useMemo(() => {
    const recent = eco?.recent ?? [];
    const byTurn = recent.filter((e) => e.turn === turn);
    const out: Record<string, { net: number }> = {};
    for (const e of byTurn) {
      if (!out[e.currencyId]) out[e.currencyId] = { net: 0 };
      out[e.currencyId].net += e.delta;
    }
    return out;
  }, [eco?.recent, turn]);
}

const SUPPLY_TAX_TIERS = [
  { id: "none", label: "0%" },
  { id: "low", label: "10%" },
  { id: "mid", label: "20%" },
] as const;

const INDUSTRY_TAX_TIERS = [
  { id: "none", label: "0%" },
  { id: "low", label: "10%" },
  { id: "mid", label: "20%" },
  { id: "high", label: "35%" },
] as const;

function EconomyWhyPanel({
  explain,
}: {
  explain: NonNullable<ViewerPayload["economy"]>["explain"];
}) {
  if (!explain) return null;
  const { lines, raceTraits, factionTraits } = explain;
  const hasLines = lines && lines.length > 0;
  const hasRace = raceTraits && raceTraits.length > 0;
  const hasFaction = factionTraits && factionTraits.length > 0;
  if (!hasLines && !hasRace && !hasFaction) return null;

  return (
    <details className="eco-why-panel">
      <summary>Почему так</summary>
      {hasLines && (
        <ul className="eco-reasons" aria-label="Модификаторы экономики">
          {lines.map((line, i) => (
            <li key={`${line.category}-${line.label}-${i}`}>
              <span className="hint">{line.label}</span>{" "}
              <strong className={line.modifier.startsWith("−") || line.modifier.startsWith("-") ? "eco-down" : line.modifier.startsWith("+") ? "eco-up" : ""}>
                {line.modifier}
              </strong>
              {line.sources?.length ? (
                <span className="hint"> · {line.sources.join(", ")}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {hasRace && (
        <ul className="eco-race-traits" aria-label="Расовые черты">
          {raceTraits!.map((r) => (
            <li key={r.label}>
              <strong>{r.label}</strong>
              <span className="hint"> · {r.summary}</span>
            </li>
          ))}
        </ul>
      )}
      {hasFaction && (
        <ul className="eco-faction-traits" aria-label="Черты державы">
          {factionTraits!.map((r) => (
            <li key={r.label}>
              <strong>{r.label}</strong>
              <span className="hint"> · {r.summary}</span>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

function TaxSelect({
  taxSlot,
  label,
  tiers,
  value,
  pending,
  onSetTax,
}: {
  taxSlot: string;
  label: string;
  tiers: readonly { id: string; label: string }[];
  value: string;
  pending?: string;
  onSetTax: (taxSlot: string, tierId: string) => void;
}) {
  return (
    <label className="field eco-tax-field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onSetTax(taxSlot, e.target.value)}>
        {tiers.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </select>
      {pending && (
        <span className="hint">В очереди → {pending}</span>
      )}
    </label>
  );
}

type PressureThreshold = {
  min: number;
  effects?: Array<{ effect: string; args?: Record<string, unknown> }>;
};

function describePressureEffects(
  effects: PressureThreshold["effects"],
): string {
  const parts: string[] = [];
  for (const e of effects || []) {
    if (e.effect === "cost_mult") {
      const mult = Number(e.args?.mult ?? 1);
      const pct = Math.round((mult - 1) * 100);
      if (pct === 0) continue;
      const tag = e.args?.tag === "build" ? "построек" : "затрат";
      parts.push(`+${pct}% к стоимости ${tag}`);
    } else if (e.effect === "ap_add") {
      const amt = Number(e.args?.amount ?? 0);
      if (amt < 0) parts.push(`${amt} ОД за ход`);
      else if (amt > 0) parts.push(`+${amt} ОД за ход`);
    }
  }
  return parts.join(" · ") || "штраф";
}

function TaxPressureHint({ pressure }: { pressure: number }) {
  const thresholds =
    getCachedContent()?.rules?.tax?.pressureThresholds ?? [];
  if (thresholds.length === 0) {
    return (
      <p className="hint eco-tax-pressure">
        Налоговое давление: <strong>{pressure}</strong>
      </p>
    );
  }

  const sorted = [...thresholds].sort((a, b) => a.min - b.min);
  const active = sorted.filter((t) => pressure >= t.min);
  const next = sorted.find((t) => pressure < t.min);
  const isHigh = pressure >= (sorted[sorted.length - 1]?.min ?? 99);
  const isWarn = pressure >= (sorted[0]?.min ?? 99) || (next != null && pressure >= next.min - 1);

  return (
    <div
      className={`eco-tax-pressure${isHigh ? " is-high" : isWarn ? " is-warn" : ""}`}
    >
      <p className="hint">
        Налоговое давление: <strong>{pressure}</strong>
        {next ? (
          <>
            {" · "}
            следующий порог при <strong>{next.min}</strong>:{" "}
            {describePressureEffects(next.effects)}
          </>
        ) : (
          <> · все пороги достигнуты</>
        )}
      </p>
      {active.length > 0 && (
        <p className="hint">
          Активно:{" "}
          {active
            .map((t) => `≥${t.min} — ${describePressureEffects(t.effects)}`)
            .join(" · ")}
        </p>
      )}
      {isWarn && (
        <p className="eco-tax-pressure-warn">
          {isHigh
            ? "Высокое давление — постройки дороже и меньше ОД. Снизьте налоги."
            : "Давление растёт — высокие ставки усилят штрафы со следующих ходов."}
        </p>
      )}
    </div>
  );
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
      return `Бой в системе ${sys(e.systemId)}, выберите stance`;
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
}: {
  briefing?: TurnBriefing | null;
  world: WorldState;
  factionId: string;
}) {
  if (!briefing) {
    return (
      <section className="hq-card turn-briefing-card">
        <h3>Сводка хода</h3>
        <p className="hint">Нет данных о последнем тике — дождитесь обработки хода.</p>
      </section>
    );
  }

  const bullets = buildTurnBriefingBullets(briefing, world, factionId);

  return (
    <section className="hq-card turn-briefing-card">
      <h3>
        Сводка хода{" "}
        <span className="hint">
          {briefing.turnFrom}→{briefing.turnTo}
        </span>
      </h3>
      {bullets.length === 0 ? (
        <p className="hint">За этот ход нет заметных изменений для вашей державы.</p>
      ) : (
        <ul className="turn-briefing-list" aria-label="Сводка последнего хода">
          {bullets.map((b, i) => (
            <li key={`${i}-${b.slice(0, 24)}`}>{b}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function PlayerHqHome({
  payload,
  reservedAp,
  apMax,
  rpUnread,
  pendingOrders,
  orderMsg,
  onSetTax,
  onScoutReveal,
  mapSelectedSystemId,
  onOpenForces,
  onOpenOrders,
  onOpenDiplomacy,
  onOpenQuests,
  onOpenRp,
  onOpenMap,
  onOpenResearch,
  onOpenMarket,
  onOpenEconomy,
  affordableResearch,
  tradePartnerCount,
  marketMyOffers,
  marketPeerLots,
  activeQuestCount,
  warCount,
  openEngagementCount,
  engagements,
  stanceBusy,
  onSubmitCombatStance,
  onOpenStanceRing,
}: {
  payload: ViewerPayload;
  reservedAp: number;
  apMax: number;
  rpUnread: number;
  pendingOrders: number;
  orderMsg?: string | null;
  onSetTax: (taxSlot: string, tierId: string) => void;
  onScoutReveal?: (systemId: string) => void;
  mapSelectedSystemId?: string | null;
  onOpenForces: () => void;
  onOpenOrders: () => void;
  onOpenDiplomacy: () => void;
  onOpenQuests: () => void;
  onOpenRp: () => void;
  onOpenMap: () => void;
  onOpenResearch?: () => void;
  onOpenMarket?: () => void;
  onOpenEconomy?: () => void;
  affordableResearch?: number;
  tradePartnerCount?: number;
  marketMyOffers?: number;
  marketPeerLots?: number;
  activeQuestCount?: number;
  warCount?: number;
  openEngagementCount?: number;
  engagements?: ViewerEngagement[];
  stanceBusy?: boolean;
  onSubmitCombatStance?: (engagementId: string, stance: CombatStanceId) => void;
  onOpenStanceRing?: (
    engagementId: string,
    anchor: { clientX: number; clientY: number },
  ) => void;
}) {
  const eco = payload.economy;
  const fac = payload.world.factions.find((f) => f.id === payload.factionId);
  const breakdown = useEconomyBreakdown(eco, payload.world.meta.turn);
  const scoutAp = intentApCost("intent.scout_reveal") || 1;
  const [scoutTargetId, setScoutTargetId] = useState(
    () => mapSelectedSystemId ?? "",
  );
  useEffect(() => {
    if (mapSelectedSystemId) setScoutTargetId(mapSelectedSystemId);
  }, [mapSelectedSystemId]);
  const scoutSystems = payload.world.systems;
  const scoutCanSubmit =
    !!scoutTargetId &&
    !!onScoutReveal &&
    reservedAp + scoutAp <= apMax;

  const bn = eco ? bottleneckCount(eco) : null;
  const courtNpc =
    fac?.npcs?.filter((n) => n.status !== "hidden" && n.status !== "dead")
      .length ?? 0;

  return (
    <div className="hq-panel">
      <header className="hq-panel-head">
        <h2>Штаб</h2>
        <p className="hint">
          Сводка хода. Приказы — на карте (drag / ПКМ). Комнаты — в нижнем доке.
        </p>
      </header>

      <div className="hq-bento" aria-label="Оперативные показатели">
        <div className="hq-bento-cell">
          <span className="hq-stat-label">Ход</span>
          <strong>{payload.world.meta.turn}</strong>
        </div>
        <div className="hq-bento-cell hq-bento-cell--accent">
          <span className="hq-stat-label">AP</span>
          <strong>
            {reservedAp}/{apMax}
          </strong>
        </div>
        <div className="hq-bento-cell">
          <span className="hq-stat-label">Обзор</span>
          <strong>{payload.visibleSystemIds.length}</strong>
        </div>
        <div className="hq-bento-cell hq-bento-cell--wide">
          <span className="hq-stat-label">Держава</span>
          <strong style={{ color: fac?.color }}>{fac?.name ?? "—"}</strong>
        </div>
      </div>

      <TurnBriefingCard
        briefing={payload.briefing}
        world={payload.world}
        factionId={payload.factionId}
      />

      {(openEngagementCount ?? 0) > 0 &&
        engagements &&
        onSubmitCombatStance && (
          <section className="hq-card eng-hq-alert">
            <h3>
              Активные сражения
              {openEngagementCount! > 1 ? ` · ${openEngagementCount}` : ""}
            </h3>
            <PlayerEngagementPanel
              payload={payload}
              engagements={engagements}
              busy={stanceBusy}
              msg={orderMsg}
              showHistory={false}
              onSubmitStance={onSubmitCombatStance}
              onOpenStanceRing={onOpenStanceRing}
            />
          </section>
        )}

      <section className="hq-card hq-signal-row" aria-label="Быстрые сигналы">
        {onOpenResearch && (
          <button
            type="button"
            className={`hq-signal-chip ${(affordableResearch ?? 0) > 0 ? "is-hot" : ""}`}
            onClick={onOpenResearch}
          >
            <strong>Наука</strong>
            <span className="hint">
              {(affordableResearch ?? 0) > 0
                ? `можно: ${affordableResearch}`
                : "дерево A–F"}
            </span>
          </button>
        )}
        {onOpenEconomy && (
          <button
            type="button"
            className="hq-signal-chip"
            onClick={onOpenEconomy}
          >
            <strong>Экономика</strong>
            <span className="hint">производство · склад</span>
          </button>
        )}
        {onOpenMarket && (
          <button
            type="button"
            className={`hq-signal-chip ${
              (marketMyOffers ?? 0) > 0 || (marketPeerLots ?? 0) > 0
                ? "is-hot"
                : ""
            }`}
            onClick={onOpenMarket}
          >
            <strong>Биржа</strong>
            <span className="hint">
              {(marketMyOffers ?? 0) > 0
                ? `${marketMyOffers} моих`
                : (marketPeerLots ?? 0) > 0
                  ? `${marketPeerLots} лотов`
                  : tradePartnerCount
                    ? `${tradePartnerCount} партнёров`
                    : "котировки"}
            </span>
          </button>
        )}
        <button
          type="button"
          className={`hq-signal-chip ${pendingOrders > 0 ? "is-hot" : ""}`}
          onClick={onOpenOrders}
        >
          <strong>Очередь</strong>
          <span className="hint">
            {pendingOrders > 0 ? `${pendingOrders} приказов` : "пусто"}
          </span>
        </button>
        <button
          type="button"
          className={`hq-signal-chip ${(warCount ?? 0) > 0 ? "is-warn" : ""}`}
          onClick={onOpenDiplomacy}
        >
          <strong>Дипломатия</strong>
          <span className="hint">
            {(warCount ?? 0) > 0 ? `${warCount} войн` : "контакты"}
          </span>
        </button>
      </section>

      <section className="hq-card">
        <h3>Казна</h3>
        {eco ? (
          <>
            <div className="eco-cat-grid" aria-label="Категории A–F">
              {CATEGORY_CURRENCIES.map((c) => {
                const stock = eco.stocks?.[c.id] ?? 0;
                const v = breakdown[c.id];
                const net = v?.net;
                const hasNet = typeof net === "number" && net !== 0;
                const isDeficit = hasNet && net < 0;
                return (
                  <div
                    className={`eco-cat-cell ${isDeficit ? "is-deficit" : ""}`}
                    key={c.id}
                    style={{ borderLeftColor: c.cssVar }}
                    title={c.name}
                  >
                    <ResourceIcon
                      resourceId={c.id}
                      stocks={eco.stocks}
                      size={18}
                      className="eco-cat-icon"
                    />
                    <strong className="eco-cat-stock">{stock}</strong>
                    {hasNet && (
                      <span className={`eco-delta ${net > 0 ? "up" : "down"}`}>
                        {net > 0 ? `+${net}` : net}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="eco-legacy-row">
              {LEGACY_CURRENCIES.map((c) => {
                const stock = eco.stocks?.[c.id] ?? 0;
                const v = breakdown[c.id];
                const net = v?.net;
                const hasNet = typeof net === "number" && net !== 0;
                return (
                  <span key={c.id} className="eco-legacy-item">
                    <ResourceIcon
                      resourceId={c.id}
                      stocks={eco.stocks}
                      size={16}
                    />{" "}
                    <strong>{stock}</strong>
                    {hasNet && (
                      <span className={`eco-delta ${net > 0 ? "up" : "down"}`}>
                        {" "}
                        {net > 0 ? `+${net}` : net}
                      </span>
                    )}
                  </span>
                );
              })}
            </div>
            <p className="hint">
              Дефицит: {eco.deficit ?? "нет"}
              {bn != null && bn > 0 ? ` · узких мест: ${bn}` : ""}
            </p>
            <ExpandableSection
              title="Налоги и модификаторы"
              badge={`давление ${eco.pressure ?? 0}`}
              defaultOpen={(eco.pressure ?? 0) >= 2}
            >
              <EconomyWhyPanel explain={eco.explain} />
              <div className="eco-tax-row">
                <TaxSelect
                  taxSlot="tax.industry"
                  label="Промышленный налог (1 AP, со след. хода)"
                  tiers={INDUSTRY_TAX_TIERS}
                  value={eco.taxes?.["tax.industry"] ?? "none"}
                  pending={eco.pendingPolicy?.taxes?.["tax.industry"]}
                  onSetTax={onSetTax}
                />
                <TaxSelect
                  taxSlot="tax.supply"
                  label="Сбор обеспечения (1 AP, со след. хода)"
                  tiers={SUPPLY_TAX_TIERS}
                  value={eco.taxes?.["tax.supply"] ?? "none"}
                  pending={eco.pendingPolicy?.taxes?.["tax.supply"]}
                  onSetTax={onSetTax}
                />
              </div>
              <TaxPressureHint pressure={eco.pressure ?? 0} />
            </ExpandableSection>
          </>
        ) : (
          <p className="hint">Нет данных казны — перелогиньтесь после тика.</p>
        )}
        {orderMsg && <p className="hint">{orderMsg}</p>}
      </section>

      <ExpandableSection
        title="Потоки A–F"
        badge={bn != null && bn > 0 ? `узких: ${bn}` : "сводка"}
        defaultOpen={bn != null && bn > 0}
        className="hq-card hq-expandable--flush"
      >
        <FlowPanel factionId={payload.factionId} compact />
      </ExpandableSection>

      {(fac?.notes || courtNpc > 0) && (
        <ExpandableSection
          title="Двор и доктрина"
          badge={courtNpc > 0 ? `${courtNpc} лиц` : undefined}
          className="hq-card hq-expandable--flush"
        >
          {fac?.notes ? (
            <p className="hint" style={{ whiteSpace: "pre-wrap" }}>
              {fac.notes}
            </p>
          ) : null}
          {fac?.npcs && fac.npcs.length > 0 ? (
            <ul className="hq-npc-list">
              {fac.npcs
                .filter((n) => n.status !== "hidden" && n.status !== "dead")
                .map((n) => (
                  <li key={n.id} className="hq-npc-item">
                    <strong>{n.name}</strong>
                    {n.title ? (
                      <span className="hint"> — {n.title}</span>
                    ) : null}
                    {n.locationSystemName || n.locationPlanetName ? (
                      <span className="hint">
                        {" "}
                        · {[n.locationPlanetName, n.locationSystemName]
                          .filter(Boolean)
                          .join(", ")}
                      </span>
                    ) : null}
                    {n.publicNotes ? (
                      <p className="hint" style={{ margin: "0.25rem 0 0" }}>
                        {n.publicNotes}
                      </p>
                    ) : null}
                  </li>
                ))}
            </ul>
          ) : null}
        </ExpandableSection>
      )}

      {onScoutReveal && scoutSystems.length > 0 && (
        <ExpandableSection
          title="Разведка"
          badge={`${scoutAp} AP`}
          className="hq-card hq-expandable--flush"
        >
          <p className="hint">
            Постоянно открыть систему на карте · применится на тике
          </p>
          <label className="field">
            <span>Система</span>
            <select
              value={scoutTargetId}
              onChange={(e) => setScoutTargetId(e.target.value)}
            >
              <option value="">— выберите —</option>
              {scoutSystems.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn block"
            disabled={!scoutCanSubmit}
            onClick={() => {
              if (!scoutCanSubmit) return;
              onScoutReveal(scoutTargetId);
            }}
          >
            Открыть разведкой ({scoutAp} AP)
          </button>
        </ExpandableSection>
      )}

      <section className="hq-card hq-actions">
        <button type="button" className="btn block" onClick={onOpenForces}>
          Силы (флоты / легионы)
          {(openEngagementCount ?? 0) > 0 ? ` · ${openEngagementCount} боёв` : ""}
        </button>
        <button type="button" className="btn block" onClick={onOpenQuests}>
          Квесты
          {activeQuestCount != null && activeQuestCount > 0
            ? ` · ${activeQuestCount}`
            : ""}
        </button>
        <button
          type="button"
          className={`btn block ${rpUnread > 0 ? "is-pulse" : ""}`}
          onClick={onOpenRp}
        >
          Двор{rpUnread > 0 ? ` · ${rpUnread} новых` : ""}
        </button>
        <button type="button" className="btn primary block" onClick={onOpenMap}>
          Открыть карту
        </button>
      </section>
    </div>
  );
}

export function PlayerForcesPanel({
  payload,
  selectedFleetId,
  selectedLegionId,
  onSelectFleet,
  onSelectLegion,
  onSelectSystem,
  onOrderWithFleet,
  onOrderWithLegion,
  onOpenMap,
}: {
  payload: ViewerPayload;
  selectedFleetId?: string | null;
  selectedLegionId?: string | null;
  onSelectFleet?: (fleetId: string) => void;
  onSelectLegion?: (legionId: string) => void;
  onSelectSystem?: (systemId: string) => void;
  /** Jump to orders with this fleet already selected. */
  onOrderWithFleet?: (fleetId: string) => void;
  onOrderWithLegion?: (legionId: string) => void;
  onOpenMap?: () => void;
}) {
  const fid = payload.factionId;
  const fleets = (payload.world.fleets ?? []).filter((f) => f.factionId === fid);
  const legions = (payload.world.legions ?? []).filter(
    (l) => l.factionId === fid,
  );

  return (
    <div className="hq-panel">
      <header className="hq-panel-head">
        <h2>Силы</h2>
        <p className="hint">
          Флоты: {fleets.length} · Легионы: {legions.length}. На карте —
          перетащите иконку на систему (покажет ходы).
        </p>
        {onOpenMap && (
          <button type="button" className="btn ghost" onClick={onOpenMap}>
            На карту
          </button>
        )}
      </header>

      <section className="hq-card">
        <h3>Флоты</h3>
        {fleets.length === 0 && (
          <div className="hq-empty">
            <span className="hq-empty-reveal" aria-hidden />
            <p className="hint">Нет своих флотов в зоне видимости.</p>
            {onOpenMap && (
              <button type="button" className="btn ghost" onClick={onOpenMap}>
                На карту
              </button>
            )}
          </div>
        )}
        <ul className="hq-list">
          {fleets.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                className={`hq-list-item ${selectedFleetId === f.id ? "on" : ""}`}
                onClick={() => {
                  onSelectFleet?.(f.id);
                  onSelectSystem?.(f.systemId);
                }}
              >
                <strong>{f.name}</strong>
                <span className="hint">
                  {systemName(payload.world, f.systemId)} · {f.stance}
                </span>
                <span className="hint">
                  {(f.composition ?? [])
                    .map((c) => `${c.type}×${c.count}`)
                    .join(", ") || "состав —"}
                </span>
              </button>
              {onOrderWithFleet && (
                <button
                  type="button"
                  className="btn ghost block"
                  style={{ marginTop: 4 }}
                  onClick={() => onOrderWithFleet(f.id)}
                >
                  Приказ для этого флота…
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="hq-card">
        <h3>Легионы</h3>
        {legions.length === 0 && (
          <div className="hq-empty">
            <span className="hq-empty-reveal" aria-hidden />
            <p className="hint">Нет своих легионов в зоне видимости.</p>
            {onOpenMap && (
              <button type="button" className="btn ghost" onClick={onOpenMap}>
                На карту
              </button>
            )}
          </div>
        )}
        <ul className="hq-list">
          {legions.map((l) => (
            <li key={l.id}>
              <button
                type="button"
                className={`hq-list-item ${selectedLegionId === l.id ? "on" : ""}`}
                onClick={() => {
                  onSelectLegion?.(l.id);
                  onSelectSystem?.(l.systemId);
                }}
              >
                <strong>{l.name}</strong>
                <span className="hint">
                  {systemName(payload.world, l.systemId)} · {l.status}
                </span>
                <span className="hint">сила {l.strength ?? "—"}</span>
              </button>
              {onOrderWithLegion && (
                <button
                  type="button"
                  className="btn ghost block"
                  style={{ marginTop: 4 }}
                  onClick={() => onOrderWithLegion(l.id)}
                >
                  Приказ для этого легиона…
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
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
    () => hopDistance(payload.world, fromSystemId, targetSystemId),
    [payload.world, fromSystemId, targetSystemId],
  );

  const needsFleet =
    orderType === "move_fleet" || orderType === "attack_system";
  const needsLegion = orderType === "move_legion";
  const canSubmit =
    !!targetSystemId &&
    (orderType === "claim_system"
      ? !!selectedFleetId || !!selectedLegionId
      : needsLegion
        ? !!selectedLegionId && Number.isFinite(hops) && hops > 0
        : !!selectedFleetId &&
          (orderType !== "move_fleet" ||
            (Number.isFinite(hops) && hops > 0)));

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
          Все незавершённые приказы до тика. Отмена возвращает занятый AP.
          Новые ходы — drag / ПКМ на карте.
        </p>
        {onOpenMap && (
          <button type="button" className="btn ghost" onClick={onOpenMap}>
            На карту
          </button>
        )}
      </header>

      <section className="hq-card hq-outliner">
        <h3>Ожидают тика · {pending.length}</h3>
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
              const label = ORDER_TYPE_LABELS[o.type] || o.type;
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
            <span className="hq-stat-label">Путь</span>
            <strong>
              {targetSystemId && fromSystemId
                ? formatHopTurns(hops)
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
          {needsFleet || needsLegion ? ` · ${formatHopTurns(hops)}` : ""}
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
