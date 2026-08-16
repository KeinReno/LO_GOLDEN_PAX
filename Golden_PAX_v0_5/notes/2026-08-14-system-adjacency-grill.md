# System adjacency + fleet movement: Grill / Discovery Notes

Date: 2026-08-14 · Goal: design the missing spatial/adjacency layer — flagged as a blocker three separate times now ([[golden_pax_galaxy_migration_design]], [[golden_pax_tech_tree_redesign_design]]'s Military power-projection scope-cut, and today's court-governance grill Q6's `move_cost_mult` channel with nowhere to attach). Surfaces during the court grill because admiral postings carry a real `move_cost_mult` effect with nothing to apply it to.

## Context established before Q1

**CORRECTION — the initial "100% greenfield" claim below was wrong, caught by the user asking to look harder at the old build.** First search used the wrong terms (`adjacentSystem`/`neighbors`/`connections`) and missed the real term GMap actually uses: `links`. Re-searched properly and found a full, real, working system:

- `world.links[]` — real graph edges: `{fromId, toId, type}`. Types found: `corridor`, `gate` (both logistics-eligible), `damyl_planet` (infantry-only gate — fleets can't use it, `pathfinding.mjs`'s `linkAllowsTravel`). `world.sectors[]` also exists but is purely passed through to the client for display (`api.mjs`), not consumed by any rule — cosmetic map regions, not gameplay.
- `pathfinding.mjs` — `neighborIds`/`hopPath`: real BFS shortest-path over links, mode-aware (fleet/legion/any).
- `logistics.mjs` — a full, real supply-range mechanic: BFS from each faction's capital through `corridor`/`gate` links (`computeLogisticsNetwork`), `supplyLevel` decaying per hop, real economic consequences for disconnected systems (`logisticsProductionMult`/`logisticsUpkeepMult`/`logisticsCombatDefMult` — production/upkeep/combat-defense multipliers), extra range from `logistics_range_add` faction-trait effects, depot buildings extending range.
- `forceMovement.mjs` — **the actual fleet/legion movement mechanic, and it's INSTANT** — not a multi-turn travel simulation. `checkMoveRange`/`completeForceTravel`: if the destination is within `content.rules.movement.rangeHops` (content-defined, `fleetRangeHops`/`legionRangeHops` override or shared `rangeHops` default 3) hops via BFS, the unit teleports there immediately, no in-transit state. This matches this project's established "instant spend, no queue" pattern used everywhere else (`placeBuilding`, `planetGrade` upgrades, forces raise/disband) — not a new pattern, a confirmed-fitting one.
- Real content precedent already exists: `content/core/rules.json`'s `movement` block (`rangeHops: 3`, `fleetRangeHops: null`, `legionRangeHops: null` — both fall back to the shared value, `defaultFleetSpeed: 10` looks like unused/legacy flavor given the instant-teleport design, worth confirming not porting it as a real mechanic).
- Links themselves are NOT created via any dedicated API route in GMap (grepped `api.mjs`, no `addLink`/`createLink`) — no procedural galaxy generation exists either. They're world-authoring data, same tier as systems themselves — natural fit for the same GM-CRUD pattern already decided for NPCs (court grill Q1) and already used for systems (`POST /campaign/:id/systems` is GM-only today).
- Direct payoff: this also unblocks [[golden_pax_tech_tree_redesign_design]]'s explicitly-deferred Military power-projection sub-mechanic (cross-system attack range, planetary defense installations) — that was scope-cut specifically for this missing schema, and porting the real GMap mechanic now resolves it properly instead of inventing something new.

## Summary / key decisions
(filled in as we go)

## Q&A log

### Q1 — galaxy layout shape
- Asked (before the correction above): graph of links, 2D x/y, or both?
- Captured: user redirected to check GMap source properly instead of guessing/designing fresh — correct call, found the real answer: **both, but for different purposes**. `links[]` is the real mechanical graph (pathfinding/logistics/movement all key off it). `x`/`y` per system exists too but only for client rendering (`MapCanvas.tsx`'s isometric projection) — never consumed by any server rule. Port both: `links` as real schema/rules, `x`/`y` as display-only columns for the eventual client map.

### Q2 — porting confirmation + defaultFleetSpeed
- Asked: confirm porting links/pathfinding/logistics/forceMovement as-is; what to do with the seemingly-dead `defaultFleetSpeed` in `rules.json`?
- Captured: **user's own reframe again, not one of the 3 offered options** — wants real engine/fuel-dependent fleet speed, not to just drop or flavor-keep the dead field. New design on top of the port, not a straight port.
- Follow-up asked: mechanically, how does "speed" work if movement stays instant (GMap's real shape)? Engine→range vs fuel→per-hop cost vs both.
- Captured: **"двигатель дальность, а топливо количество очков движения"** — engine determines max jump distance (maps cleanly onto porting `rangeHops` as a per-fleet/tech-derived value instead of `content.rules.movement`'s flat constant, mirrors Tech Tree 2.0's `weapon.*` equipment-slot pattern). Fuel is a NEW concept: a movement-points pool, not a per-hop instant cost — a fleet can make multiple moves until the pool is exhausted, distinct from GMap's stateless instant-teleport (which has no resource pool at all).
- Flags: how movement points regenerate/refuel — next question, this is the part that determines whether the mechanic is a light flavor addition or a real new stateful resource loop.

### Q3 — movement-points refuel rule
- Asked: how does the fuel-derived movement-points pool regenerate?
- Captured: **Пассивно каждый ход** — refills to max every turn regardless of location, same shape as an AP budget. No stranding risk, simplest of the three options, matches this project's general bias toward simple first-pass numerics over punishing resource-denial mechanics.
- Flags: exact points-per-fuel-tier / points-per-hop-cost numbers — first-pass default at implementation time.

## Summary / key decisions

This turned out to be a real GMap port (corrected mid-grill after initially — wrongly — declaring it greenfield; the fix was searching for the right term, `links`, not `adjacentSystem`/`neighbors`), with one genuinely new layer added on top by the user.

**Ported as-is** (real GMap behavior, `port behavior not code shape`):
- `world.links[]` graph: `{fromId, toId, type}`, types `corridor`/`gate` (logistics-eligible) / `damyl_planet` (infantry-only gate, fleets excluded).
- `pathfinding.mjs`: BFS `neighborIds`/`hopPath`, travel-mode aware.
- `logistics.mjs`: capital-rooted BFS supply network, hop-decayed `supplyLevel`, real disconnected-system penalties (production/upkeep/combat-defense multipliers), depot/faction-trait range bonuses.
- `forceMovement.mjs`'s core shape: movement is INSTANT (teleport within a hop radius), not a multi-turn transit sim — matches this project's established "instant spend, no queue" convention already used everywhere (`placeBuilding`, `planetGrade`, forces raise/disband).
- `x`/`y` per system: ported too, but display-only (client rendering), never a gameplay rule input — matches GMap's own real usage.
- Links are GM-authored world data, same tier as systems/NPCs — reuses the established GM-CRUD pattern (court grill Q1), not a new authoring flow.

**New design layered on top** (NOT in GMap — the flat `content.rules.movement.rangeHops` constant + the seemingly-dead `defaultFleetSpeed` field get replaced by a real mechanic):
- **Engine → range**: engine tier/type (tech-gated, mirrors Tech Tree 2.0's `weapon.*` equipment-slot pattern) determines a fleet's actual hop range per move, replacing the flat constant.
- **Fuel → movement-points pool**: a new resource-gated budget, not a per-hop cost — a fleet can make multiple moves per turn until the pool is exhausted. Refills to max **passively every turn**, regardless of location (simplest of 3 options considered, no stranding risk).
- Direct side benefit: resolving this also unblocks [[golden_pax_tech_tree_redesign_design]]'s deferred Military power-projection sub-mechanic (cross-system attack range, planetary defense installations) — same schema, same graph.

**Open, first-pass numerics** (propose-and-confirm at build time): engine-tier→range-hops table, fuel-tier→movement-points table, points-cost-per-hop.

## Open flags (pending input)
