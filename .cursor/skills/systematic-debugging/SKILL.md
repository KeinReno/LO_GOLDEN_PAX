---
name: systematic-debugging
description: >-
  Structured debugging: reproduce, isolate, hypothesize, verify. Use when a bug
  is unclear, intermittent, or a previous fix did not hold.
---

# Systematic debugging

1. **Reproduce** — exact steps, expected vs actual, environment. No repro → no fix.
2. **Isolate** — layer (UI / API / tick / content / live data). Binary-search the path. Prefer a failing test over print-sprawl.
3. **Hypothesize** — one falsifiable claim ("maxTiers A=1 skips T4 glasssteel").
4. **Verify** — smallest test or script. If wrong, new hypothesis.
5. **Fix the common point**, not N call-site patches. Re-run the repro + a regression test.

GMap: `node --test server/<area>.test.mjs`, then `npm run test:labor` / `lint:balance` if economy. Do not dump sqlite or `data/turns/**`.
---
