import { useMemo, useState } from "react";
import type { DiplomacyRelation, ViewerPayload } from "../state/types";
import { DIPLOMACY_LABELS } from "../state/defaults";
import { intentApCost } from "../state/contentCatalog";
import {
  BUILD_METAL,
  BUILD_SUPPLY,
  CATEGORY_CURRENCIES,
} from "../state/economyLabels";

function getRelation(
  payload: ViewerPayload,
  a: string,
  b: string,
): DiplomacyRelation {
  const [x, y] = a < b ? [a, b] : [b, a];
  return (
    payload.world.diplomacy.find((d) => d.aId === x && d.bId === y)?.relation ??
    "neutral"
  );
}

const REL_PRIORITY: Record<DiplomacyRelation, number> = {
  war: 0,
  vassal: 1,
  alliance: 2,
  trade: 3,
  truce: 4,
  neutral: 5,
};

const TRANSFER_CURRENCIES: { id: string; label: string }[] = [
  ...CATEGORY_CURRENCIES.map((c) => ({
    id: c.id,
    label: `${c.name} (${c.short})`,
  })),
  { id: BUILD_METAL.id, label: BUILD_METAL.label },
  { id: BUILD_SUPPLY.id, label: BUILD_SUPPLY.label },
];

function RelationBadge({ relation }: { relation: DiplomacyRelation }) {
  return (
    <span className={`diplo-badge diplo-badge--${relation}`}>
      {DIPLOMACY_LABELS[relation]}
    </span>
  );
}

/** Read-only diplomacy + resource transfer intent for the player viewer. */
export function ViewerDiploPanel({
  payload,
  economy,
  reservedAp,
  apMax,
  orderMsg,
  onTransfer,
}: {
  payload: ViewerPayload;
  economy?: ViewerPayload["economy"];
  reservedAp: number;
  apMax: number;
  orderMsg?: string | null;
  onTransfer: (toFactionId: string, currencyId: string, amount: number) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const [toFactionId, setToFactionId] = useState("");
  const [currencyId, setCurrencyId] = useState("currency.metal");
  const [amount, setAmount] = useState("");
  const playerId = payload.factionId;
  const factions = payload.world.factions;
  const transferAp = intentApCost("intent.transfer");

  const playerRelations = useMemo(() => {
    return factions
      .filter((f) => f.id !== playerId)
      .map((f) => ({
        faction: f,
        relation: getRelation(payload, playerId, f.id),
      }))
      .sort(
        (a, b) =>
          REL_PRIORITY[a.relation] - REL_PRIORITY[b.relation] ||
          a.faction.name.localeCompare(b.faction.name, "ru"),
      );
  }, [payload, factions, playerId]);

  const warCount = playerRelations.filter((r) => r.relation === "war").length;
  const stock = economy?.stocks?.[currencyId] ?? 0;
  const parsedAmount = Math.floor(Number(amount));
  const canTransfer =
    !!toFactionId &&
    toFactionId !== playerId &&
    parsedAmount > 0 &&
    parsedAmount <= stock &&
    reservedAp + transferAp <= apMax;

  return (
    <div className="hq-panel">
      <header className="hq-panel-head">
        <h2>Дипломатия</h2>
        <p className="hint">
          Только известные державы (сенсоры, контакт, договор)
          {warCount > 0 ? ` · войн: ${warCount}` : ""}.
        </p>
      </header>

      {economy && (
        <section className="hq-card">
          <h3>Перевод ресурсов</h3>
          <p className="hint">
            Отправить валюту другой фракции · {transferAp} AP · применится на
            тике
          </p>
          <label className="field">
            <span>Получатель</span>
            <select
              value={toFactionId}
              onChange={(e) => setToFactionId(e.target.value)}
            >
              <option value="">— выберите —</option>
              {playerRelations.map(({ faction, relation }) => (
                <option key={faction.id} value={faction.id}>
                  {faction.name} ({DIPLOMACY_LABELS[relation]})
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Валюта</span>
            <select
              value={currencyId}
              onChange={(e) => setCurrencyId(e.target.value)}
            >
              {TRANSFER_CURRENCIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label} · в наличии {economy.stocks?.[c.id] ?? 0}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Сумма</span>
            <input
              type="number"
              min={1}
              max={stock}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={`до ${stock}`}
            />
          </label>
          <button
            type="button"
            className="btn primary block"
            disabled={!canTransfer}
            onClick={() => {
              if (!canTransfer) return;
              onTransfer(toFactionId, currencyId, parsedAmount);
              setAmount("");
            }}
          >
            Отправить перевод ({transferAp} AP)
          </button>
          {parsedAmount > stock && (
            <p className="hint">Недостаточно средств (есть {stock})</p>
          )}
          {orderMsg && <p className="hint">{orderMsg}</p>}
        </section>
      )}

      <section className="hq-card">
        <h3>Ваши отношения</h3>
        {playerRelations.length === 0 ? (
          <p className="hint">
            Нет известных держав — исследуйте туман или дождитесь первого
            контакта.
          </p>
        ) : (
          <div className="polity-diplo-rows">
            {playerRelations.map(({ faction, relation }) => (
              <div key={faction.id} className="polity-diplo-row">
                <span className="polity-diplo-name">
                  <span
                    className="swatch"
                    style={{ background: faction.color }}
                  />
                  {faction.name}
                </span>
                <RelationBadge relation={relation} />
              </div>
            ))}
          </div>
        )}
        {factions.length > 2 && (
          <button
            type="button"
            className="btn ghost block viewer-diplo-expand"
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll ? "Свернуть матрицу" : "Все отношения"}
          </button>
        )}
      </section>

      {showAll && (
        <section className="hq-card">
          <h3>Матрица</h3>
          <p className="hint">
            Только известные вам державы. Союз — зелёный, торговля — жёлтый,
            война — красный, вассал — фиолетовый.
          </p>
          <div className="diplo-table-wrap">
            <table className="diplo-table diplo-table-readonly">
              <thead>
                <tr>
                  <th />
                  {factions.map((f) => (
                    <th key={f.id}>
                      <span
                        className="swatch"
                        style={{ background: f.color }}
                      />
                      {f.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {factions.map((row) => (
                  <tr key={row.id}>
                    <th>
                      <span
                        className="swatch"
                        style={{ background: row.color }}
                      />
                      {row.name}
                    </th>
                    {factions.map((col) => {
                      if (row.id === col.id) {
                        return (
                          <td key={col.id} className="diplo-self">
                            —
                          </td>
                        );
                      }
                      const rel = getRelation(payload, row.id, col.id);
                      const mine =
                        row.id === playerId || col.id === playerId;
                      return (
                        <td
                          key={col.id}
                          className={mine ? "diplo-cell-mine" : undefined}
                        >
                          <RelationBadge relation={rel} />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
