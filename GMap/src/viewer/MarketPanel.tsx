import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";
import type { EconomySchema, MapResourceDef } from "../state/contentCatalog";
import { fetchContent, intentApCost } from "../state/contentCatalog";
import {
  BUILD_METAL,
  BUILD_SUPPLY,
  CATEGORY_CURRENCIES,
  categoryByLetter,
} from "../state/economyLabels";
import { DIPLOMACY_LABELS } from "../state/defaults";
import type { DiplomacyRelation, ViewerPayload } from "../state/types";
import { ResourceIcon } from "../ui/ResourceIcon";
import { ExpandableSection } from "../ui/ExpandableSection";
import { StatefulButton } from "../ui/StatefulButton";

type MarketSchema = NonNullable<EconomySchema["market"]>;
export type MarketTab = "quotes" | "currencies" | "trade" | "superpowers";
type Tab = MarketTab;

export type MarketBookStats = {
  myOffers: number;
  peerLots: number;
};

export const MARKET_TAB_ORDER: { id: MarketTab; label: string; hotkey: string }[] = [
  { id: "quotes", label: "Ресурсы", hotkey: "1" },
  { id: "currencies", label: "Валюты", hotkey: "2" },
  { id: "trade", label: "Торговля", hotkey: "3" },
  { id: "superpowers", label: "Сверхдержавы", hotkey: "4" },
];
type TradeVenue = "contacts" | "common";
type HistoryPoint = { turn: number; price: number; volume: number };

type FactionCurrency = {
  id: string;
  name: string;
  short?: string;
  peg?: string | null;
  pegLabel?: string;
  strength?: string;
  blurb?: string;
  lastUc?: number;
};

export type MarketBookOffer = {
  id: string;
  factionId: string;
  side: "sell" | "buy";
  giveCurrency: string;
  giveAmount: number;
  wantCurrency: string;
  wantAmount: number;
  createdTurn: number;
  venue?: "common" | "contacts";
};

type TradePartner = {
  id: string;
  name: string;
  color: string | null;
  relation: DiplomacyRelation;
};

type SuperListing = {
  id: string;
  kind: string;
  label: string;
  summary?: string;
  minRelation?: string;
  unlocked?: boolean;
  lockedReason?: string | null;
  give?: { currencyId: string; amount: number };
  want?: { currencyId: string; amount: number };
};

type SuperpowerCard = {
  id: string;
  title: string;
  blurb: string;
  color: string | null;
  relation: DiplomacyRelation;
  listings: SuperListing[];
};

const UC = "fx.universal_credit";
const CAT_FILTERS = ["ALL", "A", "B", "C", "D", "E", "F"] as const;

const TABS = MARKET_TAB_ORDER;

const STRENGTH_LABEL: Record<string, string> = {
  reserve_apex: "резерв · топ",
  hard_peg: "жёсткий пег",
  regional_hard: "региональный",
  commodity_peg: "товарный пег",
  numeraire: "расчётная · 1 UC",
};

const CURRENCY_LABELS: Record<string, string> = {
  ...Object.fromEntries(
    CATEGORY_CURRENCIES.map((c) => [c.id, `${c.name} (${c.short})`]),
  ),
  [BUILD_METAL.id]: BUILD_METAL.label,
  [BUILD_SUPPLY.id]: BUILD_SUPPLY.label,
};

const TRADE_CURRENCIES = Object.keys(CURRENCY_LABELS);

function parseRatePair(pairStr: string): { from: string; to: string } | null {
  const parts = pairStr.split(/→|->/).map((s) => s.trim());
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return { from: parts[0], to: parts[1] };
}

function previewConvert(
  rates: MarketSchema["placeholder_rates"],
  fromCurrency: string,
  toCurrency: string,
  amountFrom: number,
): number | null {
  if (!rates || amountFrom <= 0 || fromCurrency === toCurrency) return null;
  for (const row of rates) {
    const pair = parseRatePair(row.pair);
    if (!pair) continue;
    if (pair.from === fromCurrency && pair.to === toCurrency) {
      const sell = Number(row.sell ?? row.buy);
      if (!Number.isFinite(sell) || sell <= 0) return null;
      return Math.floor(amountFrom * sell);
    }
    if (pair.from === toCurrency && pair.to === fromCurrency) {
      const buy = Number(row.buy ?? row.sell);
      if (!Number.isFinite(buy) || buy <= 0) return null;
      return Math.floor(amountFrom / buy);
    }
  }
  return null;
}

function labelOf(
  id: string,
  resources: MapResourceDef[],
  fx: FactionCurrency[],
): string {
  if (CURRENCY_LABELS[id]) return CURRENCY_LABELS[id];
  const r = resources.find((x) => x.id === id);
  if (r) return r.name;
  const f = fx.find((x) => x.id === id);
  if (f) return f.name;
  return id.replace(/^(currency|map|fx)\./, "");
}

function categoryCurrencyId(category: string | undefined): string | null {
  if (!category || category === "ALL") return null;
  return categoryByLetter(category)?.id ?? null;
}

function offerTouchesCurrency(o: MarketBookOffer, currencyId: string): boolean {
  return o.giveCurrency === currencyId || o.wantCurrency === currencyId;
}

function normalizeChartPoints(raw: HistoryPoint[]): HistoryPoint[] {
  const sorted = [...raw]
    .filter((p) => Number.isFinite(p.price))
    .sort((a, b) => a.turn - b.turn || 0);
  if (sorted.length === 1) {
    const only = sorted[0]!;
    return [
      only,
      { turn: only.turn + 1, price: only.price, volume: only.volume },
    ];
  }
  return sorted;
}

function seriesStats(prices: number[]) {
  if (!prices.length) {
    return { last: 0, prev: 0, delta: 0, deltaPct: 0, min: 0, max: 0 };
  }
  const last = prices[prices.length - 1]!;
  const prev = prices.length > 1 ? prices[prices.length - 2]! : last;
  const delta = last - prev;
  const deltaPct = prev !== 0 ? (delta / prev) * 100 : 0;
  return {
    last,
    prev,
    delta,
    deltaPct,
    min: Math.min(...prices),
    max: Math.max(...prices),
  };
}

function pointsFromSeries(
  series: number[] | undefined,
  turnStart = 4,
): HistoryPoint[] {
  if (!series?.length) return [];
  return series.map((price, i) => ({
    turn: turnStart + i,
    price,
    volume: 1,
  }));
}

function pickChartPoints(
  id: string,
  historyPairs: Record<string, HistoryPoint[]>,
  seedSeries: Record<string, number[]>,
  turnStart: number,
): HistoryPoint[] {
  const preferred = `${id}->${UC}`;
  const live = historyPairs[preferred];
  const liveNorm = live?.length ? normalizeChartPoints(live) : [];
  const seedNorm = normalizeChartPoints(
    pointsFromSeries(seedSeries[id], turnStart),
  );

  if (liveNorm.length >= 2 && liveNorm.length >= seedNorm.length) {
    return liveNorm;
  }
  if (seedNorm.length >= 2) return seedNorm;

  const altKey = Object.keys(historyPairs).find((k) => k.startsWith(`${id}->`));
  if (altKey && historyPairs[altKey]?.length) {
    const alt = normalizeChartPoints(historyPairs[altKey]!);
    if (alt.length >= 2) return alt;
  }
  return liveNorm.length ? liveNorm : seedNorm;
}

function MiniSpark({ values }: { values: number[] }) {
  if (values.length < 2) {
    return <span className="ex-mini-spark ex-mini-spark--empty" aria-hidden />;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const w = 48;
  const h = 16;
  const pts = values
    .slice(-12)
    .map((v, i, arr) => {
      const x = (i / Math.max(1, arr.length - 1)) * w;
      const y = h - ((v - min) / span) * (h - 2) - 1;
      return `${x},${y}`;
    })
    .join(" ");
  const up = values[values.length - 1]! >= values[0]!;
  return (
    <svg
      className={`ex-mini-spark ${up ? "is-up" : "is-down"}`}
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      aria-hidden
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        points={pts}
      />
    </svg>
  );
}

function PriceChart({
  points,
  emptyHint,
}: {
  points: HistoryPoint[];
  emptyHint: string;
}) {
  const gid = useId().replace(/:/g, "");
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);

  const normalized = useMemo(() => normalizeChartPoints(points), [points]);

  if (normalized.length < 2) {
    return (
      <div className="ex-chart-empty">
        <p className="hint">{emptyHint}</p>
      </div>
    );
  }

  const prices = normalized.map((p) => p.price);
  const stats = seriesStats(prices);
  const W = 640;
  const H = 200;
  const padL = 54;
  const padR = 16;
  const padT = 14;
  const padB = 30;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const span = stats.max - stats.min || Math.max(stats.max * 0.01, 0.0001);
  const yMin = stats.min - span * 0.06;
  const yMax = stats.max + span * 0.06;
  const ySpan = yMax - yMin || 1;

  const coords = normalized.map((p, i) => {
    const x = padL + (i / Math.max(1, normalized.length - 1)) * plotW;
    const y = padT + plotH - ((p.price - yMin) / ySpan) * plotH;
    return { x, y, turn: p.turn, price: p.price };
  });

  const line = coords.map((c) => `${c.x},${c.y}`).join(" ");
  const area = `${padL},${padT + plotH} ${line} ${padL + plotW},${padT + plotH}`;
  const active = hoverIdx != null ? coords[hoverIdx] : coords[coords.length - 1];
  const trendUp = stats.delta >= 0;
  const gridSteps = 4;

  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const rect = chartRef.current?.getBoundingClientRect();
    if (!rect?.width) return;
    const ratio = Math.max(
      0,
      Math.min(1, (e.clientX - rect.left) / rect.width),
    );
    const idx = Math.round(ratio * (coords.length - 1));
    setHoverIdx(idx);
  };

  return (
    <div
      className={`ex-chart-frame ${trendUp ? "is-up" : "is-down"}`}
      ref={chartRef}
      onMouseMove={onMove}
      onMouseLeave={() => setHoverIdx(null)}
    >
      <div className="ex-chart-head">
        <span className="hint">Котировка UC</span>
        <strong className="ex-chart-live">
          {active ? active.price.toFixed(4) : "—"}
          {hoverIdx != null && active ? (
            <small className="hint"> · ход {active.turn}</small>
          ) : null}
        </strong>
        <span className="hint ex-chart-range">
          min {stats.min.toFixed(3)} · max {stats.max.toFixed(3)}
        </span>
      </div>
      <div className={`ex-chart ${trendUp ? "is-up" : "is-down"}`}>
        <svg
          className="ex-chart-svg"
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={`Цена ${stats.last.toFixed(4)} UC, ходы ${normalized[0]!.turn}–${normalized[normalized.length - 1]!.turn}`}
        >
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.42" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {Array.from({ length: gridSteps + 1 }, (_, i) => {
            const y = padT + (i / gridSteps) * plotH;
            const val = yMax - (i / gridSteps) * ySpan;
            return (
              <g key={i} className="ex-chart-grid">
                <line
                  x1={padL}
                  y1={y}
                  x2={padL + plotW}
                  y2={y}
                  stroke="currentColor"
                  strokeOpacity="0.12"
                />
                <text
                  x={padL - 6}
                  y={y + 3}
                  textAnchor="end"
                  className="ex-chart-axis-label"
                >
                  {val.toFixed(val >= 10 ? 1 : 3)}
                </text>
              </g>
            );
          })}

          <polygon fill={`url(#${gid})`} points={area} />
          <polyline
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            points={line}
          />

          {coords.map((c, i) => (
            <circle
              key={`${c.turn}-${i}`}
              cx={c.x}
              cy={c.y}
              r={hoverIdx === i ? 5 : 2.5}
              fill="currentColor"
              opacity={hoverIdx == null || hoverIdx === i ? 1 : 0.35}
            />
          ))}

          {active && hoverIdx != null ? (
            <>
              <line
                x1={active.x}
                y1={padT}
                x2={active.x}
                y2={padT + plotH}
                stroke="currentColor"
                strokeOpacity="0.35"
                strokeDasharray="4 3"
              />
              <circle cx={active.x} cy={active.y} r="6" fill="none" stroke="currentColor" strokeWidth="2" />
            </>
          ) : null}

          <text
            x={padL}
            y={H - 8}
            className="ex-chart-axis-label"
            textAnchor="start"
          >
            ход {normalized[0]!.turn}
          </text>
          <text
            x={padL + plotW}
            y={H - 8}
            className="ex-chart-axis-label"
            textAnchor="end"
          >
            ход {normalized[normalized.length - 1]!.turn}
          </text>
        </svg>
      </div>
    </div>
  );
}

function Ticker({
  prices,
  extra,
}: {
  prices: number[];
  extra?: { label: string; value: string }[];
}) {
  const s = seriesStats(prices);
  const cls =
    prices.length < 2 ? "" : s.delta > 0 ? "is-up" : s.delta < 0 ? "is-down" : "";
  return (
    <div className={`ex-ticker ex-ticker--board ${cls}`}>
      <div className="ex-ticker-cell ex-ticker-cell--hero">
        <span className="hq-stat-label">UC</span>
        <strong className="ex-ticker-price">
          {prices.length ? s.last.toFixed(4) : "—"}
        </strong>
      </div>
      <div className="ex-ticker-cell">
        <span className="hq-stat-label">Δ ход</span>
        <strong>
          {prices.length >= 2
            ? `${s.delta >= 0 ? "+" : ""}${s.deltaPct.toFixed(1)}%`
            : "—"}
        </strong>
      </div>
      <div className="ex-ticker-cell">
        <span className="hq-stat-label">Окно</span>
        <strong>{prices.length ? `${prices.length} ход.` : "—"}</strong>
      </div>
      {(extra ?? []).map((e) => (
        <div className="ex-ticker-cell" key={e.label}>
          <span className="hq-stat-label">{e.label}</span>
          <strong className="ex-ticker-text">{e.value}</strong>
        </div>
      ))}
    </div>
  );
}

/**
 * Exchange desk: quotes / FX / peer trade / superpowers.
 */
export function MarketPanel({
  interactive,
  factionId,
  password,
  economy,
  reservedAp = 0,
  apMax = 0,
  orderMsg,
  tradePartnerIds,
  worldFactions,
  systems,
  mapSelectedSystemId,
  onConvert,
  onPlaceOffer,
  onCancelOffer,
  onEconomyPatch,
  asRoom,
  tab: controlledTab,
  onTabChange,
  onOpenDiplomacy,
  onBookStats,
}: {
  compact?: boolean;
  interactive?: boolean;
  factionId?: string;
  password?: string;
  economy?: ViewerPayload["economy"];
  reservedAp?: number;
  apMax?: number;
  orderMsg?: string | null;
  tradePartnerIds?: string[];
  worldFactions?: { id: string; name: string; color?: string }[];
  systems?: { id: string; name: string }[];
  mapSelectedSystemId?: string | null;
  onConvert?: (
    fromCurrency: string,
    toCurrency: string,
    amountFrom: number,
  ) => void;
  onPlaceOffer?: (
    side: "sell" | "buy",
    giveCurrency: string,
    giveAmount: number,
    wantCurrency: string,
    wantAmount: number,
    venue: "common" | "contacts",
  ) => void;
  onCancelOffer?: (offerId: string) => void;
  onEconomyPatch?: (eco: ViewerPayload["economy"]) => void;
  asRoom?: boolean;
  tab?: MarketTab;
  onTabChange?: (tab: MarketTab) => void;
  onOpenDiplomacy?: () => void;
  onBookStats?: (stats: MarketBookStats) => void;
}) {
  const [internalTab, setInternalTab] = useState<Tab>("quotes");
  const tab = controlledTab ?? internalTab;
  const setTab = useCallback(
    (next: Tab) => {
      if (onTabChange) onTabChange(next);
      else setInternalTab(next);
    },
    [onTabChange],
  );
  const [venue, setVenue] = useState<TradeVenue>("contacts");
  const [ready, setReady] = useState(false);
  const [market, setMarket] = useState<MarketSchema | null>(null);
  const [resources, setResources] = useState<MapResourceDef[]>([]);
  const [fx, setFx] = useState<FactionCurrency[]>([]);
  const [seedSeries, setSeedSeries] = useState<Record<string, number[]>>({});
  const [turnStart, setTurnStart] = useState(4);
  const [narrative, setNarrative] = useState<string | null>(null);
  const [historyPairs, setHistoryPairs] = useState<
    Record<string, HistoryPoint[]>
  >({});

  const [book, setBook] = useState<MarketBookOffer[]>([]);
  const [partners, setPartners] = useState<TradePartner[]>([]);
  const [commonJoined, setCommonJoined] = useState(false);
  const [commonMembers, setCommonMembers] = useState<
    { id: string; name: string; color: string | null }[]
  >([]);
  const [superpowers, setSuperpowers] = useState<SuperpowerCard[]>([]);
  const [bookBusy, setBookBusy] = useState(false);
  const [localMsg, setLocalMsg] = useState<string | null>(null);

  const [resourceId, setResourceId] = useState("map.blumatid");
  const [fxId, setFxId] = useState("fx.damyl_doubloon");
  const [catFilter, setCatFilter] =
    useState<(typeof CAT_FILTERS)[number]>("ALL");
  const [query, setQuery] = useState("");
  const [focusPartnerId, setFocusPartnerId] = useState("");
  const [scoutSystemId, setScoutSystemId] = useState(
    () => mapSelectedSystemId ?? "",
  );

  const [offerSide, setOfferSide] = useState<"sell" | "buy">("sell");
  const [giveCurrency, setGiveCurrency] = useState(TRADE_CURRENCIES[0] ?? "");
  const [wantCurrency, setWantCurrency] = useState(TRADE_CURRENCIES[1] ?? "");
  const [giveAmount, setGiveAmount] = useState("");
  const [wantAmount, setWantAmount] = useState("");
  const [pairKey, setPairKey] = useState("");
  const [convertAmount, setConvertAmount] = useState("");

  const tabsRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const composeRef = useRef<HTMLElement>(null);
  const [tabIndicator, setTabIndicator] = useState({ left: 0, width: 0 });
  const [composeHint, setComposeHint] = useState<string | null>(null);
  const [offerSubmitting, setOfferSubmitting] = useState(false);
  const [offerSuccess, setOfferSuccess] = useState(false);
  const [superBusy, setSuperBusy] = useState<string | null>(null);
  const [superSuccess, setSuperSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (mapSelectedSystemId) setScoutSystemId(mapSelectedSystemId);
  }, [mapSelectedSystemId]);

  useEffect(() => {
    const root = tabsRef.current;
    if (!root) return;
    const update = () => {
      const active = root.querySelector<HTMLElement>(".ex-mode-tab.on");
      if (!active) return;
      const pr = root.getBoundingClientRect();
      const ar = active.getBoundingClientRect();
      setTabIndicator({ left: ar.left - pr.left, width: ar.width });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(root);
    return () => ro.disconnect();
  }, [tab]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey
      ) {
        return;
      }
      if (e.key === "/" && (tab === "quotes" || tab === "currencies")) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tab]);

  useEffect(() => {
    if (!orderMsg) return;
    setOfferSuccess(true);
  }, [orderMsg]);

  useEffect(() => {
    let cancelled = false;
    void fetchContent().then((c) => {
      if (cancelled || !c) {
        if (!cancelled) setReady(true);
        return;
      }
      setMarket(c.economy_schema?.market ?? null);
      const mapList = Object.values(c.map_resources ?? {}).filter(
        (r): r is MapResourceDef => Boolean(r?.id && r.name),
      );
      mapList.sort((a, b) => {
        const ca = String(a.category ?? "Z");
        const cb = String(b.category ?? "Z");
        if (ca !== cb) return ca.localeCompare(cb);
        return (
          (a.tier ?? 99) - (b.tier ?? 99) ||
          a.name.localeCompare(b.name, "ru")
        );
      });
      setResources(mapList);
      if (mapList.some((r) => r.id === "map.blumatid")) {
        setResourceId("map.blumatid");
      } else if (mapList[0]) {
        setResourceId(mapList[0].id);
      }

      const fxDict = c.faction_currencies ?? {};
      const fxList = Object.values(fxDict).sort(
        (a, b) => (b.lastUc ?? 0) - (a.lastUc ?? 0),
      );
      setFx(fxList);
      if (fxList[0]) setFxId(fxList[0].id);

      const seed = c.market_quote_seed;
      const series: Record<string, number[]> = {};
      for (const [id, row] of Object.entries(seed?.resources ?? {})) {
        if (Array.isArray(row.series) && row.series.length) {
          series[id] = row.series;
        }
      }
      for (const [id, row] of Object.entries(seed?.currencies ?? {})) {
        if (Array.isArray(row.series) && row.series.length) {
          series[id] = row.series;
        }
      }
      setSeedSeries(series);
      setTurnStart(seed?.meta?.turnStart ?? 4);
      setNarrative(seed?.meta?.narrative ?? null);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshBook = useCallback(async () => {
    if (!factionId || !password) {
      setBook([]);
      return;
    }
    setBookBusy(true);
    try {
      const res = await fetch("/api/market/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          factionId,
          password,
          venue: tab === "trade" ? venue : "all",
        }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        offers?: MarketBookOffer[];
        partners?: TradePartner[];
        commonMarket?: {
          joined?: boolean;
          members?: { id: string; name: string; color: string | null }[];
        };
        history?: { pairs?: Record<string, HistoryPoint[]> };
        superpowers?: SuperpowerCard[];
        factionCurrencies?: Record<string, FactionCurrency>;
      };
      setBook(Array.isArray(data.offers) ? data.offers : []);
      if (Array.isArray(data.partners)) setPartners(data.partners);
      setCommonJoined(!!data.commonMarket?.joined);
      setCommonMembers(
        Array.isArray(data.commonMarket?.members)
          ? data.commonMarket!.members!
          : [],
      );
      if (data.history?.pairs) setHistoryPairs(data.history.pairs);
      if (Array.isArray(data.superpowers)) setSuperpowers(data.superpowers);
      if (data.factionCurrencies && Object.keys(data.factionCurrencies).length) {
        setFx(
          Object.values(data.factionCurrencies).sort(
            (a, b) => (b.lastUc ?? 0) - (a.lastUc ?? 0),
          ),
        );
      }
      const offers = Array.isArray(data.offers) ? data.offers : [];
      onBookStats?.({
        myOffers: factionId
          ? offers.filter((o) => o.factionId === factionId).length
          : 0,
        peerLots: factionId
          ? offers.filter((o) => o.factionId !== factionId).length
          : offers.length,
      });
    } catch {
      /* ignore */
    } finally {
      setBookBusy(false);
    }
  }, [factionId, password, tab, venue, onBookStats]);

  useEffect(() => {
    void refreshBook();
  }, [refreshBook]);

  /** Prefer live history when rich enough; else seed series. */
  const pricesOf = useCallback(
    (id: string): number[] =>
      pickChartPoints(id, historyPairs, seedSeries, turnStart).map((p) => p.price),
    [historyPairs, seedSeries, turnStart],
  );

  const pointsOf = useCallback(
    (id: string): HistoryPoint[] =>
      pickChartPoints(id, historyPairs, seedSeries, turnStart),
    [historyPairs, seedSeries, turnStart],
  );

  const filteredResources = useMemo(() => {
    const q = query.trim().toLowerCase();
    return resources.filter((r) => {
      if (catFilter !== "ALL" && r.category !== catFilter) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q) ||
        String(r.category ?? "")
          .toLowerCase()
          .includes(q)
      );
    });
  }, [resources, catFilter, query]);

  const selectedResource =
    resources.find((r) => r.id === resourceId) ?? filteredResources[0] ?? null;
  const selectedFx = fx.find((c) => c.id === fxId) ?? fx[0] ?? null;

  const fallbackPartners = useMemo((): TradePartner[] => {
    if (partners.length > 0) return partners;
    return (tradePartnerIds ?? []).map((id) => {
      const f = worldFactions?.find((x) => x.id === id);
      return {
        id,
        name: f?.name ?? id,
        color: f?.color ?? null,
        relation: "trade" as DiplomacyRelation,
      };
    });
  }, [partners, tradePartnerIds, worldFactions]);

  const rates = market?.placeholder_rates ?? [];
  const convertAp = intentApCost("intent.market_convert");
  const offerAp = intentApCost("intent.market_offer");

  const tradablePairs = useMemo(() => {
    const out: { from: string; to: string; label: string }[] = [];
    for (const row of rates) {
      const pair = parseRatePair(row.pair);
      if (!pair) continue;
      out.push({
        from: pair.from,
        to: pair.to,
        label: `${labelOf(pair.from, resources, fx)} → ${labelOf(pair.to, resources, fx)}`,
      });
      out.push({
        from: pair.to,
        to: pair.from,
        label: `${labelOf(pair.to, resources, fx)} → ${labelOf(pair.from, resources, fx)}`,
      });
    }
    return out;
  }, [rates, resources, fx]);

  useEffect(() => {
    if (!pairKey && tradablePairs.length > 0) {
      setPairKey(`${tradablePairs[0].from}|${tradablePairs[0].to}`);
    }
  }, [pairKey, tradablePairs]);

  const selectedPair = useMemo(() => {
    const [from, to] = pairKey.split("|");
    if (!from || !to) return null;
    return { from, to };
  }, [pairKey]);

  const parsedConvertAmount = Math.floor(Number(convertAmount));
  const convertStock = selectedPair
    ? (economy?.stocks?.[selectedPair.from] ?? 0)
    : 0;
  const previewTo =
    selectedPair && parsedConvertAmount > 0
      ? previewConvert(
          rates,
          selectedPair.from,
          selectedPair.to,
          parsedConvertAmount,
        )
      : null;
  const canConvert =
    interactive &&
    !!onConvert &&
    !!selectedPair &&
    parsedConvertAmount > 0 &&
    parsedConvertAmount <= convertStock &&
    previewTo != null &&
    previewTo > 0 &&
    reservedAp + convertAp <= apMax;

  const parsedGive = Math.floor(Number(giveAmount));
  const parsedWant = Math.floor(Number(wantAmount));
  const offerStock = economy?.stocks?.[giveCurrency] ?? 0;
  const canPlaceOffer =
    interactive &&
    !!onPlaceOffer &&
    (venue === "common" ? commonJoined : fallbackPartners.length > 0) &&
    parsedGive > 0 &&
    parsedWant > 0 &&
    giveCurrency !== wantCurrency &&
    parsedGive <= offerStock &&
    reservedAp + offerAp <= apMax;

  const myOffers = useMemo(
    () =>
      factionId
        ? book.filter(
            (o) =>
              o.factionId === factionId &&
              (o.venue ?? "contacts") === venue,
          )
        : [],
    [book, factionId, venue],
  );

  const listings = useMemo(() => {
    return book.filter((o) => {
      if (o.factionId === factionId) return false;
      if (venue === "contacts" && focusPartnerId) {
        return o.factionId === focusPartnerId;
      }
      return true;
    });
  }, [book, factionId, venue, focusPartnerId]);

  const sells = listings.filter((o) => o.side === "sell");
  const buys = listings.filter((o) => o.side === "buy");

  const partnerName = (id: string) =>
    fallbackPartners.find((p) => p.id === id)?.name ??
    commonMembers.find((m) => m.id === id)?.name ??
    worldFactions?.find((f) => f.id === id)?.name ??
    id;

  const peerLots = useMemo(
    () => (factionId ? book.filter((o) => o.factionId !== factionId) : book),
    [book, factionId],
  );

  const countLotsForCurrency = useCallback(
    (currencyId: string | null) => {
      if (!currencyId) return 0;
      return peerLots.filter((o) => offerTouchesCurrency(o, currencyId)).length;
    },
    [peerLots],
  );

  const applyLotToCompose = useCallback(
    (o: MarketBookOffer) => {
      setTab("trade");
      setVenue(o.venue ?? "contacts");
      setFocusPartnerId(o.factionId);
      setOfferSide(o.side === "sell" ? "buy" : "sell");
      setGiveCurrency(o.wantCurrency);
      setGiveAmount(String(o.wantAmount));
      setWantCurrency(o.giveCurrency);
      setWantAmount(String(o.giveAmount));
      setComposeHint(
        `Ответ на заявку ${partnerName(o.factionId)} — проверьте суммы и разместите`,
      );
      requestAnimationFrame(() => {
        composeRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    },
    [setTab, partnerName],
  );

  const goToTradeForCategory = useCallback(
    (category: string | undefined) => {
      const cur = categoryCurrencyId(category);
      setTab("trade");
      if (cur && TRADE_CURRENCIES.includes(cur)) {
        setGiveCurrency(cur);
        const alt = TRADE_CURRENCIES.find((c) => c !== cur);
        if (alt) setWantCurrency(alt);
      }
      setComposeHint(
        cur
          ? `Торговля категории ${category} — выставьте заявку A–F`
          : "Торговля категорий A–F",
      );
      requestAnimationFrame(() => {
        composeRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    },
    [setTab],
  );

  const toggleCommon = async (join: boolean) => {
    if (!factionId || !password) return;
    setLocalMsg(null);
    try {
      const res = await fetch("/api/market/membership", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ factionId, password, join }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      setCommonJoined(!!data.joined);
      setLocalMsg(data.joined ? "Вступили в общий рынок" : "Вышли из общего рынка");
      void refreshBook();
    } catch (e) {
      setLocalMsg(e instanceof Error ? e.message : String(e));
    }
  };

  const buySuperListing = async (listingId: string, needsSystem: boolean) => {
    if (!factionId || !password) return;
    setLocalMsg(null);
    setSuperBusy(listingId);
    try {
      const res = await fetch("/api/market/superpower", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          factionId,
          password,
          listingId,
          systemId: needsSystem ? scoutSystemId || undefined : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      if (data.economy) onEconomyPatch?.(data.economy);
      if (Array.isArray(data.superpowers)) setSuperpowers(data.superpowers);
      setSuperSuccess(listingId);
      setLocalMsg(
        data.kind === "service_scout"
          ? `Разведка: открыто ${data.revealedSystemIds?.length ?? 0}`
          : "Сделка со сверхдержавой выполнена",
      );
    } catch (e) {
      setLocalMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setSuperBusy(null);
    }
  };

  if (!ready) {
    return (
      <div className="hq-panel exchange-desk">
        <p className="hint">Загрузка биржи…</p>
      </div>
    );
  }

  const resPrices = selectedResource ? pricesOf(selectedResource.id) : [];
  const resPoints = selectedResource ? pointsOf(selectedResource.id) : [];
  const fxPrices = selectedFx ? pricesOf(selectedFx.id) : [];
  const fxPoints = selectedFx ? pointsOf(selectedFx.id) : [];

  const lotCard = (o: MarketBookOffer) => (
    <li key={o.id}>
      <button
        type="button"
        className={`ex-lot ${o.side === "sell" ? "is-sell" : "is-buy"}`}
        onClick={() => applyLotToCompose(o)}
        title="Ответить заявкой"
      >
        <div className="ex-lot-side">
          {o.side === "sell" ? "Продажа" : "Покупка"}
          <span className="ex-lot-reply hint"> · ответить</span>
        </div>
        <div className="ex-lot-swap">
          <span className="ex-lot-leg">
            <ResourceIcon resourceId={o.giveCurrency} size={16} />
            <strong>{o.giveAmount}</strong>
          </span>
          <span className="ex-lot-arrow" aria-hidden>
            →
          </span>
          <span className="ex-lot-leg">
            <ResourceIcon resourceId={o.wantCurrency} size={16} />
            <strong>{o.wantAmount}</strong>
          </span>
        </div>
        <div className="ex-lot-meta">
          <span className="hint">{partnerName(o.factionId)}</span>
        </div>
      </button>
    </li>
  );

  const body = (
    <div className="exchange-desk">
      <header className={asRoom === false ? "ex-head ex-head--embed" : "ex-head"}>
        {asRoom !== false && (
          <div>
            <h2>Биржа</h2>
            <p className="hint">
              Котировки UC · валюты · заявки A–F · сверхдержавы
            </p>
          </div>
        )}
        <div
          className="ex-mode-tabs"
          ref={tabsRef}
          role="tablist"
          aria-label="Разделы биржи"
        >
          <span
            className="ex-mode-tab-indicator"
            aria-hidden
            style={{
              transform: `translateX(${tabIndicator.left}px)`,
              width: tabIndicator.width,
            }}
          />
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`ex-mode-tab ${tab === t.id ? "on" : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
              <kbd className="ex-tab-kbd">{t.hotkey}</kbd>
            </button>
          ))}
        </div>
      </header>

      {(localMsg || orderMsg) && (
        <p className="ex-toast hint" role="status">
          {localMsg || orderMsg}
        </p>
      )}
      {narrative && (tab === "quotes" || tab === "currencies") && (
        <p className="ex-narrative hint">{narrative}</p>
      )}

      {tab === "quotes" && (
        <div className="ex-bento">
          <aside className="ex-rail">
            <h3>Ресурсы · {filteredResources.length}</h3>
            <input
              ref={searchRef}
              className="ex-rail-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск… (/"
            />
            <div className="ex-cat-filters">
              {CAT_FILTERS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`ex-cat-filter ${catFilter === c ? "on" : ""}`}
                  onClick={() => setCatFilter(c)}
                >
                  {c === "ALL" ? "Все" : c}
                </button>
              ))}
            </div>
            {filteredResources.length === 0 ? (
              <div className="ex-empty">
                <p className="hint">
                  {resources.length === 0
                    ? "Каталог ресурсов не загрузился. Обновите страницу / перезапустите сервер."
                    : "Нет совпадений по фильтру."}
                </p>
              </div>
            ) : (
              <ul className="ex-rail-list">
                {filteredResources.map((r) => {
                  const prices = pricesOf(r.id);
                  const delta =
                    prices.length >= 2
                      ? prices[prices.length - 1]! - prices[prices.length - 2]!
                      : 0;
                  const last = prices[prices.length - 1];
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        className={`ex-rail-btn ${resourceId === r.id ? "on" : ""}`}
                        onClick={() => setResourceId(r.id)}
                      >
                        <ResourceIcon resourceId={r.id} size={22} />
                        <span className="ex-rail-meta">
                          <strong>{r.name}</strong>
                          <span className="hint">
                            {r.category ?? "—"}
                            {r.tier != null ? ` · T${r.tier}` : ""}
                            {last != null ? ` · ${last.toFixed(4)}` : ""}
                            {prices.length >= 2 ? (
                              <span
                                className={`ex-delta-inline ${delta >= 0 ? "is-up" : "is-down"}`}
                              >
                                {" "}
                                {delta >= 0 ? "▲" : "▼"}
                              </span>
                            ) : null}
                          </span>
                        </span>
                        <MiniSpark values={prices} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </aside>

          <section className="ex-main">
            {selectedResource ? (
              <div className="ex-hero">
                <div className="ex-hero-top">
                  <div className="ex-hero-identity">
                    <ResourceIcon resourceId={selectedResource.id} size={36} />
                    <div>
                      <h3>{selectedResource.name}</h3>
                      <p className="hint">
                        {selectedResource.category ?? "—"}
                        {selectedResource.tier != null
                          ? ` · T${selectedResource.tier}`
                          : ""}{" "}
                        · котировка в UC
                      </p>
                    </div>
                  </div>
                  <Ticker prices={resPrices} />
                </div>
                <PriceChart
                  points={resPoints}
                  emptyHint="Нет ряда цен — проверьте market_quote_seed / историю."
                />
                <div className="ex-hero-actions">
                  {(() => {
                    const catCur = categoryCurrencyId(selectedResource.category);
                    const lotN = countLotsForCurrency(catCur);
                    return (
                      <>
                        {lotN > 0 ? (
                          <span className="hint ex-hero-lots">
                            Заявок A–F по категории {selectedResource.category}:{" "}
                            <strong>{lotN}</strong>
                          </span>
                        ) : null}
                        <button
                          type="button"
                          className="btn sm primary"
                          onClick={() =>
                            goToTradeForCategory(selectedResource.category)
                          }
                        >
                          Торговать {selectedResource.category ?? "A–F"}
                        </button>
                      </>
                    );
                  })()}
                </div>
                <p className="hint">
                  Котировки сырья в UC. Заявки A–F — во вкладке «Торговля» или
                  кнопкой выше.
                </p>
              </div>
            ) : (
              <div className="ex-empty">
                <p className="hint">Выберите ресурс слева.</p>
              </div>
            )}
          </section>
        </div>
      )}

      {tab === "currencies" && (
        <div className="ex-bento ex-bento--fx">
          <aside className="ex-rail">
            <h3>Валюты · {fx.length}</h3>
            {fx.length === 0 ? (
              <div className="ex-empty">
                <p className="hint">
                  Валюты не загружены. Нужен
                  content/core/faction_currencies.json и перезапуск API.
                </p>
              </div>
            ) : (
              <ul className="ex-rail-list">
                {fx.map((c) => {
                  const prices = pricesOf(c.id);
                  const last = prices[prices.length - 1] ?? c.lastUc;
                  const delta =
                    prices.length >= 2
                      ? prices[prices.length - 1]! - prices[prices.length - 2]!
                      : 0;
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        className={`ex-rail-btn ${fxId === c.id ? "on" : ""}`}
                        onClick={() => setFxId(c.id)}
                      >
                        <span className="ex-fx-badge">{c.short ?? "?"}</span>
                        <span className="ex-rail-meta">
                          <strong>{c.name}</strong>
                          <span className="hint">
                            {last != null ? `${Number(last).toFixed(2)} UC` : "—"}
                            {c.pegLabel ? ` · ${c.pegLabel}` : ""}
                            {prices.length >= 2 ? (
                              <span
                                className={`ex-delta-inline ${delta >= 0 ? "is-up" : "is-down"}`}
                              >
                                {" "}
                                {delta >= 0 ? "▲" : "▼"}
                              </span>
                            ) : null}
                          </span>
                        </span>
                        <MiniSpark values={prices} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </aside>

          <section className="ex-main">
            {selectedFx ? (
              <>
                <div className="ex-hero ex-hero--fx">
                  <div className="ex-hero-top">
                    <div className="ex-hero-identity">
                      <span className="ex-fx-badge ex-fx-badge--lg">
                        {selectedFx.short ?? "?"}
                      </span>
                      <div>
                        <h3>{selectedFx.name}</h3>
                        <p className="hint">
                          {STRENGTH_LABEL[selectedFx.strength ?? ""] ??
                            selectedFx.strength}
                          {selectedFx.pegLabel
                            ? ` · пег: ${selectedFx.pegLabel}`
                            : ""}
                        </p>
                      </div>
                    </div>
                    <Ticker
                      prices={fxPrices}
                      extra={[
                        {
                          label: "Пег",
                          value: selectedFx.pegLabel ?? "—",
                        },
                      ]}
                    />
                  </div>
                  {selectedFx.blurb && (
                    <p className="hint ex-fx-blurb">{selectedFx.blurb}</p>
                  )}
                  <PriceChart
                    points={fxPoints}
                    emptyHint="Нет котировок для этой валюты."
                  />
                </div>
                <div className="ex-fx-board">
                  <h4>Доска (UC за 1 ед.)</h4>
                  <ul className="ex-fx-table">
                    {fx.map((row) => {
                      const prices = pricesOf(row.id);
                      const last =
                        prices[prices.length - 1] ?? row.lastUc ?? null;
                      const prev =
                        prices.length > 1
                          ? prices[prices.length - 2]!
                          : last;
                      const d =
                        last != null && prev != null ? last - prev : 0;
                      return (
                        <li
                          key={row.id}
                          className={row.id === selectedFx.id ? "on" : undefined}
                        >
                          <button
                            type="button"
                            className="ex-fx-row"
                            onClick={() => setFxId(row.id)}
                          >
                            <span className="ex-fx-badge">{row.short}</span>
                            <span className="ex-fx-row-meta">
                              <strong>{row.name}</strong>
                              <span className="hint">
                                {STRENGTH_LABEL[row.strength ?? ""] ?? ""}
                                {row.pegLabel ? ` · ${row.pegLabel}` : ""}
                              </span>
                            </span>
                            <span
                              className={`ex-fx-price ${d >= 0 ? "is-up" : "is-down"}`}
                            >
                              {last != null ? Number(last).toFixed(2) : "—"}
                              <small>
                                {prices.length >= 2
                                  ? ` ${d >= 0 ? "▲" : "▼"}${((d / (prev || 1)) * 100).toFixed(1)}%`
                                  : ""}
                              </small>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </>
            ) : (
              <div className="ex-empty">
                <p className="hint">Нет валют.</p>
              </div>
            )}
          </section>
        </div>
      )}

      {tab === "trade" && (
        <div className="ex-trade">
          <div className="ex-mode-tabs ex-venue-tabs" role="tablist">
            <button
              type="button"
              className={`ex-mode-tab ${venue === "contacts" ? "on" : ""}`}
              onClick={() => setVenue("contacts")}
            >
              Контакты
            </button>
            <button
              type="button"
              className={`ex-mode-tab ${venue === "common" ? "on" : ""}`}
              onClick={() => setVenue("common")}
            >
              Общий рынок
            </button>
            <button
              type="button"
              className="btn ghost sm"
              disabled={bookBusy}
              onClick={() => void refreshBook()}
            >
              Обновить
            </button>
          </div>

          {venue === "common" && (
            <div className="ex-common-bar">
              <p className="hint">
                Участников: {commonMembers.length}
                {commonJoined ? " · вы внутри" : " · вы вне"}
              </p>
              <button
                type="button"
                className={`btn sm ${commonJoined ? "ghost" : "primary"}`}
                onClick={() => void toggleCommon(!commonJoined)}
              >
                {commonJoined ? "Выйти" : "Вступить"}
              </button>
            </div>
          )}

          {venue === "contacts" && (
            <div className="ex-partners">
              <h4>Партнёры · {fallbackPartners.length}</h4>
              {fallbackPartners.length === 0 ? (
                <div className="ex-empty ex-empty--cta">
                  <p className="hint">
                    Нет trade/alliance. Заключите договор в Дипломатии, чтобы
                    торговать с партнёрами.
                  </p>
                  {onOpenDiplomacy ? (
                    <button
                      type="button"
                      className="btn sm primary"
                      onClick={onOpenDiplomacy}
                    >
                      → Дипломатия
                    </button>
                  ) : null}
                </div>
              ) : (
                <ul className="ex-partner-chips">
                  {fallbackPartners.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        className={`ex-partner-chip ${focusPartnerId === p.id ? "on" : ""}`}
                        onClick={() =>
                          setFocusPartnerId((cur) =>
                            cur === p.id ? "" : p.id,
                          )
                        }
                      >
                        <span
                          className="swatch"
                          style={{ background: p.color ?? "#888" }}
                        />
                        <strong>{p.name}</strong>
                        <span className="hint">
                          {DIPLOMACY_LABELS[p.relation] ?? p.relation}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="ex-book">
            <div className="ex-book-col">
              <h4>Продажа · {sells.length}</h4>
              {sells.length === 0 ? (
                <p className="hint ex-book-empty">Нет sell-лотов</p>
              ) : (
                <ul className="ex-lot-list">{sells.map(lotCard)}</ul>
              )}
            </div>
            <div className="ex-book-col">
              <h4>Покупка · {buys.length}</h4>
              {buys.length === 0 ? (
                <p className="hint ex-book-empty">Нет buy-лотов</p>
              ) : (
                <ul className="ex-lot-list">{buys.map(lotCard)}</ul>
              )}
            </div>
          </div>

          {interactive && economy && onPlaceOffer && (
            <section
              ref={composeRef}
              className={`ex-compose ex-compose--sticky ${composeHint ? "is-highlight" : ""}`}
            >
              <header className="ex-compose-head">
                <h4>Заявка · {venue === "common" ? "общий" : "контакты"}</h4>
                <span className="hint">{offerAp} AP · эскроу · только A–F</span>
              </header>
              {composeHint ? (
                <p className="ex-compose-hint hint" role="status">
                  {composeHint}
                  <button
                    type="button"
                    className="btn ghost sm ex-compose-hint-dismiss"
                    onClick={() => setComposeHint(null)}
                  >
                    ✕
                  </button>
                </p>
              ) : null}
              <div className="ex-compose-sides">
                <button
                  type="button"
                  className={`ex-side-btn ${offerSide === "sell" ? "on" : ""}`}
                  onClick={() => setOfferSide("sell")}
                >
                  Продажа
                </button>
                <button
                  type="button"
                  className={`ex-side-btn ${offerSide === "buy" ? "on" : ""}`}
                  onClick={() => setOfferSide("buy")}
                >
                  Покупка
                </button>
              </div>
              <div className="ex-compose-grid">
                <div className="ex-compose-col">
                  <span className="hq-stat-label">Отдаю</span>
                  <select
                    value={giveCurrency}
                    onChange={(e) => setGiveCurrency(e.target.value)}
                  >
                    {TRADE_CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {CURRENCY_LABELS[c]} · {economy.stocks?.[c] ?? 0}
                      </option>
                    ))}
                  </select>
                  <div className="ex-amount-row">
                    <input
                      type="number"
                      min={1}
                      max={offerStock}
                      value={giveAmount}
                      onChange={(e) => setGiveAmount(e.target.value)}
                      placeholder="кол-во"
                    />
                    <button
                      type="button"
                      className="btn ghost sm"
                      onClick={() => setGiveAmount(String(offerStock || ""))}
                    >
                      max
                    </button>
                  </div>
                </div>
                <div className="ex-compose-balance" aria-hidden>
                  ⇄
                </div>
                <div className="ex-compose-col">
                  <span className="hq-stat-label">Хочу</span>
                  <select
                    value={wantCurrency}
                    onChange={(e) => setWantCurrency(e.target.value)}
                  >
                    {TRADE_CURRENCIES.filter((c) => c !== giveCurrency).map(
                      (c) => (
                        <option key={c} value={c}>
                          {CURRENCY_LABELS[c]}
                        </option>
                      ),
                    )}
                  </select>
                  <input
                    type="number"
                    min={1}
                    value={wantAmount}
                    onChange={(e) => setWantAmount(e.target.value)}
                    placeholder="кол-во"
                  />
                </div>
              </div>
              {parsedGive > 0 && parsedWant > 0 && (
                <div className="market-compare-row market-compare-row--preview">
                  <span className="market-compare-side">
                    <ResourceIcon resourceId={giveCurrency} size={16} /> −
                    {parsedGive}
                  </span>
                  <span className="market-compare-arrow" aria-hidden>
                    →
                  </span>
                  <span className="market-compare-side is-gain">
                    <ResourceIcon resourceId={wantCurrency} size={16} /> +
                    {parsedWant}
                  </span>
                </div>
              )}
              <StatefulButton
                className="btn primary block"
                disabled={!canPlaceOffer}
                busy={offerSubmitting}
                success={offerSuccess}
                successLabel="Заявка отправлена"
                onSuccessEnd={() => setOfferSuccess(false)}
                onClick={() => {
                  if (!canPlaceOffer || !onPlaceOffer) return;
                  setOfferSubmitting(true);
                  onPlaceOffer(
                    offerSide,
                    giveCurrency,
                    parsedGive,
                    wantCurrency,
                    parsedWant,
                    venue,
                  );
                  setOfferSubmitting(false);
                  setOfferSuccess(true);
                  setComposeHint(null);
                  void refreshBook();
                }}
              >
                Разместить ({offerAp} AP)
              </StatefulButton>
            </section>
          )}

          {myOffers.length > 0 && onCancelOffer && (
            <section className="ex-mine">
              <h4>Мои заявки · {myOffers.length}</h4>
              <ul className="ex-mine-list">
                {myOffers.map((o) => (
                  <li key={o.id}>
                    <span className="ex-lot-swap">
                      <span className="ex-lot-leg">
                        <ResourceIcon resourceId={o.giveCurrency} size={14} />
                        {o.giveAmount}
                      </span>
                      <span aria-hidden>→</span>
                      <span className="ex-lot-leg">
                        <ResourceIcon resourceId={o.wantCurrency} size={14} />
                        {o.wantAmount}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="btn ghost sm"
                      onClick={() => {
                        onCancelOffer(o.id);
                        void refreshBook();
                      }}
                    >
                      Отменить
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {interactive && economy && onConvert && tradablePairs.length > 0 && (
            <ExpandableSection
              title="Обмен у стола (GM)"
              badge={`${convertAp} AP`}
              className="hq-card hq-expandable--flush ex-gm-convert"
            >
              <label className="field">
                <span>Пара</span>
                <select
                  value={pairKey}
                  onChange={(e) => setPairKey(e.target.value)}
                >
                  {tradablePairs.map((p) => (
                    <option
                      key={`${p.from}|${p.to}`}
                      value={`${p.from}|${p.to}`}
                    >
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Отдаю</span>
                <input
                  type="number"
                  min={1}
                  max={convertStock}
                  value={convertAmount}
                  onChange={(e) => setConvertAmount(e.target.value)}
                />
              </label>
              {previewTo != null &&
                parsedConvertAmount > 0 &&
                selectedPair && (
                  <div className="market-compare-row market-compare-row--preview">
                    <span className="market-compare-side">
                      −{parsedConvertAmount}{" "}
                      {labelOf(selectedPair.from, resources, fx)}
                    </span>
                    <span className="market-compare-arrow" aria-hidden>
                      →
                    </span>
                    <span className="market-compare-side is-gain">
                      ≈{previewTo} {labelOf(selectedPair.to, resources, fx)}
                    </span>
                  </div>
                )}
              <button
                type="button"
                className="btn block"
                disabled={!canConvert}
                onClick={() => {
                  if (!canConvert || !selectedPair) return;
                  onConvert(
                    selectedPair.from,
                    selectedPair.to,
                    parsedConvertAmount,
                  );
                }}
              >
                Обменять ({convertAp} AP)
              </button>
            </ExpandableSection>
          )}
        </div>
      )}

      {tab === "superpowers" && (
        <div className="market-super-grid focus-card-grid">
          {superpowers.length === 0 ? (
            <div className="ex-empty">
              <p className="hint">Сверхдержавы не загружены.</p>
            </div>
          ) : (
            superpowers.map((sp) => {
              const openCount = sp.listings.filter((L) => L.unlocked).length;
              return (
                <section
                  key={sp.id}
                  className={`hq-card market-super-card focus-card ${openCount > 0 ? "is-open" : "is-dim"}`}
                  style={
                    {
                      ["--focus-accent" as string]: sp.color ?? "var(--accent)",
                    } as CSSProperties
                  }
                >
                  <header className="deal-partner-head">
                    <span
                      className="swatch"
                      style={{ background: sp.color ?? "#888" }}
                    />
                    <div>
                      <h3>{sp.title}</h3>
                      <p className="hint">
                        {DIPLOMACY_LABELS[sp.relation] ?? sp.relation}
                        {openCount > 0 ? ` · ${openCount} лотов` : " · закрыто"}
                      </p>
                    </div>
                  </header>
                  <p className="hint">{sp.blurb}</p>
                  <ul className="market-super-listings">
                    {sp.listings.map((L) => {
                      const needsSystem = L.kind === "service_scout";
                      return (
                        <li
                          key={L.id}
                          className={`market-super-listing ${L.unlocked ? "" : "is-locked"}`}
                        >
                          <div>
                            <strong>{L.label}</strong>
                            <p className="hint">{L.summary}</p>
                            <div className="market-compare-row">
                              <span className="market-compare-side">
                                {L.want ? (
                                  <>
                                    <ResourceIcon
                                      resourceId={L.want.currencyId}
                                      size={14}
                                    />{" "}
                                    −{L.want.amount}
                                  </>
                                ) : (
                                  "—"
                                )}
                              </span>
                              <span className="market-compare-arrow" aria-hidden>
                                →
                              </span>
                              <span className="market-compare-side is-gain">
                                {L.give ? (
                                  <>
                                    <ResourceIcon
                                      resourceId={L.give.currencyId}
                                      size={14}
                                    />{" "}
                                    +{L.give.amount}
                                  </>
                                ) : L.kind === "service_scout" ? (
                                  "разведка"
                                ) : (
                                  "услуга"
                                )}
                              </span>
                            </div>
                            {!L.unlocked && L.lockedReason ? (
                              <p className="hint">{L.lockedReason}</p>
                            ) : null}
                          </div>
                          {needsSystem && L.unlocked && (
                            <label className="field">
                              <span>Система</span>
                              <select
                                value={scoutSystemId}
                                onChange={(e) =>
                                  setScoutSystemId(e.target.value)
                                }
                              >
                                <option value="">— выберите —</option>
                                {(systems ?? []).map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {s.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                          )}
                          <StatefulButton
                            className="btn sm primary"
                            disabled={
                              !interactive ||
                              !L.unlocked ||
                              (needsSystem && !scoutSystemId)
                            }
                            busy={superBusy === L.id}
                            success={superSuccess === L.id}
                            successLabel="Куплено"
                            onSuccessEnd={() => setSuperSuccess(null)}
                            onClick={() =>
                              void buySuperListing(L.id, needsSystem)
                            }
                          >
                            {L.unlocked ? "Купить" : "Закрыто"}
                          </StatefulButton>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })
          )}
        </div>
      )}
    </div>
  );

  if (asRoom === false) {
    return <section className="hq-card market-panel">{body}</section>;
  }
  return (
    <div className="hq-panel market-panel market-panel--room">{body}</div>
  );
}
