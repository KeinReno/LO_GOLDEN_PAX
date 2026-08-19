---
name: pixijs-rendering
description: >-
  PixiJS v8 on the GMap map canvas: async Application, scene graph, ticker,
  pointer events. Use when editing MapCanvas, map overlays, fleet sprites, or
  Pixi particles — not React HUD panels.
---

# PixiJS on GMap

GMap uses **PixiJS v8** on `GMap/src/renderers/MapCanvas.tsx` (read with offset/limit only).

- v8: `await app.init(...)`, canvas is `app.canvas` (not `app.view`).
- Scene graph: `Container` groups; later children draw on top.
- Motion: `ticker.deltaTime` / `deltaMS` — never assume 60 fps.
- Pointer: `eventMode = 'static'|'dynamic'`; default `'none'` eats clicks.
- Pixel art: nearest scale mode. Destroy sprites + unload textures; `removeChild` is not enough.
- Do not rebuild the whole canvas for a HUD change — HUD is React (`src/viewer`).

Full v8 playbook: [pixijs-rendering](https://github.com/gamedev-skills/awesome-gamedev-agent-skills/tree/main/skills/web-engines/pixijs-rendering).
---
