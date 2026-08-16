# Ambient/Flow-Economy Bottleneck: Grill / Discovery Notes

Date: 2026-08-14 · Goal: figure out what to do about a structural resource-contention bug in the flow engine's ambient D/E baseline, found while auditing whether the tech/research system is coherent against the current economy. Scope grew from "science" to "the whole flow economy" because the root cause isn't tech-specific.

## Summary / key decisions

**The bug, confirmed live**: a textbook-correct, fully-staffed bootstrap chain (`building.mine` A → `materia.smelter` A→B → `building.factory` B→C → `building.lab` E→F, population 12 exactly matching the 4 buildings' laborSlots) still produces **zero** `currency.cognitio`. Root cause: `building.factory` (B→C) and `building.lab` (E→F) both need category **E** — factory as a secondary/catalyst input, lab as its primary input — and the only E available is the ambient baseline (`Math.max(1, inhabitedPlanets)` = 1 unit per planet, regardless of population). Whichever building is processed first in placement order consumes the entire ambient E; the other is permanently starved. Not tech-specific — the same contention can happen at any link in the A→B→C→D→E→F chain wherever a category is claimed as both someone's primary and someone's secondary input.

**Why it exists**: verified byte-for-byte against `GMap/server/economyTick.mjs:595-598` — the ambient formula is a faithful port, not a new bug. But GMap's economy extracts system-level deposits "for free" (no building required), giving it much more non-ambient production backing every stage. This project's Stage 2 flow-engine port made an explicit, already-agreed deviation: **deposits only extract behind a matching-category building**. That change makes the tiny ambient trickle proportionally far more load-bearing here than in GMap's original design.

**Fix, three parts**:
1. Ambient D/E stops being a flat per-planet constant and gets grounded in real population (not building count) — consistent with this whole session's "nothing from thin air" principle. Exact coefficient is a first-pass default, not deeply specified (proposed: `E[1] += max(1, ceil(pop*0.3))`, `D[1] += max(1, ceil(pop*0.4))`).
2. Beyond just raising the ceiling, the underlying first-come-first-served contention gets fixed structurally: `domain/economy/flowEngine.mjs`'s consumption model (`applyFlowConvert`/`consumeRateAtLeast`) moves from greedy/order-dependent to a real allocation rule. This is an intentional, new deviation from GMap (currently byte-parity tested) — GMap has the identical order-dependent behavior, so this isn't "fixing a GMap bug," it's a genuine improvement this project is choosing to make.
3. Allocation rule: **primary-input demand is satisfied before secondary-input demand** when a category is contested — what a building is actually converting/producing from outranks what it merely needs as a catalyst/gate. Tie-break between multiple simultaneous primary claims exceeding supply is unresolved (low priority, propose+confirm at implementation time — likely proportional split among primary claims).

This is real implementation work (core engine rework + a content/balance pass), not a one-line fix — sized similarly to the Priority 4 mechanics, not a small patch.

## Implementation status (2026-08-14, built same session, autonomously — user asked for this to be finished while they slept, 1-hour budget)

Built: `flowEngine.mjs`'s `applyFlowConvertPrimary`/`reconcileSecondaryDemand` (new, `applyFlowConvert` itself untouched/still parity-tested), `flowContribution.mjs`'s `addBuildingFlows` two-legged (primary immediate, secondary deferred), `flowIncome.mjs`'s ambient grounded in population (`AMBIENT_ENERGIA_PER_POP=0.4`, `AMBIENT_BIOS_PER_POP=0.3`) with `reconcileSecondaryDemand` called once across all owned planets. New regression tests in `flowIncome.test.mjs` reproduce the exact bug and prove order-independence for the E-contention case specifically. 273 tests green. Live-verified against real content: `mine→smelter→factory→lab` at population 12 now yields `cognitio: 1` (was confirmed 0 before the fix).

**Not reviewed by the user** — shipped autonomously under a time box. Revisit: the 0.4/0.3 coefficients, and the primary-claimed-categories-first reconciliation order (a documented first-pass heuristic, not a general topological/equilibrium solver — correctly handles the found 2-hop case, deeper cyclic contention across the ring is unverified).

## Q&A log

### GMap baseline check (assistant research)

See Summary above for the full trace and the GMap-parity finding.

### Q1 — should ambient D/E stay a free, population/building-independent trickle, or get grounded in something real?

- Asked: ambient is literally "money from thin air" (sun/geo energy, subsistence farming) — the whole session has followed a "nothing from thin air" principle for everything else (population, buildings, extraction, recruits, now slot-grades and space objects). Does that principle extend here too?
- Captured: user confirmed the recommendation — **yes, ground it in population and/or real building count**, replacing the flat "1 per inhabited planet" formula.
- Decided: ambient D/E baseline will scale with something real (population size and/or buildings present) rather than a flat per-planet constant. Exact formula/magnitude not yet decided.
- Flags: exact scaling formula (population-only, building-count-only, or both; what magnitude/coefficient) -> next to ask

### Q2 — scale ambient D/E from population, building count, or both?

- Asked: population-based (fits "sun/geo energy + subsistence farming = passive, no dedicated job needed"), building-count-based (fits "developed infrastructure gives passive perks"), or both combined.
- Captured: user confirmed the recommendation — **population-based**.
- Decided: ambient D/E scales with total population (not building count, not job-slots/labor-staffed population — total population present on the planet), replacing the flat `Math.max(1, inhabitedPlanets)`/`inhabitedPlanets * 2` constants.
- Flags: exact coefficient/magnitude (my proposed first-pass: `E[1] += max(1, ceil(pop*0.3))`, `D[1] += max(1, ceil(pop*0.4))`, giving E=4/D=5 at pop=12 — enough to cover both factory's secondary AND lab's primary simultaneously) -> next to ask

### Q3 — is bigger ambient enough, or does the first-come-first-served contention itself need fixing?

- Asked: even with a bigger ambient pool, when two converters compete for the same category (one as primary, one as secondary), whoever's building was placed first (processed first in `addBuildingFlows`'s loop) wins the full amount it needs, the other gets whatever's left — build ORDER shouldn't really determine economic outcome. Fix this too (real allocation-fairness rework), or is raising ambient sufficient for now (build-order-dependency remains, just less likely to actually starve anyone once headroom is big enough)?
- Captured: user chose to **fix fair distribution**, not just raise ambient.
- Decided: `domain/economy/flowEngine.mjs`'s consumption model (`applyFlowConvert`/`consumeRateAtLeast`, currently greedy/sequential/order-dependent) needs a real rework so competing converters split a scarce shared category's supply instead of first-come-first-served. This is a genuine, intentional deviation from GMap (currently byte-parity tested in `flowEngine.parity.test.mjs`) — GMap has the same greedy/order-dependent behavior, so this becomes a new, documented divergence, not a bug fix to something GMap already solved.
- Flags: **what "fair" means exactly** — proportional-to-demand split, primary-input-needs-take-priority-over-secondary-input-needs, or equal split regardless of demand size -> next to ask. Also: this requires reworking consumption from single-pass-greedy to something like collect-all-demand-then-allocate, which is a substantial rewrite of core flow-engine mechanics used by every category conversion in the game, not just the E-contention case found here.

### Q4 — fairness rule: primary-input demand takes priority over secondary-input demand, or all demand is equal?

- Asked: a building's PRIMARY input (the thing it's actually converting/producing from) vs. its SECONDARY input (a catalyst/gating requirement, smaller role) — should primary demand be satisfied first (in full, up to supply), with secondary demand splitting whatever's left, or should all demand (primary and secondary alike) be treated equally and split proportionally regardless of role?
- Captured: user confirmed the recommendation — **primary-input demand takes priority over secondary-input demand**.
- Decided: when a category's available supply is contested, buildings that need it as their PRIMARY input (what they're actually producing from) get satisfied first, up to the available amount; buildings that only need it as a SECONDARY/catalyst input split whatever remains. This directly fixes the found case: `building.lab`'s E-as-primary would now be satisfied before `building.factory`'s E-as-secondary, regardless of build order.
- Flags: tie-break rule if MULTIPLE buildings have PRIMARY demand on the same category exceeding available supply (rarer case, not yet addressed) -> low priority, propose+confirm at implementation time (likely: split proportionally among primary claims once primary-vs-secondary priority is settled).

