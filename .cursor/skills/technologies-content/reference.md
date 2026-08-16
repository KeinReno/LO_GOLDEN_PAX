# ТЕХНОЛОГИИ — справочник (reference)

> Полная инструкция v1.0 · 2026-08-04. См. также SKILL.md.

## Шаблон (полная)

```json
{
  "tech.example_name": {
    "id": "tech.example_name",
    "name": "Название технологии",
    "category": "A",
    "era": 1,
    "cost": { "currency.cognitio": 12 },
    "iconTag": "extraction",
    "flavor": "Короткое описание (лор)",
    "tags": ["general"],
    "prerequisites": [],
    "effects": [
      { "effect": "unlock_tech_tier", "args": { "category": "A", "to": 2 } }
    ],
    "upgrades": [
      {
        "id": "tech.example_name.efficiency",
        "name": "Эффективность",
        "cost": { "currency.cognitio": 6 },
        "effects": [
          { "effect": "production_mult", "args": { "resource": "currency.extracta", "mult": 1.1 } }
        ],
        "prerequisites": []
      }
    ]
  }
}
```

## Типы

| Тип | Поля |
|---|---|
| Общая | `tags: ["general"]` или без тегов |
| Расовая | `raceLock` + `tags: ["race_xxx"]` |
| Черта | `factionTraitLock` + `tags: ["trait.xxx"]` |
| Уникальная фракции | `tags: ["faction_xxx_unique"]` |
| Прорывная | `isBreakthrough: true`, `era: 5`, без upgrades |

## Словарь эффектов

| effect | args |
|---|---|
| `unlock_tech_tier` | `category`, `to` |
| `unlock_property` | `property` |
| `production_mult` | `resource` (или legacy `category`), `mult` |
| `upkeep_mult` | `resource`, `mult` |
| `production_flat` | `resource`, `amount` |
| `research_cost_mult` | `category?`, `mult` |
| `unit_upgrade` | `from`, `to` |
| `stat_mult` | `stat`, `mult` |
| `capacity_add` | `category`, `tier`, `amount` |
| `ap_add` | `amount` |
| `cost_mult` | `tag`/`resource`, `mult` |

Legacy effects still used in content: `pop_growth_mult`, `move_cost_mult`, `building_level_mult`, `logistics_disconnected_penalty` — keep rendering in EffectRenderers; prefer dictionary entries above for new content.

## Теги

`general` · `race_*` · `faction_*_unique` · `trait.*` · `breakthrough`

Доступность: tags ∩ faction.availableRaces / general; raceLock ≥30%; factionTraitLock; prerequisites.

## Апгрейды

Max 3: `efficiency` | `austerity` | `feature`.  
Стоимость апгрейда ≈ 50% базы. Era 5 breakthrough — без апгрейдов.

| Era | База cognitio | Апгрейд |
|---|---|---|
| 1 | 12–14 | ~6 |
| 2 | 24–28 | 10–11 |
| 3 | 42 | 17–23 |
| 4 | 144 | 58–79 |
| 5 | 144–220 | — |

## Валидация

```bash
cd GMap && node scripts/validateTechnologies.mjs
```

Errors блокируют; warnings (нет tags, неканонический upgrade id) — исправлять при правке файла.

## Миграция удаления

`content/core/id-aliases.json`: `{ "tech.old": "tech.new" }`
