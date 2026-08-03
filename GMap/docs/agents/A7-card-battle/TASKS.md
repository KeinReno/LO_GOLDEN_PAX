# Agent A7 — Card Battle Mode

> Ты работаешь над проектом LO_GOLDEN_PAX / GMap (Vite + React 19 + TS + PixiJS 8 + Zustand + Node API).
> Это твоя полная спецификация. Читай её целиком и выполняй задачи по порядку.

## Принципы (нерушимые)

1. **Сервер = единственная правда.** Все мутации мира — через `server/api.mjs` -> `processTurn.mjs` или intents.
2. **Всё новое — через `ModifierStack` + `effects.json`.**
3. **Новые intents — в `content/core/intents.json`.**
4. **Контент — в JSON-паках `content/core/`.**
5. **Tailwind НЕ добавлять.** Стили — plain CSS в `src/styles/app.css`. Анимации — `motion` + `@use-gesture/react`.
6. **RNG — только серверный.** Клиент только проигрывает анимацию уже известного результата.
7. **Не ломать существующий пайплайн.** После изменений запускай `npm run smoke` и `npm run smoke:tick`.
8. **В конце чата** напиши `tmp/summary-{timestamp}.json`.

## Контекст проекта

Прочитай:
- `GMap/docs/CAMPAIGN_TABLE_SPEC.md` — архитектура
- `GMap/server/combatResolve.mjs` — текущий резолв боя (gatherGroups, rolePower, totalPower, applyCasualties, propertyCombatMult)
- `GMap/server/engagements.mjs` — управление engagement (A6 добавил `engagement.mode` и `status: "active"`)
- `GMap/content/core/combat_matchups.json` — матрица контрматчей (используется в карточном режиме)
- `GMap/content/core/combat_stances.json` — stance (пассивка стола)
- `GMap/src/ui/DragCard.tsx` — компонент карточки (создан A2)
- `GMap/src/ui/DropZone.tsx` — компонент drop-зоны (создан A2)

## Скоуп

Опциональный карточный режим боя поверх того же состава флота/легиона. Не колодостроение, не ККИ — разыгрывание существующих юнитов как карт. Серверный резолв хода, детерминированный.

## Зависимости

- A2 (нужны `<DragCard>` и `<DropZone>`) — **должен быть выполнен**
- A6 (нужен engagement-as-event, `intent.request_card_battle`, `engagement.mode`) — **должен быть выполнен**

## Файлы

- `GMap/server/cardBattle.mjs` — создать
- `GMap/server/engagements.mjs` — обработка `engagement.mode === "card"`
- `GMap/server/processTurn.mjs` — вызов card battle резолва
- `GMap/content/core/intents.json` — `intent.play_card`
- `GMap/content/core/rules.json` — секция `cardBattle`
- `GMap/src/state/types.ts` — типы карточного боя
- `GMap/src/viewer/CardBattleTable.tsx` — создать
- `GMap/src/viewer/ViewerPage.tsx` — интеграция

## Цепочка задач

### T7.1. Правила карточного боя в `rules.json`

```json
"cardBattle": {
  "handSize": 4,
  "drawPerRound": 1,
  "maxRounds": 8,
  "forceCardThreshold": 5,
  "triggers": {
    "mutualConsent": true,
    "gmForce": true,
    "powerCorridor": { "min": 0.40, "max": 0.60 }
  }
}
```

### T7.2. Типы в `types.ts`

```typescript
interface CardBattleState {
  engagementId: string;
  hands: { [sideId: string]: BattleCard[] };
  decks: { [sideId: string]: BattleCard[] };
  discard: { [sideId: string]: BattleCard[] };
  frontLines: { [sideId: string]: BattleCard[] };
  round: number;
  currentSide: string;
  status: "active" | "resolved";
  log: CardBattleLogEntry[];
}

interface BattleCard {
  cardId: string;
  defId: string;
  role: string;
  count: number;
  hp: number;
  maxHp: number;
  damage: number;
  defense: number;
  shields: number;
  accuracy: number;
  targeting: string;
  filledSlots: Record<string, string>;
  veterancyLevel: number;
}

interface CardBattleLogEntry {
  round: number;
  side: string;
  action: "play" | "pass" | "resolve";
  cardId?: string;
  outcome?: { winnerCard?: string; loserCard?: string; damageDealt?: number };
}
```

### T7.3. Создать `server/cardBattle.mjs`

Функции:
- `prepareCardBattle(engagement, world, content)` — превращает `composition[]` обеих сторон в колоды. Каждый стек `composition[i]` -> одна карточка. Тяжелые стеки (count > 5) разбиваются на 2-3 карты по 3-5 юнитов. Раздает по `handSize` карт.
- `resolveCardPair(attackerCard, defenderCard, content)` — matchup-множитель из `combat_matchups.json` + property-мульт из `propertyCombatMult`. Возвращает `{ winnerCard, loserCard, damageDealt }`.
- `playCardRound(state, sideId, cardId, content)` — игрок кладет карту в линию фронта. Если у оппонента есть карта в линии — резолв пары. Если нет — карта бьет по "базе" (HP флота/легиона).
- `checkEndCondition(state)` — 8 раундов или рука+колода пуста у одной стороны.
- `finalizeCardBattle(state, world)` — записывает потери обратно в `composition` флота/легиона. Оставшиеся count на картах = выжившие.

### T7.4. Intent `intent.play_card`

В `intents.json`:
```json
"intent.play_card": {
  "id": "intent.play_card",
  "ap": 0,
  "ops": ["play_card"],
  "params": ["engagementId", "cardId"]
}
```
В `processTurn.mjs` — обработка: если `engagement.mode === "card"`, вызвать `playCardRound`.

### T7.5. Триггеры перехода в карточный режим

В `engagements.mjs` — при создании engagement:
- Если обе стороны прислали `intent.request_card_battle` -> `mode = "card"`.
- Если GM форсирует -> `mode = "card"`.
- Если `powerCorridor` (сила сторон 40-60%) и `mutualConsent` -> предложить обеим сторонам переход.
- Иначе -> `mode = "auto"` (автобой, A6).

### T7.6. UI: `CardBattleTable.tsx`

- Холст с двумя зонами: своя (снизу) и противника (сверху).
- Рука — карточки снизу, можно drag на линию фронта (использовать `<DragCard>` из A2).
- Линия фронта — drop-зона (`<DropZone>` из A2).
- Колода — стопка рубашкой вверх, клик -> добор.
- Сброс — стопка сыгранных карт.
- Лог боя — справа, список раундов.
- Stance (выбранный до боя) — пассивка, показана как бейдж сверху.
- Анимация резолва пары: `motion` — карточки сталкиваются, проигравшая улетает в сброс.

### T7.7. Интеграция в `ViewerPage`

В `ViewerPage.tsx` — если у игрока есть активный `engagement.mode === "card"`, показать `CardBattleTable` вместо обычного боевого UI.

## DoD

- Карточный режим работает: composition -> колода -> разыгрывание -> потери обратно.
- Триггеры работают (mutual consent, GM force, power corridor).
- `CardBattleTable` UI с drag-drop на `@use-gesture/react` + `motion`.
- Автобой остается default и source of truth.
- `npm run smoke:tick` проходит.

## После завершения

1. Запусти `npm run smoke` и `npm run smoke:tick`.
2. Напиши `tmp/summary-{timestamp}.json`.
3. Обнови `GMap/docs/WORK_PLAN.md` — отметь A7 как done.
