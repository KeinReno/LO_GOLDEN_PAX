import { z } from "zod";

/**
 * Every request into the API acts as exactly one of these.
 * There is no "anonymous"/"default" actor — GM tools require the master
 * token, player tools require a factionId, and domain code should never
 * assume which one it's talking to without checking.
 */
export const ActorSchema = z.discriminatedUnion("role", [
  z.object({
    role: z.literal("gm"),
  }),
  z.object({
    role: z.literal("player"),
    factionId: z.string().min(1),
  }),
]);

/** @typedef {z.infer<typeof ActorSchema>} Actor */

export function isGm(actor) {
  return actor.role === "gm";
}

export function requireFaction(actor) {
  if (actor.role !== "player") {
    throw new Error(`Expected a player actor, got role "${actor.role}"`);
  }
  return actor.factionId;
}
