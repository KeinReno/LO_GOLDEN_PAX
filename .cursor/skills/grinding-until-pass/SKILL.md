---
name: grinding-until-pass
description: Loop fix → run proof command → repeat until green, max 10. Use when tests/lint/tsc are red after a refactor and the goal is make the command pass.
---

Source: [spencerpauly/awesome-cursor-skills](https://github.com/spencerpauly/awesome-cursor-skills/tree/main/resources/grinding-until-pass).

# Grind until pass

1. Pick ONE proof command (`npm run lint`, `npx tsc --noEmit`, targeted `npm run test:*`, `npm run smoke`).
2. Run it. On fail: read first error, minimal fix, re-run.
3. Max 10 iterations. If errors increase, stop.
4. Don't delete tests, don't `@ts-ignore` / eslint-disable to silence.
5. GMap: never grind by running `processTurn` / `runEconomyTick` on live `published.json`.
