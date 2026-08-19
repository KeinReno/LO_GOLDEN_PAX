---
name: webapp-testing
description: >-
  Browser QA for GMap using Playwright MCP and existing npm test scripts.
  Use when verifying viewer flows, not as a replacement for server unit tests.
---

# Webapp testing (GMap)

Prefer existing scripts: `npm run test:playable-web-games` skill path, `npm run smoke`, `test:viewer-page`.

Playwright MCP: navigate `:5173`, wait for network idle, snapshot, then act. Chromium headless for scripts.

Do not write a second Playwright stack. Economy/combat correctness = `node --test server/*.test.mjs`.
---
