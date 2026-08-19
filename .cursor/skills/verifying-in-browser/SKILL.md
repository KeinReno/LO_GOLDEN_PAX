---
name: verifying-in-browser
description: >-
  After UI or API changes, start GMap dev servers, open the viewer, check render,
  console, and network. Use after viewer/editor/HUD work.
---

# Verify in browser (GMap)

Dev is **Vite :5173** + Node `npm start` (API). Check terminals first.

1. If needed: `npm run dev` and `npm start` in `GMap/` (background).
2. Open `http://localhost:5173` (Playwright MCP or Cursor browser).
3. Console: flag real errors, ignore harmless deprecations.
4. Network: 4xx/5xx and failed `/api/*`.
5. Navigate to the changed room (planet manage, economy, research). Snapshot + one interaction.
6. Verdict: pass or list issues.

Do not use this as a substitute for `npm run test:labor` / `tsc --noEmit` on economy/combat.
---
