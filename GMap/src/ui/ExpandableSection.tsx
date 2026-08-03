import type { ReactNode } from "react";

type Props = {
  title: string;
  /** Compact summary shown in the summary row (right side). */
  badge?: ReactNode;
  /** Open by default (alerts / focused work). */
  defaultOpen?: boolean;
  /** When set, force controlled open state. */
  open?: boolean;
  className?: string;
  children: ReactNode;
};

/**
 * Progressive-density wrapper: summary by default, drill-down on demand.
 * Uses native <details> for a11y + keyboard without Framer.
 */
export function ExpandableSection({
  title,
  badge,
  defaultOpen = false,
  open,
  className = "",
  children,
}: Props) {
  const controlled = open !== undefined;
  return (
    <details
      className={`hq-expandable ${className}`.trim()}
      {...(controlled ? { open } : { defaultOpen })}
    >
      <summary className="hq-expandable-summary">
        <span className="hq-expandable-title">{title}</span>
        {badge != null && badge !== false && (
          <span className="hq-expandable-badge">{badge}</span>
        )}
      </summary>
      <div className="hq-expandable-body">{children}</div>
    </details>
  );
}
