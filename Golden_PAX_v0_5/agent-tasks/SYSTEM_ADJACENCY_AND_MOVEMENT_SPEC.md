# System Adjacency & Fleet Movement — Implementation Spec

Handoff spec for an implementing agent (not a design document — the design is already settled through a grill session; see the source file linked below). Written 2026-08-14.

**Before touching anything**: read `Golden_PAX_v0_5/CLAUDE.md` in full, then `notes/2026-08-14-system-adjacency-grill.md` in full. **That file contains an important correction you should read before starting**: an initial claim that this whole area is "100% greenfield, nothing to port" was wrong — GMap has a full, real, working system (`links`/`pathfinding.mjs`/`logistics.mjs`/`forceMovement.mjs`) that a first, too-narrow search missed. Read the grill notes' "Context established" section for exactly what's real GMap behavior to port vs. genuinely new design.

**No hard dependency on the other pending specs** — this is schema/systems-scoped, independent of court/boarding/stability. But it directly unblocks two other things once built: `golden_pax_tech_tree_redesign_design`'s deferred Military power-projection sub-mechanic, and the still-pending real galaxy-data migration (see `GALAXY_MIGRATION_SPEC.md`, which depends on THIS spec's schema).

---

## Part 1: schema — the missing `links`/position layer

### Settled design

GMap's real shape, verified directly against `GMap/server/normalizeWorld.mjs`/`pathfinding.mjs`/`logistics.mjs`:

- `links`: graph edges, `{ fromId, toId, type }`. Types found in GMap: `corridor`, `gate` (both logistics-eligible), `damyl_planet` (infantry-only gate — fleets cannot use it, legions can).
- `x`/`y` per system: real coordinates, but **display-only** in GMap (client isometric rendering, `MapCanvas.tsx`) — never a gameplay rule input there either. Port both purposes: `links` as real mechanical schema, `x`/`y` as plain display columns.
- `sectors`: exists in GMap (`{ id, name, polygon, color, notes }`) but is purely passed through to the client for display, never consumed by any server rule — low priority, port as inert display data only, don't build any mechanic around it.
- **Links are GM-authored world data**, same tier as systems themselves (GMap has no procedural galaxy generation and no dedicated `addLink`/`createLink` API route — links are set when a system is created/edited). Reuse the established GM-CRUD pattern (same as this project's NPC roster, systems) — extend the existing `POST /campaign/:id/systems` GM route (or add a sibling route) to accept `links: [{toSystemId, type}]` at creation/edit time.

### What to build

- `server/db/schema.sql`: new `system_links` table (`id`, `campaign_id`, `from_system_id`, `to_system_id`, `type`), new `x`/`y` real columns on the `systems` table (not JSON — CLAUDE.md rule 5). New `sectors` table if you choose to port it (low priority, can be deferred within this spec if time-constrained — flag if you cut it).
- `server/campaign/systemLinksStore.mjs` (new, or extend the existing systems store) for CRUD.
- Extend `server/api/routes/campaign.mjs`'s system-creation/edit routes (GM-only) to accept link data.

---

## Part 2: pathfinding & logistics (real GMap port)

### Settled design

Port verbatim, behavior-for-behavior — this is real, working GMap math, not a redesign:

- `pathfinding.mjs`: `linkAllowsTravel(type, mode)` (fleet excludes `damyl_planet`, legion/any allow everything), `neighborIds(world, systemId, mode)`, `hopPath(world, fromId, toId, mode)` (BFS shortest path).
- `logistics.mjs`: `resolveCapitalSystemId`, `computeLogisticsNetwork` (capital-rooted BFS, hop-decayed `supplyLevel`, depot/faction-trait range bonuses via `logistics_range_add` effects — port `logisticsRangeBonus` too, note it reads faction traits which don't have a full data model in this project yet per the tech-tree-redesign audit; degrade gracefully to 0 bonus if trait data isn't available, don't block on it), `applyLogisticsEffects`/`logisticsProductionMult`/`logisticsUpkeepMult`/`logisticsCombatDefMult` (real economic/combat consequences for disconnected systems).

### What to build

- `server/domain/systems/pathfinding.mjs` (new, port).
- `server/domain/systems/logistics.mjs` (new, port) — wire `logisticsProductionMult`/`logisticsUpkeepMult` into `domain/planets/flowIncome.mjs`'s existing per-system income calculation (same category as tech/court modifier-stack effects, but this one is a per-system multiplier applied before the faction-level modifier stack, matching GMap's real application point — read `flowIncome.mjs` carefully before inserting this, don't break the existing 3-pass ordering that's already been the source of two real live-only bugs this project). Wire `logisticsCombatDefMult` into `resolveExchange.mjs` as a defender-side power multiplier, same pattern as the existing `spaceObjectCombatModifier`.

### Tests

Parity tests against real GMap behavior for `hopPath`/`neighborIds`/`computeLogisticsNetwork` (byte-parity style, same discipline as `modifierStack.parity.test.mjs`). Live-verify: build a small linked system graph, confirm hop counts and supply-level decay match hand-computed expectations, confirm a disconnected system's production is genuinely reduced.

---

## Part 3: fleet/legion movement — instant, hop-radius based

### Settled design

**Movement is instant** — a hop-radius teleport, not a multi-turn transit simulation. This is GMap's real design (`forceMovement.mjs`'s `completeForceTravel`) and it matches this project's own established "instant spend, no queue" convention (`placeBuilding`, `planetGrade`, forces raise/disband) — a confirmed fit, not a new pattern being introduced.

Port GMap's real shape: `hopDistance`, `checkMoveRange` (validates within a max-hops budget), `completeForceTravel` (updates `unit.systemId` directly, no in-transit state), `systemsWithinMoveRange` (for UI/preview — reachable-set BFS).

### New design layered on top (NOT in GMap — replaces the flat `rangeHops` constant)

The user explicitly wants engine/fuel to matter, replacing GMap's flat `content.rules.movement.rangeHops` constant (and its seemingly-dead `defaultFleetSpeed` field, which should NOT be ported as-is):

1. **Engine → range.** A fleet's engine tier/type (tech-gated — mirrors `TECH_TREE_2_INTEGRATION_SPEC.md`'s `weapon.*` equipment-slot pattern; if that spec hasn't landed yet, build this as a simple `def.engineTier`-derived lookup for now and note the tech-gating hook as a follow-up) determines its actual hop range per move, replacing the flat constant. Legions can use a separate, simpler fixed range (GMap's `legionRangeHops` precedent) — engines are a ship/fleet concept, not a ground-unit one.
2. **Fuel → movement-points pool.** A NEW resource-gated budget, genuinely not in GMap at all. Not a per-hop cost — a pool a fleet can spend across **multiple moves in the same turn** until exhausted. **Refills to max passively every turn**, regardless of location (the simplest of three options considered during the grill — explicitly chosen to avoid a fleet getting stranded far from any base with no way to refuel; don't build a depot-only-refuel or partial-regen variant instead).
3. First-pass numerics to propose and document: engine-tier→range-hops table, fuel-tier→movement-points table, movement-points cost per hop.

### What to build

- `server/domain/forces/movement.mjs` (new): port `hopDistance`/`checkMoveRange`/`completeForceTravel`/`systemsWithinMoveRange`, adapted to read range from the new engine-derived value instead of the flat content constant, and to check/decrement the fleet's movement-points pool before allowing a move.
- New persisted fields on the `forces` table (or a small companion table): `movementPoints` (current pool, real column — needs to be readable/writable per-turn), engine reference if you're modeling it as equipped content rather than a flat tier number (your call, document the choice).
- `campaign/turn.mjs`: per-turn movement-points regeneration to max.
- New routes: `POST .../forces/:forceId/move` (`{ toSystemId }`), reusing `checkMoveRange`/`completeForceTravel`.

### Tests

New-design tests for the engine-range/fuel-points layer (not a GMap port, say so), parity-style tests for the ported `hopDistance`/`completeForceTravel` core. Live-verify: raise a fleet, move it within range (confirm `systemId` updates, movement points decrease), attempt a move exceeding remaining points (confirm rejection), advance a turn (confirm points regenerate to max).

---

## Explicitly OUT OF SCOPE for this pass — do not start

**Cross-system power-projection** (system defense installations, ships attacking an adjacent system) — this spec resolves the schema blocker that gated it, but building the actual attack-range/defense-installation mechanic is its own follow-up work, not part of this handoff. Flag it as newly-unblocked in your final report, don't build it.

The actual real-galaxy-data migration (GMap's 978 systems / 2774 planets) — that's `GALAXY_MIGRATION_SPEC.md`, a separate spec that depends on this one's schema existing first.

---

## How this gets checked

The user will hand this document to an implementing agent, then have the agent that wrote this spec review the result. Checks: the ported pieces (`pathfinding`/`logistics`/core movement) genuinely match GMap's real behavior (verify against GMap source directly, don't take claims on faith — this project has a standing rule about this), the engine/fuel layer is honestly labeled as new design, movement-points regeneration genuinely happens every turn regardless of location, `x`/`y`/`sectors` are genuinely display-only (no accidental gameplay coupling), full test suite passes, live HTTP verification with real numbers.
