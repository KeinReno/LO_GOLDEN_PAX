# Agent A10 — RP Court: NPC Tasks, Chronicle, Court Layout

> Ты работаешь над проектом LO_GOLDEN_PAX / GMap (Vite + React 19 + TS + PixiJS 8 + Zustand + Node API).
> Это твоя полная спецификация. Читай её целиком и выполняй задачи по порядку.

## Принципы (нерушимые)

1. **Сервер = единственная правда.** Все мутации мира — через `server/api.mjs` -> `processTurn.mjs` или intents.
2. **Всё новое — через `ModifierStack` + `effects.json`.**
3. **Новые intents — в `content/core/intents.json`.**
4. **Контент — в JSON-паках `content/core/`.**
5. **Tailwind НЕ добавлять.** Стили — plain CSS в `src/styles/app.css`. Анимации — `motion` + `@use-gesture/react`.
6. **Не ломать существующий пайплайн.** После изменений запускай `npm run smoke` и `npm run smoke:tick`.
7. **Миграции:** новые поля — обнови `server/normalizeWorld.mjs`.
8. **В конце чата** напиши `tmp/summary-{timestamp}.json`.

## Контекст проекта

Прочитай:
- `GMap/docs/CAMPAIGN_TABLE_SPEC.md` — архитектура
- `GMap/src/state/types.ts` — `FactionNpc` (id, name, title, role, status, locationSystemName, etc.)
- `GMap/src/editors/RpChat.tsx` — текущий RP-чат (каналы: hq/scene/ooc, типы сообщений, attach-intent)
- `GMap/server/rpStore.mjs` — RP-лог (chapter/episode/message)
- `GMap/server/narrative.mjs` — `processSystemTimers`, `applyRefugeeConvoy` (твоя точка интеграции для NPC tasks)
- `GMap/src/ui/DragCard.tsx` — карточки (создан A2)
- `GMap/src/viewer/ViewerQuestPanel.tsx` — квестовый UI (переписан A9, квесты связаны с NPC через `sourceNpcId`)

## Скоуп

Превращение RP-вкладки из "меню чата" в "двор/хронику" (жизнь и страдания сэра Бранто). NPC `currentTask` с прогрессом, timeline событий двора, хроника эпизодов как свиток.

## Зависимости

- A2 (нужны `<DragCard>` для карточек NPC/квестов/ресурсов на холсте) — **должен быть выполнен**
- A9 (нужна связь квестов с NPC через `sourceNpcId`) — **должен быть выполнен**

## Файлы

- `GMap/src/state/types.ts` — расширить `FactionNpc`
- `GMap/server/narrative.mjs` — прогресс NPC tasks на тике
- `GMap/content/core/intents.json` — `intent.give_npc_task`
- `GMap/server/processTurn.mjs` — обработка NPC tasks
- `GMap/src/viewer/CourtPanel.tsx` — создать (главный экран RP-режима)
- `GMap/src/viewer/NpcCard.tsx` — создать (карточка NPC)
- `GMap/src/viewer/ChroniclePanel.tsx` — создать (хроника эпизодов)
- `GMap/src/editors/RpChat.tsx` — интеграция (открытие сцены из двора)
- `GMap/server/normalizeWorld.mjs` — миграция

## Цепочка задач

### T10.1. Расширить `FactionNpc` в `types.ts`

```typescript
interface FactionNpc {
  // ...существующее (id, name, title, role, status, locationSystemName, etc.)
  currentTask?: {
    id: string;
    label: string;          // "Восстановление Тангара"
    startedTurn: number;
    etaTurn: number;         // ожидаемое завершение
    progress?: number;      // 0..1
    effects?: EffectInstance[]; // что даст по завершении
    linkedQuestId?: string;  // связанный квест (если есть)
  };
  relationships?: Record<string, number>; // к другим NPC
}
```

### T10.2. Intent `intent.give_npc_task`

В `intents.json`:
```json
"intent.give_npc_task": {
  "id": "intent.give_npc_task",
  "ap": 1,
  "ops": ["give_npc_task"],
  "params": ["npcId", "taskLabel", "etaTurn", "effects"]
}
```
В `processTurn.mjs` — обработка: создает `currentTask` на NPC. Если NPC уже занят — отказ.

### T10.3. Прогресс NPC tasks в `narrative.mjs`

На тике — для каждого NPC с `currentTask`:
- `progress += 1 / etaTurn`.
- Если `progress >= 1` — применить `effects` (через ModifierStack), удалить `currentTask`, journal-событие "NPC X завершил задачу Y".
- Если `linkedQuestId` — продвинуть стадию связанного квеста.

### T10.4. UI: `CourtPanel` (главный экран RP-режима)

Layout:
- **Центр** — лента событий двора (timeline): "ДаяЧина начала проект восстановительных работ на Тангаре", "Прибыл гонец от Легалистов", "Народ Кашшру требует хлеба". Источник: `world.events` (новое поле, или фильтр из `journal` по `type: "court"`).
- **Слева** — портреты NPC двора (`Faction.npcs`) с текущим статусом (`active/away/busy`), их текущим занятием (`currentTask.label`) и кнопкой "Дать поручение". Карточки NPC — `<DragCard>` (можно перетаскивать на холст).
- **Справа** — "Хроника": архив эпизодов по главам (из `rpStore` `RpIndex`), визуально как свиток/летопись, не как список каналов. Клик по эпизоду -> открывает `RpChat` для этого эпизода.

### T10.5. UI: `NpcCard`

Карточка NPC на холсте:
- Портрет, имя, титул.
- Статус (active/away/busy) — цветовой индикатор.
- Текущее поручение (`currentTask.label` + прогресс-бар).
- Кнопка "Дать поручение" -> диалог выбора задачи (или `intent.give_npc_task`).
- Связанные квесты (`sourceNpcId === this npc.id`) — список с прогрессом арки.
- Drag на холст (`<DragCard>` из A2).

### T10.6. UI: `ChroniclePanel`

Хроника эпизодов:
- Группировка по главам (`RpIndex.chapters`).
- Каждый эпизод — карточка с заголовком, датой (turn), статусом (active/closed).
- Closed эпизоды — в архиве, клик -> открывает `RpChat` в read-only.
- Active эпизоды — клик -> открывает `RpChat` для ответа.
- Визуал: свиток/летопись (фон `var(--surface-2)`, шрифт `Cinzel, Times New Roman, serif` если есть, иначе serif).

### T10.7. Интеграция с `RpChat`

Из `CourtPanel` — клик по сцене в хронике -> открывает `RpChat` с нужным `chapterId/episodeId`. Из `RpChat` — кнопка "Назад во двор" -> возвращает в `CourtPanel`.

### T10.8. Интеграция с квестами (A9)

Квесты с `sourceNpcId` показываются в карточке NPC во дворе: "поручено сэром Бранто, этап 2/4". Игрок может через карточку NPC дать поручение "займись этим квестом" — NPC начинает `currentTask`, прогресс которого зависит от кубиков NPC (брошенных сервером на тике, через `dice.mjs` из A9).

### T10.9. Миграция в `normalizeWorld.mjs`

Добавить обработку нового поля `npc.currentTask` (default: undefined). Старые сейвы должны загружаться.

## DoD

- NPC `currentTask` создается через intent, прогрессирует на тике, завершается с effects.
- `CourtPanel` показывает timeline, NPC-карточки, хронику.
- `RpChat` открывается из двора и возвращается обратно.
- Квесты связаны с NPC через `sourceNpcId`.
- `npm run smoke:tick` проходит.
- Старые сейвы загружаются.

## После завершения

1. Запусти `npm run smoke` и `npm run smoke:tick`.
2. Напиши `tmp/summary-{timestamp}.json`.
3. Обнови `GMap/docs/WORK_PLAN.md` — отметь A10 как done.
