import { z } from "zod";

export const CreateCampaignRequestSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1),
});

export const CreateCampaignResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
});

export const AddFactionRequestSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  playerId: z.string().min(1).nullable().optional(),
  raceId: z.string().min(1),
  colorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  isNpc: z.boolean().default(false),
});

export const AddFactionResponseSchema = z.object({
  id: z.string(),
  campaignId: z.string(),
  name: z.string(),
  raceId: z.string(),
  colorHex: z.string(),
  isNpc: z.boolean(),
  playerId: z.string().nullable().optional(),
  pegResourceId: z.string().nullable().optional(),
  pegChangedTurn: z.number().int().nullable().optional(),
});

export const CampaignStateResponseSchema = z.object({
  campaign: z.object({ id: z.string(), name: z.string(), createdAt: z.string() }),
  currentTurn: z.number().int(),
  factions: z.array(
    z.object({
      faction: z.record(z.string(), z.unknown()),
      economy: z.record(z.string(), z.unknown()).nullable(),
      tech: z.record(z.string(), z.unknown()).nullable(),
      civic: z.record(z.string(), z.unknown()).nullable(),
      diplomacy: z.record(z.string(), z.unknown()).nullable(),
      court: z.record(z.string(), z.unknown()).nullable().optional(),
      stability: z.number().optional(),
      revolts: z.array(z.record(z.string(), z.unknown())).optional(),
    }),
  ),
  relations: z.record(z.string(), z.string()),
  systems: z.array(z.record(z.string(), z.unknown())),
  links: z.array(z.record(z.string(), z.unknown())).optional(),
  sectors: z.array(z.record(z.string(), z.unknown())).optional(),
  fx: z.record(z.string(), z.unknown()).optional(),
  forces: z.array(z.record(z.string(), z.unknown())).optional(),
  journal: z.record(z.string(), z.unknown()).nullable().optional(),
  tableRevision: z.number().int().optional(),
});

export const CampaignViewResponseSchema = z.object({
  unchanged: z.literal(true).optional(),
  tableRevision: z.number().int().optional(),
  campaign: z.object({ id: z.string(), name: z.string() }).optional(),
  currentTurn: z.number().int().optional(),
  viewer: z.object({ role: z.string(), factionId: z.string() }).optional(),
  self: z.record(z.string(), z.unknown()).optional(),
  others: z.array(z.record(z.string(), z.unknown())).optional(),
  visibleSystemIds: z.array(z.string()).optional(),
  systems: z.array(z.record(z.string(), z.unknown())).optional(),
  links: z.array(z.record(z.string(), z.unknown())).optional(),
  forces: z.array(z.record(z.string(), z.unknown())).optional(),
  relations: z.record(z.string(), z.string()).optional(),
  briefing: z.record(z.string(), z.unknown()).nullable().optional(),
  fx: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const SetTaxesRequestSchema = z.object({
  slot: z.string().min(1),
  tierId: z.string().min(1),
});

export const SetTaxesResponseSchema = z.object({
  taxes: z.record(z.string(), z.string()),
});

export const MintPlayerTokenRequestSchema = z.object({
  displayName: z.string().min(1).optional(),
  token: z.string().regex(/^\d{4}$/).optional(),
});

export const MintPlayerTokenResponseSchema = z.object({
  playerId: z.string(),
  factionId: z.string(),
  token: z.string(),
  displayName: z.string(),
});

export const CampaignListResponseSchema = z.object({
  campaigns: z.array(z.object({ id: z.string(), name: z.string() })),
});

const SystemLinkSpecSchema = z.object({
  toSystemId: z.string().min(1),
  type: z.string().min(1).default("corridor"),
});

export const CreateSystemRequestSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  ownerFactionId: z.string().min(1).nullable().optional(),
  x: z.number().nullable().optional(),
  y: z.number().nullable().optional(),
  isCapital: z.boolean().optional(),
  kind: z.string().min(1).nullable().optional(),
  stars: z.array(z.record(z.string(), z.unknown())).nullable().optional(),
  links: z.array(SystemLinkSpecSchema).optional(),
  spaceObjects: z
    .array(
      z.object({
        typeId: z.string().min(1),
        remainingAmount: z.number().nonnegative().nullable().optional(),
      }),
    )
    .optional(),
});

export const UpdateSystemRequestSchema = z.object({
  name: z.string().min(1).optional(),
  ownerFactionId: z.string().min(1).nullable().optional(),
  x: z.number().nullable().optional(),
  y: z.number().nullable().optional(),
  isCapital: z.boolean().optional(),
  kind: z.string().min(1).nullable().optional(),
  stars: z.array(z.record(z.string(), z.unknown())).nullable().optional(),
  links: z.array(SystemLinkSpecSchema).optional(),
});

export const AddSystemLinkRequestSchema = SystemLinkSpecSchema;

export const CreatePlanetRequestSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.string().optional(),
  climate: z.string().optional(),
  habitable: z.boolean().default(true),
  colonizable: z.boolean().default(true),
  grade: z.number().int().min(1).max(5).default(1),
  orbitalGrade: z.number().int().min(1).max(5).default(1),
  // Kept so existing clients don't fail validation; ignored in favor of grade
  // (domain/planets/planetGrade.mjs is the source of truth for slot counts).
  surfaceSlots: z.number().int().positive().optional(),
  orbitalSlots: z.number().int().positive().optional(),
  raceComposition: z.array(z.object({ raceId: z.string(), percent: z.number() })).default([]),
  // map_resources.json ids. Omitted + autoGenerateResources → biome roll
  // (domain/planets/depositGeneration.mjs). Explicit array (including [])
  // always wins. See notes/2026-08-13-resource-extraction-grill.md Q1.
  resources: z.array(z.string().min(1)).optional(),
  autoGenerateResources: z.boolean().optional(),
});

export const ColonizeRequestSchema = z.object({
  colonyType: z.string().default("outpost"),
  // See domain/planets/colonization.mjs's colonizePlanet header + notes/2026-08-12-population-race-forces-grill.md.
  mode: z.enum(["auto", "manual"]).default("auto"),
  manualComposition: z.array(z.object({ raceId: z.string().min(1), count: z.number().positive() })).optional(),
  sourcePlanetId: z.string().optional(),
});

export const BuildRequestSchema = z.object({
  buildingId: z.string().min(1),
});

export const UpgradeGradeRequestSchema = z.object({
  zone: z.enum(["surface", "orbital"]),
});

export const AddSpaceObjectRequestSchema = z.object({
  typeId: z.string().min(1),
  remainingAmount: z.number().nonnegative().nullable().optional(),
});

export const PlanetActionResponseSchema = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
  planet: z.record(z.string(), z.unknown()).optional(),
  stocks: z.record(z.string(), z.number()).optional(),
  journal: z.array(z.record(z.string(), z.unknown())).optional(),
  building: z.record(z.string(), z.unknown()).optional(),
  // Colonize-only: which of the faction's other planets lost population to
  // fund this colony, and (auto mode) the purity-roll result.
  sourcePlanets: z.array(z.record(z.string(), z.unknown())).optional(),
  diceRoll: z.number().int().optional(),
});

const FactionInputsSchema = z.object({
  categoryIncome: z.record(z.string(), z.number()).optional(),
  planets: z.array(z.record(z.string(), z.unknown())).optional(),
  pressureAdd: z.number().optional(),
  marketVol: z.number().optional(),
  treatyCount: z.number().optional(),
  cultureMetrics: z.object({ cultureShare: z.number(), avgLoyalty: z.number(), faithShare: z.number() }).optional(),
});

export const RunTurnRequestSchema = z.object({
  factionInputs: z.record(z.string(), FactionInputsSchema).default({}),
});

export const RunTurnResponseSchema = z.object({
  turn: z.number().int(),
  economy: z.record(z.string(), z.unknown()),
  civic: z.record(z.string(), z.unknown()),
  diplomacy: z.record(z.string(), z.unknown()),
  fx: z.record(z.string(), z.unknown()).optional(),
  revolt: z.array(z.record(z.string(), z.unknown())).optional(),
  journal: z.record(z.string(), z.unknown()).optional(),
});

export const PersistedResearchRequestSchema = z.object({
  techId: z.string().min(1),
  turn: z.coerce.number().int().nonnegative().optional(),
});

export const SetRelationRequestSchema = z.object({
  factionAId: z.string().min(1),
  factionBId: z.string().min(1),
  relation: z.string().min(1),
  turn: z.coerce.number().int().nonnegative().optional(),
});

export const SetRelationResponseSchema = z.object({
  factionA: z.record(z.string(), z.unknown()),
  factionB: z.record(z.string(), z.unknown()),
});

export const PersistedResearchResponseSchema = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
  techAccount: z.record(z.string(), z.unknown()).optional(),
  stocks: z.record(z.string(), z.number()).optional(),
  journal: z.array(z.record(z.string(), z.unknown())).optional(),
  tech: z.record(z.string(), z.unknown()).optional(),
  offerBypass: z.boolean().optional(),
});

export const TechDirectionSchema = z.enum([
  "industry",
  "military",
  "culture",
  "commerce",
  "diplomacy",
  "governance",
]);

export const FillTechSocketRequestSchema = z.object({
  resourceId: z.string().min(1),
});

export const TechAccountActionResponseSchema = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
  techAccount: z.record(z.string(), z.unknown()).optional(),
  stocks: z.record(z.string(), z.number()).optional(),
  journal: z.array(z.record(z.string(), z.unknown())).optional(),
});
