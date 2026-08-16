export type ForceUnitOrderPlan =
  | { kind: "queue" }
  | {
      kind: "map-ring";
      orderType: "move_fleet" | "move_legion";
      systemId: string;
      fleetId: string | null;
      legionId: string | null;
    };

export function planForceUnitOrder(p: {
  kind: "fleet" | "legion";
  unit: { id: string; systemId: string } | undefined;
}): ForceUnitOrderPlan {
  if (!p.unit) return { kind: "queue" };
  if (p.kind === "fleet") {
    return {
      kind: "map-ring",
      orderType: "move_fleet",
      systemId: p.unit.systemId,
      fleetId: p.unit.id,
      legionId: null,
    };
  }
  return {
    kind: "map-ring",
    orderType: "move_legion",
    systemId: p.unit.systemId,
    fleetId: null,
    legionId: p.unit.id,
  };
}

export function produceDeckNote(tab: "ships" | "units"): string {
  return tab === "ships"
    ? "Верфь — зажмите карту корабля, чтобы спустить со стапелей"
    : "Казармы — зажмите карту отряда, чтобы нанять";
}
