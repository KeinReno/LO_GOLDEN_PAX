# Аудит игровых данных GMap — 2026-08-18

> Охота по контенту + живому столу. **Шесть проходов**, тик/`processTurn` не гоняли.  
> Стол на момент съёмки: **ход 17**, ~978 систем, 35 держав, `tableRevision` ~630–631.  
> Этот файл — канон находок и план работ. Короткие STATUS-блоки проходов 1–4 ниже не дублировать.

Связанные спеки (не смешивать в одну правку):

- `DEPOSIT_ALIASES_SPEC.md` — русские имена залежей (40 имён). **`транзит-пошлина` туда не входила.**
- `SCIENCE_ORBIT_REDESIGN_SPEC.md` — UI науки, не каталог.
- Skill `tech-path-catalog` — заполнение 6 пустых RoleScore-путей.

Параллельные агенты **уже частично закрыли** (рабочее дерево, без коммита на момент аудита):

| Что | Где | Остаток |
|-----|-----|---------|
| Тик больше не применяет `catalogPending` (`production_mult` / `unlock_tech_tier`) | `techGrades.mjs`, `techUnlockRebuild.test.mjs` | Проверить, что в леджере не остались стабы и фейковые `tech.path.*_breakthrough` |
| Скрипт смывки стабов из `unlockedTechs` | `scripts/scrubCatalogPendingUnlocks.mjs` | Повторить на свежем леджере перед сессией |
| `logistics.depot` появился в `buildings.json` | content | 35 инстансов резолвятся; на пустых мирах Белатора депо всё ещё стоят без населения |
| UI-фильтр «модуль ≠ руда» | `resourceIndex.ts`, EmpireResourceStrip, MarketPanel, TradeColumn | Склейка в `contentLoader` жива; API/GM ledger ещё мешают |

---

## Как читать

- **P0** — ломает стол или экономику прямо сейчас.
- **P1** — живые id / бои / карта не сходятся с каталогом; игрок видит дыру.
- **P2** — контент или односторонние правила; чинить волной.
- **P3** — мусор, путаница имён, журнал. Не блокирует ход.

Слои: **код** · **каталог** · **живой стол** (`data/published.json`, ledger, engagements).

Не баг (не чинить «на всякий случай»):

- `colonyType: none` = пустой мир.
- `capital` ×2 нормализуется в `core`.
- Combo-техи из `tech_combos.json` резолвятся.
- Туман только у Карнеда/Белатора — задумано (`fullMapVision: false`); пустая маска = зрение от владения/флота + 1 хоп.
- Пеги мажоров совпадают с `faction_currency_bindings`.
- Координаты систем не свалены в кучу; гиперлинки на несуществующие id нет.
- Незаселённых обитаемых ничейных планет нет.
- Переполнения слотов относительно grade-капа нет.
- Квесты не указывают на мёртвые системы.

---

## Реестр находок

### P0 / P1 — живой стол

| ID | Суть | Слой | Доказ |
|----|------|------|--------|
| **AUD-01** | Карточный бой `eng_1785918557450_lo2a` в SYS-867 **не закрывается**. Режим `card`, раунд карт 6, счётчик тика **55 / max 3**. Сторона карт — UUID `64928514-…` (нет среди фракций). Флот Галлиана уже в SYS-861, флот Роя в SYS-867. Тик видит `cardBattle.status=active` и `continue` без таймаута. | стол + `engagements/resolveTick.mjs` | `data/engagements.json` status=active, mode=card |
| **AUD-02** | Автобой Теория-Док `eng_1786961627080_hf96`: Белатор vs Рой, раунд 2/3, стойки не locked, `requiresPlayerInput`. Должен автозакрыться на следующем тике; пока висит. | стол | тот же файл |
| **AUD-03** | Модули влиты в `map_resources` (`contentLoader` ~190). Public content = 86 руд + 20 модулей, ключа `modules` нет. Outfit завязан на смесь. Снять склейку без `modules` в `/api/content` — сломает экипировку. | код | `contentLoader.mjs`; `/api/content` |
| **AUD-04** | Дыры фильтра модулей: `GET /api/economy/resource-index`, `getResourcePoolLabels()`, GM ledger все stocks, серверный `slotResolver.buildResourceIndex`. Тик умеет писать `module_production` в склад. | код | `economyMisc.mjs`, `contentLoader.mjs`, `GmLedgerPanel` |
| **AUD-05** | 15 расовых id на планетах **нет в `races.json`** (252 доли): corinfad, heshah, sikuri, elanor, vendir, elanis, elatris, triumvis, lithoid, elacrin, eladon, bistier, korvun, taala, huchi. Те же id в intel `knownRaces` и `loyaltyMatrix`. | стол + каталог | published planets vs `races.json` (18 рас) |
| **AUD-06** | У мажоров `primaryRaceId = null` / нет `raceId`. Расовые замки науки, мнение, беженцы не от кого плясать. `data/race_states.json` → `"races": {}`. | стол | faction objects |
| **AUD-07** | 31/131 групп флота без корпуса: нет `ship.transport`; живые имена `разведчик`/`пси-крейсер`/… не бьются с каталогом из‑за **регистра**. Alias `транспорт→ship.transport` есть, живое имя другое. | стол + каталог | `ships.json`, `id-aliases.json` |
| **AUD-08** | `unit.assault` ×2 на столе — нет в `units.json`. | стол | units catalog |
| **AUD-09** | 130/131 групп с пустым `filledSlots` (флот без обвеса). | стол | fleets |
| **AUD-10** | 17 своих систем **без гиперлинков**: «Клык Налётчиков» (пираты: планеты+станция+флот заперт) и куст ОР SYS-602…SYS-621. Pathfinding ходит по `world.links` (неориентированно). | стол | `pathfinding.neighborIds` = [] |
| **AUD-11** | 127 станций без `factionId` (102 ничейные, 25 в чьих-то системах). Шахт 128, **36 без фракции**, из них **26 с поясом**. Тик: `st.kind==="mining" && st.factionId===factionId` — пояс молчит. | стол + `flowBreakdown.mjs` | stations |
| **AUD-12** | 8 планет Белатора: **pop=0**, `colonyType: none`, но стоят `building.mine` / `logistics.depot` / `energia.solar_catcher` (Кси, Кастор, Дубхе, Денеб, Пи, Ро, Велентис×2). | стол | planets |
| **AUD-13** | Здания вне биома (гейты только на *новое* строительство): газовая скважина на Алиоте (rocky/cold); гидрогеотермалка на Кодекс-Полисе, Интеграл-Харте, Караванном Хабе, Антимат-Тени, Кристалл-Антимате. Тик добычу не снимает. | стол | `biome_restrictions` vs planet type/climate |
| **AUD-14** | Три планеты `type: terrestrial` (нет в `PlanetType`): Симбиоз-Колония, Кодекс-Полис, Интеграл-Харт. Население 13–30k. Биом-матч их не узнаёт как rocky. | стол | `types.ts` PlanetType |
| **AUD-15** | 8 систем с залежью **`транзит-пошлина`** (не id, не alias). Сид хотел `map.trade_value`. Тик `lookupMapResource` → skip. Корвун'тай, Коринфад, ХэШах + ничейные стыки. | стол | `sys.resources`; нет в `id-aliases.json` |
| **AUD-16** | Торговля Карнед–Амальфея: ребро `world.diplomacy` есть; у Карнеда договор есть, **у Амальфеи нет** (у неё trade только с Белатором). Эффекты читаются из `faction.diplomacy.treaties`. | стол | treaties vs edges |
| **AUD-17** | В `intents.json` нет `intent.produce_ship`, `produce_unit`, `rename_system`, `rename_planet`, `fill_slot`. Код их пишет; клиентский AP = **0**. Живые заявки этих типов есть. | каталог + код | `intents.json` vs orderEngine |
| **AUD-18** | 321 здание без `buildingId` (fallback kind+zone). | стол | planet buildings |
| **AUD-19** | 107 систем без планет (24 с владельцем): беженские хабы vs пустые COR-* клеймы. | стол | systems |
| **AUD-20** | Белатор laborGap 98; 51 здание на outpost pop=1000. NPC-мажоры ~500k часто только жильё; Корвун 38/38 месторождений закрыты гейтом. | стол / баланс | census vs labor |

### P1 / P2 — каталог и наука

| ID | Суть | Слой |
|----|------|------|
| **AUD-21** | 6/8 RoleScore-путей без живого breakthrough (`structural`/`energy`/`mobility`/`cognitive`/`biological`/`exotic`). Кластеры structural/energy ссылают несуществующие doctrine. | `tech_paths.json` |
| **AUD-22** | ~387/608 техов `catalogPending`. 35 стабов открывают фейк `catalog.*_scan`. 25 инвертированных эр (era 2 → `tech.asteroid_mining` era 3; era 3 → `tech.anomaly_tapping` era 4). | `technologies.json` |
| **AUD-23** | Хиноварь (`map.cinnabar`) свойство `lithogenesis` — нет в `economy_schema.properties`. | каталог |
| **AUD-24** | 4 мёртвых ингредиента рецептов (есть живые `recipe.live_*` дубли). | `tech_recipes.json` |
| **AUD-25** | `unit.armor_cadre` primary role `vehicle` — нет в `combat_matchups` (нейтральный ×1). Лишние роли в матчапах: militia, emplacement, fortification. | units + matchups |
| **AUD-26** | `spaceObjects` на системах = смесь POI-меток и каталога экономики. 346 тегов есть в `space_objects.json` (тик применяет). **509 только POI** (refugees ×356, outpost, beacon…) — экономика skip. **36× `star`** нет ни в POI, ни в космо-каталоге. | стол + два JSON |
| **AUD-27** | FX: 25 миноров без `faction_currency_bindings`. Ханство на столе есть. Привязок на мёртвые фракции нет. | стол + bindings |

### P2 / P3 — мусор времени, имена, суд

| ID | Суть |
|----|------|
| **AUD-28** | Заявки/интенты/диппредложения/суд/квесты/журнал с ходами **19, 20, 23, 24, 59, 63, 66** при доске **17**. `yearlyQuestRolls`: Белатор 23, Карнед 19 → `hasRolledYearlyQuests` на ходе 17 = false, можно бросить ещё раз. |
| **AUD-29** | Диппредложения от UUID `64928514-…` (нет на столе) к Северному Рою, ход 24. Тот же UUID в карточном бое AUD-01. |
| **AUD-30** | `published.orders`: resolved `attack_system` хода 59, from=to одна система («здесь»). |
| **AUD-31** | Два «Эхо 3» (пираты, далеко), две «Ржавчина-Крак», две «Осколок-Риф». |
| **AUD-32** | Суд: 21 NPC, **33/35** держав без двора. `courtEvents` с ходов 19/24. |
| **AUD-33** | `table-meta`: исторический `cron_fail: ensureAllFactions is not defined` (потом catch-up ok). GM-интервенции с пометкой ход 59. |

---

## Корни (не плодить пластыри)

1. **Склейка модулей и руд** — одна точка: `contentLoader` merge. Фильтры в UI — симптомы. Нужен отдельный ключ `modules` в public content, затем фильтры можно сузить.
2. **Выдача каталога в леджер** (`grantTechsTurn20` и аналоги) — не пускать `catalogPending` / missing id. Тик уже skip; стол надо держать чистым.
3. **POI vs `space_objects`** — один массив тегов, два каталога. Либо развести поля, либо мапить POI→эффект явно.
4. **Расы стола ≠ `races.json`** — 15 lore-id живут на планетах/интеле/loyalty, каталог на 18 других. Либо дописать расы, либо алиасы, либо смена id на столе.
5. **Мусор будущих ходов + UUID игрока как factionId** — один класс: тест/catch-up писал в live store. Чистить пакетом, не по файлу.

---

## План работ

Правила: не коммитить без просьбы; не `processTurn` как тест; не гонять параллельно два агента по `contentLoader` / `ResearchPanel` / `resourceIndex`. После каждой волны — узкий proof (таблица ниже), не «tsc зелёный = стол живой».

### W0 — Координация (до кода)

- [ ] Зафиксировать владельца склейки модулей (AUD-03/04). Второй агент **не** трогает `contentLoader` merge и outfit, пока нет контракта: `GET /api/content` отдаёт `modules` **и** `map_resources` без пересечения id.
- [ ] Повторить `scrubCatalogPendingUnlocks` на текущем ledger; сверить counts vs STATUS «Белатор 130→34…».
- [ ] Не заполнять 6 breakthrough в том же PR, что чистка стола.

### W1 — Остановить порчу стола (1 сессия)

Цель: бои и время не врут.

| # | Задача | ID | Proof |
|---|--------|----|-------|
| 1.1 | Закрыть/отменить zombie card-battle SYS-867; таймаут для `mode=card` если сторона не фракция или флоты разъехались | AUD-01, AUD-29 | engagements: 0 active card с UUID; следующий tick не инкрементит мёртвый бой |
| 1.2 | Решить Теория-Док: дождаться авто (раунд 3) **или** GM advance | AUD-02 | status resolved/cancelled |
| 1.3 | Пакетная чистка меток хода > `meta.turn`: intents, player-orders, diplo-offers, courtEvents, yearlyQuestRolls (сбросить на 17 или null) | AUD-28–30 | grep по data/*.json: нет createdTurn>17 у pending |
| 1.4 | Guard: `gmGrantTech` / grant-скрипты не пишут catalogPending и missing tech id | AUD-22 хвост | `techUnlockRebuild` + grant dry-run |

**Не делать в W1:** массовый rewrite published systems.

### W2 — Чтобы id резолвились (каталог + стол)

Цель: корабли, войска, интенты, расы перестают быть «пустыми строками».

| # | Задача | ID | Proof |
|---|--------|----|-------|
| 2.1 | `ship.transport` + case-insensitive / alias живых имён (разведчик, катер, рейдер, эскорт, торговец, Рагнарек, носитель-спор, пси-крейсер) | AUD-07 | 0 unresolved fleet groups |
| 2.2 | `unit.assault` в `units.json` или remap живых инстансов | AUD-08 | validate units / live resolve |
| 2.3 | Пять интентов в `intents.json` с честным AP | AUD-17 | клиент AP ≠ 0; smoke order |
| 2.4 | Решение по 15 ghost-расам: дописать в `races.json` **или** alias на 18 канонических **или** переписать planet composition | AUD-05 | 0 planet raceId вне каталога |
| 2.5 | Проставить `primaryRaceId` мажорам (Белатор, Турон, Федерация, Рой, Карнед, Амальфея…) | AUD-06 | faction.primaryRaceId not null |
| 2.6 | `unit.armor_cadre` role → существующий combat role **или** строка в matchups | AUD-25 | нет `?? 1` на этом юните |

### W3 — Экономика и постройки

Цель: то, что на карте, даёт (или честно не даёт) доход.

| # | Задача | ID | Proof |
|---|--------|----|-------|
| 3.1 | Развести `modules` / `map_resources` в public content; закрыть AUD-04 | AUD-03, AUD-04 | strip без пушек; outfit жив; resource-index без `module.*` |
| 3.2 | Alias `транзит-пошлина` → `map.trade_value` (или смена 8 систем) | AUD-15 | 0 unknown sys.resources |
| 3.3 | Станциям-шахтам с поясом проставить `factionId` (владелец системы или ничейные → не считать шахтой) | AUD-11 | 26 поясов либо добывают, либо kind≠mining |
| 3.4 | Нелегальный биом: снести / переместить / оставить с пометкой GM. `terrestrial` → `rocky` | AUD-13, AUD-14 | biome gate + live 0 off-biome extract.* |
| 3.5 | Пустые pop=0 шахты Белатора: снести здания или дать census/labor | AUD-12, AUD-20 | нет extract на pop=0 |
| 3.6 | Двусторонний trade Карнед–Амальфея (или убрать ребро) | AUD-16 | оба `treaties` + edge согласованы |
| 3.7 | `lithogenesis` в schema **или** убрать с хиновари | AUD-23 | validate schema |
| 3.8 | `buildingId` на 321 здании (проставить из kind) | AUD-18 | опционально, после 3.4–3.5 |

### W4 — Карта и теги

| # | Задача | ID | Proof |
|---|--------|----|-------|
| 4.1 | Гиперлинки: пиратский Клык + куст ОР SYS-602…621 | AUD-10 | neighborIds > 0 у всех owned stellar |
| 4.2 | Контракт `spaceObjects`: POI отдельно от economy objects; решить `star` и `refugees` | AUD-26 | нет тега, который тик «тихо» скиппает, без пометки в pois.json |
| 4.3 | Пустые системы без планет: коридор vs клейм — kind/POI, не «звёздная система» | AUD-19 | GM не видит 24 «столицы» без миров |
| 4.4 | Уникальные имена Эхо 3 / Ржавчина-Крак / Осколок-Риф | AUD-31 | unique system.name |

### W5 — Контент науки (отдельный агент, skill `tech-path-catalog`)

| # | Задача | ID | Proof |
|---|--------|----|-------|
| 5.1 | 6 breakthrough + кластеры (не doctrine-призраки) | AUD-21 | `validate:tech` без WARN путей; кнопка Прорыв не 0 |
| 5.2 | Снять/починить inverted-era catalogPending; фейк `catalog.*_scan` | AUD-22 | auditPrereqs 0 inverted |
| 5.3 | Мёртвые recipe ingredients → live id | AUD-24 | `validate:recipes` без мёртвых ссылок |

Не мешать с orbit-редизайном UI (`ResearchPanel.tsx`).

### W6 — Хвост (когда стол стабилен)

- AUD-09 filledSlots: либо стартовый обвес, либо UI «пустой слот» честно.
- AUD-27 FX bindings для миноров — только если миноры торгуют.
- AUD-32 двор для мажоров без NPC.
- AUD-33 почистить tickAlerts / не чинить мёртвый `ensureAllFactions` если функция уже есть.
- AUD-20 labor/census — отдельный баланс, не в том же PR что id-фиксы.

---

## Порядок агентов (чтобы не драться)

```
W1 стол/бои     →  один агент, data + engagements timeout
W2 id           →  content + published remap; не трогать contentLoader merge
W3.1 modules    →  ТОЛЬКО владелец outfit/resourceIndex
W3.2–3.8 eco    →  после или параллельно W2, не параллельно W3.1
W4 карта        →  published.links / spaceObjects
W5 наука        →  technologies/tech_paths; не ResearchPanel
W6 хвост        →  по остатку
```

---

## Команды проверки (из `GMap/`)

Не заменять живую проверку боёв.

```
npm run validate:tech
npm run validate:recipes
npm run validate:races
npm run lint:balance
npm run smoke
```

Узкие тесты по волне: `techUnlockRebuild`, `techModifierEffects`, `depositExtract`, `resourceIndex.test.ts`, `forceRecruit`.

Живой стол: **не** вызывать `processTurn` / `runEconomyTick` как proof. Сверять `data/engagements.json`, `ledger.json`, `published.json` скриптом или GM.

---

## Вне скоупа этой охоты

- UI науки orbit / RoleScore-бейджи (другие треки).
- Player `/view` auth/OD/fog (отдельный hunt).
- 40 русских имён залежей — `DEPOSIT_ALIASES_SPEC.md` (заявлен 0 unresolved после коммита aliases; **кроме** AUD-15).
- Заполнение всего `catalogPending` каталога (W5 — только сломанные гейты и прорывы).
