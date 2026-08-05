import { useEffect, useRef, useState } from "react";
import { useDrag } from "@use-gesture/react";
import type { TaxSlotDef, TaxTierDef } from "../policyData";
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

export function TaxDragStrip({
  slot,
  value,
  pending,
  stock,
  onCommit,
  busy,
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  /** Optimistic pending until parent/server catches up — blocks double AP. */
  const [localPending, setLocalPending] = useState<string | null>(null);
  const lockRef = useRef(false);

  useEffect(() => {
    if (pending != null) setLocalPending(null);
  }, [pending]);

  useEffect(() => {
    if (busy) return;
    lockRef.current = false;
    // Failed submit: server never set pending — drop optimistic sticky state.
    if (pending == null) setLocalPending(null);
  }, [busy, pending]);

  const effectivePending = pending ?? localPending ?? undefined;
  const activeId = previewId ?? effectivePending ?? value;
  const activeTier: TaxTierDef | undefined =
    slot.tiers.find((t) => t.id === activeId) ?? slot.tiers[0];
  const activeIndex = Math.max(
    0,
    slot.tiers.findIndex((t) => t.id === activeId),
  );

  const pickFromX = (clientX: number) => {
    const el = trackRef.current;
    if (!el || slot.tiers.length === 0) return null;
    const r = el.getBoundingClientRect();
    const t = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    const idx = Math.round(t * (slot.tiers.length - 1));
    return slot.tiers[idx] ?? null;
  };

  const commit = (tierId: string) => {
    if (busy || lockRef.current) return;
    const committed = effectivePending ?? value;
    if (tierId === committed) return;
    lockRef.current = true;
    setLocalPending(tierId);
    onCommit(tierId);
  };

  const bind = useDrag(
    ({ first, last, xy: [x], tap, event }) => {
      if (busy || lockRef.current) return;
      // Let tick buttons receive native clicks — do not preventDefault on taps.
      if (tap) return;
      const target = event?.target as HTMLElement | null;
      if (target?.closest?.(".eco-tax-strip__tick")) return;
      if (first) setDragging(true);
      const tier = pickFromX(x);
      if (tier) setPreviewId(tier.id);
      if (last) {
        setDragging(false);
        if (tier) commit(tier.id);
        setPreviewId(null);
      }
    },
    { axis: "x", filterTaps: true, pointer: { touch: true } },
  );

  const effects = describeTaxEffects(activeTier);
  const income = previewTaxIncome(stock, activeTier?.rate);
  const changed = activeId !== value;

  const pendingLabel =
    effectivePending != null
      ? slot.tiers.find((t) => t.id === effectivePending)?.label ??
        effectivePending
      : null;

  return (
    <div className={`eco-tax-strip ${dragging ? "is-dragging" : ""}`}>
      <header className="eco-tax-strip__head">
        <strong>{slot.name}</strong>
        <span className="tabular-nums eco-tax-strip__value">
          {activeTier?.label ?? "—"}
        </span>
      </header>
      <div
        className="eco-tax-strip__track"
        ref={trackRef}
        {...bind()}
        onPointerDown={(e) => e.stopPropagation()}
        role="slider"
        aria-valuemin={0}
        aria-valuemax={slot.tiers.length - 1}
        aria-valuenow={activeIndex}
        aria-label={slot.name}
        tabIndex={0}
        onKeyDown={(e) => {
          if (busy || lockRef.current) return;
          const committed = effectivePending ?? value;
          const i = slot.tiers.findIndex((t) => t.id === committed);
          if (e.key === "ArrowRight" && i < slot.tiers.length - 1) {
            e.preventDefault();
            commit(slot.tiers[i + 1]!.id);
          }
          if (e.key === "ArrowLeft" && i > 0) {
            e.preventDefault();
            commit(slot.tiers[i - 1]!.id);
          }
        }}
      >
        <div
          className="eco-tax-strip__fill"
          style={{
            width: `${(activeIndex / Math.max(1, slot.tiers.length - 1)) * 100}%`,
          }}
        />
        <div className="eco-tax-strip__ticks">
          {slot.tiers.map((t, i) => (
            <button
              key={t.id}
              type="button"
              className={`eco-tax-strip__tick ${t.id === activeId ? "is-active" : ""}`}
              style={{ left: `${(i / Math.max(1, slot.tiers.length - 1)) * 100}%` }}
              disabled={busy || lockRef.current}
              onClick={() => commit(t.id)}
              title={t.label}
            >
              <span className="eco-tax-strip__tick-label">{t.label}</span>
            </button>
          ))}
        </div>
      </div>
      <p className={`eco-tax-strip__preview ${changed ? "is-live" : ""}`}>
        {income > 0 ? `~+${fmtInt(income)}/ход доход · ` : null}
        {effects.join(", ")}
        {pendingLabel && !previewId ? (
          <span className="hint"> · с {pendingLabel} со следующего хода</span>
        ) : null}
        {changed && dragging ? <span className="hint"> · превью</span> : null}
      </p>
    </div>
  );
}
