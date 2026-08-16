# Boarding from the table (player action)

Server: `POST /api/forces/board` `{ factionId, password, legionId, targetFleetId }` (see `server/boarding.mjs`). Combat tests stay in `server/boarding.test.mjs`.

**Button lives on existing force chrome, not ViewerPage:**

- `FleetOrderRing` — **Абордаж** when the acting force is an owned legion in the same system as a non-owned fleet (radial orders / long-press). Multiple fleets → one item per name (cap 4).
- `ViewerContextMenu` — same action on an owned legion, or on an enemy fleet glyph if you have a legion in that system.

Auth is the same JSON body as `/api/forces/raise` (`factionId` + `password`). Client: `src/state/boardForce.ts`.
