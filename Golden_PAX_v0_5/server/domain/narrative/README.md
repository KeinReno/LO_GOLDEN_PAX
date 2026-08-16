# domain/narrative

Per-faction turn briefing filtering, and culture/faith flavor effects. Ported from `GMap/server/briefingFilter.mjs`, `GMap/server/cultureFaith.mjs`, and the `isIntentForbiddenByEffects` helper from `GMap/server/narrative.mjs`, validated against `GMap/content/core/cultures.json`, `faiths.json`.

**Inputs/outputs**: plain data in (a turn journal + factionId + optional world for ownership hints; culture/faith ids + content), plain data out (a filtered briefing; a list of ModifierStack effects). No DB/HTTP here — `server/api/routes/narrative.mjs` is the only caller.

**Multiplayer**: `briefingFilter.mjs` is the concrete version of the rule stated in root `CLAUDE.md` — the exact same turn journal produces a *different* briefing per faction (GM-only events stripped, only events that touch that faction kept). This is the domain that makes fog-of-war/faction-specific framing real, not just a principle.

## Status: real formulas, byte-parity tested against GMap

Everything ported in this pass is exported and pure in GMap, so every piece has a true cross-repo parity test (not a behavior re-derivation, unlike most other domains' harder cases):

- `briefingFilter.mjs`'s `filterBriefingForFaction` — event filtering + per-faction economy summary (`getFactionBriefing`, which reads the live journal via `tableStore.mjs`, isn't ported — the API route takes the journal as a request body instead of a storage read, same as every other domain here has no storage layer yet)
- `cultureFaith.mjs`'s `collectCultureEffects` / `collectFaithEffects` / `resolvePlanetCultureId` / `resolvePlanetFaithShares` / `primaryRaceFromComposition` — reuses `domain/tech/properties.mjs`'s `factionHasProperty` in place of GMap's `techActions.mjs` import (ported in this same pass, since `collectFaithEffects`'s taboo-property check needed it)
- `effectsGate.mjs`'s `isIntentForbiddenByEffects`

Deliberately not ported (all from `GMap/server/narrative.mjs`, 1497 lines — this domain's largest file, and almost entirely intent-application/world-mutation): NPC task/council/bloc/leader assignment (`applyGiveNpcTask`, `applySeatNpcCouncil`, etc. — these are `domain/court`-shaped, not narrative), refugee movement and system timers, `addPopWithRaceComposition` (a real, pure-enough population/race-blending formula — a plausible next addition, closer to `domain/economy` in spirit than narrative). Also not ported: `GMap/server/rpPrompts.mjs` and `rpStore.mjs` (roleplay chat/episode storage — entirely file-backed, not a formula) and `storyQuestSpawn.mjs` (already flagged as deferred in `domain/quests`'s README).
