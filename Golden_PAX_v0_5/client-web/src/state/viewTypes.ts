/** Client view contract for GET /view and GM GET /state normalization. */

export type KnowledgeLevel = 0 | 1;

export interface SystemPlanetView {
  id: string;
  name: string;
  type?: string;
  habitable?: boolean;
  colonyType?: string | null;
  ownerFactionId?: string | null;
  buildings?: unknown[];
}

export interface SystemViewBase {
  id: string;
  name: string;
  x: number;
  y: number;
}

export interface SystemViewDetail extends SystemViewBase {
  knowledge: 0;
  kind?: string | null;
  ownerFactionId?: string | null;
  isCapital?: boolean;
  planets?: SystemPlanetView[];
}

export interface SystemViewSilhouette extends SystemViewBase {
  knowledge: 1;
  kind?: string | null;
  ownerFactionId?: string | null;
  isCapital?: boolean;
}

export type SystemView = SystemViewDetail | SystemViewSilhouette;

export interface LinkView {
  id?: string;
  fromId: string;
  toId: string;
  type?: string;
}

export type ForceKind = "fleet" | "legion";

export interface ForceView {
  id: string;
  factionId: string;
  kind: ForceKind;
  name?: string;
  systemId: string | null;
  movementPoints?: number;
  composition?: unknown[];
  /** Server: knowledge "spotted" for foreign contacts. */
  knowledge?: "spotted";
  approxCount?: number;
  spotted?: boolean;
}

export interface EconomyView {
  stocks?: Record<string, number>;
  taxes?: Record<string, unknown>;
  pressure?: number;
  deficit?: number;
}

export const TECH_DIRECTIONS = [
  "industry",
  "military",
  "culture",
  "commerce",
  "diplomacy",
  "governance",
] as const;

export type TechDirection = (typeof TECH_DIRECTIONS)[number];

export interface TechOfferDirection {
  candidates: string[];
  rerolled?: boolean;
}

export interface CourtNpcView {
  id: string;
  name: string;
  councilSeat?: string | null;
  posting?: { kind: string; systemId?: string; forceId?: string };
  isPlayerRuler?: boolean;
}

export interface CourtView {
  npcs: CourtNpcView[];
  seats?: Record<string, unknown>;
  blocs?: unknown[];
}

export interface SelfView {
  faction: {
    id: string;
    name: string;
    colorHex?: string;
    raceId?: string;
    pegResourceId?: string | null;
    pegChangedTurn?: number | null;
  };
  economy: EconomyView;
  tech?: {
    currentOffers?: Partial<Record<TechDirection, TechOfferDirection>> | Record<string, unknown>;
    unlockedTechs?: unknown[];
    techSockets?: Record<string, string | null>;
    techGrades?: Record<string, unknown>;
  };
  court?: CourtView | Record<string, unknown>;
  stability?: number;
  revolts?: unknown[];
  flow?: unknown;
}

export interface OtherFactionView {
  id: string;
  name: string;
  colorHex: string;
  isNpc?: boolean;
}

export type ViewerInfo = { role: "player"; factionId: string } | { role: "gm" };

export interface ViewPayload {
  campaign: { id: string; name: string };
  currentTurn: number;
  tableRevision: number;
  viewer: ViewerInfo;
  self: SelfView;
  others: OtherFactionView[];
  visibleSystemIds: string[];
  systems: SystemView[];
  links: LinkView[];
  forces: ForceView[];
  relations: Record<string, string>;
  briefing?: unknown;
  fx?: unknown;
}

export interface ViewUnchangedPayload {
  unchanged: true;
  tableRevision: number;
}

/** GM GET /state body. */
export interface CampaignStatePayload {
  campaign: { id: string; name: string; createdAt?: string };
  currentTurn: number;
  tableRevision?: number;
  factions: Array<{
    faction: Record<string, unknown>;
    economy?: Record<string, unknown> | null;
    tech?: Record<string, unknown> | null;
    stability?: number;
    revolts?: unknown[];
  }>;
  relations: Record<string, string>;
  systems: Array<Record<string, unknown>>;
  links?: Array<Record<string, unknown>>;
  forces?: Array<Record<string, unknown>>;
  journal?: Record<string, unknown> | null;
  fx?: Record<string, unknown>;
}

export interface MintPlayerTokenResult {
  playerId: string;
  factionId: string;
  token: string;
  displayName: string;
}

/** GET /api/content/table — verb catalog, not the full content pack. */
export interface CatalogBuilding {
  id: string;
  name: string;
  kind?: string;
  zone?: string;
  tier?: number;
  laborSlots?: number;
  cost?: Record<string, number>;
  biome_restrictions?: string[];
  faction?: string;
  category?: string;
  maxPerPlanet?: number;
  maxPerSystem?: number;
  prerequisites?: { race?: string; races?: string[] };
}

export interface CatalogForceDef {
  id: string;
  name: string;
  kind: "unit" | "ship";
  raisableWithoutBuilding?: boolean;
  requiresTech?: string;
  cost?: Record<string, number>;
  tier?: number;
  faction?: string;
}

export interface CatalogTaxSlot {
  name?: string;
  tiers: Array<{ id: string; rate: number; label?: string }>;
}

export interface TableCatalog {
  buildings: CatalogBuilding[];
  units: CatalogForceDef[];
  ships: CatalogForceDef[];
  taxes: Record<string, CatalogTaxSlot>;
  currencies?: Record<string, { id?: string; name: string; short?: string }>;
}
