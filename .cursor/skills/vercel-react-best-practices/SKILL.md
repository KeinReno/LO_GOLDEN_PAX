---
name: vercel-react-best-practices
description: >-
  React performance patterns for GMap viewer/editor. Use when writing or
  refactoring React components, stores, or data fetching in GMap/src.
---

# React performance (GMap)

GMap is Vite SPA, not Next.js. Skip RSC/server-action rules.

Apply:

- No waterfalls: `Promise.all` for independent fetches; don't await unused work.
- Avoid barrel imports that pull Pixi/recharts into a HUD-only path.
- Derive during render; don't `useEffect` to copy props into state.
- Subscribe to the smallest Zustand slice; don't pass 80-prop dumps.
- Memo only expensive trees (map overlays, economy tables). Don't wrap trivial buttons.
- `content-visibility` / virtualize long lists (stockpile, intents).
- Conditional render with ternary, not `&&` on `0`.

Full Vercel list (reference only): [vercel-labs/agent-skills react-best-practices](https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices).
---
