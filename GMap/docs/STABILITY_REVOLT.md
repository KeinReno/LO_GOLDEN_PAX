# 3-stage stability revolt

v0.5 `STABILITY_AND_REVOLT_SPEC` ported into GMap. **Loyalty is not deleted.** Occupation already writes `planet.stability`; that field is the revolt meter. `stability_add` still sums into planet loyalty 1:1 (`stability.mjs`).

## Stage formula

Each inhabited owned planet, per tick (`stabilityRevolt.mjs`):

```
stability' = clamp(stability + naturalDecay + Σstability_add + (loyalty < 20 ? loyaltyCollapseDrain : 0), 0, 100)
```

Defaults (`content/core/economy_balance.json` → `stability`, else code constants):

| Symbol | Default |
| --- | --- |
| starting / unset | 50 |
| naturalDecay | −1 |
| loyaltyCollapseDrain | −2 if `loyalty < 20` |
| Stage 0 | `stability ≥ 40` |
| Stage 1 | `25 ≤ stability < 40` → `production_mult` 0.85 |
| Stage 2 | `stability < 25` → spawn militia from **lost population** |
| Stage 3 | Stage-2 force still alive for 3 turns → secession |

Rebel count = `min(pop, max(1, floor(pop × 0.2 × (25 − stability) / 25)))`. That count is deducted from `planet.population` (not thin air). Composition is `unit.militia` via boarding `syntheticCrewGroup`. Stance `retreat` reuses combatResolve’s existing &lt;80% disengage.

NPC faction id `rebel.<planetId>.<turn>` is minted at Stage 2 so the legion has a real `factionId`; Stage 3 transfers planet (and system if nothing remains).

## loyalty &lt; 20

`checkRevolt` no longer rolls or spawns. Low loyalty only **drains** the stability meter. High loyalty does not block a Stage-2 occupation crash.

`server/revolt.mjs` is a compatibility re-export of this module — one spawner (`applyStabilityRevolt` after `runLoyaltyPhase` in `processTurn.mjs`). Stage 1 production is `collectRevoltProductionEffects` in `economyTick.mjs`.

Check: `node --test server/stabilityRevolt.test.mjs server/stability.test.mjs` (from `GMap/`).
