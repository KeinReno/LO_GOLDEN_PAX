import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { MapResourceDef } from "../state/contentCatalog";
import {
  BUILD_METAL,
  BUILD_SUPPLY,
  CATEGORY_CURRENCIES,
  resourceDisplayName,
  type CategoryCurrency,
} from "../state/economyLabels";
import { buildResourceIndex } from "../state/resourceIndex";
import { fmtSigned } from "../state/numberFormat";
import type { ViewerPayload, WorldState } from "../state/types";
import { formatOdHud, formatForceOdHud, OD_TOOLTIP, FORCE_OD_TOOLTIP } from "../state/playerUiTerms";
import { ResourceIcon } from "../ui/ResourceIcon";
import type { EconomyFlowBreakdown, FlowCell } from "./economyFlowTypes";
import { resolveTreasuryCurrencyId } from "./economy/economyMath";

const HOVER_OPEN_MS = 380;
const HOVER_CLOSE_MS = 160;

/** Count deposits of each resource name/id on owned planets. */
function countOwnedDeposits(
  world: WorldState | undefined,
  factionId: string | undefined,
): Record<string, number> {
  const out: Record<string, number> = {};
  if (!world || !factionId) return out;
  for (const sys of world.systems ?? []) {
    if (sys.ownerFactionId !== factionId) continue;
    for (const p of sys.planets ?? []) {
      for (const raw of p.resources ?? []) {
        const key = String(raw);
        out[key] = (out[key] ?? 0) + 1;
      }
    }
  }
  return out;
}

function resolveDepositCount(
  deposits: Record<string, number>,
  id: string,
  name: string,
): number {
  return (deposits[id] ?? 0) + (deposits[name] ?? 0);
}

function CategoryHoverPanel({
  cat,
  stock,
  total,
  tierFlows,
  resources,
  deposits,
  stocks,
}: {
  cat: CategoryCurrency;
  stock: number;
  total?: { rate: number; demand: number; net: number };
  tierFlows?: Record<string, FlowCell>;
  resources: { id: string; name: string; tier: number | null }[];
  deposits: Record<string, number>;
  stocks?: Record<string, number>;
}) {
  const byTier = useMemo(() => {
    const map = new Map<
      number,
      { id: string; name: string; tier: number | null; deposits: number }[]
    >();
    for (const r of resources) {
      const t = r.tier ?? 0;
      const list = map.get(t) ?? [];
      list.push({
        ...r,
        deposits: resolveDepositCount(deposits, r.id, r.name),
      });
      map.set(t, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => b.deposits - a.deposits || a.name.localeCompare(b.name, "ru"));
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [resources, deposits]);

  const rate = total?.rate ?? 0;
  const demand = total?.demand ?? 0;
  const net = total?.net ?? 0;

  return (
    <div
      className="empire-res-popover"
      role="tooltip"
      style={{ borderColor: cat.cssVar }}
    >
      <header className="empire-res-popover-head">
        <span className="empire-res-letter" style={{ color: cat.cssVar }}>
          {cat.short}
        </span>
        <div>
          <strong>{cat.name}</strong>
          <span className="hint">{cat.role}</span>
        </div>
      </header>

      <div className="empire-res-popover-stats" aria-label="Запас и производство">
        <div>
          <span className="hint">Имеется</span>
          <strong className="empire-res-stat-num">{stock}</strong>
        </div>
        <div>
          <span className="hint">Приток</span>
          <strong className="empire-res-stat-num eco-up">{fmtSigned(rate)}</strong>
        </div>
        <div>
          <span className="hint">Спрос</span>
          <strong className="empire-res-stat-num empire-res-demand">
            −{fmtSigned(demand).replace("+", "")}
          </strong>
        </div>
        <div>
          <span className="hint">Итог / ход</span>
          <strong
            className={`empire-res-stat-num ${net >= 0 ? "eco-up" : "eco-down"}`}
          >
            {fmtSigned(net)}
          </strong>
        </div>
      </div>

      {byTier.length === 0 ? (
        <p className="hint empire-res-popover-empty">Нет ресурсов в каталоге</p>
      ) : (
        <div className="empire-res-popover-body">
          {byTier.map(([tier, list]) => {
            const cell = tierFlows?.[String(tier)];
            const owned = list.filter((r) => r.deposits > 0);
            const shown = owned.length > 0 ? owned : list.slice(0, 6);
            const more = owned.length > 0 ? list.length - owned.length : Math.max(0, list.length - 6);
            return (
              <section key={tier} className="empire-res-tier">
                <h4>
                  <span>T{tier || "?"}</span>
                  {cell && (cell.rate > 0 || cell.demand > 0) ? (
                    <span className="empire-res-tier-flow">
                      <span className="eco-up">{fmtSigned(cell.rate)}</span>
                      {" / "}
                      <span className="empire-res-demand">−{fmtSigned(cell.demand).replace("+", "")}</span>
                      {" · "}
                      <span className={cell.net >= 0 ? "eco-up" : "eco-down"}>
                        {fmtSigned(cell.net)}
                      </span>
                    </span>
                  ) : (
                    <span className="empire-res-tier-flow hint">нет потока</span>
                  )}
                </h4>
                <ul>
                  {shown.map((r) => (
                    <li key={r.id}>
                      <ResourceIcon
                        resourceId={r.id}
                        stocks={stocks}
                        size={14}
                      />
                      <span className="empire-res-tier-name">{r.name}</span>
                      <span
                        className="empire-res-tier-qty"
                        title="Месторождений на ваших планетах"
                      >
                        ×{r.deposits}
                      </span>
                    </li>
                  ))}
                </ul>
                {more > 0 && (
                  <p className="hint empire-res-tier-more">
                    ещё {more} в каталоге (нет на ваших планетах)
                  </p>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SpendCell({
  id,
  label,
  stock,
  stocks,
  onOpen,
}: {
  id: string;
  label: string;
  stock: number;
  stocks?: Record<string, number>;
  onOpen?: () => void;
}) {
  return (
    <button
      type="button"
      className="empire-res-cell empire-res-cell--spend"
      title={`${label}: ${stock} · склад`}
      aria-label={`${label}: ${stock}. Клик — склад.`}
      onClick={() => onOpen?.()}
    >
      <ResourceIcon resourceId={id} stocks={stocks} size={15} />
      <span className="empire-res-stock">{stock}</span>
    </button>
  );
}

function CategoryCell({
  cat,
  stock,
  total,
  bottleneck,
  resources,
  deposits,
  stocks,
  tierFlows,
  onSelect,
}: {
  cat: CategoryCurrency;
  stock: number;
  total?: { rate: number; demand: number; net: number };
  bottleneck?: boolean;
  resources: { id: string; name: string; tier: number | null }[];
  deposits: Record<string, number>;
  stocks?: Record<string, number>;
  tierFlows?: Record<string, FlowCell>;
  onSelect?: (letter: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const clearTimers = useCallback(() => {
    if (openTimer.current) clearTimeout(openTimer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    openTimer.current = null;
    closeTimer.current = null;
  }, []);

  const measure = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setAnchor({ left: r.left + r.width / 2, top: r.bottom + 6 });
  }, []);

  useEffect(() => () => clearTimers(), [clearTimers]);

  useLayoutEffect(() => {
    if (!open) return;
    measure();
    const onMove = () => measure();
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [open, measure]);

  const onEnter = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    if (open) return;
    openTimer.current = setTimeout(() => {
      measure();
      setOpen(true);
    }, HOVER_OPEN_MS);
  };

  const onLeave = () => {
    if (openTimer.current) {
      clearTimeout(openTimer.current);
      openTimer.current = null;
    }
    closeTimer.current = setTimeout(() => setOpen(false), HOVER_CLOSE_MS);
  };

  const net = total?.net;
  const hasNet = typeof net === "number";
  const tip = [
    `${cat.name} (${cat.short})`,
    `имеется ${stock}`,
    total
      ? `приток ${fmtSigned(total.rate)}, спрос ${fmtSigned(total.demand).replace("+", "")}, итог ${fmtSigned(total.net)}`
      : null,
    "Удержите курсор — детали. Клик — производство.",
  ]
    .filter(Boolean)
    .join(" · ");

  const popover =
    open &&
    anchor &&
    createPortal(
      <div
        id={`empire-res-pop-${cat.letter}`}
        className="empire-res-float empire-res-float--portal"
        style={{ left: anchor.left, top: anchor.top }}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
      >
        <CategoryHoverPanel
          cat={cat}
          stock={stock}
          total={total}
          tierFlows={tierFlows}
          resources={resources}
          deposits={deposits}
          stocks={stocks}
        />
      </div>,
      document.body,
    );

  return (
    <div
      ref={rootRef}
      className={`empire-res-cell${bottleneck ? " empire-res-cell--warn" : ""}${open ? " empire-res-cell--open" : ""}`}
      style={{ ["--cell-accent" as string]: cat.cssVar }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
      tabIndex={0}
      title={tip}
      aria-label={`${cat.name}: имеется ${stock}${hasNet ? `, итог ${fmtSigned(net)}` : ""}. Клик — производство.`}
      aria-expanded={open}
      aria-describedby={open ? `empire-res-pop-${cat.letter}` : undefined}
      onClick={() => onSelect?.(cat.letter)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect?.(cat.letter);
        }
      }}
    >
      <ResourceIcon resourceId={cat.id} stocks={stocks} size={15} />
      <span className="empire-res-stock" title="Имеется в казне">
        {stock}
      </span>
      {hasNet && (
        <span
          className={`empire-res-delta ${net > 0 ? "up" : net < 0 ? "down" : ""}`}
          title={`Итог за ход: ${fmtSigned(net)} (приток ${fmtSigned(total!.rate)}, спрос ${fmtSigned(total!.demand).replace("+", "")})`}
        >
          {fmtSigned(net)}
        </span>
      )}
      {popover}
    </div>
  );
}

export function EmpireResourceStrip({
  economy,
  flowData,
  world,
  factionId,
  reservedAp,
  apMax,
  reservedForceAp = 0,
  forceApMax = 0,
  fleetCount,
  legionCount,
  mapResources,
  onOpenForces,
  onOpenCategory,
  onOpenStockpile,
  compact = false,
  trailing,
}: {
  economy?: ViewerPayload["economy"];
  flowData?: EconomyFlowBreakdown | null;
  world?: WorldState;
  factionId?: string;
  reservedAp: number;
  apMax: number;
  reservedForceAp?: number;
  forceApMax?: number;
  fleetCount: number;
  legionCount: number;
  mapResources?: Record<string, MapResourceDef>;
  onOpenForces?: () => void;
  onOpenCategory?: (letter: string) => void;
  onOpenStockpile?: () => void;
  compact?: boolean;
  trailing?: ReactNode;
}) {
  const index = useMemo(
    () => buildResourceIndex(mapResources),
    [mapResources],
  );
  const deposits = useMemo(
    () => countOwnedDeposits(world, factionId),
    [world, factionId],
  );
  const bottlenecks = flowData?.bottlenecks ?? economy?.bottlenecks ?? {};
  const stocks = economy?.stocks;
  const totals = flowData?.totals;
  const fac = world?.factions?.find((f) => f.id === factionId);
  const pegId = resolveTreasuryCurrencyId(fac);
  const spendIds: string[] = [BUILD_METAL.id, BUILD_SUPPLY.id];
  if (
    pegId &&
    pegId !== BUILD_METAL.id &&
    pegId !== BUILD_SUPPLY.id &&
    !CATEGORY_CURRENCIES.some((c) => c.id === pegId)
  ) {
    spendIds.push(pegId);
  }

  return (
    <div
      className={`empire-res-strip${compact ? " empire-res-strip--compact" : ""}`}
      aria-label="Ресурсы державы"
    >
      <div className="empire-res-cats empire-res-cats--spend" role="list">
        {spendIds.map((id) => (
          <SpendCell
            key={id}
            id={id}
            label={
              id === BUILD_METAL.id
                ? BUILD_METAL.label
                : id === BUILD_SUPPLY.id
                  ? BUILD_SUPPLY.label
                  : resourceDisplayName(id)
            }
            stock={stocks?.[id] ?? 0}
            stocks={stocks}
            onOpen={onOpenStockpile}
          />
        ))}
      </div>
      <span className="empire-res-sep" aria-hidden />
      <div className="empire-res-cats" role="list">
        {CATEGORY_CURRENCIES.map((cat) => (
          <CategoryCell
            key={cat.id}
            cat={cat}
            stock={stocks?.[cat.id] ?? 0}
            total={totals?.[cat.letter]}
            bottleneck={cat.letter in bottlenecks}
            resources={index.byCategoryDeposits[cat.letter] ?? []}
            deposits={deposits}
            stocks={stocks}
            tierFlows={flowData?.flows?.[cat.letter]}
            onSelect={onOpenCategory}
          />
        ))}
      </div>
      <span className="empire-res-sep" aria-hidden />
      <span
        className="empire-res-pill empire-res-pill--ap"
        title={OD_TOOLTIP}
      >
        {formatOdHud(reservedAp, apMax)}
      </span>
      <span
        className="empire-res-pill empire-res-pill--ap"
        title={FORCE_OD_TOOLTIP}
      >
        {formatForceOdHud(reservedForceAp, forceApMax)}
      </span>
      <button
        type="button"
        className="empire-res-pill empire-res-pill--forces"
        title="Флоты и легионы"
        onClick={onOpenForces}
      >
        Фл {fleetCount} · Лег {legionCount}
      </button>
      {economy?.deficit && economy.deficit !== "нет" && (
        <span
          className="empire-res-pill empire-res-pill--warn"
          title={`Дефицит: ${economy.deficit}`}
        >
          Дефицит
        </span>
      )}
      {trailing}
    </div>
  );
}
