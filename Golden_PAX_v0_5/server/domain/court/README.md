# domain/court

Civic development paths (Trade + Culture) plus the court/NPC roster layered on in 2026-08-15 (`COURT_AND_NPC_ROSTER_SPEC.md`).

**Inputs/outputs**: plain data in, plain data out. No DB/HTTP here — `server/campaign/npcStore.mjs` and `server/campaign/stabilityStore.mjs` are the persistence boundaries; `server/api/routes/court.mjs` is the HTTP layer.

**Multiplayer**: every function takes an explicit faction (or `factionId`). Civic ticks still process `factions[]` without assuming its length. NPC CRUD is GM-only (master token); seating/posting/tasks are player actions on that player's faction.

## Status

Civic paths remain as before (parity-tested formulas, caller-supplied market/treaty/culture inputs).

Newly real in this folder:

- `npcRoster.mjs` — GMap `ensurePlayerRulers` / `applyRemoveNpc` / `applySetRuler`, plus new GM upsert with a required `raceId`
- `councilSeats.mjs` — verbatim GMap seat/portfolio resolution; GM lock/unlock; player seat/unseat
- `postings.mjs` — GMap assign/recall + `clearSameTarget`; commander/admiral target `forceId` (`forces.kind` already exists)
- `courtActiveEffects.mjs` — GMap `syncNpcPassiveEffects` collection, plain list out
- `npcTasks.mjs` — GMap give/tick, dice only if `linkedQuestId`, `expiresTurn` effects (default 10 turns)
- `internalBlocs.mjs` — GMap scoring formula (display-only, zero mechanical consequence). Seed is new: every template in `content/core/internal_blocs.json` when a faction has none, not GMap's crown+guest-only default
- `stability.mjs` / `revolt.mjs` — new design, not a GMap port (GMap never consumed `stability_add`). Faction-wide accumulator + 3-stage revolt. Persistence is `campaign/stabilityStore.mjs`; tick wiring is `campaign/revoltTick.mjs`.

Modifier-stack consumers wired this pass: `production_mult` (flowIncome Pass 4), `stat_mult` (resolveExchange before rolePower), `pop_growth_mult` (populationGrowth via economyTick), `npc_task_speed_mult` (task tick, direct), `stability_add` (`stability.mjs` faction-wide accumulator → 3-stage revolt in `revolt.mjs`), `move_cost_mult` (`domain/forces/movement.mjs` MP spend). Produced but not consumed: `loyalty_add` (no accumulator).

Deliberately still not ported: `GMap/server/courtProposals.mjs` (file-backed pending-edit inbox).
