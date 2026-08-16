import { z } from "zod";

const FilterContextSchema = z.object({
  era: z.number().int().default(1),
  warCount: z.number().int().default(0),
  hasRefugees: z.boolean().default(false),
  borderWithWar: z.boolean().default(false),
  raceIds: z.array(z.string()).default([]),
  buildingIds: z.array(z.string()).default([]),
  lowLoyaltyRaceIds: z.array(z.string()).default([]),
  activeArcIds: z.array(z.string()).default([]),
});

export const RollYearlyQuestsRequestSchema = z.object({
  factionId: z.string().min(1),
  turn: z.coerce.number().int().nonnegative(),
  ctx: FilterContextSchema,
  systemIds: z.array(z.string()).default([]),
  // The faction's own record of when it last rolled — see questTick.mjs's
  // canRollYearlyQuests for why this is caller-supplied rather than
  // server-tracked state.
  lastRollTurn: z.number().int().nullable().default(null),
});

export const RollYearlyQuestsResponseSchema = z.object({
  roll: z.number().int(),
  count: z.number().int(),
  quests: z.array(z.record(z.string(), z.unknown())),
});

// .passthrough(): a quest instance (see domain/quests/quest.mjs's
// normalizeQuest/catalogQuestToInstance) carries many more fields than
// expireQuests touches (name, systemId, catalogId, choices, ...) — an
// exact-fields schema here would silently strip them from every quest in
// the response, not just the expired ones. Only the fields expireQuests
// actually reads/needs are declared; everything else passes through.
const QuestSchema = z
  .object({
    id: z.string(),
    status: z.string(),
    expiresTurn: z.number().int().nullable().optional(),
    history: z.array(z.record(z.string(), z.unknown())).default([]),
  })
  .passthrough();

export const ExpireQuestsRequestSchema = z.object({
  quests: z.array(QuestSchema),
  turn: z.coerce.number().int().nonnegative(),
});

export const ExpireQuestsResponseSchema = z.object({
  quests: z.array(z.record(z.string(), z.unknown())),
  journal: z.array(z.record(z.string(), z.unknown())),
});
