# server/api

The only place in `server/` allowed to know about HTTP.

- `routes/*.mjs` — one file per domain, thin: resolve the actor (`auth.mjs`), validate the request against `contract/*.mjs`, call exactly one `server/domain/<name>` function, validate + send the response. No game rules here — if you're writing an `if` that decides an outcome rather than shaping a request/response, it belongs in `server/domain/*` instead.
- `contract/*.mjs` — zod request/response schemas per route, built from `@golden-pax/shared-types` where the shape crosses the client boundary. This is the API contract referenced throughout `CLAUDE.md` — keep it accurate, since it's what protects any future non-browser client.
- `auth.mjs` — resolves every request to an `Actor` (GM or a specific faction's player), same master-token pattern as `GMap/server/auth.mjs`. Player auth is currently a placeholder (see the TODO in that file) — no real per-player sessions yet.
- `createApi.mjs` — mounts all routers under one `/api` router, used by `serve.mjs`.
