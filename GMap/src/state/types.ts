/** Domain model for GMap campaign data. Keep serializable and AI-friendly. */

export type StarClass = "O" | "B" | "A" | "F" | "G" | "K" | "M";

export type PlanetType =
  | "rocky"
  | "gas"
  | "ice"
  | "desert"
  | "ocean"
  | "toxic"
  | "artifact";

export type Climate =
  | "frozen"
  | "cold"
  | "temperate"
  | "hot"
  | "infernal"
  | "tidal_locked";

/**
 * corridor / gate / unstable — обычные гиперсвязи.
 * damyl_space — Дамильские космические врата (флот; система↔система или узел вне систем).
 * damyl_planet — Дамильские межпланетные врата (только пехота/легионы; планета↔планета).
 */
export type LinkType =
  | "corridor"
  | "gate"
  | "unstable"
  | "damyl_space"
  | "damyl_planet";

/** stellar = обычная звёздная система; corridor = узел без звезды (врата/коридор). */
export type SystemKind = "stellar" | "corridor";

/** Points of interest — drawn with distinct glyphs on the map. */
export type SystemPoiType =
  | "none"
  | "anomaly"
  | "asteroid"
  | "nebula"
  | "debris"
  | "pirate"
  | "hub"
  | "ruin"
  | "dead_zone"
  | "quest"
  | "minefield"
  | "relay"
  | "storm"
  | "wormhole"
  | "black_hole"
  | "comet"
  | "pulsar"
  | "shipyard"
  | "outpost"
  | "fortress"
  | "beacon"
  | "sanctuary";

/** All stampable space objects (can stack on one system). */
export const SPACE_OBJECT_TYPES: SystemPoiType[] = [
  "anomaly",
  "asteroid",
  "nebula",
  "debris",
  "pirate",
  "hub",
  "ruin",
  "dead_zone",
  "minefield",
  "relay",
  "storm",
  "wormhole",
  "black_hole",
  "comet",
  "pulsar",
  "shipyard",
  "outpost",
  "fortress",
  "beacon",
  "sanctuary",
];

export type QuestStatus = "active" | "done" | "hidden";

/** Master / player quest pin on the galaxy map. */
export interface Quest {
  id: string;
  name: string;
  summary: string;
  detail?: string;
  /** Anchor system (map icon). */
  systemId: string | null;
  status: QuestStatus;
}

/** Civilian / trade caravan moving along a lane. */
export interface Caravan {
  id: string;
  name: string;
  fromSystemId: string;
  toSystemId: string;
  /** 0..1 along from→to. */
  progress: number;
  /** Owning faction or null = neutral traffic. */
  factionId: string | null;
}

/** Dynamic anomaly motion (world units per turn). */
export interface AnomalyMotion {
  /** Moves with the system node each turn if set. */
  driftDx: number;
  driftDy: number;
  /** Scanner / jump hazard radius in world units. */
  radius?: number;
  note?: string;
}

/** What is currently happening in the system (display + RP). */
export type SystemActivity =
  | "none"
  | "battle"
  | "trade"
  | "repair"
  | "garrison"
  | "transit";

export type EditorTool =
  | "select"
  | "brush"
  | "paint_faction"
  | "paint_coowner"
  | "mark_contested"
  | "reveal"
  | "add_system"
  | "add_corridor"
  | "add_link"
  | "draw_sector"
  | "place_fleet"
  | "place_legion"
  | "mark_anomaly"
  | "mark_asteroid"
  | "mark_nebula"
  | "mark_debris"
  | "mark_pirate"
  | "mark_hub"
  | "mark_ruin"
  | "mark_dead_zone"
  | "mark_minefield"
  | "mark_relay"
  | "mark_storm"
  | "mark_wormhole"
  | "mark_black_hole"
  | "mark_comet"
  | "mark_pulsar"
  | "mark_shipyard"
  | "mark_outpost"
  | "mark_fortress"
  | "mark_beacon"
  | "mark_sanctuary"
  | "clear_poi"
  | "paint_resource"
  | "delete";

/** Tools that stamp a POI / space object onto a system. */
export const POI_PAINT_TOOLS: Partial<Record<EditorTool, SystemPoiType>> = {
  mark_anomaly: "anomaly",
  mark_asteroid: "asteroid",
  mark_nebula: "nebula",
  mark_debris: "debris",
  mark_pirate: "pirate",
  mark_hub: "hub",
  mark_ruin: "ruin",
  mark_dead_zone: "dead_zone",
  mark_minefield: "minefield",
  mark_relay: "relay",
  mark_storm: "storm",
  mark_wormhole: "wormhole",
  mark_black_hole: "black_hole",
  mark_comet: "comet",
  mark_pulsar: "pulsar",
  mark_shipyard: "shipyard",
  mark_outpost: "outpost",
  mark_fortress: "fortress",
  mark_beacon: "beacon",
  mark_sanctuary: "sanctuary",
  clear_poi: "none",
};

export type FleetStance =
  | "idle"
  | "attack"
  | "defend"
  | "move"
  | "repair"
  | "blockade"
  | "fortify";

export type FleetKind =
  | "combat"
  | "trade"
  | "patrol"
  | "transport"
  | "carrier"
  | "support";

export type LegionStatus =
  | "idle"
  | "garrison"
  | "assault"
  | "recovering"
  | "move"
  | "blockade"
  | "fortify";

/** RMB → click system: assign route + intent for fleet/legion. */
export type UnitOrderIntent =
  | "move"
  | "attack"
  | "fortify"
  | "blockade"
  | "defend"
  | "repair";

export interface PendingUnitOrder {
  unitKind: "fleet" | "legion";
  unitId: string;
  intent: UnitOrderIntent;
}

export type DiplomacyRelation =
  | "neutral"
  | "alliance"
  | "trade"
  | "war"
  | "vassal"
  | "truce";

export type OrderType =
  | "move_fleet"
  | "claim_system"
  | "attack_system"
  | "move_legion";

export type OrderStatus = "pending" | "accepted" | "rejected";

export type StationKind =
  | "science"
  | "mining"
  | "military"
  | "trade"
  | "relay";

export interface StarBody {
  class: StarClass;
  luminosity: number;
}

export interface RaceShare {
  raceId: string;
  percent: number;
}

/** Colony posture on a world (RP / ARTEM-style). */
export type ColonyType =
  | "none"
  | "outpost"
  | "colony"
  | "core"
  | "fortress"
  | "mining"
  | "research";

/** Surface / orbital construction on a planet (schematic + RP). */
export type PlanetBuildingKind =
  | "residential"
  | "farm"
  | "mine"
  | "factory"
  | "lab"
  | "barracks"
  | "capitol"
  | "defense"
  | "spaceport"
  | "shipyard"
  | "habitat"
  | "custom";

export type PlanetBuildingZone = "surface" | "orbital";

export interface PlanetBuilding {
  id: string;
  name: string;
  kind: PlanetBuildingKind;
  zone: PlanetBuildingZone;
  disabled?: boolean;
}

export interface Planet {
  id: string;
  name: string;
  type: PlanetType;
  climate: Climate;
  population: number;
  raceComposition: RaceShare[];
  resources: string[];
  /** Orbital order from the star (1 = closest). Schematic only — not galaxy coords. */
  orbitIndex?: number;
  /** Relative body size for schematic (0.5–2). */
  size?: number;
  habitable?: boolean;
  colonizable?: boolean;
  surveyed?: boolean;
  colonyType?: ColonyType;
  /** Surface note / lore blurb. */
  notes?: string;
  /** Max orbital construction slots. */
  orbitalSlots?: number;
  /** Max surface districts / buildings. */
  surfaceSlots?: number;
  surfaceBuildings?: PlanetBuilding[];
  orbitalBuildings?: PlanetBuilding[];
  /** Primary controlling polity (may differ from system owner). */
  ownerFactionId?: string | null;
  /** Extra claimants / condominium on this world. */
  coOwnerFactionIds?: string[];
  /** Disputed claim — contested planet. */
  contested?: boolean;
}

/** Drill-down focus: galaxy map stays at GMap x/y; system/planet are nested views. */
export type MapFocus =
  | { level: "galaxy" }
  | { level: "system"; systemId: string }
  | { level: "planet"; systemId: string; planetId: string };

/** Orbital / in-system construction (stations, outposts). */
export interface OrbitalStation {
  id: string;
  name: string;
  kind: StationKind;
  factionId: string | null;
}

export interface StarSystem {
  id: string;
  name: string;
  x: number;
  y: number;
  kind: SystemKind;
  stars: StarBody[];
  planets: Planet[];
  stations: OrbitalStation[];
  resources: string[];
  ownerFactionId: string | null;
  sectorId: string | null;
  locked: boolean;
  /** Capital / core world — drawn as a star on the map. */
  isCapital?: boolean;
  /**
   * Primary legacy marker. Prefer `spaceObjects` (multi).
   * Kept for older saves; synced on normalize.
   */
  poiType?: SystemPoiType;
  /**
   * Several space objects can share one system (anomaly + pirates + asteroids…).
   */
  spaceObjects?: SystemPoiType[];
  visibleToFactionIds: string[];
  /** Current situation in-system. */
  activity: SystemActivity;
  /** For activity=trade — other system id (optional). */
  tradeWithSystemId: string | null;
  /** Freeform notes for the master. */
  notes?: string;
  /** Мёртвая зона сканеров — сильные помехи / «белый шум». */
  scannerDeadZone?: boolean;
  /** Блокада системы (орбита перекрыта). */
  blockaded?: boolean;
  /**
   * Кондоминиум: доп. совладельцы вместе с ownerFactionId.
   * На карте — двойная обводка / два цвета.
   */
  coOwnerFactionIds?: string[];
  /**
   * Спорная система (претензии), даже без формального совладельца.
   * На карте — пунктирное кольцо.
   */
  contested?: boolean;
  /** Динамическая аномалия (дрейф каждый ход). */
  anomalyMotion?: AnomalyMotion | null;
  /** Якорь квеста (дублирует quest.systemId для быстрого глифа). */
  questId?: string | null;
  /** Усиленный гражданский хаб (нити трафика). */
  trafficHub?: boolean;
}

export interface SystemLink {
  id: string;
  fromId: string;
  toId: string;
  type: LinkType;
  /** For damyl_planet — planet in from-system. */
  fromPlanetId?: string | null;
  /** For damyl_planet — planet in to-system. */
  toPlanetId?: string | null;
}

/** Geographic region. `polygon` is flat world coords [x0,y0,x1,y1,…]. */
export interface Sector {
  id: string;
  name: string;
  polygon: number[];
  color?: string;
}

export interface Faction {
  id: string;
  name: string;
  /** Primary / legacy colour (also default for unset style slots). */
  color: string;
  /**
   * Цвет границы территории государства на карте.
   * Если не задан — используется `color`.
   */
  borderColor?: string;
  /**
   * Цвет заливки / «пространства» внутри границ.
   * Если не задан — используется `color`.
   */
  fillColor?: string;
  /**
   * Цвет системных маркеров / ауры владения.
   * Если не задан — используется `color`.
   */
  systemColor?: string;
  /** Цвет подписи названия государства на карте. */
  nameColor?: string;
  /**
   * CSS font-family для подписи государства
   * (например `"Cinzel, Times New Roman, serif"`).
   */
  nameFont?: string;
  password: string;
  /**
   * state — суверенное государство (территория + обводка на карте).
   * faction — не-государство: пираты, рой, ОР, вольные флоты (без государственной обводки).
   */
  kind?: PolityKind;
  /** Optional data-URL or relative asset path for heraldry. */
  emblemPath?: string;
  /**
   * Sees the entire map (no fog). Belator by default.
   * New systems are auto-revealed to such factions.
   */
  fullMapVision?: boolean;
  /**
   * Репутация у нейтралов / вольницы / пиратов (−100…+100).
   * Влияет на RP и отображается в досье державы.
   */
  neutralReputation?: number;
}

export type PolityKind = "state" | "faction";

/** Archived campaign state at end of a turn (no nested history). */
export interface TurnSnapshot {
  turn: number;
  savedAt: string;
  label: string;
  systems: StarSystem[];
  links: SystemLink[];
  sectors: Sector[];
  factions: Faction[];
  races: Race[];
  fleets: Fleet[];
  legions: Legion[];
  diplomacy: DiplomacyEdge[];
  orders: PlayerOrder[];
  caravans?: Caravan[];
  quests?: Quest[];
}

export interface Race {
  id: string;
  name: string;
}

export interface ShipGroup {
  type: string;
  count: number;
}

export interface Fleet {
  id: string;
  name: string;
  factionId: string;
  systemId: string;
  kind: FleetKind;
  composition: ShipGroup[];
  stance: FleetStance;
  route: string[];
}

/** Ground force / legion attached to a system. */
export interface Legion {
  id: string;
  name: string;
  factionId: string;
  systemId: string;
  strength: number;
  status: LegionStatus;
  /** Planned hops (system ids), same as fleets. */
  route?: string[];
}

/** Directed or undirected pair — stored with sorted ids for uniqueness. */
export interface DiplomacyEdge {
  id: string;
  aId: string;
  bId: string;
  relation: DiplomacyRelation;
}

export interface PlayerOrder {
  id: string;
  factionId: string;
  type: OrderType;
  turn: number;
  status: OrderStatus;
  fleetId?: string;
  legionId?: string;
  fromSystemId?: string;
  toSystemId?: string;
  note?: string;
  createdAt: string;
}

export interface CampaignMeta {
  schemaVersion: number;
  name: string;
  turn: number;
  createdAt: string;
  updatedAt: string;
  width: number;
  height: number;
}

export interface WorldState {
  meta: CampaignMeta;
  systems: StarSystem[];
  links: SystemLink[];
  sectors: Sector[];
  factions: Faction[];
  races: Race[];
  fleets: Fleet[];
  legions: Legion[];
  diplomacy: DiplomacyEdge[];
  orders: PlayerOrder[];
  turnHistory: TurnSnapshot[];
  caravans: Caravan[];
  quests: Quest[];
}

export interface BrushSettings {
  density: number;
  minDistance: number;
  linkDistance: number;
  resourceChance: number;
  corridorChance: number;
}

export type SystemSelectMode = "replace" | "add" | "toggle";

export interface UiState {
  tool: EditorTool;
  selectedSystemId: string | null;
  /** Multi-select set (includes selectedSystemId when set). */
  selectedSystemIds: string[];
  selectedFleetId: string | null;
  selectedLegionId: string | null;
  selectedLinkId: string | null;
  selectedSectorId: string | null;
  linkDraftFromId: string | null;
  /** In-progress sector polygon vertices (world x,y pairs flattened). */
  sectorDraftPoints: number[];
  activeFactionId: string | null;
  brush: BrushSettings;
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
  /** Dim systems the active faction cannot see (fog preview). */
  showFogPreview: boolean;
  showJumpRange: boolean;
  showSupply: boolean;
  showCaravans: boolean;
  showBlockades: boolean;
  showDeadZones: boolean;
  showTraffic: boolean;
  showQuests: boolean;
  /** Open quest dossier id. */
  openQuestId: string | null;
  diplomacyPanelOpen: boolean;
  /** Right-click radial / context menu target. */
  contextMenu: ContextMenuState | null;
  /** After RMB order pick — next system click applies route + stance. */
  pendingUnitOrder: PendingUnitOrder | null;
  /** After «Клонировать флот» — next system click places a copy. */
  pendingFleetCloneId: string | null;
  /** Active resource id for paint_resource tool (from RESOURCE_POOL). */
  activeResource: string | null;
  dossierSystemId: string | null;
  /** Polity / faction dossier open for this faction id. */
  dossierFactionId: string | null;
  /** Next system click assigns capital for this faction. */
  pendingCapitalFactionId: string | null;
  /** One-shot camera pan request (consumed by MapCanvas). */
  cameraFocusSystemId: string | null;
  /** Nested view: galaxy (default) → system schematic → planet card. */
  mapFocus: MapFocus;
}

export interface ContextMenuState {
  screenX: number;
  screenY: number;
  worldX: number;
  worldY: number;
  systemId: string | null;
  fleetId: string | null;
  legionId: string | null;
  linkId: string | null;
}

export interface ViewerPayload {
  world: WorldState;
  factionId: string;
  visibleSystemIds: string[];
  /** From published map — used for live refresh polling. */
  updatedAt?: string | null;
}
