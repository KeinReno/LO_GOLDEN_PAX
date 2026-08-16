# Boarding & Legion/Fleet Kind Guard — Implementation Spec

Handoff spec for an implementing agent (not a design document — the design is already settled through a grill session; see the source file linked below). Written 2026-08-14, found as a side effect of designing the court-governance domain's commander/admiral postings.

**Before touching anything**: read `Golden_PAX_v0_5/CLAUDE.md` in full. Then read `server/domain/forces/README.md` and `server/domain/combat/README.md`. Then read `notes/2026-08-14-boarding-mechanic-grill.md` in full — it has the reasoning trail, including the moment the user corrected an over-broad "mixed force" claim mid-grill (turned out not to be a real bug) and the moment `resolveExchange`'s degenerate-ground-stats problem was discovered.

This is **entirely new design, not a GMap port** — GMap has no boarding mechanic at all. Say so explicitly in every new file's header, same discipline as every other file in this project.

**No dependency on any other pending spec** — this is self-contained to `domain/forces`/`domain/combat`/`server/api/routes/forces.mjs`. Safe to build first, independently, in parallel with anything else.

---

## The bug this fixes

`server/db/schema.sql`'s `forces` table already has a real `kind TEXT NOT NULL DEFAULT 'fleet' -- 'fleet' | 'legion'` column, set correctly at raise time (`server/api/routes/forces.mjs`'s raise route: `kind: body.kind === "ship" ? "fleet" : "legion"`). Every force is homogeneous by construction — the raise route always creates a fresh one-group force from a single `kind`, so a mixed-composition force is not currently possible through the API.

But `engage()` (same file, the `/forces/:forceAId/engage` route) never checks `forceA.kind !== forceB.kind` before calling `domain/combat/resolveExchange.mjs`. A legion (ground units, `defense`/`speed`/`damage`/`hp` stats only) can currently engage a fleet (ships, `damage`/`armor`/`shields`/`accuracy`/`hp`) through the normal combat path — `resolveExchange` is stat-shape generic (works via `rolePower`/`combat_matchups.json`), but ground units are missing `accuracy`/`armor`/`shields` entirely, so they'd get zeroed against those axes: a fake, always-losing blowout, not a modeled result.

---

## Part 1: the guard

### What to build

- In `server/api/routes/forces.mjs`'s `engage` route, before calling `resolveExchange`, add a check: if `forceA.kind !== forceB.kind`, reject with a clear error (e.g. `400 { error: "cross_kind_engage_not_allowed" }`) **unless** the request is a boarding action (see Part 2 — boarding is the one deliberate exception, routed through a different function entirely, not through this same route with a flag).
- Put the actual `kind`-comparison logic in `domain/forces/engage.mjs` (a small exported function, e.g. `canEngage(forceA, forceB)`), not inline in the route — this project's CLAUDE.md rule 3: routes are thin HTTP layers, domain owns rules.

### Tests

Unit test in `engage.test.mjs` proving same-kind engage is unaffected and cross-kind is rejected. Live-verify via a small smoke script (follow the pattern of `scripts/smokeForcesP2P3.mjs`): raise one legion and one fleet, attempt `engage` between them, confirm 400.

---

## Part 2: boarding

### Settled design

1. **Crew, not ship stats.** Every ship carries a militia-shaped defending crew — boarding resolves as attacking legion infantry vs. defending crew infantry, both sides sharing the same stat axes (`damage`/`defense`/`hp`/`speed`), reusing `resolveExchange`/`casualties.mjs` **unmodified**. This sidesteps the degenerate-zero problem entirely rather than patching around it.
2. **Crew is real recruitment, not a floating formula.** Raising a ship also pays a real population cost for its crew — mirrors `domain/forces/recruits.mjs`'s existing militia-cost mechanic (same file, same pattern: `mobilizableRecruits`/`populationCostForRaise`). `crewCount` is computed and **persisted on the force's composition group at raise time** (add a `crewCount` field to the group object built in `recruitment.mjs`'s `raiseUnit`, alongside `defId`/`tier`/`roles`/`count`), not derived on the fly at boarding time.
   - First-pass formula: `crewCount = tier × crewPerTier`, new content constant `content/core/economy_balance.json`'s `forces` block gets `crewPerTier: 5` (first-pass, propose-and-confirm, document as such).
   - Crew combat stats: reuse `content/core/units.json`'s `unit.militia` stats **verbatim** — zero new content needed.
3. **Boarding is triggered as its own action**, not a flag on the normal engage route — e.g. a new route `POST .../forces/:legionForceId/board` with `{ targetFleetForceId }` in the body. Validates: `legionForceId`'s force has `kind === "legion"`, target has `kind === "fleet"`, both present in the same system context (same trust-the-caller pattern the normal engage route already uses for `spaceObjectCombatModifier` — caller supplies `systemId`, no independent location tracking exists in this project, don't invent one here).
4. **Resolve**: build a synthetic defending composition group from the target fleet's `crewCount` (`{ defId: "unit.militia", count: crewCount, ...militiaStats }`), call `resolveExchange(legionForce.composition, [syntheticCrewGroup], opts, content)` — same function, unmodified, just fed a synthetic defender.
5. **Contingent engagement** — the crew doesn't always fight to the death defending a lost cause. Give the crew `stance: "retreat"` by default in the `resolveExchange` opts. `resolveExchange` already has a real retreat rule (`stanceB === "retreat" && powerB < powerA * 0.8` → the side disengages without a fight). Reuse this verbatim — no new formula. (Practically: if the crew is heavily outmatched, they don't fight; otherwise, normal exchange.)
6. **Legion wins → capture.** The fleet's `factionId` transfers to the attacker. `forcesStore.mjs` needs a new function, e.g. `transferForceFaction(db, campaignId, forceId, newFactionId)` (doesn't exist today — `saveForce` only updates name/homePlanetId/composition). Surviving crew (after `resolveExchange`'s normal casualty application to the synthetic defending group) transfers with the fleet as-is — no re-crew cost to the attacker, and the fleet's `crewCount` on its composition group should reflect the post-battle survivor count.
7. **Legion loses → normal `casualties.mjs` losses** on the attacking legion, same shape as any other engage outcome (proportional to the 58%/42% share thresholds already in `resolveExchange`) — not a guaranteed wipeout. Persist via the existing `forceAfterExchange` (`engage.mjs`) — reuse it, don't reinvent.
8. No id/name collision handling needed — `createForce` already always mints a `randomUUID()` when raising, this was checked and is a non-issue.

### What to build (files)

- `domain/forces/recruitment.mjs`: extend `raiseUnit`'s group construction to include `crewCount` when `kind === "ship"` (0/absent for legions — crew is a ship-only concept).
- `domain/combat/boarding.mjs` (new): `resolveBoarding(legionForce, fleetForce, content)` — builds the synthetic crew group, calls `resolveExchange`, returns the outcome plus the post-battle composition for both sides (mirrors `resolveExchange`'s own return shape where reasonable).
- `campaign/forcesStore.mjs`: add `transferForceFaction`.
- `server/api/routes/forces.mjs`: new `POST .../forces/:legionForceId/board` route — validate kinds, load both forces, call `resolveBoarding`, apply results (`forceAfterExchange` for the legion side, `transferForceFaction` + composition update for the fleet side on a legion win, normal casualty persistence on a legion loss), return the outcome.
- Content: `economy_balance.json`'s `forces` block gets `crewPerTier`.

### Explicitly deferred, not rejected

Race-dependent crewlessness (an all-drone/android faction having 0-crew, effectively unboardable ships) — ties into the still-unwired race-effects gap (see `golden_pax_tech_tree_redesign_design` memory, point 5) and the project's earlier "5 player archetypes" discussion. Do not build this now; flag it in the code header as a known future extension point if convenient, but don't implement.

### Tests

New-design unit tests for `boarding.mjs` (crew group construction, contingent-retreat behavior, capture outcome, loss outcome) and `transferForceFaction`. Live-verify via a smoke script: raise a fleet (confirm it has real `crewCount`), raise a legion on the same faction pair as an attacker, board with an overwhelming legion (confirm capture — target fleet's `factionId` changes), board with a weak legion (confirm normal legion losses, fleet stays owned by defender).

---

## How this gets checked

The user will hand this document to an implementing agent, then have the agent that wrote this spec (with full context of the codebase's history) review the result. Checks: the guard genuinely blocks cross-kind engage in all paths (not just the happy path), boarding genuinely reuses `resolveExchange`/`casualties.mjs` rather than reinventing combat math, `crewCount` is genuinely persisted (not recomputed on the fly — check this specifically, it's an easy place to cut a corner), capture genuinely transfers `factionId` in the database (not just in a response payload), full test suite still passes, and live HTTP verification with real numbers (not just "tests pass").
