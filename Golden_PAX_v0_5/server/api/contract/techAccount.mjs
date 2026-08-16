import { z } from "zod";

/**
 * Shared by tech.mjs's ResearchTechRequestSchema and court.mjs's
 * CivicTickRequestSchema — both endpoints touch a faction's tech account
 * (see domain/tech/techAccount.mjs; domain/court's civic building
 * unlocks write to the same unlockedProperties list, see
 * domain/court/civicAccount.mjs). Was two copy-pasted inline schemas that
 * could silently drift when the account gained a field.
 */
export const TechAccountSchema = z.object({
  factionId: z.string().min(1),
  unlockedTechs: z.array(z.string()).default([]),
  techGrades: z.record(z.string(), z.number()).default({}),
  techSockets: z.record(z.string(), z.string()).default({}),
  currentOffers: z
    .record(
      z.string(),
      z.object({
        candidates: z.array(z.string()),
        rerolled: z.boolean(),
      }),
    )
    .default({}),
  techTiers: z.record(z.string(), z.number()).default({}),
  unlockedProperties: z.array(z.string()).default([]),
  researchQueue: z.array(z.string()).default([]),
});
