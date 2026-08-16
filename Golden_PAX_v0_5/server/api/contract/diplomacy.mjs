import { z } from "zod";

const DiplomacyAccountSchema = z.object({
  opinions: z.record(z.string(), z.number()).default({}),
  treaties: z.array(z.record(z.string(), z.unknown())).default([]),
  history: z.array(z.record(z.string(), z.unknown())).default([]),
  lastBrokenTreatyTurn: z.number().int().nullable().optional(),
});

const FactionSchema = z.object({
  id: z.string().min(1),
  primaryRaceId: z.string().optional(),
  traits: z.array(z.string()).optional(),
  diplomacy: DiplomacyAccountSchema,
});

export const TickOpinionsRequestSchema = z.object({
  factions: z.array(FactionSchema).min(1),
  relations: z.record(z.string(), z.string()).default({}),
});

export const TickOpinionsResponseSchema = z.object({
  factions: z.array(z.record(z.string(), z.unknown())),
  journal: z.array(z.record(z.string(), z.unknown())),
});
