# domain/forces

Where legions and fleets actually come from — recruiting units from a planet's population, the building gate that determines what can be raised, per-turn upkeep, and disbanding. Closes the gap the user flagged after the first playtest: *"Легион и флот откуда берется? Пока тоже из воздуха"* (where do legions/fleets come from? still out of thin air).

**Not a port.** GMap has no equivalent creation flow — its `forcesActions.mjs` only ever edits an *existing* fleet/legion's composition against currency, and explicitly refuses to create new units directly (`"Нельзя создавать юниты напрямую"`). Everything about *how a unit gets raised* here (recruits, mobilization ceiling) is new design from `notes/2026-08-12-population-race-forces-grill.md` (Q7-Q11). What GMap *does* have and this ports verbatim: the building gate (`systemHasShipyard`/`systemHasBarracks`) and the cost/upkeep formulas (`forceEconomy.mjs`'s `produceForceCost`/`forceUpkeepRates`).

**Inputs/outputs**: plain data in (a system + planet + unit/ship def + faction + stocks), plain data out (updated planet/stocks/journal/composition group). No DB/HTTP — `server/campaign/forcesStore.mjs` persists fleets/legions, `server/api/routes/forces.mjs` exposes raise/list/disband/engage.

## The core design (grill Q7-Q11)

- **Recruits are not a stockpile.** They're a derived mobilization ceiling — `recruits.mjs`'s `mobilizableRecruits(planet, rate)` = `floor(planet.population * rate)`, checked fresh every raise against the planet's *current* population. `rate` is `content.economy_balance.forces.mobilizationRate` (currently 0.3 — the user's "условно 30%" baseline). `raiseUnit(..., { overrideCeiling: true })` can push past that (grill Q10): overflow recruits still produce 1 unit each, but cost `OVER_CEILING_POPULATION_MULT` (1.5, first-pass) population per overflow recruit. Without the flag the ceiling stays a hard cap.
- **Raising a unit costs recruits (population) AND currency, together** — `recruitment.mjs`'s `raiseUnit` deducts population from the planet (1:1 within the ceiling; 1.5x on overflow with `overrideCeiling` — a real, permanent transfer, same as `domain/planets`' colonization) *and* pays `produceForceCost`'s real metal/supply cost per unit raised. Population and job-slots (`domain/planets/laborAllocation.mjs`) draw from the *same* pool, per grill Q11 — mobilizing for defense genuinely competes with staffing buildings.
- **The baseline "recruit" unit needs no building.** `content/core/units.json`'s `unit.militia` is flagged `raisableWithoutBuilding: true` — raisable for emergency defense with zero infrastructure. Everything else (real `ship.*`/`unit.*` defs) requires the matching building, exactly like GMap already gates it (`buildingGate.mjs`).
- **Upkeep stays currency-only**, every turn, wired into `campaign/turn.mjs`'s economy step (`upkeep.mjs`'s `fleetUpkeep`, ported from GMap's module-private function of the same name) — no recurring recruits/population drain.
- **Disbanding returns population, not currency** (`recruitment.mjs`'s `disbandUnits`) — GMap's currency-refund-on-disband belongs to its much bigger arbitrary-composition-edit system (`forcesActions.mjs`), not ported here.

## Status: real for a meaningful subset, honestly bounded

Behavior-tested (module-private in GMap, re-derived from source): `buildingGate.mjs`'s `systemHasShipyard`/`systemHasBarracks`, `upkeep.mjs`'s `fleetUpkeep`.

Parity-tested against GMap (exported and pure there): `forceCost.mjs`'s `produceForceCost`/`forceUpkeepRates` — reshaped to take `economyBalance` as an explicit parameter instead of GMap's hidden `getContent()` call (CLAUDE.md rule 3), same formulas.

New, not a port (`recruits.mjs`, `recruitment.mjs`) — unit-tested for the behavior described above, and verified end-to-end through the live HTTP API (raise → turn → upkeep drains currency → disband → population returns).

Raised forces now feed `domain/combat/resolveExchange` via `POST .../forces/:forceAId/engage` (`engage.mjs`'s `forceAfterExchange` persists casualties: empty composition → `deleteForce`, no population return). Partial disband can target a group by `defId` (`reduceComposition`); omitting it keeps last-group LIFO.

`canEngage` rejects legion↔fleet through the normal path (`cross_kind_engage_not_allowed`). Boarding is a separate action (`POST .../forces/:legionForceId/board`, `domain/combat/boarding.mjs`) — crew is militia-shaped, persisted as `crewCount` on the ship group at raise time (first-pass `tier × crewPerTier`, `crewPerTier: 5`). Not a GMap port.

**Movement** (`movement.mjs`): instant hop-radius teleport — GMap `forceMovement` core (`hopDistance` / `systemsWithinMoveRange` / `completeForceTravel` writes `systemId`, no in-transit state). Engine → range and fuel → movement-points are **new design** (not in GMap): a pool spent across multiple same-turn moves, refilled to max every turn regardless of location. First-pass tables: `content/core/rules.json` `movement`. Route: `POST .../forces/:forceId/move`. Tech-gating engines (mirrors `weapon.*` slots) is a follow-up; this pass stores flat `engineTier`/`fuelTier`. Cross-system power-projection is unblocked by the links graph and is **not** built here.

**Not attempted this pass**: AP gating (this project hasn't ported GMap's AP-budget system anywhere — same scope cut as `domain/planets`' colonize/build), ground-unit stat-shape compatibility with `domain/combat`'s `roleMatchups.mjs` (GMap's `units.json` ground stats use `defense`/`speed`, not `armor`/`accuracy`/`shields` — a pre-existing content-shape gap between combat and ground units, not introduced here, not solved here; the kind guard stops that gap from producing fake legion↔fleet blowouts). Same-kind legion vs legion still fights with those missing axes. Race-dependent crewlessness is deferred.
