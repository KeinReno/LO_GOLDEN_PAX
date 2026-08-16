# Контент-агенты GMap

Не волна B/C. Это **делегирование каталога** на живой стол.

| Пакет | Скоуп | Параллель |
|---|---|---|
| `PATH_SIGNATURE_CATALOG/` | 6 пустых path-кластеров; **1 путь = 1 чат** | да, разные `PATH_ID` |
| (позже) alchemy recipes | `tech_recipes.json` 42 pending | нет, после сигнатур |
| (позже) raise 5a/5b | `units.json`/`ships.json` + `canRaiseUnit` | отдельный чат |

## Как запустить

1. Скопируй `PATH_SIGNATURE_CATALOG/OWNER_PROMPT.md`
2. Подставь **один** `PATH_ID` из: `offensive` · `defensive` · `mobility` · `cognitive` · `biological` · `exotic`
3. Новый чат агента. Вложи папку + skill `tech-path-catalog` (он должен подтянуться сам)
4. Второй чат — `REVIEW.md` на дифф первого (не тот же агент)

Не параллелить два агента в один `technologies.json` без раздельных путей: каждый трогает только свои id + свою строку `cluster` + при необходимости одно поле `tech_directions.paths`.

## Не брать

v0.5 UI · galaxy→v0.5 · pop from thin air · Доктрины · параллельная экономика · порог 5000
