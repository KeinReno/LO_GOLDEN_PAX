import { getCachedContent } from "../state/contentCatalog";
import { liveBreakthroughTechId } from "../state/techPathLive";
import type { ViewerPayload } from "../state/types";

export type PathNavigateView = "economy" | "research" | "market" | "court";

export type PathStripModifier = {
  label: string;
  detail: string;
};

export type PathStripUnlock = {
  name: string;
  threshold: number;
  granted: boolean;
};

export type PathStripRow = {
  id: string;
  icon: string;
  label: string;
  kind: "material" | "civic";
  /** Pilot path with live scoring. */
  pilot: boolean;
  state: "disabled" | "accumulating" | "ready" | "open";
  score: number;
  threshold: number;
  pct: number;
  baseLabel: string;
  modifiers: PathStripModifier[];
  totalLabel: string;
  unlocks: PathStripUnlock[];
  navigate: PathNavigateView;
};

const MATERIAL_SLOTS: Array<{
  id: string;
  icon: string;
  label: string;
  pilot: boolean;
  navigate: PathNavigateView;
}> = [
  { id: "structural", icon: "🛡", label: "Структурный", pilot: true, navigate: "research" },
  { id: "energy", icon: "⚡", label: "Энергетический", pilot: true, navigate: "research" },
  { id: "offensive", icon: "🎯", label: "Ударный", pilot: true, navigate: "research" },
  { id: "defensive", icon: "🔰", label: "Защитный", pilot: true, navigate: "research" },
  { id: "mobility", icon: "🚀", label: "Мобильность", pilot: true, navigate: "research" },
  { id: "cognitive", icon: "🧠", label: "Когнитивный", pilot: true, navigate: "research" },
  { id: "biological", icon: "🌱", label: "Биологический", pilot: true, navigate: "research" },
  { id: "exotic", icon: "✨", label: "Экзотический", pilot: true, navigate: "research" },
];

const CIVIC_SLOTS: Array<{
  id: string;
  icon: string;
  label: string;
  navigate: PathNavigateView;
}> = [
  { id: "trade", icon: "🪙", label: "Торговля", navigate: "market" },
  { id: "culture", icon: "🎭", label: "Культура", navigate: "court" },
];

function roleMilestoneThreshold(roleId: string): number {
  const content = getCachedContent();
  const ms = content?.role_milestones as
    | Record<string, { threshold?: number }>
    | undefined;
  const schemaTh =
    content?.economy_schema?.role_score_pilot?.thresholds ?? {};
  return Number(ms?.[roleId]?.threshold) || Number(schemaTh[roleId]) || 0;
}

function materialRow(
  slot: (typeof MATERIAL_SLOTS)[number],
  eco: ViewerPayload["economy"],
): PathStripRow {
  if (!slot.pilot) {
    return {
      id: slot.id,
      icon: slot.icon,
      label: slot.label,
      kind: "material",
      pilot: false,
      state: "disabled",
      score: 0,
      threshold: 0,
      pct: 0,
      baseLabel: "—",
      modifiers: [],
      totalLabel: "Путь ещё не в пилоте",
      unlocks: [],
      navigate: slot.navigate,
    };
  }

  const scores = eco?.roleScores ?? {};
  const score = Number(scores[slot.id as keyof typeof scores]) || 0;
  const threshold = roleMilestoneThreshold(slot.id);
  const open = (eco?.openPaths ?? []).includes(slot.id);
  const content = getCachedContent();
  const breakthroughId = liveBreakthroughTechId(
    content?.tech_paths?.paths?.[slot.id],
    content?.technologies,
  );
  const ready =
    !open && Boolean(breakthroughId) && threshold > 0 && score >= threshold;
  const pct =
    threshold > 0 ? Math.min(100, Math.round((score / threshold) * 100)) : 0;

  const ms = content?.role_milestones as
    | Record<string, { unlocks?: Array<{ name?: string }> }>
    | undefined;
  const unlocks = (ms?.[slot.id]?.unlocks ?? []).map((u) => ({
    name: u.name ?? "Разблокировка",
    threshold,
    granted: open,
  }));

  const breakthroughName = breakthroughId
    ? content?.technologies?.[breakthroughId]?.name ?? null
    : null;

  return {
    id: slot.id,
    icon: slot.icon,
    label: slot.label,
    kind: "material",
    pilot: true,
    state: open ? "open" : ready ? "ready" : "accumulating",
    score,
    threshold,
    pct,
    baseLabel: `${score}`,
    modifiers: [
      {
        label: "Источник",
        detail: "Σ добыча ресурсов роли × tier (за игру)",
      },
    ],
    totalLabel: `${score}`,
    unlocks: [
      ...unlocks,
      ...(breakthroughName
        ? [{ name: breakthroughName, threshold, granted: open }]
        : []),
    ],
    navigate: slot.navigate,
  };
}

function civicRow(
  slot: (typeof CIVIC_SLOTS)[number],
  eco: ViewerPayload["economy"],
): PathStripRow {
  const pathRow = eco?.civicPaths?.find((p) => p.id === slot.id);
  const scores = eco?.civicScores ?? {};
  const score =
    pathRow != null
      ? Number(pathRow.score) || 0
      : Number(scores[slot.id as keyof typeof scores]) || 0;
  const threshold = Number(pathRow?.nextThreshold) || 0;
  const pct =
    pathRow?.progress != null
      ? Math.round(Number(pathRow.progress) * 100)
      : threshold > 0
        ? Math.min(100, Math.round((score / threshold) * 100))
        : 0;

  const unlocks = (pathRow?.unlocks ?? []).map((u) => ({
    name: u.name ?? u.id,
    threshold: Number(u.threshold) || 0,
    granted: Boolean(u.granted),
  }));

  const content = getCachedContent();
  const pathDef = content?.civic_paths?.paths?.[slot.id];
  const feeds = pathDef?.feedsFrom ?? [];
  const feedLabels: Record<string, string> = {
    market_volume: "объём биржи",
    active_treaties: "активные договоры",
    dominant_culture_share: "доля культуры",
    faith_conversion: "конверсия веры",
    avg_loyalty: "средняя лояльность",
  };
  const modifiers: PathStripModifier[] = feeds.length
    ? feeds.map((f) => ({
        label: feedLabels[f] ?? f,
        detail: "за ход",
      }))
    : [
        {
          label: "Источник",
          detail:
            slot.id === "trade"
              ? "биржа и торговые договоры"
              : "культура, вера, лояльность",
        },
      ];

  const allGranted =
    unlocks.length > 0 && unlocks.every((u) => u.granted);

  return {
    id: slot.id,
    icon: pathRow?.icon ?? slot.icon,
    label: pathRow?.name ?? slot.label,
    kind: "civic",
    pilot: true,
    state: allGranted ? "open" : "accumulating",
    score,
    threshold,
    pct,
    baseLabel: `${score}`,
    modifiers,
    totalLabel: `${score}`,
    unlocks,
    navigate: slot.navigate,
  };
}

/** Build 10 HUD path rows from existing economy API fields (B2/B6). */
export function buildPathStripRows(
  eco: ViewerPayload["economy"] | undefined,
): PathStripRow[] {
  return [
    ...MATERIAL_SLOTS.map((s) => materialRow(s, eco)),
    ...CIVIC_SLOTS.map((s) => civicRow(s, eco)),
  ];
}
