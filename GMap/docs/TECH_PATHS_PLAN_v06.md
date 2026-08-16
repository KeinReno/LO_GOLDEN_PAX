# Tech Paths (A6) — v0.6 pilot + cluster

> Spec: `ECONOMY_TECH_REDESIGN_SPEC.md` §10 · skill `technologies-content`

## Landed

| Piece | Status |
|-------|--------|
| Path defs `tech_paths.json` | structural / energy |
| Breakthrough + signature techs | `tech.path.*` |
| Effect `open_path` | schema + applyUnlockEffects |
| RoleScore gate + researchPath gate | `techPaths.mjs` |
| Payload `openPaths` | ledger |
| UI Progress + Прорыв | ResearchOverview |
| **Cluster era3+ B/D** | 4 structural + 4 energy live techs tagged `researchPath` |
| **Race affinity** | `tech_paths.raceAffinity` — cheaper research, not a lock |
| **Research offers** | 3 frontier techs per **6 player-facing directions**; A–F remain economy categories; 1 reroll; ×1.5 cognitio outside offer (`techOffers.mjs` + `tech_directions.json`) |
| **Tech grades 1→5** | `techGrades.mjs` scales `collectTechModifierEffects` (`args.mult`/`amount`). Does not revive `.efficiency`/`.austerity` |
| **Tech sockets** | Instant fill/swap after research; empire-wide upkeep-category swap via `addUpkeepDemand` (`techSockets.mjs`) |

### Affinity (examples)

| Race | Path | Mult |
|------|------|------|
| race_karned | structural | 0.9 |
| race_belator | energy | 0.9 |
| race_synth | energy | 0.92 |
| race_swarm | structural | 0.95 |

Early era 1–2 techs remain untagged (sandbox intact). Offers use live (non-`catalogPending`) techs with prereqs met; stubs stay in the matrix at the bypass premium (×1.5 cognitio).

### Catalog clustering rule (`generateTechCatalog.mjs --cluster`)

1. **Era 1–2** catalogPending stay untagged (sandbox).
2. **Era 3+ B** → `researchPath: structural` (+ tags `path:structural`, `path_cluster`).
3. **Era 3+ D** → `researchPath: energy` (+ tags `path:energy`, `path_cluster`).
4. **A / C / E / F** stay untagged until more paths exist (universal pool).
5. Catalog era N must not prereq a **live** tech of era > N — remap to same-era live opener.
6. Empty era-1 seeds prereq the live era-1 opener.

`--fill=A` (one slice): drop `catalogPending` on category A, live-scale dictionary effects, schema properties (`optics` / `info_store`), era-1 A prereq live opener so they enter A offers after geology.

### Cluster (content)

**structural (live):** crystal_integration, hybrid.cold_foundry, metamaterials, black_iron_forges (+ hull doctrine)  
**structural (catalogPending era 3+):** 41 B stubs tagged, not yet filled  
**energy (live):** fusion, hybrid.void_interface, antimatter, antimatter_singularity (+ reactor doctrine)  
**energy (catalogPending era 3+):** 42 D stubs tagged, not yet filled  
**Filled slice:** category A (66 catalog rows) — live effects, in A offers when prereqs met

## Still open

- Path-signature catalog for the 6 new roles (clusters stay empty)
- Breakthrough cost scaling with # open paths
- Remaining catalogPending slices (B–F)
- Threshold calibration after more live turns (currently 5000)
