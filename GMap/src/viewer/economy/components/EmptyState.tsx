import type { ReactNode } from "react";

type Props = {
  title: string;
  body?: string;
  action?: ReactNode;
  /** Subtle CSS-only dots (empty-state exception from Aceternity ban). */
  patterned?: boolean;
};

export function EmptyState({
  title,
  body,
  action,
  patterned = true,
}: Props) {
  return (
    <div
      className={`eco-empty eco-empty--action ${patterned ? "eco-empty--dots" : ""}`}
    >
      <strong className="eco-empty__title">{title}</strong>
      {body ? <p>{body}</p> : null}
      {action}
    </div>
  );
}
