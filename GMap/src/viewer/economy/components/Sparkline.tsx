type Props = {
  values: number[];
  width?: number;
  height?: number;
  stroke?: string;
  className?: string;
};

/** Tiny SVG sparkline — no chart lib. */
export function Sparkline({
  values,
  width = 72,
  height = 22,
  stroke = "currentColor",
  className,
}: Props) {
  if (values.length === 0) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 1;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const pts = values
    .map((v, i) => {
      const x =
        values.length === 1
          ? width / 2
          : pad + (i / (values.length - 1)) * innerW;
      const y = pad + innerH - ((v - min) / span) * innerH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      className={className ?? "eco-sparkline"}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden
    >
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        points={pts}
      />
    </svg>
  );
}
