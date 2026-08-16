# src/fx

Visual effects (battle flashes, order arrows, ability pulses — the equivalent of `GMap/src/renderers/drawMapIcons.ts`'s `drawBattleFx`/`drawCrossedSwords` etc.), but triggered by game events instead of called inline from render code.

`eventBus.ts` is the seam: server-driven state changes get turned into a `GameEvent`, and both this folder and `src/audio` subscribe independently. A renderer (`src/renderers/*`) only ever draws *current* state — it does not call into `fx` or `audio` directly.

**Status**: bus only, no real effects yet. Add effect handlers here as domains are ported and start producing real events (combat resolution, narrative beats).
