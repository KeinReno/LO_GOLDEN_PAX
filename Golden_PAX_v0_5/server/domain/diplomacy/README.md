# domain/diplomacy

Inter-faction opinion, treaties, stances. Ported from `GMap/server/opinionTick.mjs`, validated against `GMap/content/core/diplomacy_stances.json`.

**Inputs/outputs**: plain data in (factions with their `diplomacy` account, a relations lookup, content), plain data out (updated factions + a change journal). No DB/HTTP here — `server/api/routes/diplomacy.mjs` is the only caller.

**Multiplayer**: this domain exists *because* the game is multiplayer — opinion and treaties are always keyed by a pair (or set) of `factionId`s, never a "player vs the rest" shape. `tickOpinions` takes the full `factions[]` list because `sharedEnemyBonus` needs every other faction's relation to both parties — it must not assume a fixed count.

## Status: real formulas, no persistence layer yet — same discipline as domain/economy, domain/tech, domain/combat

What's ported **with a byte-parity test against GMap** (exported and pure in GMap, diffed directly):

- `opinion.mjs`'s `clampOpinion` / `computeTargetOpinion` — the structural opinion formula (xenorelations, trait bias, shared enemies/allies, trade-gift history, current relation, broken-treaty penalty)
- `treaties.mjs`'s `collectTreatyEffects` — for the explicit-effects-array path (the catalog-lookup fallback calls GMap's real `getContent()` internally, so isn't directly diffable — see that test's header; this port takes the stances catalog as an explicit argument instead of reading a global, which is itself a small correctness-neutral cleanup)

What's ported **as a behavior test** (module-private in GMap, or reshaped from mutate-`world.factions`-in-place to plain-data-in/out — each file's header says which): `opinion.mjs`'s `stepOpinion`/`tickOpinions`, `treaties.mjs`'s `syncTreatiesFromEdge`/`breakTreaty`/`bumpOpinion`.

`relations.mjs` replaces GMap's `world.diplomacy` edge array with a flat `{ "minId|maxId": relation }` table — same sorted-pair-key convention, just not nested in a world object that doesn't exist here yet.

`economicRelations.mjs` is **not** a port — `currency_exchange` / `currency_union` on the economic track, plus raw `map.*` barter and frozen-rate deal settlement (`notes/2026-08-13-currency-peg-grill.md` Q3/Q6/Q7).

Deliberately not ported: `GMap/server/diploOffers.mjs` (811 lines) — the pending-offer inbox (create/accept/reject a deal). That file is almost entirely file-backed workflow state (`data/diplo-offers.json`) plus side effects across tech/intel/alchemy/ledger, not a self-contained formula the way opinion/treaties are — porting it is really "design the SQLite-backed offer/intent flow," closer in kind to `domain/economy`'s unported flow engine than to anything ported so far in this domain.
