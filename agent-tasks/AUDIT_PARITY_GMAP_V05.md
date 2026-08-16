# Comprehensive Parity & Invariants Audit: GMap vs Golden_PAX_v0_5

> **Audit Date:** 2026-08-16  
> **Scope:** Deep comparison between implemented runtime code in `GMap/server/` and `GMap/content/` against the canonical design specifications and discovery logs in `Golden_PAX_v0_5/agent-tasks/*_SPEC.md` and `Golden_PAX_v0_5/notes/*-grill.md`.  
> **Target Areas:**
> 1. Revolt & Stability
> 2. Boarding & Force Kind Guard
> 3. Currency Peg & Resource Extraction
> 4. Planet Slot Grades & Colonization
> 5. Movement & Fuel MP
> 6. RoleScores & Development Paths

---

## Executive Summary

| Area | Status | Key Findings |
|---|---|---|
| **1. Revolt & Stability** | 🟡 **YELLOW** | Core 3-stage mechanics (40/25/3 turns, 0.85 prod mult, `unit.militia`, `rebel.<planet>.<turn>`) are cleanly ported, but a **critical runtime ReferenceError** exists: undefined `standDown()` is called in `GMap/server/stabilityRevolt.mjs:501, 544`. Also, population is deducted permanently upon spawn vs being held as breakaway citizens. |
| **2. Boarding & Force Kind Guard** | 🟢 **GREEN** | Flawless parity. Cross-kind engage guard rejects legion vs fleet without boarding; crew recruitment is formula-backed (`tier × 5` pop deducted); boarding resolves via `resolveEngagementFight` with `stance: "retreat"`; fleet capture and surviving crew transfer match spec exactly. |
| **3. Currency Peg & Resource Extraction** | 🟢 **GREEN** | Full parity. Deposit extraction requires matching building; labor slot multipliers respected; GM peg clamp enforced to `[0.8, 1.5]`; population-scaled ambient D/E (`D[1] += max(1, ceil(pop*0.6))`, `E[1] += max(1, ceil(pop*0.5))`) correctly replaces old flat baseline; primary demand resolved before secondary allocation; dual-track diplomacy (political vs economic) prevents treaty collisions. |
| **4. Planet Slot Grades & Colonization** | 🟢 **GREEN** | Full parity. Earned surface (8→48) and orbital (4→12) grades 1–5 enforced; starting grades derived from existing building count; colonization strictly deducts settlers and proportional race composition from source planet ("no pop from thin air"). |
| **5. Movement & Fuel MP** | 🟢 **GREEN** | Full parity. Additive MP layer over hop topology; engine tier defines max hop radius; fuel tier defines MP budget; MP consumed per hop modified by `move_cost_mult`; MP fully refilled on turn tick across all forces. |
| **6. RoleScores & Development Paths** | 🟢 **GREEN** | Full parity. 8 closed RoleScores (`structural`, `energy`, `offensive`, `defensive`, `mobility`, `cognitive`, `biological`, `exotic`); per-turn accumulation `Σ extracted * max(1, tier)` permanently accumulated; breakthrough techs require RoleScore ≥ 5000 and remain paid cognitio unlocks (never silent auto-unlocks). |

---

## 1. Revolt & Stability Audit

### Files Audited
- `GMap/server/stabilityRevolt.mjs`
- `GMap/server/stability.mjs`
- `GMap/server/loyalty.mjs`
- `GMap/server/revolt.mjs`
- `GMap/server/economyTick.mjs`
- `GMap/docs/STABILITY_REVOLT_STAGES.md`
- **Specs & Notes:** `Golden_PAX_v0_5/agent-tasks/STABILITY_AND_REVOLT_SPEC.md`, `Golden_PAX_v0_5/notes/2026-08-14-stability-mechanic-grill.md`

### Invariant & Specification Verification

| Metric / Invariant | Spec Target | GMap Implementation | Status |
|---|---|---|---|
| **Meter Scope & Range** | Meter 0–100, starting 50 | `STABILITY_START = 50`, `STABILITY_MIN = 0`, `STABILITY_MAX = 100` (`stabilityRevolt.mjs:16-18`) | 🟢 PASS |
| **Natural Decay** | −1 per turn | `STABILITY_NATURAL_DECAY = -1` (`stabilityRevolt.mjs:19`) | 🟢 PASS |
| **Stage 1 Threshold** | Stability < 40 | `STABILITY_STAGE1_THRESHOLD = 40` (`stabilityRevolt.mjs:20`) | 🟢 PASS |
| **Stage 1 Production Mult** | 0.85 modifier | `STABILITY_STAGE1_PROD_MULT = 0.85` applied in `economyTick.mjs:736-749` via `collectRevoltProductionEffects` | 🟢 PASS |
| **Stage 2 Threshold** | Stability < 25 | `STABILITY_STAGE2_THRESHOLD = 25` (`stabilityRevolt.mjs:21`) | 🟢 PASS |
| **Stage 2 Production Mult** | 0.75 modifier | `STABILITY_STAGE2_PROD_MULT = 0.75` (`stabilityRevolt.mjs:24`) | 🟢 PASS |
| **Rebel Pop Share** | 20% deficit-scaled | `rebelCount = pop * 0.2 * (deficit / 25)` (`stabilityRevolt.mjs:200-209`) | 🟢 PASS |
| **Rebel Force Composition** | `unit.militia` synthetic group | `syntheticCrewGroup(lostPop, militia)` (`stabilityRevolt.mjs:256`) | 🟢 PASS |
| **Rebel Stance** | `stance: "retreat"` | Explicitly `stance: "retreat"` (`stabilityRevolt.mjs:271, 463`) | 🟢 PASS |
| **Secession Duration** | 3 turns after Stage 2 spawn | `STABILITY_STAGE3_DURATION_TURNS = 3`, `turn >= stage2SinceTurn + 3` (`stabilityRevolt.mjs:22, 444`) | 🟢 PASS |
| **Secession Faction ID** | `rebel.<planetId>.<turn>` | `rebelFactionId(planetId, turn)` → ``rebel.${planetId}.${turn}`` (`stabilityRevolt.mjs:211-213`) | 🟢 PASS |
| **Loyalty Decoupling** | Loyalty is independent; `< 20` loyalty drains −2 stability | `LOYALTY_COLLAPSE_THRESHOLD = 20`, `LOYALTY_COLLAPSE_DRAIN = -2` applied in `stabilityLoyaltyDelta` (`stabilityRevolt.mjs:27-28`, `stability.mjs:29-37`) | 🟢 PASS |

### Gaps, Edge Cases & Discrepancies Found

#### 🔴 Defect 1.1: Unhandled ReferenceError on `standDown`
- **Location:** `GMap/server/stabilityRevolt.mjs:501` and `GMap/server/stabilityRevolt.mjs:544`
- **Description:** In `spawnAndMaybeEngage` (line 501) when rebels are wiped out by a garrison, and in `applyPlanetRevolt` (line 544) when stability recovers above Stage 2 (`band < 2`), code invokes `standDown(world, planet)`. However, `standDown` is **not defined** anywhere in `stabilityRevolt.mjs` or imported from another module.
- **Impact:** Any planet revolt recovery or instant garrison suppression in production throws an uncaught `ReferenceError: standDown is not defined` during `processTurn.mjs`.
- **Remedy:** Implement `clearRevoltFields(planet)` / cleanup logic or define `standDown(world, planet)` helper in `stabilityRevolt.mjs`:
  ```js
  function standDown(world, planet) {
    clearRevoltFields(planet);
    // Optionally prune orphan rebel factions
  }
  ```

#### 🟡 Divergence 1.2: Population Deduction Model (Permanent Loss vs Breakaway Pool)
- **Location:** `GMap/server/stabilityRevolt.mjs:255`
- **Description:** In `Golden_PAX_v0_5/server/domain/court/revolt.mjs`, the spec notes: *"Population is not spent — it becomes the breakaway faction's starting population at Stage 3."* In `GMap/server/stabilityRevolt.mjs:255`, population is deducted immediately from `planet.population` upon rebel spawn (`planet.population = pop - lostPop`). If the garrison suppresses the revolt, that population is permanently lost rather than returned or reintegrated.
- **Architectural Note:** `GMap/docs/STABILITY_REVOLT_STAGES.md` explicitly calls this out as an intentional GMap override (*"spawn militia from spent population (GMap override: not thin air)"*), but the discrepancy between the two specifications must be formally acknowledged by the design team.

---

## 2. Boarding & Force Kind Guard Audit

### Files Audited
- `GMap/server/boarding.mjs`
- `GMap/server/forceKindGuard.mjs`
- `GMap/server/forceRecruit.mjs`
- `GMap/server/engagements.mjs`
- `GMap/server/forceMovement.mjs`
- `GMap/server/combatResolve.mjs`
- **Specs & Notes:** `Golden_PAX_v0_5/agent-tasks/BOARDING_AND_FORCE_KIND_GUARD_SPEC.md`, `Golden_PAX_v0_5/notes/2026-08-14-boarding-mechanic-grill.md`

### Invariant & Specification Verification

| Metric / Invariant | Spec Target | GMap Implementation | Status |
|---|---|---|---|
| **Cross-Kind Engage Guard** | Legion vs Fleet combat prohibited | `canEngage(forceA, forceB)` returns `{ ok: false, error: "cross_kind_engage_not_allowed" }` if `a.kind !== b.kind` (`forceKindGuard.mjs:25-33`) | 🟢 PASS |
| **Crew Recruitment Formula** | `crewCount = tier × crewPerTier` (default 5) | `crewCountForRaise` calculates `count * Math.max(1, tier) * crewPerTier` (`forceKindGuard.mjs:11-23`) | 🟢 PASS |
| **Crew Population Deduction** | Ship recruitment deducts crew + hull population | In `forceRecruit.mjs:125-139`, `recruitAsk = n + crewCount` is deducted from `planet.population` | 🟢 PASS |
| **Boarding Prerequisites** | Attacker is legion, Defender is fleet, same system | `canBoard(legionForce, fleetForce)` verifies `legion.kind === "legion"`, `fleet.kind === "fleet"`, `legion.systemId === fleet.systemId` (`boarding.mjs:20-33`) | 🟢 PASS |
| **Defending Crew Shape** | Crew represented as militia stats | `syntheticCrewGroup(crewCount, militiaDef)` creates temporary infantry group (`boarding.mjs:62-74`) | 🟢 PASS |
| **Boarding Resolution** | Uses standard exchange engine | Reuses `resolveEngagementFight` with `stance: "retreat"` on defending crew (`boarding.mjs:120-143`) | 🟢 PASS |
| **Legion Win / Capture** | Fleet transferred to attacker, surviving crew attached | On legion victory (`outcome === "win_a"` or `retreat_b`), `fleet.factionId = legion.factionId` and surviving crew is updated (`boarding.mjs:144-156`) | 🟢 PASS |
| **Legion Loss / Casualties** | Normal casualties applied to attacking legion | Combat losses directly mutate legion composition (`boarding.mjs:160-165`) | 🟢 PASS |

### Assessment: 🟢 PERFECT PARITY
No discrepancies found. Edge cases (zero crew fallback, total wipeout of attacking legion, mixed fleet compositions) are properly handled.

---

## 3. Currency Peg & Resource Extraction Audit

### Files Audited
- `GMap/server/currencyPeg.mjs`
- `GMap/server/depositExtract.mjs`
- `GMap/server/ambientFlow.mjs`
- `GMap/server/economicTrack.mjs`
- `GMap/server/economyTick.mjs`
- `GMap/server/opinionTick.mjs`
- **Specs & Notes:** `Golden_PAX_v0_5/agent-tasks/CURRENCY_PEG_SPEC.md`, `Golden_PAX_v0_5/notes/2026-08-13-currency-peg-grill.md`, `Golden_PAX_v0_5/notes/2026-08-14-ambient-flow-economy-grill.md`

### Invariant & Specification Verification

| Metric / Invariant | Spec Target | GMap Implementation | Status |
|---|---|---|---|
| **Deposit Gating** | Named extraction requires matching extractor building | `canExtractDeposit(bDef, resId, resDef)` in `depositExtract.mjs:26-38` checks `extractsDeposits`, `extractsCategory`, or matching building `category` | 🟢 PASS |
| **Labor Slots Multiplier** | Extraction scaled by staffed labor slots | `planetLaborExtractionMultiplier` scales extraction by assigned population / labor cap (`depositExtract.mjs:40-47`) | 🟢 PASS |
| **Ambient Flow Grounding** | Population-grounded: `D[1] += max(1, ceil(pop*0.6))`, `E[1] += max(1, ceil(pop*0.5))` | `AMBIENT_ENERGIA_PER_POP = 0.6`, `AMBIENT_BIOS_PER_POP = 0.5`, formula in `applyAmbientDE` (`ambientFlow.mjs:12-25`) | 🟢 PASS |
| **Allocation Order Independence** | Primary demand satisfied before secondary allocation | Two-pass conversion implemented: `applyFlowConvertPrimary` handles primary flows, `reconcileSecondaryDemand` resolves secondary/catalysts without order dependency (`ambientFlow.mjs:27-142`) | 🟢 PASS |
| **GM Peg Multiplier Clamp** | Clamp within `[0.8, 1.5]` | `GM_PEG_MULT_MIN = 0.8`, `GM_PEG_MULT_MAX = 1.5`, `clampGmPegMultiplier` (`currencyPeg.mjs:27-33`) | 🟢 PASS |
| **Non-Linear Dominance Rate** | `rate = baseRate * (share ^ 1.5) * rarity * gm` | `PEG_DOMINANCE_K = 1.5`, calculated in `pegExchangeRate` (`currencyPeg.mjs:26, 172-205`) | 🟢 PASS |
| **Peg Switch Lag** | 3 turns linear ramp (starts at 0.5) | `PEG_TRANSITION_START = 0.5`, `PEG_TRANSITION_TURNS = 3`, `pegTransitionMultiplier` (`currencyPeg.mjs:24-25, 149-165`) | 🟢 PASS |
| **Dual-Track Diplomacy** | Economic relations (barter, exchange deal, currency union) coexist with political treaties | `TRACK_POLITICAL` & `TRACK_ECONOMIC` separated; `syncTreatiesFromEdge` respects `(pair, track)` keying (`economicTrack.mjs:1-180`, `opinionTick.mjs:17-45`) | 🟢 PASS |

### Assessment: 🟢 PERFECT PARITY
All core math, edge-case allocations, and diplomatic separation invariants match canonical specifications completely.

---

## 4. Planet Slot Grades & Colonization Audit

### Files Audited
- `GMap/server/planetGrade.mjs`
- `GMap/server/colonizePop.mjs`
- `GMap/server/planetActions.mjs`
- `GMap/server/normalizeWorld.mjs`
- **Specs & Notes:** `Golden_PAX_v0_5/agent-tasks/CURRENCY_AND_FORCES_INTEGRATION_SPEC.md`

### Invariant & Specification Verification

| Metric / Invariant | Spec Target | GMap Implementation | Status |
|---|---|---|---|
| **Surface Slot Progression** | 5 grades: 8 → 18 → 28 → 38 → 48 | `DEFAULT_SURFACE_SLOTS = [8, 18, 28, 38, 48]` (`planetGrade.mjs:14`) | 🟢 PASS |
| **Orbital Slot Progression** | 5 grades: 4 → 6 → 8 → 10 → 12 | `DEFAULT_ORBITAL_SLOTS = [4, 6, 8, 10, 12]` (`planetGrade.mjs:15`) | 🟢 PASS |
| **Max Grade Clamp** | Grade capped at 5 | `MAX_GRADE = 5`, `clampGrade(n)` (`planetGrade.mjs:13, 29-32`) | 🟢 PASS |
| **Upgrade Cost Scaling** | Formula / balance backed cost | `gradeUpgradeCost` / `orbitalGradeUpgradeCost` (`planetGrade.mjs:80-108`) | 🟢 PASS |
| **Starting Grade Derivation** | Derived from existing building count on load | `smallestGradeForSurfaceSlots` and `smallestGradeForOrbitalSlots` in `normalizeWorld.mjs` ensure legacy capitals/colonies do not lose buildings | 🟢 PASS |
| **No Pop from Thin Air** | Colonization requires population transfer from source planet | `transferColonizePopulation` requires source planet, deducts settlers, and transfers proportional `raceComposition` (`colonizePop.mjs:16-56`) | 🟢 PASS |

### Assessment: 🟢 PERFECT PARITY
The earned grade progression and colonization pop-conservation invariants are fully respected.

---

## 5. Movement & Fuel MP Audit

### Files Audited
- `GMap/server/forceMp.mjs`
- `GMap/server/forceMovement.mjs`
- `GMap/server/processTurn.mjs`
- **Specs & Notes:** `Golden_PAX_v0_5/agent-tasks/SYSTEM_ADJACENCY_AND_MOVEMENT_SPEC.md`, `Golden_PAX_v0_5/notes/2026-08-14-system-adjacency-grill.md`

### Invariant & Specification Verification

| Metric / Invariant | Spec Target | GMap Implementation | Status |
|---|---|---|---|
| **Engine Hop Range** | Fleets scale range with `engineTier`, Legions use standard hop radius | `resolveEngineRangeHops(force, content)` checks `force.engineTier` (falls back to `DEFAULT_LEGION_RANGE_HOPS = 1` or `rules.forces.rangeHops`) (`forceMp.mjs:26-44`) | 🟢 PASS |
| **Fuel MP Pool** | Max MP derived from `fuelTier` (e.g. tier × 2 + base) | `maxMovementPoints(force, content)` derives max MP from `force.fuelTier` (`forceMp.mjs:46-60`) | 🟢 PASS |
| **MP Cost Per Hop** | 1 MP per hop modified by `move_cost_mult` | `movementPointsForHops(force, hops, mult)` applies `Math.max(1, Math.ceil(hops * mult))` (`forceMp.mjs:78-90`) | 🟢 PASS |
| **Affordability Check** | Move rejected if distance > engine range or hops > MP pool | `assertMoveAffordable(force, hops, mult, content)` validates both hops ≤ engine range and cost ≤ MP (`forceMp.mjs:92-106`, `forceMovement.mjs:106-114`) | 🟢 PASS |
| **Turn Refill** | MP refilled to max passively every turn | `refillAllForces(world, content)` executes during `processTurn.mjs:2003-2004` (`forceMp.mjs:126-140`) | 🟢 PASS |

### Assessment: 🟢 PERFECT PARITY
All movement constraints and resource pools operate cleanly without breaking GMap's underlying hop graph topology.

---

## 6. RoleScores & Development Paths Audit

### Files Audited
- `GMap/server/roleScores.mjs`
- `GMap/server/techPaths.mjs`
- `GMap/server/economyTick.mjs`
- `GMap/content/core/map_resources.json`
- `GMap/content/core/role_milestones.json`
- `GMap/content/core/tech_paths.json`
- **Specs & Notes:** `Golden_PAX_v0_5/notes/2026-08-13-technologies-paths-economy-grill.md`, `GMap/docs/TECH_PATHS_PLAN_v06.md`

### Invariant & Specification Verification

| Metric / Invariant | Spec Target | GMap Implementation | Status |
|---|---|---|---|
| **8 Closed RoleScores** | `structural`, `energy`, `offensive`, `defensive`, `mobility`, `cognitive`, `biological`, `exotic` | `ROLE_IDS = Object.freeze([...])` in `roleScores.mjs:14-23` matches the 8 closed roles | 🟢 PASS |
| **RoleScore Tick Formula** | `Σ extracted * max(1, tier)` permanently accumulated | `applyRoleScores` iterates extraction and multiplies by `Math.max(1, tier)` (`roleScores.mjs:52-84`) | 🟢 PASS |
| **Unspendable Accumulator** | RoleScores are never consumed as currency | Read-only threshold checks; no operations decrease `eco.roleScores` (`roleScores.mjs`, `techPaths.mjs`) | 🟢 PASS |
| **Breakthrough Gate** | Requires RoleScore ≥ threshold (5000) before researchable | `checkPathGate` checks `score < need` and blocks queueing (`techPaths.mjs:91-108`) | 🟢 PASS |
| **Paid Cognitio Unlock** | Breakthrough is not a silent auto-unlock; requires paid cognitio research | Verified by `techPaths.mjs:86-116` & `roleScores.test.mjs:167-249`; researching breakthrough applies `open_path` effect (`technologies.json`) | 🟢 PASS |
| **No Race Locks** | Paths provide cost affinities, never hard race bans | `applyPathResearchAffinity` applies multiplier from `tech_paths.raceAffinity`, never locking out other factions (`techPaths.mjs:166-184`) | 🟢 PASS |

### Assessment: 🟢 PERFECT PARITY
RoleScore mechanics, resource tagging, and breakthrough gating adhere strictly to the design contract.

---

## Detailed Summary of Recommended Fixes

### Priority 1 (Blocker / Bug)
1. **Fix Missing `standDown` in `GMap/server/stabilityRevolt.mjs`**
   - **File:** `GMap/server/stabilityRevolt.mjs`
   - **Action:** Add the missing `standDown` definition:
     ```js
     export function standDown(world, planet) {
       clearRevoltFields(planet);
       if (planet.revolt?.rebelFactionId) {
         pruneEmptyRebelFaction(world, planet.revolt.rebelFactionId);
       }
     }
     ```
   - **Verification:** Add a unit test in `stabilityRevolt.test.mjs` that triggers `spawnAndMaybeEngage` with an overwhelming garrison, ensuring `standDown` executes without throwing.

### Priority 2 (Design Alignment)
2. **Clarify Population Dissolution vs Staging in Revolt**
   - **File:** `GMap/server/stabilityRevolt.mjs` vs `Golden_PAX_v0_5/server/domain/court/revolt.mjs`
   - **Action:** Confirm whether suppressed rebels should restore their lost population to the planet (e.g. `planet.population += rebelsRemaining`), or if permanent population loss is the intended mechanic for GMap.
