# КАТАЛОГ ТЕХНОЛОГИЙ — Полный список (400 технологий)

> Документ для AI-агентов и контент-менеджеров.
> Версия: **1.0** · Дата: **2026-08-04**
> Статус: **концепт-каталог (целевой объём ≈400). Не заменяет текущий `technologies.json` до миграции.**
> Источники идей: Stellaris / Endless Space 2 (без привязки к империям), адаптировано под A–F.
> Связан с: `UI_SYSTEMS_MASTER_SPEC.md`, `TECH_TREE_SPEC.md`, `SCIENCE_SECTION_SPEC.md`, `economy_schema.json`

---

## 0. Оглавление

1. [Введение и правила адаптации](#1-введение-и-правила-адаптации)
2. [Категория A: Сырьё (70 технологий)](#2-категория-a-сырьё)
3. [Категория B: Материалы (70 технологий)](#3-категория-b-материалы)
4. [Категория C: Промышленность (70 технологий)](#4-категория-c-промышленность)
5. [Категория D: Энергия (70 технологий)](#5-категория-d-энергия)
6. [Категория E: Биомасса (60 технологий)](#6-категория-e-биомасса)
7. [Категория F: Знание (60 технологий)](#7-категория-f-знание)
8. [Комбинации (алхимия)](#8-комбинации-алхимия)
9. [Инструкция для агентов](#9-инструкция-для-агентов)

---

## 1. Введение и правила адаптации

### 1.1 Источники

- **Stellaris** (~350 технологий с DLC): Physics, Society, Engineering
- **Endless Space 2** (~200 технологий): Military, Economy, Science

### 1.2 Правила адаптации

1. **Убрать привязку** к конкретным империям Stellaris/ES2.
2. **Переименовать эффекты** под наш словарь (`EffectRenderers.ts`).
3. **Распределить по категориям A-F** в соответствии с экономической моделью.
4. **Разбить по эпохам 1-5** (Era 5 = прорывные, `isBreakthrough: true`).
5. **Добавить апгрейды** (efficiency/austerity/feature) для Era 1-4.
6. **Прорывные технологии** (Era 5) — без апгрейдов.

### 1.3 Распределение

| Категория | Количество | По эпохам |
|---|---|---|
| A (Сырьё) | 70 | 14 × 5 |
| B (Материалы) | 70 | 14 × 5 |
| C (Промышленность) | 70 | 14 × 5 |
| D (Энергия) | 70 | 14 × 5 |
| E (Биомасса) | 60 | 12 × 5 |
| F (Знание) | 60 | 12 × 5 |
| **Итого** | **400** | **80 × 5** |

---

## 2. Категория A: Сырьё

**Фокус:** добыча, разведка, экстракторы, геология.

### Era 1 (14 технологий)

| # | id | Название | Эффект |
|---|---|---|---|
| 1 | `tech.a_geology` | Геология | `unlock_tech_tier` A→2 |
| 2 | `tech.a_surface_mining` | Поверхностная добыча | `production_flat` extracta |
| 3 | `tech.a_mineral_surveying` | Минеральная разведка | `unlock_property` |
| 4 | `tech.a_ore_extraction` | Извлечение руды | `production_mult` extracta |
| 5 | `tech.a_resource_mapping` | Картирование ресурсов | `capacity_add` A |
| 6 | `tech.a_deep_drilling` | Глубокое бурение | `production_mult` extracta |
| 7 | `tech.a_automated_miners` | Автоматизированные шахтёры | `production_mult` extracta |
| 8 | `tech.a_ore_refinement` | Очистка руды | `production_mult` extracta |
| 9 | `tech.a_geological_scanning` | Геологическое сканирование | `unlock_property` |
| 10 | `tech.a_mining_networks` | Горные сети | `capacity_add` A |
| 11 | `tech.a_asteroid_prospecting` | Разведка астероидов | `production_flat` extracta |
| 12 | `tech.a_subsurface_extraction` | Подповерхностная добыча | `production_mult` extracta |
| 13 | `tech.a_mineral_catalysts` | Минеральные катализаторы | `production_mult` extracta |
| 14 | `tech.a_resource_sensors` | Сенсоры ресурсов | `unlock_property` |

### Era 2 (14 технологий)

| # | id | Название | Эффект |
|---|---|---|---|
| 15 | `tech.a_deep_prospecting` | Глубинный анализ планет | `unlock_tech_tier` A→4 |
| 16 | `tech.a_asteroid_mining` | Астероидная добыча | `unlock_tech_tier` A→6 |
| 17 | `tech.a_orbital_extraction` | Орбитальная добыча | `production_mult` extracta |
| 18 | `tech.a_mantle_tapping` | Добыча из мантии | `production_mult` extracta |
| 19 | `tech.a_mineral_synthesis` | Синтез минералов | `production_flat` extracta |
| 20 | `tech.a_automated_refineries` | Автоматизированные очистители | `production_mult` extracta |
| 21 | `tech.a_geothermal_tapping` | Геотермальная добыча | `production_mult` extracta |
| 22 | `tech.a_crystal_mining` | Кристаллическая добыча | `production_mult` extracta |
| 23 | `tech.a_rare_earth_extraction` | Добыча редкоземельных | `production_mult` extracta |
| 24 | `tech.a_ocean_floor_mining` | Подводная добыча | `production_mult` extracta |
| 25 | `tech.a_gas_giant_harvesting` | Сбор газовых гигантов | `production_mult` extracta |
| 26 | `tech.a_mineral_compression` | Сжатие минералов | `capacity_add` A |
| 27 | `tech.a_ore_enrichment` | Обогащение руды | `production_mult` extracta |
| 28 | `tech.a_magnetic_separation` | Магнитное разделение | `production_mult` extracta |

### Era 3 (14 технологий)

| # | id | Название | Эффект |
|---|---|---|---|
| 29 | `tech.a_anomaly_tapping` | Аномальная добыча | `unlock_tech_tier` A→9 |
| 30 | `tech.a_debris_field_salvage` | Спасение полей обломков | `production_mult` extracta |
| 31 | `tech.a_planetary_core_tapping` | Добыча из ядра планеты | `production_mult` extracta |
| 32 | `tech.a_quantum_extraction` | Квантовая экстракция | `production_mult` extracta |
| 33 | `tech.a_nanite_mining` | Нанитная добыча | `production_mult` extracta |
| 34 | `tech.a_gravity_mining` | Гравитационная добыча | `production_mult` extracta |
| 35 | `tech.a_plasma_drilling` | Плазменное бурение | `production_mult` extracta |
| 36 | `tech.a_crystal_resonance` | Кристаллический резонанс | `production_mult` extracta |
| 37 | `tech.a_asteroid_capturing` | Захват астероидов | `capacity_add` A |
| 38 | `tech.a_deep_core_drilling` | Глубокое бурение ядра | `production_mult` extracta |
| 39 | `tech.a_exotic_mineral_synthesis` | Синтез экзотических минералов | `production_flat` extracta |
| 40 | `tech.a_tailings_reprocessing` | Переработка хвостов | `production_mult` extracta |
| 41 | `tech.a_orbital_refineries` | Орбитальные очистители | `production_mult` extracta |
| 42 | `tech.a_mass_driver_lift` | Масс-драйверный подъём | `capacity_add` A |

### Era 4 (14 технологий)

| # | id | Название | Эффект |
|---|---|---|---|
| 43 | `tech.a_mantle_plume_rigs` | Риги мантийных плюмов | `production_mult` extracta |
| 44 | `tech.a_isotope_prospecting` | Изотопная разведка | `unlock_property` rare_deposit_scan |
| 45 | `tech.a_strip_mine_logistics` | Логистика карьеров | `upkeep_mult` extracta |
| 46 | `tech.a_comet_ice_harvest` | Сбор кометного льда | `production_flat` extracta |
| 47 | `tech.a_slag_reclamation` | Рекультивация шлаков | `production_mult` extracta |
| 48 | `tech.a_high_g_drills` | Буры высокой гравитации | `production_mult` extracta |
| 49 | `tech.a_volatile_gas_skimming` | Скимминг летучих газов | `production_mult` extracta |
| 50 | `tech.a_microquake_mapping` | Картирование микросейсмики | `unlock_property` deposit_forecast |
| 51 | `tech.a_ore_train_networks` | Рудные конвейерные сети | `capacity_add` A |
| 52 | `tech.a_cryovolcanic_taps` | Краны криовулканов | `production_mult` extracta |
| 53 | `tech.a_regolith_sintering` | Спекание реголита | `production_flat` extracta |
| 54 | `tech.a_fault_line_extractors` | Экстракторы разломов | `production_mult` extracta |
| 55 | `tech.a_bulk_ore_compaction` | Уплотнение сырой руды | `capacity_add` A |
| 56 | `tech.a_claim_beacon_array` | Массив маяков претензий | `unlock_property` remote_claim |

### Era 5 (14 технологий, прорывные)

| # | id | Название | Эффект |
|---|---|---|---|
| 57 | `tech.a_matter_printers` | Принтеры материи | `production_flat` extracta |
| 58 | `tech.a_stellar_scrap_yards` | Звёздные свалки | `production_mult` extracta |
| 59 | `tech.a_planet_cracking` | Раскалывание планет | `production_mult` extracta |
| 60 | `tech.a_deposit_genesis` | Генезис месторождений | `production_flat` extracta |
| 61 | `tech.a_zero_waste_extraction` | Безотходная добыча | `upkeep_mult` extracta |
| 62 | `tech.a_dyson_tailings` | Хвосты Дайсона | `production_mult` extracta |
| 63 | `tech.a_ore_oracle` | Рудный оракул | `unlock_property` perfect_survey |
| 64 | `tech.a_starlift_mining` | Звёздный лифт-добыча | `production_mult` extracta |
| 65 | `tech.a_exotic_isotope_wells` | Скважины экзо-изотопов | `production_mult` extracta |
| 66 | `tech.a_closed_loop_refining` | Замкнутая очистка на месте | `production_mult` extracta |
| 67 | `tech.a_world_vault_storage` | Мировые рудные хранилища | `capacity_add` A |
| 68 | `tech.a_auto_prospect_swarms` | Рои авто-разведки | `unlock_property` swarm_survey |
| 69 | `tech.a_priority_seam_control` | Контроль приоритетных жил | `production_mult` extracta |
| 70 | `tech.a_extraction_doctrine` | Доктрина экстракции | `stat_mult` extract_ops |

---

## 3. Категория B: Материалы

**Фокус:** переработка, сплавы, производство материалов.

### Era 1 (14 технологий)

| # | id | Название | Эффект |
|---|---|---|---|
| 1 | `tech.b_materials_science` | Наука о материалах | `unlock_tech_tier` B→2 |
| 2 | `tech.b_basic_alloys` | Базовые сплавы | `production_mult` materia |
| 3 | `tech.b_metallurgy` | Металлургия | `production_mult` materia |
| 4 | `tech.b_polymer_synthesis` | Синтез полимеров | `production_mult` materia |
| 5 | `tech.b_composite_materials` | Композитные материалы | `production_mult` materia |
| 6 | `tech.b_crystal_growing` | Выращивание кристаллов | `production_mult` materia |
| 7 | `tech.b_ceramic_engineering` | Керамическая инженерия | `production_mult` materia |
| 8 | `tech.b_fiber_optics` | Волоконная оптика | `production_mult` materia |
| 9 | `tech.b_nanomaterials` | Наноматериалы | `production_mult` materia |
| 10 | `tech.b_surface_treatment` | Обработка поверхности | `production_mult` materia |
| 11 | `tech.b_alloy_refinement` | Очистка сплавов | `production_mult` materia |
| 12 | `tech.b_material_recycling` | Переработка материалов | `production_mult` materia |
| 13 | `tech.b_chemical_processing` | Химическая обработка | `production_mult` materia |
| 14 | `tech.b_material_testing` | Тестирование материалов | `unlock_property` |

### Era 2 (14 технологий)

| # | id | Название | Эффект |
|---|---|---|---|
| 15 | `tech.b_pyrometallurgy` | Пирометаллургия | `unlock_tech_tier` B→4 |
| 16 | `tech.b_crystal_integration` | Интеграция кристаллов | `unlock_tech_tier` B→6, `unlock_property` shield |
| 17 | `tech.b_advanced_composites` | Продвинутые композиты | `production_mult` materia |
| 18 | `tech.b_superconductors` | Сверхпроводники | `production_mult` materia |
| 19 | `tech.b_smart_materials` | Умные материалы | `production_mult` materia |
| 20 | `tech.b_self_healing_alloys` | Самовосстанавливающиеся сплавы | `production_mult` materia |
| 21 | `tech.b_carbon_nanotubes` | Углеродные нанотрубки | `production_mult` materia |
| 22 | `tech.b_graphene_synthesis` | Синтез графена | `production_mult` materia |
| 23 | `tech.b_metamaterial_design` | Дизайн метаматериалов | `production_mult` materia |
| 24 | `tech.b_phase_change_materials` | Материалы с фазовым переходом | `production_mult` materia |
| 25 | `tech.b_bio_composites` | Биокомпозиты | `production_mult` materia |
| 26 | `tech.b_ceramic_matrix_composites` | Керамические матричные композиты | `production_mult` materia |
| 27 | `tech.b_metallic_glass` | Металлическое стекло | `production_mult` materia |
| 28 | `tech.b_quantum_dots` | Квантовые точки | `production_mult` materia |

### Era 3 (14 технологий)

| # | id | Название | Эффект |
|---|---|---|---|
| 29 | `tech.b_metamaterials` | Метаматериалы | `unlock_tech_tier` B→9 |
| 30 | `tech.b_exotic_alloys` | Экзотические сплавы | `production_mult` materia |
| 31 | `tech.b_plasma_forging` | Плазменная ковка | `production_mult` materia |
| 32 | `tech.b_molecular_assembly` | Молекулярная сборка | `production_mult` materia |
| 33 | `tech.b_atomic_layer_deposition` | Атомно-слоевое осаждение | `production_mult` materia |
| 34 | `tech.b_quantum_materials` | Квантовые материалы | `production_mult` materia |
| 35 | `tech.b_topological_insulators` | Топологические изоляторы | `production_mult` materia |
| 36 | `tech.b_photonic_crystals` | Фотонные кристаллы | `production_mult` materia |
| 37 | `tech.b_superfluid_synthesis` | Синтез сверхтекучести | `production_mult` materia |
| 38 | `tech.b_neutronium_alloys` | Нейтрониевые сплавы | `production_mult` materia |
| 39 | `tech.b_dark_matter_composites` | Композиты тёмной материи | `production_mult` materia |
| 40 | `tech.b_exotic_crystal_synthesis` | Синтез экзотических кристаллов | `production_mult` materia |
| 41 | `tech.b_graviton_shielding` | Гравитонное экранирование | `unlock_property` shield |
| 42 | `tech.b_stress_test_alloys` | Сплавы стресс-тестов | `unlock_property` material_cert |

### Era 4 (14 технологий)

| # | id | Название | Эффект |
|---|---|---|---|
| 43 | `tech.b_ablative_hull_plates` | Абляционные обшивки | `stat_mult` armor |
| 44 | `tech.b_cryogenic_lattice` | Криогенные решётки | `production_mult` materia |
| 45 | `tech.b_radiation_hard_ceramics` | Радиационно-стойкая керамика | `upkeep_mult` materia |
| 46 | `tech.b_magnetic_shape_memory` | Магнитопамятные сплавы | `unlock_property` adaptive_hull |
| 47 | `tech.b_transparent_armor` | Прозрачная броня | `stat_mult` shield |
| 48 | `tech.b_heat_pipe_composites` | Теплотрубные композиты | `production_mult` materia |
| 49 | `tech.b_vacuum_deposition_lines` | Линии вакуумного осаждения | `production_mult` materia |
| 50 | `tech.b_isotope_enriched_steel` | Изотопно-обогащённая сталь | `production_flat` materia |
| 51 | `tech.b_flex_cable_harnesses` | Гибкие жгуты | `capacity_add` B |
| 52 | `tech.b_self_sealing_foams` | Самогидравлические пены | `unlock_property` hull_seal |
| 53 | `tech.b_optical_metaglass` | Оптическое метастекло | `production_mult` materia |
| 54 | `tech.b_pressure_cast_frames` | Рамы литья под давлением | `cost_mult` ship_hull |
| 55 | `tech.b_scrap_to_billet` | Шлак → заготовка | `production_mult` materia |
| 56 | `tech.b_layered_reactive_armor` | Слоистая реактивная броня | `stat_mult` armor |

### Era 5 (14 технологий, прорывные)

| # | id | Название | Эффект |
|---|---|---|---|
| 57 | `tech.b_programmable_matter` | Программируемая материя | `unlock_property` reconfigurable_parts |
| 58 | `tech.b_monoatomic_filaments` | Моноатомные нити | `stat_mult` armor |
| 59 | `tech.b_living_hull_skins` | Живые обшивки | `upkeep_mult` materia |
| 60 | `tech.b_phase_locked_crystals` | Фазово-закреплённые кристаллы | `unlock_property` phase_shield |
| 61 | `tech.b_zero_defect_foundries` | Литейки нулевого брака | `production_mult` materia |
| 62 | `tech.b_cold_weld_assemblies` | Холодносварные узлы | `cost_mult` ship_hull |
| 63 | `tech.b_neutronium_laminates` | Нейтрониевые ламинаты | `stat_mult` armor |
| 64 | `tech.b_field_tuned_alloys` | Полево-настроенные сплавы | `stat_mult` shield |
| 65 | `tech.b_molecular_recycling_vaults` | Молекулярные хранилища вторсырья | `capacity_add` B |
| 66 | `tech.b_armor_genesis` | Генезис брони | `production_flat` materia |
| 67 | `tech.b_hull_memory_protocols` | Протоколы памяти корпуса | `unlock_property` hull_memory |
| 68 | `tech.b_ultra_light_trusses` | Сверхлёгкие фермы | `move_cost_mult` fleet |
| 69 | `tech.b_catalytic_refining` | Каталитическая доводка | `production_mult` materia |
| 70 | `tech.b_materials_doctrine` | Доктрина материалов | `stat_mult` materia_ops |

---

## 4. Категория C: Промышленность

**Фокус:** строительство, производство, фабрики, корабли.

### Era 1 (14 технологий)

| # | id | Название | Эффект |
|---|---|---|---|
| 1 | `tech.c_industrial_org` | Промышленная организация | `unlock_tech_tier` C→3 |
| 2 | `tech.c_modular_construction` | Модульная стройка | `unlock_tech_tier` C→5 |
| 3 | `tech.c_assembly_lines` | Сборочные линии | `production_mult` industria |
| 4 | `tech.c_automation` | Автоматизация | `production_mult` industria |
| 5 | `tech.c_quality_control` | Контроль качества | `production_mult` industria |
| 6 | `tech.c_supply_chain_mgmt` | Управление цепочками поставок | `production_mult` industria |
| 7 | `tech.c_mass_production` | Массовое производство | `production_mult` industria |
| 8 | `tech.c_robotic_assembly` | Роботизированная сборка | `production_mult` industria |
| 9 | `tech.c_just_in_time` | Точно в срок | `production_mult` industria |
| 10 | `tech.c_lean_manufacturing` | Бережливое производство | `production_mult` industria |
| 11 | `tech.c_industrial_sensors` | Промышленные сенсоры | `production_mult` industria |
| 12 | `tech.c_factory_networks` | Фабричные сети | `capacity_add` C |
| 13 | `tech.c_construction_robotics` | Строительная робототехника | `production_mult` industria |
| 14 | `tech.c_material_handling` | Обработка материалов | `production_mult` industria |

### Era 2 (14 технологий)

| # | id | Название | Эффект |
|---|---|---|---|
| 15 | `tech.c_advanced_automation` | Продвинутая автоматизация | `unlock_tech_tier` C→7 |
| 16 | `tech.c_orbital_manufacturing` | Орбитальное производство | `production_mult` industria |
| 17 | `tech.c_zero_g_fabrication` | Производство в невесомости | `production_mult` industria |
| 18 | `tech.c_megastructure_foundations` | Основы мегаструктур | `production_mult` industria |
| 19 | `tech.c_nano_assembly` | Наносборка | `production_mult` industria |
| 20 | `tech.c_self_replicating_factories` | Самовоспроизводящиеся фабрики | `production_mult` industria |
| 21 | `tech.c_planetary_forges` | Планетарные кузницы | `production_mult` industria |
| 22 | `tech.c_industrial_ai` | Промышленный ИИ | `production_mult` industria |
| 23 | `tech.c_quantum_manufacturing` | Квантовое производство | `production_mult` industria |
| 24 | `tech.c_molecular_assembly_c` | Молекулярная сборка | `production_mult` industria |
| 25 | `tech.c_asteroid_forges` | Астероидные кузницы | `production_mult` industria |
| 26 | `tech.c_deep_space_shipyards` | Верфи глубокого космоса | `production_mult` industria |
| 27 | `tech.c_automated_construction` | Автоматизированное строительство | `production_mult` industria |
| 28 | `tech.c_industrial_symbiosis` | Промышленный симбиоз | `production_mult` industria |

### Era 3 (14 технологий)

| # | id | Название | Эффект |
|---|---|---|---|
| 29 | `tech.c_megastructures` | Мегаструктуры | `unlock_tech_tier` C→9 |
| 30 | `tech.c_dyson_spheres` | Сферы Дайсона | `production_mult` industria |
| 31 | `tech.c_ringworld_construction` | Строительство мир-кольца | `production_mult` industria |
| 32 | `tech.c_orbital_habitats` | Орбитальные среды обитания | `production_mult` industria |
| 33 | `tech.c_stellar_engines` | Звёздные двигатели | `production_mult` industria |
| 34 | `tech.c_planetary_engines` | Планетарные двигатели | `production_mult` industria |
| 35 | `tech.c_void_shipyards` | Верфи пустоты | `production_mult` industria |
| 36 | `tech.c_quantum_forges` | Квантовые кузницы | `production_mult` industria |
| 37 | `tech.c_self_assembling_structures` | Самособирающиеся структуры | `production_mult` industria |
| 38 | `tech.c_graviton_construction` | Гравитонное строительство | `production_mult` industria |
| 39 | `tech.c_exotic_matter_fabrication` | Изготовление экзотической материи | `production_mult` industria |
| 40 | `tech.c_prefab_bay_standards` | Стандарты префаб-отсеков | `cost_mult` building |
| 41 | `tech.c_drydock_expansion` | Расширение сухих доков | `capacity_add` C |
| 42 | `tech.c_cross_system_tooling` | Межсистемный инструментарий | `production_mult` industria |

### Era 4 (14 технологий)

| # | id | Название | Эффект |
|---|---|---|---|
| 43 | `tech.c_mobile_shipyards` | Мобильные верфи | `unlock_property` mobile_yard |
| 44 | `tech.c_arcology_frames` | Каркасы аркологий | `building_level_mult` habitat |
| 45 | `tech.c_fleet_batch_builds` | Серийная постройка флотов | `production_mult` industria |
| 46 | `tech.c_gate_scaffold_kits` | Комплекты каркасов врат | `cost_mult` megastructure |
| 47 | `tech.c_printer_foundries` | Литейки-принтеры | `production_flat` industria |
| 48 | `tech.c_night_shift_ai` | Ночные смены ИИ | `production_mult` industria |
| 49 | `tech.c_hull_section_rails` | Рельсы секций корпуса | `upkeep_mult` industria |
| 50 | `tech.c_orbital_crane_grids` | Орбитальные крановые сети | `capacity_add` C |
| 51 | `tech.c_rapid_repair_bays` | Отсеки быстрого ремонта | `stat_mult` repair_rate |
| 52 | `tech.c_module_hotswap` | Горячая замена модулей | `unlock_property` hotswap_modules |
| 53 | `tech.c_civilian_yard_conversion` | Конверсия гражданских верфей | `production_mult` industria |
| 54 | `tech.c_siege_works_kits` | Комплекты осадных сооружений | `stat_mult` fort_build |
| 55 | `tech.c_spare_parts_caches` | Склады ЗИП | `capacity_add` C |
| 56 | `tech.c_build_queue_optimizers` | Оптимизаторы очередей | `cost_mult` building |

### Era 5 (14 технологий, прорывные)

| # | id | Название | Эффект |
|---|---|---|---|
| 57 | `tech.c_world_forge_rings` | Кольца мировых кузниц | `production_mult` industria |
| 58 | `tech.c_self_deploying_habitats` | Саморазворачиваемые хабитаты | `unlock_property` auto_habitat |
| 59 | `tech.c_capital_ship_lines` | Конвейеры капитальных кораблей | `production_flat` industria |
| 60 | `tech.c_instant_scaffold` | Мгновенные леса | `cost_mult` megastructure |
| 61 | `tech.c_factory_seed_ships` | Корабли-семена фабрик | `unlock_property` factory_seed |
| 62 | `tech.c_war_economy_tooling` | Инструментарий военной экономики | `production_mult` industria |
| 63 | `tech.c_drydock_swarm` | Рой сухих доков | `capacity_add` C |
| 64 | `tech.c_zero_idle_lines` | Линии нулевого простоя | `upkeep_mult` industria |
| 65 | `tech.c_fortress_printers` | Принтеры крепостей | `stat_mult` fort_build |
| 66 | `tech.c_fleet_refit_doctrine` | Доктрина переоснащения | `stat_mult` refit_speed |
| 67 | `tech.c_megayard_authority` | Власть мегаверфей | `building_level_mult` shipyard |
| 68 | `tech.c_supply_forge_links` | Связки кузница–снабжение | `logistics_disconnected_penalty` |
| 69 | `tech.c_parallel_keel_lays` | Параллельная закладка килей | `production_mult` industria |
| 70 | `tech.c_industry_doctrine` | Доктрина промышленности | `stat_mult` industria_ops |

---

## 5. Категория D: Энергия

**Фокус:** реакторы, топливо, двигатели, энергия.

### Era 1 (14 технологий)

| # | id | Название | Эффект |
|---|---|---|---|
| 1 | `tech.d_fusion_power` | Термоядерная энергия | `unlock_tech_tier` D→2 |
| 2 | `tech.d_fission_reactors` | Реакторы деления | `production_mult` energia |
| 3 | `tech.d_solar_arrays` | Солнечные массивы | `production_mult` energia |
| 4 | `tech.d_geothermal_taps` | Геотермальные краны | `production_mult` energia |
| 5 | `tech.d_wind_turbines` | Ветряные турбины | `production_mult` energia |
| 6 | `tech.d_hydrogen_fuel` | Водородное топливо | `production_mult` energia |
| 7 | `tech.d_battery_tech` | Батарейные технологии | `production_mult` energia |
| 8 | `tech.d_power_grid_mgmt` | Управление энергосетями | `production_mult` energia |
| 9 | `tech.d_energy_storage` | Хранение энергии | `capacity_add` D |
| 10 | `tech.d_superconducting_lines` | Сверхпроводящие линии | `production_mult` energia |
| 11 | `tech.d_plasma_containment` | Удержание плазмы | `production_mult` energia |
| 12 | `tech.d_magnetic_confinement` | Магнитное удержание | `production_mult` energia |
| 13 | `tech.d_thermal_efficiency` | Термальная эффективность | `production_mult` energia |
| 14 | `tech.d_energy_recycling` | Переработка энергии | `production_mult` energia |

### Era 2 (14 технологий)

| # | id | Название | Эффект |
|---|---|---|---|
| 15 | `tech.d_fusion_reactors` | Термоядерные реакторы | `unlock_tech_tier` D→4 |
| 16 | `tech.d_antimatter_containment_d` | Удержание антиматерии | `unlock_tech_tier` D→6 |
| 17 | `tech.d_zero_point_energy` | Энергия нулевой точки | `production_mult` energia |
| 18 | `tech.d_dark_energy_taps` | Краны тёмной энергии | `production_mult` energia |
| 19 | `tech.d_stellar_energy_siphons` | Звёздные энергетические сифоны | `production_mult` energia |
| 20 | `tech.d_quantum_vacuum_energy` | Энергия квантового вакуума | `production_mult` energia |
| 21 | `tech.d_gravitational_energy` | Гравитационная энергия | `production_mult` energia |
| 22 | `tech.d_neutrino_harvesting` | Сбор нейтрино | `production_mult` energia |
| 23 | `tech.d_exotic_particle_reactors` | Реакторы экзотических частиц | `production_mult` energia |
| 24 | `tech.d_void_energy_taps` | Краны энергии пустоты | `production_mult` energia |
| 25 | `tech.d_plasma_fusion` | Плазменный синтез | `production_mult` energia |
| 26 | `tech.d_magnetic_bottles` | Магнитные бутылки | `production_mult` energia |
| 27 | `tech.d_energy_crystals` | Энергетические кристаллы | `production_mult` energia |
| 28 | `tech.d_quantum_batteries` | Квантовые батареи | `capacity_add` D |

### Era 3 (14 технологий)

| # | id | Название | Эффект |
|---|---|---|---|
| 29 | `tech.d_antimatter_reactors` | Антиматериевые реакторы | `unlock_tech_tier` D→9 |
| 30 | `tech.d_singularity_engines` | Двигатели сингулярности | `production_mult` energia |
| 31 | `tech.d_dark_matter_reactors` | Реакторы тёмной материи | `production_mult` energia |
| 32 | `tech.d_void_energy_generators` | Генераторы энергии пустоты | `production_mult` energia |
| 33 | `tech.d_quantum_foam_reactors` | Реакторы квантовой пены | `production_mult` energia |
| 34 | `tech.d_neutron_star_taps` | Краны нейтронных звёзд | `production_mult` energia |
| 35 | `tech.d_stellar_core_reactors` | Реакторы звёздного ядра | `production_mult` energia |
| 36 | `tech.d_exotic_energy_harvesting` | Сбор экзотической энергии | `production_mult` energia |
| 37 | `tech.d_pulse_capacitors` | Импульсные конденсаторы | `capacity_add` D |
| 38 | `tech.d_graviton_reactors` | Гравитонные реакторы | `production_mult` energia |
| 39 | `tech.d_beam_power_links` | Лучевые линии питания | `production_mult` energia |
| 40 | `tech.d_waste_heat_radiators` | Радиаторы отработанного тепла | `upkeep_mult` energia |
| 41 | `tech.d_compact_tokamaks` | Компактные токамаки | `production_mult` energia |
| 42 | `tech.d_grid_islanding` | Островковые энергосети | `unlock_property` grid_island |

### Era 4 (14 технологий)

| # | id | Название | Эффект |
|---|---|---|---|
| 43 | `tech.d_antimatter_injectors` | Инжекторы антиматерии | `production_mult` energia |
| 44 | `tech.d_magneto_inertial_fusion` | Магнито-инерционный синтез | `production_mult` energia |
| 45 | `tech.d_fleet_tanker_doctrine` | Доктрина флотских танкеров | `move_cost_mult` fleet |
| 46 | `tech.d_capacitor_banks` | Банки конденсаторов | `capacity_add` D |
| 47 | `tech.d_spike_drive_cores` | Ядра спайк-приводов | `stat_mult` engine |
| 48 | `tech.d_reactor_safeguards` | Защита реакторов | `upkeep_mult` energia |
| 49 | `tech.d_orbital_beam_receivers` | Орбитальные приёмники луча | `production_flat` energia |
| 50 | `tech.d_plasma_thruster_stacks` | Стеки плазменных двигателей | `stat_mult` engine |
| 51 | `tech.d_blackout_resilience` | Устойчивость к блэкауту | `unlock_property` blackout_resilience |
| 52 | `tech.d_fuel_cell_cascades` | Каскады топливных элементов | `production_mult` energia |
| 53 | `tech.d_heat_sink_armor` | Броня-теплоотвод | `stat_mult` heat_capacity |
| 54 | `tech.d_distributed_microgrids` | Распределённые микросети | `capacity_add` D |
| 55 | `tech.d_overcharge_protocols` | Протоколы перегруза | `stat_mult` weapon_power |
| 56 | `tech.d_reactor_telematics` | Телеметрия реакторов | `unlock_property` reactor_telemetry |

### Era 5 (14 технологий, прорывные)

| # | id | Название | Эффект |
|---|---|---|---|
| 57 | `tech.d_zero_point_arrays` | Массивы нулевой точки | `production_mult` energia |
| 58 | `tech.d_star_siphon_stations` | Станции звёздного сифона | `production_flat` energia |
| 59 | `tech.d_fleet_power_bus` | Единая шина флота | `stat_mult` engine |
| 60 | `tech.d_failsafe_cores` | Отказоустойчивые ядра | `upkeep_mult` energia |
| 61 | `tech.d_warp_capacitor_rings` | Кольца варп-конденсаторов | `move_cost_mult` fleet |
| 62 | `tech.d_planet_grid_fusion` | Планетарный энергофьюжн | `capacity_add` D |
| 63 | `tech.d_beam_artillery_power` | Питание лучевой артиллерии | `stat_mult` weapon_power |
| 64 | `tech.d_cold_start_reactors` | Реакторы холодного старта | `unlock_property` cold_start |
| 65 | `tech.d_waste_energy_harvest` | Сбор отработанной энергии | `production_mult` energia |
| 66 | `tech.d_singularity_bottles` | Бутылки сингулярности | `production_mult` energia |
| 67 | `tech.d_emergency_dump_fields` | Поля аварийного сброса | `unlock_property` energy_dump |
| 68 | `tech.d_hypergrid_routing` | Маршрутизация гиперсети | `logistics_disconnected_penalty` |
| 69 | `tech.d_reactor_swarm_control` | Управление роем реакторов | `production_mult` energia |
| 70 | `tech.d_energy_doctrine` | Доктрина энергии | `stat_mult` energia_ops |

---

## 6. Категория E: Биомасса

**Фокус:** сельское хозяйство, население, биология.

### Era 1 (12 технологий)

| # | id | Название | Эффект |
|---|---|---|---|
| 1 | `tech.e_hydroponics` | Гидропоника | `unlock_tech_tier` E→2 |
| 2 | `tech.e_agriculture` | Сельское хозяйство | `production_mult` bios |
| 3 | `tech.e_genetic_engineering` | Генетическая инженерия | `production_mult` bios |
| 4 | `tech.e_cloning` | Клонирование | `production_mult` bios |
| 5 | `tech.e_bioengineering` | Биоинженерия | `production_mult` bios |
| 6 | `tech.e_food_synthesis` | Синтез пищи | `production_mult` bios |
| 7 | `tech.e_ecosystem_mgmt` | Управление экосистемами | `production_mult` bios |
| 8 | `tech.e_population_growth` | Рост населения | `production_mult` bios |
| 9 | `tech.e_medical_advances` | Медицинские достижения | `production_mult` bios |
| 10 | `tech.e_genetic_diversity` | Генетическое разнообразие | `production_mult` bios |
| 11 | `tech.e_bio_recycling` | Био-переработка | `production_mult` bios |
| 12 | `tech.e_agricultural_automation` | Автоматизация сельского хозяйства | `production_mult` bios |

### Era 2 (12 технологий)

| # | id | Название | Эффект |
|---|---|---|---|
| 13 | `tech.e_gene_editing` | Редактирование генов | `unlock_tech_tier` E→4 |
| 14 | `tech.e_synthetic_biology` | Синтетическая биология | `unlock_tech_tier` E→6 |
| 15 | `tech.e_bioaugmentation` | Биоаугментация | `production_mult` bios |
| 16 | `tech.e_neural_interfaces` | Нейроинтерфейсы | `production_mult` bios |
| 17 | `tech.e_cybernetic_enhancement` | Кибернетическое улучшение | `production_mult` bios |
| 18 | `tech.e_life_extension` | Продление жизни | `production_mult` bios |
| 19 | `tech.e_terraforming` | Терраформирование | `production_mult` bios |
| 20 | `tech.e_xenobiology` | Ксенобиология | `production_mult` bios |
| 21 | `tech.e_psionic_potential` | Псионический потенциал | `production_mult` bios |
| 22 | `tech.e_bio_computing` | Био-вычисления | `production_mult` bios |
| 23 | `tech.e_genetic_optimization` | Генетическая оптимизация | `production_mult` bios |
| 24 | `tech.e_ecosystem_engineering` | Инженерия экосистем | `production_mult` bios |

### Era 3 (12 технологий)

| # | id | Название | Эффект |
|---|---|---|---|
| 25 | `tech.e_genetic_ascension` | Генетическая асцензия | `unlock_tech_tier` E→9 |
| 26 | `tech.e_psionic_awakening` | Псионическое пробуждение | `production_mult` bios |
| 27 | `tech.e_synthetic_life` | Синтетическая жизнь | `production_mult` bios |
| 28 | `tech.e_bio_digital_fusion` | Био-цифровое слияние | `production_mult` bios |
| 29 | `tech.e_consciousness_uploading` | Загрузка сознания | `production_mult` bios |
| 30 | `tech.e_genetic_perfection` | Генетическое совершенство | `production_mult` bios |
| 31 | `tech.e_xenobiological_integration` | Ксенобиологическая интеграция | `production_mult` bios |
| 32 | `tech.e_psionic_mastery` | Псионическое мастерство | `production_mult` bios |
| 33 | `tech.e_cryosleep_wards` | Криосонные палаты | `pop_growth_mult` |
| 34 | `tech.e_gene_bank_vaults` | Хранилища генофонда | `capacity_add` E |
| 35 | `tech.e_habitat_biome_kits` | Биом-комплекты хабитатов | `production_mult` bios |
| 36 | `tech.e_crowd_health_nets` | Сети массового здравоохранения | `upkeep_mult` bios |

### Era 4 (12 технологий)

| # | id | Название | Эффект |
|---|---|---|---|
| 37 | `tech.e_exowomb_arrays` | Массивы экзоматок | `pop_growth_mult` |
| 38 | `tech.e_rad_tolerant_crops` | Радиационно-стойкие культуры | `production_mult` bios |
| 39 | `tech.e_symbiote_labor` | Симбионтный труд | `production_flat` bios |
| 40 | `tech.e_pandemic_filters` | Пандемические фильтры | `unlock_property` biohazard_filter |
| 41 | `tech.e_longevity_clinics` | Клиники долголетия | `pop_growth_mult` |
| 42 | `tech.e_deep_ocean_farms` | Глубоководные фермы | `production_mult` bios |
| 43 | `tech.e_xeno_diet_adapt` | Адаптация ксено-диет | `upkeep_mult` bios |
| 44 | `tech.e_neural_rehab` | Нейрореабилитация | `stat_mult` loyalty |
| 45 | `tech.e_spore_atmosphere` | Споровое атмосфероформирование | `unlock_property` spore_terraform |
| 46 | `tech.e_clone_draft_pools` | Пулы клон-призыва | `pop_growth_mult` |
| 47 | `tech.e_biosphere_patching` | Патчинг биосферы | `production_mult` bios |
| 48 | `tech.e_creche_networks` | Сети яслей | `capacity_add` E |

### Era 5 (12 технологий, прорывные)

| # | id | Название | Эффект |
|---|---|---|---|
| 49 | `tech.e_species_design_labs` | Лаборатории дизайна видов | `unlock_property` species_design |
| 50 | `tech.e_world_tree_canopies` | Кроны мировых деревьев | `production_mult` bios |
| 51 | `tech.e_immortal_cell_lines` | Бессмертные клеточные линии | `pop_growth_mult` |
| 52 | `tech.e_hive_mind_hygiene` | Гигиена роевого разума | `stat_mult` loyalty |
| 53 | `tech.e_vacuum_flora` | Вакуумная флора | `production_flat` bios |
| 54 | `tech.e_combat_endorphins` | Боевые эндорфины | `stat_mult` ground_morale |
| 55 | `tech.e_genesis_chambers` | Камеры генезиса | `pop_growth_mult` |
| 56 | `tech.e_plague_nullifiers` | Нуллификаторы чумы | `unlock_property` plague_null |
| 57 | `tech.e_memory_inheritance` | Наследование памяти | `research_cost_mult` |
| 58 | `tech.e_closed_ecology_ships` | Корабли замкнутой экологии | `upkeep_mult` bios |
| 59 | `tech.e_population_surge_protocols` | Протоколы демографического рывка | `pop_growth_mult` |
| 60 | `tech.e_bios_doctrine` | Доктрина биомассы | `stat_mult` bios_ops |

---

## 7. Категория F: Знание

**Фокус:** наука, псионика, аномалии.

### Era 1 (12 технологий)

| # | id | Название | Эффект |
|---|---|---|---|
| 1 | `tech.f_scientific_method` | Научный метод | `unlock_tech_tier` F→2 |
| 2 | `tech.f_basic_research` | Базовые исследования | `production_mult` cognitio |
| 3 | `tech.f_data_analysis` | Анализ данных | `production_mult` cognitio |
| 4 | `tech.f_theoretical_physics` | Теоретическая физика | `production_mult` cognitio |
| 5 | `tech.f_quantum_mechanics` | Квантовая механика | `production_mult` cognitio |
| 6 | `tech.f_relativity` | Относительность | `production_mult` cognitio |
| 7 | `tech.f_particle_physics` | Физика частиц | `production_mult` cognitio |
| 8 | `tech.f_cosmology` | Космология | `production_mult` cognitio |
| 9 | `tech.f_astronomy` | Астрономия | `production_mult` cognitio |
| 10 | `tech.f_archaeology` | Археология | `production_mult` cognitio |
| 11 | `tech.f_anomaly_detection` | Обнаружение аномалий | `production_mult` cognitio |
| 12 | `tech.f_psionic_theory` | Псионическая теория | `production_mult` cognitio |

### Era 2 (12 технологий)

| # | id | Название | Эффект |
|---|---|---|---|
| 13 | `tech.f_advanced_research` | Продвинутые исследования | `unlock_tech_tier` F→4 |
| 14 | `tech.f_psionic_practices` | Псионические практики | `unlock_tech_tier` F→6 |
| 15 | `tech.f_quantum_computing` | Квантовые вычисления | `production_mult` cognitio |
| 16 | `tech.f_ai_research` | Исследования ИИ | `production_mult` cognitio |
| 17 | `tech.f_neural_networks` | Нейронные сети | `production_mult` cognitio |
| 18 | `tech.f_experimental_physics` | Экспериментальная физика | `production_mult` cognitio |
| 19 | `tech.f_string_theory` | Теория струн | `production_mult` cognitio |
| 20 | `tech.f_multiverse_theory` | Теория мультивселенной | `production_mult` cognitio |
| 21 | `tech.f_anomaly_containment` | Удержание аномалий | `production_mult` cognitio |
| 22 | `tech.f_psionic_amplification` | Псионическое усиление | `production_mult` cognitio |
| 23 | `tech.f_cognitive_enhancement` | Когнитивное усиление | `production_mult` cognitio |
| 24 | `tech.f_information_theory` | Теория информации | `production_mult` cognitio |

### Era 3 (12 технологий)

| # | id | Название | Эффект |
|---|---|---|---|
| 25 | `tech.f_psionic_mastery_f` | Псионическое мастерство | `unlock_tech_tier` F→9 |
| 26 | `tech.f_predictive_models` | Предиктивные модели | `research_cost_mult` |
| 27 | `tech.f_quantum_consciousness` | Квантовое сознание | `production_mult` cognitio |
| 28 | `tech.f_anomaly_catalogs` | Каталоги аномалий | `unlock_property` anomaly_catalog |
| 29 | `tech.f_psionic_ascension` | Псионическая асцензия | `unlock_property` psion_store |
| 30 | `tech.f_signal_cryptanalysis` | Криптоанализ сигналов | `stat_mult` intel |
| 31 | `tech.f_archive_compression` | Сжатие архивов | `capacity_add` F |
| 32 | `tech.f_field_expeditions` | Полевые экспедиции | `production_flat` cognitio |
| 33 | `tech.f_peer_review_nets` | Сети рецензирования | `research_cost_mult` |
| 34 | `tech.f_psionic_networks` | Псионические сети | `production_mult` cognitio |
| 35 | `tech.f_lab_safety_codes` | Кодексы безопасности лабораторий | `upkeep_mult` cognitio |
| 36 | `tech.f_hypothesis_engines` | Движки гипотез | `production_mult` cognitio |

### Era 4 (12 технологий)

| # | id | Название | Эффект |
|---|---|---|---|
| 37 | `tech.f_deep_learning_arrays` | Массивы глубинного обучения | `production_mult` cognitio |
| 38 | `tech.f_chorus_amplifiers` | Усилители хора | `stat_mult` psi |
| 39 | `tech.f_observatory_meshes` | Сетки обсерваторий | `unlock_property` long_range_sensor |
| 40 | `tech.f_doctrine_simulators` | Симуляторы доктрин | `research_cost_mult` |
| 41 | `tech.f_relic_decoding` | Расшифровка реликвий | `production_flat` cognitio |
| 42 | `tech.f_thought_caching` | Кэширование мысли | `capacity_add` F |
| 43 | `tech.f_counterintel_labs` | Лаборатории контрразведки | `stat_mult` intel |
| 44 | `tech.f_anomaly_quarantine` | Карантин аномалий | `unlock_property` anomaly_quarantine |
| 45 | `tech.f_psi_shield_training` | Тренировка пси-щитов | `stat_mult` psi |
| 46 | `tech.f_open_science_pacts` | Пакты открытой науки | `research_cost_mult` |
| 47 | `tech.f_mnemonic_implants` | Мнемонические импланты | `production_mult` cognitio |
| 48 | `tech.f_experiment_schedulers` | Планировщики экспериментов | `ap_add` |

### Era 5 (12 технологий, прорывные)

| # | id | Название | Эффект |
|---|---|---|---|
| 49 | `tech.f_oracle_clusters` | Кластеры оракулов | `research_cost_mult` |
| 50 | `tech.f_galactic_archive` | Галактический архив | `capacity_add` F |
| 51 | `tech.f_psi_lattice` | Пси-решётка | `unlock_property` psi_lattice |
| 52 | `tech.f_self_improving_labs` | Самоулучшающиеся лаборатории | `production_mult` cognitio |
| 53 | `tech.f_truth_engines` | Движки истины | `stat_mult` intel |
| 54 | `tech.f_anomaly_harness` | Упряжь аномалий | `unlock_property` anomaly_harness |
| 55 | `tech.f_mind_backup_grids` | Сети бэкапа разума | `pop_growth_mult` |
| 56 | `tech.f_war_college_ai` | ИИ военных академий | `stat_mult` doctrine |
| 57 | `tech.f_instant_peer_sync` | Мгновенная синхронизация знаний | `research_cost_mult` |
| 58 | `tech.f_lab_swarm_control` | Управление роем лабораторий | `production_flat` cognitio |
| 59 | `tech.f_cognitio_surge` | Рывок когнитио | `production_mult` cognitio |
| 60 | `tech.f_knowledge_doctrine` | Доктрина знания | `stat_mult` cognitio_ops |

---

## 8. Комбинации (алхимия)

Полная механика: **`TECH_ALCHEMY_SPEC.md`** (лаборатория, жесты, blind, data model, ≈40 seed → цель 150).

Кратко:
- Только изученные tech; категории same или adjacent по кольцу A–F (**F↔A разрешена** как замыкание RPS).
- 3 попытки/ход, стоимость cognitio; обычный research не заменяется.
- Рецепты в `tech_recipes.json`; результат — обычный `TechnologyDef` с тегом `alchemy`.

---

## 9. Инструкция для агентов

### 9.1 Генерация JSON

Для каждой технологии из списка выше создайте объект в `technologies.json` по шаблону:

```json
{
  "id": "tech.a_geology",
  "name": "Геология",
  "category": "A",
  "era": 1,
  "cost": { "currency.cognitio": 12 },
  "effects": [
    { "effect": "unlock_tech_tier", "args": { "category": "A", "to": 2 } }
  ],
  "prerequisites": [],
  "upgrades": [
    { "id": "tech.a_geology.efficiency", "name": "...", "cost": { "currency.cognitio": 6 }, "effects": [] },
    { "id": "tech.a_geology.austerity", "name": "...", "cost": { "currency.cognitio": 6 }, "effects": [] },
    { "id": "tech.a_geology.feature", "name": "...", "cost": { "currency.cognitio": 8 }, "effects": [], "prerequisites": ["tech.a_geology.efficiency"] }
  ]
}
```

### 9.2 Валидация

```bash
node scripts/validateContent.mjs
```

### 9.3 Что НЕ делать

- Не хардкодить id в коде
- Не создавать циклические зависимости
- Не дублировать эффекты
- Не превышать лимит апгрейдов (3)

---

## 10. Известные ограничения каталога (до миграции)

1. ~~Поздние эры (4–5) шаблонные~~ — **сделано**: имена и типы эффектов уникализированы (числа баланса — отдельно).
2. **Эффекты в таблицах** — плейсхолдеры без числовых `args`/`cost`/`prerequisites`; балансировка — отдельный этап по `TECH_TREE_SPEC.md`.
3. **Текущий live-контент** — `content/core/technologies.json`. Каталог = целевой SoT, не мгновенная замена.
4. **Алхимия** — см. `TECH_ALCHEMY_SPEC.md`. Дополнение к research, бюджет 100–200 рецептов.
5. **Уникальные источники** (расы / рынок / квесты / GM) живут вне этих 400 базовых id (отдельные теги / locks).

---

## Связанные файлы

- `UI_SYSTEMS_MASTER_SPEC.md` — мастер-спецификация UI/систем
- `TECH_TREE_SPEC.md` — инструкция по технологиям для агентов
- `TECH_ALCHEMY_SPEC.md` — лаборатория и рецепты
- `SCIENCE_SECTION_SPEC.md` — UI раздела «Наука»
- `ECONOMY_SECTION_SPEC.md` — раздел «Экономика»
- `INTEL_FOG_SPEC.md` / `INTEL_FOG_CONCEPT.md` — туман информации
- `content/core/technologies.json` — текущий live-файл технологий
- `content/core/tech_schema.json` — JSON Schema для валидации
- `.cursor/skills/technologies-content/SKILL.md` — skill агентов