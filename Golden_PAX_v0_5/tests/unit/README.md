# tests/unit

Cross-domain or shared-utility unit tests. **Most unit tests don't belong here** — a domain's tests live next to its code in `server/domain/<name>/*.test.mjs` (see `server/domain/economy/economyTick.test.mjs` for the pattern). Use this folder only for tests that don't have a single obvious domain home, e.g. testing `packages/shared-types` schemas directly.
