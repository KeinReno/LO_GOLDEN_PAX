import type { CSSProperties } from "react";
import { useMemo } from "react";
import { getCachedContent } from "../state/contentCatalog";
import {
  BUILD_METAL,
  BUILD_SUPPLY,
  CATEGORY_CURRENCIES,
} from "../state/economyLabels";
import { CATEGORY_META } from "../state/resourceIndex";
import {
  RESOURCE_ICON_SLUGS,
  RESOURCE_META,
} from "../state/resourcePool.generated";

const CURRENCY_CATEGORY: Record<string, keyof typeof CATEGORY_META> =
  Object.fromEntries(
    CATEGORY_CURRENCIES.map((c) => [c.id, c.letter]),
  ) as Record<string, keyof typeof CATEGORY_META>;

const CURRENCY_LABELS: Record<string, { name: string; short: string }> = {
  [BUILD_METAL.id]: { name: BUILD_METAL.label, short: BUILD_METAL.short },
  [BUILD_SUPPLY.id]: { name: BUILD_SUPPLY.label, short: BUILD_SUPPLY.short },
  ...Object.fromEntries(
    CATEGORY_CURRENCIES.map((c) => [c.id, { name: c.name, short: c.short }]),
  ),
};

const ID_TO_MAP_NAME = (() => {
  const out: Record<string, string> = {};
  for (const meta of Object.values(RESOURCE_META)) {
    out[meta.id] = meta.name;
  }
  return out;
})();

export type ResourceDisplay = {
  id: string;
  name: string;
  short: string;
  iconUrl: string | null;
  categoryColor: string | null;
};

export function resolveResourceDisplay(resourceId: string): ResourceDisplay {
  const content = getCachedContent();
  const fromCatalog = content?.map_resources?.[resourceId];
  const mapName = fromCatalog?.name ?? ID_TO_MAP_NAME[resourceId];
  const currency = CURRENCY_LABELS[resourceId];

  if (mapName) {
    const slug = RESOURCE_ICON_SLUGS[mapName];
    const category =
      (fromCatalog?.category as keyof typeof CATEGORY_META | undefined) ??
      RESOURCE_META[mapName]?.category ??
      null;
    return {
      id: resourceId,
      name: mapName,
      short: mapName.trim().charAt(0).toUpperCase() || "?",
      iconUrl: slug ? `/icons/game/resources/${slug}.svg` : null,
      categoryColor: category ? CATEGORY_META[category]?.color ?? null : null,
    };
  }

  if (currency) {
    const cat = CURRENCY_CATEGORY[resourceId];
    return {
      id: resourceId,
      name: currency.name,
      short: currency.short,
      iconUrl: null,
      categoryColor: cat ? CATEGORY_META[cat]?.color ?? null : null,
    };
  }

  const fallback = resourceId.replace(/^(currency|map)\./, "");
  return {
    id: resourceId,
    name: fallback,
    short: fallback.charAt(0).toUpperCase() || "?",
    iconUrl: null,
    categoryColor: null,
  };
}

export function getResourceName(resourceId: string): string {
  return resolveResourceDisplay(resourceId).name;
}

/** Tooltip: "Name · у вас: N" */
export function formatResourceTip(
  resourceId: string,
  stocks?: Record<string, number>,
  amount?: number,
): string {
  const name = getResourceName(resourceId);
  const owned =
    stocks && resourceId in stocks
      ? stocks[resourceId]
      : amount ?? 0;
  return `${name} · у вас: ${owned}`;
}

export function ResourceIcon({
  resourceId,
  amount,
  stocks,
  size = 16,
  className,
  showAmount = false,
}: {
  resourceId: string;
  amount?: number;
  stocks?: Record<string, number>;
  size?: number;
  className?: string;
  showAmount?: boolean;
}) {
  const display = useMemo(
    () => resolveResourceDisplay(resourceId),
    [resourceId],
  );
  const tip = formatResourceTip(resourceId, stocks, amount);
  const style = {
    width: size,
    height: size,
    ...(display.categoryColor
      ? ({ "--resource-fallback-color": display.categoryColor } as CSSProperties)
      : {}),
  };

  return (
    <span
      className={["resource-icon", className].filter(Boolean).join(" ")}
      title={tip}
      style={style}
    >
      {display.iconUrl ? (
        <img
          className="resource-icon-img"
          src={display.iconUrl}
          alt=""
          width={size}
          height={size}
          draggable={false}
        />
      ) : (
        <span className="resource-icon-fallback" aria-hidden>
          {display.short}
        </span>
      )}
      {showAmount && amount != null && amount > 0 && (
        <span className="resource-icon-amount">{amount}</span>
      )}
    </span>
  );
}
