---
name: gmap-bug-hunt
description: Hunt and fix GMap gameplay bugs (GM editor, viewer, tick, combat, economy, RP, hotkeys). Use when the user asks to walk a mode, find bugs, QA, playtest, piss of shit, or fix a reported table issue.
---

# GMap bug hunt

Orchestrates existing skills. Do not skip to a patch.

## Order

1. **Boot** — skill `game-nav`. STATUS + MEMORY. Entrypoint + data flow (UI → API → sim → state → view).
2. **Investigate** — skill `systematic-debugging`. Reproduce first (code + live if UI). One root cause in the shared point (ponytail).
3. **Play** — skill `test-playable-web-games` + `verifying-in-browser`. Matrix rows for the mode (GM: F1–F9 domains, tick, RP, ateliers). Console + network. Don't treat green `tsc` as gameplay proof.
4. **Fix** — minimal, one cause. No live `processTurn` / `runEconomyTick` as a test.
5. **Prove** — skill `verification-before-completion`. Targeted npm script + original repro in browser if UI.

## Report format

Severity P0–P3 · file:line · expected vs actual · shortest repro · live-verified or code-only. Don't file speculation.

## Don't

- Dump forbidden files (`app.css` whole, `MapCanvas.tsx` whole, `technologies.json`, sqlite).
- Install Godot/Unity skill packs into this repo.
- Claim fixed because the diff looks right.
