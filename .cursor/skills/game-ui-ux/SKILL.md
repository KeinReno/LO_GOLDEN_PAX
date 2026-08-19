---
name: game-ui-ux
description: Game HUD/menus — anchors not absolute px, safe area, keyboard focus, screen stack, event-driven HUD. Use for GMap editor/viewer panels, overlays blocking chrome, hotkeys vs layers.
---

Source: [gamedev-skills/awesome-gamedev-agent-skills](https://github.com/gamedev-skills/awesome-gamedev-agent-skills/tree/main/skills/disciplines/game-ui-ux). Prefer `strategy-game-ui` for 4X tokens; this skill is layout/focus/stack.

# Game UI/UX

- Anchors + stacks, not overlay covering the topbar (GM diplo).
- One Esc owner: topmost overlay; ignore Esc in textarea.
- Keyboard: F1–F9 domains in GM; don't label chips with dead F5.
- HUD from events, not polling every frame.
- Overlay = last resort; confirm irreversible actions.

GMap anatomy: TopBar, Toolbar, Inspector, GmWorkbench FloatingPanel. `strategy-game-ui` for tokens and action-at-source.
