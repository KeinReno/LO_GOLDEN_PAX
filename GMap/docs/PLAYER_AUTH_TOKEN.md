# Player auth token (GMap)

Identity is a **session token** after faction-password login. Bare `x-faction-id` is not identity.

## Login (Session 2)

1. Player still logs in with faction id + table PIN via `POST /api/login` (same body as today).
2. Response includes `playerToken` (shown once; not written to published.json).
3. Later player requests send `x-player-token`. Password header/body still works during the compat window.

GM routes stay master-token gated. `x-master-token` is unchanged.

## Required header

| Caller | Header |
|--------|--------|
| Player (preferred) | `x-player-token` |
| Player (compat) | `x-faction-password` plus faction id in body or `x-faction-id` (hint only) |
| GM | `x-master-token` |

A request that only sends `x-faction-id` is rejected.

Session token hashes persist through the existing store (`GMAP_STORE=file` JSON or sqlite `kv`). Plaintext tokens are not stored.

## Remaining gap

Faction PINs still live as plaintext on the live board (`factions[].password`). This pass does **not** rewrite `published.json`. Optional `factions[].passwordHash` (scrypt) is verified when present.

Economy research / alchemy / tax / build-queue / preview-build accept `x-player-token` or password (master token still grants GM free-research and direct tax). Card battle, RP, and market UI clients still send the PIN in the body; the server accepts `x-player-token` on those mutations when the header is present.

Check: `npm run test:player-auth` from `GMap/`.
