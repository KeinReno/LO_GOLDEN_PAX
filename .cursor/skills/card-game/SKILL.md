---
name: card-game
description: >-
  Card/CCG zone and effect rules for GMap card battle. Use when touching
  cardBattle, engagements/cardActions, auras, trophies, or combat cards — not
  planet build decks.
---

# Card battle (GMap)

Existing engine: `GMap/server/cardBattle.mjs` (huge — slice only) + `server/engagements/cardActions.mjs`. Tests: `npm run test:card-battle`.

Rules:

- A card is in **exactly one zone** (deck/hand/board/discard). Move = remove then add.
- Effects are **data** (`effects` / keywords / auras), not one function per card id.
- Resolve in a defined order (queue). Seed RNG if a replay matters.
- UI locators must not hardcode card/tech ids — content describes itself.
- Planet **BuildDeck** is not this skill (building catalog, not CCG).

Do not start a second card engine. Extend the existing resolver.
---
