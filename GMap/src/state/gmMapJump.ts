import type { EditorTool, MapFocus } from "./types";

export type GmMapJumpOpts = {
  systemId?: string | null;
  planetId?: string | null;
  fleetId?: string | null;
  legionId?: string | null;
  /** galaxy = pin camera; system/planet = dive. */
  dive?: "galaxy" | "system" | "planet";
  tool?: EditorTool;
  pendingCapitalFactionId?: string | null;
  factionId?: string | null;
};

export type GmMapJumpState = {
  gmShellMode: "gm";
  diplomacyPanelOpen: false;
  dossierFactionId: null;
  pendingCapitalFactionId: string | null;
  selectedSystemId: string | null;
  selectedSystemIds: string[];
  selectedFleetId: string | null;
  selectedLegionId: string | null;
  cameraFocusSystemId: string | null;
  dossierSystemId: string | null;
  mapFocus: MapFocus;
  tool: EditorTool;
  contextMenu: null;
  activeFactionId?: string;
};

function resolveDive(opts: GmMapJumpOpts): "galaxy" | "system" | "planet" {
  if (opts.dive) return opts.dive;
  if (opts.planetId) return "planet";
  return "galaxy";
}

function resolveMapFocus(
  dive: "galaxy" | "system" | "planet",
  systemId: string | null,
  planetId: string | null,
): MapFocus {
  if (dive === "planet" && systemId && planetId) {
    return { level: "planet", systemId, planetId };
  }
  if (dive === "system" && systemId) {
    return { level: "system", systemId };
  }
  return { level: "galaxy" };
}

/** One store patch: leave polities studio and land on the GM map. */
export function buildGmMapJumpState(opts: GmMapJumpOpts = {}): GmMapJumpState {
  const systemId = opts.systemId ?? null;
  const planetId = opts.planetId ?? null;
  const dive = resolveDive(opts);
  const patch: GmMapJumpState = {
    gmShellMode: "gm",
    diplomacyPanelOpen: false,
    dossierFactionId: null,
    pendingCapitalFactionId: opts.pendingCapitalFactionId ?? null,
    selectedSystemId: systemId,
    selectedSystemIds: systemId ? [systemId] : [],
    selectedFleetId: opts.fleetId ?? null,
    selectedLegionId: opts.legionId ?? null,
    cameraFocusSystemId: systemId,
    dossierSystemId: dive === "system" || dive === "planet" ? systemId : null,
    mapFocus: resolveMapFocus(dive, systemId, planetId),
    tool: opts.tool ?? "select",
    contextMenu: null,
  };
  if (opts.factionId) patch.activeFactionId = opts.factionId;
  return patch;
}
