# src/ui

React panels. The GM view and a per-faction player view are distinct UIs, not one screen with a role flag sprinkled through it — keep that split at the component-tree level as panels are ported from `GMap/src/editors/*` (player-facing) and `GMap/src/editors/gm/*` (GM-only tools).

`ViewerSwitch.tsx` is a dev-only placeholder for picking which viewer you're testing as, until real auth resolves it. Don't ship it as-is.
