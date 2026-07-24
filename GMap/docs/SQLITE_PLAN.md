# SQLite — подготовка почвы (P8.7)

> Статус: **groundwork only**. Канон пока JSON (`GMAP_STORE=file`).

## Когда переключать

Спека: SQLite только если JSON начинает тормозить или портиться от ручных правок.

Сигналы go:
- `ledger.json` / `intents.json` / RP jsonl > ~5–10 MB и медленные тики
- частые конфликты ручного редактирования
- нужна транзакция «тик = атомарно»

Пока нет — остаёмся на файлах + `data/turns/` бэкапы.

## Адаптер

`server/db/storeAdapter.mjs`

| Driver | Env | Поведение |
|--------|-----|-----------|
| `file` (default) | `GMAP_STORE=file` | текущий read/write JSON |
| `sqlite` | `GMAP_STORE=sqlite` | kv + jsonl_log; зеркало на диск; нужен `better-sqlite3` |

`tableStore.readJson` / `writeJson` уже идут через адаптер.

## Схема v1 (черновик)

```sql
kv(path TEXT PK, json TEXT, updated_at TEXT)
  -- published, ledger snapshot, table-meta, fog, engagements blob

jsonl_log(id, path, json, at)
  -- RP messages append; optional ledger_entries later

-- later normalize:
-- intents(id, faction_id, turn, status, def_id, payload_json, ...)
-- ledger_entries(id, faction_id, currency, delta, turn, reason)
-- engagements(id, status, theater, result_json)
```

## Порядок миграции (когда решимся)

1. kv для `published` + `ledger` + `table-meta`
2. intents / engagements
3. RP messages → jsonl_log (или отдельная таблица)
4. оставить JSON snapshot в `data/turns/` как portable backup

## Установка (не сейчас)

```bash
cd GMap
npm i better-sqlite3
# Windows: может понадобиться build tools
set GMAP_STORE=sqlite
```

## API проверки

`GET /api/store/ping` → `{ ok, driver }`.
