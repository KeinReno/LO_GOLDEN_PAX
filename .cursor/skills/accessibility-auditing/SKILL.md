---
name: accessibility-auditing
description: >-
  Audit GMap HUD/panels via accessibility tree: labels, tab order, contrast,
  ARIA. Use when changing viewer/editor controls, dialogs, or icon-only buttons.
---

# Accessibility auditing

1. Snapshot the aria tree (browser_snapshot / Playwright).
2. **Critical:** icon buttons without `aria-label`; inputs without label; clickable `div`s.
3. **Keyboard:** Tab order, visible focus, Escape closes overlays (not while typing in inputs).
4. **Contrast:** muted-on-panel tokens (`--text-muted` on `--surface-panel`).
5. Fix in source using existing tokens (`strategy-game-ui`). Reduced-motion: no essential info only in animation.

GMap already uses HoldReveal for irreversible actions — keep that pattern.
---
