# ViewerPage refactor blueprint

Owner recommendations (2026-08-16). **Do not mass-cut** `ViewerPage.tsx` (~5800). One hook/feature at a time.

## Target tree

```
src/viewer/
├── features/
│   ├── map-viewport/         # Pixi canvas, zoom, focus, overlays
│   │   ├── useMapViewport.ts
│   │   ├── MapOverlays.tsx
│   │   └── MapLayersPopover.tsx
│   ├── order-orchestrator/   # order queue, AP, validation, drag-to-map
│   │   ├── useViewerOrders.ts
│   │   ├── OrderTargetBanner.tsx
│   │   └── OrderConfirmDialog.tsx
│   ├── combat-flow/          # engagement init, intercept, stance
│   │   ├── useCombatEngagement.ts
│   │   └── ContactBattleModal.tsx
│   └── rooms-router/         # BottomSheet / WorkbenchShell rooms
│       ├── ViewerRoomHost.tsx
│       └── viewerRoomRegistry.ts
├── hooks/
│   ├── useViewerHotkeys.ts   # window keydown + isInputFocused gate
│   └── useViewerAuth.ts      # session, PIN, tokens
└── ViewerPage.tsx            # thin shell (< 250 lines)
```

## Agent rules

1. **One hook at a time.** First: `useViewerOrders` + unit test. Then: `useCombatEngagement`.
2. **Hotkeys:** `window.addEventListener("keydown")` lives in `useViewerHotkeys` with mandatory `isInputFocused` (no phantom fires in text fields).
3. **WebGL ↔ React:** MapCanvasApi ↔ UI only via light Zustand selectors (`useViewerChromeStore`, `useWorldStore`) — not 30 callbacks through 5 levels.
4. No ViewerPage rewrite dump; no gameplay weaken; commit only on request.

## Extraction order

1. `features/order-orchestrator/useViewerOrders.ts` (+ test) — done
2. `features/combat-flow/useCombatEngagement.ts` (+ ContactBattleModal) — done
3. Harden `hooks/useViewerHotkeys.ts` (`isInputFocused`) — done (file still `viewer/useViewerHotkeys.ts`)
4. `hooks/useViewerAuth.ts`
5. `features/map-viewport/*`
6. `features/rooms-router/*`
7. Thin `ViewerPage.tsx` shell
