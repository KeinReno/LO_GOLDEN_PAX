# Path catalog — исследование и баланс

Агент **сам** находит референсы. Не спрашивать владельца «что написать», пока не исчерпаны источники ниже.

## Словарь (не путать)

| Слово | Что это | Где |
|---|---|---|
| RoleScore | «кем стал», не валюта | `eco.roleScores`, `role_milestones.json` |
| Path | материальный путь = та же 8 ролей | `tech_paths.json` `paths.*` |
| Direction | 6 направлений оффера игроку | `tech_directions.json` |
| Category A–F | слот экономики, не склад | `economy_schema.json` |
| Core pool | техи без `researchPath` | era 1–2 всегда сюда |

8 путей закрыты: `structural` `energy` `offensive` `defensive` `mobility` `cognitive` `biological` `exotic`.  
Гражданские (`civic_paths` trade/culture) и Пути Силы (`power_paths`) — **не этот пакет**.

## Исследование (обязательный порядок)

Не грузить forbidden (token-economy). Grep по id, Read с limit.

### 1. Живой стол (механический якорь)

- `GMap/content/core/tech_paths.json` — запись пути, `cluster.*`, `breakthroughTechId`, `raceAffinity`
- Grep `technologies.json` по каждому id из живого кластера `structural` / `energy` (не файл целиком)
- `GMap/server/roleScores.test.mjs` — фикстура breakthrough (`opensPath` + `open_path`, cognitio **70**)
- `GMap/docs/TECH_PATHS_PLAN_v06.md` — landed vs still open
- `GMap/docs/ECONOMY_TECH_REDESIGN_SPEC.md` **только §10.1 строка своего пути**

### 2. Что уже есть в каталоге (retag vs new)

Grep `GMap/content/core/technologies.json` по смыслу пути, не по догадке:

| Путь | Искать |
|---|---|
| offensive | siege, ordnance, boarding, vanguard, assault, weapon |
| defensive | shield, bastion, bunker, armor, garrison |
| mobility | jump, drive, logistics, intercept, rapid, wormhole |
| cognitive | neural, predict, cognitio, computation, psi, institute |
| biological | bios, hive, regen, evolution, swarm, biomass |
| exotic | relic, anomaly, wonder, matter_destroy, blakula, vaitid |

Также: `unlock_property` / `stat_mult` / `combat_role_mult` в соседних техах той же эпохи.

**Правило:** если live-тех уже несёт идентичность — **retag** (`researchPath`, теги `path:<id>`, `path_cluster`, era≥3). Новую запись заводить только если grep пуст или live-тех — универсальный core (геология, базовая добыча).

### 3. Ресурсы и расы (идентичность, не лок)

- Grep `map_resources.json` `"roles"` рядом с именем ресурса — чем кормится RoleScore этого пути
- Grep `races.json` / `faction_traits.json` по расе, peg, reproduction — аффинити **только если уже проступает** (пример канона: Карнед→structural, Белатор→energy, Синт→cognitive не energy)
- Не добавлять `raceAffinity` «для красоты». Нет улики — не пиши.

### 4. Юниты/постройки (только чтение)

Grep `units.json` / `ships.json` / `buildings.json` / `effects.json`.  
Если здания из `role_milestones.unlocks` нет в `buildings.json` — **не создавать**. Пометь в отчёте как хвост другого чата.

### 5. Лор (канон, не проповедь)

Искать узко, не читать тома:

- `00_Канон/` и `05_Промпт_ИИ/19_Конфликты_канона.md` — grep по расе/ресурсу/оружию пути
- Не делать публичной механикой секреты: Гость/Хор, независимость Северного Роя, Сай=Раихим, мыслевирус ОР
- Новые расы/фракции не вводить
- Копия игроку: имперский стол, ≤200 символов flavor, без сленга

### 6. Внешний референс (Stellaris / ES2)

`GMap/docs/TECH_CATALOG_SPEC.md` — **банк идей**, не SoT.  
Снимать имена империй DLC. Эффект только из словаря `effects.json` (уже в schema: `open_path`, `unlock_property`, `stat_mult`, `combat_role_mult`, `production_mult` по **resourceId**, не бакет).  
Не прогонять `generateTechCatalog.mjs` в этом проходе.

## Куда класть

| Поле | Правило |
|---|---|
| `researchPath` | id пути; только era 3+ |
| `opensPath` + effect `open_path` | только breakthrough |
| `era` | сигнатура 3; доктрина-флагман 3–4; era 5 без upgrades |
| `category` | экономика идентичности, не «свободная буква». Offensive/defensive часто C; mobility C/D; cognitive F; biological E; exotic F или B по улике |
| `cost.currency.cognitio` | era 3 сигнатура **42** (± якорь crystal_integration); breakthrough **70** |
| `prerequisites` | breakthrough этого пути **или** live opener той же эры. Не prereq live эры выше своей |
| `catalogPending` | на живой сигнатуре **false/нет** |
| `tech_paths.cluster.<id>` | ровно id живых техов (≥4) |
| `tech_directions.json` | path id должен быть в `directions.*.paths` иначе оффер направления его не кормит |

### Направление оффера (default, можно оспорить уликой)

| Path | Direction |
|---|---|
| offensive, defensive, mobility | `military` (уже) |
| cognitive | `governance` |
| biological | `industry` (iconTag biology уже есть) |
| exotic | `industry` |
| — | не класть материальный путь в `diplomacy.paths` (`will` — Путь Силы) |

## Баланс first-pass (калибровать на ходах, не свято)

Сверяй с `tech.crystal_integration`: era 3, cost 42, `unlock_tech_tier` + `unlock_property`, upgrade ~50% базы.

| Рычаг | База | Моды | Clamp | Провал | Не делать |
|---|---|---|---|---|---|
| Сигнатура ×4 | cost 42, 1–2 dictionary effects | affinity только из `raceAffinity` | mag production_mult era3 ≈ 1.05 | пустой flavor / нет effect | сильнее hull doctrine без отчёта |
| Breakthrough | cost 70, `open_path` | RoleScore ≥ 5000 (не менять порог) | path ещё не open | нет записи в `technologies.json` (UI покажет cost 0) | тихий автоанлок |
| `unlock_property` | одно свойство, уже существующее в schema/слотах | — | не выдумывать `weapon.laser99` | property нет в словаре | новый тип урона в коде |
| `stat_mult` / `combat_role_mult` | 1.08–1.15 | court уже множит | ≤1.15 first-pass | стак с аурами картобоя без пометки | 1.5 «чтобы чувствовалось» |
| `production_mult` | именной `resourceId` из роли пути | — | не `currency.materia` бакет если есть map.* | RoleScore не от этого ресурса | вторая экономика |

Порог RoleScore **5000 не трогать** в этом пакете.

## Эффекты

Только ключи из `content/core/effects.json` / enum в `tech_schema.json`.  
Новый глагол движка = стоп, вернуть владельцу. Контент ≠ код.

## Анти-фичи

1. Доктрины Воплощения (Кибернетика/Синтетика/Мехинарии)
2. raceLock / factionTraitLock «чтобы путь был уникальным»
3. Прогресс-бар на дипломатии; новая комната «Пути»; новая валюта прорыва
