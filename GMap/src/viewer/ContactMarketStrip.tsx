import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BUILD_METAL,
  BUILD_SUPPLY,
  CATEGORY_CURRENCIES,
} from "../state/economyLabels";
import { intentApCost } from "../state/contentCatalog";
import { ResourceIcon } from "../ui/ResourceIcon";
import { ExpandableSection } from "../ui/ExpandableSection";
import { StatefulButton } from "../ui/StatefulButton";

export type ContactBookOffer = {
  id: string;
  factionId: string;
  side: "sell" | "buy";
  giveCurrency: string;
  giveAmount: number;
  wantCurrency: string;
  wantAmount: number;
  createdTurn: number;
  venue?: "common" | "contacts";
};

const CURRENCY_LABELS: Record<string, string> = {
  ...Object.fromEntries(
    CATEGORY_CURRENCIES.map((c) => [c.id, `${c.name} (${c.short})`]),
  ),
  [BUILD_METAL.id]: BUILD_METAL.label,
  [BUILD_SUPPLY.id]: BUILD_SUPPLY.label,
};

const TRADE_CURRENCIES = Object.keys(CURRENCY_LABELS);

const QUICK_PRESETS: { give: string; want: string; label: string }[] = [
  {
    give: CATEGORY_CURRENCIES[0]?.id ?? "currency.extracta",
    want: CATEGORY_CURRENCIES[1]?.id ?? "currency.materia",
    label: "A→B",
  },
  {
    give: CATEGORY_CURRENCIES[1]?.id ?? "currency.materia",
    want: CATEGORY_CURRENCIES[0]?.id ?? "currency.extracta",
    label: "B→A",
  },
  {
    give: BUILD_METAL.id,
    want: CATEGORY_CURRENCIES[0]?.id ?? "currency.extracta",
    label: "Металл→A",
  },
  {
    give: CATEGORY_CURRENCIES[0]?.id ?? "currency.extracta",
    want: BUILD_SUPPLY.id,
    label: "A→Снабж.",
  },
];

function shortCur(id: string): string {
  return (
    CURRENCY_LABELS[id] ??
    id.replace(/^(currency|map|fx)\./, "")
  );
}

/**
 * Compact contacts-venue market strip for DealDesk (not a Market clone).
 * Partner already selected in diplo; shows their/common contact lots + compose.
 */
export function ContactMarketStrip({
  factionId,
  password,
  partnerId,
  partnerName,
  isTradePartner,
  stocks,
  factionNames,
  reservedAp = 0,
  apMax = 0,
  busy,
  onPlaceOffer,
  onCancelOffer,
}: {
  factionId: string;
  password?: string;
  partnerId: string;
  partnerName: string;
  isTradePartner: boolean;
  stocks?: Record<string, number>;
  factionNames?: Record<string, string>;
  reservedAp?: number;
  apMax?: number;
  busy?: boolean;
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
  const [book, setBook] = useState<ContactBookOffer[]>([]);
  const [bookBusy, setBookBusy] = useState(false);
  const [bookError, setBookError] = useState<string | null>(null);
  const [localMsg, setLocalMsg] = useState<string | null>(null);
  const [offerSide, setOfferSide] = useState<"sell" | "buy">("sell");
  const [giveCurrency, setGiveCurrency] = useState(TRADE_CURRENCIES[0] ?? "");
  const [wantCurrency, setWantCurrency] = useState(TRADE_CURRENCIES[1] ?? "");
  const [giveAmount, setGiveAmount] = useState("50");
  const [wantAmount, setWantAmount] = useState("50");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const offerAp = intentApCost("intent.market_offer");

  const refreshBook = useCallback(async () => {
    if (!factionId || !password) {
      setBook([]);
      setBookError(null);
      return;
    }
    setBookBusy(true);
    setBookError(null);
    try {
      const res = await fetch("/api/market/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          factionId,
          password,
          venue: "contacts",
        }),
      });
      if (!res.ok) {
        setBookError(`Не удалось загрузить лоты (${res.status})`);
        return;
      }
      const data = (await res.json()) as { offers?: ContactBookOffer[] };
      setBook(Array.isArray(data.offers) ? data.offers : []);
    } catch (e) {
      setBookError(e instanceof Error ? e.message : "Не удалось загрузить лоты");
    } finally {
      setBookBusy(false);
    }
  }, [factionId, password]);

  useEffect(() => {
    void refreshBook();
  }, [refreshBook, partnerId]);

  const partnerLots = useMemo(
    () => book.filter((o) => o.factionId === partnerId),
    [book, partnerId],
  );
  const otherContactLots = useMemo(
    () =>
      book.filter(
        (o) => o.factionId !== partnerId && o.factionId !== factionId,
      ),
    [book, partnerId, factionId],
  );
  const myOffers = useMemo(
    () => book.filter((o) => o.factionId === factionId),
    [book, factionId],
  );

  const parsedGive = Math.floor(Number(giveAmount));
  const parsedWant = Math.floor(Number(wantAmount));
  const offerStock = stocks?.[giveCurrency] ?? 0;
  const canPlace =
    !!onPlaceOffer &&
    isTradePartner &&
    !busy &&
    !submitting &&
    parsedGive > 0 &&
    parsedWant > 0 &&
    giveCurrency !== wantCurrency &&
    parsedGive <= offerStock &&
    reservedAp + offerAp <= apMax;

  const fillFromLot = (o: ContactBookOffer) => {
    setOfferSide(o.side === "sell" ? "buy" : "sell");
    setGiveCurrency(o.wantCurrency);
    setGiveAmount(String(o.wantAmount));
    setWantCurrency(o.giveCurrency);
    setWantAmount(String(o.giveAmount));
    setLocalMsg(`Ответ на лот · ${partnerName || shortCur(o.factionId)}`);
  };

  const place = async (
    side: "sell" | "buy",
    giveCur: string,
    giveAmt: number,
    wantCur: string,
    wantAmt: number,
  ) => {
    if (!onPlaceOffer) return;
    setSubmitting(true);
    setLocalMsg(null);
    try {
      const ok = await onPlaceOffer(
        side,
        giveCur,
        giveAmt,
        wantCur,
        wantAmt,
        "contacts",
      );
      if (ok === false) {
        setLocalMsg("Заявка не принята");
        return;
      }
      setSuccess(true);
      void refreshBook();
    } finally {
      setSubmitting(false);
    }
  };

  const quickReply = (o: ContactBookOffer) => {
    void place(
      o.side === "sell" ? "buy" : "sell",
      o.wantCurrency,
      o.wantAmount,
      o.giveCurrency,
      o.giveAmount,
    );
  };

  const applyPreset = (give: string, want: string) => {
    setOfferSide("sell");
    setGiveCurrency(give);
    setWantCurrency(want);
    const stock = stocks?.[give] ?? 0;
    const amt = stock > 0 ? Math.min(50, Math.max(1, Math.floor(stock / 4) || 1)) : 25;
    setGiveAmount(String(amt));
    setWantAmount(String(amt));
  };

  const lotRow = (o: ContactBookOffer, showOwner?: string) => (
    <li key={o.id} className="gc-contact-lot">
      <button
        type="button"
        className={`gc-contact-lot__btn ${o.side === "sell" ? "is-sell" : "is-buy"}`}
        disabled={!isTradePartner || busy}
        onClick={() => fillFromLot(o)}
        title="Подставить в заявку"
      >
        <span className="gc-contact-lot__side">
          {o.side === "sell" ? "Продажа" : "Покупка"}
        </span>
        <span className="gc-contact-lot__swap">
          <ResourceIcon resourceId={o.giveCurrency} size={14} />
          <strong>{o.giveAmount}</strong>
          <span aria-hidden>→</span>
          <ResourceIcon resourceId={o.wantCurrency} size={14} />
          <strong>{o.wantAmount}</strong>
        </span>
        {showOwner ? <span className="hint">{showOwner}</span> : null}
      </button>
      {onPlaceOffer && isTradePartner ? (
        <button
          type="button"
          className="btn ghost sm"
          disabled={busy || submitting}
          onClick={() => quickReply(o)}
          title="Ответить зеркальной заявкой"
        >
          Ответить
        </button>
      ) : null}
    </li>
  );

  return (
    <ExpandableSection
      title="Биржа · контакты"
      badge={
        isTradePartner
          ? (() => {
              const n = partnerLots.length + otherContactLots.length;
              return n > 0 ? n : undefined;
            })()
          : "нет канала"
      }
      defaultOpen={isTradePartner}
      className="gc-diplo-expand gc-contact-trade"
    >
      {!isTradePartner ? (
        <p className="hint">
          Нужен договор торговли или союз с {partnerName}, чтобы выставлять
          адресные лоты (venue: контакты).
        </p>
      ) : (
        <>
          <p className="hint">
            Лоты партнёра и остальных контактов · {offerAp} ОД · залог при
            размещении
          </p>

          <div className="gc-contact-trade__book">
            {bookError ? (
              <p className="hint" role="alert">
                {bookError}
              </p>
            ) : null}
            <div>
              <strong className="gc-contact-trade__h">
                Лоты · {partnerName} · {partnerLots.length}
              </strong>
              {partnerLots.length === 0 ? (
                <p className="hint">Нет открытых лотов партнёра</p>
              ) : (
                <ul className="gc-contact-lot-list">
                  {partnerLots.map((o) => lotRow(o))}
                </ul>
              )}
            </div>
            {otherContactLots.length > 0 && (
              <div>
                <strong className="gc-contact-trade__h">
                  Другие контакты · {otherContactLots.length}
                </strong>
                <ul className="gc-contact-lot-list">
                  {otherContactLots.slice(0, 6).map((o) =>
                    lotRow(
                      o,
                      factionNames?.[o.factionId] ??
                        o.factionId.replace(/^faction\./, ""),
                    ),
                  )}
                </ul>
              </div>
            )}
          </div>

          <div className="gc-diplo-quick" aria-label="Быстрые пары">
            {QUICK_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                className="gc-diplo-quick-btn"
                disabled={busy}
                onClick={() => applyPreset(p.give, p.want)}
              >
                {p.label}
              </button>
            ))}
            <button
              type="button"
              className="btn ghost sm"
              disabled={bookBusy}
              onClick={() => void refreshBook()}
            >
              Обновить
            </button>
          </div>

          {onPlaceOffer && stocks && (
            <div className="gc-contact-compose">
              <div className="gc-contact-compose__sides">
                <button
                  type="button"
                  className={offerSide === "sell" ? "on" : ""}
                  onClick={() => setOfferSide("sell")}
                >
                  Продажа
                </button>
                <button
                  type="button"
                  className={offerSide === "buy" ? "on" : ""}
                  onClick={() => setOfferSide("buy")}
                >
                  Покупка
                </button>
              </div>
              <div className="gc-contact-compose__grid">
                <label>
                  <span className="hint">Отдаю</span>
                  <select
                    value={giveCurrency}
                    onChange={(e) => setGiveCurrency(e.target.value)}
                  >
                    {TRADE_CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {shortCur(c)} · {stocks[c] ?? 0}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={1}
                    max={offerStock}
                    value={giveAmount}
                    onChange={(e) => setGiveAmount(e.target.value)}
                  />
                </label>
                <span className="gc-contact-compose__arrow" aria-hidden>
                  ⇄
                </span>
                <label>
                  <span className="hint">Хочу</span>
                  <select
                    value={wantCurrency}
                    onChange={(e) => setWantCurrency(e.target.value)}
                  >
                    {TRADE_CURRENCIES.filter((c) => c !== giveCurrency).map(
                      (c) => (
                        <option key={c} value={c}>
                          {shortCur(c)}
                        </option>
                      ),
                    )}
                  </select>
                  <input
                    type="number"
                    min={1}
                    value={wantAmount}
                    onChange={(e) => setWantAmount(e.target.value)}
                  />
                </label>
              </div>
              <StatefulButton
                className="btn primary sm block"
                disabled={!canPlace}
                busy={submitting}
                success={success}
                successLabel="В очереди хода"
                onSuccessEnd={() => setSuccess(false)}
                onClick={() =>
                  void place(
                    offerSide,
                    giveCurrency,
                    parsedGive,
                    wantCurrency,
                    parsedWant,
                  )
                }
              >
                Выставить лот · контакты
              </StatefulButton>
            </div>
          )}

          {myOffers.length > 0 && onCancelOffer && (
            <div className="gc-contact-mine">
              <strong className="gc-contact-trade__h">
                Ваши заявки · {myOffers.length}
              </strong>
              <ul className="gc-contact-lot-list">
                {myOffers.map((o) => (
                  <li key={o.id} className="gc-contact-lot">
                    <span className="gc-contact-lot__swap">
                      {o.side === "sell" ? "Продажа" : "Покупка"} ·{" "}
                      <ResourceIcon resourceId={o.giveCurrency} size={14} />
                      {o.giveAmount} →{" "}
                      <ResourceIcon resourceId={o.wantCurrency} size={14} />
                      {o.wantAmount}
                    </span>
                    <button
                      type="button"
                      className="btn ghost sm"
                      disabled={busy}
                      onClick={() => {
                        void Promise.resolve(onCancelOffer(o.id)).then(() =>
                          refreshBook(),
                        );
                      }}
                    >
                      Отменить
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
      {localMsg && <p className="hint">{localMsg}</p>}
    </ExpandableSection>
  );
}
