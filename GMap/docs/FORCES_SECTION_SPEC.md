# СИЛЫ — Спецификация раздела (Player View)

> Документ для реализации. Версия: **1.0** · Дата: **2026-08-05**  
> Статус: **переосмысление + roadmap**  
> Связан с: `UI_SYSTEMS_MASTER_SPEC.md`, `A6-combat-core`, `A7-card-battle`, `ECONOMY_SECTION_SPEC.md`

---

## 1. Цель

**Силы** — штаб боевой готовности: roster флотов/легионов, loadout состава (анимированные карты), превью боевого профиля и мост к карте / engagement / card battle.

| Слой | Назначение |
|------|------------|
| Силы | Loadout: состав, оснащение, резерв, готовность |
| Карта + FleetOrderRing | Приказы: ход / атака / stance |
| Автобой | Быстрый резолв того же `composition` |
| Card battle | Тактический розыгрыш тех же юнитов (не коллекционный deckbuilding) |

**Не входит:** производство (верфь/казармы → SystemCommand), дипломатия войны, полный боевой стол.

---

## 2. Парадигма

1. **Composition = колода боя.** Один источник для авто и карт.
2. **Жесты** как на карте: drag → зоны, long-press → оснащение, tap → детали.
3. **Action-at-source:** приказы остаются на карте; Силы готовят и показывают готовность.
4. **Ранг (veterancy)** — только из боёв. Металл не покупает ★.
5. **Оснащение** — главный усиливающий verb (`filledSlots` → `propertyCombatMult`).
6. **Анимированные карточки** сохраняются; семантика сближается с `CardBattleTable` (роль, keyword, energy).

---

## 3. Структура UI

### 3.1 Roster (обложки)

`FleetCover` / `LegionCover`:

- Stance / статус, система, число юнитов
- Role-bar (микс combat roles)
- Upkeep/ход (компактно)
- Badge «В БОЮ», если unit в open engagement
- CTA по клику → открыть колоду

### 3.2 Колода (loadout)

`ForcesDeck` open mode + `UnitCard` (CometCard):

| Зона / действие | Смысл |
|-----------------|--------|
| Оснащение | Модули со склада → слоты |
| Резерв | Вывести из этого флота (пул империи) |
| Утиль | Списать 1 ед. + refund (friction confirm) |
| Ремонт | Восстановить HP за металл (бывш. «Кузница» / покупка ранга) |
| Reorder / merge | Боевой порядок / стопки (подпись: порядок развёртывания) |

`ForceReadinessBar`: микс ролей, оценка колоды card battle (N карт, energy heavy), upkeep, CTA к engagement / столу.

### 3.3 Деталь карты

`CardDetailStrip`: статы с ветеранством, matchup strong/weak, keyword, HP, действия без «купить ранг».

---

## 4. Связность

| Откуда | Куда |
|--------|------|
| Наука `unit_upgrade` | Силы + highlight defIds |
| Силы | Карта (фокус системы) + FleetOrderRing |
| Силы | Open engagement / CardBattleTable |
| Силы | Экономика (upkeep hint → склад/supply) |
| Бой (auto/card) | Пишет потери + XP обратно в composition |

---

## 5. Данные

- `Fleet` / `Legion` + `ShipGroup` (`defId`, `count`, `hp`, `filledSlots`, `xp`, `level`)
- `economy.forceReserve`
- Engagements: `sides[].fleetIds` / `legionIds` (клиент должен их читать)
- Content: `ships.json` / `units.json` roles, slots, stats; `combat_matchups`; `economy_balance.forces`

---

## 6. Этапы

| Фаза | Содержание | Статус |
|------|------------|--------|
| A | Spec + readiness bar + engagement CTA + keywords на UnitCard | **done** |
| B | Кузница → Ремонт; сервер запрещает buy-level | **done** |
| C | Единый визуальный контракт Forces ↔ CBT (`CombatCardMeta`) | **done** |
| D | Резерв ↔ верфь/казармы; легионы без composition → warn | **done** |
| E | Deploy-order из колоды кормит hand/deck card battle | **done** |

---

## 7. Чеклист приёмки

- [x] Roster показывает role mix и «В БОЮ»
- [x] Открытая колода: readiness + ссылка на стол/engagement
- [x] Оснащение меняет бой (property matchups) — без регресса
- [x] Нельзя купить veterancy за металл
- [x] Ремонт чинит HP за балансный металл
- [x] UnitCard показывает роль / keyword / energy как в бою
- [x] Анимированные CometCard сохранены
- [x] Приказы по-прежнему с карты / ring
- [x] Резерв связан с верфью (CTA → SystemCommand produce)
- [x] Порядок колоды влияет на card battle deploy / opening hand