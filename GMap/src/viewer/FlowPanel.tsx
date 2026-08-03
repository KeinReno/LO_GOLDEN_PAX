import { useCallback, useEffect, useState } from "react";
import { CATEGORY_CURRENCIES } from "../state/economyLabels";

/**
 * 6-category flow panel (new economy model).
 * Shows per-category flow totals (rate/demand/net) + tier breakdown + bottleneck highlights.
 * Fetches /api/economy/flows?factionId=...
 * Pass compact for HQ embed (totals + bottlenecks only).
 */
type FlowCell = {
  rate: number;
  demand: number;
  capacity: number;
  capped: number;
  net: number;
  deficit: number;
  surplus: number;
};

type FlowMatrix = Record<string, Record<string, FlowCell>>;

type FlowBreakdown = {
  flows: FlowMatrix;
  totals: Record<string, { rate: number; demand: number; net: number }>;
  bottlenecks: Record<string, { tier: number; deficit: number }>;
  categories: string[];
};

const CATEGORY_META: Record<
  string,
  { name: string; role: string; color: string }
> = Object.fromEntries(
  CATEGORY_CURRENCIES.map((c) => [
    c.letter,
    { name: c.name, role: c.role, color: c.cssVar },
  ]),
);

const TIERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export function FlowPanel({
  factionId,
  compact,
}: {
  factionId: string;
  compact?: boolean;
}) {
  const [data, setData] = useState<FlowBreakdown | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!factionId) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/economy/flows?factionId=${encodeURIComponent(factionId)}`);
      if (!res.ok) throw new Error(await res.text());
      setData((await res.json()) as FlowBreakdown);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [factionId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (err) {
    return (
      <div className={`flow-panel ${compact ? "flow-panel--compact" : ""}`}>
        <p className="hint" style={{ color: "var(--danger)" }}>
          Flow: {err}
        </p>
      </div>
    );
  }
  if (!data && busy) {
    return (
      <div className={`flow-panel ${compact ? "flow-panel--compact" : ""}`}>
        <p className="hint">Загрузка потоков…</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className={`flow-panel ${compact ? "flow-panel--compact" : ""}`}>
        <p className="hint">Потоки недоступны</p>
      </div>
    );
  }

  const bn = data.bottlenecks || {};
  const bnCount = Object.keys(bn).length;

  if (compact) {
    return (
      <div className="flow-panel flow-panel--compact">
        <div className="flow-panel-head">
          <h3>Потоки</h3>
          <button
            type="button"
            className="btn ghost"
            onClick={() => void refresh()}
            disabled={busy}
            aria-label="Обновить потоки"
          >
            {busy ? "…" : "↻"}
          </button>
        </div>
        {bnCount > 0 && (
          <p className="hint flow-bn-summary">
            Узких мест: <strong style={{ color: "var(--danger)" }}>{bnCount}</strong>
            {Object.entries(bn)
              .slice(0, 3)
              .map(([cat, b]) => (
                <span key={cat} className="flow-bn-chip" style={{ color: CATEGORY_META[cat]?.color }}>
                  {CATEGORY_META[cat]?.name || cat} T{b.tier}
                </span>
              ))}
          </p>
        )}
        <div className="flow-compact-grid">
          {data.categories.map((cat) => {
            const meta = CATEGORY_META[cat] || { name: cat, role: "", color: "var(--muted)" };
            const total = data.totals[cat] || { rate: 0, demand: 0, net: 0 };
            const isBn = !!bn[cat];
            return (
              <div
                key={cat}
                className={`flow-compact-cell ${isBn ? "is-bn" : ""}`}
                style={{ borderLeftColor: meta.color }}
                title={`${meta.name}: +${total.rate} / −${total.demand}`}
              >
                <span className="flow-compact-cat" style={{ color: meta.color }}>
                  {cat}
                </span>
                <strong
                  className={total.net >= 0 ? "eco-up" : "eco-down"}
                >
                  {total.net >= 0 ? "+" : ""}
                  {total.net}
                </strong>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="flow-panel">
      <div className="flow-panel-head">
        <h3>ПОТОКИ (6×10×RPS)</h3>
        <button
          type="button"
          className="btn ghost"
          onClick={() => void refresh()}
          disabled={busy}
        >
          {busy ? "…" : "↻"}
        </button>
      </div>

      {bnCount > 0 && (
        <div className="flow-bn-banner">
          <strong style={{ color: "var(--danger)" }}>Узкие места:</strong>{" "}
          {Object.entries(bn).map(([cat, b]) => (
            <span key={cat} className="flow-bn-chip">
              <span style={{ color: CATEGORY_META[cat]?.color }}>
                {CATEGORY_META[cat]?.name || cat}
              </span>{" "}
              <span style={{ color: "var(--danger)" }}>
                T{b.tier} −{b.deficit}
              </span>
            </span>
          ))}
        </div>
      )}

      <div className="flow-cat-list">
        {data.categories.map((cat) => {
          const meta = CATEGORY_META[cat] || {
            name: cat,
            role: "",
            color: "var(--muted)",
          };
          const total = data.totals[cat] || { rate: 0, demand: 0, net: 0 };
          const isBottleneck = !!bn[cat];
          return (
            <div
              key={cat}
              className={`flow-cat-card ${isBottleneck ? "is-bn" : ""}`}
              style={{
                borderColor: `${meta.color}`,
                borderLeftColor: meta.color,
              }}
            >
              <div className="flow-cat-head">
                <span style={{ color: meta.color }}>
                  {cat} — {meta.name}
                </span>
                <span className="hint">{meta.role}</span>
              </div>
              <div className="flow-cat-totals">
                <span>
                  приток: <span className="eco-up">+{total.rate}</span>
                </span>
                <span>
                  спрос: <span style={{ color: "var(--eco-cat-d)" }}>−{total.demand}</span>
                </span>
                <span>
                  итог:{" "}
                  <strong className={total.net >= 0 ? "eco-up" : "eco-down"}>
                    {total.net >= 0 ? "+" : ""}
                    {total.net}
                  </strong>
                </span>
              </div>
              <TierStrip
                matrix={data.flows}
                cat={cat}
                color={meta.color}
                bottleneckTier={bn[cat]?.tier}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TierStrip({
  matrix,
  cat,
  color,
  bottleneckTier,
}: {
  matrix: FlowMatrix;
  cat: string;
  color: string;
  bottleneckTier?: number;
}) {
  const cells = TIERS.map((t) => {
    const c = matrix[cat]?.[String(t)];
    return { t, c: c as FlowCell | undefined };
  });
  return (
    <div className="flow-tier-strip">
      {cells.map(({ t, c }) => {
        const active = c && (c.rate > 0 || c.demand > 0);
        const isBn = bottleneckTier === t && c && c.deficit > 0;
        return (
          <div
            key={t}
            title={`T${t}: rate=${c?.rate ?? 0} demand=${c?.demand ?? 0} net=${c?.net ?? 0}`}
            className={`flow-tier-cell ${isBn ? "is-bn" : ""} ${active ? "is-active" : ""}`}
            style={
              active && !isBn
                ? { background: `color-mix(in srgb, ${color} 20%, transparent)`, color }
                : undefined
            }
          >
            {t}
          </div>
        );
      })}
    </div>
  );
}
