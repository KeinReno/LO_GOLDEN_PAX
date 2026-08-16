# domain/intel

Fog of war, per-faction intel/contact visibility, ops health reporting. Ported from `GMap/server/intel.mjs`, `factionIntel.mjs`, `fogStore.mjs`, `opsHealth.mjs`.

**Inputs/outputs**: plain data in (world state + a viewing faction), plain data out (that faction's visible slice of the world — fog-filtered). No DB/HTTP here.

**Multiplayer**: this domain exists *because* the game is multiplayer — every function here is fundamentally "what does faction X see," never "what is the world state" unqualified. The GM view bypasses fog entirely; that's a distinct code path, not "fog disabled."

**Status**: hop-1 fog only (`fog.mjs` — GMap `expandVisionHops` + ownership/presence seeds). Intel 0–4, espionage, JSON masks, and ops health are still unported.
