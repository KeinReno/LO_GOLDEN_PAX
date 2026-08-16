# agent-tasks STATUS

## 2026-08-15 · table login (dropdown + 4-digit PIN)

**Status:** login dropdown is `GET /api/campaigns` minus smoke leftovers. Real table is GMap `published.json` (`scripts/installGmapTable.mjs`).

**Done:** `GET /api/campaigns` public `{ campaigns: [{ id, name }] }`. Player tokens are 4-digit PINs (`mintPlayerToken`, reserved GM pin). GM mint UI is faction dropdown + optional PIN.

**Run:** `cd Golden_PAX_v0_5 && npm run dev` → http://localhost:5173/ — pick campaign, 4 digits, Enter. Map fits galaxy coords (wheel zoom).

**Files:** `server/{api/auth,api/routes/{campaign,factionSelf},api/contract/campaign,campaign/{campaignStore,playerStore}}.mjs`, `client-web/src/{api/client.ts,ui/player/PlayerLogin.tsx,ui/gm/GmMintPlayerToken.tsx}`.

## 2026-08-15 · content catalog verbs (build / raise / tax labels)

**Status:** `GET /api/content/table` (player or master token). Client caches catalog on login.

**Done:** Dossier builds from catalog buildings; ForcesRoom raises catalog units+ships (no hardcoded militia/scout); EconomyRoom tax names/tiers from `catalog.taxes`.

**Ids:** `building.mine`, `unit.militia`, `ship.scout`. No technologies dump.

**Files:** `server/api/{tableCatalog,contract/content,routes/content}.mjs`, `client-web/src/{api/client,state/{worldStore,viewTypes},ui/rooms/{Forces,Economy}Room,ui/shared/SystemDossier}.*`

**Leftover:** client `canPlace` still server-side only; GM can't POST player court; research bypass highlight.

## 2026-08-15 · client-web playable shell

**Status:** P0+P1 client landed; `npm run build` passes.

**Done:**
- `client-web/src/state/viewTypes.ts` — GET `/view` contract (local until shared-types ships).
- `client-web/src/api/client.ts` — `x-master-token` (GM), `x-player-token` (player) only; **no `x-faction-id`**.
- `client-web/src/state/worldStore.ts` — player `GET /view` + `?sinceRevision=` poll; GM `GET /state` (forces on payload); mint `POST .../player-token`; move/engage/board auth fixed.
- Map: `renderers/iso.ts`, `layers/{systems,links,forces,moveRange}.ts`, `MapStage.tsx` — iso map, pan, click dossier, drag-own-force move with hop-range preview.
- `ui/player/PlayerLogin.tsx` + `PlayerShell.tsx` (HUD, ActionRing: Move/Engage/Board/System).
- `ui/gm/GmShell.tsx` — full state map, Turn button.
- Removed dev `ViewerSwitch.tsx`.

**Run:**
```bash
cd Golden_PAX_v0_5
npm run dev          # server :4174 + Vite client (proxies /api)
# or separately: npm run dev:server / npm run dev:client
```
GM / player login: campaign **dropdown** + 4-digit PIN (`data/master-token.txt` or env `GOLDEN_PAX_MASTER_TOKEN`, else default 4-digit). Player PIN from GM mint (optional specific PIN).

**`/view` wired:** player shell polls `GET /api/campaign/:id/view?sinceRevision=N`; GM uses `GET /state` (403 on `/view`). Smoke: `node scripts/smokeViewerMvp.mjs` with server on :4174.

**Gestures (player):** pan map · click system → dossier · drag own force glyph → move (within client hop preview) · long-press own force → action ring.

**Blocked on server:** tax/peg UI optional; planet build / tech strip (P2).

## 2026-08-15 · client-web sidebar rooms (P0 gestures)

**Status:** Economy / Science / Court / Forces rooms wired; dossier colonize + upgrade-grade; `npm run build` passes.

**Live POSTs (player token):**
- Economy — `POST .../taxes` `{ slot, tierId }` · `POST .../peg` `{ resourceId }`
- Science — `POST .../research` · `POST .../tech/offers/:direction/reroll` · `POST .../tech/:techId/fill-socket`
- Forces — `POST .../planets/:planetId/forces` (militia/scout) · `POST .../forces/:id/disband`
- Court — `POST .../npcs/:id/seat|unseat|posting|posting/recall`
- Dossier — `POST .../colonize` (auto) · `POST .../upgrade-grade` (surface/orbital)

**Still blocked:** planet **build** catalog (no `/content`, no invented building ids); GM cannot run player court POSTs; raise beyond smoke defIds; tax tier **labels** (content not in view); research bypass highlight (only if view exposes `offerBypass`).

**Files:** `client-web/src/ui/rooms/*`, `ui/shared/RoomOverlay.tsx`, `SystemDossier.tsx`, `state/worldStore.ts`, `state/viewTypes.ts`, `state/normalizeState.ts`.

**Files (new/changed under `client-web/src/`):** `api/client.ts`, `state/{viewTypes,normalizeState,pathfinding,movementRange,worldStore}.ts`, `renderers/{iso,viewportCull,mapPick,MapStage,layers/*}`, `ui/{player/*,gm/GmShell,shared/*}`, `App.tsx`.

**Next:** server `/view` route · shared-types import swap · planet build / tech strip (P2).

## 2026-08-15 · client-web Aceternity UI polish

**Stack added:** Tailwind v4 (`@tailwindcss/vite`), `framer-motion`, `clsx`, `tailwind-merge`, `@tabler/icons-react`. Removed hand-rolled `app.css`.

**Aceternity (batch 2):** TableSidebar, FloatingDock, EvervaultCard, CometCard, CanvasRevealEffect — login/table chrome + dossier intel/forces. Vite adapt (no Next/link); FloatingDock uses `motion.button` for spring sizing.

**Build:** `npm run build` ✓
