import { EcoTip } from "./EcoTip";
import { NumberTicker } from "./NumberTicker";

type Props = {
  label: string;
  value: number;
  tone?: "gold" | "income" | "expense" | "neutral";
  hint?: string;
  tip?: string;
};

export function MetricCard({
  label,
  value,
  tone = "neutral",
  hint,
  tip,
}: Props) {
  const format = (n: number) => {
    const rounded = Math.round(n);
    if (tone === "income" && value > 0) return `+${rounded}`;
    if (tone === "expense" && value > 0) return `−${rounded}`;
    return String(rounded);
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
