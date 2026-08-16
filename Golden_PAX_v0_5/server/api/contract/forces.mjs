import { z } from "zod";

export const RaiseUnitRequestSchema = z.object({
  defId: z.string().min(1),
  kind: z.enum(["ship", "unit"]),
  count: z.number().int().positive().default(1),
  name: z.string().min(1).optional(),
  overrideCeiling: z.boolean().optional(),
});

export const RaiseUnitResponseSchema = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
  planet: z.record(z.string(), z.unknown()).optional(),
  stocks: z.record(z.string(), z.number()).optional(),
  journal: z.array(z.record(z.string(), z.unknown())).optional(),
  force: z.record(z.string(), z.unknown()).optional(),
});

export const DisbandForceRequestSchema = z.object({
  count: z.number().int().positive().optional(), // omit = whole force (or whole targeted group if defId is set)
  defId: z.string().min(1).optional(), // omit = last group (legacy LIFO)
});

export const EngageForcesRequestSchema = z.object({
  forceBId: z.string().min(1),
  stanceA: z.string().optional(),
  stanceB: z.string().optional(),
  systemId: z.string().min(1).optional(),
});

export const EngageForcesResponseSchema = z.object({
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
  deletedForceIds: z.array(z.string()).optional(),
  forceA: z.record(z.string(), z.unknown()).nullable().optional(),
  forceB: z.record(z.string(), z.unknown()).nullable().optional(),
  occupied: z.boolean().optional(),
  ownerFactionId: z.string().optional(),
});

export const DisbandForceResponseSchema = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
  planet: z.record(z.string(), z.unknown()).optional(),
  force: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const MoveForceRequestSchema = z.object({
  toSystemId: z.string().min(1),
});

export const MoveForceResponseSchema = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
  force: z.record(z.string(), z.unknown()).optional(),
  fromId: z.string().optional(),
  toId: z.string().optional(),
  hops: z.number().optional(),
  maxHops: z.number().optional(),
  movementPointsSpent: z.number().optional(),
  movementPoints: z.number().optional(),
  movementPointsNeeded: z.number().optional(),
});

export const ListForcesResponseSchema = z.object({
  forces: z.array(z.record(z.string(), z.unknown())),
});

export const BoardForceRequestSchema = z.object({
  targetFleetForceId: z.string().min(1),
  systemId: z.string().min(1).optional(),
});

export const BoardForceResponseSchema = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
  outcome: z.string().optional(),
  captured: z.boolean().optional(),
  powerA: z.number().optional(),
  powerB: z.number().optional(),
  retreated: z.string().nullable().optional(),
  lossesA: z.array(z.record(z.string(), z.unknown())).optional(),
  lossesB: z.array(z.record(z.string(), z.unknown())).optional(),
  groupsA: z.array(z.record(z.string(), z.unknown())).optional(),
  groupsB: z.array(z.record(z.string(), z.unknown())).optional(),
  fleetComposition: z.array(z.record(z.string(), z.unknown())).optional(),
  deletedForceIds: z.array(z.string()).optional(),
  forceA: z.record(z.string(), z.unknown()).nullable().optional(),
  forceB: z.record(z.string(), z.unknown()).nullable().optional(),
});
