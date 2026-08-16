import type { CategoryStatus } from "../economy/types";

export function formatStatusIcon(status: CategoryStatus): string {
  if (status === "deficit") return "❌";
  if (status === "warn") return "⚠";
  return "✅";
}

type Props = {
  status: CategoryStatus;
  className?: string;
};

/** Status encoded as icon + semantic class — never color alone. */
export function StatusChip({ status, className = "" }: Props) {
  return (
    <span
      className={`status-chip status-chip--${status} ${className}`.trim()}
      aria-label={status}
    >
      {formatStatusIcon(status)}
    </span>
  );
}
