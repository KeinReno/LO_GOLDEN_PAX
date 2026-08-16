import { useCallback, useEffect, useState } from "react";
import { useCampaignSessionCtx } from "../CampaignSessionContext";
import { fetchContent } from "../../state/contentCatalog";
import { InterventionsSection, PowerTouchSection, PegMultiplierSection } from "./GmHealthExtras";

type CostRow = Record<string, number>;

type EarlyBuilding = {
  id: string;
  name: string;
  tier: number | null;
  cost: Record<string, number> | null;
};

type BalanceSnapshot = {
  ap: {
    empirePerTurn?: number;
    force?: { base?: number; perFleet?: number; perLegion?: number; max?: number };
  } | null;
  rulesAp: {
    apPerTurn?: number | null;
    forceAp?: { base?: number; max?: number } | null;
  };
  start: {
    stocks?: Record<string, number>;
  } | null;
  freeBuildTier: number | null;
  metalByTier: Record<string, number> | null;
  forces: {
    shipCostMult: number | null;
    unitCostMult: number | null;
    supplyRatio: number | null;
  };
  counts: { buildings: number; ships: number; units: number; stations: number };
  earlyBuildings: EarlyBuilding[];
  sampleCosts: Record<string, CostRow>;
  alchemy?: {
    attemptsPerTurn?: number;
    baseCost?: number;
    eraGapCost?: number;
    maxSameEraSpend?: number;
  };
  cardBattle?: {
    handSize?: number | null;
    maxRounds?: number | null;
    energyPerRound?: number | null;
    trophies?: Record<string, number> | null;
    note?: string | null;
  };
  techMarket?: {
    bazaars?: number;
    listings?: number;
    sample?: Array<{
      id: string;
      price: CostRow;
      techId?: string | null;
      recipeId?: string | null;
    }>;
  };
  spec: string;
};

function fmtCost(cost: Record<string, number> | null | undefined): string {
  if (!cost) return "—";
  const metal = cost["currency.metal"];
  const supply = cost["currency.supply"];
  const parts: string[] = [];
  if (metal != null) parts.push(`M ${metal}`);
  if (supply != null) parts.push(`S ${supply}`);
  return parts.length ? parts.join(" · ") : JSON.stringify(cost);
}

function stockLabel(id: string): string {
  const short = id.replace("currency.", "");
  const labels: Record<string, string> = {
    metal: "металл",
    supply: "снабжение",
    cognitio: "когнитио",
  };
  return labels[short] ?? short;
}

/** GM quick balance — snapshot + discrete nudges (master token). */
export function GmBalancePanel() {
  const { masterToken, setSyncMsg } = useCampaignSessionCtx();
  const [snap, setSnap] = useState<BalanceSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/gm/balance/snapshot", {
        headers: { "X-Master-Token": masterToken },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || res.statusText);
      }
      setSnap((await res.json()) as BalanceSnapshot);
      setErr("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [masterToken]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const patch = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      const res = await fetch("/api/gm/balance/patch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Master-Token": masterToken,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      if (data.snapshot) setSnap(data.snapshot as BalanceSnapshot);
      await fetchContent(true);
      setSyncMsg(`Баланс: ${body.action}`);
      setErr("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg);
      setSyncMsg(msg);
    } finally {
      setBusy(false);
    }
  };

  const stocks = snap?.start?.stocks ?? {};
  const empireAp =
    snap?.ap?.empirePerTurn ?? snap?.rulesAp?.apPerTurn ?? null;
  const forceAp = snap?.ap?.force ?? snap?.rulesAp?.forceAp ?? null;

  return (
    <div className="gm-balance">
      <div className="gmsys-row" style={{ marginBottom: 8, flexWrap: "wrap", gap: 6 }}>
        <button
          type="button"
          className="btn ghost"
          disabled={busy}
          onClick={() => void refresh()}
        >
          Обновить
        </button>
        <button
          type="button"
          className="btn ghost"
          disabled={busy}
          onClick={() => void patch({ action: "reloadContent" })}
        >
          Перезагрузить контент
        </button>
        <span className="hint" title="Спека базового баланса (репозиторий)">
          {snap?.spec ?? "docs/BALANCE_BASELINE_SPEC.md"}
        </span>
      </div>

      {err && <p className="gmsys-error">{err}</p>}
      {!snap && !err && <p className="hint">Загрузка снимка…</p>}

      {snap && (
        <>
          <div className="gm-atelier-knobs">
            <h5>ОД и старт</h5>
            <ul className="gm-atelier-kv">
              <li>
                <span>Имперские ОД / ход</span>
                <strong className="tabular">{empireAp ?? "—"}</strong>
              </li>
              <li>
                <span>ОД сил (base / max)</span>
                <strong className="tabular">
                  {forceAp?.base ?? "—"} / {forceAp?.max ?? "—"}
                </strong>
              </li>
              <li>
                <span>freeBuildTier</span>
                <strong className="tabular">{snap.freeBuildTier ?? "—"}</strong>
              </li>
              {(["currency.metal", "currency.supply", "currency.cognitio"] as const).map(
                (id) => (
                  <li key={id}>
                    <span>Старт · {stockLabel(id)}</span>
                    <strong className="tabular">{stocks[id] ?? "—"}</strong>
                  </li>
                ),
              )}
            </ul>

            <h5>Каталоги</h5>
            <ul className="gm-atelier-kv">
              <li>
                <span>Здания / корабли / юниты / станции</span>
                <strong className="tabular">
                  {snap.counts.buildings} / {snap.counts.ships} / {snap.counts.units}{" "}
                  / {snap.counts.stations}
                </strong>
              </li>
              <li>
                <span>Множители сил</span>
                <strong className="tabular">
                  ship ×{snap.forces.shipCostMult ?? "—"} · unit ×
                  {snap.forces.unitCostMult ?? "—"}
                </strong>
              </li>
            </ul>
          </div>

          <h5>Примерные цены (produceCost)</h5>
          <table className="gm-balance-table">
            <thead>
              <tr>
                <th>Id</th>
                <th>metal + supply</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(snap.sampleCosts).map(([id, cost]) => (
                <tr key={id}>
                  <td><code>{id}</code></td>
                  <td className="tabular">{fmtCost(cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h5>Алхимия</h5>
          <ul className="gm-atelier-kv">
            <li>
              <span>Попытки / база / gap</span>
              <strong className="tabular">
                {snap.alchemy?.attemptsPerTurn ?? "—"} ×{" "}
                {snap.alchemy?.baseCost ?? "—"} +gap{" "}
                {snap.alchemy?.eraGapCost ?? "—"}
              </strong>
            </li>
            <li>
              <span>Макс. same-era / ход</span>
              <strong className="tabular">
                {snap.alchemy?.maxSameEraSpend ?? "—"} cogn
              </strong>
            </li>
          </ul>
          <div className="gm-balance-action-row" style={{ marginBottom: 12 }}>
            <span className="hint">Пресеты алхимии</span>
            <div className="gmsys-row" style={{ gap: 4 }}>
              <button
                type="button"
                className="btn ghost"
                disabled={busy}
                onClick={() =>
                  void patch({
                    action: "setAlchemy",
                    attemptsPerTurn: 2,
                    baseCost: 6,
                    eraGapCost: 3,
                  })
                }
              >
                2×6/3
              </button>
              <button
                type="button"
                className="btn ghost"
                disabled={busy}
                onClick={() =>
                  void patch({
                    action: "setAlchemy",
                    attemptsPerTurn: 3,
                    baseCost: 5,
                    eraGapCost: 2,
                  })
                }
              >
                3×5/2
              </button>
            </div>
          </div>

          <h5>Tech market ({snap.techMarket?.listings ?? 0} лотов)</h5>
          <table className="gm-balance-table">
            <thead>
              <tr>
                <th>Лот</th>
                <th>Цена</th>
              </tr>
            </thead>
            <tbody>
              {(snap.techMarket?.sample ?? []).map((l) => (
                <tr key={l.id}>
                  <td><code>{l.id}</code></td>
                  <td className="tabular">{fmtCost(l.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h5>Card battle</h5>
          <ul className="gm-atelier-kv">
            <li>
              <span>hand / rounds / energy</span>
              <strong className="tabular">
                {snap.cardBattle?.handSize ?? "—"} /{" "}
                {snap.cardBattle?.maxRounds ?? "—"} /{" "}
                {snap.cardBattle?.energyPerRound ?? "—"}
              </strong>
            </li>
            <li>
              <span>Trophies (metal× / cogn / intel)</span>
              <strong className="tabular">
                {snap.cardBattle?.trophies?.metalPerLostUnit ?? "—"} × /{" "}
                {snap.cardBattle?.trophies?.cognitioOnWin ?? "—"}+style /{" "}
                {snap.cardBattle?.trophies?.intelBump ?? "—"}
              </strong>
            </li>
          </ul>
          {snap.cardBattle?.note && (
            <p className="hint">{snap.cardBattle.note}</p>
          )}

          <h5>Ранние здания</h5>
          <table className="gm-balance-table">
            <thead>
              <tr>
                <th>Здание</th>
                <th>Tier</th>
                <th>Стоимость</th>
              </tr>
            </thead>
            <tbody>
              {snap.earlyBuildings.map((b) => (
                <tr key={b.id}>
                  <td>{b.name}</td>
                  <td className="tabular">{b.tier ?? "—"}</td>
                  <td className="tabular">{fmtCost(b.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h5>Быстрые правки</h5>
          <div className="gm-balance-actions">
            <div className="gm-balance-action-row">
              <span className="hint">Имперские ОД</span>
              <div className="gmsys-row" style={{ gap: 4 }}>
                {[6, 9, 12].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`btn ghost ${empireAp === n ? "active" : ""}`}
                    disabled={busy}
                    onClick={() => void patch({ action: "setAp", empire: n })}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div className="gm-balance-action-row">
              <span className="hint">ОД сил · base</span>
              <button
                type="button"
                className="btn ghost"
                disabled={busy}
                onClick={() => void patch({ action: "setAp", forceBase: 2 })}
              >
                base = 2
              </button>
            </div>

            <div className="gm-balance-action-row">
              <span className="hint">Старт · металл</span>
              <div className="gmsys-row" style={{ gap: 4 }}>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={busy}
                  onClick={() =>
                    void patch({
                      action: "bumpStartStock",
                      currencyId: "currency.metal",
                      delta: -20,
                    })
                  }
                >
                  −20
                </button>
                <span className="tabular">{stocks["currency.metal"] ?? "—"}</span>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={busy}
                  onClick={() =>
                    void patch({
                      action: "bumpStartStock",
                      currencyId: "currency.metal",
                      delta: 20,
                    })
                  }
                >
                  +20
                </button>
              </div>
            </div>

            <div className="gm-balance-action-row">
              <span className="hint">Старт · снабжение</span>
              <div className="gmsys-row" style={{ gap: 4 }}>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={busy}
                  onClick={() =>
                    void patch({
                      action: "bumpStartStock",
                      currencyId: "currency.supply",
                      delta: -10,
                    })
                  }
                >
                  −10
                </button>
                <span className="tabular">{stocks["currency.supply"] ?? "—"}</span>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={busy}
                  onClick={() =>
                    void patch({
                      action: "bumpStartStock",
                      currencyId: "currency.supply",
                      delta: 10,
                    })
                  }
                >
                  +10
                </button>
              </div>
            </div>

            <div className="gm-balance-action-row">
              <span className="hint">Множитель кораблей</span>
              <div className="gmsys-row" style={{ gap: 4 }}>
                {[1.3, 1.6, 2.0].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`btn ghost ${
                      snap.forces.shipCostMult === n ? "active" : ""
                    }`}
                    disabled={busy}
                    onClick={() =>
                      void patch({ action: "setForceMult", shipCostMult: n })
                    }
                  >
                    ×{n}
                  </button>
                ))}
              </div>
            </div>

            <div className="gm-balance-action-row">
              <span className="hint">Пересборка каталогов</span>
              <div className="gmsys-row" style={{ gap: 4, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={busy}
                  onClick={() => void patch({ action: "regen", target: "forces" })}
                >
                  Силы
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={busy}
                  onClick={() =>
                    void patch({ action: "regen", target: "stations" })
                  }
                >
                  Станции
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={busy}
                  onClick={() =>
                    void patch({ action: "regen", target: "buildings" })
                  }
                >
                  Здания
                </button>
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy}
                  onClick={() => void patch({ action: "regen", target: "all" })}
                >
                  Всё baseline
                </button>
              </div>
            </div>
          </div>

          <PegMultiplierSection />
          <PowerTouchSection />
          <InterventionsSection limit={12} />
        </>
      )}
    </div>
  );
}
