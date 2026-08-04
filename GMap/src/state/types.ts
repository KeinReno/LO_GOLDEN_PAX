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
  | "sanctuary"
  | "refugees"
  | "quarantine"
  | "depot"
  | "propaganda"
  | "frontline"
  | "forge"
  | "mining_platform"
  | "abandoned_station"
  | "science_arch"
  | "agronomy"
  | "biocupola"
  | "hydro_lab"
  | "security_post"
  | "grav_field";

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
  "refugees",
  "quarantine",
  "depot",
  "propaganda",
  "frontline",
  "forge",
  "mining_platform",
  "abandoned_station",
  "science_arch",
  "agronomy",
  "biocupola",
  "hydro_lab",
  "security_post",
  "grav_field",
];

export type QuestStatus = "active" | "done" | "hidden" | "expired";

export type QuestType = "main" | "side" | "faction" | "foreign" | "yearly";

/** Dice roll requested by a quest / choice (resolved server-side). */
export interface DiceSpec {
  count: number;
  sides: number;
  label: string;
  threshold?: number;
}

export interface QuestChoice {
  id: string;
  label: string;
  description?: string;
  effects?: EffectInstance[];
  nextStageId?: string;
  diceRequired?: DiceSpec[];
  onSuccess?: EffectInstance[];
  onFail?: EffectInstance[];
}

export interface QuestStage {
  id: string;
  label: string;
  summary?: string;
  choices?: QuestChoice[];
  diceRequired?: DiceSpec[];
}

export interface QuestHistoryEntry {
  at: string;
  turn: number;
  kind: "message" | "choice" | "dice" | "stage_change" | "reward";
  body: string;
  authorName?: string;
  outcome?: string;
}

/** Master / player quest pin on the galaxy map. */
export interface Quest {
  id: string;
  name: string;
  summary: string;
  detail?: string;
  /** Anchor system (map icon). */
  systemId: string | null;
  status: QuestStatus;
  /** Quest lane (A9). Defaults to "side" for legacy saves. */
  type?: QuestType;
  /** Owning / issuing faction (player yearly quests, foreign offers). */
  sourceFactionId?: string | null;
  /** Anchor / origin system for filtering / map focus. */
  sourceSystemId?: string | null;
  /** Court NPC who issued / owns this quest (A9/A10). */
  sourceNpcId?: string | null;
  /** Multi-stage arc progress (A9). */
  arc?: { stages: QuestStage[]; currentStage: number };
  /** Interaction timeline (choices, dice, rewards). */
  history?: QuestHistoryEntry[];
  /** Top-level choices when no arc / current stage has none. */
  choices?: QuestChoice[];
  /** Dice required before resolving the quest / current stage. */
  diceRequired?: DiceSpec[];
  /** Turn on which an unresolved yearly quest expires. */
  expiresTurn?: number | null;
  /** Catalog id from yearly_quests.json (if spawned). */
  catalogId?: string | null;
}

/** Lasting ModifierStack effect attached to a faction (NPC tasks, etc.). */
export interface FactionEffectInstance {
  effect: string;
  args?: Record<string, unknown>;
  source?: { kind: string; id: string; label?: string };
  /** Turn after which the effect is pruned (economyTick). */
  expiresTurn?: number | null;
}

/** Court timeline entry (RP Court / A10). */
export interface CourtEvent {
  id: string;
  turn: number;
  at: string;
  type: "court";
  text: string;
  factionId?: string;
  npcId?: string;
  npcName?: string;
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
  /** Optional cargo delivered once on arrival, then caravan despawns. */
  cargo?: Record<string, number>;
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
  | "mark_refugees"
  | "mark_quarantine"
  | "mark_depot"
  | "mark_propaganda"
  | "mark_forge"
  | "mark_frontline"
  | "mark_mining_platform"
  | "mark_abandoned_station"
  | "mark_science_arch"
  | "mark_agronomy"
  | "mark_biocupola"
  | "mark_hydro_lab"
  | "mark_security_post"
  | "mark_grav_field"
  | "clear_poi"
  | "paint_resource"
  | "fog_paint"
  | "fog_erase"
  | "consequence_paint"
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
  mark_refugees: "refugees",
  mark_quarantine: "quarantine",
  mark_depot: "depot",
  mark_propaganda: "propaganda",
  mark_forge: "forge",
  mark_frontline: "frontline",
  mark_mining_platform: "mining_platform",
  mark_abandoned_station: "abandoned_station",
  mark_science_arch: "science_arch",
  mark_agronomy: "agronomy",
  mark_biocupola: "biocupola",
  mark_hydro_lab: "hydro_lab",
  mark_security_post: "security_post",
  mark_grav_field: "grav_field",
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
  | "truce"
  | "nap"
  | "research_pact"
  | "migration_treaty"
  | "embargo";

/** Single modifier instance (content-driven; applied via ModifierStack). */
export interface EffectInstance {
  effect: string;
  args?: Record<string, unknown>;
  source?: { kind: string; id: string; label?: string };
}

/** Polity doctrine trait from `faction_traits.json` (stored on Faction). */
export interface FactionTrait {
  id: string;
  label: string;
  effects: EffectInstance[];
  balanceBudget: number;
  ideology?: string;
  conditions?: { minEra?: number; tag?: string };
}

/** Bilateral treaty attached to a faction's diplomacy state. */
export interface Treaty {
  id: string;
  type: DiplomacyRelation;
  withFactionId: string;
  startedTurn: number;
  expiresTurn?: number | null;
  effects: EffectInstance[];
}

/** Soft history row for the diplomacy timeline UI. */
export interface DiplomacyEvent {
  turn: number;
  at?: string;
  type: string;
  withFactionId: string;
  label: string;
  opinionDelta?: number;
}

export interface FactionDiplomacy {
  /** factionId → opinion (−100…+100). */
  opinions: Record<string, number>;
  treaties: Treaty[];
  history?: DiplomacyEvent[];
  /** Turns since last broken treaty (casus belli signal). */
  lastBrokenTreatyTurn?: number | null;
}

export type OrderType =
  | "move_fleet"
  | "claim_system"
  | "attack_system"
  | "move_legion"
  | "blockade"
  | "fortify";

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

export type PlanetBuildingZone = "surface" | "orbital" | "subsurface" | "deep";

export interface PlanetBuilding {
  id: string;
  name: string;
  kind: PlanetBuildingKind;
  zone: PlanetBuildingZone;
  /** Content id from buildings.json (e.g. materia.smelter); preferred over kind lookup. */
  buildingId?: string;
  disabled?: boolean;
  /**
   * New economy model: per-role resource fills (resourceId → map.<key>).
   * Keyed by slot `role` (hull, weapon, shield, structure, crew, tactic, ...).
   * Empty/missing = unfilled slot (building still functions at legacy yield, but no flow bonus).
   */
  slotFills?: Record<string, string>;
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
  /** Population loyalty 0–100 (server SoT, A3). */
  loyalty?: number;
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
  /** Optional planet-axis anchor (Stellaris-style mining station on body). */
  anchorPlanetId?: string;
  /** Prefer planet orbitIndex when anchored; else free system belt. */
  orbitIndex?: number;
  /** Angle on system belt in orbital-plane radians (place-on-belt gesture). */
  beltAngle?: number;
}

/** Soft timeline row for system dive history UI. */
export interface SystemHistoryEntry {
  turn: number;
  type: "build" | "demolish" | "colonize" | "capture";
  planetId?: string;
  buildingId?: string;
  description: string;
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
  /** Recent build / colonize / capture events (capped server-side). */
  history?: SystemHistoryEntry[];
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
  /** Freeform notes for the master (hidden from players). */
  notes?: string;
  /** GM-only sticky notes (hidden from players). */
  gmNotes?: string;
  /** Timed narrative actions processed on tick. */
  timers?: {
    id: string;
    expiresTurn: number;
    action: { kind: string; poi?: string; activity?: string };
    label?: string | null;
  }[];
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
  /** Supply network status (server logistics tick). */
  logistics?: {
    connectedToCapital: boolean;
    hopsToCapital: number;
    viaDepot: boolean;
    supplyLevel: number;
    bottlenecked: boolean;
    /** Parent system on the supply tree (for map drawing). */
    parentId?: string | null;
    computedAtTurn?: number;
  };
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

/** Active assignment for a court NPC (A10). */
export interface NpcTask {
  id: string;
  label: string;
  startedTurn: number;
  /** Expected completion turn. */
  etaTurn: number;
  /** 0..1 progress toward completion. */
  progress?: number;
  /** Effects applied via ModifierStack on completion. */
  effects?: FactionEffectInstance[];
  /** Linked quest id (advance arc stage on finish). */
  linkedQuestId?: string;
}

/** Court / RP actor attached to a polity (player HQ + GM dossier). */
export interface FactionNpc {
  id: string;
  name: string;
  title?: string;
  role?:
    | "ruler"
    | "priest"
    | "strategist"
    | "architect"
    | "agent"
    | "other";
  status?: "active" | "hidden" | "dead" | "away" | "busy";
  /** Soft location labels (resolved against renamed systems). */
  locationSystemName?: string;
  locationPlanetName?: string;
  locationSystemId?: string;
  locationPlanetId?: string;
  avatarUrl?: string | null;
  /** Visible to owning faction in HQ. */
  publicNotes?: string;
  /** GM-only. */
  gmNotes?: string;
  tags?: string[];
  /** Current court assignment (A10). */
  currentTask?: NpcTask;
  /** Soft opinion toward other NPCs (−100…+100). */
  relationships?: Record<string, number>;
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
   * Portrait for RP chat (URL or data-URL). Upload UI comes later;
   * field is already read when posting messages.
   */
  avatarUrl?: string | null;
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
  /** Player-visible doctrine / polity notes. */
  notes?: string;
  /** GM-only sticky notes for this polity. */
  gmNotes?: string;
  /** Court / key NPCs for HQ «Двор» panel. */
  npcs?: FactionNpc[];
  /** Lasting ModifierStack effects from completed NPC tasks / events (A10). */
  activeEffects?: FactionEffectInstance[];
  /**
   * Faction doctrine traits (max 3) from faction_traits catalog.
   * Used by ModifierStack, logistics range, and science exclusives (`factionTraitLock`).
   */
  traits?: FactionTrait[];
  /**
   * Dominant / primary race id (xenorelations opinion).
   * Falls back to race_human when unset.
   */
  primaryRaceId?: string;
  /** Explicit capital for logistics BFS (else first owned isCapital). */
  capitalSystemId?: string | null;
  /** Opinion matrix, active treaties, soft history (A8). */
  diplomacy?: FactionDiplomacy;
  /** Soft loyalty store (A3/A9) — raceId → 0..100. */
  loyaltyByRace?: Record<string, number>;
  /** Aggregate loyalty fallback when race-specific missing. */
  loyalty?: number;
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
  /** Race→faction loyalty baselines (A3). */
  loyaltyMatrix?: Record<string, Record<string, number>>;
}

export interface RaceTrait {
  id: string;
  effects?: Array<{ effect: string; args?: Record<string, unknown> }>;
  balanceBudget?: number;
}

export interface Race {
  id: string;
  name: string;
  kind?: "race" | "subrace" | string;
  origin?: string;
  /** Soft hierarchy parent (display / compose when composeParent). */
  parent?: string;
  /** Fork inheritance source. */
  base?: string;
  forked_from?: string;
  composeParent?: boolean;
  override_traits?: RaceTrait[];
  remove_traits?: string[];
  state_overrides?: Record<string, unknown>;
  reproduction?: { requires?: string };
  tags?: string[];
  traits?: RaceTrait[];
  habitability?: Record<string, number>;
  growth?: { baseRate?: number; crowdPenalty?: number };
  xenorelations?: Record<string, number>;
}

/** Campaign-dynamic race modifier (data/race_states.json). */
export interface RaceStateModifier {
  id: string;
  source?: string;
  turn_applied?: number;
  effects?: Array<{ effect: string; args?: Record<string, unknown> }>;
  expires?: number | null;
  permanent?: boolean;
}

export interface ShipGroup {
  type: string;
  count: number;
  /** Stable stack id for card-battle finalize / duplicate stacks. */
  id?: string;
  defId?: string;
  hp?: number;
  filledSlots?: Record<string, string>;
  /** Veterancy experience points (A6). */
  xp?: number;
  /** Veterancy level 0..5 (A6). */
  level?: number;
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
  /** Previous system after a hop — used for retreat. */
  lastSystemId?: string;
  /** Set while multi-hop en route; applied when route empties. */
  pendingArrival?: {
    stance: FleetStance;
    systemId: string;
    fromSystemId?: string;
  };
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
  /** Previous system after a hop — used for retreat. */
  lastSystemId?: string;
  /** Species for raceVariants (A3). */
  raceId?: string | null;
  composition?: Array<{
    id?: string;
    defId?: string;
    type?: string;
    count?: number;
    hp?: number;
    xp?: number;
    level?: number;
    filledSlots?: Record<string, string>;
    slotFills?: Record<string, string>;
    slots?: unknown[];
  }>;
}

export type EngagementPhase =
  | "bombard"
  | "landing"
  | "ground"
  | "occupation";

export interface EngagementSideState {
  factionId: string;
  fleetIds?: string[];
  legionIds?: string[];
  stance?: string;
  locked?: boolean;
}

export interface EngagementDefenseLayers {
  orbital: { guns: number; shields: number };
  surface: { guns: number; bunkers: number };
  garrison: { unitIds: string[]; fortBonus: number };
}

/** Live combat event between ticks (A6). */
export interface Engagement {
  id: string;
  theater: "space" | "ground" | "assault" | string;
  systemId: string;
  planetId?: string | null;
  turnCreated?: number;
  startedTurn?: number;
  status: string;
  source?: string;
  roundsElapsed?: number;
  maxRounds?: number;
  requiresPlayerInput?: boolean;
  mode?: "auto" | "card" | string;
  phase?: EngagementPhase;
  orbitalControl?: "attacker" | "defender" | "contested";
  defenseLayers?: EngagementDefenseLayers;
  cardBattleRequests?: string[];
  sides: EngagementSideState[];
  result?: Record<string, unknown> | null;
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
  /** Monotonic live-table revision (server SoT). */
  tableRevision?: number;
  contentPacks?: string[];
  /** FactionId → turn when yearly quest dice was last rolled (A9). */
  yearlyQuestRolls?: Record<string, number>;
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
  /** Court timeline (A10) — ring of recent court events. */
  courtEvents?: CourtEvent[];
  /** Race→faction loyalty baselines (A3). */
  loyaltyMatrix?: Record<string, Record<string, number>>;
}

export interface BrushSettings {
  density: number;
  minDistance: number;
  linkDistance: number;
  resourceChance: number;
  corridorChance: number;
}

export type SystemSelectMode = "replace" | "add" | "toggle";

/** GM chrome: worldbuild vs live table. */
export type GmShellMode = "prep" | "live";

export interface UiState {
  tool: EditorTool;
  /** Prep = cartography tools; Live = inbox / tick / share-first chrome. */
  gmShellMode: GmShellMode;
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
  /**
   * GM omniscient view: when true, ignore faction fog and show the full map.
   * When false, map follows activeFactionId vision (same rules as the player).
   */
  gmOmniscientView: boolean;
  /** Server fog mask system ids for active faction (P3 brush). */
  fogMaskPreview: string[];
  /** Active consequence / system preset for consequence_paint tool. */
  activeConsequencePresetId: string | null;
  showJumpRange: boolean;
  showSupply: boolean;
  showCaravans: boolean;
  showBlockades: boolean;
  showDeadZones: boolean;
  showTraffic: boolean;
  showQuests: boolean;
  /** Loyalty heat halo map mode (A3). */
  showLoyalty: boolean;
  /** Open quest dossier id. */
  openQuestId: string | null;
  diplomacyPanelOpen: boolean;
  /** Floating RP chat window (GM editor). */
  rpFloatOpen: boolean;
  /** When opening RP float, prefer this faction's HQ episode. */
  rpFocusFactionId: string | null;
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

export interface TurnBriefingEvent {
  type: string;
  at?: string;
  factionId?: string;
  toFactionId?: string;
  systemId?: string;
  fromId?: string;
  toId?: string;
  attacker?: string;
  defender?: string;
  sides?: string[];
  outcome?: string;
  theater?: string;
  currencyId?: string;
  amount?: number;
  net?: Record<string, number>;
  deficit?: string;
  delta?: number;
  stance?: string;
  taxSlot?: string;
  tierId?: string;
  toSystemId?: string;
  giveCurrency?: string;
  giveAmount?: number;
  wantAmount?: number;
  sellerFactionId?: string;
  buyerFactionId?: string;
  offerId?: string;
  [key: string]: unknown;
}

export interface TurnBriefing {
  turnFrom: number;
  turnTo: number;
  economy?: {
    net?: Record<string, number>;
    deficit?: string;
    pressure?: number;
    apMax?: number;
  } | null;
  events: TurnBriefingEvent[];
}

/** Card-battle tactical layer over the same fleet/legion composition. */
export interface BattleCard {
  cardId: string;
  defId: string;
  /** Stable composition stack id (avoids collapsing duplicate defId stacks). */
  groupId?: string;
  role: string;
  count: number;
  hp: number;
  maxHp: number;
  damage: number;
  defense: number;
  shields: number;
  accuracy: number;
  targeting: string;
  filledSlots: Record<string, string>;
  veterancyLevel: number;
  /** Source composition parent (fleet/legion id). */
  parentId?: string;
  parentKind?: "fleet" | "legion";
}

export interface CardBattleLogEntry {
  round: number;
  side: string;
  action: "play" | "pass" | "resolve" | "draw" | "base_hit";
  cardId?: string;
  outcome?: {
    winnerCard?: string;
    loserCard?: string;
    damageDealt?: number;
  };
}

export interface CardBattleState {
  engagementId: string;
  hands: { [sideId: string]: BattleCard[] };
  decks: { [sideId: string]: BattleCard[] };
  discard: { [sideId: string]: BattleCard[] };
  frontLines: { [sideId: string]: BattleCard[] };
  /** Soft HP pool when hitting with no opposing front-line card. */
  baseHp: { [sideId: string]: number };
  round: number;
  currentSide: string;
  status: "active" | "resolved";
  log: CardBattleLogEntry[];
  winnerFactionId?: string | null;
}

/** Intel Fog knowledge depth for an entity (0 = unknown … 4 = full). */
export type KnowledgeLevel = 0 | 1 | 2 | 3 | 4;

export type IntelEntityType =
  | "race"
  | "faction"
  | "tech"
  | "building"
  | "unit";

export type IntelSource =
  | "fleet"
  | "legion"
  | "blockade"
  | "scout"
  | "diplomacy"
  | "espionage"
  | "trade"
  | "trade_agreement"
  | "quest"
  | "gm"
  | "own"
  | string;

export interface IntelHistoryEntry {
  entityId: string;
  entityType: IntelEntityType;
  oldLevel: KnowledgeLevel;
  newLevel: KnowledgeLevel;
  source: IntelSource;
  turn: number;
}

/** Per-faction knowledge maps shipped to the viewer (already filtered). */
export interface FactionIntelPublic {
  knownFactions: Record<string, KnowledgeLevel>;
  knownRaces: Record<string, KnowledgeLevel>;
  knownTechs: Record<string, KnowledgeLevel>;
  knownBuildings: Record<string, KnowledgeLevel>;
  knownUnits: Record<string, KnowledgeLevel>;
  intelHistory: IntelHistoryEntry[];
}

export interface ViewerPayload {
  world: WorldState;
  factionId: string;
  visibleSystemIds: string[];
  /** Polities this faction has met (sensors / diplo / memory), incl. self. */
  knownFactionIds?: string[];
  /** Known polities with trade or alliance corridor. */
  tradePartnerIds?: string[];
  /** Intel Fog levels for Codex + masked entity UI. */
  intel?: FactionIntelPublic;
  /** Pending diplomatic deals (inbox). */
  diploOffers?: {
    incoming: Array<{
      id: string;
      fromFactionId: string;
      toFactionId: string;
      status: string;
      give: Array<Record<string, unknown>>;
      want: Array<Record<string, unknown>>;
      note?: string;
      createdTurn?: number;
      createdAt?: string;
    }>;
    outgoing: Array<{
      id: string;
      fromFactionId: string;
      toFactionId: string;
      status: string;
      give: Array<Record<string, unknown>>;
      want: Array<Record<string, unknown>>;
      note?: string;
      createdTurn?: number;
      createdAt?: string;
    }>;
  };
  /** From published map — used for live refresh polling. */
  updatedAt?: string | null;
  tableRevision?: number;
  apMax?: number;
  reservedAp?: number;
  economy?: {
    stocks: Record<string, number>;
    taxes: Record<string, string>;
    pendingPolicy?: { taxes?: Record<string, string> };
    pressure?: number;
    deficit?: string;
    /** Optional flow matrix snapshot from economy tick / flows API. */
    flows?: Record<string, unknown>;
    /** Optional bottleneck map keyed by category (A–F). */
    bottlenecks?: Record<string, { tier?: number; deficit?: number } | number>;
    unlockedTechs?: string[];
    /** Researched tech upgrade ids (e.g. tech.fusion.overclock). */
    unlockedUpgrades?: string[];
    /** Trade / historical acquisitions (Phase D). */
    acquiredTechs?: Array<{
      techId: string;
      source?: string;
      acquiredTurn?: number | null;
      transferable?: boolean;
      tradedWith?: string | null;
      note?: string | null;
    }>;
    /** Planned research order (tech ids, max 5). */
    researchQueue?: string[];
    /** Planned builds (max 5). */
    buildQueue?: Array<{
      systemId: string;
      planetId: string;
      buildingId: string;
    }>;
    techTiers?: Record<string, number>;
    unlockedProperties?: string[];
    /** Recent ledger entries (delta/reason/turn) for breakdown + deltas. */
    recent?: {
      factionId: string;
      currencyId: string;
      delta: number;
      turn: number | null;
      reason: string;
      intentId?: string | null;
    }[];
    /** Sanitized modifier breakdown from last economy tick. */
    explain?: {
      lines: {
        category: string;
        label: string;
        modifier: string;
        sources?: string[];
      }[];
      raceTraits?: { label: string; summary: string }[];
      factionTraits?: { label: string; summary: string }[];
    };
    /** RPS edge priorities keyed by systemId or "_faction". */
    flowPriorities?: Record<string, { from: string; to: string; edge?: string }>;
    /** Soft stock reserves (do not deduct from stocks). */
    stockReserves?: Record<string, { amount: number; label?: string }>;
    /** Units pulled from fleets/legions into reserve pool. */
    forceReserve?: Array<{
      type?: string;
      defId?: string;
      count?: number;
      hp?: number;
      xp?: number;
      level?: number;
      filledSlots?: Record<string, string>;
    }>;
    /** Active economic doctrine id. */
    economicPolicy?: string | null;
    /** Active law ids (future enact_law). */
    laws?: string[];
  };
  /** Faction-filtered summary of the last processed turn (P2.5). */
  briefing?: TurnBriefing | null;
}
