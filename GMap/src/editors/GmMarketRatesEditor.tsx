import { useCallback, useEffect, useState } from "react";
import type { EconomySchema } from "../state/contentCatalog";
import { fetchContent } from "../state/contentCatalog";

type MarketRateRow = NonNullable<
  NonNullable<EconomySchema["market"]>["placeholder_rates"]
>[number];

type RatesPayload = {
  rates: MarketRateRow[];
  source: "override" | "content";
  updatedAt?: string | null;
};

function emptyRow(): MarketRateRow {
  return { pair: "", buy: 1, sell: 1, note: "" };
}

export function GmMarketRatesEditor({
  masterToken,
  onMsg,
}: {
  masterToken: string;
  onMsg: (msg: string) => void;
}) {
  const [market, setMarket] = useState<NonNullable<EconomySchema["market"]> | null>(
    null,
  );
  const [rows, setRows] = useState<MarketRateRow[]>([]);
  const [source, setSource] = useState<"override" | "content">("content");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const [contentRes, ratesRes] = await Promise.all([
        fetchContent(),
        fetch("/api/market/rates"),
      ]);
      setMarket(contentRes?.economy_schema?.market ?? null);
      if (ratesRes.ok) {
        const data = (await ratesRes.json()) as RatesPayload;
        setRows(data.rates.length > 0 ? data.rates : [emptyRow()]);
        setSource(data.source);
        setUpdatedAt(data.updatedAt ?? null);
      } else {
        const defaults =
          contentRes?.economy_schema?.market?.placeholder_rates ?? [];
        setRows(defaults.length > 0 ? [...defaults] : [emptyRow()]);
        setSource("content");
        setUpdatedAt(null);
      }
    } catch (e) {
      onMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [onMsg]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const updateRow = (index: number, patch: Partial<MarketRateRow>) => {
    setRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  };

  const addRow = () => setRows((prev) => [...prev, emptyRow()]);

  const removeRow = (index: number) => {
    setRows((prev) =>
      prev.length <= 1 ? prev : prev.filter((_, i) => i !== index),
    );
  };

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/market/rates", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Master-Token": masterToken,
        },
        body: JSON.stringify({ rates: rows }),
      });
      const data = (await res.json()) as RatesPayload & { error?: string };
      if (!res.ok) throw new Error(data.error || res.statusText);
      setRows(data.rates);
      setSource(data.source);
      setUpdatedAt(data.updatedAt ?? null);
      onMsg("Курсы рынка сохранены");
    } catch (e) {
      onMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!market) {
    return (
      <section className="hq-card market-panel">
        <h3>Рынок · курсы GM</h3>
        <p className="hint">Загрузка курсов...</p>
      </section>
    );
  }

  return (
    <section className="hq-card market-panel">
      <h3>Рынок · курсы GM</h3>
      <p className="hint">
        {market.description ??
          "Курсы задаёт GM/стол. Игроки видят эти значения на тике."}
      </p>
      <p className="hint market-stub-badge">
        {source === "override"
          ? `live override${updatedAt ? ` · ${new Date(updatedAt).toLocaleString()}` : ""}`
          : "из контента (placeholder_rates) — сохраните для live override"}
      </p>
      <table className="market-rates-table" aria-label="Редактор курсов GM">
        <thead>
          <tr>
            <th>Пара</th>
            <th>Покупка</th>
            <th>Продажа</th>
            <th>Примечание</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              <td>
                <input
                  className="market-rate-input"
                  value={row.pair}
                  onChange={(e) => updateRow(i, { pair: e.target.value })}
                  placeholder="currency.a → currency.b"
                  aria-label={`Пара ${i + 1}`}
                />
              </td>
              <td>
                <input
                  className="market-rate-input market-rate-input--num"
                  type="number"
                  min={0.01}
                  step={0.01}
                  value={row.buy ?? ""}
                  onChange={(e) =>
                    updateRow(i, { buy: Number(e.target.value) })
                  }
                  aria-label={`Покупка ${i + 1}`}
                />
              </td>
              <td>
                <input
                  className="market-rate-input market-rate-input--num"
                  type="number"
                  min={0.01}
                  step={0.01}
                  value={row.sell ?? ""}
                  onChange={(e) =>
                    updateRow(i, { sell: Number(e.target.value) })
                  }
                  aria-label={`Продажа ${i + 1}`}
                />
              </td>
              <td>
                <input
                  className="market-rate-input"
                  value={row.note ?? ""}
                  onChange={(e) => updateRow(i, { note: e.target.value })}
                  aria-label={`Примечание ${i + 1}`}
                />
              </td>
              <td>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={rows.length <= 1}
                  onClick={() => removeRow(i)}
                  aria-label={`Удалить строку ${i + 1}`}
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="market-rates-actions">
        <button type="button" className="btn ghost" onClick={addRow}>
          + Пара
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() => void save()}
        >
          Сохранить курсы
        </button>
        <button
          type="button"
          className="btn ghost"
          disabled={busy}
          onClick={() => void refresh()}
        >
          Обновить
        </button>
      </div>
    </section>
  );
}
