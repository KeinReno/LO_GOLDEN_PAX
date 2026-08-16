# Agent B5 — Пути технологий (пилот: 🛡 Структурный и ⚡ Энергетический)

> Ты работаешь над проектом LO_GOLDEN_PAX / GMap. Читай спецификацию целиком, выполняй по порядку.

## Принципы (нерушимые)

См. `../PRINCIPLES.md`. **Пункт 12 — только 2 пути в этой задаче, не 8.**

## Контекст

- `GMap/docs/ECONOMY_TECH_REDESIGN_SPEC.md` §10, §10.1 — полное обоснование.
- Сейчас 428 технологий в `technologies.json` — плоский общий пул, только 6 записей имеют `raceLock`/
  `factionTraitLock`. Эта задача не трогает существующие 428 — добавляет НОВЫЙ, отдельный слой (path-gated
  техи) поверх, не переписывает старое.
- `src/state/techGate.ts` — клиентское зеркало `server/techActions.mjs`, оба читают `eco.techTiers`/
  `eco.unlockedProperties`. Расширяешь этот же контур новым полем `unlockedPaths`, не создаёшь параллельный.
- Раса даёт **стартовую аффинити, не жёсткий замок** (принцип "без дебафов" — раса дешевле исследует свой
  путь, но не заблокирована от остальных).

## Зависимости

**Требует B2** (RoleScore и `role_milestones.json` для structural/energy должны существовать).

## Файлы

- `GMap/content/core/tech_paths.json` — создать (2 записи)
- `GMap/content/core/technologies.json` — добавить 2 Breakthrough-технологии + 2-4 сигнатурных технологии
- `GMap/content/core/races.json` — добавить мягкое поле `pathAffinity?: string[]` (не обязательное для всех
  17 рас сразу — минимум для Карнед→structural, любая энергетически привязанная фракция можно оставить пустым)
- `GMap/src/state/techGate.ts` + `GMap/server/techActions.mjs` — расширить
- `GMap/server/normalizeWorld.mjs` — миграция

## Цепочка задач

### T5.1. `content/core/tech_paths.json`

```json
{
  "path.structural": {
    "id": "path.structural",
    "role": "structural",
    "name": "Структурный путь",
    "breakthroughTechId": "tech.path.structural.breakthrough",
    "milestoneRef": "role_milestones.json#structural"
  },
  "path.energy": {
    "id": "path.energy",
    "role": "energy",
    "name": "Энергетический путь",
    "breakthroughTechId": "tech.path.energy.breakthrough",
    "milestoneRef": "role_milestones.json#energy"
  }
}
```

### T5.2. Breakthrough-технологии в `technologies.json`

Добавь `tech.path.structural.breakthrough` и `tech.path.energy.breakthrough` по существующему шаблону
записи технологии (`category`, `era`, `cost`, `effects`, `prerequisites`). Условие доступности —
**не через `prerequisites`** (это для обычных теховых цепочек), а через новую проверку: RoleScore этой роли
≥ порог из `role_milestones.json` (B2). Если у тебя нет доступа к серверной проверке произвольных условий
на техе — добавь минимальный `unlockCondition: { roleScore: { role: "structural", min: 5000 } }` в саму
запись технологии и научи `techActions.mjs` его проверять при попытке начать исследование.

Эффект Breakthrough-технологии: `{ "effect": "unlock_path", "args": { "pathId": "path.structural" } }` —
новый тип эффекта, добавь в `effects.json` по аналогии с `unlock_property`/`unlock_tech_tier`.

### T5.3. Сигнатурные технологии (2-4 штуки на пилотный путь)

По таблице §10.1 — минимум по 2 на путь, например `tech.structural.reinforced_hulls`,
`tech.structural.fortress_doctrine` для 🛡; `tech.energy.overcharge_reactors`,
`tech.energy.fuel_synthesis` для ⚡. Каждая — `prerequisites: ["tech.path.structural.breakthrough"]` (обычный
механизм prerequisites уже умеет это гейтить, доп. код не нужен). Эффекты — реальные, не заглушки (например
`production_mult` на structural-ресурсы, или `unlock_tech_tier` повыше).

### T5.4. `pathAffinity` в `races.json`

Добавь опциональное поле расе (минимум Карнед → `["structural"]`). Эффект аффинити: скидка на cost
Breakthrough-технологии своего пути (например `×0.7` через существующий `research_cost_mult`-подобный эффект,
уже есть в словаре из волны A1 — проверь `effects.json`). Расы без аффинити — без скидки, но без ограничения
доступа.

### T5.5. Расширить `techGate.ts`/`techActions.mjs`

Зеркальные функции: `hasUnlockedPath(eco, pathId)`, читает новое поле `eco.unlockedPaths: string[]`
(добавляется в `TechEcoSlice`). Обнови `canBuildWithTech`-подобные проверки, если сигнатурные постройки
(из B2 T2.6) должны также требовать открытый путь, а не только RoleScore-порог напрямую (реши, что логичнее —
задокументируй выбор).

### T5.6. Задел под кросс-путевое приобретение (не реализовывать полностью)

На путь-заблокированных технологиях проставь `tradeable: true` — флаг для будущей интеграции с
`superpower_market.json`/`diploOffers.mjs` (покупка/захват технологии у другой фракции). Саму механику
покупки/захвата технологии в этой задаче **не реализуй** — это отдельная будущая волна, не блокирует DoD.

### T5.7. UI: статус пути в разделе Науки

В `ResearchPanel.tsx` (или где отображается дерево технологий) — показать 2 пилотных пути с прогрессом до
Breakthrough (читай `roleScore` из B2 API-ответа) и статус "открыт/не открыт". Минимальная версия — не
полноценный редизайн панели.

### T5.8. Миграция и тесты

`eco.unlockedPaths` по умолчанию `[]` для старых сейвов. `npm run smoke`, `npm run smoke:tick`.

## DoD

- При достижении RoleScore-порога Breakthrough-технология становится исследуемой (не раньше).
- После исследования Breakthrough — путь помечен открытым, сигнатурные технологии пути становятся доступны
  по обычным `prerequisites`.
- Раса с `pathAffinity` получает скидку на свой Breakthrough, но не заблокирована от чужого.
- `npm run smoke`, `npm run smoke:tick` проходят.

## После завершения

1. Прогони smoke-тесты.
2. Напиши `tmp/summary-{timestamp}.json`.
3. Обнови `ECONOMY_TECH_REDESIGN_SPEC.md` §13 — отметь пилот путей технологий как реализованный.
