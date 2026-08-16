import { z } from "zod";
import { TechAccountSchema } from "./techAccount.mjs";

const CivicAccountSchema = z.object({
  civicScores: z.object({ trade: z.number(), culture: z.number() }),
  laws: z.array(z.string()).default([]),
});

const CivicInputsSchema = z.object({
  marketVol: z.number().default(0),
  treatyCount: z.number().default(0),
  cultureMetrics: z.object({
    cultureShare: z.number().min(0).max(1),
    avgLoyalty: z.number(),
    faithShare: z.number().min(0).max(1),
  }),
});

export const CivicTickRequestSchema = z.object({
  factions: z
    .array(
      z.object({
        id: z.string().min(1),
        civicAccount: CivicAccountSchema,
        techAccount: TechAccountSchema,
        inputs: CivicInputsSchema,
      }),
    )
    .min(1),
});

export const CivicTickResponseSchema = z.object({
  factions: z.array(z.record(z.string(), z.unknown())),
  journal: z.array(z.record(z.string(), z.unknown())),
  breakdowns: z.record(z.string(), z.record(z.string(), z.unknown())),
});

const NpcStatusSchema = z.enum(["active", "away", "busy", "dead", "hidden"]);

const NpcPostingSchema = z.object({
  kind: z.enum(["court", "governor", "commander", "admiral"]),
  sinceTurn: z.number().int().optional(),
  systemId: z.string().min(1).optional(),
  forceId: z.string().min(1).optional(),
});

export const CreateNpcRequestSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1),
  raceId: z.string().min(1),
  status: NpcStatusSchema.optional(),
  traitIds: z.array(z.string()).optional(),
  posting: NpcPostingSchema.optional(),
  councilSeat: z.string().nullable().optional(),
  blocId: z.string().nullable().optional(),
  isBlocLeader: z.boolean().optional(),
  isPlayerRuler: z.boolean().optional(),
  raceLeadership: z.object({ raceId: z.string().min(1) }).optional(),
});

export const EditNpcRequestSchema = CreateNpcRequestSchema.partial().extend({
  name: z.string().min(1).optional(),
  raceId: z.string().min(1).optional(),
});

export const ConfirmRulerRequestSchema = z.object({
  confirmSetRuler: z.boolean(),
});

export const SeatNpcRequestSchema = z.object({
  seatId: z.string().min(1),
});

export const AssignPostingRequestSchema = z.object({
  kind: z.enum(["governor", "commander", "admiral"]),
  targetId: z.string().min(1),
});

export const GiveNpcTaskRequestSchema = z.object({
  taskId: z.string().min(1).optional(),
  taskLabel: z.string().optional(),
  etaTurn: z.number().int().optional(),
  linkedQuestId: z.string().min(1).optional(),
});

export const SetPortfolioRequestSchema = z.object({
  portfolioId: z.string().min(1),
});

export const CourtStateResponseSchema = z.object({
  rulerNpcId: z.string().nullable(),
  council: z.record(z.string(), z.unknown()),
  npcs: z.array(z.record(z.string(), z.unknown())),
  internalBlocs: z.array(z.record(z.string(), z.unknown())),
  activeEffects: z.array(z.record(z.string(), z.unknown())),
});
