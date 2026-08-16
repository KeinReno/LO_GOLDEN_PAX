# SQLite — normalized hot-state (C4)

> Статус: **C4 landed** — `GMAP_STORE=sqlite` использует нормализованные таблицы для горячего runtime-состояния. Файловый режим (`GMAP_STORE=file`, дефолт) без изменений.

## Что изменилось (C4)

Ранний черновик v1 (`kv(path, json)` — blob на файл) **заменён** нормализованными таблицами в `server/db/schema.sql` + `server/db/campaignDb.mjs`:

| Таблица | Вместо |
|---------|--------|
| `table_meta` | `table-meta.json` (только revision / tick flags / ops extras) |
| `tick_journal` + `tick_events` | вложенный `lastJournal` в table-meta (~1.3 MB) |
| `ledger_entries` | `ledger.json` → `entries[]` (без обрезки 2000) |
| `intents` | `data/intents.json` (приказы игроков, не content/core) |
| `engagements` | `data/engagements.json` |
| `kv` | остальные blob'ы: published, fog, race_states, … |

Контент `content/core/*.json` **не** в БД (принцип №16).

## Когда переключать

Спека: SQLite когда JSON тормозит или портится от ручных правок.

Сигналы go:
- `ledger.json` / `intents.json` / RP jsonl > ~5–10 MB и медленные тики
- частые конфликты ручного редактирования
- нужна транзакция «тик = атомарно»

Пока нет — остаёмся на файлах + `data/turns/` бэкапы.

## Адаптер

`server/db/storeAdapter.mjs` + `server/db/campaignDb.mjs`

| Driver | Env | Поведение |
|--------|-----|-----------|
| `file` (default) | `GMAP_STORE=file` | JSON как раньше; журнал тика в `data/tick-journal.json` |
| `sqlite` | `GMAP_STORE=sqlite` | нормализованные таблицы + kv для мира; нужен `better-sqlite3` |

`tableStore.readJson` / `writeJson` идут через адаптер. Горячие сущности — через `campaignDb`.

## Установка

```bash
cd GMap
npm i better-sqlite3
# Windows: может понадобиться build tools
set GMAP_STORE=sqlite
# optional: set GMAP_SQLITE_PATH=data/table.sqlite
```

При первом запуске с `GMAP_STORE=sqlite` — одноразовый импорт из `data/*.json` (флаг `store_meta.normalized_v1`).

## API проверки

`GET /api/store/ping` → `{ ok, driver, path?, normalized, tables?, betterSqlite3, normalizedActive }`.

`GET /api/ops/health` (master) также включает `store` и `dataSizes`.

## Порядок дальнейшей миграции (не C4)

1. ~~kv blob для всего~~ → **сделано частично**: kv только для не-нормализованного
2. ~~intents / engagements / ledger entries~~ → **сделано (C4)**
3. RP messages → jsonl_log (или отдельная таблица)
4. published / world systems — отдельная волна; JSON snapshot в `data/turns/` остаётся portable backup
