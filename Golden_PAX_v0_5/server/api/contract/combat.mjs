import { z } from "zod";

const GroupSchema = z.object({
  defId: z.string().optional(),
  parentId: z.string().optional(),
  roles: z.array(z.string()).min(1),
  damage: z.number().nonnegative(),
  accuracy: z.number().nonnegative().default(0),
  armor: z.number().nonnegative().default(0),
  shields: z.number().nonnegative().default(0),
  count: z.number().int().nonnegative(),
  hp: z.number().nonnegative(),
  maxHp: z.number().positive(),
  xp: z.number().nonnegative().optional(),
  level: z.number().int().nonnegative().optional(),
  stationary: z.boolean().optional(),
  targeting: z.string().optional(),
  filledSlots: z.record(z.string(), z.string()).optional(),
  compSlots: z.array(z.record(z.string(), z.unknown())).optional(),
});

export const ResolveExchangeRequestSchema = z.object({
  groupsA: z.array(GroupSchema).min(0),
  groupsB: z.array(GroupSchema).min(0),
  stanceA: z.string().optional(),
  stanceB: z.string().optional(),
  factionIdA: z.string().optional(),
  factionIdB: z.string().optional(),
});

export const ResolveExchangeResponseSchema = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
  outcome: z.string().optional(),
  powerA: z.number().optional(),
  powerB: z.number().optional(),
  retreated: z.string().nullable().optional(),
  lossesA: z.array(z.record(z.string(), z.unknown())).optional(),
  lossesB: z.array(z.record(z.string(), z.unknown())).optional(),
  groupsA: z.array(z.record(z.string(), z.unknown())).optional(),
  groupsB: z.array(z.record(z.string(), z.unknown())).optional(),
});
