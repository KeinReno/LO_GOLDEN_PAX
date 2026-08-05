import { useState, type ReactNode, type SyntheticEvent } from "react";

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
 * Note: React does not support defaultOpen on <details>, so we mirror it in state.
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
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isOpen = controlled ? open : uncontrolledOpen;

  const onToggle = (e: SyntheticEvent<HTMLDetailsElement>) => {
    if (!controlled) setUncontrolledOpen(e.currentTarget.open);
  };

  return (
    <details
      className={`hq-expandable ${className}`.trim()}
      open={isOpen}
      onToggle={onToggle}
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
