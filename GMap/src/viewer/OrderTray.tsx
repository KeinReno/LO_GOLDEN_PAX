import { useEffect, useState } from "react";
import type { PlayerOrder } from "../state/types";
import {
  formatOrderEtaChip,
  formatOrderEtaShort,
  isActiveProcessOrder,
  orderTypeLabel,
} from "./orderEtaLabels";
import {
  formatForceOdHud,
  formatForceOdMeter,
  formatOdHud,
  formatOdMeter,
  FORCE_OD_TOOLTIP,
  OD_TOOLTIP,
} from "../state/playerUiTerms";

type MeterProps = {
  label: string;
  used: number;
  max: number;
  tooltip: string;
};

function Meter({ label, used, max, tooltip }: MeterProps) {
  const pct = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0;
  return (
    <div className="order-tray__meter" title={tooltip}>
      <span className="order-tray__value">{label}</span>
      <span className="order-tray__bar">
        <span className="order-tray__bar-fill" style={{ width: `${pct}%` }} />
      </span>
    </div>
  );
}

function ProcessChip({
  order,
  currentTurn,
  compact,
}: {
  order: PlayerOrder;
  currentTurn: number;
  compact?: boolean;
}) {
  const label = orderTypeLabel(order.type);
  const eta = compact
    ? formatOrderEtaShort(order, currentTurn)
    : formatOrderEtaChip(order, currentTurn);
  return (
    <span className="order-tray__chip" title={`${label}: ${eta}`}>
      <span className="order-tray__chip-label">{label}</span>
      <span className="order-tray__chip-eta">{eta}</span>
    </span>
  );
}

export type OrderTrayProps = {
  apUsed: number;
  apMax: number;
  forceApUsed: number;
  forceApMax: number;
  activeOrders?: PlayerOrder[];
  currentTurn?: number;
};

/** Map HUD: compact OD + in-flight processes, top-right. */
export function OrderTray({
  apUsed,
  apMax,
  forceApUsed,
  forceApMax,
  activeOrders = [],
  currentTurn = 0,
}: OrderTrayProps) {
  const [open, setOpen] = useState(false);
  const processes = activeOrders.filter(isActiveProcessOrder);
  const odShort = formatOdHud(apUsed, apMax);
  const forceShort = formatForceOdHud(forceApUsed, forceApMax);
  const odLabel = formatOdMeter(apUsed, apMax);
  const forceLabel = formatForceOdMeter(forceApUsed, forceApMax);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div
      className={`order-tray order-tray--hud${open ? " is-open" : ""}`}
      role="group"
      aria-label="Очки действия"
    >
      <button
        type="button"
        className="order-tray__toggle"
        aria-expanded={open}
        aria-label={`Очки действия: ${odLabel}, силы: ${forceLabel}${
          processes.length ? `, в пути ${processes.length}` : ""
        }`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="order-tray__compact-line">
          {odShort}
          <span className="order-tray__sep" aria-hidden>
            ·
          </span>
          {forceShort}
        </span>
        {processes.length > 0 ? (
          <span className="order-tray__count">{processes.length}</span>
        ) : null}
      </button>
      {open ? (
        <div className="order-tray__panel">
          <Meter
            label={odLabel}
            used={apUsed}
            max={apMax}
            tooltip={OD_TOOLTIP}
          />
          <Meter
            label={forceLabel}
            used={forceApUsed}
            max={forceApMax}
            tooltip={FORCE_OD_TOOLTIP}
          />
          {processes.length > 0 ? (
            <div className="order-tray__processes" aria-label="Активные процессы">
              {processes.slice(0, 6).map((o) => (
                <ProcessChip
                  key={o.id}
                  order={o}
                  currentTurn={currentTurn}
                  compact
                />
              ))}
              {processes.length > 6 ? (
                <span className="order-tray__chip order-tray__chip--more">
                  +{processes.length - 6}
                </span>
              ) : null}
            </div>
          ) : (
            <p className="hint order-tray__empty">В пути ничего нет.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
