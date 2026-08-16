import {
  memo,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  BUILD_METAL,
  BUILD_SUPPLY,
  CATEGORY_CURRENCIES,
  listStrategicResourceIds,
  resourceDisplayName,
  stockpileCardIds,
} from "../../state/economyLabels";
import { getCachedContent, intentApCost } from "../../state/contentCatalog";
import { useViewerOrderSessionStore } from "../../state/viewerOrderSessionStore";
import type { ViewerPayload } from "../../state/types";
import { ResourceIcon } from "../../ui/ResourceIcon";
import { DragCard } from "../../ui/DragCard";
import { DropZone } from "../../ui/DropZone";
import {
  AlertTriangle,
  ChevronDown,
  Coins,
  MoreHorizontal,
  Package,
  ShoppingCart,
  Truck,
} from "lucide-react";
import { FloatingPopover } from "../../ui/FloatingPopover";
import { fmtInt, fmtSigned } from "../../state/numberFormat";
import { buildSparkline, currencyShortLabel, reasonLabel } from "./chartData";
import { Sparkline } from "./components/Sparkline";
import { EmptyState } from "./components/EmptyState";
import { CATEGORY_LEGEND } from "./ecoCopy";
import { isStockAlertOn } from "./stockAlerts";
import { EcoTip } from "./components/EcoTip";
import { NumberTicker } from "./components/NumberTicker";
import type { EconomyFlowBreakdown } from "../economyFlowTypes";
import { buildTierStockRows, type TierStockRow } from "./stockpileTierData";
import {
  EXPRESS_LOT_FRACTIONS,
  type ExpressSide,
  type MarketRateRow,
  fixedBuyQuoteAmount,
  fixedSellAmount,
  inferWarehouseCap,
  lotAmount,
  resolveQuoteCurrency,
  validateExpressTrade,
} from "./stockpileExpressTrade";

type StockCard = {
  id: string;
  name: string;
  stock: number;
  reserved: number;
  available: number;
  cssVar?: string;
  strategic?: boolean;
};

type Props = {
  payload: ViewerPayload;
  flowData?: EconomyFlowBreakdown | null;
  onConvert?: (fromCurrency: string, toCurrency: string, amountFrom: number) => void;
  /** Optional: open the Market room book. Express buy/sell stays in Economy. */
  onSellToMarket?: (currencyId: string) => void;
  onReserve?: (currencyId: string, amount: number, label?: string) => void;
  onSendCaravan?: (
    currencyId: string,
    systemId: string,
    amount: number,
  ) => void | Promise<void | boolean>;
  onSetAlert?: (currencyId: string) => void;
  onDropOnSystem?: (
    currencyId: string,
    systemId: string,
    amount?: number,
  ) => void;
  onFocusBuild?: () => void;
  busy?: boolean;
};

function defaultCaravanAmount(card: StockCard): number {
  return Math.max(
    1,
    Math.min(card.available, Math.ceil(card.available * 0.25) || 1),
  );
}

function categoryLetterForCard(cardId: string): string | null {
  return CATEGORY_CURRENCIES.find((c) => c.id === cardId)?.letter ?? null;
}

type LotId = "step" | "p25" | "p50";

const LOT_OPTIONS: readonly { id: LotId; label: string; title: string }[] = [
  { id: "step", label: "Шаг", title: "Фиксированный шаг обмена" },
  { id: "p25", label: "25%", title: "Лот 25% запаса" },
  { id: "p50", label: "50%", title: "Лот 50% запаса" },
];

function expressAmount(
  lot: LotId,
  side: ExpressSide,
  available: number,
  quoteAvailable: number,
): number {
  if (lot === "step") {
    return side === "buy"
      ? fixedBuyQuoteAmount(quoteAvailable)
      : fixedSellAmount(available);
  }
  const frac =
    lot === "p25" ? EXPRESS_LOT_FRACTIONS[0] : EXPRESS_LOT_FRACTIONS[1];
  return lotAmount(side === "buy" ? quoteAvailable : available, frac);
}

function TradeActionButton({
  label,
  icon,
  disabled,
  reason,
  preview,
  busy,
  onClick,
  primary,
}: {
  label: string;
  icon?: ReactNode;
  disabled: boolean;
  reason: string;
  preview?: ReactNode;
  busy?: boolean;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <EcoTip
      delayMs={420}
      content={
        <>
          <strong>{label}</strong>
          {preview}
          {disabled && reason ? <div className="hint">{reason}</div> : null}
        </>
      }
    >
      <button
        type="button"
        className={`eco-stock-card__btn${primary ? " eco-stock-card__btn--primary" : ""}`}
        disabled={busy || disabled}
        title={disabled ? reason : label}
        aria-label={disabled ? `${label}: ${reason}` : label}
        onClick={onClick}
      >
        {icon}
        <span>{label}</span>
      </button>
    </EcoTip>
  );
}

function TierBreakdownTable({
  id,
  rows,
  showStockEstimate,
}: {
  id: string;
  rows: TierStockRow[];
  showStockEstimate: boolean;
}) {
  return (
    <div className="eco-stock-tiers" id={id}>
      <table className="eco-stock-tiers__table">
        <thead>
          <tr>
            <th scope="col">Тир</th>
            <th scope="col" title={showStockEstimate ? "Оценка доли категорийного запаса" : undefined}>
              Запас
            </th>
            <th scope="col">Произв.</th>
            <th scope="col">Расход</th>
            <th scope="col">Итог</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.tier} className={row.active ? "" : "is-idle"}>
              <th scope="row">T{row.tier}</th>
              <td className="tabular-nums">{fmtInt(row.stock)}</td>
              <td className="tabular-nums eco-up">
                {row.production > 0 ? `+${fmtInt(row.production)}` : "—"}
              </td>
              <td className="tabular-nums empire-res-demand">
                {row.consumption > 0 ? `−${fmtInt(row.consumption)}` : "—"}
              </td>
              <td
                className={`tabular-nums ${row.net >= 0 ? "eco-up" : "eco-down"}`}
              >
                {row.production > 0 || row.consumption > 0
                  ? fmtSigned(row.net)
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {showStockEstimate && (
        <p className="hint eco-stock-tiers__note">
          Запас по тирам — оценка по доле потоков (категория хранится суммарно).
        </p>
      )}
    </div>
  );
}

const StockRow = memo(function StockRow({
  card,
  spark,
  history,
  tierRows,
  showStockEstimate,
  onConvert,
  onReserve,
  onSetAlert,
  busy,
  rates,
  stocks,
  reserves,
  reservedAp,
  apMax,
  convertAp,
  stockCap,
}: {
  card: StockCard;
  spark: number[];
  history: { delta: number; reason: string; turn: number | null }[];
  tierRows: TierStockRow[];
  showStockEstimate: boolean;
  onConvert?: (fromCurrency: string, toCurrency: string, amountFrom: number) => void;
  onReserve?: (id: string, amount: number, label?: string) => void;
  onSetAlert?: (id: string) => void;
  busy?: boolean;
  rates: MarketRateRow[];
  stocks: Record<string, number>;
  reserves: Record<string, number>;
  reservedAp: number;
  apMax: number;
  convertAp: number;
  stockCap: number | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [lot, setLot] = useState<LotId>("step");
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const tierPanelId = `eco-stock-tiers-${card.id.replace(/\./g, "-")}`;
  const menuId = `eco-stock-more-${card.id.replace(/\./g, "-")}`;

  const defaultReserve = Math.max(
    1,
    Math.min(card.available, Math.ceil(card.stock * 0.25) || 1),
  );

  const quoteCurrency = resolveQuoteCurrency(rates, card.id);
  const quoteAvailable = Math.max(
    0,
    Math.floor(Number(stocks[quoteCurrency ?? ""] ?? 0)) -
      Math.floor(Number(reserves[quoteCurrency ?? ""] ?? 0)),
  );
  const tradeBase = {
    rates,
    quoteCurrency,
    stocks,
    available: card.available,
    quoteAvailable,
    reservedAp,
    apMax,
    convertAp,
    stockCap,
    resourceId: card.id,
  };

  const checkTrade = (side: ExpressSide, amountFrom: number) =>
    validateExpressTrade({ ...tradeBase, side, amountFrom });

  const runTrade = (side: ExpressSide, amountFrom: number) => {
    if (!onConvert) return;
    const check = checkTrade(side, amountFrom);
    if (!check.ok) return;
    onConvert(check.fromCurrency, check.toCurrency, check.amountFrom);
  };

  const buyAmount = expressAmount(lot, "buy", card.available, quoteAvailable);
  const sellAmount = expressAmount(lot, "sell", card.available, quoteAvailable);
  const buyCheck = checkTrade("buy", buyAmount);
  const sellCheck = checkTrade("sell", sellAmount);

  const closeMenu = () => setMenu(null);

  const doReserve = () =>
    onReserve?.(
      card.id,
      card.reserved > 0 ? 0 : defaultReserve,
      card.reserved > 0 ? undefined : "резерв склада",
    );

  const doCaravan = () => {
    document
      .querySelector(".eco-stock-routes")
      ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  const reserveDisabled = busy || (card.reserved <= 0 && card.available <= 0);
  const caravanDisabled = busy || card.available <= 0;
  const alertOn = isStockAlertOn(card.id);
  const reserveLabel = card.reserved > 0 ? "Снять резерв" : "Резерв";
  const alertLabel = alertOn ? "Не следить" : "Следить";

  return (
    <li>
      <div
        className={`eco-stock-card ${card.reserved > 0 ? "has-reserve" : ""}`}
        style={
          card.cssVar
            ? ({ "--stock-accent": card.cssVar } as CSSProperties)
            : undefined
        }
      >
        <div className="eco-stock-card__head">
          <button
            type="button"
            className={`eco-stock-card__expand${expanded ? " is-open" : ""}`}
            aria-expanded={expanded}
            aria-controls={tierPanelId}
            title={expanded ? "Свернуть тиры" : "Развернуть тиры T1–T10"}
            onClick={() => setExpanded((v) => !v)}
          >
            <ChevronDown size={16} strokeWidth={2} aria-hidden />
          </button>
          <EcoTip
            content={
              <>
                <strong>{card.name}</strong>
                <div>Запас {fmtInt(card.stock)}</div>
                {card.reserved > 0 && (
                  <div>
                    Резерв {fmtInt(card.reserved)} · свободно{" "}
                    {fmtInt(card.available)}
                  </div>
                )}
                <div className="hint">
                  Кнопки ниже — действия. Перетащите карточку на биржу,
                  резерв или систему ниже.
                </div>
              </>
            }
          >
            <DragCard
              cardId={card.id}
              title=""
              pinned={!!busy || card.available <= 0}
              tilt
              returnHome
              className="eco-stock-card__main"
            >
              <span className="eco-stock-card__icon">
                <ResourceIcon resourceId={card.id} size={18} />
              </span>
              <span className="eco-stock-card__name">{card.name}</span>
              <span className="eco-stock-card__qty-block">
                <strong className="eco-stock-card__qty tabular-nums">
                  <NumberTicker value={card.stock} />
                </strong>
                {card.reserved > 0 && (
                  <span className="eco-stock-card__reserve hint">
                    резерв {fmtInt(card.reserved)}
                  </span>
                )}
              </span>
              {spark.length > 1 && (
                <Sparkline values={spark} className="eco-stock-card__spark" />
              )}
              {history[0] && (
                <span
                  className={`eco-stock-card__delta ${
                    history[0].delta >= 0 ? "is-up" : "is-down"
                  }`}
                >
                  {history[0].delta > 0 ? "+" : ""}
                  {fmtInt(history[0].delta)} · {reasonLabel(history[0].reason)}
                </span>
              )}
            </DragCard>
          </EcoTip>
        </div>
        {expanded && (
          <TierBreakdownTable
            id={tierPanelId}
            rows={tierRows}
            showStockEstimate={showStockEstimate}
          />
        )}
        <div className="eco-stock-card__actions">
          <div
            className="eco-stock-card__lots"
            role="radiogroup"
            aria-label="Размер лота"
          >
            {LOT_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={lot === opt.id}
                className={`eco-stock-card__lot-seg${lot === opt.id ? " is-active" : ""}`}
                title={opt.title}
                aria-label={opt.title}
                disabled={busy}
                onClick={() => setLot(opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <TradeActionButton
            primary
            label="Купить"
            icon={<ShoppingCart size={14} strokeWidth={2} aria-hidden />}
            disabled={!onConvert || !buyCheck.ok}
            reason={
              !onConvert
                ? "Обмен недоступен"
                : buyCheck.ok
                  ? "Купить сейчас"
                  : buyCheck.reason
            }
            preview={
              buyCheck.ok ? (
                <div>
                  −{fmtInt(buyCheck.amountFrom)} {currencyShortLabel(buyCheck.fromCurrency)} → +
                  {fmtInt(buyCheck.amountTo)} «{card.name}» (здесь, без биржи).
                </div>
              ) : undefined
            }
            busy={busy}
            onClick={() => runTrade("buy", buyAmount)}
          />
          <TradeActionButton
            primary
            label="Продать"
            icon={<Coins size={14} strokeWidth={2} aria-hidden />}
            disabled={!onConvert || !sellCheck.ok}
            reason={
              !onConvert
                ? "Обмен недоступен"
                : sellCheck.ok
                  ? "Продать сейчас"
                  : sellCheck.reason
            }
            preview={
              sellCheck.ok ? (
                <div>
                  −{fmtInt(sellCheck.amountFrom)} «{card.name}» → +
                  {fmtInt(sellCheck.amountTo)}{" "}
                  {currencyShortLabel(sellCheck.toCurrency)}
                </div>
              ) : undefined
            }
            busy={busy}
            onClick={() => runTrade("sell", sellAmount)}
          />
          <EcoTip
            delayMs={420}
            className="eco-stock-card__more-wrap"
            content={
              <>
                <strong>Ещё</strong>
                <div>Резерв, караван, следить за запасом.</div>
              </>
            }
          >
            <button
              type="button"
              className="eco-stock-card__btn eco-stock-card__more"
              disabled={busy}
              title="Ещё действия"
              aria-label="Ещё действия"
              aria-haspopup="menu"
              aria-expanded={menu != null}
              aria-controls={menuId}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setMenu((open) =>
                  open ? null : { x: rect.right, y: rect.bottom },
                );
              }}
            >
              <MoreHorizontal size={16} strokeWidth={2} aria-hidden />
            </button>
          </EcoTip>
          <FloatingPopover
            open={menu != null}
            onClose={closeMenu}
            x={menu?.x ?? 0}
            y={menu?.y ?? 0}
            placement="bottom-end"
            role="menu"
            className="eco-stock-card__menu"
          >
            <div id={menuId} role="none">
              <button
                type="button"
                role="menuitem"
                className="eco-stock-card__menu-item"
                disabled={!!reserveDisabled}
                title={
                  card.reserved > 0
                    ? `Вернуть ${fmtInt(card.reserved)} в свободный запас`
                    : `Отложить ~${fmtInt(defaultReserve)} под стройку/приказы`
                }
                aria-label={reserveLabel}
                onClick={() => {
                  doReserve();
                  closeMenu();
                }}
              >
                <Package size={14} strokeWidth={2} aria-hidden />
                <span>{reserveLabel}</span>
              </button>
              <button
                type="button"
                role="menuitem"
                className="eco-stock-card__menu-item"
                disabled={!!caravanDisabled}
                title="Перетащите ресурс на систему в списке ниже"
                aria-label="Караван"
                onClick={() => {
                  doCaravan();
                  closeMenu();
                }}
              >
                <Truck size={14} strokeWidth={2} aria-hidden />
                <span>Караван</span>
              </button>
              <button
                type="button"
                role="menuitem"
                className="eco-stock-card__menu-item"
                disabled={!!busy}
                title={alertOn ? "Не следить" : "Следить за запасом"}
                aria-label={alertLabel}
                onClick={() => {
                  onSetAlert?.(card.id);
                  closeMenu();
                }}
              >
                <AlertTriangle size={14} strokeWidth={2} aria-hidden />
                <span>{alertLabel}</span>
              </button>
            </div>
          </FloatingPopover>
        </div>
      </div>
    </li>
  );
});

export function StockpileSection({
  payload,
  flowData,
  onConvert,
  onReserve,
  onSendCaravan,
  onSetAlert,
  onDropOnSystem,
  onFocusBuild,
  busy,
}: Props) {
  const eco = payload.economy;
  const convertAp = intentApCost("intent.market_convert");
  const reservedAp = useViewerOrderSessionStore((s) => s.reservedAp);
  const storeApMax = useViewerOrderSessionStore((s) => s.apMax);
  const apMax =
    typeof payload.apMax === "number" ? payload.apMax : storeApMax;

  const [rates, setRates] = useState<MarketRateRow[]>(
    () => getCachedContent()?.economy_schema?.market?.placeholder_rates ?? [],
  );

  useEffect(() => {
    let cancelled = false;
    const cached =
      getCachedContent()?.economy_schema?.market?.placeholder_rates ?? [];
    if (cached.length) setRates(cached);
    void fetch("/api/market/rates")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !Array.isArray(d?.rates)) return;
        setRates(d.rates);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const acceptIds = useMemo(
    () => stockpileCardIds(),
    // Content catalog ids (schema + map_resources), not live stocks.
    [],
  );

  const cards = useMemo(() => {
    if (!eco) return [] as StockCard[];
    const reserves = eco.stockReserves ?? {};
    const list: StockCard[] = [
      {
        id: BUILD_METAL.id,
        name: BUILD_METAL.label,
        stock: eco.stocks?.[BUILD_METAL.id] ?? 0,
        reserved: reserves[BUILD_METAL.id]?.amount ?? 0,
        available: 0,
        cssVar: "var(--accent-holo, #c9a227)",
      },
      {
        id: BUILD_SUPPLY.id,
        name: BUILD_SUPPLY.label,
        stock: eco.stocks?.[BUILD_SUPPLY.id] ?? 0,
        reserved: reserves[BUILD_SUPPLY.id]?.amount ?? 0,
        available: 0,
        cssVar: "var(--signal-build, #22c55e)",
      },
      ...CATEGORY_CURRENCIES.map((c) => ({
        id: c.id,
        name: c.name,
        stock: eco.stocks?.[c.id] ?? 0,
        reserved: reserves[c.id]?.amount ?? 0,
        available: 0,
        cssVar: c.cssVar,
      })),
    ];
    // v0.5: named strategic stocks (dual-write from tick) — content-driven ids.
    for (const id of listStrategicResourceIds()) {
      if (list.some((c) => c.id === id)) continue;
      const stock = Number(eco.stocks?.[id] ?? 0);
      list.push({
        id,
        name: resourceDisplayName(id),
        stock,
        reserved: reserves[id]?.amount ?? 0,
        available: 0,
        cssVar: "var(--signal-warning, #d4a017)",
        strategic: true,
      });
    }
    for (const c of list) {
      c.available = Math.max(0, c.stock - c.reserved);
    }
    return list;
  }, [eco]);

  const stocks = eco?.stocks ?? {};
  const reserveAmounts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [id, row] of Object.entries(eco?.stockReserves ?? {})) {
      out[id] = Math.max(0, Math.floor(Number(row?.amount ?? 0) || 0));
    }
    return out;
  }, [eco?.stockReserves]);

  const ownedSystems = useMemo(() => {
    const fid = payload.factionId;
    return (payload.world?.systems ?? [])
      .filter((s) => s.ownerFactionId === fid)
      .map((s) => ({ id: s.id, name: s.name || s.id }))
      .slice(0, 12);
  }, [payload.factionId, payload.world?.systems]);

  const stockRows = useMemo(() => {
    if (!eco) return [];
    return cards.map((card) => {
      const letter = categoryLetterForCard(card.id);
      const tierFlows = letter ? flowData?.flows?.[letter] : null;
      return {
        card,
        spark: buildSparkline(eco, card.id),
        history: (eco.recent ?? [])
          .filter((r) => r.currencyId === card.id)
          .slice(0, 3)
          .map((r) => ({
            delta: r.delta,
            reason: r.reason,
            turn: r.turn,
          })),
        tierRows: buildTierStockRows(card.stock, tierFlows),
        showStockEstimate: letter != null,
        stockCap: inferWarehouseCap(flowData, letter),
      };
    });
  }, [cards, eco, flowData]);

  if (!eco) {
    return (
      <EmptyState
        title="Склад пуст"
        body={`После тика здесь появятся запасы (${CATEGORY_LEGEND}) и резервы. Постройте добычу, чтобы наполнить склад.`}
        action={
          onFocusBuild ? (
            <button
              type="button"
              className="btn sm primary"
              onClick={onFocusBuild}
            >
              К системе
            </button>
          ) : undefined
        }
      />
    );
  }

  const reserveEntries = Object.entries(eco.stockReserves ?? {}).filter(
    ([, v]) => (v?.amount ?? 0) > 0,
  );

  const tradeRowProps = {
    onConvert,
    onReserve,
    onSetAlert,
    busy,
    rates,
    stocks,
    reserves: reserveAmounts,
    reservedAp,
    apMax,
    convertAp,
  } as const;

  return (
    <div className="eco-stockpile">
      <p className="hint eco-stockpile__hint">
        Купить / Продать — мгновенный обмен здесь (шаг и лоты 25% / 50%).
        Кнопки блокируются, если не хватает ОД, УЕ или склад заполнен.
        Перетащите карточку в зону ниже — тот же обмен, без перехода на биржу.
        Стратегические (именные) ресурсы — отдельной полосой ниже категорий.
      </p>
      <ul className="eco-stock-grid" aria-label="Запасы">
        {stockRows
          .filter(({ card }) => !card.strategic)
          .map(({ card, spark, history, tierRows, showStockEstimate, stockCap }) => (
          <StockRow
            key={card.id}
            card={card}
            spark={spark}
            history={history}
            tierRows={tierRows}
            showStockEstimate={showStockEstimate}
            stockCap={stockCap}
            {...tradeRowProps}
          />
        ))}
      </ul>
      {stockRows.some(({ card }) => card.strategic) ? (
        <>
          <header className="eco-chart-block__head eco-stockpile__strategic-head">
            <h4>Стратегические</h4>
            <span className="hint">именной сток · peg · вклад в RoleScore</span>
          </header>
          <ul className="eco-stock-grid eco-stock-grid--strategic" aria-label="Стратегические запасы">
            {stockRows
              .filter(({ card }) => card.strategic)
              .map(({ card, spark, history, tierRows, showStockEstimate, stockCap }) => (
                <StockRow
                  key={card.id}
                  card={card}
                  spark={spark}
                  history={history}
                  tierRows={tierRows}
                  showStockEstimate={showStockEstimate}
                  stockCap={stockCap}
                  {...tradeRowProps}
                />
              ))}
          </ul>
        </>
      ) : null}

      <div className="eco-stock-dropzones" aria-label="Быстрые действия">
        <header className="eco-chart-block__head">
          <h4>Быстрые действия</h4>
          <span className="hint">перетащите ресурс сюда</span>
        </header>
        <ul className="eco-stock-dropzones__list eco-stock-routes">
          <li>
            <DropZone
              zoneId="stock-market"
              accepts={acceptIds}
              armWhileDragging
              className="eco-stock-dropzone"
              onDrop={(currencyId) => {
                if (!onConvert) return;
                const card = cards.find((c) => c.id === currencyId);
                if (!card) return;
                const quote = resolveQuoteCurrency(rates, currencyId);
                const amountFrom = lotAmount(card.available, 0.25) || fixedSellAmount(card.available);
                const check = validateExpressTrade({
                  side: "sell",
                  resourceId: currencyId,
                  amountFrom,
                  rates,
                  quoteCurrency: quote,
                  stocks,
                  available: card.available,
                  quoteAvailable: Math.max(
                    0,
                    Math.floor(Number(stocks[quote ?? ""] ?? 0)) -
                      (reserveAmounts[quote ?? ""] ?? 0),
                  ),
                  reservedAp,
                  apMax,
                  convertAp,
                  stockCap: inferWarehouseCap(
                    flowData,
                    categoryLetterForCard(currencyId),
                  ),
                });
                if (!check.ok) return;
                onConvert(check.fromCurrency, check.toCurrency, check.amountFrom);
              }}
            >
              <Coins size={14} style={{ marginRight: 6 }} /> Продать сейчас
            </DropZone>
          </li>
          <li>
            <DropZone
              zoneId="stock-reserve"
              accepts={acceptIds}
              armWhileDragging
              className="eco-stock-dropzone"
              onDrop={(currencyId) => {
                if (!onReserve) return;
                const card = cards.find((c) => c.id === currencyId);
                if (card) {
                  const defaultReserve = Math.max(1, Math.min(card.available, Math.ceil(card.stock * 0.25) || 1));
                  onReserve(currencyId, defaultReserve, "резерв склада");
                }
              }}
            >
              <Package size={14} style={{ marginRight: 6 }} /> В резерв
            </DropZone>
          </li>
          {ownedSystems.map((sys) => (
            <li key={sys.id}>
              <DropZone
                zoneId={`stock-system:${sys.id}`}
                accepts={acceptIds}
                armWhileDragging
                className="eco-stock-dropzone"
                onDrop={(currencyId) => {
                  const card = cards.find((c) => c.id === currencyId);
                  if (!card) return;
                  const amount = defaultCaravanAmount(card);
                  if (onDropOnSystem) onDropOnSystem(currencyId, sys.id, amount);
                  else onSendCaravan?.(currencyId, sys.id, amount);
                }}
              >
                <Truck size={14} style={{ marginRight: 6 }} /> {sys.name}
              </DropZone>
            </li>
          ))}
        </ul>
      </div>

      {reserveEntries.length > 0 && (
        <div className="eco-reserves">
          <header className="eco-chart-block__head">
            <h4>Резервы</h4>
          </header>
          <ul className="eco-reserves__list">
            {reserveEntries.map(([id, v]) => (
              <li key={id}>
                <span>{currencyShortLabel(id)}</span>
                <span className="hint">{v.label || "резерв"}</span>
                <strong className="tabular-nums">{fmtInt(v.amount)}</strong>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
