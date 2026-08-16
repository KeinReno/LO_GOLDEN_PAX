import { z } from "zod";
import { TechAccountSchema } from "./techAccount.mjs";

export const ResearchTechRequestSchema = z.object({
  turn: z.coerce.number().int().nonnegative().optional(),
  techId: z.string().min(1),
  techAccount: TechAccountSchema,
  stocks: z.record(z.string(), z.number()),
  // Caller-supplied for the raceLock check (checkTechLocks) — this preview
  // route has no persisted world to load planets from itself.
  factionPlanets: z.array(z.record(z.string(), z.unknown())).optional(),
});

export const ResearchTechResponseSchema = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
  techAccount: z.record(z.string(), z.unknown()).optional(),
  stocks: z.record(z.string(), z.number()).optional(),
  journal: z.array(z.record(z.string(), z.unknown())).optional(),
  tech: z.record(z.string(), z.unknown()).optional(),
  offerBypass: z.boolean().optional(),
});
