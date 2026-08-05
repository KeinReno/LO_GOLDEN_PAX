import { fmtInt } from "../../../state/numberFormat";
import { EcoTip } from "./EcoTip";
import { NumberTicker } from "./NumberTicker";

type Props = {
  label: string;
  value: number;
  tone?: "gold" | "income" | "expense" | "neutral";
  hint?: string;
  tip?: string;
  /** Always show +/− (balance). Avoids expense-tone sign glitches. */
  signed?: boolean;
};

export function MetricCard({
  label,
  value,
  tone = "neutral",
  hint,
  tip,
  signed = false,
}: Props) {
  const format = (n: number) => {
    if (signed) {
      const rounded = Math.round(n);
      if (rounded > 0) return `+${fmtInt(rounded)}`;
      if (rounded < 0) return `−${fmtInt(Math.abs(rounded))}`;
      return fmtInt(0);
    }
    const s = fmtInt(n);
    if (tone === "income" && n > 0) return `+${s}`;
    if (tone === "expense" && n > 0) return `−${s}`;
    return s;
  };

  const card = (
    <div className={`eco-metric-card eco-metric-card--${tone}`}>
      <span className="eco-metric-card__label">{label}</span>
      <strong className="eco-metric-card__value tabular-nums">
        <NumberTicker value={value} format={format} />
      </strong>
      {hint ? <span className="eco-metric-card__hint hint">{hint}</span> : null}
    </div>
  );

  if (!tip) return card;
  return <EcoTip content={tip}>{card}</EcoTip>;
}
