import { useEffect, useState } from "react";
import type { PlayerOrder } from "../state/types";
import {
  formatOrderEtaChip,
  isActiveProcessOrder,
  orderTypeLabel,
} from "./orderEtaLabels";
import {
  formatForceOdMeter,
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

function ProcessChip({ order, currentTurn }: { order: PlayerOrder; currentTurn: number }) {
  const label = orderTypeLabel(order.type);
  const eta = formatOrderEtaChip(order, currentTurn);
  const title = `${label}: ${eta}`;
  return (
    <span className="order-tray__chip" title={title}>
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

/**
 * Shared, always-visible action-budget readout — same numbers regardless of
 * which room spent them (Наука/Биржа/Карта/…). Mounted as an unconditional
 * dock sibling in ViewerPage so it survives every viewMode switch.
 */
export function OrderTray({
  apUsed,
  apMax,
  forceApUsed,
  forceApMax,
  activeOrders = [],
  currentTurn = 0,
}: OrderTrayProps) {
  const [compact, setCompact] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const processes = activeOrders.filter(isActiveProcessOrder);
  const odLabel = formatOdMeter(apUsed, apMax);
  const forceLabel = formatForceOdMeter(forceApUsed, forceApMax);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 720px)");
    const sync = () => setCompact(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSheetOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheetOpen]);

  if (compact) {
    return (
      <>
        <button
          type="button"
          className="order-tray order-tray--compact"
          aria-label={`Очки действия: ${odLabel}, силы: ${forceLabel}`}
          aria-expanded={sheetOpen}
          onClick={() => setSheetOpen((v) => !v)}
        >
          <span className="order-tray__compact-line">
            {odLabel} · {forceLabel}
          </span>
        </button>
        {sheetOpen ? (
          <div
            className="order-tray-sheet"
            role="dialog"
            aria-label="Очки действия"
          >
            <div className="order-tray-sheet__body">
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
                  {processes.slice(0, 4).map((o) => (
                    <ProcessChip key={o.id} order={o} currentTurn={currentTurn} />
                  ))}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              className="order-tray-sheet__backdrop"
              aria-label="Закрыть"
              onClick={() => setSheetOpen(false)}
            />
          </div>
        ) : null}
      </>
    );
  }

  return (
    <div className="order-tray" role="group" aria-label="Очки действия">
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
      {processes.length > 0 && (
        <div className="order-tray__processes" aria-label="Активные процессы">
          {processes.slice(0, 4).map((o) => (
            <ProcessChip key={o.id} order={o} currentTurn={currentTurn} />
          ))}
          {processes.length > 4 && (
            <span className="order-tray__chip order-tray__chip--more">
              +{processes.length - 4}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
