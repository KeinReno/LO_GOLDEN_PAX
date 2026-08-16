# Agent C4 — Персистентность: горячее состояние кампании в SQLite

> Ты работаешь над проектом LO_GOLDEN_PAX / GMap. Читай спецификацию целиком, выполняй по порядку.
> Это **не** миграция контента и **не** то, что описано как v1-шаг в `../../SQLITE_PLAN.md` — тот шаг
> (таблица `kv(path, json)`, хранящая каждый файл целиком как blob) не решает ни одну из измеренных проблем
> ниже, он просто дублирует ту же запись файла ещё и в SQLite. Эта задача делает то, что `SQLITE_PLAN.md` сам
> называет «нормализовать позже» — то и есть настоящий v1.

## Принципы (нерушимые)

См. `../PRINCIPLES.md` (1–17). Особо: **№16** — контент (`content/core/*.json`) не переносится в БД ни
частично, ни полностью. Переносится только runtime-состояние кампании, перечисленное ниже.

## Контекст

Измеренные, а не гипотетические проблемы: `data/table-meta.json` весит 2,79 МБ (в основном — вложенный
журнал последнего тика, ~1,3 МБ), и перезаписывается **целиком** на 36 точках вызова `setTableMeta()`/
`bumpTableRevision()` (`server/tableStore.mjs:46-56`) по рутинным поводам (дипломатическое предложение,
придворная инициатива, тик рыночного курса) — 9 модулей вызывают это на события, не связанные с журналом.
`writeLiveBoard()` (`tableStore.mjs:108-157`) может писать один и тот же снапшот мира до трёх раз за один
вызов (`published.json` + `campaign-draft.json` + `public/campaigns/lo_golden_pax.json`, опционально) — до
~16 МБ почти дублирующего JSON за одно действие игрока. `ledger.mjs:206-207` жёстко обрезает историю
гроссбуха до последних 2000 записей вместо архивирования — старая история безвозвратно теряется.

## Зависимости

**Требует C1 целиком** (атомарность записи и фиксы персистентности — строить БД поверх ещё не
стабилизированного слоя бессмысленно) **и B1** (`../agents-pathways/B1-resource-ledger/`) — схема
`ledger_entries` ниже завязана на модель именных ресурсов, которую вводит B1; если B1 ещё не приземлился,
согласуй колонку `currency_id`/`resource_id` с ним заранее, не проектируй параллельно.

## Установка

`npm i better-sqlite3` (уже упомянут как опциональная зависимость в `../../SQLITE_PLAN.md`, сейчас не
установлен). `GMAP_STORE=sqlite` уже поддерживается как env-переключатель в `server/db/storeAdapter.mjs` —
эта задача не меняет сам переключатель, меняет то, что происходит, когда он включён, для конкретных сущностей
ниже (остальные сущности при `GMAP_STORE=sqlite` продолжают идти через существующий blob-путь, если он уже
есть, или через файловый бэкенд).

## Файлы

`server/db/storeAdapter.mjs`, `server/tableStore.mjs`, `server/ledger.mjs`, `server/engagements.mjs`,
`server/api.mjs` (в частях, читающих/пишущих `data/intents.json`/`data/table-meta.json`), новый файл
`server/db/schema.sql` или эквивалент через `better-sqlite3` миграции.

## Цепочка задач

### T4.1. Схема — таблицы вместо blob-per-file

Создай реальные таблицы (не `kv(path, json)`):

```sql
CREATE TABLE table_meta (
  id             INTEGER PRIMARY KEY CHECK (id = 1),
  table_revision INTEGER NOT NULL DEFAULT 0,
  last_tick_at   TEXT,
  tick_frozen    INTEGER NOT NULL DEFAULT 0,
  updated_at     TEXT NOT NULL
);

CREATE TABLE tick_journal (
  turn         INTEGER PRIMARY KEY,
  turn_from    INTEGER,
  turn_to      INTEGER,
  economy_json TEXT,
  created_at   TEXT
);

CREATE TABLE tick_events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  turn         INTEGER NOT NULL REFERENCES tick_journal(turn),
  type         TEXT NOT NULL,
  payload_json TEXT,
  at           TEXT NOT NULL
);
CREATE INDEX idx_tick_events_turn ON tick_events(turn);

CREATE TABLE ledger_entries (
  id          TEXT PRIMARY KEY,
  at          TEXT NOT NULL,
  turn        INTEGER NOT NULL,
  faction_id  TEXT NOT NULL,
  currency_id TEXT NOT NULL,   -- согласовать с B1: именной resourceId, не категорийная валюта
  delta       REAL NOT NULL,
  reason      TEXT,
  intent_id   TEXT
);
CREATE INDEX idx_ledger_faction_turn ON ledger_entries(faction_id, turn);

CREATE TABLE intents (
  id           TEXT PRIMARY KEY,
  faction_id   TEXT NOT NULL,
  turn         INTEGER NOT NULL,
  status       TEXT NOT NULL,
  def_id       TEXT,
  payload_json TEXT,
  submitted_at TEXT NOT NULL
);
CREATE INDEX idx_intents_turn_status ON intents(turn, status);

CREATE TABLE engagements (
  id          TEXT PRIMARY KEY,
  status      TEXT NOT NULL,
  theater     TEXT,
  turn        INTEGER,
  result_json TEXT
);
```

Таблица `intents` здесь — **приказы игроков за ход**, не путать с `content/core/intents.json` (каталог
типов намерений, остаётся в JSON per принцип №16). Если в коде есть места, которые полагаются на одинаковое
имя `intents` для обеих сущностей — это тот самый повод развести имена явно (например, серверная переменная/
функция для каталога типов — `intentDefs`, для поданных приказов — `intents`), не тащи коллизию имён в схему
БД дальше.

### T4.2. `table_meta`/`tick_journal` — разорвать связь

Сейчас `table-meta.json` весит 2,79 МБ, потому что журнал хода встроен в тот же объект, что и мелкие
метаданные (`tableRevision`, `lastTickAt`, `tickFrozen`). Перепиши `setTableMeta()`/`bumpTableRevision()`
(`tableStore.mjs:46-56`) так, чтобы они писали **только** в таблицу `table_meta` (маленькая строка), а запись
в `tick_journal`/`tick_events` происходила отдельным вызовом только там, где реально пишется журнал тика
(внутри `processTurn.mjs`, не в каждом из 9 модулей, которые сейчас дергают `setTableMeta` по мелким
поводам).

### T4.3. `ledger_entries` — без обрезки истории

Замени `ledger.mjs` чтение/запись на `INSERT` в `ledger_entries` вместо append+slice(-2000) в JSON-массиве.
История не обрезается — растёт линейно, что и является целью (сейчас `:206-207` безвозвратно теряет всё
старше последних 2000 записей). Если нужен предел на размер БД — архивируй старые записи в отдельную таблицу/
файл по завершении игрового сезона, не удаляй молча.

### T4.4. `intents`/`engagements` — перевести чтение/запись

`server/api.mjs` (места, читающие/пишущие `data/intents.json`), `server/engagements.mjs` — перевести на
`INSERT`/`SELECT`/`UPDATE` в новые таблицы вместо `readJson`/`writeJson` по всему файлу. Не забудь: после C1.T1.5
`engagementReconcile.mjs` уже должен идти через `tableStore.mjs`, а не через сырой `fs` — если T1.5 ещё не
выполнен, выполни его первым делом здесь (без него правки этой задачи не будут видны в `engagementReconcile.mjs`
после перехода на SQLite).

### T4.5. Мираж-запись — устранить триплицирование мира

`writeLiveBoard()` (`tableStore.mjs:108-157`) может писать один и тот же снапшот в `published.json` +
`campaign-draft.json` + `public/campaigns/lo_golden_pax.json` за один вызов. Это НЕ входит в скоуп таблиц
выше (мир — системы/планеты/флоты — остаётся в JSON до отдельной волны, см. `../README.md`), но раз ты уже
внутри `tableStore.mjs` — как минимум убедись, что вызовы `alsoDraft`/`alsoLore` действительно нужны на
каждом конкретном call site, который ты трогаешь в T4.2/T4.4 (не расширяй скоуп на полную нормализацию мира
— просто не оставляй тройную запись там, где двух за глаза хватает, если по факту чтения окажется, что
`campaign-draft.json` не читается никем между записями).

### T4.6. Миграция и откат

Старые файловые сейвы (`data/ledger.json`, `data/intents.json`, `data/engagements.json`, `data/table-meta.json`)
— одноразовый скрипт импорта в новые таблицы при первом запуске с `GMAP_STORE=sqlite` (не на каждом старте).
Файловый бэкенд (`GMAP_STORE=file`, дефолт) должен продолжать работать без деградации — эта задача добавляет
опцию, не убирает файловый путь (принцип №17).

## DoD

- `GMAP_STORE=sqlite` — `table_meta`, `ledger_entries`, `intents`, `engagements` реально читаются/пишутся из
  SQLite, не blob-обёрткой.
- `GET /api/store/ping` (уже существует) отражает реальное состояние.
- `data/table-meta.json` (файловый режим) больше не раздувается журналом на рутинных вызовах.
- История гроссбуха не обрезается молча.
- `npm run smoke`, `npm run smoke:tick` проходят в обоих режимах (`GMAP_STORE=file` и `GMAP_STORE=sqlite`).

## После завершения

1. Прогони smoke-тесты в обоих режимах хранения.
2. Замерь размер `data/table-meta.json` до/после на реальной кампании — приложи числа в summary.
3. Напиши `tmp/summary-{timestamp}.json`.
4. Обнови `../../SQLITE_PLAN.md` — отметь, что v1-шаг из документа заменён на нормализованные таблицы этой
   задачи (не два параллельных описания одного и того же).
