import { getCachedContent } from "../../state/contentCatalog";
import type { ViewerPayload } from "../../state/types";
import type { EconomyFlowBreakdown } from "../economyFlowTypes";
import { ECO_CATEGORY_NAMES } from "../economyFlowTypes";

export type FactionBottleneck = { letter: string; name: string; deficit: number };

/** Faction-level bottlenecks for a single banner (not per-system rows). */
export function listFactionBottlenecks(
  flowData?: EconomyFlowBreakdown | null,
  economyBottlenecks?: Record<string, unknown> | null,
): FactionBottleneck[] {
  const bn = flowData?.bottlenecks ?? economyBottlenecks ?? {};
  const out: FactionBottleneck[] = [];
  for (const [cat, raw] of Object.entries(bn)) {
    let deficit = 0;
    if (typeof raw === "number") deficit = raw;
    else if (raw && typeof raw === "object" && "deficit" in raw) {
      deficit = Number((raw as { deficit?: number }).deficit ?? 0);
    }
    if (deficit > 0) {
      out.push({
        letter: cat,
        name: ECO_CATEGORY_NAMES[cat] ?? cat,
        deficit,
      });
    }
  }
  return out.sort((a, b) => b.deficit - a.deficit);
}

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
  _flowData?: EconomyFlowBreakdown | null,
  filterCategory?: string | null,
): ProductionSystemRow[] {
  const content = getCachedContent();
  const owned = payload.world.systems.filter(
    (s) =>
      s.ownerFactionId === payload.factionId &&
      (payload.visibleSystemIds?.includes(s.id) ?? true),
  );

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

    // Faction-wide bottlenecks are shown once as a banner — not painted on every system.
    rows.push({
      systemId: sys.id,
      name: sys.name,
      resourceLabels: resourceLabels.slice(0, 4),
      resourceIds: resourceIds.slice(0, 4),
      categories: [...cats].sort(),
      ratePerTurn: Math.max(0, Math.round(rate)),
      rateIsEstimate: true,
      bottleneck: false,
      bottleneckReason: undefined,
    });
  }

  return rows.sort(
    (a, b) =>
      b.ratePerTurn - a.ratePerTurn || a.name.localeCompare(b.name, "ru"),
  );
}

export const RPS_CHAIN = ["A", "B", "C", "D", "E", "F"] as const;

export function edgeKey(from: string, to: string): string {
  return `${from}->${to}`;
}

export function isAdjacentRps(from: string, to: string): boolean {
  const i = RPS_CHAIN.indexOf(from as (typeof RPS_CHAIN)[number]);
  const j = RPS_CHAIN.indexOf(to as (typeof RPS_CHAIN)[number]);
  if (i < 0 || j < 0 || i === j) return false;
  const len = RPS_CHAIN.length;
  // Forward or reverse neighbour on the cycle.
  return (i + 1) % len === j || (j + 1) % len === i;
}
