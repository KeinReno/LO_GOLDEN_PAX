# GMap — Дополнения к столу кампании (Amendments)

> Документ **№2**. Версия: **1.0** · Дата: **2026-07-24**  
> Дополняет и уточняет: [`CAMPAIGN_TABLE_SPEC.md`](./CAMPAIGN_TABLE_SPEC.md) (v1.1).  
> План работ: [`WORK_PLAN.md`](./WORK_PLAN.md).  
> Здесь — всё, что согласовали **после** базовой спеки: туман, бой с типами юнитов, нарративные POI, расовые бафы/дебафы, рост/убыль населения, приоритеты ГМ/атмосферы.

При конфликте с doc №1 по затронутым темам — **этот документ уточняет целевое поведение**; остальной каркас (одна правда, intents, AP, суточный тик, ModifierStack, налоги, content packs) остаётся из doc №1.

---

## 0. Оглавление

1. [Связь с doc №1 и границы](#1-связь-с-doc-1-и-границы)
2. [Явно не делаем](#2-явно-не-делаем)
3. [Нарративные маркеры и динамические слои](#3-нарративные-маркеры-и-динамические-слои)
4. [Туман войны (кисть + reveal)](#4-туман-войны-кисть--reveal)
5. [Бой: Engagement и типы юнитов](#5-бой-engagement-и-типы-юнитов)
6. [Расы: бафы, дебафы, совместимость](#6-расы-бафы-дебафы-совместимость)
7. [Население: рост и убыль](#7-население-рост-и-убыль)
8. [Инструменты ГМ (без развед-лжи)](#8-инструменты-гм-без-развед-лжи)
9. [Атмосфера и визуал (дозированно)](#9-атмосфера-и-визуал-дозированно)
10. [Новые content-файлы и эффекты](#10-новые-content-файлы-и-эффекты)
11. [Фазы внедрения (поверх A–F)](#11-фазы-внедрения-поверх-af)
12. [Чеклисты приёмки](#12-чеклисты-приёмки)
13. [Открытые решения](#13-открытые-решения)

---

## 1. Связь с doc №1 и границы

Doc №1 задаёт: сервер = writer канона, intents + AP, daily tick 00:01 MSK, ledger, налоги, ModifierStack, RP→inbox, content packs.

Doc №2 добавляет:

| Тема | Кратко |
|------|--------|
| Fog | пространственная mask + кисть GM + reveal условиями |
| Combat | Engagement (space / ground / assault), роли юнитов, потери по составу |
| Narrative map | POI/теги + динамические слои (фронт, Рой) |
| Races | расовые traits → те же effects |
| Population | тиковый рост/убыль, миграция, связь с supply и кризисами |
| GM ops | заметки, таймлайн, consequence brush, журнал (без intel-лжи) |
| Visual | map modes + cinematic preset позже; без CRT/Three.js/parallax-first |

---

## 2. Явно не делаем

Согласовано как **лишнее / не сейчас**:

- уровни знания системы (0…4), устаревание разведданных, ложный владелец, дезинформация только для одной фракции;
- CRT, время суток штаба, пыль, heat distortion, полный parallax;
- Three.js «сцена системы» как отдельный движок;
- синхронный курсор до websocket;
- cinematic-фильтры на каждом зуме по умолчанию (убивает `/view` на мобилках);
- Eve-style % влияния миноров в v1;
- полноценный Real FoW Foundry с «видел раньше = дымка знаний» как отдельная механика лжи (двухслойный fog «никогда / открыто» — ок, без фейков).

---

## 3. Нарративные маркеры и динамические слои

### 3.1 Принцип

Новые маркеры = **content**, не новый симулятор:

```
glyph + tag(s) + 0..N effects + optional intent hooks
```

Хранение: расширения `pois.json` / world tags на системе; эффекты идут в ModifierStack (doc №1 §7/§9).

### 3.2 Приоритетный набор (для сессий)

| # | Сущность | Тип | Механика |
|---|----------|-----|----------|
| 1 | Лагерь беженцев + гумкоридоры | POI + маршрут | расход supply, стабильность; конвой-intent |
| 2 | Карантин / пси-карантин | POI | `forbid_intent` входа / штраф; связь с населением |
| 3 | Фронт линии / миграция Роя | **динамический слой** | полилиния/облако, сдвиг на тике |
| 4 | Депо снабжения | POI + econ | без депо фронт получает upkeep_mult / запрет дальних атак |
| 5 | Пропаганда-вышка | POI | effects на соседние системы (pressure / production) |
| 6 | Мегаструктура / кузница | редкий POI | якорь арки; дорогой build; сильные effects |
| 7 | Сети врат | map layer | поверх существующих `damyl_*` линков |

Остальной каталог (тюрьма, чёрный рынок, сигнал бедствия, туристический маяк…) — тем же паттерном **после** приоритета.

### 3.3 Consequence brush (ГМ)

Одна панель пресетов на систему:

- «после боя» → debris + scar + optional refugees  
- «вспышка ОР» → quarantine + fog paint  
- «эвакуация» → refugee camp на соседе  

Пресеты в `content/.../consequences.json`.

---

## 4. Туман войны (кисть + reveal)

### 4.1 Проблема as-is

Сейчас видимость — **список систем** (`owner` + `visibleToFactionIds` + своя флота/легион). Невидимое вырезается из payload. Кисти нет; постройки почти не участвуют.

### 4.2 Целевая модель

Два механизма без «лжи»:

1. **Fog mask** — геометрическое «закрыто» на карте (кисть мастера).  
2. **Reveal** — условия, которые пробивают mask.

```
система/клетка видна фракции F  ⇔
  faction.fullMapVision
  ИЛИ  NOT in fogMask[F]
  ИЛИ  выполняется хотя бы один reveal-источник
```

У игрока закрытая зона **сливается с фоном стола** (предпочтительно) или системы в зоне не отдаются в `/view` — тот же UX «пустой космос».

### 4.3 Хранение mask

Старт (практично):

- кисть красит **системы** (и опционально соседние в радиусе) → `fogHiddenSystemIds[factionId]: string[]`  
  **или**
- грубая **сетка** world-cell → bitset на фракцию.

Рекомендация v1: **по системам** + радиус кисти «захватить соседей в R world units». Сетку добавить, если кисть по пустому космосу станет нужна.

Мастер: инструмент Fog Brush — paint / erase для выбранной фракции (или «все кроме fullMapVision»).

### 4.4 Reveal-источники (content)

| Источник | Правило (настраивается в content) |
|----------|-----------------------------------|
| Свои системы | сама система + `revealHops` или `revealRadius` |
| Свой флот / легион | система стоянки + малый радиус; пока юнит здесь |
| Постройка (обсерватория, маяк, реле) | радиус / hops от планеты |
| Столица / хаб-тег | больший радиус |
| Intent «разведпатруль» | открыть систему навсегда или на N ходов (без фейков — просто open) |
| GM erase | сюжет |

`fullMapVision` (Белатор и др.) — mask игнорируется.

### 4.5 Пересчёт

- при `processTurn` и при apply move;  
- при изменении построек;  
- сразу после кисти GM.  

Открытие **навсегда** (сняли mask или поставлен permanent reveal flag на системе) vs **временный** reveal от флота — различать в данных:

```json
{
  "systemId": "sys_…",
  "permanentRevealBy": ["fac_a"],
  "ephemeralReveal": [{ "factionId": "fac_b", "untilTurn": 15, "reason": "fleet" }]
}
```

Эфемерный reveal не требует «устаревания разведки как механики лжи» — просто условие пропало → снова mask, если mask ещё есть.

### 4.6 API / UI

- Master: fog brush tool + preview как сейчас `showFogPreview`, но от mask.  
- Player: не видит закрытое (filter payload).  
- Content: `rules.fog` + building/ship `reveal` поля.

---

## 5. Бой: Engagement и типы юнитов

### 5.1 Зачем

В лоре/Артеме много кораблей и пехоты со статами. В GMap сейчас флот = ярлыки типов, легион = одно `strength`. Бой должен **читать состав**, иначе типы бессмысленны.

### 5.2 Три театра

| theater | Участники | Якорь |
|---------|-----------|--------|
| `space` | флот vs флот | система |
| `ground` | легион vs легион | система / планета |
| `assault` | флот → мир (+гарнизон) | система + `planetId` |

### 5.3 Engagement (сущность)

```json
{
  "id": "eng_…",
  "theater": "space",
  "systemId": "sys_…",
  "planetId": null,
  "turnCreated": 12,
  "status": "commit",
  "sides": [
    {
      "factionId": "fac_a",
      "fleetIds": ["fleet_1"],
      "legionIds": [],
      "stance": "assault",
      "locked": false,
      "reserve": []
    },
    {
      "factionId": "fac_b",
      "fleetIds": ["fleet_9"],
      "legionIds": [],
      "stance": "hold",
      "locked": true,
      "reserve": []
    }
  ],
  "result": null
}
```

Статусы: `contact` → `commit` → `resolved` → `aftermath_done`.

**Defaults v1 (рекомендация):**

- несколько флотов одной стороны в системе → **один** стек стороны;  
- resolve в суточный тик; early resolve если оба `locked` и `rules.combat.allowEarlyResolve`;  
- дипломатия `war` + вход в систему с врагом → авто-contact;  
- бомбардировка без десанта — урон инфраструктуре/популяции, **без** смены владельца;  
- захват планеты — только успешный assault с ground-составом;  
- отступление — назад по `route[0]` или случайный дружественный/нейтральный сосед.

### 5.4 Content: корабли и пехота

Легионы переводятся на composition (как флоты):

```json
{
  "id": "legion_12",
  "composition": [
    { "defId": "unit.line_infantry", "count": 6, "hp": 100 },
    { "defId": "unit.breach_cadre", "count": 2, "hp": 100 }
  ]
}
```

Профиль def:

```json
{
  "id": "ship.corvette",
  "roles": ["screen"],
  "stats": {
    "damage": 8,
    "armor": 10,
    "shields": 5,
    "hp": 40,
    "accuracy": 60
  },
  "targeting": "screen_first",
  "theaterMult": { "space": 1, "assault": 0.3, "ground": 0 },
  "reveal": { "radius": 80 }
}
```

```json
{
  "id": "unit.breach_cadre",
  "roles": ["assault", "infantry"],
  "raceId": "race_belator",
  "stats": { "damage": 22, "defense": 14, "hp": 100, "speed": 6 },
  "targeting": "garrison_first",
  "theaterMult": { "ground": 1, "assault": 1.2, "space": 0 }
}
```

### 5.5 Роли (движок знает мало глаголов)

**Космос:** `screen`, `line`, `capital`, `carrier`, `support`, `bombard`  
**Земля:** `infantry`, `assault`, `garrison`, `armor`, `psi`, `support`

Matchups: `content/core/combat_matchups.json` (role×role → mult).

### 5.6 Resolve (кратко)

1. Собрать composition сторон (минус reserve).  
2. Применить stance mult + ModifierStack + **расовые** combat effects.  
3. Построить профиль силы по ролям.  
4. Применить matchup-таблицу.  
5. Нанести потери по `targeting` (порядок съедания групп).  
6. Определить исход: win / loss / retreat / pyrrhic.  
7. Assault: раунд orbit → раунд landing (или два связанных engagement).  
8. Aftermath: scar, POI-пресет, journal с **потерями по типам**.

Позы commit (AP): `hold` | `assault` | `skirmish` | `retreat` | `bombard` — стоимость в `intents.json` / `rules.combat`.

### 5.7 Чего нет в v1 боя

- клеточная тактика;  
- ручной выбор каждой цели каждого корвета;  
- многодневные «осады» без отдельного дизайна (осада = повтор engagement на следующих тиках при hold).

---

## 6. Расы: бафы, дебафы, совместимость

### 6.1 As-is

`Race { id, name }`, на планете `raceComposition: { raceId, percent }[]`. Бафов нет.

### 6.2 Целевая модель

Раса = content def с traits → **те же effects**, что законы/налоги/здания.

```json
{
  "id": "race_belator",
  "name": "Белаторцы",
  "tags": ["imperial", "disciplined"],
  "traits": [
    {
      "id": "trait.belator.discipline",
      "effects": [
        { "effect": "stat_mult", "args": { "stat": "defense", "mult": 1.1 } },
        { "effect": "upkeep_flat", "args": { "resource": "currency.supply", "amount": 1 } }
      ]
    }
  ],
  "habitability": {
    "rocky": 1.0,
    "desert": 0.8,
    "ocean": 0.9,
    "toxic": 0.2,
    "ice": 0.6
  },
  "growth": {
    "baseRate": 0.012,
    "crowdPenalty": 0.4
  },
  "xenorelations": {
    "race_synth": -0.15,
    "race_human": 0.05
  }
}
```

### 6.3 Где применяются расовые effects

| Контекст | Как считать |
|----------|-------------|
| Планета / экономика | взвесить traits по `percent` состава (или по доминирующей расе ≥50%) |
| Рост населения | `growth.baseRate` × habitability × xenorelations на планете |
| Легион / флот | если unit def имеет `raceId` — его combat traits; иначе раса доминирует на мире-источнике найма |
| Законы | закон может давать `race_preference` / штраф к чужим расам через effects |

**Правило мягкости:** расовые дебафы режут эффективность и рост, не запрещают существование (кроме явного карантина/изгнания через intent/GM).

### 6.4 Мультирасовые миры

- `xenorelations` между присутствующими расами → модификатор `stability` / `growth` / `production_mult`.  
- Сильный негатив → риск эмиграции (см. §7) или POI «волнения».  
- Политика фракции (закон «интеграция» / «сегрегация») меняет эти числа через ModifierStack, а не отдельным симулятором.

### 6.5 Новые effects (расы / популяция)

| effect | Назначение |
|--------|------------|
| `pop_growth_flat` | +/− абсолютный прирост / ход |
| `pop_growth_mult` | множитель роста |
| `pop_cap_flat` | лимит населения планеты |
| `stability_add` | стабильность мира (бунт/миграция) |
| `habitability_mult` | множитель приживаемости |
| `race_output_mult` | производство от доли расы |
| `recruit_cost_mult` | цена найма unit с `raceId` |

Все идут в общий словарь effects (doc №1 §7) + этот список.

---

## 7. Население: рост и убыль

### 7.1 Зачем

Население уже есть на планетах (`population`, `raceComposition`). Без тиковой динамики беженцы, голод, штурмы и расовые черты не к чему привязать. Население — **медленный слой**, не драйвер каждого клика.

### 7.2 Единицы и масштаб

- Хранить `population` как число (как сейчас); для баланса трактовать как **условные тысячи** или абстрактные «поп-единицы» — зафиксировать в `rules.population.unitLabel`.  
- UI: округление; тик пишет целые после `floor`.  
- Не симулировать каждого жителя.

### 7.3 Ёмкость мира (cap)

```
popCap = baseCap(planetType, size?) 
       + Σ building pop_cap_flat 
       + colonyType bonus
       × habitability_mult(dominant races, climate)
```

Сверх cap → `overcrowd`: рост падает / убыль / эмиграция.

### 7.4 Формула роста за тик (на планету)

```
natural = population * baseGrowth(races weighted)
        * habitability
        * supplyFactor          // еда/обеспечение фракции или локально
        * stabilityFactor
        * pop_growth_mult
        + pop_growth_flat

migration = immigration - emigration   // см. ниже

delta = natural + migration + eventDelta   // бой, GM, карантин

population' = clamp(population + floor(delta), 0, ∞)
```

Затем пересчёт `raceComposition` (нормировать percent = 100).

### 7.5 Факторы роста (+)

| Фактор | Источник |
|--------|----------|
| Базовый rate расы | `races.json` growth.baseRate |
| Жильё / residential / habitat | buildings → `pop_cap` + слабый growth |
| Farm / supply OK | `supplyFactor` ≥ 1 |
| Стабильность высокая | законы, отсутствие войны на системе |
| Гумкоридор / интеграционный лагерь | immigration inbound |
| Мягкий климат × раса | habitability |

### 7.6 Факторы убыли (−)

| Фактор | Источник |
|--------|----------|
| Голод / supply Empty|Low | `supplyFactor` < 1 → убыль; POI голод |
| Overcrowd | population > popCap |
| Карантин / эпидемия | POI effects `pop_growth_mult` < 1 или flat убыль |
| Бомбардировка / штурм | aftermath combat → % потерь + беженцы |
| Война на системе / блокада | stability↓, supply↓ |
| Токсичный мир / низкая habitability | постоянный штраф |
| Эмиграция | см. §7.7 |
| Налоговый pressure высокий | слабый growth_mult (опционально) |

**Мягкость:** даже при Empty population не обязано обнуляться за один тик. `rules.population.maxLossPerTurn` (например 15% или floor по формуле) + journal. Обнуление — через катастрофу/GM/долгий кризис.

### 7.7 Миграция и беженцы

Связка с нарративными POI:

1. Мир в кризисе (голод, бой, карантин, negative xenorelation) копит `emigrationPressure`.  
2. При пороге: часть pop уходит → создаётся/усиливается POI `refugees` на соседней системе **или** на целевой «гумкоридор».  
3. Принимающий мир: `+immigration`, расход `currency.supply`, `stability` − пока нет лагеря/коридора.  
4. Intent/конвой может направить поток (AP + supply).

Так рост/убыль **читаются на карте**, а не только в таблице.

### 7.8 Состав рас со временем

На каждом тике после delta:

- прирост распределяется по расам пропорционально (rate_i × share_i), с бонусом к расам с лучшей habitability;  
- миграция может менять доли скачкообразно (беженцы одной расы);  
- ассимиляция v1 — **нет** (или очень слабый drift через закон); не приоритет.

### 7.9 Связь с экономикой и боем

| Слой | Связь |
|------|--------|
| Upkeep supply | `f(Σ population на мирах фракции)` + армии |
| Production | слабый `race_output_mult` × pop (не главный доход; главные — теги/здания) |
| Recruit | лимит найма легиона ~ pop / barracks; раса unit должна быть представлена на мире (или закон «иностранный легион») |
| Assault aftermath | −pop%, возможно смена composition, беженцы |
| Fog/reveal | население само по себе туман не открывает |

Население **не** заменяет metal/supply как главную валюту — это давление и нарратив + мягкий модификатор.

### 7.10 UI

- В System/Planet view: pop, cap, trend ↑↓, breakdown «почему».  
- Держава: суммарное pop, дефицит supply от pop, список кризисных миров.  
- Журнал тика: топ убылей/ростов и новые лагеря беженцев.

### 7.11 Порядок в processTurn

После apply intents / combat aftermath, **перед** финальным deficit:

1. combat pop events  
2. migration / refugees  
3. natural growth/decline per planet  
4. normalize raceComposition  
5. economy income/tax/upkeep (upkeep уже знает новое pop)  
6. fog recompute  

---

## 8. Инструменты ГМ (без развед-лжи)

Tier S для творчества (в рамках doc №2):

| Инструмент | Назначение |
|------------|------------|
| GM-only заметки на карте | стикеры, игрокам не видны |
| Доска открытых узлов + таймлайн/таймеры | «что важно за 30 сек» |
| Consequence brush | пресеты последствий (§3.3) |
| Fog brush | §4 |
| Журнал хода + фракционный брифинг | выход daily tick |
| Шаблоны систем / пресеты POI | скорость подготовки |

Не включать: фейковые метки, ложный владелец, устаревший intel как мету обмана.

---

## 9. Атмосфера и визуал (дозированно)

**Делать позже / дозированно:**

- map modes: политика / война / экономика / квест / GM draft;  
- слой врат;  
- шрам после боя;  
- stamp «Ход N»;  
- экспорт плаката;  
- preset `cinematic` (bloom и т.п.) **выключаемый**, не default на mobile.

**Не сейчас:** список из §2 (CRT, Three.js, …).

---

## 10. Новые content-файлы и эффекты

Добавки к скелету doc №1 (Приложение B):

```text
content/core/
  races.json                 # traits, habitability, growth, xenorelations
  units.json                 # пехота / наземные типы
  ships.json                 # расширенный combat-профиль
  combat_matchups.json
  combat_stances.json
  population_rules.json      # либо секция в rules.json
  pois.json                  # приоритетные маркеры
  consequences.json          # GM brush пресеты
  dynamic_layers.json        # фронт / рой (схема)
  fog_rules.json             # либо rules.fog
```

Новые intents (дополнение):

| intent | Назначение |
|--------|------------|
| `intent.combat_stance` | поза в Engagement |
| `intent.combat_lock` | подтвердить готовность |
| `intent.assault_planet` | начать/продолжить штурм |
| `intent.refugee_convoy` | направить беженцев / гумкоридор |
| `intent.scout_reveal` | разведка: permanent/ephemeral open системы |

---

## 11. Фазы внедрения (поверх A–F)

Сохраняем фазы doc №1; вставляем работы doc №2:

| Когда | Что из doc №2 |
|-------|----------------|
| **B+** | fog mask + brush + reveal от флота/владения (минимальный) |
| **C** | population tick + races traits в ModifierStack; связь supply↔pop |
| **C/D** | POI приоритета (беженцы, карантин, депо, пропаганда); refugees pipeline |
| **D** | ships/units defs с ролями; легионы → composition |
| **D/E** | Engagement space → ground → assault; aftermath + scars |
| **E+** | GM notes, timeline, consequence brush, briefing |
| **F / polish** | dynamic front/swarm layer; map modes; cinematic preset |

Зависимости: бой осмысленен после units/ships content; беженцы — после population; assault aftermath кормит population и POI.

---

## 12. Чеклисты приёмки

### Fog

- [ ] GM кистью закрывает зону — игрок фракции не видит системы там  
- [ ] Свой флот открывает систему (эфемерно или по rules)  
- [ ] Обсерватория/маяк открывает радиус  
- [ ] `fullMapVision` видит всё  
- [ ] Нет фейковых владельцев / устаревших «лживых» меток в дизайне

### Combat

- [ ] Флот с разным composition даёт разный journal потерь  
- [ ] Matchup screen vs carrier отличается от capital vs screen  
- [ ] Легион composition участвует в ground  
- [ ] Assault без десанта не даёт владение планетой  
- [ ] Early lock опционален и журналируется

### Races / population

- [ ] Две расы с разным `baseRate` на одинаковых мирах расходятся в pop за N тиков  
- [ ] Overcrowd и голод дают убыль в пределах `maxLossPerTurn`  
- [ ] Эмиграция создаёт/усиливает refugee POI  
- [ ] Расовый trait меняет combat или growth через ModifierStack (виден в breakdown)  
- [ ] Xenorelation на мультирасовом мире влияет на growth/stability

### Narrative

- [ ] Карантин реально режет вход или growth  
- [ ] Депо влияет на upkeep/атаки по rules  
- [ ] Consequence brush ставит ожидаемый набор тегов/POI

---

## 13. Открытые решения

Зафиксировать перед кодингом соответствующих фаз:

1. **Fog storage** — per-system set vs grid cells.  
2. **Reveal от флота** — только текущая система или радиус; permanent или ephemeral.  
3. **Population unit** — абстрактные поп-единицы vs «тысячи».  
4. **Growth speed** — медленный 4X (~1%/ход) vs ощутимый для short campaign (~3–5%).  
5. **Dominant race rule** — effects от доли ≥50% vs взвешенная сумма всегда.  
6. **Combat early resolve** — да/нет по умолчанию.  
7. **Retreat path** — route back vs any neighbor.  
8. **Bombardment** — бьёт только buildings, или ещё pop%, или оба.  

Рекомендации по умолчанию:

1. per-system + brush radius  
2. система стоянки + ephemeral, пока флот здесь; permanent через scout intent / GM / постройку  
3. абстрактные поп-единицы  
4. ~1–1.5%/ход база, кризисы заметнее  
5. взвешенная сумма по percent (честнее для мультирасовых)  
6. early resolve = да, если оба locked  
7. назад по route, иначе сосед  
8. buildings + pop% с `maxLossPerTurn` clamp  

---

## Приложение A — Сводка «что меняем относительно текущего кода»

| Область | Сейчас | Будет |
|---------|--------|-------|
| Fog | visibleTo + filter | mask + brush + reveal rules |
| Legion | `strength` | `composition[]` |
| Ship types | строковые ярлыки | defId + roles + stats |
| Combat | order arrow | Engagement + resolve |
| Race | id+name | traits + habitability + growth |
| Population | статичное поле | тиковый слой + миграция |
| POI | много глифов, мало механики | тег+effects; приоритетный пакет |
| GM | редактор карты | notes, timeline, consequence, fog brush |

## Приложение B — Манифест doc №2

> Карта остаётся доской. Туман — кисть и честный reveal. Бой — Engagement с ролями и потерями по типам. Расы и население — медленные модификаторы того же ModifierStack. Нарративные маркеры — контент, не симуляторы. Без развед-лжи и без тяжёлого cinematic по умолчанию.

---

*Конец amendments v1.0 — читать вместе с `CAMPAIGN_TABLE_SPEC.md` v1.1.*
