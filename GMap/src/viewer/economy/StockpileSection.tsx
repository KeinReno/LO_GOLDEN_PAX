import { useMemo, useState, type CSSProperties, type DragEvent } from "react";
import {
  BUILD_METAL,
  BUILD_SUPPLY,
  CATEGORY_CURRENCIES,
} from "../../state/economyLabels";
import type { ViewerPayload } from "../../state/types";
import { ResourceIcon } from "../../ui/ResourceIcon";
import { ActionRing } from "../../ui/ActionRing";
import { useLongPress } from "../../ui/useLongPress";
import { useDrag } from "@use-gesture/react";
import { AlertTriangle, Package, Store, Truck } from "lucide-react";
import { STOCK_DND_MIME } from "../research/constants";
import { buildSparkline, currencyShortLabel, reasonLabel } from "./chartData";
import { Sparkline } from "./components/Sparkline";
import { EmptyState } from "./components/EmptyState";
import { EcoTip } from "./components/EcoTip";
import { NumberTicker } from "./components/NumberTicker";

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
  onSell?: (currencyId: string) => void;
  onReserve?: (currencyId: string, amount: number, label?: string) => void;
  onCaravan?: (currencyId: string, systemId?: string) => void;
  onSetAlert?: (currencyId: string) => void;
  onDropOnSystem?: (currencyId: string, systemId: string) => void;
  busy?: boolean;
};

function StockRow({
  card,
  spark,
  history,
  onSell,
  onReserve,
  onCaravan,
  onSetAlert,
  busy,
}: {
  card: StockCard;
  spark: number[];
  history: { delta: number; reason: string; turn: number | null }[];
  onSell?: (id: string) => void;
  onReserve?: (id: string, amount: number, label?: string) => void;
  onCaravan?: (id: string) => void;
  onSetAlert?: (id: string) => void;
  busy?: boolean;
}) {
  const [ring, setRing] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const bindLong = useLongPress({
    onLongPress: ({ x, y }) => setRing({ x, y }),
    enabled: !busy,
  });

  const bindDrag = useDrag(
    ({ first, last, movement: [mx, my], xy: [x, y] }) => {
      if (busy) return;
      if (first) setDragging(true);
      if (last) {
        setDragging(false);
        if (Math.hypot(mx, my) > 48) {
          setRing({ x, y });
        }
      }
    },
    { filterTaps: true, pointer: { touch: true }, threshold: 8 },
  );

  const defaultReserve = Math.max(
    1,
    Math.min(card.available, Math.ceil(card.stock * 0.25) || 1),
  );

  const onHtmlDragStart = (e: DragEvent) => {
    if (busy || card.available <= 0) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData(STOCK_DND_MIME, card.id);
    e.dataTransfer.setData("text/plain", card.id);
    e.dataTransfer.effectAllowed = "copyMove";
    setDragging(true);
  };

  return (
    <>
      <li>
        <EcoTip
          content={
            <>
              <strong>{card.name}</strong>
              <div>Запас {card.stock}</div>
              {card.reserved > 0 && <div>Резерв {card.reserved}</div>}
              <div className="hint">
                Long-press / drag → действия · DnD на систему ниже
              </div>
            </>
          }
        >
          <button
            type="button"
            className={`eco-stock-card ${dragging ? "is-dragging" : ""} ${
              card.reserved > 0 ? "has-reserve" : ""
            }`}
            style={
              card.cssVar
                ? ({ "--stock-accent": card.cssVar } as CSSProperties)
                : undefined
            }
            draggable={!busy && card.available > 0}
            onDragStart={onHtmlDragStart}
            onDragEnd={() => setDragging(false)}
            {...bindLong()}
            {...bindDrag()}
          >
            <span className="eco-stock-card__icon">
              <ResourceIcon resourceId={card.id} size={18} />
            </span>
            <span className="eco-stock-card__name">{card.name}</span>
            <strong className="eco-stock-card__qty tabular-nums">
              <NumberTicker value={card.available} />
            </strong>
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
                {history[0].delta} · {reasonLabel(history[0].reason)}
              </span>
            )}
          </button>
        </EcoTip>
      </li>
      <ActionRing
        open={!!ring}
        x={ring?.x ?? 0}
        y={ring?.y ?? 0}
        onClose={() => setRing(null)}
        items={[
          {
            id: "sell",
            label: "Продать",
            icon: <Store size={14} />,
            onSelect: () => onSell?.(card.id),
          },
          {
            id: "reserve",
            label: card.reserved > 0 ? "Снять резерв" : "Резерв",
            icon: <Package size={14} />,
            onSelect: () =>
              onReserve?.(
                card.id,
                card.reserved > 0 ? 0 : defaultReserve,
                card.reserved > 0 ? undefined : "резерв склада",
              ),
          },
          {
            id: "caravan",
            label: "Караван",
            icon: <Truck size={14} />,
            onSelect: () => onCaravan?.(card.id),
          },
          {
            id: "alert",
            label: "Алерт",
            icon: <AlertTriangle size={14} />,
            onSelect: () => onSetAlert?.(card.id),
          },
        ]}
      />
    </>
  );
}

export function StockpileSection({
  payload,
  onSell,
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
        cssVar: "var(--eco-cat-d)",
      },
      {
        id: BUILD_SUPPLY.id,
        name: BUILD_SUPPLY.label,
        stock: eco.stocks?.[BUILD_SUPPLY.id] ?? 0,
        reserved: reserves[BUILD_SUPPLY.id]?.amount ?? 0,
        available: 0,
        cssVar: "var(--eco-cat-e)",
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

  if (!eco) {
    return (
      <EmptyState
        title="Склад пуст"
        body="После тика здесь появятся запасы A–F и резервы."
      />
    );
  }

  const reserveEntries = Object.entries(eco.stockReserves ?? {}).filter(
    ([, v]) => (v?.amount ?? 0) > 0,
  );

  return (
    <div className="eco-stockpile">
      <p className="hint eco-stockpile__hint">
        Long-press / drag карточки → действия. Перетащите ресурс на систему —
        караван / привязка.
      </p>
      <ul className="eco-stock-grid" aria-label="Запасы">
        {cards.map((card) => {
          const spark = buildSparkline(eco, card.id);
          const history = (eco.recent ?? [])
            .filter((r) => r.currencyId === card.id)
            .slice(0, 3)
            .map((r) => ({
              delta: r.delta,
              reason: r.reason,
              turn: r.turn,
            }));
          return (
            <StockRow
              key={card.id}
              card={card}
              spark={spark}
              history={history}
              onSell={onSell}
              onReserve={onReserve}
              onCaravan={onCaravan}
              onSetAlert={onSetAlert}
              busy={busy}
            />
          );
        })}
      </ul>

      {ownedSystems.length > 0 && (
        <div className="eco-stock-dropzones" aria-label="Сбросить на систему">
          <header className="eco-chart-block__head">
            <h4>Системы</h4>
            <span className="hint">drop зоны</span>
          </header>
          <ul className="eco-stock-dropzones__list">
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
                  {sys.name}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

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
                <strong className="tabular-nums">{v.amount}</strong>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
