# Agent A8 — Diplomacy v2: Opinion, Treaties, UI

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
- `GMap/src/editors/DiplomacyPanel.tsx` — текущий UI (таблица NxN с select) — нужно переписать
- `GMap/src/viewer/ViewerDiploPanel.tsx` — игроковый UI (список + transfer) — нужно переписать
- `GMap/server/diploOffers.mjs` — текущие дипло-офферы (give/want)
- `GMap/src/state/types.ts` — `DiplomacyRelation`, `DiplomacyEdge`, `Faction`
- `GMap/content/core/races.json` — `xenorelations` (A3 расширил, теперь читается)
- `GMap/content/core/faction_traits.json` — `diplomacyBias` (создан A1)
- `GMap/src/ui/DragCard.tsx` — карточки (создан A2)
- `GMap/src/ui/DropZone.tsx` — drop-зоны (создан A2)

## Скоуп

Система opinion (0-100 между фракциями), treaties как state-объекты с effects, новый UI дипломатии в стиле Endless Space 2 / Galactic Civ 2 (карточки, timeline, animated tooltip).

## Зависимости

- A1 (нужны `diplomacy_opinion_add`, `diplomacy_trust_decay_mult`, `treaty_effect` в `effects.json`) — **должен быть выполнен**
- A2 (нужны `<DragCard>` и `<DropZone>`) — **должен быть выполнен**
- A3 (нужны `xenorelations` для opinion расчёта) — **должен быть выполнен**
- A5 (нужен `research_pact` тип оффера) — **должен быть выполнен**

## Файлы

- `GMap/content/core/diplomacy_stances.json` — создать
- `GMap/content/core/intents.json` — расширить
- `GMap/server/diploOffers.mjs` — расширить (opinion, treaties)
- `GMap/server/processTurn.mjs` — opinion tick
- `GMap/server/economyTick.mjs` — применение treaty effects
- `GMap/src/state/types.ts` — расширить `DiplomacyRelation`, `Faction`
- `GMap/src/editors/DiplomacyPanel.tsx` — переписать
- `GMap/src/viewer/ViewerDiploPanel.tsx` — переписать
- `GMap/server/normalizeWorld.mjs` — миграция

## Цепочка задач

### T8.1. Расширить `DiplomacyRelation`

```typescript
type DiplomacyRelation =
  | "neutral" | "alliance" | "trade" | "war" | "vassal" | "truce"
  | "nap"             // пакт о ненападении
  | "research_pact"   // совместная наука
  | "migration_treaty" // открытые границы для населения
  | "embargo";        // торговое эмбарго
```

### T8.2. Создать `content/core/diplomacy_stances.json`

Каталог типов договоров с effects:
```json
{
  "trade": {
    "id": "trade", "name": "Торговый договор",
    "effects": [{ "effect": "production_mult", "args": { "resource": "currency.metal", "mult": 1.05 } }],
    "duration": "permanent", "breakable": true, "trustDecayOnBreak": 10
  },
  "alliance": {
    "effects": [{ "effect": "treaty_effect", "args": { "treatyId": "alliance", "effect": "combat_assist", "args": {} } }]
  },
  "research_pact": {
    "effects": [{ "effect": "production_mult", "args": { "resource": "currency.cognitio", "mult": 1.05 } }]
  },
  "nap": { "effects": [], "breakable": true, "trustDecayOnBreak": 15 },
  "embargo": {
    "effects": [{ "effect": "production_mult", "args": { "resource": "currency.metal", "mult": 0.9 } }]
  }
}
```

### T8.3. Opinion в `types.ts`

```typescript
interface Faction {
  // ...существующее
  diplomacy?: {
    opinions: Record<string, number>;  // factionId -> opinion (-100..100)
    treaties: Treaty[];
  };
}

interface Treaty {
  id: string;
  type: DiplomacyRelation;
  withFactionId: string;
  startedTurn: number;
  expiresTurn?: number | null;
  effects: EffectInstance[];
}
```

### T8.4. Opinion tick в `processTurn.mjs`

На тике — пересчёт opinion для каждой пары фракций:
- Базовый opinion: 0 (neutral).
- `xenorelations` рас (если доминирующая раса фракции A имеет `xenorelations[raceB] < 0` -> opinion -= 10).
- `diplomacyBias` фракции (из `faction_traits.json` -> `aggressive` -> opinion -= 5 ко всем).
- Общие враги -> opinion += 5.
- Общие союзники -> opinion += 3.
- Нарушенный договор -> opinion -= 20 (ко всем, не только к жертве — casus belli).
- Дары/торговля -> opinion += 2/ход.
- Trust decay: `diplomacy_trust_decay_mult` -> opinion стремится к 0 со временем.

### T8.5. Treaty effects в `economyTick.mjs`

При сборе стека для фракции — добавить effects из всех активных `treaties`. Источник: `faction.diplomacy.treaties`.

### T8.6. UI: новый `DiplomacyPanel`

Двухпанельный layout:
- **Слева** — список фракций (карточки с гербом, цветом, текущим отношением, счетчиком претензий/предложений). Hover -> Animated Tooltip (Aceterty, портированный под токены) с opinion-баром.
- **Справа** — фокус-досье выбранной фракции:
  - Шапка: герб, имя, тип (state/faction), эра, размер флота, население.
  - Блок "Отношение": текущий opinion + Timeline (Aceterty, портированный) с историей событий.
  - Блок "Предложение" (конструктор): drop-зоны "Даю" / "Хочу". `<DragCard>` из казны/tech/систем/договоров. Кнопка "Отправить" -> `intent.make_diplo_offer`.
  - Блок "Входящие": входящие офферы с Accept/Reject/Counter.
  - Glowing Effect (Aceterty) на карточке, если статус требует внимания (истекает договор, объявлена война).

### T8.7. UI: новый `ViewerDiploPanel`

Игроковая версия — без конструктора офферов (только просмотр + accept/reject входящих). Drag-drop только для отправки ресурсов в оффере.

### T8.8. Миграция в `normalizeWorld.mjs`

Добавить обработку новых полей: `faction.diplomacy` (default: `{ opinions: {}, treaties: [] }`). Старые `DiplomacyEdge` -> конвертировать в `Treaty` объекты. Старые сейвы должны загружаться.

## DoD

- 9 типов дипло-отношений (включая nap, research_pact, migration_treaty, embargo).
- Opinion считается на тике, виден в UI.
- Treaties применяют effects через ModifierStack.
- Новый `DiplomacyPanel` с карточками, timeline, animated tooltip.
- `npm run smoke:tick` проходит.
- Старые сейвы загружаются.

## После завершения

1. Запусти `npm run smoke` и `npm run smoke:tick`.
2. Напиши `tmp/summary-{timestamp}.json`.
3. Обнови `GMap/docs/WORK_PLAN.md` — отметь A8 как done.
