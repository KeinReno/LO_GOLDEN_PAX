# Path-signature catalog — один путь

> Продукт: **GMap**. Skill: `.cursor/skills/tech-path-catalog/`. Принципы волны B: `GMap/docs/agents-pathways/PRINCIPLES.md` §1–6, §11. §12 (пилот 2 пути) **снят OVERRIDE** — этот пакет как раз 6 оставшихся.

## Вход

Владелец задаёт `PATH_ID`. Если не задан — **стоп**, не угадывать все шесть.

Разрешены: `offensive` | `defensive` | `mobility` | `cognitive` | `biological` | `exotic`.  
Запрещены в этом чате: `structural` | `energy` (якоря, только читать).

## Цель игрока

RoleScore пути + Прорыв открывают **не меньше 4 живых** технологий, которые меняют стол (свойство, стат, именной resourceId). Пустой кластер = баг дизайна.

## Файлы (только эти)

- `GMap/content/core/technologies.json` — grep/правка **своих** id
- `GMap/content/core/tech_paths.json` — `cluster.<PATH_ID>` + не ломать чужие кластеры
- `GMap/content/core/tech_directions.json` — добавить `PATH_ID` в `directions.*.paths`, если ещё нет
- Чтение: `effects.json`, `tech_schema.json`, `map_resources.json`, `races.json`, `role_milestones.json`, skill reference.md

Не трогать: UI, `forceRecruit.mjs`, civic/power paths, recipes, sqlite, Viewer*.

## Цепочка

### T0. Исследование (без записи в JSON)

Следуй `.cursor/skills/tech-path-catalog/reference.md`. Составь таблицу кандидатов:

| id | retag / new / skip | улика (файл:символ) | эффект | cost |

Grep `technologies.json` на `breakthroughTechId` из `tech_paths.paths.<PATH_ID>`. Если записи нет — T1 создаёт её. Сейчас для 6 путей записи, скорее всего, **нет** (UI тогда показывает cost 0).

### T1. Breakthrough-тех

id = `tech_paths.paths.<PATH_ID>.breakthroughTechId` (не переименовывать).

Обязательные поля (как фикстура `roleScores.test.mjs`):

- `id`, `name` (имперский стол, коротко)
- `opensPath`: `<PATH_ID>`
- `effects`: `[{ "effect": "open_path", "args": { "pathId": "<PATH_ID>" } }]`
- `cost`: `{ "currency.cognitio": 70 }`
- `era`: 3, `category` по reference.md
- `flavor` ≤200
- **без** `researchPath`, **без** upgrades
- `isBreakthrough`: true допустимо

Не менять `role_milestones.*.threshold`.

### T2. Четыре сигнатуры

Минимум 4 live id в `cluster.<PATH_ID>`.

Имена-примеры из `ECONOMY_TECH_REDESIGN_SPEC.md` §10.1 — **подсказки**, не обязательные id. Сначала retag.

Каждая сигнатура:

- `researchPath`: `<PATH_ID>`
- tags включают `path:<PATH_ID>` и `path_cluster`
- era ≥ 3
- нет `catalogPending`
- 1–2 эффекта из словаря; magnitude ≤ якоря `tech.crystal_integration`
- `prerequisites`: содержит breakthrough **или** live opener той же эры
- `tradeable`: true (задел рынка; механику покупки не писать)

### T3. Направление оффера

Если `PATH_ID` нет ни в одном `tech_directions.directions.*.paths` — добавь по таблице reference.md. Не трогай `will`.

### T4. Validate

```bash
cd GMap && npm run validate:tech
```

Errors = не сдано. Warnings по своим новым id — закрыть.

Опционально, не ломая чужое: `npm run test:tech-offers` `npm run test:rolescore`.

### T5. Отчёт владельцу (обязателен)

```
PATH_ID:
Retag: (id → почему)
New: (id → референс лор/каталог/Stellaris-адаптация)
Skipped live: (id → почему core, не путь)
Directions: (куда добавлен)
Validate: (команда + 0 errors)
Balance vs crystal_integration: (cost/effects)
Хвост не в скоупе: (здания milestones, recipes, raise gate)
```

Коммит только если владелец попросил.

## DoD

1. `cluster.<PATH_ID>.length >= 4`, все id существуют в `technologies.json`
2. Breakthrough id существует, `open_path` + `opensPath`, cost 70
3. Прорыв пути с пустым кластером больше невозможен *по содержанию* (кластер не `[]`)
4. Era 1–2 не получили `researchPath`
5. Нет `raceLock` на новых/retag записях
6. `validate:tech` 0 errors
7. UI не менялся, tech id не хардкожены
8. Отчёт T5 заполнен уликами, не «сделал красиво»

## Провал

- Нет улики в лоре/JSON → **skip**, не фантазия
- Property нет в словаре → не выдумывать, взять существующий или спросить владельца (1 вопрос)
- Конфликт с живым structural/energy id → не резать якорь
