import { useRef, useState } from "react";
import { useDrag } from "@use-gesture/react";
import type { TaxSlotDef, TaxTierDef } from "../policyData";
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

  const activeId = previewId ?? pending ?? value;
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

  const bind = useDrag(
    ({ first, last, xy: [x], event }) => {
      if (busy) return;
      if (first) setDragging(true);
      const tier = pickFromX(x);
      if (tier) setPreviewId(tier.id);
      if (last) {
        setDragging(false);
        if (tier && tier.id !== value) onCommit(tier.id);
        setPreviewId(null);
      }
      event?.preventDefault?.();
    },
    { axis: "x", filterTaps: true, pointer: { touch: true } },
  );

  const effects = describeTaxEffects(activeTier);
  const income = previewTaxIncome(stock, activeTier?.rate);
  const changed = activeId !== value;

  return (
    <div className={`eco-tax-strip ${dragging ? "is-dragging" : ""}`}>
      <header className="eco-tax-strip__head">
        <strong>{slot.name}</strong>
        <span className="tabular-nums">{activeTier?.label ?? "—"}</span>
      </header>
      <div
        className="eco-tax-strip__track"
        ref={trackRef}
        {...bind()}
        role="slider"
        aria-valuemin={0}
        aria-valuemax={slot.tiers.length - 1}
        aria-valuenow={activeIndex}
        aria-label={slot.name}
        tabIndex={0}
        onKeyDown={(e) => {
          if (busy) return;
          const i = slot.tiers.findIndex((t) => t.id === (pending ?? value));
          if (e.key === "ArrowRight" && i < slot.tiers.length - 1) {
            e.preventDefault();
            onCommit(slot.tiers[i + 1]!.id);
          }
          if (e.key === "ArrowLeft" && i > 0) {
            e.preventDefault();
            onCommit(slot.tiers[i - 1]!.id);
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
              disabled={busy}
              onClick={() => onCommit(t.id)}
              title={t.label}
            >
              <span className="eco-tax-strip__tick-label">{t.label}</span>
            </button>
          ))}
        </div>
      </div>
      <p className={`eco-tax-strip__preview ${changed ? "is-live" : ""}`}>
        {income > 0 ? `~+${income}/ход доход · ` : null}
        {effects.join(", ")}
        {pending && !previewId ? (
          <span className="hint"> · в очереди → {pending}</span>
        ) : null}
        {changed && dragging ? <span className="hint"> · превью</span> : null}
      </p>
    </div>
  );
}
