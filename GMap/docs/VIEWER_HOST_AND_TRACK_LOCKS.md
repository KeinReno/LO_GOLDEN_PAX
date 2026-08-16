# Viewer host canon + Track A/B file locks

> Decision log · 2026-08-09 · Implements Wave 0 of subagent economy plan.

## Host canon (rooms)

| Surface | Host | Notes |
|---------|------|--------|
| Rooms (Экономика, Наука, Силы, …) | **WorkbenchShell** (desktop) + **BottomSheet** (phone) | Single path; no second Floating room for Economy |
| Edge widgets (planet/HQ cards, small inspectors) | **FloatingPanel** | Action-at-source / drill widgets only |
| Map board | Pixi `MapCanvas` under shell | Never replaced by a room UX |

`ECONOMY_SECTION_SPEC.md` §3.2 (Floating + Rnd + snap as room host) is **superseded for shell only**. Sidebar 1–5, gestures, intents, §15 acceptance content remain in force.

## Track locks

### Track B — UI (owns)

- `src/viewer/ViewerPage.tsx` (room/gesture wiring only)
- `src/renderers/MapCanvas.tsx`
- `src/ui/gestureMap.ts`, `DropZone.tsx`, `DragCard.tsx`
- `src/viewer/FleetOrderRing.tsx`, `ViewerContextMenu.tsx`
- `src/ui/WorkbenchShell.tsx`, `BottomSheet.tsx`
- `src/viewer/economy/**`
- `src/viewer/buildEconomySignals.ts`, `EconomySignalPopover.tsx`

### Track A — model redesign (owns)

- `server/flowEngine.mjs`, `economyTick.mjs`, `ledger.mjs`
- `server/marketRates.mjs`, `economyPending.mjs`
- `content/core/economy_schema.json`, `economy_balance.json`, `map_resources.json`, `faction_currency_bindings.json`
- `src/state/economyLabels.ts` (additive labels only)

### Do not touch in either track until A6

- `server/combatResolve.mjs`, diplo panels, full `technologies.json` path clustering

## Spec sources

| Track | Truth |
|-------|--------|
| B UI | `UI_SYSTEMS_MASTER_SPEC.md`, `ECONOMY_SECTION_SPEC.md`, skill `strategy-game-ui` |
| A model | `ECONOMY_TECH_REDESIGN_SPEC.md` §13 |
