import { getCachedContent } from "../../state/contentCatalog";
import type { ViewerPayload } from "../../state/types";
import {
  ECO_CATEGORY_NAMES,
  type EconomyFlowBreakdown,
} from "../economyFlowTypes";
import {
  depositLaborScale,
  depositTechCeiling,
  extractionYieldUnits,
  isTreasuryPegDeposit,
  planetCanExtractDeposit,
} from "../../state/depositExtract";
import { buildingStaffedUnits, consumesLabor } from "../../state/planetLabor";

export { pickFocusBuildSystemId } from "./productionNav";

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

/** Estimate system production from gated deposits + staffed yield — same rules as the flow engine. */
export function buildProductionSystemRows(
  payload: ViewerPayload,
  flowData?: EconomyFlowBreakdown | null,
  filterCategory?: string | null,
): ProductionSystemRow[] {
  const content = getCachedContent();
  const catalog = (content?.buildings ?? {}) as Record<
    string,
    {
      id?: string;
      name?: string;
      kind?: string;
      category?: string;
      tier?: number;
      zone?: string;
      extractsCategory?: unknown;
      extractsDeposits?: unknown;
      laborSlots?: number;
      effects?: Array<{ effect?: string; args?: Record<string, unknown> }>;
    }
  >;
  const techTiers = payload.economy?.techTiers;
  const treasuryPeg =
    payload.world.factions?.find((f) => f.id === payload.factionId)
      ?.treasuryPeg ?? null;
  const owned = payload.world.systems.filter(
      (s) =>
        s.ownerFactionId === payload.factionId &&
        (!Array.isArray(payload.visibleSystemIds) ||
          payload.visibleSystemIds.includes(s.id)),
  );

  const factionBn = new Set(
    listFactionBottlenecks(
      flowData,
      payload.economy?.bottlenecks as Record<string, unknown> | undefined,
    ).map((b) => b.letter),
  );

  const rows: ProductionSystemRow[] = [];

  for (const sys of owned) {
    const cats = new Set<string>();
    const resourceLabels: string[] = [];
    const resourceIds: string[] = [];
    let rate = 0;

    const aliases = content?.id_aliases?.resources ?? {};
    const resolveRes = (resName: string) => {
      const aliased = aliases[resName] ?? aliases[resName?.toLowerCase?.()] ?? resName;
      return (
        content?.map_resources?.[aliased] ??
        content?.map_resources?.[resName] ??
        Object.values(content?.map_resources ?? {}).find(
          (r) => r.name === resName || r.id === resName || r.name === aliased || r.id === aliased,
        )
      );
    };

    const creditDeposit = (
      resName: string,
      planet: (typeof sys.planets)[number] | null,
      skipBuildingGate: boolean,
    ) => {
      const def = resolveRes(String(resName));
      if (def?.category) cats.add(String(def.category));
      const label = def?.name ?? String(resName);
      if (!resourceLabels.includes(label)) {
        resourceLabels.push(label);
        resourceIds.push(def?.id ?? String(resName));
      }
      if (!def?.category || def.tier == null) return;
      const cat = String(def.category);
      const t = Number(def.tier);
      const ceil = depositTechCeiling(techTiers, cat);
      const pegOk = isTreasuryPegDeposit(def, treasuryPeg);
      if (!pegOk && ceil < t) return;
      if (!skipBuildingGate) {
        if (!planet || !planetCanExtractDeposit(planet, def, catalog)) return;
      }
      const labor = planet
        ? depositLaborScale(planet, def, catalog)
        : 1;
      rate += extractionYieldUnits(def) * labor;
    };

    for (const p of sys.planets ?? []) {
      for (const resName of p.resources ?? []) {
        creditDeposit(String(resName), p, false);
      }
    }
    const hasOwnMine = (sys.stations ?? []).some(
      (st) => st.kind === "mining" && st.factionId === payload.factionId,
    );
    if (hasOwnMine) {
      for (const resName of sys.resources ?? []) {
        creditDeposit(String(resName), null, true);
      }
    }

    for (const p of sys.planets ?? []) {
      const buildings = [
        ...(p.surfaceBuildings ?? []),
        ...(p.orbitalBuildings ?? []),
      ];
      for (const b of buildings) {
        if (b.disabled) continue;
        let def = b.buildingId ? catalog[b.buildingId] : undefined;
        if (!def && b.kind) {
          def = Object.values(catalog).find(
            (d) =>
              d.kind === b.kind &&
              (d.zone || "surface") === (b.zone || "surface"),
          );
        }
        if (def?.category) cats.add(String(def.category));
        if (!def || !consumesLabor(def)) continue;
        const { staffed, slots } = buildingStaffedUnits(p, b, catalog);
        const frac = slots > 0 ? staffed / slots : 0;
        let yieldAmt = 0;
        for (const e of def.effects || []) {
          if (e.effect === "yield_flat" || e.effect === "production_flat") {
            yieldAmt += Number(e.args?.amount || 0);
          }
        }
        if (yieldAmt > 0) rate += yieldAmt * frac;
      }
    }

    if (filterCategory && !cats.has(filterCategory)) continue;

    const categories = [...cats].sort();
    const bottleneckCat = categories.find((c) => factionBn.has(c));
    rows.push({
      systemId: sys.id,
      name: sys.name,
      resourceLabels: resourceLabels.slice(0, 4),
      resourceIds: resourceIds.slice(0, 4),
      categories,
      ratePerTurn: Math.max(0, Math.round(rate)),
      rateIsEstimate: true,
      bottleneck: Boolean(bottleneckCat),
      bottleneckReason: bottleneckCat
        ? `Узкое место: ${ECO_CATEGORY_NAMES[bottleneckCat] ?? bottleneckCat}`
        : undefined,
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
