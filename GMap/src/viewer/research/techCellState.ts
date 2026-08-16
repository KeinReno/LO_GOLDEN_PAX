import type { TechnologyDef } from "../../state/contentCatalog";
import { effectiveCognitioCost } from "../../state/researchCosts";
import type { ViewerPayload } from "../../state/types";

export const RESEARCH_ERAS = [1, 2, 3, 4, 5] as const;
export type ResearchEra = (typeof RESEARCH_ERAS)[number];

export type TechUiState = {
  done: boolean;
  locked: boolean;
  canQueue: boolean;
  canBuy: boolean;
  cost: number;
  inQueue: boolean;
};

export function techUiState(
  tech: TechnologyDef,
  unlocked: Set<string>,
  cognitio: number,
  busy: boolean | undefined,
  queueIds: Set<string> | undefined,
  isTechBlocked: ((tech: TechnologyDef) => boolean) | undefined,
  eco: ViewerPayload["economy"] | undefined,
): TechUiState {
  const done = unlocked.has(tech.id);
  const prereqOk = (tech.prerequisites || []).every((p) => unlocked.has(p));
  const lockBlocked = !!isTechBlocked?.(tech);
  const cost = effectiveCognitioCost(tech, eco, tech.category);
  const canQueue = !done && prereqOk && !lockBlocked && !busy;
  const canBuy = canQueue && cognitio >= cost;
  return {
    done,
    locked: (!prereqOk || lockBlocked) && !done,
    canQueue,
    canBuy,
    cost,
    inQueue: !!queueIds?.has(tech.id),
  };
}

export type EraCellStats = {
  era: ResearchEra;
  total: number;
  done: number;
  available: number;
  affordable: number;
  techs: TechnologyDef[];
};

export type CatProgress = {
  cat: string;
  total: number;
  done: number;
  affordable: number;
  eras: EraCellStats[];
};

export function buildCatProgress(
  cat: string,
  techs: TechnologyDef[],
  unlocked: Set<string>,
  cognitio: number,
  busy: boolean | undefined,
  isTechBlocked: ((tech: TechnologyDef) => boolean) | undefined,
  eco: ViewerPayload["economy"] | undefined,
): CatProgress {
  const eras: EraCellStats[] = RESEARCH_ERAS.map((era) => {
    const list = techs.filter((t) => (t.era || 1) === era);
    let done = 0;
    let available = 0;
    let affordable = 0;
    for (const t of list) {
      const st = techUiState(
        t,
        unlocked,
        cognitio,
        busy,
        undefined,
        isTechBlocked,
        eco,
      );
      if (st.done) done += 1;
      else if (st.canQueue) {
        available += 1;
        if (st.canBuy) affordable += 1;
      }
    }
    return {
      era,
      total: list.length,
      done,
      available,
      affordable,
      techs: list,
    };
  });
  return {
    cat,
    total: techs.length,
    done: eras.reduce((s, e) => s + e.done, 0),
    affordable: eras.reduce((s, e) => s + e.affordable, 0),
    eras,
  };
}

export function matchesResearchFilter(
  tech: TechnologyDef,
  st: TechUiState,
  filter: string,
  search: string,
): boolean {
  const q = search.trim().toLowerCase();
  if (q) {
    const hit =
      tech.name.toLowerCase().includes(q) ||
      tech.id.toLowerCase().includes(q) ||
      tech.category.toLowerCase() === q;
    if (!hit) return false;
  }
  switch (filter) {
    case "available":
      return st.canQueue;
    case "exclusive":
      return !!(
        tech.raceLock ||
        tech.factionTraitLock ||
        tech.hybridOf?.length ||
        tech.requiresLineage
      );
    case "breakthrough":
      return !!tech.isBreakthrough;
    case "researched":
      return st.done;
    default:
      return true;
  }
}
