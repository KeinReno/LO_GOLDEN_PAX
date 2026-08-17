# File Decomposition — Continuation Spec

> **Handoff micro-spec for an implementing agent (Claude).**
> **Source Discovery:** live file-size sweep 2026-08-17 (`find server -name "*.mjs" | xargs wc -l`, same for `src/`), cross-referenced against `agent-tasks/_archive/status/2026-08-16.md`'s "modularization: api + processTurn + MapCanvas" entry (the pattern already proven to work in this repo) and `.cursor/rules/token-economy.mdc` (why this matters here: several of these files are on that rule's explicit "forbidden whole-file load" list, meaning every agent touching them already pays a narrow-read tax — splitting them removes the tax at the source).
> **Owner context:** owner is low on Cursor usage limits and wants this continued by a separate Claude session/agent, in parallel with other GMap correctness work happening in this same `agent-tasks/` track.

---

## 1. Why this exists, and what "done" already looks like

This repo already proved the pattern once (`_archive/status/2026-08-16.md`):
- `server/api.mjs`: 3700+ → 936 → **871** lines (route handlers extracted into `server/routes/*.mjs`, ~20 files, dispatched via `tryHandle*Routes(req,res,url,ctx)`).
- `server/processTurn.mjs`: → **~297** lines.
- `src/renderers/MapCanvas.tsx`: 4393 → **~1297** + extracted `src/renderers/mapCanvas/redrawAll.ts` (1674 lines) and `bindMapInput.ts` (1203 lines) + `src/renderers/drawMapIcons.ts` (1448 lines).
- `src/viewer/ViewerPage.tsx`: 5616 → **9 lines** (now a thin composition shell; the real panels live as their own files under `src/viewer/*`).

**This is not a from-scratch redesign** — it's the same extraction pattern, continued onto the files that haven't had it applied yet. Do not invent a new architecture; match what's already there (thin entry/composition file + cohesive extracted modules by sub-responsibility, same relative-import style, same "routes/dispatch" or "layer function" shape depending on whether it's server or renderer code).

**Not a hard line-count law.** Nothing in `PROJECT.md` states an exact max (unlike `Golden_PAX_v0_5/CLAUDE.md`'s explicit ~400-600 rule — that's a different repo's convention, don't import it here uncritically). The real, observed target in this repo's own history is "meaningfully smaller and split by sub-responsibility," landing most files in the low hundreds to ~1300 for genuinely complex ones (see `MapCanvas.tsx` above). Use judgment; don't chase an arbitrary number at the cost of a bad split.

---

## 2. Current oversized-file inventory (live sweep, 2026-08-17)

### Server (`GMap/server/*.mjs`, 18 files > 600 lines)

| Lines | File | Notes |
|---|---|---|
| 2932 | `cardBattle.mjs` | **Largest file in the repo.** Last touched today (2026-08-17) as part of the labor/census batch — not stale legacy debt, actively maintained. No dedicated `cardBattle.test.mjs`; covered indirectly by `cardBattleAuras.test.mjs`/`cardBattleTrophies.test.mjs` (`npm run test:card-battle`). Go carefully — this is the CCG/combat-card resolution engine, correctness-critical. |
| 1512 | `narrative.mjs` | |
| 1391 | `engagements.mjs` | Combat engagement persistence — correctness-critical, see §3 caution list. |
| 1318 | `economyTick.mjs` | Core per-turn economy pass — correctness-critical. |
| 1260 | `playerShare.mjs` | |
| 1211 | `combatResolve.mjs` | Combat math — correctness-critical, has `npm run test:combat-role` + others. |
| 1161 | `planetActions.mjs` | |
| 986 | `techActions.mjs` | |
| 936→871 | `api.mjs` | Already in progress per the archive note above — confirm current size before re-splitting, may already be at a reasonable stopping point. |
| 812 | `diploOffers.mjs` | |
| 797 | `ledger.mjs` | |
| 771 | `intel.mjs` | |
| 676 | `questEngine.mjs` | |
| 640 | `gmCockpit.mjs` | |
| 630 | `normalizeWorld.mjs` | World-load normalization — every field this touches is load-bearing, go carefully. |
| 628 | `stabilityRevolt.mjs` | Just had a real bug fixed here today (`standDown` was called but undefined) — read the file's current state before splitting, don't reintroduce a similar gap. |
| 618 | `orderEngine.mjs` | |
| 608 | `courtGovernance.mjs` | |

### Client (`GMap/src/**/*.{ts,tsx}`, 44 files > 600 lines — top priority ones)

| Lines | File |
|---|---|
| 2406 | `viewer/MarketPanel.tsx` |
| 2348 | `state/worldStore.ts` |
| 1838 | `viewer/CardBattleTable.tsx` |
| 1793 | `state/types.ts` |
| 1674 | `renderers/mapCanvas/redrawAll.ts` (already an extracted submodule — still large, could split further) |
| 1668 | `editors/SystemSchematic.tsx` |
| 1664 | `editors/SystemView.tsx` |
| 1588 | `viewer/RpStage.tsx` |
| 1563 | `state/resourcePool.generated.ts` (generated — confirm before touching, may not be hand-editable) |
| 1490 | `editors/gm/GmCourtPanel.tsx` |
| 1448 | `renderers/drawMapIcons.ts` |
| 1369 | `renderers/MapCanvas.tsx` (already reduced from 4393 — further splitting optional) |
| 1308 | `editors/Toolbar.tsx` |
| 1295 | `viewer/CourtPanel.tsx` |
| 1220 | `viewer/RpGmDesk.tsx` |
| 1203 | `renderers/mapCanvas/bindMapInput.ts` |
| 1178 | `viewer/ResearchPanel.tsx` |
| 1121 | `editors/RpChat.tsx` |
| 1057 | `viewer/PlanetRadialSlots.tsx` |

30-something more files sit in the 600-1000 range (`PlayerHqPanels.tsx`, `GmSystemsPanel.tsx`, `PlayerPlanetManage.tsx`, `PolityEditor.tsx`, `StudioEffectEditor.tsx`, `ForcesDeck.tsx`, `GmHealthExtras.tsx`, `StockpileSection.tsx`, `DealDesk.tsx`, `Inspector.tsx`, `TopBar.tsx`, `SystemEditor.tsx`, `contentCatalog.ts`, `useCampaignSession.ts`, `holoTheme.ts`, `UnitCardsStudio.tsx`, `NpcCard.tsx`, `useViewerUnitOrders.ts`, `mapLayers.ts`, `MapContextMenu.tsx`, `GmCatalogEditor.tsx`, `QuestsSection.tsx`, `ViewerPlaySession.tsx`, `AlchemyLab.tsx`, `TechGraphCanvas.tsx`, `BattleSimulator.tsx`) — re-run the sweep command below for the exact current list before starting; this table is a snapshot, not a live source of truth.

To regenerate the live list at any time:
```bash
cd GMap
find server -name "*.mjs" -not -name "*.test.mjs" | xargs wc -l | awk '$1>600' | sort -rn
find src -name "*.tsx" -o -name "*.ts" | xargs wc -l | awk '$1>600' | sort -rn
```

---

## 3. How to split safely — this is a live, played game (turn 66+)

1. **One file at a time. Test after each one, not at the end of a batch.** Run the relevant `npm run test:*` script (see `package.json`'s scripts list — there's a targeted one for most subsystems) plus `npm run quickcheck` and `tsc --noEmit` (client) after every single file split, before moving to the next file. This repo's own status log shows this exact discipline being followed for every prior wave ("Сквозная проверка после слияния всех N... tsc --noEmit чисто, quickcheck 5/5").
2. **Behavior-preserving only.** This is refactoring, not a rewrite — same exports, same runtime behavior, same public function signatures. If you find a real bug while reading (like the `standDown` one found today in `stabilityRevolt.mjs`), flag it in `agent-tasks/STATUS.md`, do NOT silently fix it as part of a "just splitting files" pass — keep concerns separated so a review can tell which diff did what.
3. **Extract by sub-responsibility, not by line count.** Look for natural seams: a block of route handlers for one feature area, a set of pure helper functions, a distinct rendering layer, a cohesive state slice. Follow the existing precedent's shape:
   - Server: thin dispatcher + `server/routes/<area>.mjs` (matches `api.mjs`'s pattern) or a thin orchestrator + extracted pure-function modules (matches `processTurn.mjs`).
   - Client renderers: thin component/canvas-setup + extracted `<area>/<concern>.ts` modules (matches `renderers/mapCanvas/*`).
   - Client panels: thin composition shell + extracted sub-panel components (matches `ViewerPage.tsx` → 9 lines, real content moved into `viewer/*Panel.tsx`/`viewer/*Room.tsx` files).
4. **`cardBattle.mjs`, `engagements.mjs`, `combatResolve.mjs`, `economyTick.mjs`, `normalizeWorld.mjs`, `stabilityRevolt.mjs`** — these are marked correctness-critical in the table above. Extra caution: read the file's own header comment for any documented invariants first, and prefer smaller, more conservative extractions over one big reshuffle.
5. **Never touch `data/table.sqlite*`, `data/published.json`, or any live save data.** This is a decomposition pass on code, not on runtime state. If a test needs live data, read it read-only.
6. **Do not commit.** Same standing convention as every other entry in `agent-tasks/STATUS.md` this week ("Дальше: коммит по просьбе") — leave changes in the working tree, log progress in `STATUS.md`, let the owner commit explicitly.

---

## 4. Progress logging

Append one `agent-tasks/STATUS.md` entry per meaningful batch (not per file) — same format as existing entries (date header, **Статус**, **Сделано**, **Файлы**, **Дальше**). Example shape to follow, from today's own log:

```
### 2026-08-17 — modularization batch N: <area>
- **Статус:** landed, без коммита. `quickcheck` X/X. `test:<relevant>` X/X.
- **Сделано:** <file> N → M lines, extracted <new files>.
- **Файлы:** <list>
- **Дальше:** <what's still oversized / next batch>
```

If `STATUS.md`'s live section exceeds ~120 lines after your entries, move the oldest "Live" blocks into `agent-tasks/_archive/status/2026-08-17.md` (or a new dated file) per the file's own stated rule at the top.

---

## 5. Out of scope

- Any behavior change, bug fix, or feature work — this spec is decomposition only. A different work stream in this same `agent-tasks/` folder is already auditing/fixing correctness issues; don't overlap with it.
- `resourcePool.generated.ts` — confirm it's actually hand-maintained before splitting; if it's a build artifact, leave it alone regardless of size.
- Committing, pushing, or touching git history in any way.

---

## 6. How this gets checked

Whoever reviews this (owner or another Claude pass) will diff each split against the pre-split file's behavior: same exports importable from the same paths (or all call sites updated if a path changed), full relevant test suite green, `quickcheck`/`tsc --noEmit` clean, and a STATUS.md trail showing what moved where. A split that changes behavior "along the way" (even a tiny cleanup) is worse than no split — flag anything you notice instead of fixing it inline.
