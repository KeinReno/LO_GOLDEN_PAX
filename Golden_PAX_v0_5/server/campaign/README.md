# server/campaign

The persistence + orchestration layer that was missing before this point:
`server/domain/*` is pure (no DB, per CLAUDE.md rule 3), and until now
nothing actually saved a campaign between requests — every route round-
tripped full state through the client. This folder is where domain
functions meet `server/db`.

- `campaignStore.mjs` — campaign + faction CRUD, current-turn tracking (`table_meta.current_turn`)
- `{economy,tech,civic,diplomacy}Store.mjs` — load/save one domain's account for one faction. Each `load*` returns exactly the plain-data shape the matching `domain/*` function expects; each `save*` writes it back. `seed*` creates the row(s) for a newly-added faction using that domain's own `default*Account`.
- `seed.mjs` — calls every domain's `seed*` for one new faction in one place
- `planetStore.mjs` — systems/planets/buildings (`domain/planets/*`) CRUD. Display `x`/`y`/`kind`/`stars`/`isCapital` live on the system row. Not seeded per-faction — worldgen is its own GM step (`POST .../systems`, `.../planets`), and colonization is a player action, not something every faction starts with. GMap galaxy import: `galaxyMigration.mjs` (called from `scripts/migrateGalaxy.mjs`).
- `systemLinksStore.mjs` — hyperlane graph (`system_links`). GM-authored, same tier as systems. Domain boundary shape is GMap `{ fromId, toId, type }`.
- `sectorStore.mjs` — display-only political overlay (`sectors` table). No domain rule reads it.
- `systemLinksStore.mjs` — hyperlane graph (`system_links`). GM-authored, same tier as systems. Domain boundary shape is GMap `{ fromId, toId, type }`.
- `forcesStore.mjs` — fleets/legions (`domain/forces/*`) CRUD, including `systemId` + movement-points. Also not seeded per-faction — raising a unit (`POST .../forces`, see `server/api/routes/forces.mjs`) is what creates the first row.
- `npcStore.mjs` — court/NPC roster (`domain/court/*`) CRUD: `npcs`, `faction_court`, `faction_internal_blocs`. Seeded per faction (empty roster + catalog blocs + default unlocked seats).
- `stabilityStore.mjs` — faction-wide stability accumulator + planet revolt rows (`STABILITY_AND_REVOLT_SPEC`). Seeded per faction at `economy_balance.stability.startingValue`. Not a GMap port.
- `turn.mjs` — `runCampaignTurn`: NPC task tick + court modifier collection, then economy tick (income from `computeFactionFlowIncome` including faction-scope court production effects, stability Stage-1/2 `production_mult`, and `popGrowthEffects`, plus `planetCapFromBuildings`, minus fleet/legion upkeep) → revolt stage 2/3 → court civic tick → diplomacy opinion tick.

**Storage shape**: per `server/db/schema.sql`'s file header — genuinely enumerable/queryable data (stocks, unlocked techs, opinions, relations) gets its own row-per-entry table; small always-together structures (tax slots, tech tiers, treaties, history) stay as `*_json` columns on the account row. Not a blanket rule either way — see the schema file's comments on each table for the reasoning per case.

**Auth**: campaign/faction setup and running a turn are GM-only (`server/api/routes/campaign.mjs`) — a player doesn't create campaigns or seats. Persisted research is faction-scoped, same as the stateless `/tech/research` preview endpoint.

## What this doesn't do yet

- No HTTP-level tests — `campaign.test.mjs` covers the store layer and orchestrator directly against an in-memory DB (`createDb(":memory:")`); the routes themselves are only curl-verified, same gap every other route in this project has.
- No real player sessions — `POST .../research` still authenticates via the bare `x-faction-id` header (see `server/api/auth.mjs`'s TODO), just like the stateless routes.
- Tech's `researchQueue` field is persisted but nothing auto-processes it during a turn (GMap's `applyAllResearchQueues` isn't ported) — research stays a directly-called action.
- Combat and quests aren't wired into the persisted layer at all yet — `resolveExchange`/`rollYearlyQuests`/`expireQuests` are still stateless-preview only. Forces are persisted and cost real recruits/currency to raise (`domain/forces`), but a raised force isn't automatically fed into combat — moving one into `resolveExchange`'s `groupsA`/`groupsB` is still a manual step.
- No GM aggregate/read tooling beyond `GET .../state` (which returns everything, unfiltered — there's no fog-of-war/per-faction view here, `domain/narrative`'s briefing filter is a separate, still-stateless concern).
- Real building/deposit income now covers the full RPS flow matrix (`yield_flat`, `flow_convert`, `capacity_add`, upkeep-slot demand — see `domain/planets/flowContribution.mjs`'s header) plus the Priority 0 legacy supply floor and Priority 1 peg→metal/supply conversion (ported EC/EMA from GMap `fxExchange.mjs`). Still missing: the modifier stack, system-generation from `content/core/system_presets.json` (systems/planets are created with plain data through the API, not procedurally), no racial building variants or tech-gated building access.
