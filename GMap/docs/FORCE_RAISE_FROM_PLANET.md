# Raise-from-planet (v0.5 → GMap)

GMap’s `/api/forces/mutate` still only **edits existing** fleets/legions for currency (cannot spawn new stacks). v0.5 added a real origin for forces: raise from an owned planet.

**Added:** `GMap/server/forceRecruit.mjs`

| Rule | Behavior |
|------|----------|
| Cost | Population + `produceForceCost` (metal/supply). Not a currency-only spawn. |
| Militia | `unit.militia` has `raisableWithoutBuilding: true` — no barracks. |
| Other units | Existing `systemHasBarracks`. Ships: existing `systemHasShipyard`. |
| Ceiling | `floor(planet.population * 0.3)` (`economy_balance.forces.mobilizationRate`). `overrideCeiling` spends 1.5× pop on overflow. |
| Disband | `POST /api/forces/disband-raised` returns population to the home planet. **No** full currency refund. Mutate’s metal refund on deck edits is unchanged. |
| Produce deck | `POST /api/system/action` `produce_unit` / `produce_ship` call the same raise. **Force AP** is an extra order tax; currency is billed once by raise. |

`/api/forces/mutate` still refuses net-new unit counts (`Нельзя создавать юниты напрямую`).

## API

Raise militia:

```http
POST /api/forces/raise
{ "factionId", "password", "systemId", "planetId", "kind": "unit", "defId": "unit.militia", "count": 1 }
```

Optional: `forceId`, `overrideCeiling`, `name`.

Disband (pop back, no refund):

```http
POST /api/forces/disband-raised
{ "factionId", "password", "kind": "legion", "id": "<forceId>", "count": 1 }
```

Check: `npm run test:force-raise` (from `GMap/`).

## UI

Viewer → system dive → owned planet (`PlayerPlanetManage`) → section **Набор** → **Набрать**.
Militia is always listed; other units/ships appear when barracks/shipyard gates already pass.

Disband (pop back, no metal): Forces deck → open a legion/fleet that has `homePlanetId` → hold **Вернуть на планету**.
Deck drop-zone disband (`/api/forces/mutate` metal refund) is unchanged.
