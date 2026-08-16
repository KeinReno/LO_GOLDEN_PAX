export function pickTargetSetNote(systemName: string): string {
  return `Цель: ${systemName}`;
}

export function caravanDropAmount(stock: number): number {
  const n = Number(stock) || 0;
  return Math.max(1, Math.min(n, Math.ceil(n * 0.25) || 1));
}

export type MapSystemClickDecision =
  | { kind: "pick-target"; systemId: string; name: string }
  | {
      kind: "touch-move";
      unitKind: "fleet" | "legion";
      unitId: string;
      toSystemId: string;
      hops: number;
    }
  | { kind: "touch-move-fail" }
  | { kind: "select"; systemId: string | null; openSheet: boolean };

export function resolveMapSystemClick(p: {
  systemId: string | null;
  pickingTarget: boolean;
  touchMoveArmed: boolean;
  selectedFleetId: string | null;
  selectedLegionId: string | null;
  factionId: string;
  mobile: boolean;
  viewMode: string;
  systemName?: string;
  unit: { factionId: string; systemId: string } | null;
  hops: number;
}): MapSystemClickDecision {
  const id = p.systemId;
  if (id && p.pickingTarget) {
    return {
      kind: "pick-target",
      systemId: id,
      name: p.systemName ?? id,
    };
  }
  if (id && p.touchMoveArmed) {
    const unitKind = p.selectedLegionId ? "legion" : "fleet";
    const unitId = p.selectedLegionId ?? p.selectedFleetId;
    if (
      unitId &&
      p.unit &&
      p.unit.factionId === p.factionId &&
      p.unit.systemId !== id
    ) {
      if (Number.isFinite(p.hops) && p.hops > 0) {
        return {
          kind: "touch-move",
          unitKind,
          unitId,
          toSystemId: id,
          hops: p.hops,
        };
      }
      return { kind: "touch-move-fail" };
    }
  }
  return {
    kind: "select",
    systemId: id,
    openSheet: Boolean(p.mobile && id && p.viewMode === "map"),
  };
}
