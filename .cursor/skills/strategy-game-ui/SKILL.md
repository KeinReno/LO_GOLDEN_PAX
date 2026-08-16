---
name: strategy-game-ui
description: Design system + 4X UI patterns for LO_GOLDEN_PAX GMap. Use for any UI work on editors/viewer/HUD — Inspector, IntentsInbox, SystemDossier, PlayerHqPanels, PlayerPlanetManage, ViewerContextMenu, Toolbar, TopBar, TurnStampHud, MapCanvas overlays. Encodes tokens, component anatomy, action-at-source, keyboard-first, progressive density, intentional friction, offscreen-event indicators, a11y.
---

# Strategy Game UI — LO_GOLDEN_PAX

Interface must serve a 500-hour game: work for a new player AND a 12th-playthrough veteran.

## Design tokens (single source of truth)

Define once in `app.css` :root, reference everywhere. Never inline hex in components.

- Surfaces (elevation): --surface-map (0), --surface-panel (1), --surface-overlay (2), --surface-modal (3), --surface-tooltip (4).
- Lines: --line-hairline, --line-strong, --line-accent.
- Text: --text-primary, --text-secondary, --text-muted, --text-inverse.
- Semantic: --signal-move (blue), --signal-build (green), --signal-attack (red), --signal-raid (orange), --signal-warning (amber), --signal-neutral (gray).
- Spacing rhythm: --space-1..--space-8 on a 4px base. Panel padding --space-4. Grid gap --space-3.
- Type: --font-ui (sans, high x-height), --font-mono (labels, tabular numerals), --font-display (rare, headings only). Scale: --text-xs/sm/base/lg/xl/2xl.
- Radii: --r-sharp (0–2px for technical), --r-soft (6–8px for cards). Do not mix in adjacent frames.
- Motion: control 160–220ms, state change 300–500ms, section 500–760ms. reduced-motion → instant settled states.

## Component anatomy (map to existing files)

- Inspector.tsx — right-docked detail panel. Summary by default, drill-down sections. ID-referenced defs, never inline stats.
- IntentsInbox.tsx — queue of player orders. Each row: intent type icon, source→target, ETA/turn, status, cancel (with friction if irreversible).
- SystemDossier.tsx — diagnostic/lore view. Monochrome wireframe aesthetic (technical-wireframe-info-layout). Connector annotations to map entities.
- PlayerHqPanels.tsx / PlayerPlanetManage.tsx — command widgets at screen edges. Widget-based, not modal.
- ViewerContextMenu.tsx — action-at-source. Right-click planet → context card with buttons (Build/Dispatch/Colonize/Raid). This is the primary interaction surface.
- Toolbar.tsx / TopBar.tsx — global navigation. F1–F9 hotkeys visible on each tab.
- TurnStampHud.tsx — turn/economy indicator. Always visible. Pulses on tick.
- MapCanvas.tsx overlays — selection ring, intent arrows, combat telegraphs. Effect registry by ID (see create-game-vfx skill).

## 4X UI patterns (apply to every feature)

1. Action-at-source: put the button where the player is already looking. New action → first ask "can this be a button on the context card at the clicked entity?" before adding a screen.
2. Keyboard-first: every primary screen gets F1–F9. Event choices get 1/2/3. Hotkey visible in the UI next to the label.
3. Progressive density: summary by default. Drill-down only on demand. Never list 8 items when one grouped icon + count suffices.
4. Widget-based: prefer edge-anchored widgets over nested modals. A modal is a last resort for irreversible/confirms only.
5. Intentional friction: irreversible actions (demolish, declare war, disband) use press-and-hold or a confirm step. Routine actions stay single-click.
6. Offscreen indicators: idle fleets, completed builds, attacks, economy thresholds must surface a notification. Nothing important happens silently offscreen.
7. Semantic elevation: toolbar ≠ modal ≠ tooltip — use the surface tokens, not ad-hoc darker/lighter.
8. State completeness: every component supports loading, empty, error, stale-data, disabled, and reduced-motion states. (From operational-enterprise-ai skill.)

## Accessibility (bake in, not review in)

- WCAG 2.2 AA contrast minimum.
- Keyboard reachable for every action; visible focus ring.
- Touch alternative for drag-only (per build-game-inventory skill).
- Reduced-motion: instant settled states, no shake/parallax.
- 200% zoom must not break layout.
- Tabular numerals for all numeric stats (mono font).

## Do / Don't

- DO reference defs by ID in UI; DON'T copy stats inline.
- DO put action at the clicked entity; DON'T force navigation to a screen.
- DO show summary + drill-down; DON'T dump all data points at once.
- DO use the token set; DON'T introduce one-off hex values.
- DO add friction for irreversible actions; DON'T add friction for routine.
- DO surface offscreen events; DON'T let important things happen silently.
- DO keep widget-based layout; DON'T regress to nested modals.

## Workflow when touching UI

1. Identify which existing component this belongs in (anatomy map above).
2. Check: can this be action-at-source on a context card? Prefer that.
3. Assign a hotkey and show it in the UI.
4. Default to summary; add drill-down.
5. Use tokens, not inline values.
6. Implement all states: loading/empty/error/stale/disabled/reduced-motion.
7. If irreversible → add friction.
8. If offscreen event → add notification.
9. Verify keyboard + 200% zoom + reduced-motion.
