# src/state

Client-side world state (zustand, same choice as `GMap/src/state/worldStore.ts`). This is the only layer allowed to call `server/api` — renderers and UI read from here, never fetch directly.

`worldStore.ts` currently holds only `viewer` (which faction, or GM, this tab is acting as — see `ViewerRole`) and a health check. As domains are ported, add typed slices here backed by `packages/shared-types` schemas, fetched through `server/api/routes/*`.

`viewer` is deliberately explicit and never defaults to "the first faction" — the GM/player distinction from `packages/shared-types/src/roles.mjs` has to hold on the client too.
