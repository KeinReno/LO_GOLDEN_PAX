# `stability_add` → loyalty

GMap already stacked `stability_add` as modifier channel `stability` (`modifierStack.mjs`).

**Loyalty consumer:** `stabilityLoyaltyDelta` in `computePlanetLoyalty`. Formula: `loyalty += Σ stability_add.amount`, clamp 0–100.

Occupation `planet.stability` is **not** added into loyalty. That field is the 3-stage revolt meter (`stabilityRevolt.mjs`). See `docs/STABILITY_REVOLT_STAGES.md`.

Sources (planet-scoped unless noted): race traits, culture, buildings, system POIs, faction doctrine traits, `faction.activeEffects` (faction or matching system).

Old `loyalty < 20` chance-roll spawn is gone.

Check: `node --test server/stability.test.mjs` and `npm run test:stability-revolt` (from `GMap/`).
