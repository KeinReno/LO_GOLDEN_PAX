import { useMemo, useState, useEffect } from "react";
import type { ViewerPayload } from "../state/types";
import { DIPLOMACY_LABELS } from "../state/defaults";
import {
  BUILD_METAL,
  BUILD_SUPPLY,
  CATEGORY_CURRENCIES,
  resourceDisplayName,
} from "../state/economyLabels";
import { getCachedContent } from "../state/contentCatalog";
import { resolveTechDirection } from "../state/techDirections";
import { useSpotlight } from "../ui/aceternityFx";
import { AnimatedTooltip } from "../ui/AnimatedTooltip";
import { ExpandableSection } from "../ui/ExpandableSection";
import { HoldButton } from "./shared/HoldButton";
import { AmountSheet } from "./shared/AmountSheet";
import { StatefulButton } from "../ui/StatefulButton";
import {
  DiploTimeline,
  DiploAttitudeLabel,
  DiploLeaderCard,
  FactionEmblem,
  getRelation,
  opinionLabel,
  opinionOf,
  OpinionBar,
  RelationBadge,
} from "./diploUiShared";
import type { DiploDealItem, DiploOffer, DiploUnilateralStance, TradeAssetPool } from "./diploTradeTypes";
import { diploItemLabel, TradeColumn } from "./TradeColumn";
import { DiploSwipeOffer } from "./DiploSwipeOffer";
import { DiploDealTray, DiploDealSections, DIPLO_GIVE_SECTIONS, DIPLO_WANT_SECTIONS } from "./DiploDealTray";
import type { DiploHandTab } from "./DiploDealTray";
import { DiploActHand } from "./DiploActHand";
import { DiploCompareStrip } from "./DiploCompareStrip";
import { ContactMarketStrip } from "./ContactMarketStrip";
import {
  addDealItem,
  cardAllowedOnSide,
  dealFairness,
  dealNeedsHold,
  parseDiploCard,
  parsedToDealItem,
  remainingStock,
  resourceCommittedInOffers,
  treatyConflict,
} from "./diploDealCards";
import { pickDiploPartnerId } from "./diploPartnerPick";

export type { DiploDealItem, DiploOffer } from "./diploTradeTypes";

const GIFT_CURRENCIES = [
  ...CATEGORY_CURRENCIES.map((c) => ({
    id: c.id,
    label: `${c.name} (${c.short})`,
  })),
  { id: BUILD_METAL.id, label: BUILD_METAL.label },
  { id: BUILD_SUPPLY.id, label: BUILD_SUPPLY.label },
];

function buildAssetPool(
  payload: ViewerPayload,
  factionId: string,
  visibleOnly: boolean,
): TradeAssetPool {
  const visible = new Set(payload.visibleSystemIds ?? []);
  const content = getCachedContent();
  const sysName = (id?: string) =>
    payload.world.systems.find((s) => s.id === id)?.name;
  const fleets = (payload.world.fleets ?? [])
    .filter((f) => f.factionId === factionId)
    .filter((f) => !visibleOnly || visible.has(f.systemId))
    .map((f) => ({
      id: f.id,
      name: f.name,
      where: sysName(f.systemId),
    }));
  const legions = (payload.world.legions ?? [])
    .filter((l) => l.factionId === factionId)
    .filter((l) => !visibleOnly || visible.has(l.systemId))
    .map((l) => ({
      id: l.id,
      name: l.name,
      where: sysName(l.systemId),
    }));
  const fac = payload.world.factions.find((f) => f.id === factionId);
  const capitalId = fac?.capitalSystemId;
  const systems = (payload.world.systems ?? [])
    .filter((s) => s.ownerFactionId === factionId)
    .filter((s) => !visibleOnly || visible.has(s.id))
    .filter((s) => !s.isCapital && s.id !== capitalId)
    .map((s) => ({
      id: s.id,
      name: s.name,
      worlds: (s.planets ?? [])
        .filter((p) => !p.ownerFactionId || p.ownerFactionId === factionId)
        .map((p) => p.name),
    }));
  const unlocked = payload.economy?.unlockedTechs ?? [];
  const techs =
    factionId === payload.factionId
      ? unlocked
          .filter((tid) => {
            const def = content?.technologies?.[tid];
            if (!def) return false;
            if (def.catalogPending) return false;
            if (def.raceLock || def.factionTraitLock) return false;
            return true;
          })
          .map((tid) => {
            const def = content?.technologies?.[tid];
            return {
              id: tid,
              name: def?.name ?? tid,
              direction: (def && resolveTechDirection(def)) || "industry",
            };
          })
      : [];
  return { fleets, legions, systems, techs };
}

/**
 * Faceoff + table + split hand. Partner is picked from the right portrait.
 */
export function DealDesk({
  payload,
  economy,
  incoming,
  outgoing,
  busy,
  msg,
  focusOfferId,
  knownFactionIds,
  onCreate,
  onAccept,
  onReject,
  onCancel,
  onGift,
  onStance,
  onEconomicTrack,
  password,
  reservedAp = 0,
  apMax = 0,
  onPlaceOffer,
  onCancelOffer,
}: {
  payload: ViewerPayload;
  economy?: ViewerPayload["economy"];
  incoming: DiploOffer[];
  outgoing: DiploOffer[];
  busy?: boolean;
  msg?: string | null;
  focusOfferId?: string | null;
  knownFactionIds?: string[];
  onCreate: (args: {
    toFactionId: string;
    give: DiploDealItem[];
    want: DiploDealItem[];
    note: string;
  }) => void | boolean | Promise<void | boolean>;
  onAccept: (offerId: string) => void;
  onReject: (offerId: string) => void;
  onCancel: (offerId: string) => void;
  onGift?: (toFactionId: string, currencyId: string, amount: number) => void;
  /** Unilateral acts: war / embargo / break / insult — apply immediately. */
  onStance?: (
    toFactionId: string,
    stance: DiploUnilateralStance,
  ) => void | boolean | Promise<void | boolean>;
  /** Economic track (quote / union) — independent of political treaties. */
  onEconomicTrack?: (
    kind: "quote" | "union",
    toFactionId: string,
    extras?: { unitsQuotePerBase?: number },
  ) => void | boolean | Promise<void | boolean>;
  password?: string;
  reservedAp?: number;
  apMax?: number;
  /** Contacts-venue market offers (same as MarketPanel). */
  onPlaceOffer?: (
    side: "sell" | "buy",
    giveCurrency: string,
    giveAmount: number,
    wantCurrency: string,
    wantAmount: number,
    venue: "common" | "contacts",
  ) => void | Promise<boolean | void>;
  onCancelOffer?: (offerId: string) => void | Promise<boolean | void>;
}) {
  const meId = payload.factionId;
  const me = payload.world.factions.find((f) => f.id === meId);

  const others = useMemo(() => {
    const all = payload.world.factions.filter((f) => f.id !== meId);
    const known = knownFactionIds ?? payload.knownFactionIds ?? [];
    if (!known.length) return all;
    const set = new Set(known);
    return all.filter((f) => set.has(f.id));
  }, [payload.world.factions, payload.knownFactionIds, knownFactionIds, meId]);

  const [otherId, setOtherId] = useState(() =>
    pickDiploPartnerId({
      knownIds: others.map((f) => f.id),
      incoming,
      focusOfferId,
      currentId: "",
    }),
  );
  const [give, setGive] = useState<DiploDealItem[]>([]);
  const [want, setWant] = useState<DiploDealItem[]>([]);
  const [note, setNote] = useState("");
  const [giftAmount, setGiftAmount] = useState(10);
  const [giftCurrency, setGiftCurrency] = useState<string>(
    GIFT_CURRENCIES[0]?.id ?? "currency.extracta",
  );
  const [giftSheetOpen, setGiftSheetOpen] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [quoteRate, setQuoteRate] = useState(1);
  const [pendingDeal, setPendingDeal] = useState<{
    side: "give" | "want";
    currencyId: string;
    label: string;
  } | null>(null);
  const [dealQty, setDealQty] = useState(10);
  const [dealHint, setDealHint] = useState("");
  const [giveTab, setGiveTab] = useState<DiploHandTab | null>(null);
  const [wantTab, setWantTab] = useState<DiploHandTab | null>(null);

  useEffect(() => {
    const next = pickDiploPartnerId({
      knownIds: others.map((f) => f.id),
      incoming,
      currentId: otherId,
    });
    if (next !== otherId) setOtherId(next);
  }, [others, incoming, otherId]);

  useEffect(() => {
    if (!focusOfferId) return;
    const next = pickDiploPartnerId({
      knownIds: others.map((f) => f.id),
      incoming,
      focusOfferId,
      currentId: "",
    });
    if (next) setOtherId(next);
  }, [focusOfferId, incoming, others]);

  useEffect(() => {
    setWantTab(null);
  }, [otherId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      const n = Number(e.key);
      if (n < 1 || n > 9) return;
      const f = others[n - 1];
      if (!f) return;
      e.preventDefault();
      setOtherId(f.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [others]);

  const faceoffSpot = useSpotlight();
  const tableSpot = useSpotlight();

  const other = others.find((f) => f.id === otherId) ?? null;
  const relation = other ? getRelation(payload, meId, other.id) : "neutral";
  const theirOpinion = other
    ? Number(other.opinionTowardViewer ?? opinionOf(other, meId))
    : 0;
  const myOpinion = other ? opinionOf(me, other.id) : 0;
  const intelLevel = other
    ? Number(payload.intel?.knownFactions?.[other.id] ?? 1)
    : 0;

  const focusHistory = useMemo(() => {
    if (!other) return [];
    return (me?.diplomacy?.history ?? []).filter(
      (h) => h.withFactionId === other.id,
    );
  }, [me?.diplomacy?.history, other]);

  const activeTreaties = useMemo(() => {
    if (!other) return [];
    return (me?.diplomacy?.treaties ?? []).filter(
      (t) => t.withFactionId === other.id,
    );
  }, [me?.diplomacy?.treaties, other]);

  const otherQuests = useMemo(() => {
    if (!other) return [];
    const owned = new Set(
      payload.world.systems
        .filter((s) => s.ownerFactionId === other.id)
        .map((s) => s.id),
    );
    return (payload.world.quests ?? []).filter(
      (q) => q.status === "active" && q.systemId && owned.has(q.systemId),
    );
  }, [other, payload.world.quests, payload.world.systems]);

  const myAssets = useMemo(
    () => buildAssetPool(payload, meId, false),
    [payload, meId],
  );
  const theirAssets = useMemo(
    () =>
      other
        ? buildAssetPool(payload, other.id, true)
        : { fleets: [], legions: [], systems: [], techs: [] },
    [payload, other],
  );

  const nameLookup = useMemo(() => {
    const fleets: Record<string, string> = {};
    const legions: Record<string, string> = {};
    const systems: Record<string, string> = {};
    const techs: Record<string, string> = {};
    for (const f of payload.world.fleets ?? []) fleets[f.id] = f.name;
    for (const l of payload.world.legions ?? []) legions[l.id] = l.name;
    for (const s of payload.world.systems ?? []) systems[s.id] = s.name;
    const content = getCachedContent();
    for (const [id, def] of Object.entries(content?.technologies ?? {})) {
      techs[id] = def.name ?? id;
    }
    return { fleets, legions, systems, techs };
  }, [payload.world.fleets, payload.world.legions, payload.world.systems]);

  const focusedIncoming =
    focusOfferId != null
      ? incoming.find((o) => o.id === focusOfferId)
      : null;

  const canSend =
    !!otherId && (give.length > 0 || want.length > 0) && !busy;

  const needsHold = dealNeedsHold([...give, ...want]);

  const canBreak =
    !!other &&
    relation !== "neutral" &&
    relation !== "war" &&
    relation !== "embargo";
  const canWar = !!other && relation !== "war";
  const canEmbargo =
    !!other && relation !== "war" && relation !== "embargo";

  const tradePartnerSet = useMemo(
    () => new Set(payload.tradePartnerIds ?? []),
    [payload.tradePartnerIds],
  );
  const isContactTradePartner = !!otherId && tradePartnerSet.has(otherId);

  const flushSend = async () => {
    if (!canSend) return;
    const ok = await onCreate({
      toFactionId: otherId,
      give,
      want,
      note,
    });
    if (ok === false) return;
    setSendSuccess(true);
    setGive([]);
    setWant([]);
    setNote("");
    setPendingDeal(null);
    setDealHint("");
  };

  const runStance = async (stance: DiploUnilateralStance) => {
    if (!otherId || !onStance) return;
    await onStance(otherId, stance);
  };

  const otherIncoming = incoming.filter((o) => o.fromFactionId === otherId);
  const otherOutgoing = outgoing.filter((o) => o.toFactionId === otherId);
  const itemLabel = (item: DiploDealItem) => diploItemLabel(item, nameLookup);

  const giveEscrowed = (currencyId: string) =>
    resourceCommittedInOffers(outgoing, currencyId);

  const giveRemaining = (currencyId: string) =>
    remainingStock(
      economy?.stocks?.[currencyId],
      give,
      currencyId,
      giveEscrowed(currencyId),
    );

  const pendingFairItem =
    pendingDeal != null
      ? parsedToDealItem(
          { kind: "resource", currencyId: pendingDeal.currencyId },
          Math.max(1, Math.floor(dealQty)),
        )
      : null;
  const fair = dealFairness(
    pendingDeal?.side === "give" && pendingFairItem
      ? [...give, pendingFairItem]
      : give,
    pendingDeal?.side === "want" && pendingFairItem
      ? [...want, pendingFairItem]
      : want,
  );

  const tryAddDeal = (side: "give" | "want", item: DiploDealItem) => {
    if (item.kind === "treaty" && treatyConflict([...give, ...want], item.treaty)) {
      setDealHint("в сделке только один вид договора");
      return;
    }
    const list = side === "give" ? give : want;
    const { next, skipped } = addDealItem(list, item);
    if (skipped) {
      setDealHint("уже на столе");
      return;
    }
    if (side === "give") setGive(next);
    else setWant(next);
    setDealHint("");
  };

  const applyCard = (cardId: string, side: "give" | "want") => {
    if (!other || busy) {
      if (!other) setDealHint("сначала выберите державу");
      return;
    }
    const parsed = parseDiploCard(cardId);
    if (!parsed) return;
    if (!cardAllowedOnSide(parsed, side, myAssets, theirAssets)) {
      setDealHint(
        side === "give"
          ? "это нельзя отдать — не ваш актив"
          : "этого нет среди видимых сил партнёра",
      );
      return;
    }
    if (parsed.kind === "resource") {
      const rem = side === "give" ? giveRemaining(parsed.currencyId) : 99999;
      if (side === "give" && rem <= 0) {
        setDealHint("в казне нет свободного остатка");
        return;
      }
      const start =
        side === "give"
          ? Math.min(100, Math.max(1, Math.floor(rem / 4) || 1))
          : 50;
      setDealQty(start);
      setPendingDeal({
        side,
        currencyId: parsed.currencyId,
        label: resourceDisplayName(parsed.currencyId),
      });
      setDealHint("");
      return;
    }
    tryAddDeal(side, parsedToDealItem(parsed));
  };

  const confirmDealAmount = () => {
    if (!pendingDeal) return;
    let amount = Math.max(1, Math.floor(dealQty));
    if (pendingDeal.side === "give") {
      const rem = giveRemaining(pendingDeal.currencyId);
      if (rem <= 0) {
        setPendingDeal(null);
        setDealHint("в казне нет свободного остатка");
        return;
      }
      amount = Math.min(amount, rem);
    }
    tryAddDeal(
      pendingDeal.side,
      parsedToDealItem(
        { kind: "resource", currencyId: pendingDeal.currencyId },
        amount,
      ),
    );
    setPendingDeal(null);
  };

  return (
    <div className="deal-desk gc-diplo diplo-desk">
      <aside className="diplo-desk__bar diplo-desk__bar--me" aria-label="Вы">
        {me ? (
          <DiploLeaderCard faction={me} align="start" compact />
        ) : (
          <p className="hint">Вы</p>
        )}
        <DiploDealSections
          sections={DIPLO_GIVE_SECTIONS}
          value={giveTab}
          disabled={!other || busy}
          onChange={setGiveTab}
        />
      </aside>

      <div className="diplo-desk__sum" aria-label="Переговоры" {...faceoffSpot.bind}>
          {other ? (
            <>
              <RelationBadge relation={relation} />
              <DiploAttitudeLabel opinion={theirOpinion} />
              <OpinionBar value={theirOpinion} />
              <span className="hint">
                вы: {opinionLabel(myOpinion)} (
                {myOpinion > 0 ? `+${myOpinion}` : myOpinion})
              </span>
              <span className="diplo-intel-pill">Разведка {intelLevel}/4</span>
              {incoming.length > 0 ? (
                <span className="diplo-intel-pill">Входящие · {incoming.length}</span>
              ) : null}
            </>
          ) : (
            <p className="hint">Нажмите портрет справа — выберите собеседника.</p>
          )}
        </div>

      <aside className="diplo-desk__bar diplo-desk__bar--them" aria-label="Собеседник">
        <details className="diplo-partner-pick">
          <summary
            className="diplo-partner-pick__sum"
            aria-label="Выбрать собеседника"
          >
            {other ? (
              <DiploLeaderCard faction={other} align="end" compact />
            ) : (
              <span className="diplo-partner-pick__empty">Выбрать державу</span>
            )}
            {otherIncoming.length > 0 ? (
              <span className="diplo-partner-pick__badge">
                {otherIncoming.length}
              </span>
            ) : incoming.length > 0 ? (
              <span className="diplo-partner-pick__badge is-muted">
                {incoming.length}
              </span>
            ) : null}
            <span className="hint diplo-partner-pick__hint">сменить ▾</span>
          </summary>
          <ul className="diplo-partner-pick__menu" role="listbox">
            {others.length === 0 ? (
              <li className="hint">Нет известных держав.</li>
            ) : (
              others.map((f, idx) => {
                const rel = getRelation(payload, meId, f.id);
                const op = Number(
                  f.opinionTowardViewer ?? opinionOf(f, meId),
                );
                const pendingIn = incoming.some(
                  (o) => o.fromFactionId === f.id,
                );
                const selected = otherId === f.id;
                const altN = idx < 9 ? idx + 1 : null;
                return (
                  <li key={f.id}>
                    <AnimatedTooltip
                      side="top"
                      content={
                        <span>
                          {DIPLOMACY_LABELS[rel]} · они о вас:{" "}
                          {opinionLabel(op)} ({op})
                          {altN ? ` · Alt+${altN}` : ""}
                        </span>
                      }
                    >
                      <button
                        type="button"
                        role="option"
                        aria-selected={selected}
                        className={[
                          "deal-faction-btn",
                          "gc-diplo-civ-btn",
                          selected ? "on" : "",
                          `gc-diplo-civ-btn--${rel}`,
                          pendingIn ? "is-alert" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        onClick={(e) => {
                          setOtherId(f.id);
                          e.currentTarget
                            .closest("details")
                            ?.removeAttribute("open");
                        }}
                      >
                        <FactionEmblem faction={f} size="sm" />
                        <span className="deal-faction-meta">
                          <strong>{f.name}</strong>
                          <span className="hint">
                            {DIPLOMACY_LABELS[rel]}
                            {pendingIn ? " · входящее" : ""}
                            {altN ? ` · Alt+${altN}` : ""}
                          </span>
                        </span>
                      </button>
                    </AnimatedTooltip>
                  </li>
                );
              })
            )}
          </ul>
        </details>
        <DiploDealSections
          sections={DIPLO_WANT_SECTIONS}
          value={wantTab}
          disabled={!other || busy}
          onChange={setWantTab}
        />
      </aside>

      <section
        className="diplo-desk__table deal-center gc-diplo-table"
        aria-label="Торговый стол"
        {...tableSpot.bind}
      >
        {otherIncoming.length > 0 && (
          <ul className="deal-inbox-list gc-swipe-inbox diplo-desk__inbox">
            {otherIncoming.map((o) => {
              const from =
                payload.world.factions.find((f) => f.id === o.fromFactionId)
                  ?.name ?? o.fromFactionId;
              return (
                <DiploSwipeOffer
                  key={o.id}
                  title={`Их пакет · ${from}`}
                  subtitle={`отдают: ${o.give.map(itemLabel).join(", ") || "—"} · просят: ${o.want.map(itemLabel).join(", ") || "—"}`}
                  busy={busy}
                  focused={focusedIncoming?.id === o.id}
                  needsHold={dealNeedsHold([
                    ...(o.give ?? []),
                    ...(o.want ?? []),
                  ])}
                  onAccept={() => onAccept(o.id)}
                  onReject={() => onReject(o.id)}
                />
              );
            })}
          </ul>
        )}
        {otherOutgoing.map((o) => {
          const to =
            payload.world.factions.find((f) => f.id === o.toFactionId)?.name ??
            o.toFactionId;
          return (
            <div key={o.id} className="diplo-desk__outgoing">
              <p className="hint">
                Заморожено · ждёт {to} ·{" "}
                {o.give.map(itemLabel).join(", ") || "—"}
                {o.want.length ? ` ↔ ${o.want.map(itemLabel).join(", ")}` : ""}
              </p>
              <button
                type="button"
                className="btn sm ghost"
                disabled={busy}
                onClick={() => onCancel(o.id)}
              >
                Отозвать
              </button>
            </div>
          );
        })}

        <div className="gc-trade-board">
          <TradeColumn
            side="you"
            civName={me?.name ?? "Вы"}
            items={give}
            nameLookup={nameLookup}
            disabled={!other || busy}
            onRemove={(i) => setGive((g) => g.filter((_, idx) => idx !== i))}
            onDropCard={(id) => applyCard(id, "give")}
          />
          <div
            className="gc-trade-balance"
            aria-label={fair?.label ?? "баланс пакета"}
          >
            <span className="gc-trade-balance__icon" aria-hidden>
              ⇄
            </span>
            {fair ? (
              <span
                className={`gc-trade-balance__fair gc-trade-balance__fair--${fair.tone}`}
              >
                {pendingDeal ? "оценка · " : ""}
                {fair.label}
              </span>
            ) : null}
          </div>
          <TradeColumn
            side="them"
            civName={other?.name ?? "—"}
            items={want}
            nameLookup={nameLookup}
            disabled={!other || busy}
            onRemove={(i) => setWant((w) => w.filter((_, idx) => idx !== i))}
            onDropCard={(id) => applyCard(id, "want")}
          />
        </div>

        {pendingDeal && (
          <AmountSheet
            label={`${pendingDeal.side === "give" ? "Отдаю" : "Прошу"} · ${pendingDeal.label}`}
            stock={
              pendingDeal.side === "give"
                ? giveRemaining(pendingDeal.currencyId)
                : undefined
            }
            value={dealQty}
            onChange={setDealQty}
            onConfirm={confirmDealAmount}
            onCancel={() => setPendingDeal(null)}
          />
        )}

        <div className="diplo-desk__commit">
          <label className="gc-trade-note field">
            <span>Записка</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="необязательно"
            />
          </label>
          {needsHold ? (
            <HoldButton
              className="btn primary hold-btn--danger"
              disabled={!canSend}
              holdHint="Удерживайте: отправить пакет"
              onConfirm={flushSend}
            >
              {busy ? "Отправка…" : "Удержать · отправить"}
            </HoldButton>
          ) : (
            <StatefulButton
              busy={busy}
              success={sendSuccess}
              successLabel="Отправлено"
              onSuccessEnd={() => setSendSuccess(false)}
              className="btn primary gc-diplo-send"
              disabled={!canSend}
              onClick={() => void flushSend()}
            >
              Предложить сделку
            </StatefulButton>
          )}
        </div>
        {dealHint && (
          <p className="hint" role="status">
            {dealHint}
          </p>
        )}
        {msg && <p className="hint">{msg}</p>}

        {other ? (
          <details className="diplo-desk__more">
            <summary>Ещё с {other.name}: сравнение, биржа, поручения</summary>
            {other.notes ? (
              <p className="hint gc-diplo-notes">{other.notes}</p>
            ) : null}
            {me ? (
              <DiploCompareStrip payload={payload} me={me} other={other} />
            ) : null}
            {activeTreaties.length === 0 ? (
              <p className="hint">Нет активных договоров.</p>
            ) : (
              <ul className="diplo-treaty-list">
                {activeTreaties.map((t) => (
                  <li key={t.id}>
                    {DIPLOMACY_LABELS[t.type] ?? t.type}
                    {t.track === "economic" ? " · экономика" : ""}
                    {t.unitsQuotePerBase
                      ? ` · курс ${t.unitsQuotePerBase}`
                      : ""}
                    {t.expiresTurn != null
                      ? ` · до хода ${t.expiresTurn}`
                      : " · бессрочно"}
                  </li>
                ))}
              </ul>
            )}
            <DiploTimeline events={focusHistory} />
            {other && (onPlaceOffer || onCancelOffer) && (
              <ExpandableSection
                title="Биржа контакта"
                badge={
                  isContactTradePartner
                    ? "партнёр"
                    : "нужен торговый договор"
                }
                className="gc-diplo-market-fold"
              >
                <ContactMarketStrip
                  factionId={meId}
                  password={password}
                  partnerId={other.id}
                  partnerName={other.name}
                  isTradePartner={isContactTradePartner}
                  stocks={economy?.stocks}
                  factionNames={Object.fromEntries(
                    payload.world.factions.map((f) => [f.id, f.name]),
                  )}
                  reservedAp={reservedAp}
                  apMax={apMax}
                  busy={busy}
                  onPlaceOffer={onPlaceOffer}
                  onCancelOffer={onCancelOffer}
                />
              </ExpandableSection>
            )}
            <ExpandableSection
              title="На их территории"
              badge={otherQuests.length || undefined}
              defaultOpen={false}
              className="gc-diplo-expand"
            >
              {otherQuests.length === 0 ? (
                <p className="hint">Нет видимых поручений.</p>
              ) : (
                <ul className="deal-quest-list">
                  {otherQuests.map((q) => (
                    <li key={q.id}>
                      <strong>{q.name}</strong>
                      <span className="hint"> · {q.summary}</span>
                    </li>
                  ))}
                </ul>
              )}
            </ExpandableSection>
          </details>
        ) : null}
      </section>

      {(giveTab || wantTab) && (
      <div
        className={`diplo-desk__hands${giveTab && wantTab ? "" : " is-one"}`}
        aria-label="Колоды"
      >
        {giveTab === "acts" ? (
        <DiploActHand
          busy={busy}
          canWar={canWar}
          canEmbargo={canEmbargo}
          canBreak={canBreak}
          giftCurrencies={onGift && economy ? GIFT_CURRENCIES : []}
          giftCurrency={giftCurrency}
          giftAmount={giftAmount}
          giftStock={economy?.stocks?.[giftCurrency]}
          giftOpen={giftSheetOpen}
          quoteRate={quoteRate}
          onStance={(s) => void runStance(s)}
          onGiftCurrency={(id) => {
            setGiftCurrency(id);
            setGiftAmount(Math.min(10, economy?.stocks?.[id] ?? 10) || 1);
            setGiftSheetOpen(true);
          }}
          onGiftAmount={setGiftAmount}
          onGiftOpen={setGiftSheetOpen}
          onGiftConfirm={() => {
            const amt = Math.floor(giftAmount);
            if (amt > 0 && other && onGift) {
              onGift(other.id, giftCurrency, amt);
              setGiftAmount(10);
            }
            setGiftSheetOpen(false);
          }}
          onQuoteRate={setQuoteRate}
          onEconomic={
            onEconomicTrack && otherId
              ? (kind) =>
                  void onEconomicTrack(
                    kind,
                    otherId,
                    kind === "quote"
                      ? { unitsQuotePerBase: quoteRate }
                      : undefined,
                  )
              : undefined
          }
        />
        ) : giveTab ? (
        <DiploDealTray
          side="give"
          tab={giveTab}
          stocks={economy?.stocks}
          assets={myAssets}
          disabled={!other || busy}
          onActivate={(id) => applyCard(id, "give")}
        />
        ) : null}
        {wantTab ? (
        <DiploDealTray
          side="want"
          tab={wantTab}
          stocks={economy?.stocks}
          assets={theirAssets}
          disabled={!other || busy}
          onActivate={(id) => applyCard(id, "want")}
        />
        ) : null}
      </div>
      )}
    </div>
  );
}
