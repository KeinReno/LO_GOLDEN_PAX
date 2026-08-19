import { useCallback, useEffect, useState } from "react";
import {
  economyDeficitLabel,
  resolveResourceOrCurrencyLabel,
} from "../state/displayLabels";
import { BUILD_METAL, BUILD_SUPPLY } from "../state/economyLabels";
import { isCraftedModule } from "../state/resourceIndex";
import { useWorldStore } from "../state/worldStore";
import { useCampaignSessionCtx } from "./CampaignSessionContext";
import { FlowPanel } from "../viewer/FlowPanel";
import { GmMarketRatesEditor } from "./GmMarketRatesEditor";
import { GmEffectAudit } from "./gm/GmEffectAudit";

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

export function GmLedgerPanel() {
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
      <p className="hint">Запасы и налоги выбранной державы. Доход — на тике.</p>
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
              дефицит: {economyDeficitLabel(eco.deficit)} · давление:{" "}
              {eco.pressure}
            </span>
          </div>
          <ul className="hint" style={{ paddingLeft: 16 }}>
            {Object.entries(eco.stocks || {})
              .filter(([k]) => !isCraftedModule({ id: k }))
              .map(([k, v]) => (
              <li key={k}>
                {resolveResourceOrCurrencyLabel(k)}: {v}
              </li>
            ))}
          </ul>
          {Object.entries(taxDefs)
            .filter(([, def]) => !(def as { hidden?: boolean }).hidden)
            .map(([slot, def]) => (
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
      {ledger && (() => {
        const rows = world.factions
          .map((f) => {
            const e = ledger.factions[f.id];
            if (!e) return null;
            return { f, e };
          })
          .filter((row): row is { f: (typeof world.factions)[number]; e: EcoFaction } => row != null);
        const troubled = rows.filter(
          (r) => r.e.deficit === "empty" || r.e.deficit === "low",
        );
        return (
          <details className="gm-ledger-all" style={{ marginTop: 10 }}>
            <summary className="block-title">
              Все фракции · {troubled.length} с дефицитом
            </summary>
            {rows.map(({ f, e }) => (
              <p key={f.id} className="hint">
                <span style={{ color: f.color }}>{f.name}</span>:{" "}
                {BUILD_METAL.label}{" "}
                {e.stocks?.[BUILD_METAL.id] ?? "—"} · {BUILD_SUPPLY.label}{" "}
                {e.stocks?.[BUILD_SUPPLY.id] ?? "—"} ·{" "}
                {economyDeficitLabel(e.deficit)}
              </p>
            ))}
          </details>
        );
      })()}

      {facId && (
        <details className="gm-ledger-more" style={{ marginTop: 12 }}>
          <summary className="block-title">Потоки</summary>
          <FlowPanel factionId={facId} masterToken={masterToken} />
        </details>
      )}

      <details className="gm-ledger-more" style={{ marginTop: 10 }}>
        <summary className="block-title">Рынок</summary>
        <GmMarketRatesEditor masterToken={masterToken} onMsg={setSyncMsg} />
      </details>

      <details className="gm-ledger-more" style={{ marginTop: 10 }}>
        <summary className="block-title">Аудит эффектов</summary>
        <GmEffectAudit compact />
      </details>
    </section>
  );
}
