import { z } from "zod";

export const SetFactionPegRequestSchema = z.object({
  resourceId: z.string().min(1).nullable(),
});

export const SetFactionPegResponseSchema = z.object({
  id: z.string(),
  pegResourceId: z.string().nullable(),
  pegChangedTurn: z.number().int().nullable(),
});

export const SetMarketRatesRequestSchema = z.object({
  rates: z.array(
    z.object({
      pair: z.string().min(1),
      buy: z.number().positive(),
      sell: z.number().positive(),
      note: z.string().optional(),
    }),
  ),
});

export const MarketRatesResponseSchema = z.object({
  rates: z.array(z.record(z.string(), z.unknown())),
  source: z.string(),
  updatedAt: z.string().nullable(),
  fx: z.record(z.string(), z.unknown()),
});

export const CurrencyDealRequestSchema = z.object({
  factionAId: z.string().min(1),
  factionBId: z.string().min(1),
  turn: z.coerce.number().int().nonnegative().optional(),
  basePeg: z.string().min(1).optional(),
  quotePeg: z.string().min(1).optional(),
  unitsQuotePerBase: z.number().positive().optional(),
});

export const CurrencyDealResponseSchema = z.object({
  factionA: z.record(z.string(), z.unknown()),
  factionB: z.record(z.string(), z.unknown()),
  relation: z.string(),
});

export const CurrencyUnionRequestSchema = z.object({
  fromFactionId: z.string().min(1),
  intoFactionId: z.string().min(1),
  turn: z.coerce.number().int().nonnegative().optional(),
});

export const CurrencyUnionResponseSchema = z.object({
  factionA: z.record(z.string(), z.unknown()),
  factionB: z.record(z.string(), z.unknown()),
  relation: z.string(),
  adoptedPeg: z.string().nullable(),
});

export const SetPegMultiplierRequestSchema = z.object({
  resourceId: z.string().min(1),
  multiplier: z.number(),
});

export const SetPegMultiplierResponseSchema = z.object({
  resourceId: z.string(),
  multiplier: z.number(),
  multipliers: z.record(z.string(), z.number()),
});

export const BarterRequestSchema = z.object({
  fromFactionId: z.string().min(1),
  toFactionId: z.string().min(1),
  give: z.object({ resourceId: z.string().min(1), amount: z.number().positive() }),
  receive: z.object({ resourceId: z.string().min(1), amount: z.number().positive() }).optional(),
});

export const BarterResponseSchema = z.object({
  fromStocks: z.record(z.string(), z.number()),
  toStocks: z.record(z.string(), z.number()),
});

export const SettleDealRequestSchema = z.object({
  fromFactionId: z.string().min(1),
  toFactionId: z.string().min(1),
  amount: z.number().positive(),
});

export const SettleDealResponseSchema = z.object({
  fromStocks: z.record(z.string(), z.number()),
  toStocks: z.record(z.string(), z.number()),
  giveAmt: z.number(),
  takeAmt: z.number(),
});
