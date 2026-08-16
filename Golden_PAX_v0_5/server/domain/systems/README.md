# domain/systems

Hyperlane graph, supply range, and the display-only map coordinates that
ride alongside. Ported from GMap `pathfinding.mjs` / `logistics.mjs`.

**Inputs/outputs**: plain data in (`world` with `systems` + `links` +
optional `factions`/`relations`), plain data out. No DB/HTTP —
`server/campaign/systemLinksStore.mjs` + `planetStore.mjs` persist,
`server/api/routes/campaign.mjs` exposes GM CRUD.

`x`/`y` on a system are display-only. Pathfinding, logistics, and
movement never read them. Sectors (GMap cosmetic map regions) are
deferred this pass — no table, no mechanic.

## Status

- `pathfinding.mjs` — byte-parity port of `linkAllowsTravel` /
  `neighborIds` / `hopPath`.
- `logistics.mjs` — behavior port of capital-rooted BFS supply,
  hop-decayed `supplyLevel`, disconnected production/upkeep/combat-def
  multipliers, depot range bonus, `logistics_range_add` trait bonus
  (0 when trait data is missing). Wired into `flowIncome.mjs` (per-system
  scale before the faction modifier stack) and `resolveExchange.mjs`
  (defender-side power, system owner only).

Cross-system power-projection (attacking an adjacent system, defense
installations) is newly unblocked by this graph and is **not** built here.
