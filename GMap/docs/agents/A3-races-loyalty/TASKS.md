# Agent A3 — Races Expansion + Loyalty System

> Ты работаешь над проектом LO_GOLDEN_PAX / GMap (Vite + React 19 + TS + PixiJS 8 + Zustand + Node API).
> Это твоя полная спецификация. Читай её целиком и выполняй задачи по порядку.

## Принципы (нерушимые)

1. **Сервер = единственная правда.** Все мутации мира — через `server/api.mjs` -> `processTurn.mjs` или intents. Zustand на клиенте — только вьюха.
2. **Всё новое — через `ModifierStack` + `effects.json`.** Новые каналы — новые ключи в `channelKey` (`server/modifierStack.mjs`).
3. **Контент — в JSON-паках `content/core/`**, не в коде.
4. **Новые состояния — расширения существующих типов** в `src/state/types.ts`.
5. **Tailwind НЕ добавлять.** Стили — plain CSS в `src/styles/app.css` с дизайн-токенами.
6. **Не ломать существующий пайплайн.** После изменений запускай `npm run smoke` и `npm run smoke:tick`.
7. **Миграции:** новые поля — обнови `server/normalizeWorld.mjs`.
8. **В конце чата** напиши `tmp/summary-{timestamp}.json`.

## Контекст проекта

Прочитай:
- `GMap/docs/CAMPAIGN_TABLE_SPEC.md` — архитектура
- `GMap/content/core/races.json` — текущие 3 расы (нужно расширить)
- `GMap/content/core/effects.json` — словарь эффектов (A1 уже добавил `loyalty_add`, `loyalty_mult`, `revolt_risk`)
- `GMap/server/modifierStack.mjs` — движок модификаторов
- `GMap/server/economyTick.mjs` — где собирается стек (твоя точка интеграции)
- `GMap/server/combatResolve.mjs` — где применяется loyalty penalty к обороне

## Скоуп

Расширение каталога рас (3-5 traits на расу с компромиссами), система лояльности населения (0-100, пороги, revolt->dice), использование `xenorelations` (сейчас не читается), `raceVariants` на юнитах.

## Зависимости

- A1 (нужны `loyalty_add`, `loyalty_mult`, `revolt_risk` в `effects.json`) — **должен быть выполнен**
- A5 (для расовых эксклюзивных techs — но A3 может работать без них, добавив `raceLock` поле в techs)

## Файлы

- `GMap/content/core/races.json` — расширить
- `GMap/content/core/loyalty_tiers.json` — создать
- `GMap/content/core/units.json` — добавить `raceVariants`
- `GMap/content/core/ships.json` — добавить `raceVariants`
- `GMap/src/state/types.ts` — расширить `Planet`, `Race`
- `GMap/server/loyalty.mjs` — создать
- `GMap/server/economyTick.mjs` — вызов loyalty tick
- `GMap/server/processTurn.mjs` — вызов loyalty tick + revolt check
- `GMap/server/combatResolve.mjs` — loyalty penalty к обороне
- `GMap/server/normalizeWorld.mjs` — миграция
- `GMap/src/viewer/SystemDossier.tsx` — UI лояльности
- `GMap/src/editors/PolityEditor.tsx` — UI расовых traits

## Цепочка задач

### T3.1. Расширить `races.json`

Для каждой из 3 существующих рас (human, belator, synth) — добавить 3-5 traits с компромиссами. Добавить 3-4 новые расы (karned, psionic, swarm, voidborn). Каждая раса: `id`, `name`, `tags`, `traits[]` (каждый trait — `id`, `effects[]`, `balanceBudget`), `habitability`, `growth`, `xenorelations` (матрица к другим расам).

Примеры расовых traits:
- `trait.belator.discipline` (есть) — +10% defense, +1 supply upkeep
- `trait.belator.militarist_loyalty` — loyalty растёт от военного налога (вместо падения)
- `trait.synth.efficient` (есть) — +5% metal, -30% pop growth
- `trait.synth.logistics_independent` — +1 logistics range, -10% loyalty на ocean планетах
- `trait.human.adaptable` — +5% tech speed, +10% diplomacy trust gain
- `trait.human.cosmopolitan` — +1 loyalty для смешанных планет, -5% production

### T3.2. Расширить `Race` в `types.ts`

Добавить поля: `traits?: RaceTrait[]`, `xenorelations?: Record<string, number>`. Если `Race` сейчас только `{ id, name }` — расширь до полного типа с `traits`, `habitability`, `growth`, `xenorelations`.

### T3.3. Создать `content/core/loyalty_tiers.json`

```json
{
  "loyalty_tiers": [
    { "max": 20, "effects": [{ "effect": "revolt_risk", "args": { "chancePerTurn": 0.1 } }, { "effect": "production_mult", "args": { "mult": 0.7 } }] },
    { "min": 20, "max": 40, "effects": [{ "effect": "production_mult", "args": { "mult": 0.85 } }] },
    { "min": 40, "max": 60, "effects": [] },
    { "min": 60, "max": 80, "effects": [{ "effect": "production_mult", "args": { "mult": 1.05 } }] },
    { "min": 80, "effects": [{ "effect": "production_mult", "args": { "mult": 1.10 } }, { "effect": "loyalty_add", "args": { "amount": 1 } }] }
  ]
}
```

### T3.4. Создать `server/loyalty.mjs`

Функции:
- `computePlanetLoyalty(world, system, planet, content)` — считает лояльность планеты как `sum(raceShare.percent * loyalty[raceId][ownerFactionId])`. Базовая лояльность — 50, модифицируется: `xenorelations` расы к фракции, `tax_pressure`, `propaganda` POI, `logistics.disconnected`, `after_battle` consequence.
- `loyaltyTick(world, factionId, content)` — на тике: обновляет `loyalty` стейт для всех планет фракции, применяет `loyalty_tiers` effects.
- `checkRevolt(world, system, planet, content)` — если `loyalty < 20`, бросает кубик (через `node:crypto` напрямую, или через `server/dice.mjs` если он уже есть от A9). При провале — создаёт revolt событие (spawn rebels, switch owner, refugees POI).

Хранение: `planet.loyalty: number` (0-100) и `world.loyaltyMatrix: Record<raceId, Record<factionId, number>>` (в `TurnSnapshot` — только текущие значения, без истории).

### T3.5. Интегрировать в `processTurn.mjs`

После `economyTick` — вызвать `loyaltyTick` для каждой фракции. После loyalty tick — `checkRevolt` для всех планет с `loyalty < 20`. Revolt события — в journal как `type: "revolt"`.

### T3.6. Loyalty penalty в бою

В `combatResolve.mjs` — при расчёте обороны защитника, если планета имеет `loyalty < 40`, применить `combatDefMult: 0.8` (гарнизон хуже держит). Если `loyalty < 20` — шанс что гарнизон переходит на сторону атакующего (через dice check).

### T3.7. `raceVariants` на юнитах

В `units.json` и `ships.json` — добавить поле `raceVariants?: Record<raceId, { statsMult: Record<stat, number>, name: string }>` на существующие юниты. Пример:
```json
"unit.generic_line": {
  "id": "unit.generic_line",
  "raceVariants": {
    "race_belator": { "statsMult": { "defense": 1.15 }, "name": "Легион Белатора" },
    "race_synth": { "statsMult": { "hp": 0.9, "speed": 1.2 }, "name": "Синт-дрон" }
  }
}
```
В `combatResolve.mjs::gatherGroups` — при создании группы проверять `raceVariants[raceId]` (раса берётся из `legion.raceId` или из состава населения системы для флота) и применять `statsMult`.

### T3.8. UI лояльности

В `SystemDossier.tsx` — кольцевая диаграмма лояльности по расам планеты. В `PolityEditor` — показ расовых traits с `balanceBudget`. Map mode "Лояльность" (красный/желтый/зеленый ореол систем) — добавить в `Toolbar` map modes.

### T3.9. Миграция в `normalizeWorld.mjs`

Добавить обработку новых полей: `planet.loyalty` (default 50), `race.traits` (default []), `race.xenorelations` (default {}). Старые сейвы должны загружаться.

## DoD

- 6-7 рас с 3-5 traits каждая, все с `balanceBudget`.
- `xenorelations` читается и влияет на лояльность.
- `loyalty` считается на тике, `revolt_risk` срабатывает при низких значениях.
- `raceVariants` применяются в бою.
- `npm run lint:balance` проходит.
- `npm run smoke:tick` проходит (с лояльностью).
- Старые сейвы загружаются.

## После завершения

1. Запусти `npm run smoke` и `npm run smoke:tick`.
2. Запусти `npm run lint:balance`.
3. Напиши `tmp/summary-{timestamp}.json`.
4. Обнови `GMap/docs/WORK_PLAN.md` — отметь A3 как done.
