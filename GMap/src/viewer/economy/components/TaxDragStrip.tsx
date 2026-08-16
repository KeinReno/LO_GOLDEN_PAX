import { useEffect, useState } from "react";
import type { TaxSlotDef } from "../policyData";
import { fmtInt } from "../../../state/numberFormat";
import { describeTaxEffects, previewTaxIncome } from "../policyData";

type Props = {
  slot: TaxSlotDef;
  value: string;
  pending?: string;
  stock: number;
  onCommit: (tierId: string) => void;
  busy?: boolean;
};

/**
 * Tax tier picker — plain segmented buttons (no range / no gesture lib).
 * Queue-only: chosen tier sits in pending until next tick.
 */
export function TaxDragStrip({
  slot,
  value,
  pending,
  stock,
  onCommit,
  busy,
}: Props) {
  const [localPending, setLocalPending] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    if (pending != null) {
      setLocalPending(null);
      setLastError(null);
    }
  }, [pending]);

  const queuedId = pending ?? localPending;
  const activeId = queuedId ?? value;
  const activeTier =
    slot.tiers.find((t) => t.id === activeId) ?? slot.tiers[0];
  const liveTier = slot.tiers.find((t) => t.id === value) ?? slot.tiers[0];

  const commit = (tierId: string) => {
    setLastError(null);
    if (busy) {
      setLastError("Подождите — предыдущий запрос ещё идёт");
      return;
    }
    if (tierId === (queuedId ?? value)) return;
    setLocalPending(tierId);
    try {
      onCommit(tierId);
    } catch (e) {
      setLocalPending(null);
      setLastError(e instanceof Error ? e.message : String(e));
    }
  };

  const effects = describeTaxEffects(activeTier);
  const income = previewTaxIncome(stock, activeTier?.rate);
  const liveIncome = previewTaxIncome(stock, liveTier?.rate);
  const incomeDelta = income - liveIncome;
  const queued = queuedId != null && queuedId !== value;
  const pendingLabel =
    queuedId != null
      ? slot.tiers.find((t) => t.id === queuedId)?.label ?? queuedId
      : null;

  return (
    <div className={`eco-tax-strip${queued ? " is-queued" : ""}`}>
      <header className="eco-tax-strip__head">
        <strong>{slot.name}</strong>
        <span className="tabular-nums eco-tax-strip__value">
          {queued
            ? `${liveTier?.label ?? "—"} → ${activeTier?.label ?? "—"}`
            : (activeTier?.label ?? "—")}
        </span>
      </header>
      <div
        className="eco-tax-strip__segments"
        role="radiogroup"
        aria-label={slot.name}
      >
        {slot.tiers.map((t) => {
          const isOn = t.id === activeId;
          const isLive = t.id === value && !queued;
          return (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={isOn}
              className={`eco-tax-strip__seg${isOn ? " is-active" : ""}${isLive ? " is-live" : ""}`}
              disabled={!!busy}
              onClick={() => commit(t.id)}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <p className={`eco-tax-strip__preview${queued ? " is-live" : ""}`}>
        {income > 0 ? `~+${fmtInt(income)}/ход доход` : "доход ~0"}
        {queued && incomeDelta !== 0
          ? ` (${incomeDelta > 0 ? "+" : ""}${fmtInt(incomeDelta)} к текущему)`
          : null}
        {effects.length > 0 ? ` · ${effects.join(", ")}` : null}
        {pendingLabel && queued ? (
          <span className="hint">
            {" "}
            · в очереди: {pendingLabel} (со следующего хода)
          </span>
        ) : (
          <span className="hint"> · смена со следующего хода</span>
        )}
      </p>
      {lastError ? (
        <p className="eco-tax-strip__error" role="alert">
          {lastError}
        </p>
      ) : null}
    </div>
  );
}
