import type { ViewerPayload } from "../state/types";
import { getCachedContent } from "../state/contentCatalog";
import type {
  EconomyFlowBreakdown,
  EconomySystemSignal,
  FlowBottleneck,
} from "./economyFlowTypes";
import { ECO_CATEGORY_NAMES } from "./economyFlowTypes";

function normalizeBottleneck(
  v: FlowBottleneck | number | undefined,
): FlowBottleneck | null {
  if (v == null) return null;
  if (typeof v === "number") return v > 0 ? { tier: 1, deficit: v } : null;
  if ((v.deficit ?? 0) <= 0) return null;
  return { tier: v.tier ?? 1, deficit: v.deficit ?? 0 };
}

function systemCategories(
  payload: ViewerPayload,
  systemId: string,
): Set<string> {
  const cats = new Set<string>();
  const content = getCachedContent();
  const sys = payload.world.systems.find((s) => s.id === systemId);
  if (!sys) return cats;

  for (const p of sys.planets ?? []) {
    for (const resName of p.resources ?? []) {
      const def = Object.values(content?.map_resources ?? {}).find(
        (r) => r.name === resName || r.id === resName,
      );
      if (def?.category) cats.add(String(def.category));
    }
    const buildings = [
      ...(p.surfaceBuildings ?? []),
      ...(p.orbitalBuildings ?? []),
      ...((p as { buildings?: typeof p.surfaceBuildings }).buildings ?? []),
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
    }
  }
  return cats;
}

export function buildEconomySystemSignals(
  payload: ViewerPayload,
  flowData?: EconomyFlowBreakdown | null,
): EconomySystemSignal[] {
  const rawBn =
    flowData?.bottlenecks ?? payload.economy?.bottlenecks ?? {};
  const bottlenecks: Record<string, FlowBottleneck> = {};
  for (const [cat, v] of Object.entries(rawBn)) {
    const n = normalizeBottleneck(v as FlowBottleneck | number);
    if (n) bottlenecks[cat] = n;
  }
  if (Object.keys(bottlenecks).length === 0) return [];

  const owned = payload.world.systems.filter(
    (s) =>
      s.ownerFactionId === payload.factionId &&
      payload.visibleSystemIds.includes(s.id),
  );

  const signals: EconomySystemSignal[] = [];
  for (const sys of owned) {
    const cats = systemCategories(payload, sys.id);
    for (const [cat, bn] of Object.entries(bottlenecks)) {
      if (!cats.has(cat)) continue;
      const name = ECO_CATEGORY_NAMES[cat] ?? cat;
      signals.push({
        systemId: sys.id,
        systemName: sys.name,
        category: cat,
        reason: `${name} T${bn.tier} −${bn.deficit}`,
        severity: bn.deficit,
      });
    }
  }

  if (signals.length === 0) {
    for (const [cat, bn] of Object.entries(bottlenecks)) {
      const name = ECO_CATEGORY_NAMES[cat] ?? cat;
      signals.push({
        systemId: "",
        systemName: "Фракция",
        category: cat,
        reason: `${name} T${bn.tier} −${bn.deficit}`,
        severity: bn.deficit,
      });
    }
  }

  return signals.sort(
    (a, b) =>
      b.severity - a.severity ||
      a.systemName.localeCompare(b.systemName, "ru"),
  );
}

/** Owned systems with the worst local attribution (for map badges). */
export function severeBottleneckSystemIds(
  signals: EconomySystemSignal[],
): string[] {
  const bySystem = new Map<string, number>();
  for (const s of signals) {
    if (!s.systemId) continue;
    bySystem.set(
      s.systemId,
      Math.max(bySystem.get(s.systemId) ?? 0, s.severity),
    );
  }
  if (bySystem.size === 0) return [];
  const severities = [...bySystem.values()].sort((a, b) => b - a);
  const cut = Math.max(
    2,
    severities[Math.floor(severities.length * 0.25)] ?? 2,
  );
  return [...bySystem.entries()]
    .filter(([, sev]) => sev >= cut)
    .map(([id]) => id);
}
