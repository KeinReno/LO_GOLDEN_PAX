# ТЕХНО-АЛХИМИЯ — Спецификация лаборатории

> Документ для реализации. Версия: **1.0** · Дата: **2026-08-04**  
> Статус: **концепт, утверждён как направление**  
> Связан с: `TECH_CATALOG_SPEC.md`, `TECH_TREE_SPEC.md`, `SCIENCE_SECTION_SPEC.md`, `UI_SYSTEMS_MASTER_SPEC.md`, `INTEL_FOG_SPEC.md`

---

## 0. Оглавление

1. [Цель и принцип](#1-цель-и-принцип)
2. [Что это НЕ](#2-что-это-не)
3. [Правила комбинаций](#3-правила-комбинаций)
4. [Экономика эксперимента](#4-экономика-эксперимента)
5. [Источники рецептов](#5-источники-рецептов)
6. [Модель данных](#6-модель-данных)
7. [UI: Лаборатория](#7-ui-лаборатория)
8. [Жесты](#8-жесты)
9. [Интеграция с системами](#9-интеграция-с-системами)
10. [Seed-рецепты (≈40 → цель 150)](#10-seed-рецепты)
11. [Баланс-параметры](#11-баланс-параметры)
12. [Этапы реализации](#12-этапы-реализации)
13. [Чеклист приёмки](#13-чеклист-приёмки)

---

## 1. Цель и принцип

**Техно-алхимия** — дополнительный путь открытия технологий через комбинацию уже изученных.

> Обычное исследование за cognitio остаётся **основным** путём.  
> Эксперимент — **боковой слой** стратегии и RP («смешали Y и Z — получили X»).

Целевой масштаб:
| Слой | Объём |
|---|---|
| Базовый каталог | ≈400 технологий (`TECH_CATALOG_SPEC.md`) |
| Рецепты алхимии | **100–200** (цель ≈150) |
| Уникальные вне каталога | расы / рынок / квесты / GM (отдельные id) |

---

## 2. Что это НЕ

- Не замена дерева технологий и cognitio.
- Не C(50,2)×2 комбинаций на эру (хаос контента).
- Не случайный крафт без рецепта как основной цикл (blind experiment — опциональный риск, см. §4.3).
- Не отдельная валюта: платим **тем же cognitio**.

---

## 3. Правила комбинаций

### 3.1 Допуск пары

Пара `(A, B)` допустима, если:

1. Обе технологии **изучены** фракцией (`unlockedTechs`).
2. Категории **одинаковые или смежные** по кольцу A–F:

```
A ↔ B ↔ C ↔ D ↔ E ↔ F ↔ A   (adjacent + same)
```

Запрещены дальние пары: `A+C`, `A+D`, `B+D`, `B+E`, `C+E`, `C+F`, `D+F` (и зеркала).  
Исключение: `F↔A` **разрешена** как замыкание кольца RPS (знание ↔ сырьё).

3. Существует запись в `tech_recipes.json` **или** игрок идёт в blind experiment (§4.3).
4. Результат ещё **не изучен** (повторный успех → возврат части cognitio, не дубль).

### 3.2 Порядок ингредиентов

Рецепт канонически хранит `ingredients` отсортированными лексикографически.  
UI drag A→B и B→A — одна и та же пара.

### 3.3 Эпохи

По умолчанию: `max(era(A), era(B))` результата ≤ `max(era(A), era(B)) + 1`.  
Прорывные (Era 5) **не** получаются слепым экспериментом — только known recipe / GM / квест / рынок.

---

## 4. Экономика эксперимента

### 4.1 Лимиты хода

| Параметр | Default | Ключ в `rules.json` |
|---|---|---|
| Попыток в ход | 3 | `alchemy.attemptsPerTurn` |
| Базовая стоимость | 8 cognitio | `alchemy.baseCost` |
| Множитель за разницу эр | +4 за каждый `|eraA−eraB|` | `alchemy.eraGapCost` |
| Возврат при уже изученном результате | 50% | `alchemy.duplicateRefund` |

Здания / tech могут повышать `attemptsPerTurn` через `ModifierStack` (`alchemy_attempts_add` — добавить в словарь эффектов при реализации).

### 4.2 Known recipe

1. Списать cognitio.
2. Списать 1 попытку хода.
3. Выдать `resultTechId` в `unlockedTechs`.
4. Пометить рецепт как `discovered` у фракции (если ещё не был).
5. Запись в хронику / RP-хук.

### 4.3 Blind experiment (опциональный риск)

Игрок комбинирует две открытые допустимые технологии **без** известного рецепта:

| Исход | Вероятность (default) | Эффект |
|---|---|---|
| Успех (рецепт существует в контенте) | `alchemy.blindHit` = 0.25 | Как known recipe + открытие рецепта |
| Частичный успех (flavor only) | 0.35 | Flavor-текст, 0 tech, 25% refund |
| Провал | 0.40 | Только списание попытки и cognitio |

Если для пары **нет** записи в контенте — всегда «частичный успех / провал» (никогда не спавнить tech на лету).

> Правило контента: **новые технологии только из JSON**. Blind лишь открывает уже описанные рецепты.

### 4.4 Cognitio и лаборатории

- Обычный research и алхимия делят один пул cognitio.
- Археология / здания F по-прежнему кормят cognitio — алхимия их **не обесценивает**, а тратит.

---

## 5. Источники рецептов

| Источник | Как попадает к игроку | Intel Fog |
|---|---|---|
| Blind success | авто-discover | свой рецепт = level 4 |
| Квест | награда `grant_recipe` | level 4 |
| Рынок / торговля | ордер на `recipe.*` или tech+recipe bundle | level 2–4 по сделке |
| Дипломатия | research_pact / gift | по уровню контакта |
| Раса | `raceLock` на combo-tech или стартовый recipe pack | level 4 если раса своя |
| GM / RP | API `grantRecipe(factionId, recipeId)` | level 4 |

Чужие неоткрытые рецепты в справочнике: level 0–1 (имя «неизвестный протокол») до разведки.

---

## 6. Модель данных

### 6.1 Content: `content/core/tech_recipes.json`

```json
{
  "recipe.geo_materials": {
    "id": "recipe.geo_materials",
    "ingredients": ["tech.a_geology", "tech.b_materials_science"],
    "results": ["tech.combo_geo_materials"],
    "era": 1,
    "tags": ["general"],
    "costOverride": null,
    "flavor": "Геологическая карта подсказывает сплавы, которых ещё нет в справочнике.",
    "discoverableBlind": true
  }
}
```

Правила:
- `ingredients.length === 2` (v1; тройки — не в скоупе).
- `results` — 1 tech id (редко 2 — оба выдаются).
- Результат-tech живёт в `technologies.json` с тегом `alchemy` / `combo`.
- Не хардкодить recipe id в UI.

### 6.2 Campaign state

В `data/` (или внутри faction economy blob):

```json
{
  "faction_belator": {
    "alchemy": {
      "attemptsUsedThisTurn": 1,
      "discoveredRecipes": ["recipe.geo_materials"],
      "lastExperimentTurn": 112
    }
  }
}
```

Сброс `attemptsUsedThisTurn` на tick.

### 6.3 Результат-технологии

Combo-tech:
- обычный объект `TechnologyDef`;
- `tags: ["alchemy", "combo"]`;
- `prerequisites` может быть пустым (доступ только через recipe grant) **или** дублировать ингредиенты для отображения в дереве;
- Era 1–4: апгрейды разрешены; Era 5 breakthrough — без апгрейдов;
- `balanceBudget` обязателен.

---

## 7. UI: Лаборатория

Вкладка / режим внутри раздела **Наука** (не отдельная кнопка нижнего бара в v1).

```
┌ Наукa ──────────────────────────────────────────┐
│ [Дерево] [Очередь] [Лаборатория]                │
│ Cognitio: 42   Попытки: 2/3                     │
│                                                 │
│  ┌ Ингредиент A ┐    ✕    ┌ Ингредиент B ┐     │
│  │  (drop tech) │  ──►──  │  (drop tech) │     │
│  └──────────────┘         └──────────────┘     │
│                                                 │
│  Превью: «Гео-материалы» · 8 cognitio · OK     │
│  [Эксперимент]                                  │
│                                                 │
│  Открытые рецепты (12)          Журнал хода     │
└─────────────────────────────────────────────────┘
```

Правило 2 шагов: вижу пару → жму Эксперимент (или drop A на B в дереве).

Превью **до** действия: стоимость, шанс (если blind), результат (если recipe known), блокировки.

---

## 8. Жесты

| Жест | Действие |
|---|---|
| Drag tech → tech (в дереве или Лаборатории) | Предложить комбинацию / заполнить слоты |
| Long-press на tech | Радиальное: «Эксперимент / В дереве / Сравнить» |
| Drag recipe-карточки из квеста/рынка | Добавить в `discoveredRecipes` |
| Drag cognitio на слот эксперимента | Подтвердить оплату (альт. к кнопке) |

Язык жестов совпадает с `SCIENCE_SECTION_SPEC.md` / картой.

---

## 9. Интеграция с системами

| Система | Влияние |
|---|---|
| Cognitio / research | Общий пул; алхимия тратит, не заменяет |
| ModifierStack | Эффекты combo-tech через тот же стек |
| Intel Fog | Рецепты и combo-tech маскируются по level |
| Рынок | Торговля `recipe.*` и combo-tech |
| Квесты | `grant_recipe` / `grant_tech` |
| Race Registry | Расовые combo / стартовые packs |
| Дипломатия | research_pact может включать recipes |
| Хроника / RP | Событие эксперимента |

API (черновик):
- `POST /api/economy/alchemy/experiment` `{ factionId, techA, techB, mode: "known"|"blind" }`
- `POST /api/gm/grant-recipe` (GM only)

Intent (опционально): `intent.alchemy_experiment` с `ap` в `intents.json`.

---

## 10. Seed-рецепты

Цель: ≈150. Ниже — **seed ≈40** для наполнения агентами.  
Все `tech.combo_*` нужно добавить в `technologies.json` при миграции.

### 10.1 Adjacent A–B

| recipe id | ingredients | result |
|---|---|---|
| `recipe.geo_materials` | `tech.a_geology` + `tech.b_materials_science` | `tech.combo_geo_materials` |
| `recipe.ore_alloys` | `tech.a_ore_extraction` + `tech.b_basic_alloys` | `tech.combo_ore_alloys` |
| `recipe.drill_composites` | `tech.a_deep_drilling` + `tech.b_composite_materials` | `tech.combo_drill_composites` |
| `recipe.mining_metallurgy` | `tech.a_mining_networks` + `tech.b_metallurgy` | `tech.combo_mining_metallurgy` |
| `recipe.crystal_prospect` | `tech.a_crystal_mining` + `tech.b_crystal_growing` | `tech.combo_crystal_prospect` |
| `recipe.slag_recycle` | `tech.a_slag_reclamation` + `tech.b_material_recycling` | `tech.combo_slag_recycle` |
| `recipe.quantum_mining` | `tech.a_quantum_extraction` + `tech.b_quantum_materials` | `tech.combo_quantum_mining` |
| `recipe.nano_extract` | `tech.a_nanite_mining` + `tech.b_nanomaterials` | `tech.combo_nano_extract` |

### 10.2 Adjacent B–C

| recipe id | ingredients | result |
|---|---|---|
| `recipe.alloy_lines` | `tech.b_basic_alloys` + `tech.c_assembly_lines` | `tech.combo_alloy_lines` |
| `recipe.plasma_forging` | `tech.b_metallurgy` + `tech.c_planetary_forges` | `tech.combo_plasma_yard` |
| `recipe.armor_yards` | `tech.b_ablative_hull_plates` + `tech.c_fleet_batch_builds` | `tech.combo_armor_yards` |
| `recipe.printer_matter` | `tech.b_programmable_matter` + `tech.c_printer_foundries` | `tech.combo_matter_printers` |
| `recipe.composite_prefab` | `tech.b_advanced_composites` + `tech.c_prefab_bay_standards` | `tech.combo_composite_prefab` |
| `recipe.shield_modules` | `tech.b_transparent_armor` + `tech.c_module_hotswap` | `tech.combo_shield_modules` |

### 10.3 Adjacent C–D

| recipe id | ingredients | result |
|---|---|---|
| `recipe.powered_lines` | `tech.c_assembly_lines` + `tech.d_power_grid_mgmt` | `tech.combo_powered_lines` |
| `recipe.yard_reactors` | `tech.c_orbital_manufacturing` + `tech.d_fusion_reactors` | `tech.combo_yard_reactors` |
| `recipe.mobile_power` | `tech.c_mobile_shipyards` + `tech.d_fleet_tanker_doctrine` | `tech.combo_mobile_power` |
| `recipe.siege_beams` | `tech.c_siege_works_kits` + `tech.d_beam_artillery_power` | `tech.combo_siege_beams` |
| `recipe.drydock_caps` | `tech.c_drydock_expansion` + `tech.d_capacitor_banks` | `tech.combo_drydock_caps` |
| `recipe.night_grid` | `tech.c_night_shift_ai` + `tech.d_distributed_microgrids` | `tech.combo_night_grid` |

### 10.4 Adjacent D–E

| recipe id | ingredients | result |
|---|---|---|
| `recipe.bio_fusion` | `tech.d_fusion_reactors` + `tech.e_bioengineering` | `tech.combo_bio_fusion` |
| `recipe.greenhouse_power` | `tech.d_solar_arrays` + `tech.e_hydroponics` | `tech.combo_greenhouse_power` |
| `recipe.med_batteries` | `tech.d_battery_tech` + `tech.e_medical_advances` | `tech.combo_med_batteries` |
| `recipe.cryo_power` | `tech.d_energy_storage` + `tech.e_cryosleep_wards` | `tech.combo_cryo_power` |
| `recipe.terra_heat` | `tech.d_geothermal_taps` + `tech.e_terraforming` | `tech.combo_terra_heat` |
| `recipe.life_support_bus` | `tech.d_fleet_power_bus` + `tech.e_closed_ecology_ships` | `tech.combo_life_support_bus` |

### 10.5 Adjacent E–F

| recipe id | ingredients | result |
|---|---|---|
| `recipe.psionic_genetics` | `tech.e_genetic_engineering` + `tech.f_psionic_theory` | `tech.combo_psionic_genetics` |
| `recipe.bio_compute` | `tech.e_bio_computing` + `tech.f_neural_networks` | `tech.combo_bio_compute` |
| `recipe.gene_archives` | `tech.e_gene_bank_vaults` + `tech.f_archive_compression` | `tech.combo_gene_archives` |
| `recipe.mind_rehab` | `tech.e_neural_rehab` + `tech.f_cognitive_enhancement` | `tech.combo_mind_rehab` |
| `recipe.species_oracle` | `tech.e_species_design_labs` + `tech.f_oracle_clusters` | `tech.combo_species_oracle` |
| `recipe.memory_labs` | `tech.e_memory_inheritance` + `tech.f_mnemonic_implants` | `tech.combo_memory_labs` |

### 10.6 Adjacent F–A (замыкание кольца)

| recipe id | ingredients | result |
|---|---|---|
| `recipe.survey_science` | `tech.f_astronomy` + `tech.a_mineral_surveying` | `tech.combo_survey_science` |
| `recipe.anomaly_prospect` | `tech.f_anomaly_detection` + `tech.a_anomaly_tapping` | `tech.combo_anomaly_prospect` |
| `recipe.ore_oracle_link` | `tech.f_hypothesis_engines` + `tech.a_ore_oracle` | `tech.combo_ore_oracle_link` |
| `recipe.relic_seams` | `tech.f_relic_decoding` + `tech.a_isotope_prospecting` | `tech.combo_relic_seams` |

### 10.7 Same-category (внутри ветки)

| recipe id | ingredients | result |
|---|---|---|
| `recipe.extract_doctrine` | `tech.a_mining_networks` + `tech.a_ore_train_networks` | `tech.combo_extract_logistics` |
| `recipe.hull_doctrine` | `tech.b_ablative_hull_plates` + `tech.b_layered_reactive_armor` | `tech.combo_hull_doctrine` |
| `recipe.yard_doctrine` | `tech.c_fleet_batch_builds` + `tech.c_rapid_repair_bays` | `tech.combo_yard_doctrine` |
| `recipe.grid_doctrine` | `tech.d_power_grid_mgmt` + `tech.d_grid_islanding` | `tech.combo_grid_doctrine` |
| `recipe.pop_doctrine` | `tech.e_population_growth` + `tech.e_creche_networks` | `tech.combo_pop_doctrine` |
| `recipe.lab_doctrine` | `tech.f_basic_research` + `tech.f_experiment_schedulers` | `tech.combo_lab_doctrine` |

Агенты дополняют до ≈150 по тем же правилам: только adjacent/same, уникальный result id, flavor ≤200, `discoverableBlind` для Era≤3.

### 10.8 Live bridges (текущее дерево)

Пока каталог A–F не мигрирован в `technologies.json`, играбельный слой — рецепты с тегом `live_bridge` (`npm run generate:alchemy`).  
Ингредиенты = id из live-дерева (`tech.geology`, `tech.fusion`, …). Результаты = `tech.combo_live_*`.  
Сейчас **39** live-рецептов покрывают A–B … F–A и same-category цепочки.

---

## 11. Баланс-параметры

Числа якорятся на `economy_balance.tech.eraBaseCognitio` и `economy_balance.alchemy`.

| Ключ | Default | Заметки |
|---|---|---|
| `alchemy.attemptsPerTurn` | 2 | Здания могут +1..+2 |
| `alchemy.baseCost` | 6 | ≈ era1×0.5 cognitio |
| `alchemy.eraGapCost` | 3 | ≈ era1×0.25 за `|eraA−eraB|` |
| `alchemy.blindHit` | 0.25 | Только если recipe есть |
| `alchemy.duplicateRefund` | 0.5 | Уже изученный result |
| `alchemy.comboCostFactor` | 0 | Result выдаётся «бесплатно» после оплаты эксперимента |
| Combo `balanceBudget` | 0..+1 | Слабее обычного mid-era tech |

Бюджет: `attempts × baseCost ≤ era1 research (12)` — алхимия не съедает весь стартовый cognitio.  
Tech market: recipe ≈ 1.0× experimentCost; tech listing cognitio ≈ eraCost×2, metal ≈ metalByTier×2.

Combo не должны быть строго сильнее обычного research того же тира — иначе дерево обесценится.

---

## 12. Этапы реализации

1. **Spec freeze** — этот документ + каталог (done).
2. **Content** — `tech_recipes.json` + `tech_combos.json` (done; ~42 catalog recipes + **39 live bridges** on current `technologies.json`). Combo-tech не влиты в дерево research (`alchemyOnly`).
3. **Server** — `alchemyActions.mjs` + API preview/experiment + GM grant-recipe + tick reset (done).
4. **Schema / validate** — `validate:recipes` (done); расширять по мере миграции каталога.
5. **UI** — вкладка Лаборатория + жесты дерева: drag tech→tech, long-press «Эксперимент» (done).
6. **Intel / market / quests** — `grant_recipe` в квестах, diplo `kind:recipe`, базар `tech-market/buy` (done).
7. **Expand** — агенты доводят рецепты до ≈150.
8. **Balance pass** — числа cost/effects (отдельный этап).

---

## 13. Чеклист приёмки

- [ ] Эксперимент списывает cognitio и попытку хода.
- [ ] Нельзя комбинировать неизученное / дальние категории.
- [ ] Known recipe всегда детерминирован.
- [ ] Blind не создаёт tech вне JSON.
- [ ] Era 5 combo только через known/GM/quest/market.
- [ ] UI: превью до действия, жест drag tech→tech.
- [ ] `validateTechnologies` / новый `validateTechRecipes` зелёные.
- [ ] Нет хардкода recipe/tech id в `.tsx`/`.mjs`.

---

## Связанные файлы

- `TECH_CATALOG_SPEC.md` — 400 базовых технологий
- `TECH_TREE_SPEC.md` — шаблоны JSON / эффекты
- `SCIENCE_SECTION_SPEC.md` — UI Науки
- `UI_SYSTEMS_MASTER_SPEC.md` — парадигма жестов
- `INTEL_FOG_SPEC.md` — маскировка знаний
- `content/core/technologies.json` — live tech (миграция позже)
- `content/core/tech_recipes.json` — *(создать)*
- `.cursor/skills/technologies-content/SKILL.md` — skill агентов
