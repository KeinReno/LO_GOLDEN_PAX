# Golden Pax

Multiplayer, GM-run 4X roleplay strategy — several players each command a faction, a Game Master runs the campaign.

This is the foundation rebuild of `../GMap`, which keeps running and stays the live game while this one is built out domain by domain. See [`CLAUDE.md`](./CLAUDE.md) for the full project map (read that one first if you're an AI agent), and the plan this scaffold was built from for the intended migration order.

## Getting started

```bash
npm install
npm run dev       # server (Express, :4173 by default) + client-web (Vite) together
npm test          # vitest
```

## Layout

- `content/` — game data (JSON)
- `server/` — domain logic (`server/domain/*`) + thin API layer (`server/api/*`) + SQLite (`server/db/*`)
- `client-web/` — React + Pixi.js browser client
- `packages/shared-types/` — the API contract, shared by server and client
- `tests/` — cross-domain unit tests and multi-faction integration scenarios
- `docs/` — design specs
