import { z } from "zod";

export const FactionBriefingRequestSchema = z.object({
  factionId: z.string().min(1),
  journal: z.object({
    turnFrom: z.number().int().optional(),
    turnTo: z.number().int().optional(),
    economy: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
    events: z.array(z.record(z.string(), z.unknown())).default([]),
  }),
  world: z
    .object({
      systems: z.array(z.object({ id: z.string(), ownerFactionId: z.string().nullable().optional() })).default([]),
    })
    .optional(),
});

export const FactionBriefingResponseSchema = z
  .object({
    turnFrom: z.number().int().optional(),
    turnTo: z.number().int().optional(),
    economy: z.record(z.string(), z.unknown()).nullable(),
    events: z.array(z.record(z.string(), z.unknown())),
  })
  .nullable();
