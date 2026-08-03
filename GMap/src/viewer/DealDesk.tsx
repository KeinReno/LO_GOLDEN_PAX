import { useMemo, useState } from "react";
import type { DiplomacyRelation, ViewerPayload } from "../state/types";
import { DIPLOMACY_LABELS } from "../state/defaults";
import {
  BUILD_METAL,
  BUILD_SUPPLY,
  CATEGORY_CURRENCIES,
} from "../state/economyLabels";
import { ResourceIcon } from "../ui/ResourceIcon";
import { HoldButton } from "../ui/HoldButton";

export type DiploDealItem =
  | { kind: "resource"; currencyId: string; amount: number }
  | { kind: "treaty"; treaty: DiplomacyRelation };

export type DiploOffer = {
  id: string;
  fromFactionId: string;
  toFactionId: string;
  status: string;
  give: DiploDealItem[];
  want: DiploDealItem[];
  note?: string;
  createdTurn?: number;
  createdAt?: string;
};

const CURRENCIES = [
  ...CATEGORY_CURRENCIES.map((c) => ({
    id: c.id,
    label: `${c.name} (${c.short})`,
  })),
  { id: BUILD_METAL.id, label: BUILD_METAL.label },
  { id: BUILD_SUPPLY.id, label: BUILD_SUPPLY.label },
];

const TREATY_OPTIONS: { id: DiplomacyRelation; label: string }[] = [
  { id: "trade", label: "Торговый договор" },
  { id: "alliance", label: "Союз" },
  { id: "truce", label: "Перемирие" },
  { id: "war", label: "Объявление войны" },
  { id: "neutral", label: "Нейтралитет" },
];

function getRelation(
  payload: ViewerPayload,
  a: string,
  b: string,
): DiplomacyRelation {
  const [x, y] = a < b ? [a, b] : [b, a];
  return (
    payload.world.diplomacy.find((d) => d.aId === x && d.bId === y)?.relation ??
    "neutral"
  );
}

function itemLabel(item: DiploDealItem): string {
  if (item.kind === "resource") {
    const c = CURRENCIES.find((x) => x.id === item.currencyId);
    return `${item.amount} ${c?.label ?? item.currencyId}`;
  }
  return DIPLOMACY_LABELS[item.treaty] ?? item.treaty;
}

function DealColumn({
  title,
  items,
  empty,
  onRemove,
}: {
  title: string;
  items: DiploDealItem[];
  empty: string;
  onRemove?: (idx: number) => void;
}) {
  return (
    <div className="deal-col-block">
      <h4>{title}</h4>
      {items.length === 0 ? (
        <p className="hint">{empty}</p>
      ) : (
        <ul className="deal-item-list">
          {items.map((item, i) => (
            <li key={`${item.kind}-${i}`}>
              <span>{itemLabel(item)}</span>
              {onRemove && (
                <button
                  type="button"
                  className="btn ghost sm"
                  onClick={() => onRemove(i)}
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * GC/ES2-style deal desk: you | proposal | them.
 */
export function DealDesk({
  payload,
  economy,
  incoming,
  outgoing,
  busy,
  msg,
  focusOfferId,
  onCreate,
  onAccept,
  onReject,
  onCancel,
  onGift,
}: {
  payload: ViewerPayload;
  economy?: ViewerPayload["economy"];
  incoming: DiploOffer[];
  outgoing: DiploOffer[];
  busy?: boolean;
  msg?: string | null;
  focusOfferId?: string | null;
  onCreate: (args: {
    toFactionId: string;
    give: DiploDealItem[];
    want: DiploDealItem[];
    note: string;
  }) => void;
  onAccept: (offerId: string) => void;
  onReject: (offerId: string) => void;
  onCancel: (offerId: string) => void;
  /** Optional one-way gift (legacy transfer intent). */
  onGift?: (toFactionId: string, currencyId: string, amount: number) => void;
}) {
  const me = payload.factionId;
  const others = payload.world.factions.filter((f) => f.id !== me);
  const [partnerId, setPartnerId] = useState(
    () => others[0]?.id ?? "",
  );
  const [give, setGive] = useState<DiploDealItem[]>([]);
  const [want, setWant] = useState<DiploDealItem[]>([]);
  const [note, setNote] = useState("");
  const [resCurrency, setResCurrency] = useState<string>(
    CURRENCIES[0]?.id ?? "currency.extracta",
  );
  const [resAmount, setResAmount] = useState("100");
  const [resSide, setResSide] = useState<"give" | "want">("give");
  const [treaty, setTreaty] = useState<DiplomacyRelation>("trade");
  const [treatySide, setTreatySide] = useState<"give" | "want">("want");
  const [giftAmount, setGiftAmount] = useState("");
  const [giftCurrency, setGiftCurrency] = useState<string>(
    CURRENCIES[0]?.id ?? "currency.extracta",
  );

  const partner = others.find((f) => f.id === partnerId) ?? null;
  const relation = partner ? getRelation(payload, me, partner.id) : "neutral";
  const myQuests = (payload.world.quests ?? []).filter(
    (q) => q.status === "active",
  );
  const partnerQuests = useMemo(() => {
    // Quests anchored in systems they own (visible) — soft signal.
    if (!partner) return [];
    const owned = new Set(
      payload.world.systems
        .filter((s) => s.ownerFactionId === partner.id)
        .map((s) => s.id),
    );
    return (payload.world.quests ?? []).filter(
      (q) =>
        q.status === "active" && q.systemId && owned.has(q.systemId),
    );
  }, [partner, payload.world.quests, payload.world.systems]);

  const focusedIncoming =
    focusOfferId != null
      ? incoming.find((o) => o.id === focusOfferId)
      : null;

  const canSend =
    !!partnerId &&
    (give.length > 0 || want.length > 0) &&
    !busy;

  const packageHasWar = [...give, ...want].some(
    (i) => i.kind === "treaty" && i.treaty === "war",
  );
  const packageHasAlliance = [...give, ...want].some(
    (i) => i.kind === "treaty" && i.treaty === "alliance",
  );
  const needsHold = packageHasWar || packageHasAlliance;

  const flushSend = () => {
    if (!canSend) return;
    onCreate({ toFactionId: partnerId, give, want, note });
    setGive([]);
    setWant([]);
    setNote("");
  };

  const addResource = () => {
    const amount = Math.floor(Number(resAmount));
    if (!resCurrency || amount <= 0) return;
    const item: DiploDealItem = {
      kind: "resource",
      currencyId: resCurrency,
      amount,
    };
    if (resSide === "give") setGive((g) => [...g, item]);
    else setWant((w) => [...w, item]);
  };

  const addTreaty = () => {
    const item: DiploDealItem = { kind: "treaty", treaty };
    if (treatySide === "give") setGive((g) => [...g, item]);
    else setWant((w) => [...w, item]);
  };

  return (
    <div className="deal-desk">
      {(incoming.length > 0 || outgoing.length > 0) && (
        <section className="deal-inbox" aria-label="Входящие предложения">
          {incoming.length > 0 && (
            <div className="deal-inbox-col">
              <h3>
                Входящие · {incoming.length}
              </h3>
              <ul className="deal-inbox-list">
                {incoming.map((o) => {
                  const from =
                    payload.world.factions.find((f) => f.id === o.fromFactionId)
                      ?.name ?? o.fromFactionId;
                  return (
                    <li
                      key={o.id}
                      className={[
                        "deal-inbox-card",
                        focusedIncoming?.id === o.id ? "is-focus" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <div>
                        <strong>{from}</strong>
                        <p className="hint">
                          отдают:{" "}
                          {o.give.map(itemLabel).join(", ") || "—"}
                          {" · "}
                          просят:{" "}
                          {o.want.map(itemLabel).join(", ") || "—"}
                        </p>
                      </div>
                      <div className="deal-inbox-actions">
                        <button
                          type="button"
                          className="btn sm primary"
                          disabled={busy}
                          onClick={() => onAccept(o.id)}
                        >
                          Принять
                        </button>
                        <button
                          type="button"
                          className="btn sm ghost"
                          disabled={busy}
                          onClick={() => onReject(o.id)}
                        >
                          Отклонить
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {outgoing.length > 0 && (
            <div className="deal-inbox-col">
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

      <div className="deal-desk-grid">
        <aside className="deal-rail" aria-label="Известные державы">
          <h3>Контакты</h3>
          {others.length === 0 ? (
            <p className="hint">
              Нет известных держав — исследуйте туман или дождитесь контакта.
            </p>
          ) : (
            <ul className="deal-faction-list">
              {others.map((f) => {
                const rel = getRelation(payload, me, f.id);
                const pendingIn = incoming.some(
                  (o) => o.fromFactionId === f.id,
                );
                return (
                  <li key={f.id}>
                    <button
                      type="button"
                      className={`deal-faction-btn ${partnerId === f.id ? "on" : ""}`}
                      onClick={() => setPartnerId(f.id)}
                    >
                      <span
                        className="swatch"
                        style={{ background: f.color }}
                      />
                      <span className="deal-faction-meta">
                        <strong>{f.name}</strong>
                        <span className="hint">
                          {DIPLOMACY_LABELS[rel]}
                          {pendingIn ? " · входящее!" : ""}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        <section className="deal-center" aria-label="Сборка сделки">
          <h3>Сделка</h3>
          <p className="hint">
            Слева — что отдаёте вы. Справа — что просите. Отправка сразу
            отсветится у адресата.
          </p>

          <div className="deal-compose-cols">
            <DealColumn
              title="Вы отдаёте"
              items={give}
              empty="Добавьте ресурс или договор"
              onRemove={(i) => setGive((g) => g.filter((_, idx) => idx !== i))}
            />
            <div className="deal-balance" aria-hidden>
              <span>⇄</span>
            </div>
            <DealColumn
              title="Вы просите"
              items={want}
              empty="Добавьте встречные условия"
              onRemove={(i) => setWant((w) => w.filter((_, idx) => idx !== i))}
            />
          </div>

          <div className="deal-adders">
            <div className="deal-adder">
              <span className="hq-stat-label">Ресурс</span>
              <select
                value={resSide}
                onChange={(e) =>
                  setResSide(e.target.value as "give" | "want")
                }
              >
                <option value="give">Отдаю</option>
                <option value="want">Прошу</option>
              </select>
              <select
                value={resCurrency}
                onChange={(e) => setResCurrency(e.target.value)}
              >
                {CURRENCIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                    {economy?.stocks
                      ? ` · ${economy.stocks[c.id] ?? 0}`
                      : ""}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                value={resAmount}
                onChange={(e) => setResAmount(e.target.value)}
              />
              <button type="button" className="btn sm" onClick={addResource}>
                +
              </button>
            </div>
            <div className="deal-adder">
              <span className="hq-stat-label">Договор</span>
              <select
                value={treatySide}
                onChange={(e) =>
                  setTreatySide(e.target.value as "give" | "want")
                }
              >
                <option value="want">Предложить / потребовать</option>
                <option value="give">В пакет как уступку</option>
              </select>
              <select
                value={treaty}
                onChange={(e) =>
                  setTreaty(e.target.value as DiplomacyRelation)
                }
              >
                {TREATY_OPTIONS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
              <button type="button" className="btn sm" onClick={addTreaty}>
                +
              </button>
            </div>
          </div>

          <label className="field">
            <span>Заметка</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="по желанию"
            />
          </label>

          {needsHold ? (
            <HoldButton
              className={`btn primary block hold-btn--danger ${packageHasWar ? "is-war" : ""}`}
              disabled={!canSend}
              holdHint={
                packageHasWar
                  ? "Удерживайте: объявление войны"
                  : "Удерживайте: союз"
              }
              onConfirm={flushSend}
            >
              {busy
                ? "Отправка…"
                : packageHasWar
                  ? "Удержать · объявить войну"
                  : "Удержать · предложить союз"}
            </HoldButton>
          ) : (
            <button
              type="button"
              className="btn primary block"
              disabled={!canSend}
              onClick={flushSend}
            >
              {busy ? "Отправка…" : "Отправить предложение"}
            </button>
          )}
          {msg && <p className="hint">{msg}</p>}
        </section>

        <aside className="deal-partner" aria-label="Выбранная держава">
          {partner ? (
            <>
              <div className="deal-partner-head">
                <span
                  className="swatch"
                  style={{ background: partner.color }}
                />
                <div>
                  <h3>{partner.name}</h3>
                  <p className="hint">{DIPLOMACY_LABELS[relation]}</p>
                </div>
              </div>
              {partner.notes ? (
                <p className="hint" style={{ whiteSpace: "pre-wrap" }}>
                  {partner.notes}
                </p>
              ) : (
                <p className="hint">Публичных заметок нет.</p>
              )}
              <h4>Их поручения на карте</h4>
              {partnerQuests.length === 0 ? (
                <p className="hint">
                  Нет видимых квестов на их территориях (или квесты ещё не
                  выданы).
                </p>
              ) : (
                <ul className="deal-quest-list">
                  {partnerQuests.map((q) => (
                    <li key={q.id}>
                      <strong>{q.name}</strong>
                      <span className="hint"> · {q.summary}</span>
                    </li>
                  ))}
                </ul>
              )}
              <h4>Ваши активные</h4>
              {myQuests.length === 0 ? (
                <p className="hint">Нет активных квестов.</p>
              ) : (
                <ul className="deal-quest-list">
                  {myQuests.slice(0, 5).map((q) => (
                    <li key={q.id}>
                      <strong>{q.name}</strong>
                    </li>
                  ))}
                </ul>
              )}
              {economy && (
                <div className="deal-stock-mini" aria-label="Ваша казна">
                  <h4>Казна (для сделки)</h4>
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
              )}
              {onGift && partner && economy && (
                <div className="deal-gift">
                  <h4>Односторонний дар</h4>
                  <p className="hint">Без встречных условий · на тике</p>
                  <select
                    value={giftCurrency}
                    onChange={(e) => setGiftCurrency(e.target.value)}
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={1}
                    value={giftAmount}
                    onChange={(e) => setGiftAmount(e.target.value)}
                    placeholder="сумма"
                  />
                  <button
                    type="button"
                    className="btn sm block"
                    disabled={
                      busy ||
                      !giftAmount ||
                      Math.floor(Number(giftAmount)) <= 0
                    }
                    onClick={() => {
                      const amt = Math.floor(Number(giftAmount));
                      if (amt <= 0) return;
                      onGift(partner.id, giftCurrency, amt);
                      setGiftAmount("");
                    }}
                  >
                    Отправить дар
                  </button>
                </div>
              )}
            </>
          ) : (
            <p className="hint">Выберите державу слева.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
