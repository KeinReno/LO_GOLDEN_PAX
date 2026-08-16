# content

Game data as JSON, loaded and merged by `server/contentLoader.mjs`. Two packs, loaded in order (core always first):

- `core/` — universal rules content (races, techs, buildings, economy schema/balance, combat, diplomacy, court, etc.) — 51 files, copied byte-for-byte from `GMap/content/core`.
- `golden_pax/` — the current campaign's overlay pack (ships/units/pois specific to this campaign + `id-aliases.json`), merged on top of `core`. Copied byte-for-byte from `GMap/content/golden_pax`.

Validate with `npm run validate:content` (runs `validate:tech`, `validate:recipes`, `validate:races`, `lint:balance` — ported from `GMap/scripts/*`, unchanged). All pass clean against this copy (some pre-existing warnings, same ones GMap has — not introduced by the move).

**Deferred, not done**: the migration plan called for cleaning dead/orphaned entries during this move. That didn't happen here — cross-referencing ~59k lines of JSON against every place that reads it is its own audit, and doing it hastily risks silently deleting content that's read through a path that isn't obvious from a grep (see the `power_paths` finding in `server/README.md` for exactly this kind of trap). Treat this copy as *complete and validated*, not yet *pruned*.
