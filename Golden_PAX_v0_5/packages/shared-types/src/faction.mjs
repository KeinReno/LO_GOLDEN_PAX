import { z } from "zod";

/**
 * A faction is one player's seat in the campaign. The number of factions
 * in a campaign is not fixed anywhere in this schema — code must read it
 * from data, never assume a count.
 */
export const FactionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  playerId: z.string().min(1).nullable(), // null = NPC/unclaimed faction, still a valid faction
  raceId: z.string().min(1),
  colorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  isNpc: z.boolean().default(false),
});

/** @typedef {z.infer<typeof FactionSchema>} Faction */
