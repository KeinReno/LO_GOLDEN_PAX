import { z } from "zod";

const CostSchema = z.record(z.string(), z.number());

export const CatalogBuildingSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.string().optional(),
  zone: z.string().optional(),
  tier: z.number().optional(),
  laborSlots: z.number().optional(),
  cost: CostSchema.optional(),
  biome_restrictions: z.array(z.string()).optional(),
  faction: z.string().optional(),
  category: z.string().optional(),
  maxPerPlanet: z.number().optional(),
  maxPerSystem: z.number().optional(),
  prerequisites: z
    .object({
      race: z.string().optional(),
      races: z.array(z.string()).optional(),
    })
    .optional(),
});

export const CatalogForceDefSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(["unit", "ship"]),
  raisableWithoutBuilding: z.boolean().optional(),
  requiresTech: z.string().optional(),
  cost: CostSchema.optional(),
  tier: z.number().optional(),
  faction: z.string().optional(),
});

export const CatalogTaxSlotSchema = z.object({
  name: z.string().optional(),
  tiers: z.array(
    z.object({
      id: z.string(),
      rate: z.number(),
      label: z.string().optional(),
    }),
  ),
});

export const CatalogCurrencySchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  short: z.string().optional(),
});

export const TableCatalogResponseSchema = z.object({
  buildings: z.array(CatalogBuildingSchema),
  units: z.array(CatalogForceDefSchema),
  ships: z.array(CatalogForceDefSchema),
  taxes: z.record(z.string(), CatalogTaxSlotSchema),
  currencies: z.record(z.string(), CatalogCurrencySchema).optional(),
});
