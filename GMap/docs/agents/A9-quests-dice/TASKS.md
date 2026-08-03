# Agent A9 — Quests v2 + Dice System

> Ты работаешь над проектом LO_GOLDEN_PAX / GMap (Vite + React 19 + TS + PixiJS 8 + Zustand + Node API).
> Это твоя полная спецификация. Читай её целиком и выполняй задачи по порядку.

## Принципы (нерушимые)

1. **Сервер = единственная правда.** Все мутации мира — через `server/api.mjs` -> `processTurn.mjs` или intents.
2. **Всё новое — через `ModifierStack` + `effects.json`.**
3. **Новые intents — в `content/core/intents.json`.**
4. **Контент — в JSON-паках `content/core/`.**
5. **Tailwind НЕ добавлять.** Стили — plain CSS в `src/styles/app.css`. Анимации — `motion` + `@use-gesture/react`.
6. **RNG — только серверный** (`server/dice.mjs` или `node:crypto`). Клиент только проигрывает анимацию уже известного результата.
7. **Не ломать существующий пайплайн.** После изменений запускай `npm run smoke` и `npm run smoke:tick`.
8. **Миграции:** новые поля — обнови `server/normalizeWorld.mjs`.
9. **В конце чата** напиши `tmp/summary-{timestamp}.json`.

## Контекст проекта

Прочитай:
- `GMap/docs/CAMPAIGN_TABLE_SPEC.md` — архитектура
- `GMap/src/state/types.ts` — текущий `Quest` (id, name, summary, detail, systemId, status)
- `GMap/src/viewer/ViewerQuestPanel.tsx` — текущий UI (список active/done)
- `GMap/src/editors/QuestPanel.tsx` — текущее досье квеста
- `GMap/server/rpStore.mjs` — RP-лог (сюда пишутся броски кубиков)
- `GMap/content/core/effects.json` — `loyalty_add` (создан A1, используется в effects квест-выборов)
- `GMap/src/ui/DragCard.tsx` — карточки (создан A2)
- `GMap/src/ui/DropZone.tsx` — drop-зоны (создан A2)

## Скоуп

Расширение модели квестов (типы, арки, история, choices, diceRequired), система кубиков (серверный RNG, RP-лог), каталог ежходных квестов, sidebar UI с историей.

## Зависимости

- A1 (нужны `loyalty_add` для effects квест-выборов) — **должен быть выполнен**
- A2 (нужны `<DragCard>` для карточек выбора) — **должен быть выполнен**
- A3 (нужна loyalty для effects квест-выборов) — **должен быть выполнен**

## Файлы

- `GMap/content/core/yearly_quests.json` — создать (каталог 50-200 квестов)
- `GMap/content/core/intents.json` — добавить intents
- `GMap/server/dice.mjs` — создать
- `GMap/server/questEngine.mjs` — создать
- `GMap/server/processTurn.mjs` — ежходный квест-тик
- `GMap/server/rpStore.mjs` — запись бросков в RP-лог
- `GMap/src/state/types.ts` — расширить `Quest`
- `GMap/src/state/worldStore.ts` — квестовые actions
- `GMap/src/viewer/ViewerQuestPanel.tsx` — переписать (sidebar + history)
- `GMap/src/viewer/QuestDossier.tsx` — создать (детали квеста с choices)
- `GMap/src/ui/DiceRoller.tsx` — создать (3D-кубик на CSS transform)
- `GMap/server/normalizeWorld.mjs` — миграция

## Цепочка задач

### T9.1. Расширить `Quest` в `types.ts`

```typescript
interface Quest {
  id: string;
  name: string;
  summary: string;
  detail?: string;
  systemId: string | null;
  status: QuestStatus;
  // НОВОЕ:
  type: "main" | "side" | "faction" | "foreign" | "yearly";
  sourceNpcId?: string | null;
  sourceFactionId?: string | null;
  arc?: { stages: QuestStage[]; currentStage: number };
  history: QuestHistoryEntry[];
  choices?: QuestChoice[];
  diceRequired?: DiceSpec[];
  expiresTurn?: number | null;
}

interface QuestStage {
  id: string;
  label: string;
  summary: string;
  choices?: QuestChoice[];
  diceRequired?: DiceSpec[];
}

interface QuestHistoryEntry {
  at: string;
  turn: number;
  kind: "message" | "choice" | "dice" | "stage_change" | "reward";
  body: string;
  authorName?: string;
  outcome?: string;
}

interface QuestChoice {
  id: string;
  label: string;
  description?: string;
  effects?: EffectInstance[];
  nextStageId?: string;
  diceRequired?: DiceSpec[];
}

interface DiceSpec {
  count: number;
  sides: number;    // 6, 20, 100
  label: string;
  threshold?: number;
}
```

### T9.2. Создать `server/dice.mjs`

Функции:
- `rollDie(sides: number)` — `crypto.randomInt(1, sides + 1)`.
- `rollDice(spec: DiceSpec)` — массив результатов.
- `rollSuccess(spec: DiceSpec, rolls: number[])` — `sum(rolls) >= threshold`.
- `rollRecurringQuests(factionId, world, content)` — бросок 1d6, возвращает число ежходных квестов.

Все броски — серверные. Результат пишется в `rpStore` как `system`-сообщение: "Игрок X бросил d20: 14 (успех)".

### T9.3. Создать `content/core/yearly_quests.json`

Каталог из 50-200 заготовок с тегами ситуации. Структура:
```json
{
  "yq.grain_shortage": {
    "id": "yq.grain_shortage",
    "name": "Недород на окраине",
    "summary": "На планете X неурожай, население голодает.",
    "filterBy": { "lowLoyaltyRace": "race_human", "minEra": 1 },
    "choices": [
      {
        "id": "feed",
        "label": "Раздать запасы",
        "effects": [
          { "effect": "upkeep_flat", "args": { "resource": "currency.bios", "amount": -5 } },
          { "effect": "loyalty_add", "args": { "raceId": "race_human", "amount": 3 } }
        ]
      },
      {
        "id": "ignore",
        "label": "Игнорировать",
        "effects": [
          { "effect": "loyalty_add", "args": { "raceId": "race_human", "amount": -5 } }
        ]
      }
    ]
  }
}
```

`filterBy` теги: `minEra`, `maxWarCount`, `hasRefugees`, `lowLoyaltyRace`, `borderWithWar`, `requiresRace`, `requiresBuilding`, `excludeIfArcActive`.

Минимум 50 квестов по категориям: голод/бунт/торговля/пираты/аномалия/дипло-инцидент/научный/военный/миграция/эпидемия.

### T9.4. Создать `server/questEngine.mjs`

Функции:
- `rollYearlyQuests(factionId, world, content)` — вызывается на тике. Бросает 1d6 через `dice.mjs`. Выбирает N квестов из `yearly_quests.json`, отфильтрованных по `filterBy` (ситуация фракции). Если пул меньше N — добирает нейтральными. Создает `Quest` объекты с `type: "yearly"`, `expiresTurn: currentTurn + 1`.
- `resolveQuestChoice(questId, choiceId, world, content)` — применяет `choice.effects` через ModifierStack, добавляет `QuestHistoryEntry`, переходит к `nextStageId`.
- `resolveQuestDice(questId, spec, world, content)` — бросает кубик, сравнивает с `threshold`, применяет `onSuccess`/`onFail` effects (если есть в choice).

### T9.5. Intents

В `intents.json`:
```json
"intent.throw_quest_dice": { "ap": 0, "ops": ["throw_quest_dice"], "params": [] },
"intent.resolve_quest_choice": { "ap": 0, "ops": ["resolve_quest_choice"], "params": ["questId", "choiceId"] },
"intent.resolve_quest_dice": { "ap": 0, "ops": ["resolve_quest_dice"], "params": ["questId", "specIndex"] }
```

### T9.6. Интеграция в `processTurn.mjs`

На тике (перед economyTick) — для каждой фракции:
1. Если у игрока ещё не брошен "кубик квестов" на этот ход — UI показывает кнопку "Бросить кубик (1d6)".
2. После броска — `rollYearlyQuests` создает N квестов.
3. Квесты с `expiresTurn` истекают на следующем тике (если не разрешены — `status: "expired"`).

### T9.7. UI: `ViewerQuestPanel` (sidebar + history)

- **Левый sidebar** — список квестов, сгруппированный по `type`: "Основной сюжет" / "Сайды" / "Фракционные" / "От других государств" / "Ежходные". Каждый пункт: `name` + `sourceNpcId/sourceFactionId` + бейдж статуса + для ежходных иконка кубика (не брошен).
- **Правая колонка** — "история взаимодействий": timeline из `history[]` + текущая стадия арки + (если есть `choices`) — карточки выбора + (если есть `diceRequired`) — кнопка "Бросить кубик".
- Использовать Sidebar (expandable, hover-open) из Aceterty, портированный под токены.

### T9.8. UI: `QuestDossier`

Детали квеста: timeline стадий арки, карточки выбора (drag на "стол решений" — `<DragCard>` из A2), анимация исхода через `motion`.

### T9.9. UI: `DiceRoller`

3D-кубик на CSS `transform: rotateX/Y` (30 строк, без Aceterty). Анимация броска ~1.5с. Финальное значение — с сервера (уже известно до анимации). Обертка — `StatefulButton` (loading во время броска) + Text Generate Effect (Aceterty, портированный) для появления результата.

### T9.10. Миграция в `normalizeWorld.mjs`

Добавить обработку новых полей: `quest.type` (default "side"), `quest.history` (default []), `quest.arc` (default undefined). Старые сейвы должны загружаться.

## DoD

- 50+ ежходных квестов в каталоге.
- 1d6 бросок определяет число квестов на ход.
- Квесты фильтруются по ситуации фракции.
- Choices применяют effects, dice резолвит исход.
- Sidebar + history UI работает.
- 3D-кубик анимируется, результат с сервера.
- `npm run smoke:tick` проходит.
- Старые сейвы загружаются.

## После завершения

1. Запусти `npm run smoke` и `npm run smoke:tick`.
2. Напиши `tmp/summary-{timestamp}.json`.
3. Обнови `GMap/docs/WORK_PLAN.md` — отметь A9 как done.
