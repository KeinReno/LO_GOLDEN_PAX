---
name: visual-qa-testing
description: Visually QA GMap in the built-in browser — screenshot, console, network. Use after UI/GM/viewer changes, not instead of verifying-in-browser.
---

Source: [spencerpauly/awesome-cursor-skills](https://github.com/spencerpauly/awesome-cursor-skills/tree/main/resources/visual-qa-testing). Ports: GMap Vite `5173`, not 3000.

# Visual QA (GMap)

1. Dev server: `npm run dev` in `GMap/` → `http://localhost:5173/` (master `/`, player `/view`).
2. `browser_navigate` + screenshot.
3. `browser_console_messages` — flag TypeError / failed imports / hydration.
4. `browser_network_requests` — 4xx/5xx, duplicate fetches, CORS.
5. Interact via snapshot refs; screenshot after.
6. Report: look / console / network.

Notes: snapshot before click. `browser_resize` for density. Don't tick/publish the live board unless asked. Prefer `verifying-in-browser` for post-fix proof of a specific repro.
