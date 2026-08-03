# Agent A4 — Logistics Network

> Ты работаешь над проектом LO_GOLDEN_PAX / GMap (Vite + React 19 + TS + PixiJS 8 + Zustand + Node API).
> Это твоя полная спецификация. Читай её целиком и выполняй задачи по порядку.

## Принципы (нерушимые)

1. **Сервер = единственная правда.** Все мутации мира — через `server/api.mjs` -> `processTurn.mjs` или intents.
2. **Всё новое — через `ModifierStack` + `effects.json`.** Новые каналы — новые ключи в `channelKey`.
3. **Контент — в JSON-паках `content/core/`.**
4. **Новые состояния — расширения существующих типов** в `src/state/types.ts`.
5. **Tailwind НЕ добавлять.** Стили — plain CSS в `src/styles/app.css`.
6. **Не ломать существующий пайплайн.** После изменений запускай `npm run smoke` и `npm run smoke:tick`.
7. **Миграции:** новые поля — обнови `server/normalizeWorld.mjs`.
8. **В конце чата** напиши `tmp/summary-{timestamp}.json`.

## Контекст проекта

Прочитай:
- `GMap/docs/CAMPAIGN_TABLE_SPEC.md` — архитектура
- `GMap/content/core/rules.json` — текущие правила (есть секция `depot` — твой старт)
- `GMap/server/pathfinding.mjs` — BFS по графу систем (используй для логистики)
- `GMap/src/state/types.ts` — `StarSystem`, `SystemLink`
- `GMap/src/renderers/drawMapFeatures.ts` — рисование линий на карте
- `GMap/src/editors/Toolbar.tsx` — map modes

## Скоуп

Граф снабжения от столицы через `SystemLink`, `supplyLevel` (затухает с числом хопов), штрафы за отрезанность, map mode "Логистика".

## Зависимости

- A1 (нужны `logistics_range_add`, `logistics_disconnected_penalty` в `effects.json`) — **должен быть выполнен**

## Файлы

- `GMap/content/core/rules.json` — расширить секцией `logistics`
- `GMap/server/logistics.mjs` — создать
- `GMap/server/processTurn.mjs` — вызов logistics tick
- `GMap/server/economyTick.mjs` — применение supplyLevel к производству
- `GMap/server/combatResolve.mjs` — применение combatDefMult при отрезанности
- `GMap/server/pathfinding.mjs` — использовать для BFS
- `GMap/src/state/types.ts` — расширить `StarSystem`
- `GMap/src/renderers/drawMapFeatures.ts` — линии логистики
- `GMap/src/editors/Toolbar.tsx` — map mode "Логистика"
- `GMap/src/viewer/SystemDossier.tsx` — блок "Снабжение"
- `GMap/server/normalizeWorld.mjs` — миграция

## Цепочка задач

### T4.1. Расширить `rules.json`

Добавить секцию `logistics`:
```json
"logistics": {
  "baseRangeHops": 3,
  "depotRangeBonus": 2,
  "supplyDecayPerHop": 0.15,
  "connectedBonuses": [
    { "effect": "production_mult", "args": { "resource": "currency.industria", "mult": 1.05 } },
    { "effect": "ap_add", "args": { "amount": 1 } }
  ],
  "disconnectedPenalties": [
    { "effect": "logistics_disconnected_penalty", "args": { "productionMult": 0.5, "upkeepMult": 1.3, "combatDefMult": 0.7 } }
  ],
  "blockadedIsDisconnected": true,
  "quarantineBreaksLogistics": true
}
```

### T4.2. Расширить `StarSystem` в `types.ts`

```typescript
export interface StarSystem {
  // ...существующее
  logistics?: {
    connectedToCapital: boolean;
    hopsToCapital: number;
    viaDepot: boolean;
    supplyLevel: number;     // 0..1
    bottlenecked: boolean;
    computedAtTurn?: number;
  };
}
```

### T4.3. Создать `server/logistics.mjs`

Функции:
- `computeLogisticsNetwork(world, factionId, content)` — BFS от столицы (`faction.capitalSystemId` или первая система с `isCapital`) по `SystemLink` с типами `corridor|gate`. Проходит только через системы владельца или союзников (trade/alliance). Депо POI на маршруте продлевает радиус на `depotRangeBonus`. Карантин POI на маршруте — обрывает путь.
- `computeSupplyLevel(hops, content)` — `1 / (1 + supplyDecayPerHop * hops)`.
- `applyLogisticsEffects(world, factionId, content)` — для каждой системы: если `connected` — применить `connectedBonuses` (масштабировать на `supplyLevel`), если `!connected` — `disconnectedPenalties`.

### T4.4. Интегрировать в `processTurn.mjs`

Перед `economyTick` — вызвать `computeLogisticsNetwork` для каждой фракции. После — `applyLogisticsEffects`. Записать `system.logistics` в world.

### T4.5. Применить в `economyTick.mjs`

При сборе стека для планеты — если `system.logistics.connectedToCapital === false`, добавить `disconnectedPenalties` effects. Если `connected` — `connectedBonuses` масштабированные на `supplyLevel`.

### T4.6. Применить в `combatResolve.mjs`

При расчёте обороны защитника — если система `logistics.connectedToCapital === false`, применить `combatDefMult` из `disconnectedPenalties`.

### T4.7. Map mode "Логистика"

В `Toolbar.tsx` — добавить map mode "logistics" (горячая клавиша, например F10). В `drawMapFeatures.ts` — рисовать линии: зеленая = связана, желтая = узкое место (`bottlenecked`), красная = отрезана. Толщина линии ~ `supplyLevel`.

### T4.8. UI в `SystemDossier`

Блок "Снабжение": `4 хопа до столицы, через Тангар · supplyLevel: 0.72`. Если отрезана — красное предупреждение.

### T4.9. Миграция в `normalizeWorld.mjs`

Добавить обработку нового поля `system.logistics` (default: `undefined` -> вычисляется на первом тике). Старые сейвы должны загружаться.

## DoD

- `logistics.mjs` считает сеть для каждой фракции на тике.
- Отрезанные системы получают штрафы к производству и обороне.
- Map mode "Логистика" показывает линии снабжения.
- `SystemDossier` показывает статус снабжения.
- `npm run smoke:tick` проходит.
- Старые сейвы загружаются.

## После завершения

1. Запусти `npm run smoke` и `npm run smoke:tick`.
2. Напиши `tmp/summary-{timestamp}.json`.
3. Обнови `GMap/docs/WORK_PLAN.md` — отметь A4 как done.
