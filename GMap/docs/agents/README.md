# GMap — Агенты для мульти-агентного внедрения

Эта папка содержит задачи для 10 параллельных агентов Composer 2.5.

## Как использовать

1. Открой новый чат с Composer 2.5.
2. Закинь туда папку нужного агента (например `A1-foundation/`).
3. Агент прочитает `TASKS.md` из этой папки и начнёт работу по цепочке.

## Структура

```
agents/
  README.md            — этот файл
  PRINCIPLES.md        — общие принципы (для справки)
  A1-foundation/      — Foundation: effects, Faction.traits, balanceBudget
    TASKS.md
  A2-cards-ui/        — Cards UI (DragCard, DropZone)
    TASKS.md
  A3-races-loyalty/   — Races expansion + Loyalty system
    TASKS.md
  A4-logistics/       — Logistics network
    TASKS.md
  A5-science/         — Science v2 (upgrades, breakthroughs, exclusives)
    TASKS.md
  A6-combat-core/     — Combat Core (engagement-as-event, phases, veterancy)
    TASKS.md
  A7-card-battle/     — Card Battle Mode
    TASKS.md
  A8-diplomacy/       — Diplomacy v2 (opinion, treaties, UI)
    TASKS.md
  A9-quests-dice/     — Quests v2 + Dice system
    TASKS.md
  A10-rp-court/       — RP Court (NPC tasks, chronicle)
    TASKS.md
```

## Порядок запуска

| Волна | Агенты | Можно параллелить |
|---|---|---|
| 1 | A1 | один, блокирует остальных |
| 2 | A2, A3, A4 | параллельно |
| 3 | A5, A8 | параллельно |
| 4 | A6 | один |
| 5 | A7, A9 | параллельно |
| 6 | A10 | один |

## Зависимости

```
A1 -> A2, A3, A4, A5, A6, A8
A2 -> A7, A8, A9, A10
A3 -> A6, A8
A4 -> A6
A5 -> A3, A6
A6 -> A7
A9 -> A10
```

Каждый `TASKS.md` самодостаточен — содержит промпт, принципы, скоуп, зависимости, файлы, цепочку задач и DoD.
