import { useMemo, useState } from "react";
import type { DiplomacyRelation } from "../state/types";
import { DIPLOMACY_LABELS } from "../state/defaults";
import {
  BUILD_METAL,
  BUILD_SUPPLY,
  CATEGORY_CURRENCIES,
} from "../state/economyLabels";
import { RESOURCE_META } from "../state/resourcePool.generated";
import { useSpotlight } from "../ui/aceternityFx";
import { AnimatedTooltip } from "../ui/AnimatedTooltip";
import { ResourceIcon } from "../ui/ResourceIcon";
import type { DiploDealItem, TradeAssetPool } from "./diploTradeTypes";

const BASE_CURRENCIES = [
  ...CATEGORY_CURRENCIES.map((c) => ({
    id: c.id,
    label: `${c.name} (${c.short})`,
    short: c.short,
  })),
  { id: BUILD_METAL.id, label: BUILD_METAL.label, short: BUILD_METAL.short },
  { id: BUILD_SUPPLY.id, label: BUILD_SUPPLY.label, short: BUILD_SUPPLY.short },
];

const BASE_IDS: Set<string> = new Set(BASE_CURRENCIES.map((c) => c.id));

/** High-tier / composite map materials for trade requests. */
const COMPOSITE_MATERIALS = Object.values(RESOURCE_META)
  .filter((m) => m.id.startsWith("map.") && (m.tier ?? 0) >= 3)
  .sort((a, b) => (b.tier ?? 0) - (a.tier ?? 0) || a.name.localeCompare(b.name, "ru"))
  .slice(0, 28)
  .map((m) => ({ id: m.id, label: m.name, tier: m.tier ?? 3 }));

/** Mutual only — counterparty must accept. War/embargo/break are unilateral. */
const MUTUAL_TREATIES: { id: DiplomacyRelation; short: string }[] = [
  { id: "trade", short: "Торговля" },
  { id: "nap", short: "НН" },
  { id: "research_pact", short: "Наука" },
  { id: "migration_treaty", short: "Миграция" },
  { id: "alliance", short: "Союз" },
  { id: "truce", short: "Перемирие" },
];

type PickerTab =
  | "currency"
  | "materials"
  | "forces"
  | "systems"
  | "techs"
  | "treaties";

const TABS: { id: PickerTab; label: string }[] = [
  { id: "currency", label: "Валюта" },
  { id: "materials", label: "Сырьё" },
  { id: "forces", label: "Силы" },
  { id: "systems", label: "Системы" },
  { id: "techs", label: "Тех" },
  { id: "treaties", label: "Предложить" },
];

function resourceLabel(currencyId: string): string {
  const base = BASE_CURRENCIES.find((c) => c.id === currencyId);
  if (base) return base.label;
  const meta = Object.values(RESOURCE_META).find((m) => m.id === currencyId);
  if (meta) return meta.name;
  return currencyId.replace(/^map\./, "").replace(/^currency\./, "");
}

export function diploItemLabel(
  item: DiploDealItem,
  names?: {
    fleets?: Record<string, string>;
    legions?: Record<string, string>;
    systems?: Record<string, string>;
    techs?: Record<string, string>;
  },
): string {
  switch (item.kind) {
    case "resource":
      return `${item.amount} ${resourceLabel(item.currencyId)}`;
    case "treaty":
      return DIPLOMACY_LABELS[item.treaty] ?? item.treaty;
    case "tech":
      return `Тех: ${names?.techs?.[item.techId] ?? item.techId}`;
    case "fleet":
      return `Флот: ${names?.fleets?.[item.fleetId] ?? item.fleetId}`;
    case "legion":
      return `Легион: ${names?.legions?.[item.legionId] ?? item.legionId}`;
    case "system":
      return `Система: ${names?.systems?.[item.systemId] ?? item.systemId}`;
    default:
      return "?";
  }
}

/**
 * Stylish amount sheet — presets + stepper (no grey native dropdown).
 */
function AmountSheet({
  label,
  stock,
  value,
  onChange,
  onConfirm,
  onCancel,
}: {
  label: string;
  stock?: number;
  value: number;
  onChange: (n: number) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const max = stock != null && stock > 0 ? stock : 99999;
  const presets = [10, 50, 100, 250, 500].filter((p) => p <= max);
  const clamp = (n: number) => Math.max(1, Math.min(max, Math.floor(n)));

  return (
    <div className="gc-amt-sheet" role="dialog" aria-label={`Количество · ${label}`}>
      <header className="gc-amt-sheet__head">
        <strong>{label}</strong>
        {stock != null ? (
          <span className="hint">в казне {stock}</span>
        ) : (
          <span className="hint">запрос</span>
        )}
      </header>
      <div className="gc-amt-sheet__value" aria-live="polite">
        <button
          type="button"
          className="gc-amt-step"
          disabled={value <= 1}
          onClick={() => onChange(clamp(value - 10))}
        >
          −
        </button>
        <span className="gc-amt-sheet__num">{value}</span>
        <button
          type="button"
          className="gc-amt-step"
          disabled={value >= max}
          onClick={() => onChange(clamp(value + 10))}
        >
          +
        </button>
      </div>
      <div className="gc-amt-presets" role="group" aria-label="Быстрые суммы">
        {presets.map((p) => (
          <button
            key={p}
            type="button"
            className={`gc-amt-preset ${value === p ? "on" : ""}`}
            onClick={() => onChange(p)}
          >
            {p}
          </button>
        ))}
        {stock != null && stock > 0 && (
          <button
            type="button"
            className={`gc-amt-preset ${value === stock ? "on" : ""}`}
            onClick={() => onChange(clamp(stock))}
          >
            всё
          </button>
        )}
        {stock != null && stock > 1 && (
          <button
            type="button"
            className="gc-amt-preset"
            onClick={() => onChange(clamp(Math.floor(stock / 2)))}
          >
            ½
          </button>
        )}
      </div>
      <input
        className="gc-amt-range"
        type="range"
        min={1}
        max={Math.max(1, Math.min(max, 2000))}
        value={Math.min(value, Math.max(1, Math.min(max, 2000)))}
        onChange={(e) => onChange(clamp(Number(e.target.value)))}
      />
      <div className="gc-amt-sheet__actions">
        <button type="button" className="btn ghost sm" onClick={onCancel}>
          Отмена
        </button>
        <button type="button" className="btn primary sm" onClick={onConfirm}>
          В сделку
        </button>
      </div>
    </div>
  );
}

export function TradeColumn({
  side,
  civName,
  items,
  stocks,
  assets,
  nameLookup,
  disabled,
  onRemove,
  onAdd,
}: {
  side: "you" | "them";
  civName: string;
  items: DiploDealItem[];
  stocks?: Record<string, number>;
  assets: TradeAssetPool;
  nameLookup: {
    fleets: Record<string, string>;
    legions: Record<string, string>;
    systems: Record<string, string>;
    techs: Record<string, string>;
  };
  disabled?: boolean;
  onRemove: (idx: number) => void;
  onAdd: (item: DiploDealItem) => void;
}) {
  const spot = useSpotlight();
  const [tab, setTab] = useState<PickerTab>("currency");
  const [pendingRes, setPendingRes] = useState<{
    id: string;
    label: string;
  } | null>(null);
  const [qty, setQty] = useState(100);

  const title = side === "you" ? "Вы предлагаете" : "Вы запрашиваете";
  const empty =
    side === "you"
      ? "Выберите ресурс, силы или договор"
      : "Что хотите получить взамен";

  const ownedMaterials = useMemo(() => {
    const fromStock = Object.entries(stocks ?? {})
      .filter(([id, n]) => !BASE_IDS.has(id) && Number(n) > 0)
      .map(([id, n]) => ({
        id,
        label: resourceLabel(id),
        stock: Number(n),
      }));
    const known = new Set(fromStock.map((x) => x.id));
    // For requests, also offer composite catalogue (even at 0 stock).
    const catalog =
      side === "them"
        ? COMPOSITE_MATERIALS.filter((m) => !known.has(m.id)).map((m) => ({
            id: m.id,
            label: m.label,
            stock: stocks?.[m.id] ?? 0,
          }))
        : [];
    return [...fromStock, ...catalog];
  }, [stocks, side]);

  const openAmount = (id: string, label: string) => {
    const stock = stocks?.[id];
    const start =
      stock != null && stock > 0
        ? Math.min(100, Math.max(1, Math.floor(stock)))
        : 100;
    setQty(start);
    setPendingRes({ id, label });
  };

  const confirmAmount = () => {
    if (!pendingRes) return;
    onAdd({
      kind: "resource",
      currencyId: pendingRes.id,
      amount: Math.max(1, Math.floor(qty)),
    });
    setPendingRes(null);
  };

  return (
    <div
      className={`gc-trade-col gc-trade-col--${side} fx-spotlight`}
      {...spot.bind}
    >
      <header className="gc-trade-col__head">
        <div>
          <h4>{title}</h4>
          <span className="gc-trade-col__civ">{civName}</span>
        </div>
      </header>

      <ul className="gc-trade-col__items">
        {items.length === 0 ? (
          <li className="gc-trade-col__empty hint">{empty}</li>
        ) : (
          items.map((item, i) => (
            <li key={`${item.kind}-${i}`} className="gc-trade-item">
              <span>{diploItemLabel(item, nameLookup)}</span>
              <button
                type="button"
                className="gc-trade-item__x"
                aria-label="Убрать"
                disabled={disabled}
                onClick={() => onRemove(i)}
              >
                ×
              </button>
            </li>
          ))
        )}
      </ul>

      {pendingRes ? (
        <AmountSheet
          label={pendingRes.label}
          stock={side === "you" ? stocks?.[pendingRes.id] : undefined}
          value={qty}
          onChange={setQty}
          onConfirm={confirmAmount}
          onCancel={() => setPendingRes(null)}
        />
      ) : (
        <div className="gc-trade-col__pickers">
          <div className="gc-trade-tabs anim-tabs" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className={tab === t.id ? "on" : ""}
                disabled={disabled}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "currency" && (
            <div className="gc-trade-chips" role="group" aria-label="Валюта">
              {BASE_CURRENCIES.map((c) => {
                const stock = stocks?.[c.id] ?? 0;
                return (
                  <AnimatedTooltip
                    key={c.id}
                    content={`${c.label} · ${stock}`}
                  >
                    <button
                      type="button"
                      className="gc-trade-chip"
                      disabled={disabled || (side === "you" && stock <= 0)}
                      onClick={() => openAmount(c.id, c.label)}
                    >
                      <ResourceIcon
                        resourceId={c.id}
                        stocks={stocks}
                        size={14}
                      />
                      <span>{c.short}</span>
                      <span className="gc-trade-chip__qty">{stock}</span>
                    </button>
                  </AnimatedTooltip>
                );
              })}
            </div>
          )}

          {tab === "materials" && (
            <div className="gc-trade-chips gc-trade-chips--wrap" role="group">
              {ownedMaterials.length === 0 ? (
                <p className="hint">
                  {side === "you"
                    ? "Нет составных материалов в казне."
                    : "Каталог составных пуст."}
                </p>
              ) : (
                ownedMaterials.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className="gc-trade-chip gc-trade-chip--wide"
                    disabled={disabled || (side === "you" && m.stock <= 0)}
                    title={m.id}
                    onClick={() => openAmount(m.id, m.label)}
                  >
                    <span>{m.label}</span>
                    <span className="gc-trade-chip__qty">{m.stock}</span>
                  </button>
                ))
              )}
            </div>
          )}

          {tab === "forces" && (
            <div className="gc-trade-asset-list">
              <span className="gc-trade-col__picker-label">Флоты</span>
              {assets.fleets.length === 0 ? (
                <p className="hint">Нет флотов</p>
              ) : (
                assets.fleets.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className="gc-trade-asset-btn"
                    disabled={disabled}
                    onClick={() => onAdd({ kind: "fleet", fleetId: f.id })}
                  >
                    {f.name}
                  </button>
                ))
              )}
              <span className="gc-trade-col__picker-label">Легионы</span>
              {assets.legions.length === 0 ? (
                <p className="hint">Нет легионов</p>
              ) : (
                assets.legions.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    className="gc-trade-asset-btn"
                    disabled={disabled}
                    onClick={() => onAdd({ kind: "legion", legionId: l.id })}
                  >
                    {l.name}
                  </button>
                ))
              )}
            </div>
          )}

          {tab === "systems" && (
            <div className="gc-trade-asset-list">
              {assets.systems.length === 0 ? (
                <p className="hint">Нет систем для передачи</p>
              ) : (
                assets.systems.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="gc-trade-asset-btn"
                    disabled={disabled}
                    onClick={() => onAdd({ kind: "system", systemId: s.id })}
                  >
                    {s.name}
                  </button>
                ))
              )}
            </div>
          )}

          {tab === "techs" && (
            <div className="gc-trade-asset-list">
              {assets.techs.length === 0 ? (
                <p className="hint">Нет передаваемых технологий</p>
              ) : (
                assets.techs.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className="gc-trade-asset-btn"
                    disabled={disabled}
                    onClick={() => onAdd({ kind: "tech", techId: t.id })}
                  >
                    {t.name}
                  </button>
                ))
              )}
            </div>
          )}

          {tab === "treaties" && (
            <div className="gc-trade-treaties">
              <p className="hint gc-trade-treaties__hint">
                Эти договоры уйдут как предложение — вторая сторона должна
                принять.
              </p>
              <div className="gc-trade-chips" role="group">
                {MUTUAL_TREATIES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className="gc-trade-chip"
                    disabled={disabled}
                    title={DIPLOMACY_LABELS[t.id]}
                    onClick={() => onAdd({ kind: "treaty", treaty: t.id })}
                  >
                    {t.short}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
