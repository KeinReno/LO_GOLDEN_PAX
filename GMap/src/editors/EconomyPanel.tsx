import { useCallback, useEffect, useState } from "react";
import { useWorldStore } from "../state/worldStore";
import { useCampaignSessionCtx } from "./CampaignSessionContext";

type EcoFaction = {
  factionId: string;
  stocks: Record<string, number>;
  taxes: Record<string, string>;
  pendingPolicy?: { taxes?: Record<string, string> };
  pressure: number;
  deficit: string;
};

type LedgerPayload = {
  factions: Record<string, EcoFaction>;
  entries: { factionId: string; currencyId: string; delta: number; reason?: string; turn?: number }[];
};

export function EconomyPanel() {
  const world = useWorldStore((s) => s.world);
  const activeFactionId = useWorldStore((s) => s.activeFactionId);
  const { masterToken, setSyncMsg } = useCampaignSessionCtx();
  const [ledger, setLedger] = useState<LedgerPayload | null>(null);
  const [taxDefs, setTaxDefs] = useState<Record<string, { name: string; tiers: { id: string; label: string }[] }>>({});
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const [ledRes, contentRes] = await Promise.all([
        fetch("/api/ledger", { headers: { "X-Master-Token": masterToken } }),
        fetch("/api/content"),
      ]);
      if (!ledRes.ok) throw new Error(await ledRes.text());
      const led = (await ledRes.json()) as LedgerPayload;
      setLedger(led);
      if (contentRes.ok) {
        const c = await contentRes.json();
        setTaxDefs(c.taxes || {});
      }
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [masterToken, setSyncMsg]);

  useEffect(() => {
    void refresh();
  }, [refresh, world.meta.turn, world.meta.tableRevision]);

  const queueTax = async (factionId: string, taxSlot: string, tierId: string) => {
    try {
      const res = await fetch("/api/economy/set-tax", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Master-Token": masterToken,
        },
        body: JSON.stringify({
          factionId,
          taxSlot,
          tierId,
          direct: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      setSyncMsg(`Налог ${taxSlot} → ${tierId} (со след. тика)`);
      void refresh();
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : String(e));
    }
  };

  const facId = activeFactionId ?? world.factions[0]?.id;
  const eco = facId && ledger?.factions?.[facId];

  return (
    <section>
      <h3>Держава · экономика</h3>
      <p className="hint">
        Stocks / налоги / дефицит. Доход и pop считаются на тике хода.
      </p>
      <button
        type="button"
        className="btn ghost"
        disabled={busy}
        onClick={() => void refresh()}
      >
        Обновить казну
      </button>
      {!eco ? (
        <p className="hint">Нет данных — сделайте тик или обновите.</p>
      ) : (
        <div className="order-card" style={{ marginTop: 8 }}>
          <div>
            <strong>
              {world.factions.find((f) => f.id === facId)?.name ?? facId}
            </strong>
            <br />
            <span className="hint">
              дефицит: {eco.deficit} · давление: {eco.pressure}
            </span>
          </div>
          <ul className="hint" style={{ paddingLeft: 16 }}>
            {Object.entries(eco.stocks || {}).map(([k, v]) => (
              <li key={k}>
                {k.replace("currency.", "")}: {v}
              </li>
            ))}
          </ul>
          {Object.entries(taxDefs).map(([slot, def]) => (
            <label key={slot} className="field" style={{ marginTop: 6 }}>
              <span>
                {def.name}{" "}
                {eco.pendingPolicy?.taxes?.[slot]
                  ? `(ожидает: ${eco.pendingPolicy.taxes[slot]})`
                  : ""}
              </span>
              <select
                value={eco.taxes?.[slot] ?? "none"}
                onChange={(e) => void queueTax(facId!, slot, e.target.value)}
              >
                {(def.tiers || []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      )}
      {ledger && (
        <div style={{ marginTop: 10 }}>
          <div className="block-title">Все фракции</div>
          {world.factions.map((f) => {
            const e = ledger.factions[f.id];
            if (!e) return null;
            return (
              <p key={f.id} className="hint">
                <span style={{ color: f.color }}>{f.name}</span>: metal{" "}
                {e.stocks?.["currency.metal"] ?? "—"} · supply{" "}
                {e.stocks?.["currency.supply"] ?? "—"} · {e.deficit}
              </p>
            );
          })}
        </div>
      )}
    </section>
  );
}
