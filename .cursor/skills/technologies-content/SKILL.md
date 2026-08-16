---
name: technologies-content
description: >-
  Data-driven technologies.json rules for LO_GOLDEN_PAX GMap. Use when adding,
  editing, removing, or validating techs/upgrades/effects; when touching
  ResearchPanel, EffectsList, techActions, techRegistry, or EffectRenderers.
  Never hardcode tech ids in UI/server — content describes itself.
---

# Технологии — инструкция для агентов

> Версия: **1.0** · Дата: **2026-08-04**  
> Связан с: `CAMPAIGN_TABLE_SPEC.md` §5, `economy_schema.json`, Science UI,
> `GMap/docs/TECH_TREE_SPEC.md`, `GMap/docs/TECH_CATALOG_SPEC.md`,
> `GMap/docs/TECH_ALCHEMY_SPEC.md`

Полный текст спецификации: [reference.md](reference.md).  
Целевой каталог (~400): `GMap/docs/TECH_CATALOG_SPEC.md` (не путать с live `technologies.json`).  
Алхимия (рецепты, лаборатория): `GMap/docs/TECH_ALCHEMY_SPEC.md` → будущий `tech_recipes.json`.

Пути RoleScore (6 пустых кластеров, breakthrough, retag vs new): skill **`tech-path-catalog`**, не этот файл. Здесь — общий контракт записи технологии.

## Главный принцип

**Технология описывает себя. UI только читает описание.**

1. Никогда не хардкодить id технологий в `.tsx` / `.ts` / `.mjs`.
2. Все технологии живут в `GMap/content/core/technologies.json` (или content packs).
3. UI рендерит любые технологии, не зная их id.
4. Эффекты — словарь: новый эффект = запись в `EffectRenderers` + schema enum, не `if (techId === …)`.
5. Доступность: `tags` + path gate (`researchPath` / `open_path`). **Не** ставить `raceLock` на path-сигнатуры — см. skill `tech-path-catalog`. Старые raceLock в каталоге не размножать.
6. Перед коммитом: `node scripts/validateTechnologies.mjs`.

## Связанные файлы

| Файл | Роль |
|---|---|
| `content/core/technologies.json` | SoT технологий |
| `content/core/tech_combos.json` | Combo-tech stubs (алхимия) |
| `content/core/tech_recipes.json` | Рецепты алхимии |
| `content/core/tech_schema.json` | JSON Schema |
| `content/core/tech_icons.json` | Иконки по `iconTag` |
| `content/core/id-aliases.json` | Миграции удалённых id |
| `scripts/validateTechnologies.mjs` | Валидация tech |
| `scripts/validateTechRecipes.mjs` | Валидация рецептов |
| `scripts/generateAlchemyStubs.mjs` | Регенерация stubs |
| `src/state/techRegistry.ts` | Клиентский registry |
| `src/state/EffectRenderers.ts` | Рендер эффектов для UI |
| `server/techActions.mjs` | Применение эффектов |

## Добавление

1. Определить тип: general / race / trait / faction_unique / breakthrough.
2. Добавить объект по шаблону в `technologies.json` (`id` = ключ).
3. `iconTag`, `flavor` (≤200), `tags`, `cost` по эпохе.
4. Апгрейды max 3: `*.efficiency`, `*.austerity`, `*.feature`. Breakthrough — без апгрейдов.
5. `node scripts/validateTechnologies.mjs`.

## Удаление

1. `grep` prerequisites и `unlockedTechs`.
2. Alias в `id-aliases.json`.
3. Удалить объект → validate.

## Антипаттерны

```tsx
// ЗАПРЕЩЕНО
if (techId === "tech.swarm.adaptation") { … }
const icons = { "tech.geology": "⛏" };
```

Иконки — только через `iconTag` → `tech_icons.json`.  
Эффекты — только через `EffectRenderers` / modifier stack.

## Чеклист

- [ ] Schema / validate без errors
- [ ] Нет дублей id, prereqs существуют, нет циклов
- [ ] Стоимость ≈ эпохе; апгрейды ~50% базы
- [ ] Теги / locks согласованы
- [ ] Breakthrough без upgrades
