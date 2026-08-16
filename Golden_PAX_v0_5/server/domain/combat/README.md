# domain/combat

Engagement resolution: role-matchup power, property (weapon/shield/hull) multipliers, stances, casualty absorption, veterancy. Ported from `GMap/server/combatResolve.mjs` and `GMap/server/dice.mjs`, validated against `GMap/content/core/combat_matchups.json`, `combat_property_matchups.json`, `combat_stances.json`.

**Inputs/outputs**: plain data in (two sides' unit-stack groups + stances), plain data out (outcome + updated groups + casualty log). No DB/HTTP here — callers are `server/api/routes/combat.mjs` (stateless preview) and `server/api/routes/forces.mjs` (persisted engage + boarding). Boarding (`boarding.mjs`) is new design, not a GMap port: it feeds a synthetic militia crew into `resolveExchange` unmodified.

**Multiplayer**: an exchange always names both sides explicitly (`factionIdA`/`factionIdB`) — never "player vs the map."

## Status: real formulas, one exchange at a time — same discipline as domain/economy and domain/tech

What's ported **with a byte-parity test against GMap** (all exported and pure in GMap, diffed directly):

- `propertyMatchup.mjs`'s `propertyCombatMult` — weapon/shield/hull property multiplier
- `veterancy.mjs`'s `veterancyConfig` / `levelFromXp` — XP thresholds
- `casualties.mjs`'s `applyCasualties` — damage absorption/casualty math
- `dice.mjs`'s `rollSuccess` / `formatDiceMessage` (the deterministic half of dice.mjs; `rollDie`/`rollDice` use real crypto randomness, so those are bounds-tested instead, see `dice.test.mjs`)

What's ported **as a behavior test** (module-private in GMap, or reshaped enough that a direct diff isn't meaningful — each test file's header says which and why): `roleMatchups.mjs`'s `rolePower`/`totalPower` (the actual "who's winning" formula — module-private in GMap despite being central), `stance.mjs`, and the reshaped `applyVeterancyToGroup`/`awardVeterancyXp` (GMap writes XP through a `.ref` to a persistent composition stack this project doesn't have yet — XP lives directly on the group here instead).

**Found via a real 10-turn playtest, fixed**: `casualties.mjs`'s `removeDestroyedGroups` prunes fully-destroyed (`count: 0`) stacks — ported in spirit from GMap's `cleanupEmptyComposition`. Without it, re-fighting an already-annihilated side (a zero-count entry left in the array) made the *attacker's* power collapse to 0 too, via `roleMatchups.mjs`'s enemy-role weighting degenerating instead of falling back to neutral. `resolveExchange` now always returns pruned groups and requires callers to pass pruned groups in — see its own header for the exact failure mode.

`resolveExchange.mjs` composes all of the above into one round of combat — real power calc, property multipliers, stance effects, retreat check, casualties, veterancy, win/draw thresholds (58%/42% power share, or total wipeout) — matching GMap's `resolveEngagementFight`. What it deliberately doesn't do, same scoping as the other two domains:

- no stationary defense units (`gatherDefenseUnits` needs planet/building data)
- no power-path mind-strike multiplier (`collectPowerMindStrikeMult`)
- no loyalty-driven garrison defection (needs system/planet loyalty)
- single exchange only — no theater/assault-phase state machine (bombard → landing → ground → occupation) or persisted engagement state (`GMap/server/engagements.mjs`, `engagementReconcile.mjs`)
- no card-battle mini-game (`GMap/server/cardBattle.mjs`, 2500+ lines — a separate system entirely, not attempted here)

**Next**: the deferred pieces above are blocked on the same unported world/planet/building model as `domain/economy`'s flow engine — porting the engagement state machine on top of `resolveExchange` doesn't need that model and could come next.
