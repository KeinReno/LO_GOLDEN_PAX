# domain/tech

Technology research: spend Cognitio (and other listed costs) → unlock techs, tiers, properties. Ported from `GMap/server/techActions.mjs`, validated against `GMap/content/core/technologies.json`, `tech_schema.json`.

**Inputs/outputs**: plain data in (a faction's tech account, its current stocks, a tech id), plain data out (updated tech account + stocks + a spend journal). No DB/HTTP here — `server/api/routes/tech.mjs` is the only caller.

**Multiplayer**: each faction researches independently; `techAccount`/`stocks` are always for one named faction, never a shared/global pool.

## Status: real formulas, simplified inputs — same discipline as domain/economy

What's ported **with a byte-parity test against GMap** (all three genuinely pure and exported/callable-without-world-access in GMap, so diffed directly rather than re-derived):

- `resolveTechDef.mjs` — live-tree/combo lookup
- `prerequisites.mjs`'s `researchPathTo` — prerequisite DFS + raw cognitio cost sum (GMap's version only touches world/ledger in an optional branch this port doesn't use)
- `unlockEffects.mjs` — the `unlock_tech_tier` / `unlock_property` effect handling (the `open_path` case is excluded, see below)

What's ported **as a behavior test** (GMap's original is module-private or otherwise not diffable — see each test file's header): `afford.mjs`'s `canAffordCost`.

`researchTech.mjs` composes all of the above into GMap's real `researchTech` flow, minus the parts that need systems not built yet:

- `raceLock`/`requireProperties` locks **restored 2026-08-14** (`techLocks.mjs`, see `notes/2026-08-14-tech-tree-audit.md`) — `factionTraitLock` still NOT restored (`factions` table has no `traits` field, no data source)
- no tech/civic-path gating (`checkPathGate`, `applyOpenPathEffect` — a separate progression system, `power_paths`/`civic_paths`)
- no `research_cost_mult` modifier-stack adjustment (needs `buildModifierStack` + race/culture/faith effects — the same modifier stack `domain/economy`'s flow engine is blocked on)
- no hybrid-lineage checks (`domain/tech`'s alchemy/hybrid sibling system, `hybridRegistry.mjs`)
- no world mutation for `unit_upgrade` effects (needs the unported unit/fleet model)

Costs paid are the tech's raw content cost — not adjusted by any modifier stack yet, same caveat as `domain/economy`'s `categoryIncome` input.

**2026-08-14 Tech Tree 2.0 (NOT a GMap port):** `techGrade.mjs` (1→5 ladder replacing dead upgrades), `techSocket.mjs` (empire-wide resource sockets), `techOffers.mjs` (6-direction offer/reroll + cognitio bypass). `unlockedUpgrades` is gone. Content authoring of the 387 catalog stubs is still deferred — mechanics run against backbone techs + a handful of `tech.fixture.*` entries. Military unit gating lives in `domain/forces/recruitment.mjs` (5a/5b); anti-role bonuses in `domain/combat/roleMatchups.mjs` (5c). Cross-system power-projection is out of scope (no adjacency schema).
