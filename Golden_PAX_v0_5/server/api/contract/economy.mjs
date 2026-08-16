import { z } from "zod";

const EcoAccountSchema = z.object({
  stocks: z.record(z.string(), z.number()),
  taxes: z.record(z.string(), z.string()).default({}),
  stockReserves: z.record(z.string(), z.object({ amount: z.number().optional() })).optional(),
});

const PlanetInputSchema = z.object({
  pop: z.number().nonnegative(),
  cap: z.number().positive(),
  growthRate: z.number(),
  habEff: z.number(),
  supplyFactor: z.number(),
});

export const EconomyTickPreviewRequestSchema = z.object({
  turn: z.coerce.number().int().nonnegative(),
  factions: z
    .array(
      z.object({
        id: z.string().min(1),
        eco: EcoAccountSchema,
        categoryIncome: z.record(z.string(), z.number()).optional(),
        planets: z.array(PlanetInputSchema).optional(),
      }),
    )
    .min(1),
});

export const EconomyTickPreviewResponseSchema = z.object({
  turn: z.number().int(),
  breakdowns: z.record(z.string(), z.record(z.string(), z.unknown())),
  journal: z.array(z.record(z.string(), z.unknown())),
});
