# 3-stage stability revolt ↔ loyalty

v0.5 `STABILITY_AND_REVOLT_SPEC` port. The **planet `stability` meter** is the only revolt machine. Loyalty is not deleted.

## Meter

`planet.stability` 0–100 (occupation already writes this: −3 from baseline 50). Unset → start at 50. Loyalty is **not** this number.

**Tick:** `clamp(value + naturalDecay(−1) + Σ stability_add + (loyalty < 20 ? −2 : 0))`. Idempotent per `world.meta.turn`. `stability_add` still also goes 1:1 into **loyalty** (display).

**Bands** (`content.economy_balance.stability`):

| Stage | When | Effect |
|---|---|---|
| 0 | `value ≥ 40` | none |
| 1 | `25 ≤ value < 40` | faction `production_mult` 0.85 |
| 2 | `value < 25` | `production_mult` 0.75 + spawn militia from **spent population** |
| 3 | duration, not a band | secession when `turn ≥ stage2SinceTurn + 3` |

Stage 2 replaces Stage 1. Production averages only planets actually in stage ≥1 (one hotspot → whole faction, v0.5-like).

## Rebels

`lostPop = max(1, floor(pop × 0.2 × (25 − stability) / 25))` deducted from the planet. Composition = boarding `syntheticCrewGroup` / `unit.militia`. Stance `retreat` (existing <80% power disengage). NPC faction `rebel.<planetId>.<turn>`. Stage 3 transfers the planet (remaining pop stays on it).

## Loyalty `< 20`

Still computed, displayed, and used for combat garrison defection. **Does not spawn rebels.** `checkRevolt` returns `revolt_deferred`. Low loyalty only **drains** the stability meter (−2/turn on top of −1 decay), so a 50-stability world with loyalty 10 reaches stage 2 in ~9 turns, not instantly.

Check: `npm run test:stability-revolt` from `GMap/`.
