---
name: game-nav
description: Navigate GMap gameplay codebase — systems, entrypoints, content→server→UI flow. Read BEFORE broad Read/Grep on game code.
---

# GMap navigation

## Order
1. `agent-tasks/MEMORY.md` + `PROJECT.md` §2 if cold start.
2. CBM `search_graph` / `trace_path` (project `C-Users-Reno-Desktop-LO_GOLDEN_PAX`) before mass Grep.
3. Tiny docs: `GMap/docs/agents-roadmap/README.md`, track TASKS — not whole lore vault.
4. Targeted code with `offset`/`limit`. **Never** forbidden loads (token-economy).

## Entrypoints
| Layer | Start here |
|-------|------------|
| HTTP/API | `GMap/server/serve.mjs` → `api.mjs` |
| Tick/sim | `processTurn.mjs`, `economyTick.mjs`, `combatResolve.mjs`, `orderEngine.mjs`, `techPaths.mjs`, `civicTick.mjs` |
| Content load | `contentLoader.mjs` + `GMap/content/core/*.json` |
| Client boot | `GMap/src/main.tsx` → `worldStore.ts` |
| Map view | `renderers/MapCanvas.tsx` (fragment only) |
| Player UI | `src/viewer/*` |
| GM UI | `src/editors/*` |

## Data flow (default mental model)
**Intent/UI → API (`intents`/`planetActions`/…) → sim tick → ledger/race state → `worldStore` / payload → viewer panel.**

## Content
- IDs live in JSON (`technologies`, `units`, `buildings`, `races`…). UI must not hardcode tech ids — see skill `technologies-content` when editing techs.
- Grep by id/string inside large JSON; do not Read whole `technologies.json`.

## Lore vs game
- Prose/canon → `00_Канон/`, `02_История/` (priority in root README). Do not dump entire chapters unless the task is lore.
- Game balance/systems → `GMap/` only.

## Stop
If about to Read binary, sqlite, full CSS, or >400-line file whole — stop; narrow scope.
