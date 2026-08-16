# Agent B2 — Роли ресурсов + RoleScore

> **Owner OVERRIDE 2026-08-16:** пилот 2 роли расширен до **8**. PRINCIPLES §12 снят для этого трека. Не рестартить B1–B7.

> Ты работаешь над проектом LO_GOLDEN_PAX / GMap. Читай спецификацию целиком, выполняй по порядку.

## Принципы (нерушимые)

См. `../PRINCIPLES.md`. **OVERRIDE:** все 8 ролей (🛡⚡🎯🔰🚀🧠🌱✨). Не трогать techOffers / sockets / revolt / court / labor.

## Контекст

- `GMap/docs/ECONOMY_TECH_REDESIGN_SPEC.md` §6 (роли), §7 (двухуровневая ценность/RoleScore), §8 (клоны).
- Восемь ролей целиком (для справки, но реализуешь только первые две):
  🛡 Структурный, ⚡ Энергетический, 🎯 Ударный, 🔰 Защитный, 🚀 Мобильность, 🧠 Когнитивный, 🌱 Биологический,
  ✨ Экзотический.
- Диагноз клонов: `map.iron`/`map.titan`/`map.glasssteel`/`map.titanium` сейчас все несут ровно
  `properties: ["strong"]`, различаются только тиром — механически неотличимы.

## Зависимости

**Требует B1 завершённым** (именные strategic-стоки, `eco.stocks[resourceId]`). RoleScore считается и по
strategic, и по bulk ресурсам (роль — независимая ось от strategic-флага), но сама инфраструктура именного
учёта нужна как референс для T2.4.

## Файлы

- `GMap/content/core/map_resources.json` — добавить `roles: string[]`, дифференцировать клонов
- `GMap/server/ledger.mjs` или `economyTick.mjs` — хранение и накопление `roleScore`
- `GMap/content/core/role_milestones.json` — создать, пороги + разблокировки (только 2 роли)
- `GMap/server/economyTick.mjs` — считать RoleScore в `runEconomyTick`
- `GMap/server/api.mjs` — отдать RoleScore в существующий economy-эндпоинт (не создавай новый роут без нужды)
- `GMap/server/normalizeWorld.mjs` — миграция

## Цепочка задач

### T2.1. Добавить `roles` в `map_resources.json`

Закрытый список id: `structural`, `energy`, `offensive`, `defensive`, `mobility`, `cognitive`, `biological`,
`exotic`. Заполни осмысленно **только** для ресурсов, реально относящихся к 🛡 (structural) и ⚡ (energy) —
остальные роли можно оставить `roles: []`, их разметка не в этом заходе. Ресурс может нести 1-2 роли.

Ориентир по существующим `properties`: всё с `"strong"` без второй уникальной черты — кандидат на
`structural`. Всё с `"fuel"`/`"energy"` — кандидат на `energy`. `map.solari` (`fuel, energy, weapon_amp,
shield`) получит `roles: ["energy"]` (плюс потенциально `offensive`/`defensive`, но это не пилотные роли —
не добавляй их сейчас).

### T2.2. Дифференцировать структурных клонов (§8, вариант А)

`map.iron`, `map.titan`, `map.glasssteel`, `map.titanium` — сейчас идентичны (`["strong"]`). Дать каждому
вторую черту:
- `map.iron` — оставить `["strong"]` (базовый, T1, без спецэффекта — это нормально для самого дешёвого тира)
- `map.titan` — `["strong", "lightweight"]`
- `map.glasssteel` — `["strong", "optics"]`
- `map.titanium` — `["strong", "heat_resistant"]`

Новые properties (`lightweight`/`optics`/`heat_resistant`) пока могут не иметь эффекта в движке — это
контентная разметка для будущего использования в слотах кораблей, не обязательно проводить полный эффект
в этой задаче (если время позволяет — можно добавить `unlock_property`-подобный эффект по аналогии с
существующими паттернами в `technologies.json`, но это не блокирует DoD).

### T2.3. Структура данных RoleScore

Добавь в `ledger.mjs` (рядом с `eco.stocks`) новое поле `eco.roleScore: Record<string, number>` — **не** в
`types.ts` как новая top-level таблица (принцип 5), а как расширение существующей эко-структуры фракции в
леджере. Инициализация — `{}` (отсутствующая роль = `0`).

### T2.4. Копить RoleScore в `runEconomyTick`

Формула: `roleScore[role] += Σ (добыто_за_тик_конкретного_ресурса × tier_вес)` — **накопительно, никогда не
уменьшается** (в отличие от stocks, это не тратится). `tier_вес` — предлагаемая простая формула
`tier` (линейно) или `tier^1.2` (лёгкая прогрессия к редкости) — выбери и задокументируй в summary, не
усложняй сверх меры. Считай только для ресурсов с непустым `roles[]` из T2.1 (сейчас — только structural/
energy).

### T2.5. Отдать RoleScore в API

В существующем economy-эндпоинте (`server/api.mjs`, где уже отдаётся `eco`/breakdown) — добавь `roleScore`
в payload. Не создавай отдельный роут, если можно расширить существующий ответ.

### T2.6. Пороги и разблокировки — `content/core/role_milestones.json`

Создай файл с порогами **только для 2 пилотных ролей**:

```json
{
  "structural": {
    "threshold": 5000,
    "unlocks": [
      { "kind": "building", "id": "building.fortress_station", "name": "Крепость-станция" }
    ]
  },
  "energy": {
    "threshold": 5000,
    "unlocks": [
      { "kind": "building", "id": "building.solar_forge", "name": "Солнечная кузница" }
    ]
  }
}
```

Числа `5000` — плейсхолдер, не итоговый баланс (баланс проверяется отдельно, не в этой задаче — см.
`ECONOMY_TECH_REDESIGN_SPEC.md` §12). Сами постройки (`building.fortress_station`, `building.solar_forge`)
создай минимально в `buildings.json` по образцу существующих записей (`kind`, `zone`, `cost`, `slots`,
`effects`) — не обязательно полностью сбалансированные, это заглушки для проверки цепочки целиком.

При достижении порога — эффект `unlock_property` или аналогичный существующий паттерн разблокировки
(посмотри, как `unlock_tech_tier`/`unlock_property` уже работают в `technologies.json` и `techActions.mjs`,
переиспользуй тот же механизм, не изобретай новый).

### T2.7. Миграция

`normalizeWorld.mjs` — если `eco.roleScore` отсутствует (старый сейв), инициализировать `{}`.

### T2.8. Тесты

`npm run smoke`, `npm run smoke:tick`. Добавь проверку в `sessionSmoke.mjs`: после N тиков с добычей
структурных/энергетических ресурсов `roleScore.structural`/`roleScore.energy` растут и не убывают.

## DoD

- `map_resources.json`: `roles` заполнены для structural/energy-релевантных записей, клоны из T2.2
  дифференцированы.
- `roleScore` копится по тику, доступен через API, никогда не уменьшается.
- При достижении порога — реально разблокируется постройка (проверяемо вручную через API/UI).
- `npm run smoke`, `npm run smoke:tick` проходят.
- Старые сейвы грузятся без ошибок.

## После завершения

1. Прогони smoke-тесты.
2. Напиши `tmp/summary-{timestamp}.json` — обязательно укажи выбранную формулу веса тира и почему.
3. Обнови `ECONOMY_TECH_REDESIGN_SPEC.md` §13 — отметь пилот RoleScore как реализованный (не весь §10 целиком).
