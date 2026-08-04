import { getCachedContent } from "../../state/contentCatalog";
import type { ViewerPayload } from "../../state/types";
import type { EconomyFlowBreakdown } from "../economyFlowTypes";
import { ECO_CATEGORY_NAMES } from "../economyFlowTypes";

export type ProductionSystemRow = {
  systemId: string;
  name: string;
  resourceLabels: string[];
  resourceIds: string[];
  categories: string[];
  ratePerTurn: number;
  /** True when rate is heuristic (tier/buildings), not flow-engine. */
  rateIsEstimate?: boolean;
  bottleneck: boolean;
  bottleneckReason?: string;
};

/** Estimate system production from resources + buildings + flow totals share. */
export function buildProductionSystemRows(
  payload: ViewerPayload,
  flowData?: EconomyFlowBreakdown | null,
  filterCategory?: string | null,
): ProductionSystemRow[] {
  const content = getCachedContent();
  const owned = payload.world.systems.filter(
    (s) =>
      s.ownerFactionId === payload.factionId &&
      (payload.visibleSystemIds?.includes(s.id) ?? true),
  );

  const bn = flowData?.bottlenecks ?? payload.economy?.bottlenecks ?? {};
  const rows: ProductionSystemRow[] = [];

  for (const sys of owned) {
    const cats = new Set<string>();
    const resourceLabels: string[] = [];
    const resourceIds: string[] = [];
    let rate = 0;

    for (const p of sys.planets ?? []) {
      for (const resName of p.resources ?? []) {
        const def = Object.values(content?.map_resources ?? {}).find(
          (r) => r.name === resName || r.id === resName,
        );
        if (def?.category) cats.add(String(def.category));
        const label = def?.name ?? String(resName);
        if (!resourceLabels.includes(label)) {
          resourceLabels.push(label);
          resourceIds.push(def?.id ?? String(resName));
        }
        rate += Number(def?.tier ?? 1);
      }
      const buildings = [
        ...(p.surfaceBuildings ?? []),
        ...(p.orbitalBuildings ?? []),
      ];
      for (const b of buildings) {
        if (b.disabled) continue;
        let def = b.buildingId ? content?.buildings?.[b.buildingId] : undefined;
        if (!def && b.kind) {
          def = Object.values(content?.buildings ?? {}).find(
            (d) =>
              d.kind === b.kind &&
              (d.zone || "surface") === (b.zone || "surface"),
          );
        }
        if (def?.category) cats.add(String(def.category));
        rate += Number(def?.tier ?? 1) * 2;
      }
    }

    if (filterCategory && !cats.has(filterCategory)) continue;

    let bottleneck = false;
    let bottleneckReason: string | undefined;
    for (const cat of cats) {
      const raw = (bn as Record<string, unknown>)[cat];
      let deficit = 0;
      if (typeof raw === "number") deficit = raw;
      else if (raw && typeof raw === "object" && "deficit" in raw) {
        deficit = Number((raw as { deficit?: number }).deficit ?? 0);
      }
      if (deficit > 0) {
        bottleneck = true;
        bottleneckReason = `${ECO_CATEGORY_NAMES[cat] ?? cat} −${deficit}`;
        break;
      }
    }

    rows.push({
      systemId: sys.id,
      name: sys.name,
      resourceLabels: resourceLabels.slice(0, 4),
      resourceIds: resourceIds.slice(0, 4),
      categories: [...cats].sort(),
      ratePerTurn: Math.max(0, Math.round(rate)),
      rateIsEstimate: true,
      bottleneck,
      bottleneckReason,
    });
  }

  return rows.sort(
    (a, b) =>
      Number(b.bottleneck) - Number(a.bottleneck) ||
      b.ratePerTurn - a.ratePerTurn ||
      a.name.localeCompare(b.name, "ru"),
  );
}

export const RPS_CHAIN = ["A", "B", "C", "D", "E", "F"] as const;

export function edgeKey(from: string, to: string): string {
  return `${from}->${to}`;
}

export function isAdjacentRps(from: string, to: string): boolean {
  const i = RPS_CHAIN.indexOf(from as (typeof RPS_CHAIN)[number]);
  const j = RPS_CHAIN.indexOf(to as (typeof RPS_CHAIN)[number]);
  if (i < 0 || j < 0) return false;
  return (i + 1) % RPS_CHAIN.length === j;
}
