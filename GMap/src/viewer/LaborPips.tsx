import type { CSSProperties } from "react";

const PIP_MAX = 5;

type Props = {
  staffed: number;
  slots: number;
  pinned?: boolean;
  compact?: boolean;
};

export function LaborPips({ staffed, slots, pinned, compact }: Props) {
  if (slots <= 0) return null;
  const filled = Math.max(0, Math.round(staffed));
  const showDots = slots <= PIP_MAX;
  return (
    <span
      className={`labor-pips${pinned ? " is-pinned" : " is-auto"}${compact ? " is-compact" : ""}`}
      title={`${filled}/${slots}${pinned ? " · назначено" : " · авто"}`}
      aria-label={`Рабочие ${filled} из ${slots}`}
    >
      {showDots
        ? Array.from({ length: slots }, (_, i) => (
            <i
              key={i}
              className={`labor-pip${i < filled ? " is-on" : ""}`}
            />
          ))
        : (
          <span className="labor-pips__count">
            {filled}/{slots}
          </span>
        )}
    </span>
  );
}

export function laborPipStyle(color: string): CSSProperties {
  return { ["--pip-accent" as string]: color };
}
