import { ResourceIcon } from "./ResourceIcon";

export function ResourceCostRow({
  cost,
  stocks,
  size = 16,
  className,
}: {
  cost: Record<string, number>;
  stocks?: Record<string, number>;
  size?: number;
  className?: string;
}) {
  const entries = Object.entries(cost).filter(([, v]) => v > 0);
  if (entries.length === 0) return null;

  return (
    <div className={["resource-cost-row", className].filter(Boolean).join(" ")}>
      {entries.map(([id, need]) => {
        const have = stocks?.[id];
        const insufficient =
          stocks != null && have != null && have < need;
        return (
          <ResourceIcon
            key={id}
            resourceId={id}
            amount={need}
            stocks={stocks}
            size={size}
            showAmount
            className={insufficient ? "insufficient" : undefined}
          />
        );
      })}
    </div>
  );
}
