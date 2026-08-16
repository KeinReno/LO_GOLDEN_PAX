import type { MapViewModel } from "../../../renderers/MapCanvas";
import type { ViewerPayload, WorldState } from "../../../state/types";
import type { MapLayerFlags } from "../../../ui/mapLayers";

export type ViewerPlayMapModelInput = {
  payload: ViewerPayload | null;
  selectedSystemId: string | null;
  selectedFleetId: string | null;
  selectedLegionId: string | null;
  layers: MapLayerFlags;
  perfMode: MapViewModel["perfMode"];
  mapStyle: MapViewModel["mapStyle"];
  mapGraphics: MapViewModel["graphics"];
  economyBottleneckSystemIds?: string[];
};

const EMPTY_SELECTION = {
  selectedLinkId: null,
  selectedSectorId: null,
  linkDraftFromId: null,
  sectorDraftPoints: [] as number[],
};

export function emptyViewerPlayWorld(): WorldState {
  return {
    meta: {
      schemaVersion: 2,
      name: "",
      turn: 0,
      createdAt: "",
      updatedAt: "",
      width: 4000,
      height: 3000,
    },
    systems: [],
    links: [],
    sectors: [],
    factions: [],
    races: [],
    fleets: [],
    legions: [],
    diplomacy: [],
    orders: [],
    turnHistory: [],
    caravans: [],
    quests: [],
  };
}

export function buildViewerPlayMapModel(
  p: ViewerPlayMapModelInput,
): MapViewModel {
  if (!p.payload) {
    return {
      world: emptyViewerPlayWorld(),
      selectedSystemId: null,
      selectedFleetId: null,
      selectedLegionId: null,
      ...EMPTY_SELECTION,
      ...p.layers,
      perfMode: p.perfMode,
      mapStyle: p.mapStyle,
      graphics: p.mapGraphics,
    };
  }
  return {
    world: p.payload.world,
    selectedSystemId: p.selectedSystemId,
    selectedFleetId: p.selectedFleetId,
    selectedLegionId: p.selectedLegionId,
    ...EMPTY_SELECTION,
    ...p.layers,
    showOrders: true,
    showSupply: false,
    showDiplomacy: false,
    activeFactionId: p.payload.factionId,
    economyBottleneckSystemIds: p.economyBottleneckSystemIds,
    perfMode: p.perfMode,
    mapStyle: p.mapStyle,
    graphics: p.mapGraphics,
  };
}
