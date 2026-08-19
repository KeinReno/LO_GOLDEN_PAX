---
name: gmap-economy-canon
description: >-
  GMap economy/buildings/polity balance canon. Use when changing economy_balance,
  buildings, deposits, labor, peg, techTiers, flow, production UI, or live faction
  stocks. Do not invent parallel formulas.
---

# GMap economy canon

SoT: `GMap/content/core/economy_balance.json` + `GMap/docs/BALANCE_BASELINE_SPEC.md`.
Runtime: `economyTick` → `flowBreakdown` → `flowEngine` / `depositExtract` / `laborAllocation` / `populationScale`.
Do not load `GMap/data/turns/**` or sqlite.

## Invariants

1. **Spend language:** build/force/station = `metal`+`supply`. A–F = flows/tax/science.
2. **Census ≠ labor:** `planet.population` is lore heads. Jobs/ambient/raise use `laborPopulation()`: `floor(census/1000)` when `censusLocked` or `census≥10_000`. Majors **400k–600k** heads.
3. **Mine opens A only** (`extractsCategory:"A"`). Named deposit needs a matching building (`depositExtract`). Belt + mining station uses `skipExtractGate`.
4. **Extract tier ceiling:** `max(freeBuildTier=3, techTiers[cat])`. Own `treasuryPeg` deposit skips the tech ceiling (building gate still applies). T4+ non-peg stays gated.
5. **Labor:** `laborSlots` or `max(1,tier)`. Housing (`residential`/`habitat`) is not workers. Pin = `assignedLabor`. Yield × staffed fraction.
6. **Peg** runs after all factions extract. Do not mint pop or A–F from UI heuristics.
7. **Buildings:** metal in `metalByTier` ±25/35% (`lint:balance`). `yield_flat` ≤ `yieldFlatByTier × volumeBonusMult`. T1–T3 buildings have no tech-gate (`freeBuildTier`).
8. **UI** (`productionData.ts`) must use the same gates as the flow engine — never `tier` as fake rate for ungated tiles.

## Checks

From `GMap/`: `npm run lint:balance` · `npm run test:labor` · `node scripts/audit-economy-live.mjs`

Do **not** run `apply*Economy.mjs` (they inflate slots). Live census scripts only with `--apply` and owner OK.

## Polity "logical shape"

A playable major: census in band, laborNeed ≲ laborUnits on cores, signature peg extracts if a matching extractor exists, T1–T3 generic ores extract, stocks not exploding from ambient-on-census.
---
