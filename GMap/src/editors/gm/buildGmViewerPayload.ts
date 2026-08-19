import type { ViewerPayload, WorldState } from "../../state/types";

/** GM polity rooms reuse player panels: editor world + ledger economy. */
export function buildGmViewerPayload(
  world: WorldState,
  factionId: string,
  economy?: ViewerPayload["economy"] | null,
): ViewerPayload {
  return {
    world,
    factionId,
    visibleSystemIds: world.systems.map((s) => s.id),
    knownFactionIds: world.factions.map((f) => f.id),
    economy: economy ?? undefined,
    updatedAt: world.meta?.updatedAt ?? null,
    tableRevision: world.meta?.tableRevision,
  };
}

export function asViewerEconomy(
  row: unknown,
): ViewerPayload["economy"] | null {
  if (!row || typeof row !== "object") return null;
  const stocks = (row as { stocks?: unknown }).stocks;
  if (!stocks || typeof stocks !== "object") return null;
  return row as ViewerPayload["economy"];
}
