import { create } from "zustand";
import { v4 as uuid } from "uuid";
import { generateAlongBrush, type Point } from "../generators/brushGenerator";
import { createRandomSystem, createRng } from "../generators/systemFactory";
import { createEmptyWorld } from "./defaults";
import {
  POI_PAINT_TOOLS,
  type Caravan,
  type DiplomacyRelation,
  type EditorTool,
  type Faction,
  type Fleet,
  type FleetStance,
  type GmShellMode,
  type Legion,
  type Planet,
  type PlayerOrder,
  type Quest,
  type Sector,
  type StarSystem,
  type SystemPoiType,
  type SystemSelectMode,
  type TurnSnapshot,
  type UiState,
  type UnitOrderIntent,
  type WorldState,
} from "./types";
import { assignSystemsToSector } from "./sectors";
import { resolvePolityKind } from "./territory";
import { withFullMapVision } from "./fog";
import { normalizeSystemPlanets } from "./planets";
import {
  applyHistoryOnWorldChange,
  emptyHistory,
  type HistoryPatch,
} from "./history";
import { advanceCaravans, clampRep, driftAnomalies } from "./mapFeatures";
import { toggleSpaceObject, withSpaceObjects } from "./spaceObjects";
import { RESOURCE_POOL } from "./defaults";
import {
  readStoredEditorGraphics,
  writeStoredEditorGraphics,
  type GraphicsPrefKey,
  type ViewerGraphicsPrefs,
} from "../ui/viewerGraphics";

const GM_SHELL_KEY = "gmap-gm-shell-mode";

function readGmShellMode(): GmShellMode {
  try {
    const v = localStorage.getItem(GM_SHELL_KEY);
    if (v === "prep" || v === "live") return v;
  } catch {
    /* ignore */
  }
  return "prep";
}

interface WorldStore extends UiState {
  world: WorldState;
  publishStatus: string | null;
  undoPast: WorldState[];
  undoFuture: WorldState[];
  historyCoalesceKey: string | null;
  historyCoalesceAt: number;
  undo: () => void;
  redo: () => void;
  setTool: (tool: EditorTool) => void;
  selectSystem: (id: string | null, mode?: SystemSelectMode) => void;
  setSelectedSystems: (ids: string[]) => void;
  clearSystemSelection: () => void;
  selectFleet: (id: string | null) => void;
  selectLegion: (id: string | null) => void;
  selectLink: (id: string | null) => void;
  selectSector: (id: string | null) => void;
  setLinkDraftFrom: (id: string | null) => void;
  setActiveFaction: (id: string | null) => void;
  setBrushDensity: (density: number) => void;
  setBrushMinDistance: (minDistance: number) => void;
  setBrushLinkDistance: (linkDistance: number) => void;
  setBrushCorridorChance: (corridorChance: number) => void;
  toggleShowLinks: () => void;
  toggleShowOwnership: () => void;
  toggleShowTerritory: () => void;
  toggleShowSectors: () => void;
  toggleShowFactionLabels: () => void;
  toggleShowLabels: () => void;
  toggleShowFleets: () => void;
  toggleShowLegions: () => void;
  toggleShowOrders: () => void;
  toggleShowDiplomacy: () => void;
  toggleShowFogPreview: () => void;
  toggleGmOmniscientView: () => void;
  setGmOmniscientView: (on: boolean) => void;
  setFogMaskPreview: (systemIds: string[]) => void;
  activeConsequencePresetId: string | null;
  setActiveConsequencePresetId: (id: string | null) => void;
  toggleShowJumpRange: () => void;
  toggleShowSupply: () => void;
  toggleShowCaravans: () => void;
  toggleShowBlockades: () => void;
  toggleShowDeadZones: () => void;
  toggleShowTraffic: () => void;
  toggleShowQuests: () => void;
  editorGraphics: ViewerGraphicsPrefs;
  toggleEditorGraphic: (key: GraphicsPrefKey) => void;
  applyMapLayerFlags: (flags: Partial<{
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
    gmOmniscientView: boolean;
    showJumpRange: boolean;
    showSupply: boolean;
    showCaravans: boolean;
    showBlockades: boolean;
    showDeadZones: boolean;
    showTraffic: boolean;
    showQuests: boolean;
    showLoyalty: boolean;
  }>) => void;
  setDiplomacyPanelOpen: (open: boolean) => void;
  setRpFloatOpen: (open: boolean) => void;
  /** Open floating RP focused on a faction HQ channel (null = last / home). */
  openRpForFaction: (factionId: string | null) => void;
  setGmShellMode: (mode: GmShellMode) => void;
  setOpenQuestId: (id: string | null) => void;
  upsertQuest: (quest: Quest) => void;
  removeQuest: (id: string) => void;
  addCaravan: (caravan: Omit<Caravan, "id"> & { id?: string }) => void;
  removeCaravan: (id: string) => void;
  loadWorld: (world: WorldState) => void;
  resetWorld: () => void;
  addSystemAt: (x: number, y: number) => void;
  moveSystem: (id: string, x: number, y: number) => void;
  moveSystemsBy: (ids: string[], dx: number, dy: number) => void;
  deleteSystem: (id: string) => void;
  deleteSystems: (ids: string[]) => void;
  paintFaction: (systemId: string) => void;
  paintFactionMany: (systemIds: string[]) => void;
  paintCoOwnerMany: (systemIds: string[]) => void;
  toggleContestedMany: (systemIds: string[]) => void;
  paintPlanetOwner: (systemId: string, planetId: string) => void;
  paintPlanetCoOwner: (systemId: string, planetId: string) => void;
  togglePlanetContested: (systemId: string, planetId: string) => void;
  applySystemPoi: (systemId: string, poi: SystemPoiType) => void;
  applySystemPoiMany: (systemIds: string[], poi: SystemPoiType) => void;
  paintPoiWithActiveTool: (systemId: string) => void;
  setActiveResource: (resource: string | null) => void;
  paintResourceOnSystem: (systemId: string) => void;
  paintResourceOnPlanet: (systemId: string, planetId: string) => void;
  revealSystem: (systemId: string) => void;
  revealAllVisible: () => void;
  clearFactionReveals: () => void;
  applyBrushStroke: (stroke: Point[]) => void;
  updateSelectedSystem: (patch: Partial<StarSystem>) => void;
  updatePlanet: (planetId: string, patch: Partial<Planet>) => void;
  addPlanet: () => void;
  removePlanet: (planetId: string) => void;
  addFaction: (faction: Omit<Faction, "id"> & { id?: string }) => void;
  updateFaction: (id: string, patch: Partial<Faction>) => void;
  removeFaction: (id: string) => void;
  setFactionCapital: (factionId: string, systemId: string) => void;
  clearFactionOwnership: (factionId: string) => void;
  beginAssignCapital: (factionId: string) => void;
  focusCameraOnSystem: (systemId: string) => void;
  openPolityEditor: (factionId?: string | null) => void;
  closePolityEditor: () => void;
  placeFleetOnSystem: (systemId: string) => void;
  updateFleet: (id: string, patch: Partial<Fleet>) => void;
  /** Move fleet to another system (persists in world data). */
  relocateFleet: (fleetId: string, systemId: string) => void;
  deleteFleet: (id: string) => void;
  setFleetRouteHop: (fleetId: string, systemId: string) => void;
  setLegionRouteHop: (legionId: string, systemId: string) => void;
  beginUnitOrder: (
    unitKind: "fleet" | "legion",
    unitId: string,
    intent: UnitOrderIntent,
  ) => void;
  clearPendingUnitOrder: () => void;
  applyPendingUnitOrder: (systemId: string) => void;
  beginFleetClone: (fleetId: string) => void;
  clearPendingFleetClone: () => void;
  cloneFleetToSystem: (systemId: string) => void;
  placeLegionOnSystem: (systemId: string) => void;
  updateLegion: (id: string, patch: Partial<Legion>) => void;
  relocateLegion: (legionId: string, systemId: string) => void;
  deleteLegion: (id: string) => void;
  addOrToggleLink: (fromId: string, toId: string) => void;
  updateLink: (id: string, patch: Partial<import("./types").SystemLink>) => void;
  deleteLink: (id: string) => void;
  pushSectorDraftPoint: (x: number, y: number) => void;
  undoSectorDraftPoint: () => void;
  clearSectorDraft: () => void;
  finishSectorDraft: () => void;
  updateSector: (id: string, patch: Partial<Sector>) => void;
  deleteSector: (id: string) => void;
  reassignSectorSystems: (sectorId: string) => void;
  advanceTurn: (label?: string) => void;
  restoreTurnSnapshot: (index: number) => void;
  setDiplomacy: (aId: string, bId: string, relation: DiplomacyRelation) => void;
  addOrder: (order: Omit<PlayerOrder, "id" | "createdAt" | "status" | "turn">) => void;
  setOrderStatus: (id: string, status: PlayerOrder["status"]) => void;
  clearOrders: (factionId?: string) => void;
  publishCampaign: (masterToken?: string) => Promise<void>;
  dossierSystemId: string | null;
  dossierFactionId: string | null;
  pendingCapitalFactionId: string | null;
  cameraFocusSystemId: string | null;
  setDossierSystem: (id: string | null) => void;
  mapFocus: import("./types").MapFocus;
  openSystemView: (systemId: string) => void;
  openPlanetView: (systemId: string, planetId: string) => void;
  closeSystemView: () => void;
  setContextMenu: (menu: import("./types").ContextMenuState | null) => void;
}

function snapshotFromWorld(world: WorldState, label: string): TurnSnapshot {
  return {
    turn: world.meta.turn,
    savedAt: new Date().toISOString(),
    label,
    systems: structuredClone(world.systems),
    links: structuredClone(world.links),
    sectors: structuredClone(world.sectors),
    factions: structuredClone(world.factions),
    races: structuredClone(world.races),
    fleets: structuredClone(world.fleets),
    legions: structuredClone(world.legions),
    diplomacy: structuredClone(world.diplomacy),
    orders: structuredClone(world.orders),
    caravans: structuredClone(world.caravans ?? []),
    quests: structuredClone(world.quests ?? []),
  };
}

function touch(world: WorldState): WorldState {
  return {
    ...world,
    meta: { ...world.meta, updatedAt: new Date().toISOString() },
  };
}

function normalizeWorld(raw: WorldState): WorldState {
  return {
    ...createEmptyWorld(raw.meta?.name),
    ...raw,
    meta: { ...createEmptyWorld().meta, ...raw.meta },
    systems: (raw.systems ?? []).map((s) =>
      normalizeSystemPlanets({
        ...s,
        kind: s.kind ?? (s.stars?.length ? "stellar" : "corridor"),
        visibleToFactionIds: s.visibleToFactionIds ?? [],
        stars: s.stars ?? [],
        planets: s.planets ?? [],
        stations: s.stations ?? [],
        resources: s.resources ?? [],
        activity: s.activity ?? "none",
        tradeWithSystemId: s.tradeWithSystemId ?? null,
        notes: s.notes ?? "",
        isCapital: s.isCapital ?? false,
        poiType: s.poiType ?? "none",
        spaceObjects: s.spaceObjects ?? (s.poiType && s.poiType !== "none" ? [s.poiType] : []),
        scannerDeadZone: s.scannerDeadZone ?? s.poiType === "dead_zone",
        blockaded: s.blockaded ?? false,
        coOwnerFactionIds: s.coOwnerFactionIds ?? [],
        contested: s.contested ?? false,
        anomalyMotion: s.anomalyMotion ?? null,
        questId: s.questId ?? null,
        trafficHub: s.trafficHub ?? s.poiType === "hub",
      }),
    ),
    fleets: (raw.fleets ?? []).map((f) => ({
      ...f,
      kind: f.kind ?? "combat",
      route: f.route ?? [],
      stance: f.stance ?? "idle",
    })),
    legions: (raw.legions ?? []).map((l) => ({
      ...l,
      route: l.route ?? [],
      status: l.status ?? "idle",
    })),
    diplomacy: raw.diplomacy ?? [],
    orders: raw.orders ?? [],
    sectors: (raw.sectors ?? []).map((sec) => {
      const anySec = sec as Sector & { points?: number[] };
      const polygon =
        anySec.polygon ??
        anySec.points ??
        [];
      return {
        ...sec,
        polygon,
        name: sec.name ?? "Сектор",
      };
    }),
    factions: (raw.factions ?? []).map((f) => ({
      ...f,
      kind: resolvePolityKind(f),
      fullMapVision: f.fullMapVision === true ? true : false,
      neutralReputation: clampRep(f.neutralReputation ?? 0),
    })),
    races: raw.races ?? [],
    links: (raw.links ?? []).map((l) => ({
      ...l,
      type: l.type ?? "corridor",
      fromPlanetId: l.fromPlanetId ?? null,
      toPlanetId: l.toPlanetId ?? null,
    })),
    turnHistory: raw.turnHistory ?? [],
    caravans: raw.caravans ?? [],
    quests: raw.quests ?? [],
  };
}

export const useWorldStore = create<WorldStore>((rawSet, get) => {
  const set = ((
    partial:
      | Partial<WorldStore>
      | HistoryPatch
      | ((state: WorldStore) => Partial<WorldStore> | HistoryPatch),
    replace?: boolean,
  ) => {
    if (typeof partial === "function") {
      rawSet((state) => {
        const result = partial(state);
        if (!result || typeof result !== "object") return result as never;
        return applyHistoryOnWorldChange(
          state,
          result as HistoryPatch,
        ) as Partial<WorldStore>;
      });
      return;
    }
    if (partial && typeof partial === "object") {
      rawSet(
        applyHistoryOnWorldChange(
          get(),
          partial as HistoryPatch,
        ) as Partial<WorldStore>,
      );
      return;
    }
    rawSet(partial as never, replace as never);
  }) as typeof rawSet;

  return {
  world: createEmptyWorld(),
  publishStatus: null,
  ...emptyHistory(),
  dossierSystemId: null,
  dossierFactionId: null,
  pendingCapitalFactionId: null,
  pendingUnitOrder: null,
  pendingFleetCloneId: null,
  activeResource: null,
  cameraFocusSystemId: null,
  mapFocus: { level: "galaxy" },
  tool: "select",
  selectedSystemId: null,
  selectedSystemIds: [],
  selectedFleetId: null,
  selectedLegionId: null,
  selectedLinkId: null,
  selectedSectorId: null,
  linkDraftFromId: null,
  sectorDraftPoints: [],
  activeFactionId: "faction_a",
  brush: {
    density: 0.55,
    minDistance: 48,
    linkDistance: 120,
    resourceChance: 0.35,
    corridorChance: 0.12,
  },
  showLinks: true,
  showOwnership: false,
  showTerritory: true,
  showSectors: true,
  showFactionLabels: true,
  showLabels: true,
  showFleets: true,
  showLegions: true,
  showOrders: true,
  showDiplomacy: false,
  showFogPreview: false,
  gmOmniscientView: true,
  fogMaskPreview: [],
  activeConsequencePresetId: "after_battle",
  showJumpRange: true,
  showSupply: false,
  showCaravans: true,
  showBlockades: true,
  showDeadZones: true,
  showTraffic: true,
  showQuests: true,
  showLoyalty: false,
  openQuestId: null,
  editorGraphics: readStoredEditorGraphics(),
  diplomacyPanelOpen: false,
  rpFloatOpen: false,
  rpFocusFactionId: null,
  gmShellMode: readGmShellMode(),
  contextMenu: null,

  setTool: (tool) =>
    set({
      tool,
      linkDraftFromId: tool === "add_link" ? get().linkDraftFromId : null,
      sectorDraftPoints:
        tool === "draw_sector" ? get().sectorDraftPoints : [],
      contextMenu: null,
    }),
  selectSystem: (id, mode = "replace") => {
    if (id === null) {
      set({ selectedSystemId: null, selectedSystemIds: [] });
      return;
    }
    const cur = get().selectedSystemIds;
    if (mode === "toggle") {
      const has = cur.includes(id);
      const next = has ? cur.filter((x) => x !== id) : [...cur, id];
      set({
        selectedSystemIds: next,
        selectedSystemId: next.length ? (has ? (next[next.length - 1] ?? null) : id) : null,
      });
      return;
    }
    if (mode === "add") {
      const next = cur.includes(id) ? cur : [...cur, id];
      set({ selectedSystemIds: next, selectedSystemId: id });
      return;
    }
    set({ selectedSystemIds: [id], selectedSystemId: id });
  },
  setSelectedSystems: (ids) =>
    set({
      selectedSystemIds: ids,
      selectedSystemId: ids[ids.length - 1] ?? null,
    }),
  clearSystemSelection: () =>
    set({ selectedSystemId: null, selectedSystemIds: [] }),
  selectFleet: (id) => set({ selectedFleetId: id }),
  selectLegion: (id) => set({ selectedLegionId: id }),
  selectLink: (id) => set({ selectedLinkId: id }),
  selectSector: (id) => set({ selectedSectorId: id }),
  setLinkDraftFrom: (id) => set({ linkDraftFromId: id }),
  setActiveFaction: (id) => set({ activeFactionId: id }),
  setBrushDensity: (density) =>
    set((s) => ({ brush: { ...s.brush, density } })),
  setBrushMinDistance: (minDistance) =>
    set((s) => ({ brush: { ...s.brush, minDistance } })),
  setBrushLinkDistance: (linkDistance) =>
    set((s) => ({ brush: { ...s.brush, linkDistance } })),
  setBrushCorridorChance: (corridorChance) =>
    set((s) => ({ brush: { ...s.brush, corridorChance } })),
  toggleShowLinks: () => set((s) => ({ showLinks: !s.showLinks })),
  toggleShowOwnership: () => set((s) => ({ showOwnership: !s.showOwnership })),
  toggleShowTerritory: () => set((s) => ({ showTerritory: !s.showTerritory })),
  toggleShowSectors: () => set((s) => ({ showSectors: !s.showSectors })),
  toggleShowFactionLabels: () =>
    set((s) => ({ showFactionLabels: !s.showFactionLabels })),
  toggleShowLabels: () => set((s) => ({ showLabels: !s.showLabels })),
  toggleShowFleets: () => set((s) => ({ showFleets: !s.showFleets })),
  toggleShowLegions: () => set((s) => ({ showLegions: !s.showLegions })),
  toggleShowOrders: () => set((s) => ({ showOrders: !s.showOrders })),
  toggleShowDiplomacy: () => set((s) => ({ showDiplomacy: !s.showDiplomacy })),
  toggleShowFogPreview: () =>
    set((s) => ({ showFogPreview: !s.showFogPreview })),
  toggleGmOmniscientView: () =>
    set((s) => ({ gmOmniscientView: !s.gmOmniscientView })),
  setGmOmniscientView: (on: boolean) => set({ gmOmniscientView: on }),
  setFogMaskPreview: (systemIds) => set({ fogMaskPreview: systemIds }),
  setActiveConsequencePresetId: (id) =>
    set({ activeConsequencePresetId: id }),
  toggleShowJumpRange: () =>
    set((s) => ({ showJumpRange: !s.showJumpRange })),
  toggleShowSupply: () => set((s) => ({ showSupply: !s.showSupply })),
  toggleShowCaravans: () => set((s) => ({ showCaravans: !s.showCaravans })),
  toggleShowBlockades: () =>
    set((s) => ({ showBlockades: !s.showBlockades })),
  toggleShowDeadZones: () =>
    set((s) => ({ showDeadZones: !s.showDeadZones })),
  toggleShowTraffic: () => set((s) => ({ showTraffic: !s.showTraffic })),
  toggleShowQuests: () => set((s) => ({ showQuests: !s.showQuests })),
  toggleEditorGraphic: (key) =>
    set((s) => {
      const next = { ...s.editorGraphics, [key]: !s.editorGraphics[key] };
      writeStoredEditorGraphics(next);
      return { editorGraphics: next };
    }),
  applyMapLayerFlags: (flags) => set((s) => ({ ...s, ...flags })),
  setDiplomacyPanelOpen: (open) => set({ diplomacyPanelOpen: open }),
  setRpFloatOpen: (open) =>
    set(
      open
        ? { rpFloatOpen: true }
        : { rpFloatOpen: false, rpFocusFactionId: null },
    ),
  openRpForFaction: (factionId) =>
    set({ rpFloatOpen: true, rpFocusFactionId: factionId }),
  setGmShellMode: (mode) => {
    try {
      localStorage.setItem(GM_SHELL_KEY, mode);
    } catch {
      /* ignore */
    }
    set({ gmShellMode: mode });
  },
  setOpenQuestId: (id) => set({ openQuestId: id }),

  upsertQuest: (quest) => {
    const { world } = get();
    const exists = world.quests.some((q) => q.id === quest.id);
    const quests = exists
      ? world.quests.map((q) => (q.id === quest.id ? quest : q))
      : [...world.quests, quest];
    set({
      world: touch({
        ...world,
        quests,
        systems: world.systems.map((s) =>
          s.id === quest.systemId
            ? { ...s, questId: quest.id, poiType: s.poiType === "none" ? "quest" : s.poiType }
            : s.questId === quest.id && s.id !== quest.systemId
              ? { ...s, questId: null }
              : s,
        ),
      }),
    });
  },

  removeQuest: (id) => {
    const { world, openQuestId } = get();
    set({
      world: touch({
        ...world,
        quests: world.quests.filter((q) => q.id !== id),
        systems: world.systems.map((s) =>
          s.questId === id ? { ...s, questId: null } : s,
        ),
      }),
      openQuestId: openQuestId === id ? null : openQuestId,
    });
  },

  addCaravan: (caravan) => {
    const { world } = get();
    const id = caravan.id ?? uuid();
    set({
      world: touch({
        ...world,
        caravans: [
          ...world.caravans,
          {
            ...caravan,
            progress: caravan.progress ?? 0,
            factionId: caravan.factionId ?? null,
            id,
          },
        ],
      }),
    });
  },

  removeCaravan: (id) => {
    const { world } = get();
    set({
      world: touch({
        ...world,
        caravans: world.caravans.filter((c) => c.id !== id),
      }),
    });
  },
  setDossierSystem: (id) => {
    if (!id) {
      set({
        dossierSystemId: null,
        mapFocus: { level: "galaxy" },
      });
      return;
    }
    set({
      dossierSystemId: id,
      dossierFactionId: null,
      pendingCapitalFactionId: null,
      selectedSystemId: id,
      selectedSystemIds: id ? [id] : [],
      selectedFleetId: null,
      selectedLegionId: null,
      selectedLinkId: null,
      mapFocus: { level: "system", systemId: id },
      contextMenu: null,
    });
  },

  openSystemView: (systemId) => {
    get().setDossierSystem(systemId);
  },

  openPlanetView: (systemId, planetId) => {
    set({
      dossierSystemId: systemId,
      dossierFactionId: null,
      pendingCapitalFactionId: null,
      selectedSystemId: systemId,
      selectedSystemIds: systemId ? [systemId] : [],
      mapFocus: { level: "planet", systemId, planetId },
      contextMenu: null,
    });
  },

  closeSystemView: () => {
    set({
      dossierSystemId: null,
      mapFocus: { level: "galaxy" },
    });
  },

  openPolityEditor: (factionId) => {
    const { world, activeFactionId } = get();
    const id =
      factionId ??
      activeFactionId ??
      world.factions[0]?.id ??
      null;
    set({
      dossierFactionId: id,
      dossierSystemId: null,
      mapFocus: { level: "galaxy" },
      activeFactionId: id ?? activeFactionId,
      pendingCapitalFactionId: null,
      contextMenu: null,
    });
  },

  closePolityEditor: () =>
    set({
      dossierFactionId: null,
      pendingCapitalFactionId: null,
    }),

  beginAssignCapital: (factionId) => {
    set({
      dossierFactionId: null,
      pendingCapitalFactionId: factionId,
      activeFactionId: factionId,
      tool: "select",
      contextMenu: null,
    });
  },

  focusCameraOnSystem: (systemId) => {
    set({
      cameraFocusSystemId: systemId,
      selectedSystemId: systemId,
      selectedSystemIds: systemId ? [systemId] : [],
      dossierFactionId: null,
      dossierSystemId: null,
      mapFocus: { level: "galaxy" },
      pendingCapitalFactionId: null,
    });
  },

  setContextMenu: (menu) => set({ contextMenu: menu }),
  beginUnitOrder: (unitKind, unitId, intent) =>
    set({
      pendingUnitOrder: { unitKind, unitId, intent },
      pendingFleetCloneId: null,
      contextMenu: null,
      tool: "select",
    }),
  clearPendingUnitOrder: () => set({ pendingUnitOrder: null }),
  beginFleetClone: (fleetId) =>
    set({
      pendingFleetCloneId: fleetId,
      pendingUnitOrder: null,
      contextMenu: null,
      tool: "select",
      selectedFleetId: fleetId,
    }),
  clearPendingFleetClone: () => set({ pendingFleetCloneId: null }),
  cloneFleetToSystem: (systemId) => {
    const { world, pendingFleetCloneId } = get();
    if (!pendingFleetCloneId) return;
    const src = world.fleets.find((f) => f.id === pendingFleetCloneId);
    if (!src) {
      set({ pendingFleetCloneId: null });
      return;
    }
    const copy: Fleet = {
      id: uuid(),
      name: `${src.name} (копия)`,
      factionId: src.factionId,
      systemId,
      kind: src.kind ?? "combat",
      composition: src.composition.map((c) => ({ ...c })),
      stance: "idle",
      route: [],
    };
    set({
      world: touch({
        ...world,
        fleets: [...world.fleets, copy],
        systems: world.systems.map((s) => {
          if (s.id !== systemId) return s;
          const vis = new Set(s.visibleToFactionIds ?? []);
          vis.add(src.factionId);
          return { ...s, visibleToFactionIds: [...vis] };
        }),
      }),
      pendingFleetCloneId: null,
      selectedFleetId: copy.id,
      selectedSystemId: systemId,
      selectedSystemIds: [systemId],
      selectedLegionId: null,
      selectedLinkId: null,
    });
  },
  applyPendingUnitOrder: (systemId) => {
    const pending = get().pendingUnitOrder;
    if (!pending) return;
    const { world } = get();
    if (pending.unitKind === "fleet") {
      const stanceMap: Record<UnitOrderIntent, FleetStance> = {
        move: "move",
        attack: "attack",
        fortify: "fortify",
        blockade: "blockade",
        defend: "defend",
        repair: "repair",
      };
      const stance = stanceMap[pending.intent];
      set({
        world: touch({
          ...world,
          fleets: world.fleets.map((f) =>
            f.id === pending.unitId
              ? {
                  ...f,
                  route: systemId === f.systemId ? [] : [systemId],
                  stance,
                }
              : f,
          ),
          systems: world.systems.map((s) => {
            if (s.id !== systemId) return s;
            if (pending.intent === "blockade") {
              return { ...s, blockaded: true };
            }
            if (pending.intent === "attack") {
              return {
                ...s,
                activity: s.activity === "none" ? "battle" : s.activity,
              };
            }
            return s;
          }),
        }),
        pendingUnitOrder: null,
        selectedFleetId: pending.unitId,
        selectedSystemId: systemId,
        selectedSystemIds: [systemId],
      });
      return;
    }
    const statusMap: Record<
      UnitOrderIntent,
      import("./types").LegionStatus
    > = {
      move: "move",
      attack: "assault",
      fortify: "fortify",
      blockade: "blockade",
      defend: "garrison",
      repair: "recovering",
    };
    const status = statusMap[pending.intent];
    set({
      world: touch({
        ...world,
        legions: world.legions.map((l) =>
          l.id === pending.unitId
            ? {
                ...l,
                route: systemId === l.systemId ? [] : [systemId],
                status,
              }
            : l,
        ),
      }),
      pendingUnitOrder: null,
      selectedLegionId: pending.unitId,
      selectedSystemId: systemId,
      selectedSystemIds: [systemId],
    });
  },

  undo: () => {
    const { undoPast, world, undoFuture } = get();
    if (undoPast.length === 0) return;
    const prev = undoPast[undoPast.length - 1]!;
    rawSet({
      world: prev,
      undoPast: undoPast.slice(0, -1),
      undoFuture: [...undoFuture, structuredClone(world)],
      historyCoalesceKey: null,
      historyCoalesceAt: 0,
    });
  },

  redo: () => {
    const { undoPast, world, undoFuture } = get();
    if (undoFuture.length === 0) return;
    const next = undoFuture[undoFuture.length - 1]!;
    rawSet({
      world: next,
      undoFuture: undoFuture.slice(0, -1),
      undoPast: [...undoPast, structuredClone(world)],
      historyCoalesceKey: null,
      historyCoalesceAt: 0,
    });
  },

  loadWorld: (world) =>
    rawSet({
      world: normalizeWorld(world),
      selectedSystemId: null,
      selectedSystemIds: [],
      selectedFleetId: null,
      selectedLegionId: null,
      selectedLinkId: null,
      selectedSectorId: null,
      linkDraftFromId: null,
      sectorDraftPoints: [],
      dossierSystemId: null,
      dossierFactionId: null,
      pendingCapitalFactionId: null,
      cameraFocusSystemId: null,
      mapFocus: { level: "galaxy" },
      contextMenu: null,
      ...emptyHistory(),
    }),

  resetWorld: () =>
    rawSet({
      world: createEmptyWorld(),
      selectedSystemId: null,
      selectedSystemIds: [],
      selectedFleetId: null,
      selectedLegionId: null,
      selectedLinkId: null,
      selectedSectorId: null,
      linkDraftFromId: null,
      sectorDraftPoints: [],
      dossierSystemId: null,
      dossierFactionId: null,
      pendingCapitalFactionId: null,
      cameraFocusSystemId: null,
      mapFocus: { level: "galaxy" },
      ...emptyHistory(),
    }),

  touchMeta: () => rawSet((s) => ({ world: touch(s.world) })),

  addSystemAt: (x, y) => {
    const { world, tool } = get();
    const rnd = createRng();
    const kind = tool === "add_corridor" ? "corridor" : "stellar";
    const sys = createRandomSystem(
      x,
      y,
      rnd,
      world.systems.length + 1,
      0.35,
      kind,
    );
    sys.visibleToFactionIds = withFullMapVision(
      world,
      sys.visibleToFactionIds ?? [],
    );
    set({
      world: touch({
        ...world,
        systems: [...world.systems, sys],
      }),
      selectedSystemId: sys.id,
      selectedSystemIds: [sys.id],
    });
  },

  moveSystem: (id, x, y) => {
    const { world } = get();
    set({
      world: touch({
        ...world,
        systems: world.systems.map((s) =>
          s.id === id ? { ...s, x, y } : s,
        ),
      }),
      _coalesce: `move:${id}`,
    } as HistoryPatch);
  },

  moveSystemsBy: (ids, dx, dy) => {
    if (!ids.length || (dx === 0 && dy === 0)) return;
    const { world } = get();
    const idSet = new Set(ids);
    const key = [...ids].sort().join(",");
    set({
      world: touch({
        ...world,
        systems: world.systems.map((s) =>
          idSet.has(s.id) ? { ...s, x: s.x + dx, y: s.y + dy } : s,
        ),
      }),
      _coalesce: `move-multi:${key}`,
    } as HistoryPatch);
  },

  deleteSystem: (id) => {
    get().deleteSystems([id]);
  },

  deleteSystems: (ids) => {
    if (!ids.length) return;
    const idSet = new Set(ids);
    const { world, selectedSystemIds, selectedFleetId, selectedLegionId } =
      get();
    const remainingFleets = world.fleets.filter((f) => !idSet.has(f.systemId));
    const remainingLegions = world.legions.filter(
      (l) => !idSet.has(l.systemId),
    );
    const nextSelected = selectedSystemIds.filter((id) => !idSet.has(id));
    set({
      world: touch({
        ...world,
        systems: world.systems.filter((s) => !idSet.has(s.id)),
        links: world.links.filter(
          (l) => !idSet.has(l.fromId) && !idSet.has(l.toId),
        ),
        fleets: remainingFleets,
        legions: remainingLegions,
        orders: world.orders.filter(
          (o) =>
            (!o.fromSystemId || !idSet.has(o.fromSystemId)) &&
            (!o.toSystemId || !idSet.has(o.toSystemId)),
        ),
        caravans: (world.caravans ?? []).filter(
          (c) => !idSet.has(c.fromSystemId) && !idSet.has(c.toSystemId),
        ),
        quests: (world.quests ?? []).map((q) =>
          q.systemId && idSet.has(q.systemId) ? { ...q, systemId: null } : q,
        ),
      }),
      selectedSystemIds: nextSelected,
      selectedSystemId: nextSelected[nextSelected.length - 1] ?? null,
      selectedFleetId: remainingFleets.some((f) => f.id === selectedFleetId)
        ? selectedFleetId
        : null,
      selectedLegionId: remainingLegions.some((l) => l.id === selectedLegionId)
        ? selectedLegionId
        : null,
    });
  },

  paintFaction: (systemId) => {
    get().paintFactionMany([systemId]);
  },

  paintFactionMany: (systemIds) => {
    const { world, activeFactionId } = get();
    if (!activeFactionId || !systemIds.length) return;
    const idSet = new Set(systemIds);
    set({
      world: touch({
        ...world,
        systems: world.systems.map((s) =>
          idSet.has(s.id)
            ? {
                ...s,
                ownerFactionId: activeFactionId,
                // Drop active faction from co-owners if it becomes primary
                coOwnerFactionIds: (s.coOwnerFactionIds ?? []).filter(
                  (id) => id !== activeFactionId,
                ),
              }
            : s,
        ),
      }),
    });
  },

  paintCoOwnerMany: (systemIds) => {
    const { world, activeFactionId } = get();
    if (!activeFactionId || !systemIds.length) return;
    const idSet = new Set(systemIds);
    set({
      world: touch({
        ...world,
        systems: world.systems.map((s) => {
          if (!idSet.has(s.id)) return s;
          // Can't be co-owner of yourself as primary
          if (s.ownerFactionId === activeFactionId) {
            return {
              ...s,
              coOwnerFactionIds: (s.coOwnerFactionIds ?? []).filter(
                (id) => id !== activeFactionId,
              ),
            };
          }
          const cur = s.coOwnerFactionIds ?? [];
          const has = cur.includes(activeFactionId);
          return {
            ...s,
            coOwnerFactionIds: has
              ? cur.filter((id) => id !== activeFactionId)
              : [...cur, activeFactionId],
          };
        }),
      }),
    });
  },

  toggleContestedMany: (systemIds) => {
    if (!systemIds.length) return;
    const { world } = get();
    const idSet = new Set(systemIds);
    // If any selected is not contested → set all contested; else clear all
    const anyOff = world.systems.some(
      (s) => idSet.has(s.id) && !s.contested,
    );
    set({
      world: touch({
        ...world,
        systems: world.systems.map((s) =>
          idSet.has(s.id) ? { ...s, contested: anyOff } : s,
        ),
      }),
    });
  },

  paintPlanetOwner: (systemId, planetId) => {
    const { world, activeFactionId } = get();
    if (!activeFactionId) return;
    set({
      world: touch({
        ...world,
        systems: world.systems.map((s) => {
          if (s.id !== systemId) return s;
          return {
            ...s,
            planets: s.planets.map((p) => {
              if (p.id !== planetId) return p;
              return {
                ...p,
                ownerFactionId: activeFactionId,
                coOwnerFactionIds: (p.coOwnerFactionIds ?? []).filter(
                  (id) => id !== activeFactionId,
                ),
              };
            }),
          };
        }),
      }),
    });
  },

  paintPlanetCoOwner: (systemId, planetId) => {
    const { world, activeFactionId } = get();
    if (!activeFactionId) return;
    set({
      world: touch({
        ...world,
        systems: world.systems.map((s) => {
          if (s.id !== systemId) return s;
          return {
            ...s,
            planets: s.planets.map((p) => {
              if (p.id !== planetId) return p;
              if (p.ownerFactionId === activeFactionId) {
                return {
                  ...p,
                  coOwnerFactionIds: (p.coOwnerFactionIds ?? []).filter(
                    (id) => id !== activeFactionId,
                  ),
                };
              }
              const cur = p.coOwnerFactionIds ?? [];
              const has = cur.includes(activeFactionId);
              return {
                ...p,
                coOwnerFactionIds: has
                  ? cur.filter((id) => id !== activeFactionId)
                  : [...cur, activeFactionId],
              };
            }),
          };
        }),
      }),
    });
  },

  togglePlanetContested: (systemId, planetId) => {
    const { world } = get();
    set({
      world: touch({
        ...world,
        systems: world.systems.map((s) => {
          if (s.id !== systemId) return s;
          return {
            ...s,
            planets: s.planets.map((p) =>
              p.id === planetId ? { ...p, contested: !p.contested } : p,
            ),
          };
        }),
      }),
    });
  },

  applySystemPoi: (systemId, poi) => {
    get().applySystemPoiMany([systemId], poi);
  },

  applySystemPoiMany: (systemIds, poi) => {
    if (!systemIds.length) return;
    const { world } = get();
    const idSet = new Set(systemIds);
    set({
      world: touch({
        ...world,
        systems: world.systems.map((s) => {
          if (!idSet.has(s.id)) return s;
          if (poi === "none") return withSpaceObjects(s, []);
          return toggleSpaceObject(s, poi);
        }),
      }),
    });
  },

  paintPoiWithActiveTool: (systemId) => {
    const tool = get().tool;
    const poi = POI_PAINT_TOOLS[tool];
    if (poi === undefined) return;
    const ids = get().selectedSystemIds.includes(systemId)
      ? get().selectedSystemIds
      : [systemId];
    get().applySystemPoiMany(ids, poi);
  },

  setActiveResource: (resource) =>
    set({
      activeResource: resource,
      tool: resource ? "paint_resource" : get().tool,
    }),

  paintResourceOnSystem: (systemId) => {
    const { world, activeResource, mapFocus } = get();
    const res =
      activeResource &&
      (RESOURCE_POOL as readonly string[]).includes(activeResource)
        ? activeResource
        : RESOURCE_POOL[Math.floor(Math.random() * RESOURCE_POOL.length)]!;
    set({
      world: touch({
        ...world,
        systems: world.systems.map((s) => {
          if (s.id !== systemId) return s;

          // Nested planet view → paint that planet
          if (
            mapFocus.level === "planet" &&
            mapFocus.systemId === systemId
          ) {
            return {
              ...s,
              planets: s.planets.map((p) => {
                if (p.id !== mapFocus.planetId) return p;
                if ((p.resources ?? []).includes(res)) return p;
                return { ...p, resources: [...(p.resources ?? []), res] };
              }),
            };
          }

          // Inside system dossier (not a specific planet): system-space only
          if (mapFocus.level === "system" && mapFocus.systemId === systemId) {
            if ((s.resources ?? []).includes(res)) return s;
            return { ...s, resources: [...(s.resources ?? []), res] };
          }

          // Galaxy map: randomly system-space vs a random planet
          const planets = s.planets ?? [];
          const roll = Math.random();
          if (planets.length > 0 && roll < 0.55) {
            const idx = Math.floor(Math.random() * planets.length);
            return {
              ...s,
              planets: planets.map((p, i) => {
                if (i !== idx) return p;
                if ((p.resources ?? []).includes(res)) return p;
                return { ...p, resources: [...(p.resources ?? []), res] };
              }),
            };
          }
          if ((s.resources ?? []).includes(res)) return s;
          return { ...s, resources: [...(s.resources ?? []), res] };
        }),
      }),
    });
  },

  paintResourceOnPlanet: (systemId, planetId) => {
    const { world, activeResource } = get();
    const res =
      activeResource &&
      (RESOURCE_POOL as readonly string[]).includes(activeResource)
        ? activeResource
        : RESOURCE_POOL[Math.floor(Math.random() * RESOURCE_POOL.length)]!;
    set({
      world: touch({
        ...world,
        systems: world.systems.map((s) => {
          if (s.id !== systemId) return s;
          return {
            ...s,
            planets: s.planets.map((p) => {
              if (p.id !== planetId) return p;
              if ((p.resources ?? []).includes(res)) return p;
              return { ...p, resources: [...(p.resources ?? []), res] };
            }),
          };
        }),
      }),
    });
  },

  revealSystem: (systemId) => {
    const { world, activeFactionId } = get();
    if (!activeFactionId) return;
    set({
      world: touch({
        ...world,
        systems: world.systems.map((s) => {
          if (s.id !== systemId) return s;
          const setIds = new Set(s.visibleToFactionIds ?? []);
          if (setIds.has(activeFactionId)) setIds.delete(activeFactionId);
          else setIds.add(activeFactionId);
          return { ...s, visibleToFactionIds: [...setIds] };
        }),
      }),
    });
  },

  revealAllVisible: () => {
    const { world, activeFactionId } = get();
    if (!activeFactionId) return;
    set({
      world: touch({
        ...world,
        systems: world.systems.map((s) => {
          const setIds = new Set(s.visibleToFactionIds ?? []);
          setIds.add(activeFactionId);
          return { ...s, visibleToFactionIds: [...setIds] };
        }),
      }),
    });
  },

  clearFactionReveals: () => {
    const { world, activeFactionId } = get();
    if (!activeFactionId) return;
    set({
      world: touch({
        ...world,
        systems: world.systems.map((s) => ({
          ...s,
          visibleToFactionIds: (s.visibleToFactionIds ?? []).filter(
            (id) => id !== activeFactionId,
          ),
        })),
      }),
    });
  },

  applyBrushStroke: (stroke) => {
    const { world, brush } = get();
    const { systems, links } = generateAlongBrush(
      stroke,
      world.systems,
      brush,
      world.systems.length + 1,
    );
    if (systems.length === 0) return;
    const stamped = systems.map((s) => ({
      ...s,
      visibleToFactionIds: withFullMapVision(
        world,
        s.visibleToFactionIds ?? [],
      ),
    }));
    set({
      world: touch({
        ...world,
        systems: [...world.systems, ...stamped],
        links: [...world.links, ...links],
      }),
    });
  },

  updateSelectedSystem: (patch) => {
    const { world, selectedSystemId } = get();
    if (!selectedSystemId) return;
    set({
      world: touch({
        ...world,
        systems: world.systems.map((s) =>
          s.id === selectedSystemId ? { ...s, ...patch, id: s.id } : s,
        ),
      }),
      _coalesce: `sys:${selectedSystemId}`,
    } as HistoryPatch);
  },

  updatePlanet: (planetId, patch) => {
    const { world, selectedSystemId, dossierSystemId } = get();
    const sysId = selectedSystemId ?? dossierSystemId;
    if (!sysId) return;
    set({
      world: touch({
        ...world,
        systems: world.systems.map((s) => {
          if (s.id !== sysId) return s;
          return {
            ...s,
            planets: s.planets.map((p) =>
              p.id === planetId ? { ...p, ...patch, id: p.id } : p,
            ),
          };
        }),
      }),
      _coalesce: `planet:${planetId}`,
    } as HistoryPatch);
  },

  addPlanet: () => {
    const { world, selectedSystemId } = get();
    if (!selectedSystemId) return;
    const sys = world.systems.find((s) => s.id === selectedSystemId);
    const nextOrbit =
      (sys?.planets.reduce((m, p) => Math.max(m, p.orbitIndex ?? 0), 0) ?? 0) +
      1;
    const planet: Planet = {
      id: uuid(),
      name: `Планета ${String.fromCharCode(64 + Math.min(nextOrbit, 26))}`,
      type: "rocky",
      climate: "temperate",
      population: 0,
      raceComposition: [],
      resources: [],
      orbitIndex: nextOrbit,
      size: 1,
      habitable: true,
      colonizable: true,
      surveyed: true,
      colonyType: "none",
      surfaceSlots: 8,
      orbitalSlots: 4,
      surfaceBuildings: [],
      orbitalBuildings: [],
    };
    set({
      world: touch({
        ...world,
        systems: world.systems.map((s) =>
          s.id === selectedSystemId
            ? { ...s, planets: [...s.planets, planet] }
            : s,
        ),
      }),
      mapFocus: {
        level: "planet",
        systemId: selectedSystemId,
        planetId: planet.id,
      },
    });
  },

  removePlanet: (planetId) => {
    const { world, selectedSystemId } = get();
    if (!selectedSystemId) return;
    set({
      world: touch({
        ...world,
        systems: world.systems.map((s) =>
          s.id === selectedSystemId
            ? { ...s, planets: s.planets.filter((p) => p.id !== planetId) }
            : s,
        ),
      }),
    });
  },

  addFaction: (faction) => {
    const { world } = get();
    const id = faction.id ?? uuid();
    set({
      world: touch({
        ...world,
        factions: [
          ...world.factions,
          { kind: "state", ...faction, id },
        ],
      }),
      activeFactionId: id,
    });
  },

  updateFaction: (id, patch) => {
    const { world } = get();
    const nextPatch =
      patch.neutralReputation !== undefined
        ? { ...patch, neutralReputation: clampRep(patch.neutralReputation) }
        : patch;
    set({
      world: touch({
        ...world,
        factions: world.factions.map((f) =>
          f.id === id ? { ...f, ...nextPatch, id: f.id } : f,
        ),
      }),
      _coalesce: `faction:${id}`,
    } as HistoryPatch);
  },

  removeFaction: (id) => {
    const {
      world,
      activeFactionId,
      dossierFactionId,
      pendingCapitalFactionId,
    } = get();
    if (world.factions.length <= 1) return;
    const factions = world.factions.filter((f) => f.id !== id);
    const nextActive =
      activeFactionId === id
        ? (factions[0]?.id ?? null)
        : activeFactionId;
    set({
      world: touch({
        ...world,
        factions,
        systems: world.systems.map((s) => ({
          ...s,
          ownerFactionId:
            s.ownerFactionId === id ? null : s.ownerFactionId,
          isCapital:
            s.ownerFactionId === id ? false : (s.isCapital ?? false),
          visibleToFactionIds: (s.visibleToFactionIds ?? []).filter(
            (fid) => fid !== id,
          ),
        })),
        diplomacy: (world.diplomacy ?? []).filter(
          (d) => d.aId !== id && d.bId !== id,
        ),
        fleets: world.fleets.filter((f) => f.factionId !== id),
        legions: world.legions.filter((l) => l.factionId !== id),
        orders: world.orders.filter((o) => o.factionId !== id),
      }),
      activeFactionId: nextActive,
      dossierFactionId:
        dossierFactionId === id ? (nextActive ?? null) : dossierFactionId,
      pendingCapitalFactionId:
        pendingCapitalFactionId === id ? null : pendingCapitalFactionId,
    });
  },

  setFactionCapital: (factionId, systemId) => {
    const { world } = get();
    set({
      world: touch({
        ...world,
        systems: world.systems.map((s) => {
          if (s.id === systemId) {
            return {
              ...s,
              ownerFactionId: factionId,
              isCapital: true,
            };
          }
          if (s.ownerFactionId === factionId && s.isCapital) {
            return { ...s, isCapital: false };
          }
          return s;
        }),
      }),
      activeFactionId: factionId,
      pendingCapitalFactionId: null,
      selectedSystemId: systemId,
      selectedSystemIds: systemId ? [systemId] : [],
    });
  },

  clearFactionOwnership: (factionId) => {
    const { world } = get();
    set({
      world: touch({
        ...world,
        systems: world.systems.map((s) =>
          s.ownerFactionId === factionId
            ? { ...s, ownerFactionId: null, isCapital: false }
            : s,
        ),
      }),
    });
  },

  placeFleetOnSystem: (systemId) => {
    const { world, activeFactionId } = get();
    if (!activeFactionId) return;
    const fleet: Fleet = {
      id: uuid(),
      name: `Флот ${world.fleets.filter((f) => f.factionId === activeFactionId).length + 1}`,
      factionId: activeFactionId,
      systemId,
      kind: "combat",
      composition: [
        { type: "фрегат", count: 3 },
        { type: "крейсер", count: 1 },
      ],
      stance: "idle" as FleetStance,
      route: [],
    };
    set({
      world: touch({
        ...world,
        fleets: [...world.fleets, fleet],
        systems: world.systems.map((s) => {
          if (s.id !== systemId) return s;
          const vis = new Set(s.visibleToFactionIds ?? []);
          vis.add(activeFactionId);
          const activity =
            s.activity === "none" || s.activity === "garrison"
              ? "garrison"
              : s.activity;
          return { ...s, visibleToFactionIds: [...vis], activity };
        }),
      }),
      selectedFleetId: fleet.id,
      selectedSystemId: systemId,
      selectedSystemIds: systemId ? [systemId] : [],
    });
  },

  updateFleet: (id, patch) => {
    const { world } = get();
    set({
      world: touch({
        ...world,
        fleets: world.fleets.map((f) =>
          f.id === id ? { ...f, ...patch, id: f.id } : f,
        ),
      }),
      _coalesce: `fleet:${id}`,
    } as HistoryPatch);
  },

  relocateFleet: (fleetId, systemId) => {
    const { world } = get();
    const fleet = world.fleets.find((f) => f.id === fleetId);
    if (!fleet || fleet.systemId === systemId) {
      set({ selectedFleetId: fleetId, selectedSystemId: systemId, selectedSystemIds: systemId ? [systemId] : [] });
      return;
    }
    set({
      world: touch({
        ...world,
        fleets: world.fleets.map((f) =>
          f.id === fleetId
            ? { ...f, systemId, route: [], stance: "move" as const }
            : f,
        ),
      }),
      selectedFleetId: fleetId,
      selectedSystemId: systemId,
      selectedSystemIds: systemId ? [systemId] : [],
      selectedLegionId: null,
      selectedLinkId: null,
    });
  },

  deleteFleet: (id) => {
    const { world, selectedFleetId } = get();
    set({
      world: touch({
        ...world,
        fleets: world.fleets.filter((f) => f.id !== id),
        orders: world.orders.filter((o) => o.fleetId !== id),
      }),
      selectedFleetId: selectedFleetId === id ? null : selectedFleetId,
    });
  },

  setFleetRouteHop: (fleetId, systemId) => {
    const { world } = get();
    set({
      world: touch({
        ...world,
        fleets: world.fleets.map((f) => {
          if (f.id !== fleetId) return f;
          const route = [...f.route];
          if (route[route.length - 1] === systemId) return f;
          route.push(systemId);
          return { ...f, route, stance: "move" as FleetStance };
        }),
      }),
    });
  },

  setLegionRouteHop: (legionId, systemId) => {
    const { world } = get();
    set({
      world: touch({
        ...world,
        legions: world.legions.map((l) => {
          if (l.id !== legionId) return l;
          const route = [...(l.route ?? [])];
          if (route[route.length - 1] === systemId) return l;
          route.push(systemId);
          return { ...l, route, status: "move" as const };
        }),
      }),
    });
  },

  placeLegionOnSystem: (systemId) => {
    const { world, activeFactionId } = get();
    if (!activeFactionId) return;
    const legion: Legion = {
      id: uuid(),
      name: `Легион ${world.legions.filter((l) => l.factionId === activeFactionId).length + 1}`,
      factionId: activeFactionId,
      systemId,
      strength: 5000,
      status: "garrison",
      route: [],
    };
    set({
      world: touch({
        ...world,
        legions: [...world.legions, legion],
        systems: world.systems.map((s) => {
          if (s.id !== systemId) return s;
          const vis = new Set(s.visibleToFactionIds ?? []);
          vis.add(activeFactionId);
          return {
            ...s,
            visibleToFactionIds: [...vis],
            activity: s.activity === "none" ? "garrison" : s.activity,
          };
        }),
      }),
      selectedLegionId: legion.id,
      selectedSystemId: systemId,
      selectedSystemIds: systemId ? [systemId] : [],
    });
  },

  updateLegion: (id, patch) => {
    const { world } = get();
    set({
      world: touch({
        ...world,
        legions: world.legions.map((l) =>
          l.id === id ? { ...l, ...patch, id: l.id } : l,
        ),
      }),
      _coalesce: `legion:${id}`,
    } as HistoryPatch);
  },

  relocateLegion: (legionId, systemId) => {
    const { world } = get();
    const legion = world.legions.find((l) => l.id === legionId);
    if (!legion || legion.systemId === systemId) {
      set({ selectedLegionId: legionId, selectedSystemId: systemId, selectedSystemIds: systemId ? [systemId] : [] });
      return;
    }
    set({
      world: touch({
        ...world,
        legions: world.legions.map((l) =>
          l.id === legionId ? { ...l, systemId } : l,
        ),
      }),
      selectedLegionId: legionId,
      selectedSystemId: systemId,
      selectedSystemIds: systemId ? [systemId] : [],
      selectedFleetId: null,
      selectedLinkId: null,
    });
  },

  deleteLegion: (id) => {
    const { world, selectedLegionId } = get();
    set({
      world: touch({
        ...world,
        legions: world.legions.filter((l) => l.id !== id),
        orders: world.orders.filter((o) => o.legionId !== id),
      }),
      selectedLegionId: selectedLegionId === id ? null : selectedLegionId,
    });
  },

  addOrToggleLink: (fromId, toId) => {
    if (fromId === toId) return;
    const { world } = get();
    const existing = world.links.find(
      (l) =>
        (l.fromId === fromId && l.toId === toId) ||
        (l.fromId === toId && l.toId === fromId),
    );
    if (existing) {
      set({
        world: touch({
          ...world,
          links: world.links.filter((l) => l.id !== existing.id),
        }),
        selectedLinkId: null,
        linkDraftFromId: null,
      });
      return;
    }
    const link = {
      id: uuid(),
      fromId,
      toId,
      type: "corridor" as const,
    };
    set({
      world: touch({
        ...world,
        links: [...world.links, link],
      }),
      selectedLinkId: link.id,
      linkDraftFromId: null,
    });
  },

  updateLink: (id, patch) => {
    const { world } = get();
    set({
      world: touch({
        ...world,
        links: world.links.map((l) =>
          l.id === id ? { ...l, ...patch, id: l.id } : l,
        ),
      }),
      _coalesce: `link:${id}`,
    } as HistoryPatch);
  },

  deleteLink: (id) => {
    const { world, selectedLinkId } = get();
    set({
      world: touch({
        ...world,
        links: world.links.filter((l) => l.id !== id),
      }),
      selectedLinkId: selectedLinkId === id ? null : selectedLinkId,
    });
  },

  setDiplomacy: (aId, bId, relation) => {
    if (aId === bId) return;
    const { world } = get();
    const [x, y] = aId < bId ? [aId, bId] : [bId, aId];
    const existing = world.diplomacy.find((d) => d.aId === x && d.bId === y);
    let diplomacy = world.diplomacy;
    if (existing) {
      diplomacy = diplomacy.map((d) =>
        d.id === existing.id ? { ...d, relation } : d,
      );
    } else {
      diplomacy = [
        ...diplomacy,
        { id: uuid(), aId: x, bId: y, relation },
      ];
    }
    const turn = world.meta?.turn ?? 0;
    const factions = (world.factions ?? []).map((fac) => {
      if (fac.id !== aId && fac.id !== bId) return fac;
      const otherId = fac.id === aId ? bId : aId;
      const prev = fac.diplomacy ?? {
        opinions: {},
        treaties: [],
        history: [],
      };
      const treaties = (prev.treaties ?? []).filter(
        (t) => t.withFactionId !== otherId,
      );
      if (relation !== "neutral") {
        treaties.push({
          id: `treaty_${fac.id}_${otherId}_${relation}`,
          type: relation,
          withFactionId: otherId,
          startedTurn: turn,
          expiresTurn: null,
          effects: [],
        });
      }
      const history = [
        ...(prev.history ?? []),
        {
          turn,
          type: "relation",
          withFactionId: otherId,
          label: `Отношения: ${relation}`,
        },
      ].slice(-40);
      return {
        ...fac,
        diplomacy: { ...prev, treaties, history },
      };
    });
    set({
      world: touch({ ...world, diplomacy, factions }),
      _coalesce: `diplo:${x}:${y}`,
    } as HistoryPatch);
  },

  addOrder: (order) => {
    const { world } = get();
    const full: PlayerOrder = {
      ...order,
      id: uuid(),
      turn: world.meta.turn,
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    set({
      world: touch({
        ...world,
        orders: [...world.orders, full],
      }),
    });
  },

  setOrderStatus: (id, status) => {
    const { world } = get();
    set({
      world: touch({
        ...world,
        orders: world.orders.map((o) => (o.id === id ? { ...o, status } : o)),
      }),
    });
  },

  clearOrders: (factionId) => {
    const { world } = get();
    set({
      world: touch({
        ...world,
        orders: factionId
          ? world.orders.filter((o) => o.factionId !== factionId)
          : [],
      }),
    });
  },

  pushSectorDraftPoint: (x, y) => {
    set((s) => ({
      sectorDraftPoints: [...s.sectorDraftPoints, x, y],
    }));
  },

  undoSectorDraftPoint: () => {
    set((s) => ({
      sectorDraftPoints: s.sectorDraftPoints.slice(0, -2),
    }));
  },

  clearSectorDraft: () => set({ sectorDraftPoints: [] }),

  finishSectorDraft: () => {
    const { world, sectorDraftPoints } = get();
    if (sectorDraftPoints.length < 6) return;
    const id = uuid();
    const sector: Sector = {
      id,
      name: `Сектор ${world.sectors.length + 1}`,
      polygon: [...sectorDraftPoints],
      color: `#${Math.floor(Math.random() * 0xffffff)
        .toString(16)
        .padStart(6, "0")}`,
    };
    set({
      world: touch({
        ...world,
        sectors: [...world.sectors, sector],
        systems: assignSystemsToSector(world.systems, id, sector.polygon),
      }),
      selectedSectorId: id,
      sectorDraftPoints: [],
      tool: "select",
    });
  },

  updateSector: (id, patch) => {
    const { world } = get();
    set({
      world: touch({
        ...world,
        sectors: world.sectors.map((s) =>
          s.id === id ? { ...s, ...patch, id: s.id } : s,
        ),
      }),
      _coalesce: `sector:${id}`,
    } as HistoryPatch);
  },

  deleteSector: (id) => {
    const { world, selectedSectorId } = get();
    set({
      world: touch({
        ...world,
        sectors: world.sectors.filter((s) => s.id !== id),
        systems: world.systems.map((s) =>
          s.sectorId === id ? { ...s, sectorId: null } : s,
        ),
      }),
      selectedSectorId: selectedSectorId === id ? null : selectedSectorId,
    });
  },

  reassignSectorSystems: (sectorId) => {
    const { world } = get();
    const sector = world.sectors.find((s) => s.id === sectorId);
    if (!sector) return;
    set({
      world: touch({
        ...world,
        systems: assignSystemsToSector(
          world.systems,
          sectorId,
          sector.polygon,
        ),
      }),
    });
  },

  advanceTurn: (label) => {
    const { world } = get();
    const snap = snapshotFromWorld(
      world,
      label?.trim() || `Конец хода ${world.meta.turn}`,
    );
    set({
      world: touch({
        ...world,
        meta: {
          ...world.meta,
          turn: world.meta.turn + 1,
        },
        turnHistory: [...(world.turnHistory ?? []), snap],
        orders: world.orders.filter((o) => o.status === "pending"),
        systems: driftAnomalies(world.systems),
        caravans: advanceCaravans(world.caravans ?? []),
      }),
    });
  },

  restoreTurnSnapshot: (index) => {
    const { world } = get();
    const snap = world.turnHistory[index];
    if (!snap) return;
    set({
      world: touch({
        ...world,
        meta: { ...world.meta, turn: snap.turn },
        systems: structuredClone(snap.systems),
        links: structuredClone(snap.links),
        sectors: structuredClone(snap.sectors),
        factions: structuredClone(snap.factions),
        races: structuredClone(snap.races),
        fleets: structuredClone(snap.fleets),
        legions: structuredClone(snap.legions),
        diplomacy: structuredClone(snap.diplomacy),
        orders: structuredClone(snap.orders),
        caravans: structuredClone(snap.caravans ?? []),
        quests: structuredClone(snap.quests ?? []),
        turnHistory: world.turnHistory.slice(0, index),
      }),
      selectedSystemId: null,
      selectedSystemIds: [],
      selectedFleetId: null,
      selectedLegionId: null,
      selectedLinkId: null,
      selectedSectorId: null,
    });
  },

  publishCampaign: async (masterToken = "master2142") => {
    set({ publishStatus: "Публикация…" });
    try {
      const res = await fetch("/api/publish", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Master-Token": masterToken,
        },
        body: JSON.stringify(get().world),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || res.statusText);
      }
      const data = (await res.json()) as { ok: boolean; turn: number };
      set({
        publishStatus: `Опубликовано (ход ${data.turn}). Игроки: /view`,
      });
    } catch (err) {
      set({
        publishStatus: `Ошибка публикации: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  },
  };
});
