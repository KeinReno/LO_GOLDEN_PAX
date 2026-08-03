# Agent A6 — Combat Core: Engagement-as-Event, Phases, Veterancy, Defense Units

> Ты работаешь над проектом LO_GOLDEN_PAX / GMap (Vite + React 19 + TS + PixiJS 8 + Zustand + Node API).
> Это твоя полная спецификация. Читай её целиком и выполняй задачи по порядку.

## Принципы (нерушимые)

1. **Сервер = единственная правда.** Все мутации мира — через `server/api.mjs` -> `processTurn.mjs` или intents.
2. **Всё новое — через `ModifierStack` + `effects.json`.**
3. **Новые intents — в `content/core/intents.json`.**
4. **Контент — в JSON-паках `content/core/`.**
5. **Tailwind НЕ добавлять.** Стили — plain CSS в `src/styles/app.css`.
6. **Не ломать существующий пайплайн.** После изменений запускай `npm run smoke` и `npm run smoke:tick`.
7. **Миграции:** новые поля — обнови `server/normalizeWorld.mjs`.
8. **В конце чата** напиши `tmp/summary-{timestamp}.json`.

## Контекст проекта

Прочитай:
- `GMap/docs/CAMPAIGN_TABLE_SPEC.md` — архитектура
- `GMap/server/combatResolve.mjs` — текущий резолв боя (gatherGroups -> rolePower -> totalPower -> applyCasualties)
- `GMap/server/engagements.mjs` — создание/резолв engagement (сейчас `locked: true` сразу — это проблема)
- `GMap/content/core/combat_matchups.json` — матрица контрматчей ролей (11x11)
- `GMap/content/core/combat_stances.json` — stance (hold/assault/skirmish/retreat/bombard)
- `GMap/content/core/units.json` — текущие юниты (все `faction: "generic"`)
- `GMap/content/core/ships.json` — текущие корабли
- `GMap/content/core/rules.json` — `combat.allowEarlyResolve`
- `GMap/src/editors/CombatPanel.tsx` — UI боя
- `GMap/src/viewer/EngagementStanceRing.tsx` — stance UI (сейчас почти не работает)
- `GMap/src/viewer/ForcesArmory.tsx` — UI состава флота

## Скоуп

Превращение боя из атомарной операции в тике в **событие во времени** (engagement живёт между тиками, ждёт stance от игрока). 4-фазная модель assault (bombard -> landing -> ground -> occupation). Стационарные "юниты" планетарной обороны. Veterancy юнитов (xp/level).

## Зависимости

- A1 (нужны `unit_upgrade` в `effects.json`) — **должен быть выполнен**
- A3 (нужна loyalty penalty к обороне) — **должен быть выполнен**
- A4 (нужна logistics `combatDefMult` при отрезанности) — **должен быть выполнен**
- A5 (нужны `unit_upgrade` tech-эффекты для уровней юнитов) — **должен быть выполнен**

## Файлы

- `GMap/server/engagements.mjs` — переписать логику создания/резолва
- `GMap/server/combatResolve.mjs` — расширить (фазы, veterancy)
- `GMap/server/processTurn.mjs` — изменение порядка резолва
- `GMap/content/core/units.json` — стационарные "юниты" обороны
- `GMap/content/core/rules.json` — секция `veterancy`, `engagement`
- `GMap/content/core/intents.json` — `intent.request_card_battle` (заглушка для A7)
- `GMap/src/state/types.ts` — расширить `Engagement`, `ShipGroup`, `Legion`
- `GMap/src/editors/CombatPanel.tsx` — UI фаз
- `GMap/src/viewer/EngagementStanceRing.tsx` — починить
- `GMap/src/viewer/ForcesArmory.tsx` — veterancy звезды
- `GMap/server/normalizeWorld.mjs` — миграция

## Цепочка задач

### T6.1. Engagement как событие во времени

Изменить в `engagements.mjs::createEngagement`:
- `status: "commit"` -> `status: "active"` (не резолвится сразу).
- `locked: true` -> `locked: false` для обеих сторон.
- Добавить `startedTurn`, `roundsElapsed: 0`, `maxRounds: 3`, `requiresPlayerInput: true`.

В `processTurn.mjs`:
- Если есть `engagement.status === "active"` с `requiresPlayerInput` — **не резолвить**, оставить на следующий тик.
- Показать в Inbox "Бой в системе X, выберите stance".
- Если `roundsElapsed >= maxRounds` — форс-резолв с auto-locked (автобой).
- Если обе стороны `locked` (через `intent.combat_stance`) — резолвить.

### T6.2. Починить stance-UI

`intent.combat_stance` уже есть в `intents.json`. Теперь, когда engagement не резолвится сразу, у игрока есть окно между тиками для выбора stance. `EngagementStanceRing` и `FleetOrderRing` — проверь, что они вызывают `intent.combat_stance` с правильным `engagementId`.

### T6.3. Veterancy в `composition`

Расширить `ShipGroup` и легионный composition-элемент:
```typescript
interface ShipGroup {
  type: string;
  count: number;
  hp?: number;
  filledSlots?: Record<string, string>;
  xp?: number;     // новое
  level?: number;  // новое, 0..5
}
```

В `rules.json` — секция `veterancy`:
```json
"veterancy": {
  "thresholds": [0, 100, 250, 500, 900, 1500],
  "bonuses": [
    {},
    { "stat_mult": { "defense": 1.05 } },
    { "stat_mult": { "defense": 1.10, "damage": 1.05 } },
    { "stat_mult": { "defense": 1.15, "damage": 1.10 } },
    { "stat_mult": { "defense": 1.20, "damage": 1.15 } },
    { "stat_mult": { "defense": 1.25, "damage": 1.20 } }
  ],
  "xpPerBattle": 50,
  "xpLossOnUnitUpgrade": 0.5
}
```

В `combatResolve.mjs::gatherGroups` — после `def.stats` применить `veterancyBonuses[level]`. В `combatResolve.mjs` после боя — начислить `xp += xpPerBattle` всем выжившим группам. При `unit_upgrade` (через tech) — `xp *= xpLossOnUnitUpgrade`.

### T6.4. Стационарные "юниты" планетарной обороны

В `units.json` добавить:
```json
"unit.planetary_gun": {
  "id": "unit.planetary_gun", "name": "Планетарное орудие",
  "faction": "generic", "tier": 3, "roles": ["garrison"],
  "stats": { "damage": 18, "defense": 30, "hp": 200, "speed": 0 },
  "targeting": "assault_first",
  "theaterMult": { "ground": 1, "assault": 1, "space": 0 }
},
"unit.shield_dome": {
  "id": "unit.shield_dome", "name": "Щитовой купол",
  "faction": "generic", "tier": 4, "roles": ["garrison"],
  "stats": { "damage": 0, "defense": 10, "shields": 80, "hp": 150, "speed": 0 },
  "targeting": "garrison_first",
  "theaterMult": { "ground": 1, "assault": 1, "space": 0 }
},
"unit.bunker": {
  "id": "unit.bunker", "name": "Бункер",
  "faction": "generic", "tier": 3, "roles": ["garrison"],
  "stats": { "damage": 8, "defense": 50, "hp": 300, "speed": 0 },
  "targeting": "assault_first",
  "theaterMult": { "ground": 1, "assault": 1, "space": 0 }
}
```

В `gatherGroups` — для защитника планеты: если на планете есть здания `defense` -> добавить 1 `unit.bunker` и 1 `unit.planetary_gun` за здание. Если `barracks` -> +1 `unit.bunker`.

### T6.5. 4-фазная модель assault

Расширить `Engagement`:
```typescript
interface Engagement {
  // ...существующее
  phase?: "bombard" | "landing" | "ground" | "occupation";
  planetId?: string | null;
  orbitalControl?: "attacker" | "defender" | "contested";
  defenseLayers?: {
    orbital: { guns: number; shields: number };
    surface: { guns: number; bunkers: number };
    garrison: { unitIds: string[]; fortBonus: number };
  };
}
```

В `combatResolve.mjs` — разбить резолв assault на последовательность:
1. **Bombard** — только `bombard`-роль (`ship.dreadnought`, `ship.battleship`) бьёт по `defenseLayers.orbital` и `surface`. Наземные юниты не отвечают. Цель — подавить ПВО.
2. **Landing** — `assault`-юниты (`unit.breach_cadre`) высаживаются, штраф если `orbital.shields > 0`. Наземные `garrison`/`infantry` отвечают.
3. **Ground** — `infantry`/`armor`/`psi` vs `garrison`/`infantry`. Бонус от `defense` зданий (+defense), `barracks` (+garrison HP).
4. **Occupation** — если защитников 0, планета переходит к атакующему. `population` получает `stability_add: -3` (оккупация), шанс `refugees` POI.

Каждая фаза — отдельный "раунд" в engagement. Между фазами — окно для stance-выбора (если `requiresPlayerInput`).

### T6.6. UI: `CombatPanel` фазовая лента

В `CombatPanel.tsx` — добавить ленту из 4 шагов сверху, подсветка активной фазы. Кнопки "Перейти к следующей фазе" для GM (early resolve уже есть в `rules.combat.allowEarlyResolve`).

### T6.7. UI: veterancy звезды в `ForcesArmory`

В `ForcesArmory.tsx` — рядом с каждым стеком состава показывать звездочки veterancy (0-5). Tooltip с текущими бонусами.

### T6.8. Заглушка `intent.request_card_battle`

В `intents.json` — добавить intent (ap: 0, params: engagementId). В `engagements.mjs` — обработка: если обе стороны прислали `request_card_battle` для одного engagement -> `engagement.mode = "card"` (A7 реализует сам режим). Пока — просто флаг, который не делает ничего.

### T6.9. Миграция в `normalizeWorld.mjs`

Добавить обработку новых полей: `engagement.phase`, `engagement.status` (default "active" для новых, "resolved" для старых), `shipGroup.xp` (default 0), `shipGroup.level` (default 0). Старые сейвы должны загружаться.

## DoD

- Engagement живёт между тиками, ждёт stance от игрока.
- `EngagementStanceRing` работает (игрок может выбрать stance).
- 4-фазный assault резолвится последовательно.
- Стационарные юниты обороны участвуют в бою.
- Veterancy начисляется и применяется.
- `npm run smoke:tick` проходит (с боем).
- Старые сейвы загружаются.

## После завершения

1. Запусти `npm run smoke` и `npm run smoke:tick`.
2. Напиши `tmp/summary-{timestamp}.json`.
3. Обнови `GMap/docs/WORK_PLAN.md` — отметь A6 как done.
