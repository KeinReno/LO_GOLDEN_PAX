import type { MutableRefObject } from "react";
import type { StarSystem, WorldState } from "../../state/types";
import type { MapStyleId } from "../styles";

export interface MapViewModel {
  world: WorldState;
  selectedSystemId: string | null;
  selectedSystemIds?: string[];
  selectedFleetId: string | null;
  selectedLegionId: string | null;
  selectedLinkId: string | null;
  selectedSectorId: string | null;
  linkDraftFromId: string | null;
  sectorDraftPoints: number[];
  showLinks: boolean;
  showOwnership: boolean;
  showTerritory: boolean;
  showSectors: boolean;
  showFactionLabels: boolean;
  showLabels: boolean;
  showFleets: boolean;
  showLegions: boolean;
  showOrders: boolean;
  showDiplomacy: boolean;
  showFogPreview: boolean;
  gmOmniscientView?: boolean;
  fogMaskPreview?: string[];
  showJumpRange?: boolean;
  showSupply?: boolean;
  showCaravans?: boolean;
  showBlockades?: boolean;
  showDeadZones?: boolean;
  showTraffic?: boolean;
  showQuests?: boolean;
  /** Loyalty heat halo (A3). */
  showLoyalty?: boolean;
  /** Signal icons: fan arc vs priority stack +N */
  showSignalFan?: boolean;
  /** Viewer: systems with severe economy bottlenecks (badge). */
  economyBottleneckSystemIds?: string[];
  activeFactionId?: string | null;
  /** ultralight(bare) | mobile(lite) | quality_mobile(soft) | quality(full) | cinematic(full+) | auto */
  perfMode?:
    | "auto"
    | "quality"
    | "quality_mobile"
    | "mobile"
    | "ultralight"
    | "cinematic";
  mapStyle?: MapStyleId;
  graphics?: {
    animations?: boolean;
    labelShadows?: boolean;
    tableFx?: boolean;
    battleFx?: boolean;
    territoryGlow?: boolean;
    liveZoomRebuild?: boolean;
    turnStamp?: boolean;
    scarFx?: boolean;
    cinematic?: boolean;
  };
}

export interface MapCanvasApi {
  zoomBy: (factor: number) => void;
  resetView: () => void;
  /** Pan camera so system is centered (viewer Forces / search). */
  focusSystem: (systemId: string) => void;
  /** DOM client coords → system under that point. Bridges a DOM drag
   * (DragCard/DropZone) onto the Pixi canvas, which has no per-system DOM node. */
  hitTestSystemAtClient: (clientX: number, clientY: number) => StarSystem | null;
  /** Brief pulse at a system marking how a drag/order resolved. */
  flashSystem: (systemId: string, kind: "move" | "attack" | "claim") => void;
}

export type PerfTier = "full" | "soft" | "lite" | "bare";

export type UnitDropIntent = "move" | "attack" | "claim";

/** Hostile fleet/legion under drag pointer (viewer attack snap). */
export type HostileUnitDropTarget = {
  targetKind: "fleet" | "legion";
  targetId: string;
  systemId: string;
  isoX: number;
  isoY: number;
};

export type MapUnitDropPayload = {
  kind: "fleet" | "legion";
  unitId: string;
  fromSystemId: string;
  toSystemId: string;
  hops: number;
  /** Resolved from target ownership: own→move, enemy/contested→attack, unowned→claim. */
  intent?: UnitDropIntent;
  /** Drop snapped to hostile unit glyph (not only system). */
  targetUnitKind?: "fleet" | "legion";
  targetUnitId?: string;
  targetFactionId?: string;
};

export type MapContextPick = {
  screenX: number;
  screenY: number;
  worldX: number;
  worldY: number;
  systemId: string | null;
  fleetId: string | null;
  legionId: string | null;
  linkId: string | null;
  /** True when fleetId came from findFleetAt at the pointer (glyph hit). */
  fromFleetHit?: boolean;
  /** True when legionId came from findLegionAt at the pointer (glyph hit). */
  fromLegionHit?: boolean;
};

export interface MapCanvasProps {
  mode?: "editor" | "viewer";
  readModel?: () => MapViewModel;
  onModelSubscribe?: (cb: () => void) => () => void;
  onSystemClick?: (systemId: string | null) => void;
  onFleetClick?: (
    fleetId: string,
    screen?: { x: number; y: number },
    retain?: boolean,
  ) => void;
  onLegionClick?: (
    legionId: string,
    screen?: { x: number; y: number },
    retain?: boolean,
  ) => void;
  /** Viewer: only these faction's units can be dragged to order a move. */
  playerFactionId?: string | null;
  /** Viewer: drop after drag → submit move order (editor relocates in-store). */
  onUnitDrop?: (drop: MapUnitDropPayload) => void;
  /** Viewer: drag-drop could not apply (show message). */
  onUnitDropReject?: (message: string) => void;
  /** Viewer: highlight own unit while dragging (no sheet). */
  onUnitDragStart?: (kind: "fleet" | "legion", unitId: string) => void;
  /** Viewer RMB menu (editor uses worldStore contextMenu). */
  onViewerContextMenu?: (pick: MapContextPick) => void;
  /**
   * Viewer: long-press completed on a system. Return true to skip context menu
   * (e.g. parent opens FleetOrderRing).
   */
  onSystemHold?: (
    systemId: string,
    screenX: number,
    screenY: number,
  ) => boolean | void;
  /** Viewer: 0..1 hold progress during touch long-press (null = cleared). */
  onHoldProgress?: (
    pick: { x: number; y: number; progress: number } | null,
  ) => void;
  /** Viewer: double-click system → dive into system view. */
  onSystemOpen?: (systemId: string) => void;
  interactive?: boolean;
  hostClassName?: string;
  apiRef?: MutableRefObject<MapCanvasApi | null>;
}

export type SystemHoverTip = {
  systemId: string;
  name: string;
  screenX: number;
  screenY: number;
  lines: string[];
};
