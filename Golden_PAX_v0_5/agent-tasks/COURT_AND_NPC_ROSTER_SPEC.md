# Court & NPC Roster — Implementation Spec

Handoff spec for an implementing agent (not a design document — the design is already settled through a full grill session; see the source file linked below). Written 2026-08-14.

**Before touching anything**: read `Golden_PAX_v0_5/CLAUDE.md` in full. Then read `server/domain/court/README.md` (explains what's already real: the Trade+Culture civic-path system) and `server/domain/economy/modifierStack.mjs`'s header comment (explains the current Phase-1-only scope of the modifier stack — this spec expands that scope). Then read `notes/2026-08-14-court-governance-grill.md` in full — it has the reasoning trail for every decision below, including two corrections made mid-grill (an incorrect claim that `loyalty_add` is a working precedent, and the discovery that "stability" doesn't exist as a real mechanic anywhere).

This is **entirely new design layered on top of a partial GMap port** — GMap's `courtGovernance.mjs` (council seats, internal blocs, NPC postings/traits/tasks) was never ported here at all. Where you port GMap behavior verbatim, say so in the file header (same discipline as everywhere else in this project); where you're building something new (the NPC roster's existence/CRUD, the modifier-stack wiring), say that too.

**Dependency note**: [[golden_pax_stability_revolt_design]]'s spec (`STABILITY_AND_REVOLT_SPEC.md`, not yet written at the time of this spec) depends on this one — its stage-1 production debuff and its whole `stability_add` accumulator only exist because this spec's postings/seats produce that effect. Build this one first, or at least its Part 4 (modifier-stack wiring).

---

## Part 1: the NPC roster (new domain concept — nothing like this exists yet)

### Settled design

1. **NPC origin is direct GM CRUD.** Create/edit/remove NPC actions, gated to master token — same pattern as GM already creating factions/systems/planets in `server/api/routes/campaign.mjs`. This is explicitly NOT GMap's `courtProposals.mjs` (an 811-line file-backed pending-edit inbox) — that stays deferred, same reasoning `domain/court/README.md` already gives for not porting it.
2. **Minimum NPC fields** (direct ports from GMap's real `npc` shape, verify against `GMap/server/courtGovernance.mjs` and `GMap/server/narrative.mjs` before finalizing): `id`, `name`, `status` (`active`/`away`/`busy`/`dead`/`hidden`), `traitIds[]`, `posting` (`{ kind: "court"|"governor"|"commander"|"admiral", sinceTurn, systemId?, forceId? }` — GMap uses `legionId`/`fleetId` separately, Golden_PAX uses one `forceId` since the `forces` table already has a real `kind` column, see Part 3), `councilSeat` (id or null), `blocId` (id or null), `isBlocLeader` (bool), `isPlayerRuler` (bool), `currentTask` (see Part 5), and — **new, not in GMap** — a real `raceId` field (GMap only has this narrowly as `raceLeadership.raceId` for race-caucus bloc leaders; every NPC gets one here).
3. **Schema**: new `npcs` table (real typed columns, not a JSON blob — CLAUDE.md rule 5), scoped by `campaign_id`/`faction_id`. `traitIds`/`currentTask` can be JSON columns (small, always-together lists, same reasoning as `forces.composition_json`) but `id`/`name`/`status`/`raceId`/`councilSeat`/`blocId`/`postingKind`/`postingTargetId` should be real columns since they're queried/filtered on.
4. **Ruler auto-assignment**: port GMap's `ensurePlayerRulers` logic verbatim (resolves `rulerNpcId` from `isPlayerRuler`/seated-at-`seat.ruler`, locks that NPC on the throne, clears the flag on any other NPC). This is directly portable behavior, not a design fork.

### What to build

- `server/campaign/npcStore.mjs` (new, following the `*Store.mjs` pattern — the only DB boundary for this domain): CRUD functions.
- `server/domain/court/npcRoster.mjs` (new): `ensurePlayerRulers`, any pure validation logic (e.g. can't remove the current ruler without confirming a new one — check GMap's `applyRemoveNpc`/`applySetRuler` for the exact real rules).
- `server/api/routes/court.mjs` (extend or create): GM-only create/edit/remove routes.
- Schema migration in `server/db/schema.sql`.

### Tests

New-design tests for CRUD + `ensurePlayerRulers`'s sync logic (ruler reassignment, clearing the flag off a removed/dead NPC).

---

## Part 2: council seats & portfolios

### Settled design

Real, existing content: `content/core/council_seats.json` — 9 seats (`seat.ruler` + 5 advisor seats + `seat.at_large`), 10 portfolios. A seat occupied by an available NPC → real `factionEffects` from the seat's assigned portfolio (or the seat's own fallback effects if no portfolio assigned). Port GMap's real resolution chain verbatim: `resolveSeatPortfolioId` (assigned portfolio or catalog default) → `getPortfolioDef` → `resolveOccupiedSeatBonus` (portfolio effects preferred, seat effects as fallback). Seat lock/unlock (`seat.at_large`'s `defaultUnlocked: false`) is a manual GM action (unlock/lock council seat), consistent with the GM-CRUD philosophy from Part 1 — no new automatic unlock-trigger system needed.

### What to build

`server/domain/court/councilSeats.mjs` (new — port of GMap's `courtGovernance.mjs` seat-related functions): `ensureFactionCouncil`, `resolveSeatPortfolioId`, `getPortfolioDef`, `resolveOccupiedSeatBonus`, `isSeatUnlocked`, `unlockCouncilSeat`, `lockCouncilSeat` (verbatim ports, say so in the header). Routes for GM to unlock/lock seats and assign a portfolio to a seat, and for a player to seat/unseat an NPC on an unlocked seat they control (mirrors GMap's `applySeatNpcCouncil`/`applyUnseatNpcCouncil` intent handlers — this is a real player action, not GM-only).

---

## Part 3: governor / commander / admiral postings

### Settled design

GMap targets `legionId`/`fleetId` separately for commander/admiral. **Verified during the grill: Golden_PAX's `forces` table already has a real `kind: 'fleet'|'legion'` column** (set correctly at raise time) — no adaptation needed. Two postings (`commander`→any force with `kind: "legion"`, `admiral`→any force with `kind: "fleet"`), both target `forceId`. `governor`→`systemId` (unchanged from GMap, Golden_PAX already has systems). Port GMap's real content-driven posting resolution: `content/core/npc_postings.json` (3 postings — governor/commander/admiral, each with `systemEffects`/`legionEffects`/`fleetEffects` on the target plus a weaker `factionEffects` echo). A posted NPC can't also hold the throne (`isPlayerRuler` check, port verbatim) and can't be posted while busy on a task (see Part 5).

**Real gameplay hook to port**: `npcLoyaltyDeltaForSystem`-equivalent — governor posting includes an `ungovernedLoyaltyPenalty` (from `npc_postings.json`) applied when an owned, populated system has no governor. This feeds into whatever loyalty mechanic exists (see Part 4's correction note — loyalty isn't real yet either; this can be built as a flagged effect that's produced but not yet consumed, same honest-scope-cut discipline as tech's `currency.metal` gap).

### What to build

`server/domain/court/postings.mjs` (new): `assignPosting(npc, kind, targetId, faction, turn)` (validates: not the ruler, not busy, clears any other NPC already holding that same target — port `clearSameTarget`'s logic verbatim), `recallPosting`, `postingEffects(npc, content)`. Routes for a player to assign/recall a posting on their own NPCs.

---

## Part 4: modifier-stack wiring — the part that makes all of the above matter

**This is the section most likely to get half-done — do not skip channels because they seem hard.** Council seats, postings, and NPC traits (Part 6) all produce real effects across **7 distinct channels**, verified via `modifierStack.mjs`'s `channelKey`: `production_mult`, `stat_mult`, `loyalty_add`, `stability_add`, `pop_growth_mult`, `move_cost_mult`, `npc_task_speed_mult`. `channelKey` already categorizes all 7 (ported wholesale from GMap) — the gap is that only `production:*`/`upkeep:*` and `combat_role:*` (Tech Tree 2.0's addition) have a real downstream consumer today.

Build a real consumer for each of these 5, in this pass:

1. **`production_mult`** → already has a home: `domain/planets/flowIncome.mjs`'s Pass 4 (the same pass tech effects use). Add a `collectCourtActiveEffects(faction, content)` function (new, mirrors `techModifierEffects.mjs`'s `collectTechModifierEffects` shape) that gathers faction-scope effects from occupied seats/postings/traits, feed it into the same `buildModifierStack` call alongside tech effects (merge channels — `mergeChannels` already exists in `modifierStack.mjs` for exactly this).
2. **`stat_mult`** (plain, NOT `combat_role_mult` — a different channel) → new consumer needed in `domain/combat/resolveExchange.mjs`/`roleMatchups.mjs`, alongside the existing `combat_role_mult` consumption. Read how `combat_role_mult` is threaded through (`combatRoleChannels` in `resolveExchange.mjs`) and add a parallel path for the generic `stat:${stat}` channel (e.g. `stat:damage`, `stat:defense`) applying a flat multiplier to the relevant stat before power calculation.
3. **`pop_growth_mult`** → `domain/planets/populationGrowth.mjs` already exists as a real domain function — thread faction-scope court effects into it the same way tech effects thread into economy income.
4. **`npc_task_speed_mult`** → self-contained within Part 5's task-progress tick, doesn't need the general modifier stack at all — just read the relevant effect directly when computing `rollNpcTaskProgress`'s multiplier.
5. **`stability_add`** → do NOT build a consumer for this in this spec. It's the subject of a separate, dependent spec (`STABILITY_AND_REVOLT_SPEC.md`) — just make sure `stability_add` effects are correctly *produced* by seats/postings/traits and correctly categorized by `channelKey` (already true, no code change needed there), so the stability spec has real effects to consume when it lands.
6. **`move_cost_mult`** → do NOT build a consumer for this in this spec either. It's the subject of `SYSTEM_ADJACENCY_AND_MOVEMENT_SPEC.md` (admiral posting effects reference it, but there's no movement system yet — same "produced, not yet consumed" honest scope cut).

**Correction, read before starting**: `loyalty_add` was initially assumed to be a working precedent (via `domain/narrative/cultureFaith.mjs`) — checked more carefully during the grill and it turns out `cultureFaith.mjs` only *produces* a plain effect list, nothing in this project persists/accumulates a loyalty value anywhere (`schema.sql` has zero `loyalty` columns, `domain/combat/README.md` explicitly says "no loyalty-driven garrison defection (needs system/planet loyalty)"). **Do not build a loyalty consumer as part of this spec either** — it needs the same kind of new-accumulator design work as stability, and is explicitly out of scope here (flagged as a known gap, not silently ignored — document it in the code header where `loyalty_add` effects get produced).

### What to build

- `server/domain/court/courtActiveEffects.mjs` (new): `collectCourtActiveEffects(faction, npcs, content)` — walks occupied seats + active postings + NPC traits, returns a flat effect list with proper `source` attribution (mirrors GMap's `syncNpcPassiveEffects`'s effect-collection shape, reshaped to plain-data-in-plain-data-out per this project's domain convention).
- Wire into `flowIncome.mjs` (production_mult), `resolveExchange.mjs`/`roleMatchups.mjs` (stat_mult), `populationGrowth.mjs` (pop_growth_mult).

### Tests

Behavior tests proving each of the 3 real consumers (production/combat-stat/pop-growth) actually changes its output when a seat/posting effect is present vs. absent — same "before vs. after" live-verification pattern used for `tech.antimatter_singularity` in the tech audit.

---

## Part 5: NPC tasks

### Settled design

Included in this pass (not deferred). Port GMap's dice-roll mechanic verbatim: `rollNpcTaskProgress` (1d6: 1-2→0.6x progress, 3-4→1x, 5-6→1.4x). A task has `startedTurn`/`etaTurn`/`progress`/`effects`/optional `linkedQuestId`. Per-turn tick: `progress += (1/duration) * diceMult` (dice only applies if `linkedQuestId` is set — port this exact condition, don't apply dice universally). On completion, `task.effects` get applied as **temporary, expiring** faction effects — reuse the `expiresTurn` pattern that already exists in `domain/diplomacy/treaties.mjs` (don't invent a new expiring-effect shape), default duration matching GMap's `ACTIVE_EFFECT_DEFAULT_TURNS = 10` unless you have reason to change it (flag if you do). `linkedQuestId` ties into this project's real `domain/quests` — advance the linked quest on task completion (check `domain/quests`'s existing API for the right hook, likely something quest-progress-advancing that already exists for other trigger types).

### What to build

- `server/domain/court/npcTasks.mjs` (new): `giveNpcTask` (validates: NPC exists, not busy, not dead/hidden, not currently posted away from court — port `applyGiveNpcTask`'s validation verbatim), `tickNpcTasks(faction, turn)` (the per-turn progress/completion loop, wired into `campaign/turn.mjs`'s per-turn orchestration).
- `npc_task_speed_mult` (Part 4, point 4) applied here directly.

### Tests

New-design tests: dice multiplier distribution (not a single-roll assertion), task completion applies effects with correct `expiresTurn`, linked quest advances on completion, busy/dead/hidden NPCs can't be given tasks.

---

## Part 6: internal blocs

### Settled design

**Stay GMap-parity display-only.** Verified in GMap source directly (`normalizeWorld.mjs`, `courtProposals.mjs`) that `influence`/`support`/`threat` are never consumed by any mechanical system in GMap either — only clamped 0-100 for schema safety and shown to the GM. Port the real scoring formula (`recomputeInternalBlocs`'s influence-from-NPC-assignments logic, stance→support/threat conversion) faithfully — it's real, testable math — but **do not** wire it into any consequence (not into stability, not into anything else). This was an explicit decision, not an oversight: keeping blocs and the new stability mechanic (separate spec) as two independent concerns.

### What to build

`server/domain/court/internalBlocs.mjs` (new, port of GMap's bloc-scoring functions): `ensureInternalBlocs` (seed from `content/core/internal_blocs.json`'s 11 bloc templates), `recomputeInternalBlocs` (the influence/support/threat formula, verbatim port). Expose via whatever route already returns full faction state, for GM display only.

### Tests

Parity-style behavior tests for the scoring formula (weight-per-seat/leadership/posting, stance-based support/threat conversion) — verify against the real GMap source values, not invented numbers.

---

## How this gets checked

The user will hand this document to an implementing agent, then have the agent that wrote this spec review the result. Checks: Part 4's modifier-stack wiring is the single most important thing to verify carefully — a seat/posting effect that's produced but never consumed by any of the 3 in-scope channels (production/combat-stat/pop-growth) is a silent no-op bug, exactly the class of gap this whole feature exists to close. Also check: `stability_add`/`move_cost_mult`/`loyalty_add` are honestly left unconsumed (not half-wired), internal blocs genuinely have zero mechanical consequence (not accidentally hooked into something), NPC roster CRUD is genuinely GM-only (not player-accessible), full test suite passes, live HTTP verification with real numbers.
