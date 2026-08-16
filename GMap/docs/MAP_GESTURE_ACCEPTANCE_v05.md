# Map gesture acceptance — v0.5 (Track B · Wave B1)

Audit date: 2026-08-09. Scope: map board gestures only (`gestureMap.ts`, `MapCanvas`, `FleetOrderRing`, `ViewerContextMenu`).

## Checklist

| Gesture | Expected | v0.5 status |
|---------|----------|-------------|
| **Tap system** | Select; mobile opens bottom sheet | ✅ |
| **Double-tap system** | Drill into system (`onSystemOpen`) | ✅ |
| **RMB map** | `FleetOrderRing` when unit+target apply; else `ViewerContextMenu` | ✅ fleet + legion |
| **Long-press (touch)** | Hold ring → order ring or context fallback | ✅ passes `selectedLegionId` |
| **Drag fleet/legion** | `onUnitDrop` → direct submit (move/attack/claim) | ✅ |
| **Touch «Ход»** | Arm tap-to-move on next system | ✅ |
| **Pinch / wheel** | Camera zoom | ✅ |
| **Forces deck «Приказ»** | Opens order ring at unit (not queue modal) | ✅ fleet + legion |
| **Order queue (Q)** | Review/cancel pending; not required for routine orders | ✅ secondary |
| **Offscreen idle fleets** | `ViewerAlertFab` via `buildViewerAlerts` | ✅ existing hook |
| **Economy duplicate host** | Workbench vs Floating economy | ⏭ B2 — not in B1 scope |

## B1 fixes (this wave)

1. **Legion action-at-source** — `FleetOrderRing` + `resolveFleetOrderRing` now cover legions (move, attack, scout, claim, open system). RMB/long-press on own legion opens the ring instead of only the context menu.
2. **Forces deck legion path** — `onOrderWithLegion` opens the ring (mirrors fleet); removed pick-target + queue hop.
3. **Long-press with legion selected** — `onSystemHold` passes `selectedLegionId`.
4. **`MapContextPick.fromLegionHit`** — glyph hit disambiguation (parallel to `fromFleetHit`).
5. **`gestureMap.ts`** — comments aligned with map RMB/long-press → ring first.

## Known gaps (defer past v0.5)

- **Legion blockade / fortify / cancel-route** — editor-only today; not in viewer ring (fleet-only stance verbs).
- **Complex / multi-step orders** — still use queue popover (`Q`) or HQ forms (colonize, trade, RP).
- **Double-tap planet drill** — system dive only; planet manage is in-system UI.
- **Economy FloatingPanel + Workbench duplicate** — Track B2.
- **Keyboard chord for order ring** — no hotkey yet (RMB/long-press/drag only).
- **Legion claim** — claim ring item remains fleet-scoped (`submitDirectClaim` with optional fleet).
