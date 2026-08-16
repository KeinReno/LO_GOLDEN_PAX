---
name: build-game-inventory
description: Build or repair game inventory, loot, equipment, tooltips, drag-and-drop, persistence, progression, and resource/economy systems. Use for item/building/colony schemas, pickup/production flows, stack rules, equipment slots, atomic swaps, save migration, and no-loss regression testing. Adapted for LO_GOLDEN_PAX: applies to buildings.json, colonies.json, intents, worldStore, economyTick, and PlayerHqPanels/PlayerPlanetManage.
---

# Build Game Inventory

Use one typed, serializable item source of truth and make every transfer atomic.

## Define the item contract

Model stable IDs, item definitions, ownership, stack limits, equipment compatibility, effects, rarity, presentation data, and migration version separately. Runtime UI must reference definitions by ID rather than duplicate stats or descriptions.

In LO_GOLDEN_PAX: treat `buildings.json` / `colonies.json` entries as definitions (ID → stats/cost/production). `worldStore` + `economyTick.mjs` own runtime state. UI (`Inspector`, `PlayerHqPanels`, `PlayerPlanetManage`) must reference IDs, never copy stats inline.

## Implement transfers as transactions

For pickup, equip, unequip, swap, drag/drop, consume, and sell — and for LO_GOLDEN_PAX: build, upgrade, demolish, move population, dispatch intent, resolve economy tick:

1. Validate source ownership and destination legality.
2. Compute the entire next inventory/equipment state.
3. Commit once or reject without changing either side.
4. Persist only after the committed state is valid.

Never remove an item before confirming a legal destination. Preserve item identity across a swap and prevent duplicate effect registration.

## Build usable UI

Expose slot compatibility, equipped state, quantity, tooltip facts, and failure feedback. Support keyboard and touch alternatives to drag-only interactions. Keep focus behavior, dialogs, and tooltips accessible.

## Test loss boundaries

Cover invalid destinations, full inventory, duplicate pickup, equip swap, mid-action swap, save/load, schema migration, reset/new game, tooltip updates, and repeated dispatch. Validate that total owned item identity is conserved except for explicit consumption or reward rules.
