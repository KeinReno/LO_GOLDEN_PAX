# Базовый баланс — принципы и стартовый набор

> SoT кривых: `content/core/economy_balance.json`  
> Генераторы: `scripts/buildBuildings.mjs`, `scripts/buildUnitsShips.mjs`, `scripts/buildStations.mjs`

## 1. Принципы

1. **Один язык трат.** Постройки / колонии / флот / легионы / станции списывают `metal` + `supply` (legacy bridge). Цепочка A–F (`extracta`…`cognitio`) — производство, потоки, наука, налоги.
2. **Ровный рост тира.** `metalByTier` ≈ +40–50% за шаг; силы = `metalByTier × shipCostMult|unitCostMult`, supply = metal × `supplyRatio`.
3. **Свободный порог.** `freeBuildTier = 3`: здания T1–T3 без tech-gate; выше — `techTiers[category] + 1`.
4. **Ранний force-gate.** Казарма ≤ T2, космопорт ≤ T3, верфь ≤ T3 — старт «1 корвет / милиция» укладывается в free tier + стартовые склады.
5. **Два пула ОД.** Империя — политика/колонии; силы — приказы и производство юнитов (`rules.ap` / `forceAp`).
6. **Роли, не спам id.** Базовый набор = одна generic-единица на роль×тир; расовые `raceVariants` и pack flavor поверх.
7. **Станции — системная инфраструктура.** Контент в `stations.json`; цены из `economy_balance.forces.stations`. Не дублировать хардкодом.
8. **Компромисс.** Больше damage/hp → выше upkeep_slots / force OD; specialty (psi/swarm) требует exotic properties или расу.
9. **Tech не хардкодит id юнитов.** Здания открываются тиром категории; производство — наличием shipyard/barracks (+ будущий cap по тиру верфи).

## 2. Ресурсы

| | ID | Роль |
|---|---|---|
| A | extracta | Сырьё |
| B | materia (+ metal bridge) | Материалы / стройка |
| C | industria | Пром / верфи |
| D | energia (+ supply часть) | Энергия / оружие |
| E | bios (+ supply часть) | Население / экипаж |
| F | cognitio | Наука / алхимия |

## 3. Лестница зданий (ядро)

| ID | Tier | Kind | Зона | Зачем |
|---|---|---|---|---|
| residential, farm, mine, lab | 1–3 | eco | surface | Старт RPS |
| barracks | 2 | barracks | surface | Легионы |
| spaceport | 3 | spaceport | orbital | Орбита / торговля |
| shipyard | 3 | shipyard | orbital | Флот |
| defense, habitat, capitol… | 4+ | mid | — | После tech |
| mega.* | 8–9 | late | — | Фракционный late-game |

Полный каталог (~54) генерируется `buildBuildings.mjs` по категориям A–F.

## 4. Лестница кораблей (baseline)

| Tier | ID | Roles | Ориентир metal* |
|---|---|---|---|
| 1 | `ship.scout` | screen | ~13 |
| 2 | `ship.patrol` | screen | ~18 |
| 3 | `ship.corvette` | screen | ~24 |
| 4 | `ship.frigate` | screen, line | ~30 |
| 5 | `ship.destroyer` | line | ~38 |
| 6 | `ship.cruiser` | line | ~48 |
| 7 | `ship.battleship` / `ship.carrier` | capital / carrier | ~59 |
| 7 | `ship.psi_cruiser` | line, psi | specialty |
| 8 | `ship.dreadnought` | capital, bombard | ~72 |
| 9 | `ship.black_iron` | capital | ~86 |

\* `round(metalByTier × 1.6)` — runtime `forceEconomy.mjs`.

## 5. Лестница легионов (baseline)

| Tier | ID | Roles |
|---|---|---|
| 1 | `unit.militia` | infantry, militia |
| 2 | `unit.generic_line` | infantry |
| 3 | `unit.garrison` | garrison, infantry |
| 3 | `unit.planetary_gun` / `unit.bunker` | garrison (stationary) |
| 4 | `unit.breach_cadre` | assault, infantry |
| 4 | `unit.shield_dome` | garrison (stationary) |
| 5 | `unit.armor_cadre` | vehicle, assault |
| 6 | `unit.heavy_legion` | infantry, line |

Pack flavor (`golden_pax`): belator_guard, swarm_skitter, psi_cadre, specialty ships — поверх core, со слотами.

## 6. Станции (система)

| kind | Имя | AP | metal/supply | Назначение |
|---|---|---|---|---|
| mining | Добывающая | 1 | 24/10 | Сырьё/металл системы |
| military | Оборонная платформа | 2 | 36/15 | Защита орбиты |
| science | Научная | 1 | 22/9 | Cognitio / разведданные |
| trade | Торговый узел | 1 | 24/10 | Рынок / logistics |
| relay | Релейный маяк | 1 | 20/8 | Дальность / fog |

Лимит: 8 на систему (`systemActions`).

## 7. Старт (цель playtest)

Склады из `economy_balance.start`. За 1–2 хода:

- 1–2 outpost + residential + mine + farm **или**
- 1 outpost + barracks → militia **или** spaceport+shipyard → scout/corvette

## 8. Команды

```bash
npm run balance:buildings
npm run balance:forces
npm run balance:stations
npm run balance:all   # buildings + tech + forces + stations + lint/validate
```

## 9. Card battle (economy)

Якорь: `rules.cardBattle` + `economy_balance.cardBattle`.

| Параметр | Цель |
|---|---|
| energy / rounds / hand | 4 / 4 / 4 — короче бой при дешёвой атаке (1 ОД + 1 ОД сил) |
| cognitio на победу | 6 + style≤3 → **≤9** (<1 era1 research) |
| metal scrap | 1× потерянные юниты, floor 2 → большие бои **< корвет (24)** |
| intelBump | 6 (не max intel с одного боя) |

Trophies только в card-mode; auto-resolve без добычи.