# Внутренний двор / NPC-ростер: Grill / Discovery Notes
Date: 2026-08-14 · Goal: определить scope и механику для council seats / internal blocs / NPC postings / NPC traits — домен, не существующий в Golden_PAX (нет `fac.npcs[]` вообще), спортировать из GMap's `courtGovernance.mjs` + смежных кусков `narrative.mjs`.

## Summary / key decisions
(заполняется по ходу)

## Q&A log

### Q1 — NPC origin (how NPCs come to exist)
- Asked: GMap never creates NPCs procedurally — only via GM tool `courtProposals.mjs` (811-line file-backed pending-edit inbox). How do NPCs get into Golden_PAX?
- Captured: **Прямой GM CRUD** — minimal create/edit/remove NPC action, gated to master token, same pattern as GM already creating factions/systems/planets in `campaign.mjs` today. NOT the full file-backed proposal-inbox workflow (that stays deferred, same reasoning as `courtProposals.mjs`/`diploOffers.mjs`).
- Flags: none.

### Q2 — commander/admiral posting target (legion vs fleet split)
- Asked: GMap's commander/admiral postings target `legionId`/`fleetId` separately. Golden_PAX's `domain/forces` only has one `forceId` concept — how to adapt?
- Captured: resolved via a side-investigation, not a direct pick from the offered options. `forces` table already has a real `kind: 'fleet'|'legion'` column, set correctly at raise time — no adaptation needed. **Two postings (commander→legion, admiral→fleet), both target `forceId`**, GMap's real split maps 1:1 since `force.kind` already exists.
- Side effects found along the way (own grill, `notes/2026-08-14-boarding-mechanic-grill.md`): `engage()` had zero cross-kind guard (legion could fight fleet through the degenerate ground-stat path) — fixed by adding a `forceA.kind !== forceB.kind` guard, with boarding built as the one deliberate exception (new mechanic, not a port — see that file's Summary for the full design: crew-as-militia, capture-on-win, casualties-on-loss).
- Flags: the boarding build itself (engage() guard + `forcesStore.mjs` faction-transfer function + boarding resolve function) is not yet implemented — decided, not built.

### Q3 — NPC task system scope for this pass
- Asked: dice-roll court tasks (`court_tasks.json`, `linkedQuestId`, `dice.mjs`'s `rollNpcTaskProgress`) — in this pass alongside seats/blocs/postings, or a separate later follow-up?
- Captured: **Включить сейчас** — all four subsystems (roster, seats, blocs, postings, tasks) ship in this build. User explicitly chose the larger-scope option over the phased recommendation.
- Flags: none.

### Q4 — NPC race field
- Asked: GMap's `npc` has no `raceId` field at all, only `raceLeadership.raceId` as a narrow flag for race-caucus bloc leadership. Add a real `raceId` to every NPC in Golden_PAX, or keep it GMap-narrow?
- Captured: **Добавить raceId сразу** — every NPC gets a real raceId field, not just race-caucus leaders. Ties into `races.json` and the still-open race-effects gap ([[golden_pax_tech_tree_redesign_design]]) and today's boarding-crew "race-dependent crewlessness" flag.
- Flags: none.

### Q5 — internal bloc threat/support consequence
- Asked: verified in GMap source that `influence/support/threat` are never consumed anywhere outside `courtGovernance.mjs` itself (only clamped 0-100 by `normalizeWorld.mjs`) — purely a GM-facing display number, no mechanical effect. Keep it that way, or give Golden_PAX's version a real consequence?
- Captured: **Как в GMap — только дисплей**. Exact behavior port, no new consequence mechanic. Scoring formula still real/testable, just not wired to trigger anything.
- Flags: none.

### Q6 — modifier-stack wiring for council/posting/trait effects
- Asked (after a wrong first framing — see correction below): which of the 7 real effect channels used by court content (`production_mult`, `stat_mult`, `loyalty_add`, `stability_add`, `pop_growth_mult`, `move_cost_mult`, `npc_task_speed_mult`) get a real consumer this pass?
- Investigated before asking: `channelKey` in `modifierStack.mjs` already categorizes ALL of these (ported wholesale from GMap), but only `production:*`/`upkeep:*` (economy) and `combat_role:*` (Tech Tree 2.0's new addition, NOT plain `stat:*`) have a real downstream reader today. Confirmed via grep: **"stability" as a game concept exists NOWHERE in Golden_PAX** (only the channel-categorizer knows the word). Confirmed via grep: **no fleet-movement/travel system exists anywhere** — `move_cost_mult` has nothing to attach to, same root gap as the `links`/adjacency schema already flagged twice ([[golden_pax_galaxy_migration_design]], [[golden_pax_tech_tree_redesign_design]]).
- Captured: **Строить оба сейчас** — user wants a real stability mechanic AND a minimal fleet-movement/adjacency system built now, as part of/alongside this court pass, not deferred. This is a significant scope expansion beyond court itself — decided explicitly, not by default. The other 5 channels (production_mult, stat_mult→wire into resolveExchange alongside combat_role_mult, loyalty_add→reuse cultureFaith.mjs's existing pattern, pop_growth_mult→populationGrowth.mjs, npc_task_speed_mult→self-contained in the task tick) have clean existing attachment points, no new sub-systems needed.
- Flags: **stability mechanic** design (what it is, what it gates, first real use: `revolt_risk` channel already exists in `channelKey` as a plausible consumer) — needs its own short grill. **System-adjacency schema + minimal fleet movement** — needs its own grill, matches the exact gap flagged twice before; resolving it now also unblocks the previously-deferred Military power-projection piece from [[golden_pax_tech_tree_redesign_design]] as a side benefit.

## Open flags (pending input)
- Minimum NPC schema/fields beyond raceId (status, traitIds, posting, councilSeat, blocId, isBlocLeader, currentTask) — mostly direct ports from GMap, not yet explicitly enumerated/confirmed.
- **Stability mechanic** — new sub-design needed, not yet started.
- **System-adjacency schema + minimal fleet movement** — new sub-design needed, not yet started, has cross-project payoff (also unblocks Military power-projection).
- Boarding mechanic (see `notes/2026-08-14-boarding-mechanic-grill.md`) is designed but not implemented.
- None of this pass (roster/seats/blocs/postings/tasks/stability/movement/boarding) is implemented in code yet — all decided, not built.
