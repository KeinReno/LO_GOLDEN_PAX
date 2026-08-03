# Agent A1 — Foundation: Effects, Faction Traits, Balance Lint

> Ты работаешь над проектом LO_GOLDEN_PAX / GMap (Vite + React 19 + TS + PixiJS 8 + Zustand + Node API).
> Это твоя полная спецификация. Читай её целиком и выполняй задачи по порядку.

## Принципы (нерушимые)

1. **Сервер = единственная правда.** Все мутации мира — через `server/api.mjs` -> `processTurn.mjs` или intents. Zustand на клиенте — только вьюха.
2. **Всё новое — через `ModifierStack` + `effects.json`.** Никаких отдельных "систем" в обход стека. Новые каналы — новые ключи в `channelKey` (`server/modifierStack.mjs`).
3. **Новые intents — в `content/core/intents.json`** с `ap` и `ops`.
4. **Контент — в JSON-паках `content/core/`**, не в коде.
5. **Новые состояния — расширения существующих типов** в `src/state/types.ts`. Без новых top-level таблиц.
6. **Tailwind НЕ добавлять.** Стили — plain CSS в `src/styles/app.css` с дизайн-токенами (см. `.cursor/skills/strategy-game-ui/SKILL.md`). Анимации — `motion` (Framer Motion) + `@use-gesture/react` (уже в `package.json`).
7. **Не ломать существующий пайплайн.** После изменений запускай `npm run smoke` и `npm run smoke:tick` — должны проходить.
8. **Миграции:** новые поля в существующих типах — обнови `server/normalizeWorld.mjs` для обратной совместимости.
9. **В конце чата** напиши `tmp/summary-{timestamp}.json` (см. `.cursor/rules/after_each_chat.mdc`).

## Контекст проекта

Прочитай для понимания архитектуры:
- `GMap/docs/CAMPAIGN_TABLE_SPEC.md` — архитектура
- `GMap/docs/CAMPAIGN_TABLE_AMENDMENTS.md` — дополнения
- `GMap/docs/WORK_PLAN.md` — текущий статус работ
- `GMap/server/modifierStack.mjs` — движок модификаторов (твоя главная точка расширения)
- `GMap/content/core/effects.json` — словарь эффектов
- `GMap/content/core/races.json` — пример traits (расы уже работают так, как ты должен сделать для фракций)

## Скоуп

Расширение словаря эффектов, добавление фракционных traits, поле `balanceBudget` для последующего CI-линта. Это **базовый слой**, на который опираются все остальные агенты.

## Зависимости

Нет. Стартуешь первым.

## Файлы

- `GMap/content/core/effects.json` — расширить
- `GMap/content/core/faction_traits.json` — создать
- `GMap/src/state/types.ts` — расширить `Faction`
- `GMap/server/modifierStack.mjs` — расширить `channelKey`
- `GMap/server/economyTick.mjs` — собирать faction traits в стек
- `GMap/scripts/lintBalance.mjs` — создать
- `GMap/package.json` — добавить скрипт `lint:balance`
- `GMap/src/editors/PolityEditor.tsx` — UI выбора traits
- `GMap/server/normalizeWorld.mjs` — миграция (новое поле `Faction.traits`)

## Цепочка задач

### T1.1. Расширить `effects.json` новыми типами

Добавить в `effects.effects` следующие типы (каждый с `id`, `format`, `description`):

- `loyalty_add` — `{ raceId?: string, amount: number }`
- `loyalty_mult` — `{ raceId?: string, mult: number }`
- `logistics_range_add` — `{ hops: number }`
- `logistics_disconnected_penalty` — `{ productionMult: number, upkeepMult: number, combatDefMult: number }`
- `unit_upgrade` — `{ from: string, to: string }`
- `building_level_mult` — `{ mult: number }`
- `diplomacy_opinion_add` — `{ towardFactionId: string, amount: number }`
- `diplomacy_trust_decay_mult` — `{ mult: number }`
- `research_cost_mult` — `{ category?: string, mult: number }`
- `treaty_effect` — `{ treatyId: string, effect: string, args: object }`
- `revolt_risk` — `{ chancePerTurn: number }`
- `npc_task_speed_mult` — `{ mult: number }`

### T1.2. Расширить `Faction` в `types.ts`

Добавить поле `traits?: FactionTrait[]`. Создать интерфейс `FactionTrait`:
```typescript
export interface FactionTrait {
  id: string;
  label: string;
  effects: EffectInstance[];
  balanceBudget: number;
  conditions?: { minEra?: number; tag?: string };
}
```
Если `EffectInstance` ещё не вынесен в общий тип — вынеси.

### T1.3. Расширить `channelKey` в `modifierStack.mjs`

Добавить ключи для новых каналов:
- `loyalty:${a.raceId || "*"}`
- `logistics:${a.kind || "default"}`
- `diplomacy:${a.towardFactionId || "*"}`
- `research:${a.category || "*"}`
- `npc_task:${a.kind || "*"}`

Обнови `isMult`/`isFlat`:
- `loyalty_add` — flat
- `loyalty_mult` — mult
- `logistics_disconnected_penalty` — other (композитный)
- `revolt_risk` — other

### T1.4. Создать `content/core/faction_traits.json`

Каталог из ~15 типовых черт держав с компромиссами. Каждая — `id`, `name`, `ideology` (militarist/technocrat/trader/puritan/expansionist/isolationist/...), `effects[]`, `balanceBudget`.

Минимум 15 трейтов (по 2-3 на идеологию):

- `trait.war_economy` — +10% metal, -5% loyalty, budget 0
- `trait.technocracy` — -10% research cost, +20% building cost, budget +1
- `trait.merchant_guilds` — +15% trade income, -1 AP, budget 0
- `trait.standing_army` — +10% ship damage, +1 supply upkeep/ship, budget 0
- `trait.citizen_militia` — +20% garrison defense, -10% ship speed, budget -1
- `trait.propaganda_machine` — +2 loyalty/turn, -10% research speed, budget 0
- `trait.xenophile` — +20% diplomacy trust gain, -10% loyalty для non-human рас, budget 0
- `trait.xenophobe` — +5% loyalty для основной расы, -20% diplomacy trust gain, budget 0
- `trait.frontier_culture` — +1 logistics range, -10% stability на temperate, budget 0
- `trait.ecumenopolis` — +50% pop cap, -20% pop growth, +2 supply upkeep/turn, budget +1
- `trait.psi_doctrine` — unlock psion для не-псион-рас, -15% production, budget +2
- `trait.swarm_protocol` — +50% pop growth, forbid set_tax, budget 0
- `trait.void_navy` — -20% move cost, -1 stability на temperate, budget 0
- `trait.scholar_knights` — +10% research, +5% ship defense, -10% pop growth, budget 0
- `trait.raider_lords` — +20% bombard damage, -15% diplomacy trust, budget 0

### T1.5. Собирать faction traits в `economyTick.mjs`

В функцию сбора стека (где уже собираются race traits, building effects, tax tiers) — добавить шаг `faction.traits`. Источник: `world.factions.find(f => f.id === ownerFactionId).traits`. В `explain.lines` добавить `source: "faction"`. В `explain.factionTraits[]` (новое поле рядом с `raceTraits[]`) — список `{ label, summary }`.

### T1.6. UI: выбор traits в `PolityEditor`

В `src/editors/PolityEditor.tsx` — раздел "Черты державы" (мультивыбор из `faction_traits.json`, до 3 одновременно). Сохранение в `Faction.traits`. Показывать `balanceBudget` суммы в реальном времени с предупреждением, если вне диапазона `[-2, +2]`.

### T1.7. Создать `scripts/lintBalance.mjs`

Скрипт читает `races.json` + `faction_traits.json` + `technologies.json`. Для каждой возможной комбинации (раса + до 3 фракционных traits) считает сумму `balanceBudget`. Падает с ошибкой, если вне `[-2, +2]`. Добавить в `package.json` скрипт `"lint:balance": "node scripts/lintBalance.mjs"`.

### T1.8. Миграция в `normalizeWorld.mjs`

Добавить обработку нового поля `Faction.traits`: если отсутствует — `traits = []`. Старые сейвы должны загружаться без ошибок.

## DoD

- `effects.json` содержит все 12 новых типов эффектов.
- `Faction.traits` работает в `PolityEditor`, выбор сохраняется.
- `economyTick` применяет faction traits и они видны в `explain.factionTraits`.
- `npm run lint:balance` проходит без ошибок на текущем контенте.
- `npm run smoke` и `npm run smoke:tick` проходят.
- Старые сейвы загружаются без ошибок (миграция работает).

## После завершения

1. Запусти `npm run smoke` и `npm run smoke:tick` — убедись, что проходят.
2. Запусти `npm run lint:balance` — убедись, что проходит.
3. Напиши `tmp/summary-{timestamp}.json` с кратким итогом.
4. Обнови `GMap/docs/WORK_PLAN.md` — отметь A1 как done.
