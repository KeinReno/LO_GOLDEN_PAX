# domain/quests

Yearly quest rolling (1d6 → filtered catalog picks) and expiry. Ported from `GMap/server/questEngine.mjs`, validated against `GMap/content/core/yearly_quests.json`.

**Inputs/outputs**: plain data in (catalog defs, a filter context, quest lists), plain data out (picked defs / instantiated quests / expiry results). No DB/HTTP here — `server/api/routes/quests.mjs` is the only caller.

**Multiplayer**: quests are tracked per faction; nothing here assumes a single faction's quest list is "the" quest list.

## Status: real formulas, world-derived inputs are caller-supplied — same discipline as every other domain here

What's ported **with a byte-parity test against GMap** (exported and pure in GMap, diffed directly): `filterContext.mjs`'s `matchesFilter`, `questCosts.mjs`'s `stockCostsFromEffects`, `quest.mjs`'s `normalizeQuest`, `questTick.mjs`'s `expireQuests` (reshaped from mutate-`world.quests`-in-place to return a new array).

What's ported **as a behavior test** (no GMap equivalent to diff, or non-deterministic by nature): `questTick.mjs`'s `rollRecurringQuests` (crypto randomness — bounds-tested, same treatment as `domain/combat/dice.mjs`), `selectYearlyQuestPool` (GMap had this inline inside `rollYearlyQuests`, never its own function, and its shuffle uses `Math.random`), `quest.mjs`'s `catalogQuestToInstance` (module-private in GMap).

What's a **caller-supplied input, not computed here**: `matchesFilter`'s `ctx` (era/warCount/hasRefugees/etc.) — GMap's `buildFilterContext` derives these by walking the full world (owned systems, race composition, loyalty); `catalogQuestToInstance`'s `systemId` — GMap's `pickSystemId` picks randomly from the faction's owned systems. Same "caller supplies what the unported world model would have computed" pattern as `domain/economy`'s `categoryIncome`.

Deliberately not ported: the ledger/intel/tech/faction-mutation side effects in GMap's `applyQuestEffects` and `resolveQuestChoice`/`resolveQuestDice` (granting tech, intel, recipes, loyalty, activeEffects, spending stocks via the file-backed ledger) — those are a large orchestration layer sitting on top of every other domain's unlock/spend primitives (`domain/tech`'s `researchTech`, `domain/economy`'s `adjustStock`) rather than a self-contained formula; `GMap/server/storyQuestSpawn.mjs` (story-arc quest spawning) — not attempted this pass.
