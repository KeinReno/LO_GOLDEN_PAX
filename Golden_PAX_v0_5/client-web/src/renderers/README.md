# src/renderers

Pixi.js (WebGL) scene and layers. Drawing only — reads from `src/state`, never calls `server/api` directly, never triggers `src/fx`/`src/audio` (those subscribe to game events instead; see CLAUDE.md rule 7).

`MapStage.tsx` is a boot-proof placeholder (starfield), not the real map. The real map (systems, links, fleets, fog, selection) is ported from `GMap/src/renderers/MapCanvas.tsx` + `drawMapIcons.ts` as part of the UI rebuild — split by layer/concern as it's ported rather than recreating one large file (see the file-size rule in root `CLAUDE.md`).
