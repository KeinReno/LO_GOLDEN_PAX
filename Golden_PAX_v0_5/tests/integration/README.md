# tests/integration

End-to-end scenarios that exercise multiple domains, evolved from `GMap/scripts/sessionSmoke.mjs` / `smokeIntegration` / `smokeRealCampaign`. Prioritize **multi-faction** scenarios (N players + a GM turn) over single-faction ones — the single-faction case is the easy, less representative one for this game.

`turnCycle.test.mjs` — the first scenario: 3-5 factions through economy → tech → combat → diplomacy → court → quests in one turn, using real content (`getContent(["core"])`). It calls domain functions directly in sequence rather than going through `server/api` over HTTP (no HTTP test client is set up yet — routes are thin passthroughs to these same domain functions, so this still catches cross-domain regressions a per-domain unit test can't, e.g. `domain/tech` and `domain/court` sharing one `techAccount.unlockedProperties` list).

Add the next scenario when a regression shows up that only appears across domains — that's the trigger, not a schedule.
