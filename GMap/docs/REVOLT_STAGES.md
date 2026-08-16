# 3-stage revolt (GMap)

One revolt machine: **planet `stability` (0–100)** in `server/stabilityRevolt.mjs`. Loyalty stays a display/input (and combat defection). Occupation writes `planet.stability` (−3 from 50). `stability_add` still also adds 1:1 into **loyalty**.

Replaces the old `loyalty < 20` + `revolt_risk` chance-roll spawn. Ticked from `processTurn` after `runLoyaltyPhase`. Stage 1 production is `collectRevoltProductionEffects` in `economyTick`.

See `docs/STABILITY_REVOLT_STAGES.md` for the formula.

`server/revolt.mjs` is a compatibility re-export of that module.

Check: `npm run test:stability-revolt` from `GMap/`.
