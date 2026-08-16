# @golden-pax/shared-types

The API contract. Zod schemas used by both `server/api/contract` (validates requests/responses) and `client-web` (typed state + typed API calls). This package — not where rendering code lives — is what a future non-browser client (Android, Unity/Godot, anything) would actually depend on.

- `roles.mjs` — `ActorSchema`: every API call is either the GM or a specific player (faction). No implicit "current user."
- `faction.mjs` — `FactionSchema`: a campaign has N factions, never a hard-coded count.

Written as plain `.mjs` (no build step) so `server/*.mjs` can import it directly with zero tooling; `client-web` gets it via the npm workspace link and still gets full TS inference from the zod schemas (`z.infer<typeof X>`).

Add a schema here whenever a new concept crosses the server↔client boundary. Don't add anything here that's purely internal to one domain — that belongs in `server/domain/<name>/`.
