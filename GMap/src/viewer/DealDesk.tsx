import { useMemo, useState, type CSSProperties } from "react";
import type { ViewerPayload } from "../state/types";
import { DIPLOMACY_LABELS } from "../state/defaults";
import {
  BUILD_METAL,
  BUILD_SUPPLY,
  CATEGORY_CURRENCIES,
} from "../state/economyLabels";
import { getCachedContent } from "../state/contentCatalog";
import { BackgroundBeamsLite } from "../ui/BackgroundBeamsLite";
import { useMagnetic, useRipple, useSpotlight } from "../ui/aceternityFx";
import { AnimatedTooltip } from "../ui/AnimatedTooltip";
import { ExpandableSection } from "../ui/ExpandableSection";
import { ResourceIcon } from "../ui/ResourceIcon";
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
import type { DiploDealItem, DiploOffer, TradeAssetPool } from "./diploTradeTypes";
import { diploItemLabel, TradeColumn } from "./TradeColumn";
import { DiploSwipeOffer } from "./DiploSwipeOffer";
import { DiploDealTray } from "./DiploDealTray";
import { DiploCompareStrip } from "./DiploCompareStrip";
import { ContactMarketStrip } from "./ContactMarketStrip";

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
  const fleets = (payload.world.fleets ?? [])
    .filter((f) => f.factionId === factionId)
    .filter((f) => !visibleOnly || visible.has(f.systemId))
    .map((f) => ({ id: f.id, name: f.name }));
  const legions = (payload.world.legions ?? [])
    .filter((l) => l.factionId === factionId)
    .filter((l) => !visibleOnly || visible.has(l.systemId))
    .map((l) => ({ id: l.id, name: l.name }));
  const systems = (payload.world.systems ?? [])
    .filter((s) => s.ownerFactionId === factionId)
    .filter((s) => !visibleOnly || visible.has(s.id))
    .map((s) => ({ id: s.id, name: s.name }));
  const unlocked = payload.economy?.unlockedTechs ?? [];
  const techs =
    factionId === payload.factionId
      ? unlocked
          .filter((tid) => {
            const def = content?.technologies?.[tid];
            if (!def) return false;
            if (def.raceLock || def.factionTraitLock) return false;
            return true;
          })
          .map((tid) => ({
            id: tid,
            name: content?.technologies?.[tid]?.name ?? tid,
          }))
      : [];
  return { fleets, legions, systems, techs };
}

/**
 * Galactic Civilizations trade desk:
 * leader faceoff · civ rail · You Offer | They Offer · dossier.
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
  /** Unilateral acts: war / embargo / break — apply immediately. */
  onStance?: (
    toFactionId: string,
    stance: "war" | "embargo" | "break",
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

  const [otherId, setOtherId] = useState(() => others[0]?.id ?? "");
  const [give, setGive] = useState<DiploDealItem[]>([]);
  const [want, setWant] = useState<DiploDealItem[]>([]);
  const [note, setNote] = useState("");
  const [giftAmount, setGiftAmount] = useState(10);
  const [giftCurrency, setGiftCurrency] = useState<string>(
    GIFT_CURRENCIES[0]?.id ?? "currency.extracta",
  );
  const [giftSheetOpen, setGiftSheetOpen] = useState(false);
  const [dossierTab, setDossierTab] = useState<"treaties" | "history">(
    "treaties",
  );
  const [sendSuccess, setSendSuccess] = useState(false);
  const [quoteRate, setQuoteRate] = useState(1);

  const faceoffSpot = useSpotlight();
  const tableSpot = useSpotlight();
  const dossierSpot = useSpotlight();
  const railSpot = useSpotlight();
  const magWar = useMagnetic(0.35, 100);
  const magBreak = useMagnetic(0.3, 90);
  const magEmbargo = useMagnetic(0.3, 90);
  const rippleActs = useRipple();

  const other = others.find((f) => f.id === otherId) ?? null;
  const relation = other ? getRelation(payload, meId, other.id) : "neutral";
  const opinion = other ? opinionOf(me, other.id) : 0;
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

  const packageHasAlliance = [...give, ...want].some(
    (i) => i.kind === "treaty" && i.treaty === "alliance",
  );
  const needsHold = packageHasAlliance;

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
  };

  const runStance = async (stance: "war" | "embargo" | "break") => {
    if (!otherId || !onStance) return;
    await onStance(otherId, stance);
  };

  const otherIncoming = incoming.filter((o) => o.fromFactionId === otherId);
  const itemLabel = (item: DiploDealItem) => diploItemLabel(item, nameLookup);

  return (
    <div className="deal-desk gc-diplo">
      {(incoming.length > 0 || outgoing.length > 0) && (
        <section
          className={`gc-diplo-inbox ${incoming.length > 0 ? "fx-glow" : ""}`}
          style={
            incoming.length > 0
              ? ({
                  "--fx-glow-color": "var(--signal-warning, #c9a227)",
                } as CSSProperties)
              : undefined
          }
          aria-label="Очередь предложений"
        >
          {incoming.length > 0 && (
            <div className="gc-diplo-inbox__col">
              <h3>Входящие · {incoming.length}</h3>
              <ul className="deal-inbox-list gc-swipe-inbox">
                {incoming.map((o) => {
                  const from =
                    payload.world.factions.find((f) => f.id === o.fromFactionId)
                      ?.name ?? o.fromFactionId;
                  return (
                    <DiploSwipeOffer
                      key={o.id}
                      title={from}
                      subtitle={`отдают: ${o.give.map(itemLabel).join(", ") || "—"} · просят: ${o.want.map(itemLabel).join(", ") || "—"}`}
                      busy={busy}
                      focused={focusedIncoming?.id === o.id}
                      onAccept={() => {
                        setOtherId(o.fromFactionId);
                        onAccept(o.id);
                      }}
                      onReject={() => onReject(o.id)}
                    />
                  );
                })}
              </ul>
            </div>
          )}
          {outgoing.length > 0 && (
            <div className="gc-diplo-inbox__col">
              <h3>Исходящие · {outgoing.length}</h3>
              <ul className="deal-inbox-list">
                {outgoing.map((o) => {
                  const to =
                    payload.world.factions.find((f) => f.id === o.toFactionId)
                      ?.name ?? o.toFactionId;
                  return (
                    <li key={o.id}>
                      <div>
                        <strong>→ {to}</strong>
                        <p className="hint">
                          ждёт ответа ·{" "}
                          {o.give.map(itemLabel).join(", ") || "—"}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="btn sm ghost"
                        disabled={busy}
                        onClick={() => onCancel(o.id)}
                      >
                        Отозвать
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>
      )}

      {me && other && (
        <header
          className="gc-diplo-faceoff fx-spotlight gc-diplo-faceoff--beams"
          aria-label="Переговоры"
          {...faceoffSpot.bind}
        >
          <BackgroundBeamsLite />
          <DiploLeaderCard faction={me} align="start" />
          <div className="gc-diplo-status">
            <RelationBadge relation={relation} />
            <DiploAttitudeLabel opinion={opinion} />
            <OpinionBar value={opinion} />
            <span className="diplo-intel-pill">Разведка {intelLevel}/4</span>
          </div>
          <DiploLeaderCard faction={other} align="end" />
        </header>
      )}

      {me && other && (
        <DiploCompareStrip payload={payload} me={me} other={other} />
      )}

      {me && other && onStance && (
        <section className="gc-diplo-acts" aria-label="Односторонние действия">
          <div className="gc-diplo-acts__copy">
            <strong>Действия</strong>
            <p className="hint">
              Война, эмбарго и разрыв договора вступают в силу сразу — вторая
              сторона не подтверждает.
            </p>
          </div>
          <div className="gc-diplo-acts__btns">
            {canBreak && (
              <span
                className="gc-diplo-acts__mag fx-magnetic fx-ripple-host"
                {...magBreak.bind}
                {...rippleActs.bind}
              >
                <HoldButton
                  className="btn ghost sm hold-btn--danger"
                  ms={700}
                  disabled={busy}
                  holdHint="Удерживайте: разорвать договор"
                  onConfirm={() => void runStance("break")}
                >
                  Разорвать договор
                </HoldButton>
              </span>
            )}
            {canEmbargo && (
              <span
                className="gc-diplo-acts__mag fx-magnetic fx-ripple-host"
                {...magEmbargo.bind}
                {...rippleActs.bind}
              >
                <HoldButton
                  className="btn ghost sm hold-btn--danger"
                  ms={700}
                  disabled={busy}
                  holdHint="Удерживайте: эмбарго"
                  onConfirm={() => void runStance("embargo")}
                >
                  Эмбарго
                </HoldButton>
              </span>
            )}
            {canWar && (
              <span
                className="gc-diplo-acts__mag fx-magnetic fx-ripple-host"
                {...magWar.bind}
                {...rippleActs.bind}
              >
                <HoldButton
                  className="btn primary sm hold-btn--danger is-war"
                  ms={900}
                  disabled={busy}
                  holdHint="Удерживайте: объявить войну"
                  onConfirm={() => void runStance("war")}
                >
                  Объявить войну
                </HoldButton>
              </span>
            )}
            {relation === "war" && (
              <span className="hint">Война уже идёт · мир — через перемирие в сделке</span>
            )}
          </div>
        </section>
      )}

      <div className="gc-diplo-grid deal-desk-grid">
        <aside
          className="deal-rail gc-diplo-rail fx-spotlight"
          aria-label="Известные державы"
          {...railSpot.bind}
        >
          <h3>Цивилизации</h3>
          {others.length === 0 ? (
            <p className="hint">
              Нет известных держав — исследуйте туман или дождитесь контакта.
            </p>
          ) : (
            <ul
              className={`deal-faction-list gc-diplo-civ-list${otherId ? " has-focus" : ""}`}
            >
              {others.map((f) => {
                const rel = getRelation(payload, meId, f.id);
                const op = opinionOf(me, f.id);
                const pendingIn = incoming.some(
                  (o) => o.fromFactionId === f.id,
                );
                const selected = otherId === f.id;
                return (
                  <li key={f.id}>
                    <AnimatedTooltip
                      side="top"
                      content={
                        <span>
                          <strong>{f.name}</strong>
                          <br />
                          {DIPLOMACY_LABELS[rel]} · {opinionLabel(op)} ({op})
                        </span>
                      }
                    >
                      <button
                        type="button"
                        className={[
                          "deal-faction-btn",
                          "gc-diplo-civ-btn",
                          "fx-spotlight",
                          selected ? "on" : "",
                          !selected && otherId ? "is-dim" : "",
                          `gc-diplo-civ-btn--${rel}`,
                          pendingIn ? "is-alert" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        onClick={() => setOtherId(f.id)}
                      >
                        <FactionEmblem faction={f} size="sm" />
                        <span className="deal-faction-meta">
                          <strong>{f.name}</strong>
                          <span className="hint">
                            {DIPLOMACY_LABELS[rel]}
                            {pendingIn ? " · входящее!" : ""}
                          </span>
                          <OpinionBar value={op} />
                        </span>
                      </button>
                    </AnimatedTooltip>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        <section
          className="deal-center gc-diplo-table fx-spotlight"
          aria-label="Торговый стол"
          {...tableSpot.bind}
        >
          <h3 className="gc-diplo-table__title gc-diplo-lamp-title">
            Торговля
          </h3>
          <p className="hint">
            Сделка требует согласия адресата. Война и разрыв договора — кнопки
            выше, без ожидания ответа.
          </p>

          {otherIncoming.length > 0 && (
            <div className="gc-diplo-counteroffer">
              <strong>Их предложение · {other?.name}</strong>
              <p className="hint">
                {otherIncoming[0].give.map(itemLabel).join(", ") || "—"} ↔{" "}
                {otherIncoming[0].want.map(itemLabel).join(", ") || "—"}
              </p>
            </div>
          )}

          {other && (onPlaceOffer || onCancelOffer) && (
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
          )}

          <DiploDealTray
            stocks={economy?.stocks}
            disabled={!other || busy}
            onAddGive={(item) => setGive((g) => [...g, item])}
            onAddWant={(item) => setWant((w) => [...w, item])}
          />

          <div className="gc-trade-board">
            <TradeColumn
              side="you"
              civName={me?.name ?? "Вы"}
              items={give}
              stocks={economy?.stocks}
              assets={myAssets}
              nameLookup={nameLookup}
              disabled={!other || busy}
              onRemove={(i) => setGive((g) => g.filter((_, idx) => idx !== i))}
              onAdd={(item) => setGive((g) => [...g, item])}
            />
            <div className="gc-trade-balance" aria-hidden>
              <span className="gc-trade-balance__icon">⇄</span>
            </div>
            <TradeColumn
              side="them"
              civName={other?.name ?? "—"}
              items={want}
              stocks={economy?.stocks}
              assets={theirAssets}
              nameLookup={nameLookup}
              disabled={!other || busy}
              onRemove={(i) => setWant((w) => w.filter((_, idx) => idx !== i))}
              onAdd={(item) => setWant((w) => [...w, item])}
            />
          </div>

          <label className="gc-trade-note field">
            <span>Записка</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="необязательно"
            />
          </label>

          {needsHold ? (
            <div
              className={`gc-diplo-send-wrap ${canSend ? "fx-moving-border" : ""}`}
            >
              <HoldButton
                className="btn primary block hold-btn--danger"
                disabled={!canSend}
                holdHint="Удерживайте: предложить союз"
                onConfirm={flushSend}
              >
                {busy ? "Отправка…" : "Удержать · предложить союз"}
              </HoldButton>
            </div>
          ) : (
            <div
              className={`gc-diplo-send-wrap ${canSend ? "fx-moving-border" : ""}`}
            >
              <StatefulButton
                busy={busy}
                success={sendSuccess}
                successLabel="Отправлено"
                onSuccessEnd={() => setSendSuccess(false)}
                className="btn primary block gc-diplo-send"
                disabled={!canSend}
                onClick={() => void flushSend()}
              >
                Предложить сделку
              </StatefulButton>
            </div>
          )}
          {msg && <p className="hint">{msg}</p>}
        </section>

        <aside
          className="deal-partner gc-diplo-dossier fx-spotlight"
          aria-label={other ? `Досье · ${other.name}` : "Досье"}
          {...dossierSpot.bind}
        >
          {other ? (
            <>
              <div className="deal-partner-head">
                <FactionEmblem faction={other} size="md" />
                <div>
                  <h3>{other.name}</h3>
                  <p className="hint">{DIPLOMACY_LABELS[relation]}</p>
                </div>
              </div>
              {other.notes ? (
                <p className="hint gc-diplo-notes">{other.notes}</p>
              ) : null}

              <div className="gc-diplo-tabs anim-tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={dossierTab === "treaties"}
                  className={dossierTab === "treaties" ? "on" : ""}
                  onClick={() => setDossierTab("treaties")}
                >
                  Договоры
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={dossierTab === "history"}
                  className={dossierTab === "history" ? "on" : ""}
                  onClick={() => setDossierTab("history")}
                >
                  Хроника
                </button>
              </div>

              {dossierTab === "treaties" ? (
                <>
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
                  {onEconomicTrack && otherId ? (
                    <div className="gc-trade-treaties" style={{ marginTop: 8 }}>
                      <p className="hint gc-trade-treaties__hint">
                        Экономический трек — отдельно от политических
                        договоров.
                      </p>
                      <label className="hint" htmlFor="econ-quote-rate">
                        Курс котировки
                      </label>
                      <input
                        id="econ-quote-rate"
                        type="number"
                        min={0.01}
                        step={0.1}
                        value={quoteRate}
                        disabled={busy}
                        onChange={(e) =>
                          setQuoteRate(Number(e.target.value) || 1)
                        }
                      />
                      <div className="gc-trade-chips" role="group">
                        <button
                          type="button"
                          className="gc-trade-chip"
                          disabled={busy}
                          onClick={() =>
                            void onEconomicTrack("quote", otherId, {
                              unitsQuotePerBase: quoteRate,
                            })
                          }
                        >
                          Валютный договор
                        </button>
                        <button
                          type="button"
                          className="gc-trade-chip"
                          disabled={busy}
                          onClick={() => void onEconomicTrack("union", otherId)}
                        >
                          Валютный союз
                        </button>
                      </div>
                    </div>
                  ) : null}
                </>
              ) : (
                <DiploTimeline events={focusHistory} />
              )}

              <ExpandableSection
                title="На их территории"
                badge={otherQuests.length || undefined}
                defaultOpen={otherQuests.length > 0}
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

              {economy && (
                <ExpandableSection
                  title="Ваша казна"
                  defaultOpen={false}
                  className="gc-diplo-expand"
                >
                  <div className="deal-stock-mini" aria-label="Ваша казна">
                    <div className="deal-stock-row">
                      {CATEGORY_CURRENCIES.map((c) => (
                        <span key={c.id} title={c.name}>
                          <ResourceIcon
                            resourceId={c.id}
                            stocks={economy.stocks}
                            size={14}
                          />{" "}
                          {economy.stocks?.[c.id] ?? 0}
                        </span>
                      ))}
                    </div>
                  </div>
                </ExpandableSection>
              )}

              {onGift && economy && (
                <ExpandableSection
                  title="Дар"
                  badge="без условий"
                  defaultOpen={false}
                  className="gc-diplo-expand"
                >
                  <div className="deal-gift">
                    <p className="hint">Без встречных условий · на тике</p>
                    <div className="gc-trade-chips" role="group" aria-label="Ресурс дара">
                      {GIFT_CURRENCIES.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className={`gc-trade-chip ${giftCurrency === c.id ? "on" : ""}`}
                          onClick={() => {
                            setGiftCurrency(c.id);
                            setGiftAmount(
                              Math.min(
                                10,
                                economy.stocks?.[c.id] ?? 10,
                              ) || 1,
                            );
                            setGiftSheetOpen(true);
                          }}
                        >
                          {c.label}
                        </button>
                      ))}
                    </div>
                    {giftSheetOpen ? (
                      <AmountSheet
                        label={
                          GIFT_CURRENCIES.find((c) => c.id === giftCurrency)
                            ?.label ?? giftCurrency
                        }
                        stock={economy.stocks?.[giftCurrency]}
                        value={giftAmount}
                        onChange={setGiftAmount}
                        onConfirm={() => {
                          const amt = Math.floor(giftAmount);
                          if (amt > 0 && other) {
                            onGift(other.id, giftCurrency, amt);
                            setGiftAmount(10);
                          }
                          setGiftSheetOpen(false);
                        }}
                        onCancel={() => setGiftSheetOpen(false)}
                      />
                    ) : (
                      <button
                        type="button"
                        className="btn sm block"
                        disabled={busy || !other}
                        onClick={() => setGiftSheetOpen(true)}
                      >
                        Указать сумму дара
                      </button>
                    )}
                  </div>
                </ExpandableSection>
              )}
            </>
          ) : (
            <p className="hint">Выберите цивилизацию слева.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
