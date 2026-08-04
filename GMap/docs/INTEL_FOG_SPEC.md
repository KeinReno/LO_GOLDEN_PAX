# Intel Fog — Туман войны для информации

> Версия: **1.0** · Дата: **2026-08-04** · Статус: **реализация**

Связано с: `CAMPAIGN_TABLE_SPEC.md`, `CAMPAIGN_TABLE_AMENDMENTS.md`, `UI_SYSTEMS_MASTER_SPEC.md`.

## Концепция

Уровни знания **0–4** на сущность (`race` / `faction` / `tech` / `building` / `unit`) для каждой фракции. Данные **не устаревают**, **не фейкаются**; уровни только растут. Свои сущности всегда **4**. Маскировка на сервере (`filterWorldForFaction` + `maskEntityByLevel`).

| Уровень | Название | Видимость |
|--------|----------|-----------|
| 0 | Неизвестно | Нет в справочнике |
| 1 | Обнаружено | Имя, категория |
| 2 | Базовые | Приблизительные характеристики |
| 3 | Детальная | Точные статы без hidden |
| 4 | Полное | Всё, включая скрытое |

## Хранение

- `data/faction-intel.json` — `FactionIntel` по фракциям
- `server/intel.mjs` — API (`setKnowledgeLevel`, `bumpSystemIntel`, `processIntelTick`, …)
- `data/faction-contacts.json` — boolean-контакты (совместимость; `known = level ≥ 1`)
- Баланс: `content/core/rules.json` → `intel.*`

## Источники

- Флот/легион в видимой системе → level 1
- Блокада → progress/ход → пороги levels
- `intent.scout_world` → +scoutWorldIntel
- Дипломатия: contact/trade/alliance/research_pact
- `intent.espionage` → +level категории, риск detection
- Торговля / покупка tech → level 2 / 4
- Квест / GM override

## UI

Раздел **Справочник** (`viewMode: "codex"`) — кнопка нижнего дока **правее всех**. Не путать с `SystemCodex` (досье системы).

## Принципы честности

1. Нет устаревания.
2. Нет дезинформации.
3. Нет ложного владельца.
4. Приближения на level 2 — честные диапазоны.
