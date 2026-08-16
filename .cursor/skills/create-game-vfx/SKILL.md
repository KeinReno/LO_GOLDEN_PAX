---
name: create-game-vfx
description: Create readable, performance-safe game visual effects. Use for attacks, impacts, damage feedback, status effects, spell trails, particles, shaders, telegraphs, quality tiers, and reduced-motion alternatives. Adapted for LO_GOLDEN_PAX: applies to canvas effects in MapCanvas/drawMapIcons (selection rings, intent arrows, combat flashes, economy ticks).
---

# Create Game VFX

Make the gameplay meaning visible before adding spectacle.

## Specify

For every effect define trigger, owner, duration, gameplay meaning, camera-distance silhouette, color hierarchy, spawn cap, cleanup rule, and reduced-motion equivalent. Separate telegraph, contact, success, failure, and lingering status visuals.

For LO_GOLDEN_PAX canvas: define effects per intent type (move, build, attack, raid), per economy event (production tick, shortage, surplus), and per combat outcome (hit, destroy, capture). Keep a stable effect registry so UI and simulation reference the same IDs.

## Implement safely

Pool short-lived objects, reuse materials/geometry, cap particles, and avoid per-frame allocation. Use additive/transparency sparingly around important UI and targets. Make cleanup idempotent so reset, death, and pause cannot leak effects.

## Verify

Test overlaps, multiple targets, rapid repetition, pause/resume, lowest quality, reduced motion, and touch viewports. Sample the live encounter for warnings, draw calls, frame time, and visual readability.
