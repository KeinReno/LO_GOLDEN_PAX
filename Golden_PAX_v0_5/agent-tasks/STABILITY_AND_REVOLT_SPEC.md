# Stability & Revolt — Implementation Spec

Handoff spec for an implementing agent (not a design document — the design is already settled through a grill session; see the source file linked below). Written 2026-08-14.

**Before touching anything**: read `Golden_PAX_v0_5/CLAUDE.md` in full, then `notes/2026-08-14-stability-mechanic-grill.md` in full — it has the full reasoning trail, including the correction made mid-grill (an initial claim that GMap has a working stability mechanic was wrong; a second claim that `loyalty_add` is a working precedent was also wrong).

**Hard dependencies — build these first, in this order:**
1. `BOARDING_AND_FORCE_KIND_GUARD_SPEC.md` — stage 2 of this spec reuses its crew-derivation pattern directly.
2. `COURT_AND_NPC_ROSTER_SPEC.md` — its Part 4 (modifier-stack wiring) is what produces real `stability_add` effects for this spec to consume; without it, there's nothing feeding the stability accumulator except whatever else you wire in.

Do not start this spec before both exist and are reviewed.

This is **entirely new design, not a GMap port.** Verified directly against GMap source: `stability`/`stability_add`/`revolt_risk` appear only in `modifierStack.mjs` (the channel categorizer) and `ledger.mjs` (pure display-label text formatting) — GMap never built a real stability mechanic either. Say so explicitly in every new file's header.

---

## Part 1: the stability accumulator

### Settled design

A new, simple **faction-wide** accumulator — independent of loyalty (which turned out to be equally unbuilt anywhere in this project; do not try to resurrect a full system/planet-level loyalty account as part of this, that's a separate, bigger rabbit hole touching planet state/migration, explicitly out of scope here).

- Fed by `stability_add` effects from `COURT_AND_NPC_ROSTER_SPEC.md`'s seats/postings/traits (via the same `collectCourtActiveEffects`/`buildModifierStack` pipeline — this spec adds the actual consumer for the `stability` channel that the court spec deliberately left unconsumed).
- Persisted per faction (new schema column/table — your call whether this lives on an existing faction-scoped account or a new small `faction_stability` table; follow CLAUDE.md rule 5, a real typed column, not a kv blob).
- First-pass numerics (propose a concrete formula, document as such, don't leave it unspecified): accumulation/decay rate per turn, starting value, bounds.

### What to build

`server/domain/court/stability.mjs` (new): `computeStabilityDelta(faction, courtEffects)` (applies the `stability` channel's flat total from `buildModifierStack`), `tickStability(faction, turn)` (per-turn accumulation, wired into `campaign/turn.mjs`).

---

## Part 2: the 3-stage revolt escalation

This is the core of the design — a real, user-specified escalation, not a generic "bad stability = bad stuff" number.

### Stage 1 — production debuff

When stability drops below a first threshold (first-pass number, propose and document), apply a real economy-side penalty via the modifier stack — same channel plumbing already used for everything else in this project (`production_mult`/`upkeep_mult` on the affected faction, applied through `flowIncome.mjs`'s Pass 4, same mechanism as tech/court effects).

### Stage 2 — rebel forces

When stability drops further (second threshold), hostile forces spawn from the affected planet's population.

- **Reuse `BOARDING_AND_FORCE_KIND_GUARD_SPEC.md`'s exact crew-derivation pattern**: composition built from `unit.militia`'s stats (verbatim, zero new content), count derived from the planet's population via a first-pass formula (propose one, e.g. proportional to `(populationThreshold - currentStability) × someRate`, document as such). Population is **not spent irreversibly** — it becomes the breakaway faction's starting population in Stage 3 if secession happens (it's a state transition, not a resource sink).
- **Engagement is contingent, not automatic.** Give the rebel force `stance: "retreat"` by default when a player garrison engages it — `resolveExchange` already has a real disengage rule (`<80% relative power → retreat without a fight`), reuse it verbatim, same as the boarding spec's crew does. No new formula needed here either.
- If the player has no garrison present at the affected planet/system, the rebel force simply occupies (no engage call happens at all until the player brings a force there).

### Stage 3 — secession

If unresolved (stability stays below the Stage-2 threshold for some duration, or the rebel force survives some number of turns — propose a concrete trigger, document as such), the breakaway planet/system secedes into a **real, new faction**.

- Reuse the existing (currently GM-only) faction-creation building blocks server-side: `server/campaign/campaignStore.mjs`'s `addFaction` + `seedFactionAccounts` (already used by `POST /campaign/:id/factions`) — call these directly from the revolt-resolution logic, not through the GM-only HTTP route (this is a server-triggered event, not a player/GM action).
- New faction gets: an auto-generated `id`/`name` (propose a scheme, e.g. `rebel.<planetId>.<turn>`/localized flavor name — first-pass, document), the seceding planet(s)/system(s) transferred to its ownership, starting population = the Stage-2 rebel population (survivors), and whatever race composition the planet already had.
- This is explicitly meant to open the door to later GM interaction with the breakaway faction (diplomacy, reconquest) — don't build that interaction now, just make sure the new faction is a real, normal faction entity that existing systems (diplomacy, combat, economy) can interact with naturally, not a special-cased stub.

### What to build

`server/domain/court/revolt.mjs` (new): `revoltStage(faction, planet)` (determines current stage from stability + thresholds), `spawnRebelForce(planet, content)` (crew-pattern reuse), `resolveSecession(db, campaignId, faction, planet, rebelForce)` (calls `addFaction`/`seedFactionAccounts`, transfers ownership). Wire the stage-check into `campaign/turn.mjs`'s per-turn tick.

### Explicitly NOT part of this design (kept separate on purpose)

Internal-bloc `threat` (`COURT_AND_NPC_ROSTER_SPEC.md` Part 6) stays display-only and is NOT merged into stability — this was an explicit decision made during the grill, not an oversight. Don't combine them.

### Open, first-pass numerics — propose concrete values, don't leave any of these unspecified

Stability accumulation/decay rate, Stage 1/2/3 thresholds, population→rebel-count formula, Stage-3 trigger duration, new faction's auto-naming scheme.

### Tests

New-design tests per stage: Stage 1's production debuff actually changes flow income output (before/after, same discipline as tech's `antimatter_singularity` verification), Stage 2's rebel force is genuinely built from real population + militia stats, contingent-retreat behavior (reuse the boarding spec's test pattern if that's already landed), Stage 3 genuinely creates a queryable new faction with correct ownership transfer. Live-verify end to end if feasible: drive a faction's stability down via a test fixture, confirm all 3 stages fire in the right order with real HTTP state checks.

---

## How this gets checked

The user will hand this document to an implementing agent, then have the agent that wrote this spec review the result. Checks: stage thresholds are genuinely distinct and ordered (not overlapping/ambiguous), Stage 2's rebel composition genuinely reuses the boarding crew pattern rather than reinventing it differently, Stage 3 genuinely produces a real, normal faction (test it by querying that faction through the normal faction-state API, not just checking internal state), internal-bloc threat is genuinely untouched, full test suite passes, live HTTP verification with real numbers.
