# Galaxy Data Migration — Implementation Spec

Handoff spec for an implementing agent. Written 2026-08-14, resuming a design session from 2026-08-13 (`notes/2026-08-13-galaxy-migration-grill.md`) that was paused pending a schema dependency, now resolved same-day.

**Before touching anything**: read `Golden_PAX_v0_5/CLAUDE.md` in full, then `notes/2026-08-13-galaxy-migration-grill.md` in full — it has the complete reasoning trail for every decision below.

**Hard dependency**: `SYSTEM_ADJACENCY_AND_MOVEMENT_SPEC.md` must be built and reviewed first — this migration needs the `system_links`/`x`/`y`/`sectors` schema that spec creates. Do not start before it lands.

**Also already built, do not re-implement**: the two new mechanics this migration surfaces (planet slot-grade progression, space-object economy/combat/depletion) were already implemented and reviewed as part of `CURRENCY_AND_FORCES_INTEGRATION_SPEC.md`'s Priority 4 (`domain/planets/planetGrade.mjs`, `domain/planets/spaceObjects.mjs` — both real, tested, live-verified). This spec is ONLY the actual data-transfer script — moving GMap's real galaxy (`GMap/data/published.json`: 978 systems, 2774 planets) into Golden_PAX's schema, using those already-built mechanics as the target shape.

---

## Settled scope

**Full transfer, not reference-only.** Positions/names/lore/links/sectors are preserved as-is. Economic numbers (population, buildings, resources) are fully recalculated under this project's real rules — **never** algebraically rescaled from the old numbers.

**Content/balance redesign of the galaxy (better layout, more interesting placement) is explicitly deferred to a separate, later pass.** This is mechanics-only data transfer.

**Migrated fields**: system `id/name/x/y/kind/stars`, `links`, `sectors` (`id/name/polygon/color/notes`), system `ownerFactionId` (single owner only — GMap's `coOwnerFactionIds` is explicitly NOT migrated, see below), and per-planet `id/name/type/climate/habitable/colonyType/raceComposition/resources/surfaceBuildings/orbitalBuildings` + population (see the population rule below).

**Explicitly NOT migrated** (deferred until the owning game system exists — none of these have a real home in this project yet): `coOwnerFactionIds`, `locked`, `isCapital`, `poiType`, `visibleToFactionIds`, `activity`, `tradeWithSystemId`, `scannerDeadZone`, `blockaded`, `anomalyMotion`, `questId`, `trafficHub`, `contested`, `logistics` (this migration predates real computed logistics — `SYSTEM_ADJACENCY_AND_MOVEMENT_SPEC.md`'s `logistics.mjs` computes this fresh from the migrated `links`, don't copy GMap's stale precomputed values), `revoltContested`/`revoltUntilTurn`, planet `loyalty`/`censusLocked`/`surveyed`/`orbitIndex`/`size`, `stations`. `notes` (lore text) is low priority/optional — include if convenient, not required.

**Building mapping is already solved**: old buildings only carry `{kind, zone}` (no real `buildingId`) — `server/domain/planets/buildingDefs.mjs`'s existing `buildingDefFromInstance`/`defForKindZone` fallback already resolves this correctly. Verify all ~21 distinct `{kind, zone}` combos across the real data resolve cleanly before considering the migration script done; don't silently drop unmapped buildings.

---

## Population rule — the one thing NOT to get wrong

**Population is derived 100% from migrated building capacity** via `planetCapFromBuildings` — the exact same mechanism every other planet in this game uses (freshly colonized or migrated, no distinction). The old population number (ranges 7 to 398M in the real data, median ~1.2M) is **never** an input to any population formula.

Its only remaining job: a heuristic for *how many* of the old planet's buildings to bother migrating (a population-7 world shouldn't get 20 buildings migrated onto it). Propose a concrete heuristic (e.g. scale migrated building count by old population's percentile rank, or a simpler tiered bucket system) and document it — this was flagged as low-priority/propose-at-implementation-time in the original grill, so use your judgment, but don't skip having *some* rule (migrating either all buildings or a random subset would be arbitrary).

**If you find yourself computing `newPopulation = f(oldPopulation)` directly, stop** — that's the wrong shape. Buildings first, population from buildings, old population only gates building *count*.

Migrated planet's starting `planetGrade` = `min(5, smallest grade whose surfaceSlots >= migrated building count)` — one rule, derived from the actual migrated building count (not from old raw slot numbers, not a separate heuristic).

---

## Space objects migration

GMap's `spaceObjects` field (system-level tags: `asteroid`, `pirate`, `wormhole`, `refugees`, etc. — 19 real content-defined types plus some currently-inert tags like `refugees`/`depot`/`outpost` with no content definition yet) migrates as **data only** — bring all system tags over as-is, including the inert ones (don't drop them just because they're not wired to an effect yet; the already-built `spaceObjects.mjs` mechanic will apply real effects to whichever ones have content definitions, and inert ones stay harmlessly inert, same as they are in GMap today).

---

## What to build

`scripts/migrateGalaxy.mjs` (new, one-shot migration script — follow the pattern of existing scripts like `scripts/smokePriority4.mjs` for HTTP-driving style, or write it as a direct DB-writing script if that's more appropriate for a one-shot bulk import; your call, document the choice): reads `GMap/data/published.json`, for each system creates it via the real domain functions (not raw SQL inserts that bypass validation) with its `links`/`x`/`y`/`sectors`/`spaceObjects`, for each planet colonizes/creates it with migrated buildings (using the population-derivation rule above) and starting `planetGrade`.

---

## Tests

An integration test or smoke script that runs the migration against a representative sample (not necessarily all 978 systems — a meaningful subset covering the range of population/building-count values) and asserts: no population number was copied directly, every planet's `planetGrade` is consistent with its migrated building count, all `{kind,zone}` combos resolved to a real building def, `links`/`x`/`y` match the source data exactly.

---

## How this gets checked

The user will hand this document to an implementing agent, then have the agent that wrote this spec review the result. Checks: population is genuinely building-derived (spot-check several planets across the population range, confirm no direct old-population influence), the explicitly-not-migrated fields are genuinely absent (not silently carried through), space-object tags are preserved even when currently inert, full test suite passes, and — given the scale (978 systems) — a real timing/performance sanity check that the migration completes in a reasonable time.
