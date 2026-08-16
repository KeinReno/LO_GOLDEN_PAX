# Golden Pax — project map for AI agents

Read this file first. It tells you what this project is, how it's organized, and where to put new code. Domain folders have their own short `README.md` with narrower detail — read the relevant one before editing inside it.

## What this is

Golden Pax is a **multiplayer, GM-run 4X roleplay strategy game**. Several players each control one faction; a Game Master (GM) runs the campaign, arbitrates, and has elevated tools (balance panel, court panel, master token). It is **not** a single-player game — there is no code path anywhere in this project that should assume "the current player" without a `factionId`, and no schema that hard-codes a faction count. If you're about to write logic that only makes sense for one player, stop and ask how it generalizes to N factions + 1 GM.

This is a from-scratch-organized rebuild of `../GMap`, which is the old implementation: still running, still the source of truth for game rules and balance while this rebuild is in progress. When porting a system, `../GMap/server/*.mjs` and `../GMap/content/core/*.json` are the reference for *what the rules should do* — port behavior, not code shape. Don't guess at rules; read the GMap source or ask.

## Layout

```text
content/            game data (JSON), schema-first — core/ (universal rules) + golden_pax/ (campaign overlay), ported from GMap/content
server/
  domain/<name>/     one bounded ruleset per folder (economy, combat, diplomacy, court, tech, quests, narrative,
                      planets, forces are built and tested; intel is still a stub, see its README) — each has
                      its own README.md, read it before touching the folder
  campaign/          persistence + turn orchestration — loads/saves domain accounts through db/, the only
                      caller of server/db besides serve.mjs's boot-time schema apply (see campaign/README.md)
  api/
    routes/          thin HTTP layer — parses request, calls one domain function (or campaign/ for persisted
                      routes), returns response. No rules here.
    contract/        versioned zod request/response schemas (the API contract), imports from packages/shared-types
  db/
    schema.sql        single normalized SQLite schema — no file-mode fallback, no untyped kv blobs
  serve.mjs           Express bootstrap — networking/hosting pattern carried over from GMap unchanged
client-web/          browser client: React (UI) + Pixi.js/WebGL (map rendering)
  src/state/          world store — typed against packages/shared-types, talks to server/api only
  src/renderers/       Pixi scene/layers — drawing only, no game rules
  src/fx/              visual effects, driven by game events (not called directly from renderers)
  src/audio/           sound/music, driven by the same game events as fx/
  src/ui/              React panels — GM view and per-faction player view are distinct
packages/shared-types/ zod schemas shared by server/api/contract and client-web — the actual API contract
tests/
  unit/                cross-domain/shared unit tests
  integration/          multi-faction tick-cycle scenarios (evolution of GMap's session smoke scripts)
docs/                  design specs carried over from GMap/docs
agent-tasks/           implementation handoff specs for a delegated agent to build from (not GMap carry-overs — see its README)
notes/                 grill-me design-session capture files (source reasoning behind agent-tasks/ specs and most domain decisions)
```

## Rules for editing here

1. **Faction is a first-class argument, everywhere.** Domain functions take `factionId` explicitly; nothing reads a global "current faction." API routes distinguish the GM role (master token) from a player role (bound to one faction) — see `packages/shared-types/src/roles.mjs`.
2. **File size**: keep files under ~400–600 lines. If a file is growing past that, split by sub-responsibility before adding more. This project exists specifically because GMap's `api.mjs` (3700+ lines), `ViewerPage.tsx` (5600+ lines) and `MapCanvas.tsx` (4400+ lines) became too large to navigate or safely edit — don't recreate that here.
3. **`server/domain/*` holds rules, nothing else.** No Express, no SQL strings inline — domain functions take plain data in, return plain data out, and are unit-testable without a server running. `server/api/routes/*` is the only place allowed to know about HTTP.
4. **No content lives in code.** Anything that's game data (unit stats, tech costs, faction traits) goes in `content/*.json`, validated against a schema — not hard-coded in a `.mjs`/`.ts` file. This is already GMap's pattern; keep it.
5. **DB**: `server/db/schema.sql` is the only source of truth for storage shape. If you need to persist something new, add a real typed table/column — do not reach for a generic `kv`/blob table as a shortcut. `server/domain/*` never imports `server/db` directly — `server/campaign/*Store.mjs` is the load/save boundary (one file per domain), and `server/campaign/turn.mjs` is where per-turn orchestration across domains lives. Most routes still have a stateless "preview" mode (client supplies full state, gets new state back, nothing persists) alongside the persisted `server/api/routes/campaign.mjs` routes — both are legitimate, not a migration-in-progress.
6. **Tests before "done."** A domain isn't considered ported from GMap until it has a unit test (colocated `*.test.mjs` next to the domain code) proving parity with GMap's behavior for that system, and (once it's wired to the API) an integration scenario under `tests/integration/`.
7. **fx/audio are event-driven, not inline.** Game state changes emit typed events; `client-web/src/fx` and `client-web/src/audio` subscribe to them. Renderers never call sound/effect triggers directly — this is what keeps `MapCanvas.tsx`-style files from re-accumulating a decade of inline effect calls.
8. **Networking/hosting is intentionally unchanged.** `server/serve.mjs`, tunnel scripts, and Docker deploy follow the same pattern as `../GMap` — don't redesign this layer without being asked to.
9. **Engine/platform**: browser (React + Pixi/WebGL) is the only client for now. A future Unity/Godot or Android client is an explicitly deferred concern — see the migration plan — and would consume `server/api` as a new client, not require touching this client's rendering code. Don't pre-optimize rendering code for a hypothetical engine swap; do keep the API contract (`packages/shared-types`) clean, since that's the part that actually transfers.

## Status

Nine domains with real (scoped, honestly-documented) logic and tests: economy, tech, combat, diplomacy, court, quests, narrative, planets, forces — see each folder's README for exactly what's real vs. caller-supplied-placeholder vs. deliberately deferred. `intel` is still a stub. Persistence + turn orchestration now exist (`server/campaign/`, `server/api/routes/campaign.mjs`, `server/api/routes/forces.mjs`) alongside the original stateless preview routes. `client-web` is still the foundation-stage placeholder (starfield boot screen, no domain wired up) — that's the next real gap, not a "coming soon" note. See `docs/` and the plan this was built from for the fuller migration order (UI rebuild → networking layer last, near-unchanged).
