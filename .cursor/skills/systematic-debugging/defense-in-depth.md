# Defense-in-Depth Validation

Source: [obra/superpowers](https://github.com/obra/superpowers/blob/main/skills/systematic-debugging/defense-in-depth.md)

After a bad-value bug, one check is not enough. Validate at every layer the data passes:

1. **Entry** — reject empty/unknown ids at the API or store boundary.
2. **Business** — the panel that uses the id must bail if the faction/system is missing.
3. **Environment** — don't run destructive ops on the live board in tests.
4. **Debug** — log the id and source when a lookup fails.

Goal: make the bug structurally impossible, not just "we patched the one screen".
