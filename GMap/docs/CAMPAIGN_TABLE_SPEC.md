# GMap — Спецификация «Стол кампании»

> Рабочий документ для реализации. Версия: **1.1** · Дата: **2026-07-24**  
> Статус: утверждён как дорожная карта после обсуждения архитектуры.  
> Стек сегодня: Vite + React + TS + PixiJS 8 + Zustand · Node API (`server/`) · хост на ПК мастера.  
> **v1.1:** налоги и единый пайплайн модификаторов (доход, upkeep, AP, costs).  
> Дополнения (туман-кисть, бой, расы, население, нарративные POI): [`CAMPAIGN_TABLE_AMENDMENTS.md`](./CAMPAIGN_TABLE_AMENDMENTS.md).  
> План работ: [`WORK_PLAN.md`](./WORK_PLAN.md).

Этот документ описывает, **что строим**, **как устроена правда данных**, **как масштабировать контент (конструктор)**, **ходы / AP / экономику / налоги / модификаторы / RP**, и **в каком порядке кодить**.  
Не является копией кода: где текущая реализация расходится со спецификацией — спецификация целевая.

---

## 0. Оглавление

1. [Продукт и границы](#1-продукт-и-границы)
2. [Исходная точка (as-is)](#2-исходная-точка-as-is)
3. [Принципы (нерушимые)](#3-принципы-нерушимые)
4. [Слои правды](#4-слои-правды)
5. [Движок vs контент (конструктор)](#5-движок-vs-контент-конструктор)
6. [Definition / Instance](#6-definition--instance)
7. [Словарь эффектов и ops](#7-словарь-эффектов-и-ops)
8. [Intents, AP, суточный ход](#8-intents-ap-суточный-ход)
9. [Экономика, налоги, модификаторы и законы](#9-экономика-налоги-модификаторы-и-законы)
10. [RP / эпизоды](#10-rp--эпизоды)
11. [UI](#11-ui)
12. [Сервер, хостинг, синхронизация](#12-сервер-хостинг-синхронизация)
13. [Схемы данных (целевые)](#13-схемы-данных-целевые)
14. [API (целевой контракт)](#14-api-целевой-контракт)
15. [Миграция с текущего GMap](#15-миграция-с-текущего-gmap)
16. [Фазы реализации](#16-фазы-реализации)
17. [Чеклисты приёмки](#17-чеклисты-приёмки)
18. [Открытые решения](#18-открытые-решения)
19. [Связанные файлы и референсы](#19-связанные-файлы-и-референсы)

---

## 1. Продукт и границы

### 1.1 Что это

**Мультиплеерный стол кампании** (не MMO, не полный Paradox-симулятор):

- одна живая карта-галактика (доска);
- игроки за фракции с fog-of-war;
- ограниченные действия на ход (AP);
- ход закрывается **раз в сутки** (цель: **00:01 Europe/Moscow**);
- RP-эпизоды (чат) и экономика на **одной** системе интентов/ledger;
- мастер — арбитр и редактор лора; сервер — единственный writer канона стола.

### 1.2 Что не строим (пока / никогда в v1)

- полноценный бой как в тактической игре (достаточно resolve + журнал + ручной override мастера);
- биржа игроков с ордерами;
- Postgres / кластер;
- отдельный Unity/Unreal клиент;
- скрытые параллельные «правды» в Discord (числа только через стол).

### 1.3 Роли

| Роль | Может |
|------|--------|
| **Master (GM)** | редактировать лор/карту, GM-patch, смотреть все inbox/ledger/RP, force tick, accept/reject |
| **Player** | видеть fog-view, тратить AP на intents, RP, смотреть свою казну и журнал |
| **Server** | validate, reserve, processTurn, publish version, cron |

---

## 2. Исходная точка (as-is)

Уже есть и **переиспользуется**:

| Компонент | Где | Заметка |
|-----------|-----|---------|
| Карта, системы, линки, сектора | `WorldState`, Pixi | сильная доска |
| Политей / фракции + пароль | `Faction` | seats ≈ фракции |
| Флоты, легионы, POI, квесты, караваны | `types.ts` / store | инстансы на карте |
| Дипломатия (enum связей) | `DiplomacyEdge` | тонкий слой |
| Publish + fog `/view` | `server/api.mjs` | poll `map-version` |
| Приказы игроков | `PlayerOrder`, `data/player-orders.json` | inbox-заготовка |
| `advanceTurn` | `worldStore.ts` | снимок + caravans; **почти не apply приказов** |
| Туннель игрокам | `playerShare.mjs` (CloudPub → …) | до белого IP достаточно |
| Ресурсы как **теги** | `RESOURCE_POOL` | ещё не stocks/ledger |
| Типы кораблей/POI | хардкод TS | нужно увести в content pack |

Референс playbook: `D:\LO_GALACTIC_STRATEGY_ARTEM` — `PLAYBOOK_TURN`, registries, stocks отдельно от карты. **Не портить** Obsidian-пайплайн; брать идеи порядка хода и registries.

---

## 3. Принципы (нерушимые)

1. **Одна ручка записи канона** — только сервер в `processTurn` / `gmPatch`. Клиенты пишут **intents** и сообщения RP.
2. **Pending ≠ Truth** — заявки видны отдельно от committed board.
3. **Один inbox** — приказы с карты и action-кнопки из RP становятся одним классом intents.
4. **Один ledger** — любые валюты/AP-изменения только через ledger-записи.
5. **RP не двигает числа** без intent.
6. **Engine мало глаголов, Content много существительных** — новый корабль/валюта/здание = JSON, не новый `if` в тике.
7. **Одинаковые правила для всех**; полисы/законы/налоги = модификаторы одного пайплайна, не отдельные симуляторы.
8. **Дефицит режет рост и темп, не выкидывает со стола.**
9. **Масштабирование контентом** важнее ранней «умной» магии скриптов.
10. **Сначала стол на 4–8 игроков**, потом инфраструктура.
11. **Все бонусы/штрафы к доходу, upkeep, AP и стоимостям** проходят через один `ModifierStack` (см. §9) — никаких скрытых формул в UI.

---

## 4. Слои правды

```
┌─────────────────────────────────────────────────────────────┐
│  CONTENT PACKS (registries) — определения, редко меняются     │
│  currencies, ships, units, buildings, laws, taxes,           │
│  intents, effects, modifiers catalog                         │
└─────────────────────────────────────────────────────────────┘
                │ load at boot /api/content
                ▼
┌───────────────┬─────────────────┬───────────────────────────┐
│ CANON MAP     │ BOARD (session) │ CAMPAIGN LIFE             │
│ geography     │ fleets, owners  │ RP jsonl                  │
│ lexicon       │ fog, activity   │ ledger + stocks           │
│ polity skin   │ quests pins     │ turn journal              │
│ ZIP / lore    │ meta.turn       │ private notes (later)     │
│               │ published.json  │ data/ledger, data/rp/…    │
└───────────────┴────────┬────────┴────────────▲──────────────┘
                         │                     │
                         │              ┌──────┴──────┐
                         │              │ INBOX       │
                         │              │ intents     │
                         │              │ (orders)    │
                         └──────────────┤ pending     │
                           processTurn  └─────────────┘
```

| Слой | Пишет | Читает | Файлы (цель) |
|------|-------|--------|----------------|
| Content | разработчик / GM (редко) | все | `content/**` |
| Canon map | GM (лор-редактор) | сервер | campaign ZIP / `lo_golden_pax.json` |
| Board | **только сервер** | игроки (fog) | `data/published.json` |
| Inbox | игроки (+ GM) | сервер, GM | `data/intents.json` (эволюция `player-orders.json`) |
| Ledger | **только сервер** | фракция своё, GM всё | `data/ledger.json` + append log |
| RP | игроки, GM | по visibility | `data/rp/.../messages.jsonl` |
| Journal | сервер | все (публичная часть) | `data/turns/{turn}/journal.json` |

**Мастерский Zustand** в live-кампании = зеркало сервера или отдельный режим «лор-черновик». Не параллельная вселенная стола без publish.

---

## 5. Движок vs контент (конструктор)

### 5.1 Engine (код, стабильный)

Ответственность:

- загрузка и валидация content packs;
- `validateIntent` / `reserve` / `processTurn`;
- ops-примитивы (`move_fleet`, `transfer`, `build`, `apply_damage`, …);
- свёртка effects → income/upkeep;
- fog filter, publish version, cron 00:01 MSK;
- API и права ролей.

### 5.2 Content (данные, растёт)

```text
GMap/content/
  core/                      # базовый пак стола
    pack.json
    rules.json               # apPerTurn, tick, deficit, tax clamps, merge order
    currencies.json
    map_resources.json       # тег на карте → yield
    ships.json
    units.json
    buildings.json
    laws.json
    taxes.json               # налоговые политики / ступени
    pois.json
    intents.json
    effects.json             # словарь effect id + schema args
  golden_pax/                # лор-специфика кампании (опционально)
    pack.json
    ships.json
    laws.json
    taxes.json
```

Кампания объявляет: `contentPacks: ["core", "golden_pax"]`.

### 5.3 Правило расширения

| Хочу добавить | Делаю |
|---------------|--------|
| новую валюту | запись в `currencies.json` |
| корабль / юнит / здание / POI / закон / налог | JSON + effects/cost |
| ступень или слот налога | `taxes.json` (без правки формулы тика) |
| новый тип приказа из уже существующих ops | `intents.json` |
| qualitatively новую механику | новый `effect` и/или `op` в engine + запись в `effects.json` |

**Запрещено:** хардкодить имена ресурсов/типов кораблей в `advanceTurn` / UI-дропдаунах. UI читает registry.

---

## 6. Definition / Instance

### 6.1 Definition (справочник)

Стабильный `id` (kebab / dotted): `ship.cruiser`, `currency.metal`, `building.mine`, `intent.move_fleet`.

Пример корабля:

```json
{
  "id": "ship.cruiser",
  "kind": "ship",
  "name": "Крейсер",
  "tags": ["military"],
  "build": { "ap": 1, "cost": { "metal": 40 }, "timeTurns": 2 },
  "upkeep": { "supply": 2 },
  "stats": { "power": 12, "hp": 100 },
  "effects": []
}
```

### 6.2 Instance (на столе)

```json
{
  "id": "fleet_17",
  "composition": [{ "defId": "ship.cruiser", "count": 3, "hp": 80 }],
  "systemId": "sys_…",
  "factionId": "fac_…"
}
```

В сейве — **defId + runtime overrides**, не копия всех правил. Баланс правится в content; инстансы не разъезжаются по схеме.

### 6.3 Aliases (миграция)

Таблица `id-aliases.json`: `"крейсер" → "ship.cruiser"`, старые теги ресурсов → `currency.*`.

---

## 7. Словарь эффектов и ops

### 7.1 Effects (единый язык модификаторов)

Любой бонус/штраф к **доходу, upkeep, AP, стоимостям intents, налогам** — это effect из словаря.  
Источник (здание, закон, налог, дефицит, дипломатия, POI, GM-aura) только **эмитит** effects; формула тика одна.

Минимальный стартовый набор (расширяется редко):

| effect id | Назначение | args |
|-----------|------------|------|
| `production_flat` | +N ресурса / ход (до mult) | `resource`, `amount` |
| `production_mult` | ×M к производству ресурса | `resource`, `mult` |
| `upkeep_flat` | +N расхода / ход | `resource`, `amount` |
| `upkeep_mult` | ×M к upkeep | `resource`?, `mult` |
| `ap_add` | +N к лимиту AP на ход | `amount` |
| `ap_mult` | ×M к лимиту AP (редко) | `mult` |
| `ap_cost_flat` | +N к стоимости AP у intents с тегом | `tag`?, `amount` |
| `ap_cost_mult` | ×M к стоимости AP | `tag`?, `mult` |
| `cost_flat` | +N к цене постройки/найма | `resource`, `amount`, `tag`? |
| `cost_mult` | ×M к цене | `resource`?, `tag`?, `mult` |
| `move_cost_mult` | дороже/дешевле ходы флотов | `mult` |
| `tax_rate_add` | сместить ставку налога (п.п.) | `taxSlot`, `amount` |
| `tax_income_mult` | ×M к собранному налогу | `taxSlot`?, `mult` |
| `tax_pressure` | давление/недовольство от налогов | `amount` |
| `stat_mult` | множитель боевого/прочего стата | `stat`, `mult` |
| `unlock_build` | разрешить building id | `buildingId` |
| `allow_intent` | разрешить intent | `intentId` |
| `forbid_intent` | запретить intent (пока активен) | `intentId` |

Каждый effect в runtime несёт метаданные источника для UI/журнала:

```json
{
  "effect": "production_mult",
  "args": { "resource": "currency.metal", "mult": 1.1 },
  "source": { "kind": "law", "id": "law.open_ports", "label": "Открытые порты" }
}
```

### 7.2 ModifierStack (движок свёртки)

На каждый тик / preview для фракции:

1. **Collect** — собрать effects из всех источников (§9.2).  
2. **Clamp** — отсечь запрещённые/устаревшие id.  
3. **Merge** — по ключу канала (например `production:currency.metal`):  
   - сначала сумма всех `*_flat`;  
   - затем произведение всех `*_mult` (порядок источников не важен при коммутативном mult);  
   - затем `rules.economyMergeOrder` / `modifierMergeOrder` если понадобятся исключения.  
4. **Apply** — к базе дохода, upkeep, AP max, cost preview.  
5. **Explain** — сохранить разбивку для UI «почему +12 металла / почему AP 4».

**Запрещено:** вторая формула в клиенте. Preview = тот же `buildModifierStack` + dry-run.

### 7.3 Ops (императивные примитивы engine)

Минимальный набор:

| op | Делает |
|----|--------|
| `move_fleet` / `move_legion` | смена systemId / route |
| `set_ownership` / `set_contested` | владение |
| `transfer` | ledger A→B |
| `build` | поставить building instance, списать cost |
| `scrap` | удалить/разбрать → +resource |
| `apply_damage` | hp/power |
| `set_diplomacy` | edge relation |
| `set_tax` | выставить ступень/политику налога фракции |
| `enact_law` / `revoke_law` | активные законы |
| `spawn_quest` / `complete_quest` | пины |
| `reveal_fog` | visibility |
| `log` | запись в journal |

Intent = `requires[]` + `ops[]` (+ cost/ap из def, с учётом ModifierStack на validate).

---

## 8. Intents, AP, суточный ход

### 8.1 Action Points

- Базовый лимит: `rules.apPerTurn` (старт: **3**), одинаков для всех; законы, налоги (side-effects), дефицит и временные ауры меняют AP только через `ap_add` / `ap_mult` в ModifierStack.
- AP **сгорают** в конце хода (не копятся) — проще для daily.
- Резерв при подаче intent; освобождение при отмене pending.
- Чат IC/OOC = **0 AP**.  
- `transfer` ресурсов (официальный) = **0 AP** (не наказывать RP), но лимиты/анти-спам можно ввести позже.
- Карточные военные действия: 1–2 AP по `intents.json`.

### 8.2 Intent lifecycle

```
draft → submitted (pending, AP reserved)
      → cancelled (игроком до freeze)
      → applied (тик) | rejected (validate fail / GM) | superseded
```

На UI: pending рисуются отдельно (уже есть стрелки приказов на карте).

### 8.3 Окно суток

| Время (MSK) | Событие |
|-------------|---------|
| 00:01 | `processTurn`: freeze inbox → resolve → economy → journal → `turn++` → reset AP → publish |
| день | игроки подают/правят/отменяют свои pending |
| ~23:50 | опциональный soft warning в UI |
| boot сервера | если пропущен тик: **один** catch-up + алерт GM (не прогонять неделю молча) |

Timezone: `Europe/Moscow` в `rules.json`.  
Планировщик: `node-cron` или Windows Task Scheduler → HTTP `POST /api/turn/tick` с master token.

### 8.4 Порядок resolve (фиксированный)

1. GM intents / patches  
2. `transfer`  
3. diplomacy  
4. `move_*`  
5. combat / claim / attack  
6. build / scrap / set_tax / enact_law  
7. economy: ModifierStack → income → taxes → upkeep → deficit  
8. caravans / anomaly drift (как сейчас)  
9. journal + backups  

Конфликт двух move на одну цель — по правилам `rules.conflictPolicy` (старт: **первый по timestamp submitted** или initiative; зафиксировать одно и не менять без миграции).

### 8.5 Стартовые intents (map текущих приказов)

| intent id | AP | ops | Было |
|-----------|----|-----|------|
| `intent.move_fleet` | 1 | `move_fleet` | `move_fleet` |
| `intent.move_legion` | 1 | `move_legion` | `move_legion` |
| `intent.attack_system` | 2 | combat + optional move | `attack_system` |
| `intent.claim_system` | 1 | `set_ownership` / contested | `claim_system` |
| `intent.transfer` | 0 | `transfer` | новое |
| `intent.build` | 1 | `build` | новое (фаза C+) |
| `intent.set_tax` | 1 | `set_tax` | новое (фаза C) |
| `intent.enact_law` | 1 | `enact_law` | новое (фаза D) |

---

## 9. Экономика, налоги, модификаторы и законы

### 9.1 Валюты (старт — мало)

| id | Имя | Роль |
|----|-----|------|
| `currency.metal` | Металл / титан | стройка, корабли, ремонт |
| `currency.supply` | Обеспечение | upkeep армии и владений |
| _(не валюта)_ AP | Очки действий | темп решений |

Дальше добавляются только через `currencies.json`.

### 9.2 Источники модификаторов (кто эмитит effects)

Один список, одна свёртка (`ModifierStack`, §7.2):

| Приоритет сбора (для UI-группы) | Источник | Примеры effects |
|----------------------------------|----------|-----------------|
| 1. Base rules | `rules.json` | `apPerTurn` как база AP |
| 2. Map yields | теги систем/планет | `production_flat` |
| 3. Buildings | инстансы построек | production / upkeep |
| 4. Laws | активные законы фракции | production_mult, ap_add, cost_mult |
| 5. **Taxes** | выбранная налоговая политика | tax_rate + побочные effects (давление, бонус казне, штраф росту) |
| 6. Diplomacy | торговый договор / война | production_mult, upkeep_mult |
| 7. Deficit | состояние казны | ap_add −1, move_cost_mult, forbid_intent build |
| 8. Temporary | GM aura, ивент, эпизод | любые; `expiresTurn` |
| 9. Race / relic | позже | tags → effects |

Игрок **не** пишет modifiers руками. Он меняет законы/налоги intents — сервер пересчитывает stack.

### 9.3 Пайплайн дохода за тик (одинаковый для всех)

```
baseYield     = Σ map tiles + base from rules
+ flats       = baseYield + Σ production_flat
* mults       = flats * Π production_mult
= grossIncome

taxCollected  = applyTaxes(grossIncome, taxPolicy, ModifierStack)   // см. §9.4
netAfterTax   = grossIncome - taxCollected
  // по политике: налог может уходить «в никуда» (издержки государства),
  // частично возвращаться как «бюджетный» тот же metal, или делиться по слотам —
  // задаётся taxes.json, не кодом

upkeep        = (Σ upkeep_flat) * Π upkeep_mult
net           = netAfterTax - upkeep   // затем clamp / deficit flags

apMax         = floor( (rules.apPerTurn + Σ ap_add) * Π ap_mult )
```

Все шаги пишутся в **turn economy breakdown** (для вкладки «Держава» и журнала).

### 9.4 Налоги

Налог — не отдельный симулятор, а **политика фракции** из `taxes.json` + текущая ступень в stocks.

#### Слоты (стартовый набор)

| taxSlot | На что действует | Смысл |
|---------|------------------|--------|
| `tax.industry` | доля / изъятие с `currency.metal` gross | промышленный налог |
| `tax.supply` | доля с `currency.supply` gross | логистический сбор |
| `tax.trade` | множитель к yield с тегом `trade` / activity trade | пошлины (опционально v1.1+) |

Слоты добавляются контентом. Engine знает только: *взять gross по resource/tag → применить rate → эмитить side-effects ступени*.

#### Политика (`taxes.json`)

```json
{
  "id": "tax.industry",
  "name": "Промышленный налог",
  "resource": "currency.metal",
  "apToChange": 1,
  "cooldownTurns": 1,
  "takesEffect": "next_tick",
  "tiers": [
    {
      "id": "none",
      "label": "0%",
      "rate": 0,
      "effects": []
    },
    {
      "id": "low",
      "label": "10%",
      "rate": 0.10,
      "effects": [
        { "effect": "tax_pressure", "args": { "amount": 1 } }
      ]
    },
    {
      "id": "mid",
      "label": "20%",
      "rate": 0.20,
      "effects": [
        { "effect": "tax_pressure", "args": { "amount": 3 } },
        { "effect": "production_mult", "args": { "resource": "currency.metal", "mult": 0.95 } }
      ]
    },
    {
      "id": "high",
      "label": "35%",
      "rate": 0.35,
      "effects": [
        { "effect": "tax_pressure", "args": { "amount": 6 } },
        { "effect": "production_mult", "args": { "resource": "currency.metal", "mult": 0.85 } },
        { "effect": "ap_add", "args": { "amount": -1 } }
      ]
    }
  ]
}
```

**Идея баланса (мягкость):** высокий налог даёт больше изъятия в моменте, но через side-effects режет производство и/или AP — игрок сам выбирает темп. Нулевая ставка не наказывает.

#### Куда девается собранное

В `rules.json` / на слоте:

| mode | Поведение |
|------|-----------|
| `sink` | налог сгорает (издержки аппарата) — проще для v1 |
| `treasury` | `taxCollected` сразу возвращается в тот же stock как «бюджет» (gross уменьшается для «народа», казна фракции = player stock — тогда налог = **роль вкуса/давления**, а не второй кошелёк) |
| `split` | часть sink, часть в stock / в отдельный `currency.budget` (если заведён) |

**Рекомендация v1:** один player-facing stock на валюту + mode `sink` **или** налог как чистый **модификатор давления без второго кошелька** (`rate` влияет только через effects ступени, без отдельного «собрали 40»).  

Практичный компромисс для стола:

- `rate` реально списывает % с **gross** в ledger reason `tax:{slot}` (прозрачно);
- mode = `treasury`: те же единицы тут же числятся как доход казны игрока (итог stock ≈ net без «исчезновения»), а смысл налога — **side-effects ступени** (pressure, production_mult, ap);
- UI показывает: «ставка 20% · давление 3 · производство металла ×0.95».

Так налог ощущается политикой, а не налоговым симулятором EU4.

#### Смена налога

- Intent `intent.set_tax` (1 AP по умолчанию): `{ taxSlot, tierId }`.  
- Эффект ставки и side-effects — со **следующего** тика (`takesEffect: next_tick`).  
- Кулдаун 1 ход; нельзя спамить ставки.  
- Clamp: нельзя выбрать tier вне def; GM может `gmPatch`.

#### Давление (`tax_pressure`)

Агрегируется в stocks: `pressure` (число). Пороги в `rules.taxPressure`:

| pressure | Эффект (пример, content) |
|----------|--------------------------|
| 0–2 | нет |
| 3–5 | `cost_mult` build +10% или мягкий RP-флаг |
| 6+ | `ap_add: -1` и/или forbid дорогих intents; журнал «налоговое напряжение» |

Давление **не** уничтожает фракцию; это ещё один мягкий рычаг в том же ModifierStack (источник `tax_pressure` → эффекты из rules/thresholds).

### 9.5 Законы

- Запись в `laws.json`: cost/AP на принятие, `effects[]`, кулдаун, взаимоисключающие группы (`mutexGroup`).
- Тот же ModifierStack, что налоги и здания.
- Смена: `intent.enact_law` / `revoke_law` → со следующего тика.
- Закон может включать `tax_rate_add` или запрещать tier `high` — через effects, не через особый код.

### 9.6 Дефицит (мягкий)

| Состояние stocks | Эффект (через ModifierStack, источник `deficit`) |
|------------------|--------------------------------------------------|
| OK | нет |
| Low | `ap_add: -1` **или** `move_cost_mult` (см. rules) |
| Empty | `forbid_intent` на build/найм; износ силы опционально |
| Critical | журнал + GM-хук; не hard game over |

Владение системами **не снимается бухгалтерией**.

### 9.7 Сделки игроков

v1: `intent.transfer` + RP-текст.  
Цены договорные; сервер двигает только числа.  
NPC-рынок — позже.

### 9.8 Preview для игрока

Вкладка «Держава» показывает:

- AP max / remaining / reserved  
- stocks  
- active laws + tax tiers  
- **breakdown**: base → flats → mults → tax → upkeep → net  
- список модификаторов с `source.label`  

Числа preview = результат того же кода, что тик (dry-run на текущем board).

---

## 10. RP / эпизоды

### 10.1 Дерево

```
Campaign → Chapter → Episode (канал)
```

- Закрытый Episode = read-only.  
- Новый Episode = новый канал.  
- Квесты на карте = геопины; Episode может `ref: questId|systemId|fleetId`, но не заменяет чат.

### 10.2 Типы сообщений

| type | Назначение |
|------|------------|
| `ooc` | вне игры |
| `ic` | от лица персонажа |
| `action` | описание действия (+ опционально intent) |
| `context` | мастерская врезка / лор |
| `system` | авто (тик, apply, deficit) |

### 10.3 Visibility

`all` | `faction:{id}` | `gm_player:{factionId}` | `gm_only`

### 10.4 Action → inbox

Кнопка в RP создаёт **тот же** intent, что карта. Никаких «−50 титана в тексте = факт».

### 10.5 Хранение

```text
data/rp/{campaignId}/chapters/{chapterId}/episodes/{episodeId}/messages.jsonl
data/rp/{campaignId}/index.json
```

Append-only jsonl. **Не** класть сообщения в `published.json`.

---

## 11. UI

### 11.1 Игрок `/view`

Вкладки:

1. **Карта** — fog Pixi (как сейчас) + pending стрелки  
2. **Держава** — казна, AP, законы, **налоги**, upkeep/tax breakdown, список модификаторов  
3. **Кампания** — главы/эпизоды/чат  
4. **Приказы** — список pending/история, подача/отмена  

Показывать явно: **Committed (ход N)** vs **Pending**.

### 11.2 Мастер `/`

Текущий редактор карты + панели:

- Inbox (все intents)  
- Ledger / казна фракций  
- Кампания (RP moderation)  
- Журнал хода  
- Turn controls (force tick, freeze)  
- Content pack info (read-only в UI)

### 11.3 Режимы качества карты

Сохранить существующие Авто / Лайт / Суперлайт / Качество — RP/econ не в WebGL.

### 11.4 Контент-driven формы

Дропдауны кораблей, зданий, валют — из `/api/content`, не из `SHIP_TYPES` в коде.

---

## 12. Сервер, хостинг, синхронизация

### 12.1 До белого IP (~29.07.2026)

- Хост на ПК мастера + CloudPub (предпочтительно) как сейчас.  
- Туннель — канал доступа, не архитектура правды.

### 12.2 После белого IP

- Постоянный Node (`serve.mjs` + API) на белом IP / проброс порта.  
- Туннели — fallback.  
- Опционально тонкий Tauri-лаунчер: «старт хоста / открыть стол».

### 12.3 Sync

- v1: poll `map-version` + отдельные version для `rp` / `ledger` (или единый `tableRevision`).  
- WebSocket — когда чат станет основным realtime-слоем.

### 12.4 Надёжность домашнего ПК

- Перед тиком: бэкап `data/turns/{turn}/` (`published`, `ledger`, `intents`, journal).  
- Sleep/hibernate враг cron → catch-up на boot.  
- Master token обязателен на tick/gm endpoints.

### 12.5 Когда SQLite

Переход с JSON/jsonl → SQLite, когда:

- сообщения RP и ledger начинают тормозить или портиться от ручных правок;
- нужны атомарные транзакции тика.

До этого JSON + бэкапы достаточны. Postgres не нужен.

---

## 13. Схемы данных (целевые)

### 13.1 `rules.json` (фрагмент)

```json
{
  "apPerTurn": 3,
  "apBanking": false,
  "tickTimezone": "Europe/Moscow",
  "tickCron": "1 0 * * *",
  "conflictPolicy": "submitted_at_asc",
  "deficit": {
    "lowRatio": 0.15,
    "emptyAt": 0,
    "lowPenalty": "ap_minus_1"
  },
  "economyMergeOrder": ["flat", "mult"],
  "tax": {
    "defaultMode": "treasury",
    "changeTakesEffect": "next_tick",
    "pressureThresholds": [
      { "min": 3, "effects": [{ "effect": "cost_mult", "args": { "mult": 1.1, "tag": "build" } }] },
      { "min": 6, "effects": [{ "effect": "ap_add", "args": { "amount": -1 } }] }
    ]
  }
}
```

### 13.2 Stocks / Ledger

```json
{
  "factionId": "fac_…",
  "turn": 12,
  "ap": { "max": 3, "remaining": 2, "reserved": 1 },
  "stocks": { "currency.metal": 120, "currency.supply": 45 },
  "laws": ["law.open_ports"],
  "taxes": {
    "tax.industry": "mid",
    "tax.supply": "low"
  },
  "pressure": 3,
  "deficit": "ok",
  "pendingPolicy": {
    "taxes": { "tax.industry": "high" },
    "lawsAdd": [],
    "lawsRemove": []
  }
}
```

`pendingPolicy` — изменения, принятые intents сегодня, применятся на тике (`next_tick`).

Ledger entry:

```json
{
  "id": "led_…",
  "turn": 12,
  "factionId": "fac_…",
  "currencyId": "currency.metal",
  "delta": -40,
  "reason": "build:building.mine",
  "intentId": "int_…",
  "at": "2026-07-24T21:01:00.000Z"
}
```

### 13.3 Intent

```json
{
  "id": "int_…",
  "defId": "intent.move_fleet",
  "factionId": "fac_…",
  "turn": 12,
  "status": "pending",
  "apCost": 1,
  "payload": { "fleetId": "fleet_…", "toSystemId": "sys_…" },
  "submittedAt": "…",
  "source": "map" ,
  "note": "опционально"
}
```

`source`: `map` | `rp` | `gm`.

### 13.4 Board

Эволюция текущего `WorldState`:

- сохранить systems/links/fleets/…;
- `orders` → вынести в inbox file (в published можно держать **публичный** хвост pending для стрелок, либо отдавать отдельным API);
- composition флотов → `defId`;
- `meta.turn`, `meta.contentPacks`, `meta.tableRevision`.

### 13.5 RP index

```json
{
  "campaignId": "golden_pax",
  "chapters": [
    {
      "id": "ch1",
      "title": "…",
      "episodes": [
        { "id": "ep3", "title": "…", "status": "open", "visibility": "all" }
      ]
    }
  ]
}
```

---

## 14. API (целевой контракт)

Существующие сохранить и расширить.

| Method | Path | Назначение |
|--------|------|------------|
| GET | `/api/content` | registries (публичные куски) |
| GET | `/api/map-version` | revision board |
| POST | `/api/view-refresh` | fog payload |
| POST | `/api/login` | faction seat |
| GET/POST | `/api/intents` | inbox (замена/обёртка orders) |
| POST | `/api/intents/:id/cancel` | отмена своего pending |
| GET | `/api/ledger/:factionId` | stocks + recent entries (свои / GM) |
| GET/POST | `/api/rp/...` | главы, эпизоды, messages |
| POST | `/api/turn/tick` | processTurn (master / cron) |
| POST | `/api/gm/patch` | ручное исключение с journal |
| POST | `/api/publish` | совместимость / форс publish |
| * | `/api/players/share*` | туннели как сейчас |

Все мутации канона — с проверкой роли и токена.

---

## 15. Миграция с текущего GMap

1. **Не ломать карту** — `published.json` остаётся board; поля добавлять мягко (`normalizeWorld`).
2. Вынести `RESOURCE_POOL`, `SHIP_TYPES`, POI labels, building kinds → `content/core/*.json`.
3. `player-orders.json` → формат intents + aliases старых `type`.
4. Ввести `data/ledger.json` с нулевыми/стартовыми stocks по фракциям.
5. `advanceTurn` в клиенте → делегировать серверному `processTurn` (клиентская кнопка = вызов API).
6. Zustand master: после tick/publish — reload с сервера.
7. Aliases для `"крейсер"` и русских resource strings.
8. RP модуль — зелёное поле, не трогает map schema.

Обратная совместимость ZIP export: lexicon/map как сейчас; session-only файлы в ZIP не обязательны на старте.

---

## 16. Фазы реализации

### Фаза A — Стабильный стол (почти есть)

- карта, fog, publish, tunnel, приказы  
- **Доделать:** серверный канон как SoT; мастер не расходится без publish  

**Done when:** игроки стабильно видят `/view`, кидают приказы, мастер видит inbox.

### Фаза B — Intents + AP + суточный тик

- content: `rules`, `intents`, aliases  
- reserve AP, cancel, freeze, `processTurn` на сервере  
- cron 00:01 MSK + boot catch-up  
- journal + backup per turn  
- apply move/claim/attack (минимальный auto-apply)

**Done when:** сутки закрываются без ручного «подвигай все флоты»; AP лимитирует день.

### Фаза C — Ledger + мягкая экономика + налоги/модификаторы

- currencies, map_resources, stocks, ledger log  
- **ModifierStack** (collect → merge → explain)  
- income / tax / upkeep на тике  
- `taxes.json` + `intent.set_tax` + pressure thresholds  
- deficit penalties как effects  
- `intent.transfer`  
- UI «Держава» с breakdown  

**Done when:** одна казна; налог/закон/здание меняют доход и AP через один пайплайн; бедность не кикает со стола.

### Фаза D — Content packs UI + build/ships + laws

- ships/units/buildings из JSON  
- schema-driven дропдауны  
- `intent.build` / scrap  
- laws v1 (`enact_law` / mutex groups)  

**Done when:** новый корабль/здание добавляется файлом без правки тик-логики.

### Фаза E — RP эпизоды

- chapter/episode/messages jsonl  
- вкладка «Кампания»  
- action → intent  
- visibility  

**Done when:** закрыли эпизод → архив; числа только через inbox.

### Фаза F — Хостинг / лаунчер

- белый IP, постоянный host  
- опционально Tauri launcher  
- оценка SQLite  

**Done when:** игроки заходят без танцев с туннелем; бэкапы тиков на месте.

---

## 17. Чеклисты приёмки

### Правда данных

- [ ] Игрок не может изменить stocks/board напрямую API без intent  
- [ ] Текст в RP без intent не меняет ledger  
- [ ] После tick клиенты получают новый revision  
- [ ] Откат = restore из `data/turns/{turn}/`

### AP / ход

- [ ] Нельзя засабмитить intents суммарно > remaining AP  
- [ ] Cancel возвращает AP  
- [ ] В 00:01 (или force) inbox замораживается на время resolve  
- [ ] Пропущенный тик при boot обрабатывается один раз с алертом

### Экономика

- [ ] Две фракции с одинаковыми владениями получают одинаковый gross до законов/налогов  
- [ ] Empty metal блокирует build, не блокирует move  
- [ ] Transfer пишет две стороны ledger  
- [ ] Смена налога тратит AP и применяется со следующего тика  
- [ ] Высокая ступень налога эмитит заявленные side-effects (production_mult / pressure / ap)  
- [ ] Breakdown в UI совпадает с серверным dry-run (± округление, зафиксированное в rules)  
- [ ] Один ModifierStack обслуживает законы, налоги, здания и deficit  

### Конструктор

- [ ] Добавление currency в JSON видно в UI и ledger без релиза новой формулы  
- [ ] Новый ship def выбирается в редакторе флота  
- [ ] Новая ступень в `taxes.json` доступна в UI без правки тик-кода  
- [ ] Неизвестный defId не крашит тик (reject + journal)

---

## 18. Открытые решения

Зафиксировать перед фазой B/C (коротко в этом файле при выборе):

1. **Conflict policy** — timestamp vs явный initiative.  
2. **Low deficit penalty** — `-1 AP` vs `move_cost_mult`.  
3. Pending стрелки: класть ли public pending в `published` или отдельный endpoint.  
4. Нужен ли банк AP позже (сейчас: нет).  
5. Стартовые stocks на фракцию — лор-таблица vs всем поровну.  
6. Боёвка: полный auto-resolve vs «атака создаёт contested + журнал, исход руками GM» на первых тиках.  
7. **Tax mode** — `sink` vs `treasury` vs налог-только-effects без rate-списания.  
8. **Округление** налога/дохода — floor vs round (нужно одно на всю кампанию).

Рекомендация по умолчанию из обсуждения:

1. `submitted_at_asc`  
2. `ap_minus_1`  
3. отдельный endpoint intents для игрока; в published — опциональный summary для стрелок  
4. без банка  
5. лор-старты (GM задаёт)  
6. атака → contested + journal; полный resolve позже  
7. **`treasury`** + прозрачный ledger `tax:*` + смысл через side-effects ступеней  
8. **floor** после каждого resource channel  

---

## 19. Связанные файлы и референсы

### GMap (текущие)

- `src/state/types.ts` — WorldState  
- `src/state/worldStore.ts` — advanceTurn, orders  
- `src/state/defaults.ts` — SHIP_TYPES, RESOURCE_POOL  
- `src/viewer/ViewerPage.tsx` — /view  
- `src/editors/useCampaignSession.ts` — publish/share  
- `server/api.mjs` — fog, orders, publish  
- `server/playerShare.mjs` — туннели  
- `data/published.json`, `data/player-orders.json`

### Artem (идеи, не код)

- `game/PLAYBOOK_TURN.md`  
- `game/ORDER_PIPELINE.md`  
- `game/data/registries/*`  
- `game/data/state/game_state.json` (stocks)

### Этот документ

- Путь: `GMap/docs/CAMPAIGN_TABLE_SPEC.md`  
- При изменении архитектуры — обновлять версию в шапке и фазы.

---

## Приложение A — Диаграмма суточного тика

```
                    ┌──────────────┐
                    │ 00:01 MSK    │
                    │ или GM force │
                    └──────┬───────┘
                           ▼
                    backup turn files
                           ▼
                    freeze inbox
                           ▼
              ┌──────── validate each ────────┐
              ▼                               ▼
         applied ops                      rejected → journal
              ▼
         economy: stack → income → tax → upkeep → deficit
              ▼
         caravans / drift
              ▼
         turn++ ; AP reset
              ▼
         tableRevision++
              ▼
         unfreeze ; publish
```

## Приложение B — Минимальный content skeleton (для старта кодинга)

Создать при старте фазы B/C (имена файлов):

- `content/core/pack.json`  
- `content/core/rules.json`  
- `content/core/effects.json`  
- `content/core/currencies.json`  
- `content/core/intents.json`  
- `content/core/ships.json` (миграция с SHIP_TYPES)  
- `content/core/map_resources.json` (миграция RESOURCE_POOL)  
- `content/core/taxes.json`  
- `content/core/laws.json`  
- `content/core/id-aliases.json`

## Приложение C — Краткий манифест для команды

> Мы делаем **движок стола** с content packs: сервер — единственная правда board/ledger; игроки шлют intents за AP; раз в сутки тик; экономика и налоги — через **один ModifierStack**; законы/здания/дефицит эмитят те же effects; RP — отдельный слой с кнопками в тот же inbox; карта GMap остаётся доской, не богом всего.

---

## Приложение D — Пример economy breakdown (журнал / UI)

```json
{
  "factionId": "fac_…",
  "turn": 12,
  "channels": {
    "currency.metal": {
      "base": 100,
      "flat": 20,
      "afterFlat": 120,
      "mult": 0.95,
      "gross": 114,
      "taxSlot": "tax.industry",
      "taxTier": "mid",
      "taxRate": 0.2,
      "tax": 22,
      "afterTax": 92,
      "upkeep": 30,
      "net": 62
    }
  },
  "ap": { "base": 3, "flat": -1, "mult": 1, "max": 2 },
  "modifiers": [
    { "effect": "production_mult", "args": { "resource": "currency.metal", "mult": 0.95 }, "source": { "kind": "tax", "id": "tax.industry:mid" } },
    { "effect": "ap_add", "args": { "amount": -1 }, "source": { "kind": "deficit", "id": "low" } }
  ]
}
```

---

*Конец спецификации v1.1*
