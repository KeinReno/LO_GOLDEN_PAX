import { GESTURE } from "./gestureMap";

type Props = {
  x: number;
  y: number;
  /** 0..1 hold progress (caller drives from long-press timer / GESTURE.holdRingMs). */
  progress: number;
  size?: number;
  label?: string;
};

const DEFAULT_SIZE = 48;

/**
 * Non-interactive hold-progress ring shown during long-press confirmation.
 */
export function HoldRing({
  x,
  y,
  progress,
  size = DEFAULT_SIZE,
  label,
}: Props) {
  const clamped = Math.min(1, Math.max(0, progress));
  const stroke = 3;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const dashOffset = circumference * (1 - clamped);

  return (
    <div
      className="hold-ring"
      style={{ left: x, top: y, width: size, height: size }}
      aria-hidden
      data-hold-ms={GESTURE.holdRingMs}
    >
      <svg
        className="hold-ring-svg"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
      >
        <circle
          className="hold-ring-track"
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          strokeWidth={stroke}
        />
        <circle
          className="hold-ring-fill"
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      </svg>
      {label ? <span className="hold-ring-label">{label}</span> : null}
    </div>
  );
}
