# Agent A5 — Science v2: Upgrades, Breakthroughs, Exclusives

> Ты работаешь над проектом LO_GOLDEN_PAX / GMap (Vite + React 19 + TS + PixiJS 8 + Zustand + Node API).
> Это твоя полная спецификация. Читай её целиком и выполняй задачи по порядку.

## Принципы (нерушимые)

1. **Сервер = единственная правда.** Все мутации мира — через `server/api.mjs` -> `processTurn.mjs` или intents.
2. **Всё новое — через `ModifierStack` + `effects.json`.**
3. **Новые intents — в `content/core/intents.json`** с `ap` и `ops`.
4. **Контент — в JSON-паках `content/core/`.**
5. **Tailwind НЕ добавлять.** Стили — plain CSS в `src/styles/app.css`.
6. **Не ломать существующий пайплайн.** После изменений запускай `npm run smoke` и `npm run smoke:tick`.
7. **Миграции:** новые поля — обнови `server/normalizeWorld.mjs`.
8. **В конце чата** напиши `tmp/summary-{timestamp}.json`.

## Контекст проекта

Прочитай:
- `GMap/docs/CAMPAIGN_TABLE_SPEC.md` — архитектура
- `GMap/content/core/technologies.json` — текущие 21 tech (6 веток x 4 эры, линейные пререквизиты)
- `GMap/content/core/economy_schema.json` — категории A-F, F = Знание, `currency.cognitio`
- `GMap/server/techActions.mjs` — `applyUnlockEffects`, `recomputeUnlocksFromTechs`, списание Cognitio
- `GMap/src/viewer/ResearchPanel.tsx` — текущий UI науки
- `GMap/src/viewer/ResearchRadialTree.tsx` — радиальное дерево tech
- `GMap/src/state/contentCatalog.ts` — тип `TechnologyDef`

## Скоуп

Апгрейды изученных tech (углубление вместо ширины), брейкро-tech (era 5), расовые/фракционные эксклюзивы, research_pact как дипло-тип, расширение UI `ResearchPanel`.

## Зависимости

- A1 (нужны `research_cost_mult`, `unit_upgrade` в `effects.json`) — **должен быть выполнен**
- A3 (нужны расы для `raceLock` на techs) — **должен быть выполнен**

## Файлы

- `GMap/content/core/technologies.json` — расширить (upgrades, breakthroughs, exclusives)
- `GMap/content/core/intents.json` — добавить `intent.research_upgrade`
- `GMap/server/techActions.mjs` — расширить (апгрейд tech)
- `GMap/server/diploOffers.mjs` — добавить тип `research_pact`
- `GMap/src/state/types.ts` — расширить `TechnologyDef`
- `GMap/src/state/contentCatalog.ts` — расширить
- `GMap/src/viewer/ResearchPanel.tsx` — расширить UI
- `GMap/src/viewer/ResearchRadialTree.tsx` — расширить UI

## Цепочка задач

### T5.1. Расширить модель tech в `types.ts` и `contentCatalog.ts`

Добавить в `TechnologyDef`:
```typescript
interface TechnologyDef {
  // ...существующее
  upgrades?: TechUpgrade[];
  raceLock?: string;
  factionTraitLock?: string;
  isBreakthrough?: boolean;
}

interface TechUpgrade {
  id: string;
  name: string;
  cost: { "currency.cognitio": number };
  effects: EffectInstance[];
  prerequisites: string[];
  balanceBudget: number;
}
```

### T5.2. Добавить апгрейды в `technologies.json`

Для каждого из 21 существующих tech — добавить 2-3 апгрейда. Три категории:
1. **Эффективность** — +множитель к эффекту tech (например, `tech.fusion.overclock` -> +10% energia output).
2. **Снижение стоимости** — -upkeep для всего, что tech открывает.
3. **Новая функция** — +unlock_property или новый эффект (например, `tech.psionics.xeno_training` -> открывает psion для не-псион-рас через дорогой апгрейд).

### T5.3. Добавить брейкро-tech (era 5)

3-5 tech с `isBreakthrough: true`, `era: 5`, требуют property `matter_destroy` или `corridor_open`. Открывают: `ship.black_iron` (уже в `ships.json`), `ship.psi_cruiser` (уже), планетарные мегаструктуры, белые коридоры как постройка.

### T5.4. Добавить расовые эксклюзивы

2-3 tech на расу с `raceLock`. Требуют >=30% этой расы в населении фракции (проверка в `techActions.mjs`). Примеры:
- `tech.psionic.resonance` (raceLock: psionic) -> +20% psi damage
- `tech.swarm.adaptation` (raceLock: swarm) -> +50% pop growth на отрезанных системах
- `tech.synth.uplift` (raceLock: synth) -> открывает синт-эксклюзивный юнит

### T5.5. Добавить фракционные эксклюзивы

2-3 tech с `factionTraitLock`. Требуют наличия trait у фракции. Примеры:
- `tech.technocracy.ai_research` (factionTraitLock: trait.technocracy) -> +20% cognitio output
- `tech.war_economy.doctrine` (factionTraitLock: trait.war_economy) -> +15% ship damage

### T5.6. Intent `intent.research_upgrade`

В `intents.json`:
```json
"intent.research_upgrade": {
  "id": "intent.research_upgrade",
  "ap": 1,
  "ops": ["research_upgrade"],
  "params": ["techId", "upgradeId"]
}
```
В `techActions.mjs` — функция `researchUpgrade(eco, techId, upgradeId, content)`: проверка что родитель изучен, списание `cognitio`, применение `upgrade.effects`.

### T5.7. Research pact в `diploOffers.mjs`

Новый тип оффера `research_pact`: обе стороны обмениваются `unlockedTechs` (или дают друг другу `production_mult: cognitio 1.05`). При accept — применяется через `treaty_effect` в ModifierStack.

### T5.8. UI: расширить `ResearchPanel` и `ResearchRadialTree`

- На узел tech — иконка "прокачан" (звездочки для изученных upgrades).
- Кнопка "Улучшить" рядом с "Изучить" для изученных tech.
- Подсветка расовых/фракционных эксклюзивов (иконка замка, tooltip "Только для расы X").
- Прогресс-бар Cognitio (накоплено / стоимость).
- Брейкро-tech — отдельным цветом/радиусом на radial tree.

## DoD

- 21 базовый tech + ~60 апгрейдов + ~15 брейкро/расовых/фракционных = ~95 узлов.
- `intent.research_upgrade` работает, списает cognitio, применяет effects.
- `research_pact` работает через дипло-офферы.
- UI показывает апгрейды, эксклюзивы, брейкро.
- `npm run smoke:tick` проходит.

## После завершения

1. Запусти `npm run smoke` и `npm run smoke:tick`.
2. Напиши `tmp/summary-{timestamp}.json`.
3. Обнови `GMap/docs/WORK_PLAN.md` — отметь A5 как done.
