# Tech Tree 2.0 — Implementation Spec

Handoff spec for an implementing agent (not a design document — the design is already settled through two full grill sessions; see the source files linked in each section). Written 2026-08-14, after the same-day tech-tree audit (tier-gate, raceLock, modifier-stack Phase 1 for tech effects) and a long freeform Stellaris-inspired redesign conversation.

**Before touching anything**: read `Golden_PAX_v0_5/CLAUDE.md` in full — this project has hard rules (faction always explicit, ~400-600 line file cap, `server/domain/*` never touches DB/HTTP, content not code, tests before "done", `server/campaign/*Store.mjs` is the only DB boundary). Then read `server/domain/tech/README.md` and `server/domain/planets/README.md` before editing inside those folders. Then read, in full, both source design files — they contain the *why* behind every decision below, including places the user directly redirected the assistant's first proposal:
- `notes/2026-08-14-tech-tree-audit.md` — the baseline this spec builds on (what's already fixed).
- `notes/2026-08-14-tech-tree-redesign-grill.md` — the full reasoning trail for everything in this spec.

Every existing domain file's header comment states plainly whether it's a byte-parity port of `../GMap/server/*.mjs`, a behavior-derived port, or new design not present in GMap at all — follow the same discipline for anything new here: **all of Tech Tree 2.0 is NEW DESIGN, not a GMap port** (GMap has no offer/reroll system, no tech grading, no resource sockets — say so explicitly in every new file's header). Where you reuse an *existing* GMap-ported mechanism (e.g. `unlock_property`, `combat_matchups.json`), say that explicitly too, and verify its current behavior by reading the actual code — don't guess what a mechanism does from its name.

Test discipline already established in this codebase, keep following it:
- New design (everything here) gets a normal unit test with "NOT a port" in the header, same as `server/domain/planets/planetGrade.mjs` or `server/domain/forces/recruits.mjs` do.
- After wiring something into `server/campaign/turn.mjs`, a route, or `researchTech.mjs`, **run the whole suite** (`npx vitest run` from `Golden_PAX_v0_5/`) and then **verify live**: start `node server/serve.mjs`, hit the real HTTP API with a small Node script (see `scripts/playtestCampaign.mjs`, `scripts/smokePriority4.mjs` for the pattern). **Unit tests passing is not sufficient proof of correctness for anything that touches shared state (the flows grid, a persisted techAccount, the offer system's random draw)** — this project has twice found real, live-only-verifiable bugs this way (an ordering bug in the flow engine, a starvation bug in ambient resources) — do the same discipline here, especially for the offer/reroll system's persisted state and the modifier-stack-adjacent pieces.

**Scope note**: content authoring (redesigning the 387 catalog-stub techs, writing real Diplomacy/Governance content from scratch, naming/balancing everything) is explicitly a separate, later, incremental effort — NOT part of this spec. Build the mechanics below against small, real, hand-written fixture techs (a handful per priority, enough to prove the pipeline) — do not attempt to author all 432 techs' final content as part of this work.

---

## Priority 0 (do first, everything else assumes it): tech grading replaces the dead upgrade system

**The problem**: `techAccount.unlockedUpgrades` (persisted, `faction_tech.unlocked_upgrades_json` in schema.sql) has no research action anywhere — `resolveTechDef.mjs` only resolves top-level `content.technologies[id]`/`content.tech_combos[id]` keys, never a nested `def.upgrades[].id`. This field has been permanently empty since the domain was ported. **Do not try to fix the old upgrade system** — it's being replaced, not repaired.

### Settled design

1. One progression axis per gradeable tech: `grade` 1→5, mirrors `server/domain/planets/planetGrade.mjs`'s exact shape (grade counter + real purchase cost per step + a magnitude-per-grade table). Read that file before starting — copy its pattern (`clampGrade`, a `slotTable`-style content lookup with a documented first-pass fallback array, `gradeUpgradeCost`, an `upgradeX` action that affords+spends+bumps the counter).
2. Not every tech is gradeable — some stay flat one-shot unlocks (e.g. anything whose only effect is `unlock_tech_tier`/`unlock_property`). This is a per-tech content flag (e.g. `gradeable: true` + a `gradeTable` on the def), not a mechanics decision — the code needs to support both shapes gracefully (a tech with no `gradeTable` simply has no grade action available).
3. The old `.efficiency`/`.austerity`/`.feature` upgrade content shape and the `unlockedUpgrades` account field both go away. Don't keep them around as dead compatibility shims — CLAUDE.md's "no half-finished implementations, no backwards-compat hacks for things you can just change" applies. Update `faction_tech`'s schema column (`unlocked_upgrades_json` → repurpose or replace with `tech_grades_json TEXT NOT NULL DEFAULT '{}'`), `techStore.mjs`, `techAccount.mjs`'s `defaultTechAccount`, and the zod contract in `server/api/contract/techAccount.mjs`. Grep the whole repo for `unlockedUpgrades`/`unlocked_upgrades` before considering this done — every reference needs to be intentionally updated, not left dangling.

### What to build

- `server/domain/tech/techGrade.mjs` (new): `factionTechGrade(techAccount, techId)` (defaults to 1 if unlocked but ungraded, 0/null if not researched at all — your call, document it), `gradeEffectMagnitude(def, grade)` (reads the tech's `gradeTable` content, same first-pass-default-array pattern as `planetGrade.mjs`'s `DEFAULT_SURFACE_SLOTS`), `gradeUpgradeCost(currentGrade, def)`, `upgradeTechGrade(techAccount, techId, stocks, content)` — afford-check via `canAffordCost` (already exists, `domain/tech/afford.mjs`), spend via `adjustStock`, bump the grade counter, return `{ ok, techAccount, stocks, journal }` or an error, same shape as `planetGrade.mjs`'s `upgradeSurfaceGrade`.
- The grade needs to actually change the tech's *effective* effect magnitude wherever that tech's effects get read — that's currently `domain/tech/techModifierEffects.mjs`'s `collectTechModifierEffects` (feeds `domain/economy/modifierStack.mjs`, wired into `flowIncome.mjs`'s Pass 4). Update `collectTechModifierEffects` to scale each effect's `args.mult`/`args.amount` by `gradeEffectMagnitude(def, currentGrade)` instead of using the def's raw, ungraded effect args directly. Read `flowIncome.mjs`'s Pass 4 comment before touching this — it's a live, tested, working pass, don't break its existing behavior for non-gradeable techs (which should behave exactly as before, grade defaulting to a no-op multiplier of 1).
- New route (extend `server/api/routes/campaign.mjs`'s pattern, likely near the `/research` route): `POST .../factions/:factionId/tech/:techId/upgrade-grade` — same actor/auth pattern as every other persisted action (`requireActor`/`actorCanActForFaction`).
- `server/api/contract/techAccount.mjs` and `campaign.mjs` contract: replace `unlockedUpgrades` field with `techGrades: Record<techId, number>` (or similar), update `TechAccountSchema`.

### Tests

Unit tests for `techGrade.mjs` (new design, say so), a `techModifierEffects.test.mjs` (currently only has a parity test — add a *behavior* test proving grade actually scales the effect magnitude, since this is new). Live-verify: research a gradeable fixture tech, check its economy effect at grade 1 vs. after upgrading to grade 3, same before/after comparison pattern used for `tech.antimatter_singularity` in the audit.

---

## Priority 1: resource-slot sockets

### Settled design

1. A tech can declare a `socket` — a small content lookup from resource id → the structural effect that resource produces when slotted (e.g. `socket: { "resource.solarite": { swapUpkeepCurrency: {...} }, "resource.biofuel": { swapUpkeepCurrency: {...} } }` — exact effect shape is your call, but it needs to be able to express a *structural* change, not just a numeric one; the settled example is "swap which currency a whole building class draws upkeep from").
2. Filling/refilling is **instant, one-time spend, permanent until replaced** — not an ongoing drain, no lapse risk. Exactly like a grade purchase: pay once, effect holds. Replacing an already-filled socket with a *different* resource costs the new resource's own defined price again (swapping isn't free, but there's no recurring cost to simply keeping the current one filled).
3. Socket state is per-tech-instance on the faction's `techAccount` (which resource, if any, is currently slotted) — not per-building, not per-planet. The user's own framing: "все экстракторы у игрока" (**all** of a faction's extractors) — this is an empire-wide structural rule change tied to having researched+socketed that tech, not a local one.

### What to build

- `server/domain/tech/techSocket.mjs` (new): `fillTechSocket(techAccount, techId, resourceId, stocks, content)` — validates the resource is a valid option for that tech's `socket` content, afford-check + spend (reuse `canAffordCost`/`adjustStock`), updates `techAccount.techSockets[techId] = resourceId`, returns the updated account/stocks/journal. Refilling with a different resource is the same function — no special-case "must be empty first" check, since the design explicitly allows overwrite-for-a-price.
- Schema: `faction_tech` needs a new `tech_sockets_json TEXT NOT NULL DEFAULT '{}'` column. Update `techStore.mjs`/`techAccount.mjs`/contract accordingly.
- **Applying the structural effect** is the harder half — where does "extractors draw bios instead of energia" actually get consumed? This is a change to `domain/planets/flowContribution.mjs`'s `addUpkeepDemand` (reads `def.upkeep_slots[].require.category` today) — you'll need to pass the faction's `techAccount` (or a pre-resolved "active socket effects" list) down into `flowContribution.mjs`'s functions and have `addUpkeepDemand` consult it before deciding which category a building's upkeep slot actually demands from. **Read `flowContribution.mjs`'s full header before touching it** — it already has three explicit, documented deviations from GMap; a fourth deviation for socket-driven upkeep-category swaps needs the same treatment (explicit, documented, not silent). This is a real, non-trivial change to a file that's central to the ordering-bug and contention-bug lessons already learned twice this session — go slowly, live-verify.

### Open implementation decisions (recommended defaults, flag for revisit)

- Which techs get sockets at all, and what resources are valid for each — content-authoring decision (Q1's redesign work), not yours to invent broadly; build 2-3 real fixture examples to prove the pipeline (the extractor example from the grill is a good one to actually implement).
- Socket fill/refill cost — first-pass default, propose a number per resource type, document as such.

### Tests

New-design unit tests for `techSocket.mjs`. A `flowContribution`/`flowIncome` behavior test proving a socketed tech actually changes which currency a building class's upkeep demand hits — same live-verification discipline as everything else touching the flows grid.

---

## Priority 2: direction taxonomy (content tagging — small, but Priority 3 depends on it)

### Settled design

Six **player-facing** directions, replacing raw A-F category as the offer-grouping axis (A-F stays the real internal economy mechanic, unchanged): **Industry** (unifies all 6 current A-F economy categories into one lane — the RPS chain already ties them together, the player doesn't need 6 separate economy offers), **Military**, **Culture**, **Commerce**, **Diplomacy**, **Governance** (society/internal politics). Every tech needs a `direction` field (new content field) to participate in the offer system.

### What to build

- Add `direction` (one of the 6 ids, e.g. `"industry"|"military"|"culture"|"commerce"|"diplomacy"|"governance"`) to a **handful of real fixture techs** across `content/core/technologies.json` — enough to prove Priority 3's offer system end-to-end per direction (recommend: tag the 45 real backbone techs by direction now, since they already have real effects; Industry techs are the current A-F backbone, tag a couple of real Military/Culture/Commerce techs found during the audit — e.g. `tech.war_economy.doctrine`→military, `tech.technocracy.ai_research`→industry or governance, your judgment — leave everything else untagged/`catalogPending` for the later content pass).
- This is content work, not a new domain module — just make sure `resolveTechDef`/`researchTech.mjs`/wherever reads tech defs doesn't choke on techs that lack a `direction` (treat missing `direction` as "not currently offerable," consistent with catalog techs staying blocked from research entirely per the existing `catalogPending` check).

---

## Priority 3: offer/reroll acquisition, with a paid bypass

### Settled design

1. Each turn (or on-demand — your call whether offers regenerate per-turn automatically or are computed lazily on read; recommend lazy-on-read + persisted-once-generated, to avoid surprising a player with a re-roll they didn't ask for), a faction has a **persisted current offer**: 3 candidate tech ids per direction, drawn from that direction's "frontier" (techs where every prerequisite is in `unlockedTechs`, the tech itself is not, it has a `direction` tag, and it's not `catalogPending`).
2. **1 reroll per offer-slot** (per direction's current 3-candidate set, not per individual candidate, not unlimited) — replaces the *entire* 3-candidate set for that direction with a fresh draw, consumes a one-time flag until the offer next regenerates (i.e. until something in that direction gets researched).
3. **Hybrid with a paid bypass**: researching a tech NOT currently in its direction's offer is still allowed if its prerequisites are met, at a real cognitio premium — same pattern as `domain/forces/recruitment.mjs`'s `overrideCeiling` (`opts.overrideCeiling`, `OVER_CEILING_POPULATION_MULT = 1.5`). Recommend a similar named constant here, e.g. `OFFER_BYPASS_COGNITIO_MULT = 1.5`, first-pass, document as such.
4. After a successful research (whether via the offer or the bypass), that direction's offer regenerates from the new frontier.

### What to build

- Schema: `faction_tech` needs `current_offers_json TEXT NOT NULL DEFAULT '{}'` (shape: `{ [direction]: { candidates: [techId,techId,techId], rerolled: boolean } }`).
- `server/domain/tech/techOffers.mjs` (new): `frontierTechs(techAccount, content, direction)` (prereqs satisfied, not researched, tagged with this direction, not catalogPending — reuse `firstMissingPrerequisite`'s logic style from `prerequisites.mjs`, don't reinvent prereq-checking), `rollOffer(techAccount, content, direction, rng)` (samples up to 3 from the frontier — fewer than 3 if the frontier is smaller, this WILL happen often until the catalog-content redesign lands, handle gracefully not as an error), `rerollOffer(techAccount, content, direction, rng)` (only if not already rerolled this cycle), `ensureOffers(techAccount, content)` (lazily fills in any direction with no current offer or an offer containing now-researched/now-unreachable techs).
- `researchTech.mjs`: add the offer/bypass check. If the tech is in its direction's current offer, research proceeds at normal cost. If not, still allowed (prereqs permitting) but at `cost * OFFER_BYPASS_COGNITIO_MULT` for the cognitio portion specifically (other cost currencies unchanged — your call if that's right, but cognitio is the resource this whole system gates on, so it's the natural premium target). After success, call `ensureOffers`-equivalent logic to regenerate that direction's offer.
- New routes: `POST .../factions/:factionId/tech/offers/:direction/reroll`, and expose current offers via whatever route already returns full faction state (`GET .../state` or similar — check `campaign.mjs`'s existing state route).

### Tests

New-design tests for `techOffers.mjs` (frontier computation, offer rolling respects direction+prereqs+catalogPending, reroll consumes the one-time flag, regeneration after research). Live-verify with real content: create a faction, check its Industry offer contains 3 real backbone techs, reroll once and confirm the set changes and a second reroll is refused, research one and confirm the offer regenerates.

---

## Priority 4: race identity → offer-weighting

**Depends on Priority 3 (offers must exist to weight).**

### Settled design

A faction's race/civic identity biases which frontier candidates are *more likely* to be sampled into the offer — not guaranteed, not exclusive, a real weighted draw. This was chosen over two alternatives (passive empire-wide `collectRaceEffects` application, tactical per-tech trait-socketing) — those are **not rejected, just not this pass** — don't build them speculatively.

### What to build

- Techs need a race/civic alignment tag to weight against (new content field, e.g. `raceAffinity: ["race_swarm"]` or reuse the existing `tags` array with `race_*`/`trait.*` prefixed entries — 3 real techs already have `tags: ["race_swarm"]`-shaped tags from the raceLock system found in the audit, so there's a real precedent to extend rather than invent from scratch).
- `techOffers.mjs`'s `rollOffer` needs a weighting step: given the faction's dominant race(s) (reuse `domain/planets/raceComposition.mjs`'s `factionRaceCounts` — already exists, already used for raceLock — don't recompute race share a different way) and/or faction doctrine (no `faction.traits` data model exists yet, per the audit — **do not build faction-doctrine weighting without that data model existing first**, race-only weighting is in scope, doctrine-based weighting is not), boost the sampling odds of frontier candidates whose `raceAffinity` matches.

### Open implementation decisions

- Exact weighting strength (how much does a match multiply a candidate's odds — recommend something like 2-3x weight, first-pass, document as such) and whether alignment is binary tag-match or graduated by race-share-percent. Propose a default, confirm/tune later.

### Tests

New-design test proving a Swarm-majority faction's Industry offer includes swarm-tagged fixture techs at a statistically higher rate than a non-Swarm faction's, across many rolls (a distribution test, not a single-sample assertion — flakiness risk if you assert on one roll).

---

## Priority 5: Military mechanics

Three sub-pieces, can be built independently of each other and of Priorities 0-4 (only shares the `researchTech.mjs`/`techModifierEffects.mjs` files, so coordinate if running in parallel with Priority 0).

### 5a. Unit/ship unlocks gated by tech

Right now `domain/forces/recruitment.mjs`'s `canRaiseUnit` checks ONLY building access (`systemHasShipyard`/`systemHasBarracks`) and `raisableWithoutBuilding` — **zero tech check exists**. Add one, same shape as this morning's `domain/planets/construction.mjs` tier-gate addition: `canRaiseUnit(system, planet, def, kind, factionId, techAccount)` — if `def.requiresTech` is set (new content field on `units.json`/`ships.json` entries), check `techAccount.unlockedTechs.includes(def.requiresTech)`, block with a clear error if not. Omitting `techAccount` should behave as "nothing researched" (same safe-default convention as `construction.mjs`'s tier-gate), not a bypass. Update the `/forces` route in `server/api/routes/forces.mjs` to load and pass the real `techAccount`, same pattern as this morning's `/build` route change.

### 5b. Weapon-type equipment slots

**Verify before designing**: `slots[]` on unit/ship/building defs (`{ role, require: { properties, tier }, count }`) is currently **not consumed anywhere in `domain/`** — confirmed by grep, it's descriptive content only, likely a GMap concept that was never wired even there. Read `GMap/server/planetActions.mjs`/`GMap/server/forcesActions.mjs` (or wherever GMap actually resolves `slots`) to see if GMap itself has real slot-filling logic before assuming this project should invent one from scratch — **do not guess, verify**. If GMap has no real runtime consumption of `slots` either, this sub-priority is genuinely new design end to end: decide whether "weapon type" should be a real equipped-item system (bigger) or simply a `unlock_property` that a specific weapon-tier property id (`"weapon.plasma"` etc.) grants, with units/ships authored (content pass, not this spec) to require specific weapon properties instead of the generic always-available `"weapon"` base property. Flag your finding and chosen approach clearly in the code header either way.

### 5c. Anti-role combat bonuses

`domain/combat/roleMatchups.mjs`/`combat_matchups.json` already implements a real, tested rock-paper-scissors (11 roles). Add a new tech effect type, e.g. `combat_role_mult: { role: "armor", mult: 1.15 }`, consumed by `domain/economy/modifierStack.mjs`'s channel vocabulary (add a `channelKey` case: `combat_role_mult` → `combat_role:${role}`) and applied in `roleMatchups.mjs`'s power calculation for the relevant side when their opponent's forces include that role. Read `roleMatchups.mjs` and `resolveExchange.mjs` fully before modifying — this is real, tested, load-bearing combat math, go slowly, add tests before changing behavior, live-verify with `scripts/smokeForcesP2P3.mjs`-style engage checks.

### Tests

Per sub-piece: 5a needs a `recruitment.test.mjs` addition + live HTTP check (tech-gated unit blocked pre-research, allowed after). 5b's tests depend entirely on which approach you land on after the GMap verification step. 5c needs a `roleMatchups.test.mjs`/`resolveExchange.test.mjs` addition proving the bonus actually changes engagement outcomes, plus a live engage check.

---

## Explicitly OUT OF SCOPE for this pass — do not start

**Cross-system power-projection** (system defense installations, ships attacking an adjacent system via the corridor graph). This was raised during the redesign grill but has a **real, unresolved schema dependency**: system adjacency (`links`, `x`/`y` position, `sectors`) doesn't exist anywhere in `server/db/schema.sql` yet. This was already flagged and deferred once, in `notes/2026-08-13-galaxy-migration-grill.md`'s "Schema gaps" section, and picking it up needs its own design pass (how does an `engage`-style route even address a target in a different system? does a planetary defense object reuse `domain/planets/spaceObjects.mjs`'s shape or need something new?) before any code gets written. **If you reach this point, stop and flag it rather than inventing a schema.**

**387-tech content redesign, full Diplomacy/Governance content authoring, alchemy wiring (`tech_combos.json`/`tech_recipes.json`), passive/tactical race-trait application** — all explicitly deferred per the design notes, not part of this handoff.

---

## How this gets checked

The user will hand this document to another implementing agent, then have me (the agent that wrote this spec, with full context of the codebase's history and every design decision behind it) review the result. When reviewing, I will check: every new-design claim actually says so honestly in its header (no silently-invented "port" claims), the full test suite still passes, no dead code was left behind (the old `.efficiency`/`.austerity`/`.feature`/`unlockedUpgrades` shape should be genuinely gone, not left as unused clutter), and live-verify the new mechanics through the real HTTP API the same way every prior stage in this project was verified — not just "tests pass." I will also specifically check that the "explicitly out of scope" section was actually respected.
