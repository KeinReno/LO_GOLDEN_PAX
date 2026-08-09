import {
  memo,
  useMemo,
  useState,
  useRef,
  useCallback,
  type CSSProperties,
  type DragEvent,
} from "react";
import {
  BUILD_METAL,
  BUILD_SUPPLY,
  CATEGORY_CURRENCIES,
} from "../../state/economyLabels";
import type { ViewerPayload } from "../../state/types";
import { ResourceIcon } from "../../ui/ResourceIcon";
import { ActionRing } from "../../ui/ActionRing";
import { useLongPress } from "../../ui/useLongPress";
import { AlertTriangle, ChevronDown, Package, Store, Truck } from "lucide-react";
import { STOCK_DND_MIME } from "../research/constants";
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

type StockCard = {
  id: string;
  name: string;
  stock: number;
  reserved: number;
  available: number;
  cssVar?: string;
};

type Props = {
  payload: ViewerPayload;
  flowData?: EconomyFlowBreakdown | null;
  onConvert?: (fromCurrency: string, toCurrency: string, amountFrom: number) => void;
  /** Open Market common tab with quick-sell preselect for this currency. */
  onSellToMarket?: (currencyId: string) => void;
  onReserve?: (currencyId: string, amount: number, label?: string) => void;
  onCaravan?: (currencyId: string, systemId?: string) => void;
  onSetAlert?: (currencyId: string) => void;
  onDropOnSystem?: (currencyId: string, systemId: string) => void;
  busy?: boolean;
};

function categoryLetterForCard(cardId: string): string | null {
  return CATEGORY_CURRENCIES.find((c) => c.id === cardId)?.letter ?? null;
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
  onCaravan,
  onSetAlert,
  busy,
}: {
  card: StockCard;
  spark: number[];
  history: { delta: number; reason: string; turn: number | null }[];
  tierRows: TierStockRow[];
  showStockEstimate: boolean;
  onConvert?: (fromCurrency: string, toCurrency: string, amountFrom: number) => void;
  onReserve?: (id: string, amount: number, label?: string) => void;
  onCaravan?: (id: string) => void;
  onSetAlert?: (id: string) => void;
  busy?: boolean;
}) {
  const dragRef = useRef<HTMLDivElement>(null);
  const [ring, setRing] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const tierPanelId = `eco-stock-tiers-${card.id.replace(/\./g, "-")}`;

  const openRing = useCallback((x: number, y: number) => {
    setRing({ x, y });
  }, []);

  const bindLong = useLongPress({
    onLongPress: ({ x, y }) => {
      if (dragging) return;
      requestAnimationFrame(() => openRing(x, y));
    },
    enabled: !busy && !dragging,
    pointerCapture: false,
  });

  const defaultReserve = Math.max(
    1,
    Math.min(card.available, Math.ceil(card.stock * 0.25) || 1),
  );

  const doReserve = () =>
    onReserve?.(
      card.id,
      card.reserved > 0 ? 0 : defaultReserve,
      card.reserved > 0 ? undefined : "резерв склада",
    );

  const onHtmlDragStart = (e: DragEvent) => {
    if (busy || card.available <= 0) {
      e.preventDefault();
      return;
    }
    setRing(null);
    e.dataTransfer.setData(STOCK_DND_MIME, card.id);
    e.dataTransfer.setData("text/plain", card.id);
    e.dataTransfer.effectAllowed = "copyMove";
    setDragging(true);
  };

    const doSell = () => {
      onConvert?.(card.id, BUILD_METAL.id, Math.min(10, card.available));
    };

    const doBuy = () => {
      onConvert?.(BUILD_METAL.id, card.id, 5); // 5 metal to buy this
    };

    const ringItems = useMemo(
      () => [
        {
          id: "buy",
          label: "Купить",
          icon: <Store size={14} />,
          onSelect: doBuy,
        },
        {
          id: "sell",
          label: "Продать",
          icon: <Store size={14} />,
          onSelect: doSell,
        },
      {
        id: "reserve",
        label: card.reserved > 0 ? "Снять резерв" : "Резерв",
        icon: <Package size={14} />,
        onSelect: doReserve,
      },
      {
        id: "caravan",
        label: "Караван",
        icon: <Truck size={14} />,
        onSelect: () => onCaravan?.(card.id),
      },
      {
        id: "alert",
        label: isStockAlertOn(card.id)
          ? "Не следить"
          : "Следить за запасом",
        icon: <AlertTriangle size={14} />,
        onSelect: () => onSetAlert?.(card.id),
      },
    ],
    [
      card.id,
      card.reserved,
      defaultReserve,
      doBuy,
      doSell,
      onReserve,
      onCaravan,
      onSetAlert,
    ],
  );

  return (
    <>
      <li>
        <div
          className={`eco-stock-card ${dragging ? "is-dragging" : ""} ${
            card.reserved > 0 ? "has-reserve" : ""
          }`}
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
                  Кнопки справа — действия. Удерживайте карточку — кольцо.
                  Перетащите на систему ниже. Стрелка слева — тиры T1–T10.
                </div>
              </>
            }
          >
            <div
              ref={dragRef}
              className="eco-stock-card__main"
              draggable={!busy && card.available > 0}
              onDragStart={onHtmlDragStart}
              onDragEnd={() => setDragging(false)}
              {...bindLong()}
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
            </div>
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
            <button
              type="button"
              className="eco-stock-card__btn"
              disabled={busy || card.id === BUILD_METAL.id}
              title="Купить за металл"
              onClick={doBuy}
            >
              <Store size={14} strokeWidth={2} aria-hidden />
              <span>Купить</span>
            </button>
            <button
              type="button"
              className="eco-stock-card__btn"
              disabled={busy || card.available <= 0 || card.id === BUILD_METAL.id}
              title="Продать за металл"
              onClick={doSell}
            >
              <Store size={14} strokeWidth={2} aria-hidden />
              <span>Продать</span>
            </button>
            <button
              type="button"
              className="eco-stock-card__btn"
              disabled={busy || (card.reserved <= 0 && card.available <= 0)}
              title={card.reserved > 0 ? "Снять резерв" : "Зарезервировать"}
              onClick={doReserve}
            >
              <Package size={14} strokeWidth={2} aria-hidden />
              <span>{card.reserved > 0 ? "Снять" : "Резерв"}</span>
            </button>
            <button
              type="button"
              className="eco-stock-card__btn"
              disabled={busy}
              title="Следить за запасом"
              onClick={() => onSetAlert?.(card.id)}
            >
              <AlertTriangle size={14} strokeWidth={2} aria-hidden />
              <span>Следить</span>
            </button>
          </div>
        </div>
      </li>
      <ActionRing
        open={!!ring}
        x={ring?.x ?? 0}
        y={ring?.y ?? 0}
        onClose={() => setRing(null)}
        items={ringItems}
      />
    </>
  );
});

export function StockpileSection({
  payload,
  flowData,
  onConvert,
  onSellToMarket,
  onReserve,
  onCaravan,
  onSetAlert,
  onDropOnSystem,
  busy,
}: Props) {
  const eco = payload.economy;
  const [dropHover, setDropHover] = useState<string | null>(null);

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
    for (const c of list) {
      c.available = Math.max(0, c.stock - c.reserved);
    }
    return list;
  }, [eco]);

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
      };
    });
  }, [cards, eco, flowData]);

  if (!eco) {
    return (
      <EmptyState
        title="Склад пуст"
        body={`После тика здесь появятся запасы (${CATEGORY_LEGEND}) и резервы.`}
      />
    );
  }

  const reserveEntries = Object.entries(eco.stockReserves ?? {}).filter(
    ([, v]) => (v?.amount ?? 0) > 0,
  );

  return (
    <div className="eco-stockpile">
      <p className="hint eco-stockpile__hint">
        Стрелка на карточке — развернуть тиры T1–T10. Кнопки — действия.
        Удерживайте — кольцо. Перетащите на систему ниже — открыть систему.
      </p>
      <ul className="eco-stock-grid" aria-label="Запасы">
        {stockRows.map(({ card, spark, history, tierRows, showStockEstimate }) => (
          <StockRow
            key={card.id}
            card={card}
            spark={spark}
            history={history}
            tierRows={tierRows}
            showStockEstimate={showStockEstimate}
            onConvert={onConvert}
            onReserve={onReserve}
            onCaravan={onCaravan}
            onSetAlert={onSetAlert}
            busy={busy}
          />
        ))}
      </ul>

      <div className="eco-stock-dropzones" aria-label="Быстрые действия">
        <header className="eco-chart-block__head">
          <h4>Быстрые действия</h4>
          <span className="hint">перетащите ресурс сюда</span>
        </header>
        <ul className="eco-stock-dropzones__list">
          <li>
            <div
              className={`eco-stock-dropzone ${dropHover === 'market' ? 'is-hover' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "copy";
                setDropHover('market');
              }}
              onDragLeave={() => setDropHover((h) => (h === 'market' ? null : h))}
              onDrop={(e) => {
                e.preventDefault();
                setDropHover(null);
                const currencyId = e.dataTransfer.getData(STOCK_DND_MIME) || e.dataTransfer.getData("text/plain");
                if (!currencyId) return;
                if (onSellToMarket) {
                  onSellToMarket(currencyId);
                  return;
                }
                if (onConvert) {
                  const card = cards.find(c => c.id === currencyId);
                  if (card) {
                    onConvert(currencyId, BUILD_METAL.id, Math.min(10, card.available));
                  }
                }
              }}
            >
              <Store size={14} style={{ marginRight: 6 }} /> Продать на бирже
            </div>
          </li>
          <li>
            <div
              className={`eco-stock-dropzone ${dropHover === 'reserve' ? 'is-hover' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "copy";
                setDropHover('reserve');
              }}
              onDragLeave={() => setDropHover((h) => (h === 'reserve' ? null : h))}
              onDrop={(e) => {
                e.preventDefault();
                setDropHover(null);
                const currencyId = e.dataTransfer.getData(STOCK_DND_MIME) || e.dataTransfer.getData("text/plain");
                if (currencyId && onReserve) {
                  const card = cards.find(c => c.id === currencyId);
                  if (card) {
                    const defaultReserve = Math.max(1, Math.min(card.available, Math.ceil(card.stock * 0.25) || 1));
                    onReserve(currencyId, defaultReserve, "резерв склада");
                  }
                }
              }}
            >
              <Package size={14} style={{ marginRight: 6 }} /> В резерв
            </div>
          </li>
          {ownedSystems.map((sys) => (
            <li key={sys.id}>
              <div
                className={`eco-stock-dropzone ${
                  dropHover === sys.id ? "is-hover" : ""
                }`}
                onDragOver={(e) => {
                  const types = Array.from(e.dataTransfer.types || []);
                  if (
                    types.includes(STOCK_DND_MIME) ||
                    types.includes("text/plain")
                  ) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "copy";
                    setDropHover(sys.id);
                  }
                }}
                onDragLeave={() =>
                  setDropHover((h) => (h === sys.id ? null : h))
                }
                onDrop={(e) => {
                  e.preventDefault();
                  setDropHover(null);
                  const currencyId =
                    e.dataTransfer.getData(STOCK_DND_MIME) ||
                    e.dataTransfer.getData("text/plain");
                  if (!currencyId?.startsWith("currency.")) return;
                  if (onDropOnSystem) onDropOnSystem(currencyId, sys.id);
                  else onCaravan?.(currencyId, sys.id);
                }}
              >
                <Truck size={14} style={{ marginRight: 6 }} /> {sys.name}
              </div>
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
