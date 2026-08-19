import { HoldButton } from "./shared/HoldButton";
import { AmountSheet } from "./shared/AmountSheet";
import type { DiploUnilateralStance } from "./diploTradeTypes";

type GiftCurrency = { id: string; label: string };

export function DiploActHand({
  busy,
  canWar,
  canEmbargo,
  canBreak,
  giftCurrencies,
  giftCurrency,
  giftAmount,
  giftStock,
  giftOpen,
  quoteRate,
  onStance,
  onGiftCurrency,
  onGiftAmount,
  onGiftOpen,
  onGiftConfirm,
  onQuoteRate,
  onEconomic,
}: {
  busy?: boolean;
  canWar: boolean;
  canEmbargo: boolean;
  canBreak: boolean;
  giftCurrencies: GiftCurrency[];
  giftCurrency: string;
  giftAmount: number;
  giftStock?: number;
  giftOpen: boolean;
  quoteRate: number;
  onStance: (stance: DiploUnilateralStance) => void;
  onGiftCurrency: (id: string) => void;
  onGiftAmount: (n: number) => void;
  onGiftOpen: (open: boolean) => void;
  onGiftConfirm: () => void;
  onQuoteRate: (n: number) => void;
  onEconomic?: (kind: "quote" | "union") => void;
}) {
  return (
    <div className="gc-deal-tray gc-deal-tray--give" aria-label="Жесты">
      <div className="gc-deal-tray__hand">
        {canWar ? (
          <HoldButton
            className="diplo-act-card hold-btn--danger is-war"
            ms={900}
            disabled={busy}
            holdHint="Удерживайте: объявить войну"
            onConfirm={() => onStance("war")}
          >
            <strong>Война</strong>
            <span className="hint">сразу · −20 мнения</span>
          </HoldButton>
        ) : (
          <p className="hint diplo-act-card is-off">Война уже идёт</p>
        )}
        {canEmbargo ? (
          <HoldButton
            className="diplo-act-card hold-btn--danger"
            ms={700}
            disabled={busy}
            holdHint="Удерживайте: эмбарго"
            onConfirm={() => onStance("embargo")}
          >
            <strong>Эмбарго</strong>
            <span className="hint">сразу · без их согласия</span>
          </HoldButton>
        ) : null}
        {canBreak ? (
          <HoldButton
            className="diplo-act-card hold-btn--danger"
            ms={700}
            disabled={busy}
            holdHint="Удерживайте: разорвать договор"
            onConfirm={() => onStance("break")}
          >
            <strong>Разрыв</strong>
            <span className="hint">договор → нейтралитет</span>
          </HoldButton>
        ) : null}
        <HoldButton
          className="diplo-act-card"
          ms={500}
          disabled={busy}
          holdHint="Удерживайте: оскорбить"
          onConfirm={() => onStance("insult")}
        >
          <strong>Оскорбление</strong>
          <span className="hint">мнение · договор не трогает</span>
        </HoldButton>
        {giftCurrencies.length > 0 ? (
        <div className="diplo-act-card diplo-act-card--gift">
          <strong>Дар</strong>
          <span className="hint">без условий</span>
          <div className="gc-trade-chips" role="group">
            {giftCurrencies.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`gc-trade-chip ${giftCurrency === c.id ? "on" : ""}`}
                disabled={busy}
                onClick={() => {
                  onGiftCurrency(c.id);
                  onGiftOpen(true);
                }}
              >
                {c.label}
              </button>
            ))}
          </div>
          {giftOpen ? (
            <AmountSheet
              label={
                giftCurrencies.find((c) => c.id === giftCurrency)?.label ??
                giftCurrency
              }
              stock={giftStock}
              value={giftAmount}
              onChange={onGiftAmount}
              onConfirm={onGiftConfirm}
              onCancel={() => onGiftOpen(false)}
            />
          ) : (
            <button
              type="button"
              className="btn sm"
              disabled={busy}
              onClick={() => onGiftOpen(true)}
            >
              Сумма
            </button>
          )}
        </div>
        ) : null}
        {onEconomic ? (
          <div className="diplo-act-card diplo-act-card--fx">
            <strong>Валютный след</strong>
            <label className="hint" htmlFor="diplo-quote-rate">
              Курс
              <input
                id="diplo-quote-rate"
                type="number"
                min={0.01}
                step={0.1}
                value={quoteRate}
                disabled={busy}
                onChange={(e) => onQuoteRate(Number(e.target.value) || 1)}
              />
            </label>
            <button
              type="button"
              className="btn sm"
              disabled={busy}
              onClick={() => onEconomic("quote")}
            >
              Договор
            </button>
            <HoldButton
              className="btn sm hold-btn--danger"
              ms={700}
              disabled={busy}
              holdHint="Удерживайте: валютный союз"
              onConfirm={() => onEconomic("union")}
            >
              Союз
            </HoldButton>
          </div>
        ) : null}
      </div>
    </div>
  );
}
