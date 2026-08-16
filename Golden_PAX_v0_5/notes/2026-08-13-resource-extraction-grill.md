# Resource Extraction (Flow Engine): Grill / Discovery Notes

Date: 2026-08-13 · Goal: extract the user's real design intent for how resource deposits/extraction should work in Golden_PAX_v0_5, before porting GMap's flow engine — explicitly deferred from the 2026-08-12 population/forces grill session.

## Summary / key decisions

(reconciled TL;DR after Q1-Q6 — Stage 1's design is fully settled, ready to implement)

**1. Deposits (Q1):** `planet.resources`/`system.resources` — plain `map_resources.json` id arrays, manually GM-authored via the worldgen API (`resources: string[]` on `POST .../systems`/`.../planets`), same as GMap's map-editor-driven data. Procedural biome-based generation is wanted as a near-term follow-up, not built yet.

**2. Staging (Q2):** the ~2000-line flow engine port breaks into 5 stages, extraction first: (1) deposits+raw extraction, (2) the RPS cycle (6 categories, edges, bottleneck rule), (3) `flow_convert` buildings, (4) structure/upkeep slots, (5) modifier stack. Each stage working+tested before the next.

**3. Labor model (Q3) — explicit deviation from GMap:** GMap's real flow engine uses `biosLaborScale` (faction-wide currency.bios stock scaling, 0.25x-1x by threshold) to gate all extraction/production. This project replaces it everywhere with the job-slots system already built (`domain/planets/laborAllocation.mjs`) — real per-planet population, real per-building `laborSlots`. One unified labor model across yield_flat AND flow-engine mechanics, not two parallel ones. No new content needed (`laborSlots` already exists on all 58 buildings).

**4. Stage 1 concretized (Q4-Q6):** deposits produce category currency directly (A->currency.extracta, F->currency.cognitio, etc.) — no RPS conversion yet, that's Stage 2. **Deposits require a matching building to extract** (another explicit GMap deviation, Q5) — GMap extracts for free with no building, but that breaks the "nothing is free" principle this whole design has built toward since the population/forces grill. A building "matches" a deposit by **same `category` field** (Q6) — both buildings and deposits already carry an A-F category from `economy_schema.json`'s scheme, no new content field needed. The matching building's `laborSlots` gates the yield via the same `allocateLabor` staffing fraction buildings already use.

**Implementation status (2026-08-13, updated): Stages 1-4 built and verified; Stage 5 out of scope by design.**

- Stage 1 (deposits + gated extraction): built, then **superseded** by Stage 2 — see below (Stage 1's `extraction.mjs`/`buildingYields.mjs` computed currency directly, which can't coexist with real RPS conversion; both files were deleted once Stage 2 replaced them).
- Stages 2-4 (RPS cycle, `flow_convert` buildings, upkeep slots) turned out to be **one inseparable unit**, not three sequential stages — GMap's own `computeFlowBreakdown` runs all of it as 3 ordered passes (extraction+ambient → buildings → upkeep) across every planet, and that's what got built: `domain/economy/flowEngine.mjs` (byte-parity tested core: categories, RPS edges, bottleneck rule, `computeNets`/`categoryTotals`/`bottlenecks` — all exported+pure in GMap, diffed directly) + `domain/planets/flowContribution.mjs` (per-planet extraction/building/upkeep feeders, behavior-ported with the two already-agreed deviations: building-gated extraction, job-slots instead of `biosLaborScale`) + `domain/planets/flowIncome.mjs` (`computeFactionFlowIncome`, the 3-pass orchestrator, wired into `campaign/turn.mjs`).
- **A real bug was caught by live verification, not by unit tests**: an early version bundled all 3 passes into one per-planet function, so a converter on one planet could run before the ambient D/E energy bonus (added once, after all planets, in the real design) existed in the grid — a `materia.smelter` silently converted nothing because its secondary energy input was starved. Fixed by restructuring into 3 explicit global passes (`addPlanetExtraction`/`addPlanetBuildingFlows`/`addPlanetUpkeepDemand`, called in 3 separate loops over every planet) matching GMap's real pass order exactly. A regression test (`flowIncome.test.mjs`) now covers this specific ordering requirement.
- Stage 5 (modifier stack) stays explicitly out of scope — cross-cutting, not economy-specific, already an accepted gap across every other domain in this project.
- Verified live end-to-end twice: once confirming the no-converter case matches the old Stage 1 numbers exactly (regression-free), once confirming a real A→B conversion chain (`materia.smelter`) actually trades extracta for materia and creates a real energy-tier deficit from its own upkeep — matching the tradeoff design explained to the user beforehand.
- 206 tests passing project-wide (was 210 before Stage 1's files were deleted and replaced with fewer, more powerful Stage 2 tests).

## Q&A log

### Q1 — where do a new planet/system's deposits come from, when GM-created through this project's API?

- Asked: (my recommendation) manual GM input, matching GMap exactly — `POST .../systems`/`.../planets` accepts a `resources: string[]` field, no generation logic at all. Alternative offered: procedural generation from `map_resources.json`'s `biome_tags`, matching the planet's biome (reusing the same matching logic `biomeMatch.mjs`/`buildingAccess.mjs` already use for buildings).
- Captured: user picked manual input for now, but explicitly flagged procedural biome-based generation as wanted soon — "пока 1, но по факту надо добавить 2" (1 for now, but we should really add 2).
- Decided: **for this pass**, `resources: string[]` is a manual field on system/planet creation, GM-authored, same as GMap. Procedural biome-based generation is accepted in principle as a near-term follow-up, not built this session.
- Flags: procedural biome-based deposit generation -> real follow-up, not yet scheduled as its own stage.

### Q2 — how do we break the ~2000-line flow engine port into stages?

- Asked: (my recommendation) 5 stages — (1) deposits (`planet.resources`) + raw extraction (`addPlanetExtraction`), (2) the RPS cycle itself (6 categories, edges, bottleneck rule), (3) `flow_convert` buildings as inputs/outputs inside a category, (4) building structure/upkeep slots (resource requirements to operate), (5) the modifier stack. Each stage a working, tested result before the next.
- Captured: user confirmed the recommendation as-is.
- Decided: staged port, extraction first. Order: deposits+extraction -> RPS cycle -> flow_convert buildings -> structure/upkeep slots -> modifier stack.

### GMap baseline check (assistant research) — GMap has its OWN, different labor mechanic for the flow engine

- Checked `GMap/server/flowEngine.mjs`'s `biosLaborScale(eco)`: scales a faction's ENTIRE flow-engine extraction/production by a step function of how much `currency.bios` (category E currency) the faction has stockpiled (0.25x under 0/none, 0.5x under 8, 0.75x under 16, else 1x) — a faction-wide currency-stock proxy, completely unrelated to a specific planet's population headcount or specific buildings' job requirements.
- This is a genuinely different mechanic from `domain/planets/laborAllocation.mjs`'s job-slots (built the previous session, new design not a port) — per-planet population, per-building `laborSlots` requirement, auto-distributed by placement order.

### Q3 — two labor mechanics would now exist (GMap's real biosLaborScale for the flow engine vs. our new job-slots for yield_flat). Keep both, or unify?

- Asked: (my recommendation) keep both as GMap has them — biosLaborScale for the ported flow engine, job-slots for yield_flat buildings only. Less deviation from GMap, but a real conceptual seam remains.
- Captured: user chose the alternative — replace biosLaborScale with job-slots everywhere.
- Decided: **explicit, deliberate deviation from GMap** (not a guess — asked and confirmed): when the flow engine (RPS cycle, extraction, `flow_convert`) gets ported in later stages, it will NOT use `biosLaborScale`. Instead, every flow-participating building's output gets scaled by the SAME `allocateLabor`/job-slots staffing fraction already used for `yield_flat` buildings — one unified labor model across the whole economy, keyed to real per-planet population and real per-building `laborSlots`, not an abstracted faction-wide currency-stock proxy. Since `laborSlots` was already added to ALL 58 buildings (not just the ~18 yield_flat ones) in the previous session, no new content change is needed to support this — it was already generalized.
- Flags: none — this fully resolves the tension, but must be documented prominently wherever the flow engine's extraction/RPS logic eventually gets ported (its README should explicitly call out this deviation, same as other deliberate deviations already documented elsewhere in this project).

### Q4 — concretizing Stage 1: deposits directly yield category currency (no RPS conversion yet), gated by job-slots

- Asked: (my recommendation) a new function reads `planet.resources` -> `map_resources.json` -> `yield` -> currency, summed alongside `buildingYields.mjs` into the faction's `categoryIncome` in `turn.mjs`, scaled by the same `allocateLabor` job-slots staffing fraction buildings already use. Effectively an automatic `yield_flat` whose size comes from what's really on the planet instead of an authored content number.
- Captured: user confirmed the recommendation as-is.
- Decided: Stage 1 = deposits produce category currency directly (A->currency.extracta, etc.), gated by job-slots, no RPS/bottleneck/tier conversion yet (that's Stage 2). Ready to implement.

### Q5 — GMap extracts deposits for free (no building needed at all). Keep that, or require a building since we're gating everything through job-slots (which are a BUILDING's slots)?

- Asked: with no building, there's nothing to hang job-slots off of — either deposits stay building-free (deviates from the "nothing is free" principle established all last session) or a deposit needs a matching building before it yields anything (deviates from GMap, but consistent with the rest of the design).
- Captured: user chose the latter — deposits require a building to extract.
- Decided: **a deposit only produces currency if the owning planet has a matching extraction building** — another explicit, deliberate deviation from GMap (asked and confirmed, not guessed).

### GMap baseline check (assistant research) — how would a building "match" a deposit's category?

- Checked `content/core/buildings.json`: every building already has a `category` field (A-F, same scheme as `economy_schema.json`'s categories) — e.g. category A is exclusively `kind:"mine"` buildings (`building.mine`, `extract.deep_shaft`, `extract.strip_pit`, `extract.gas_well`, `extract.asteroid_harvester`, `extract.anomaly_collector`), category E has farms/habitats/labs, etc.
- Checked `content/core/map_resources.json`: deposits span **all 6 categories**, not just A (86 deposits total; A/B/C/D/E/F all represented) — e.g. a category-F deposit is something like a relic/anomaly (F = "Наука, реликты, псионика, аномалии" per `economy_schema.json`), not a physical ore. So gating strictly by `kind==="mine"` would only work for category A — the other 5 categories' deposits need their own category's buildings (labs for F, factories for C, etc.), which aren't literally "mines" but are thematically the right building type for that category.
- No new content field needed either way — both buildings and deposits already carry a `category` id from the same A-F scheme.

### Q6 — how does a building "match" a deposit for gating?

- Asked: (my recommendation) same `category` (A-F) — no new content field needed, both sides already carry it.
- Captured: user confirmed the recommendation as-is.
- Decided: **category match, not `kind==="mine"`.** A category-A deposit needs any category-A building (mines) present; a category-F deposit needs any category-F building (labs) present; etc. Ready to implement — this closes out the design questions for Stage 1.

## Open flags (pending input)
- Procedural biome-based deposit generation (reusing biomeMatch.mjs's matching logic) -> agreed direction, not yet scoped/built
