# Agent B1 — Именные ресурсы: фундамент (склад по resourceId вместо категории)

> Ты работаешь над проектом LO_GOLDEN_PAX / GMap (Vite + React 19 + TS + PixiJS 8 + Zustand + Node API).
> Это твоя полная спецификация. Читай её целиком и выполняй задачи по порядку.
> **Это самая рискованная и самая блокирующая задача волны B. Остальные агенты (B2, B3, B5) ждут тебя.**

## Принципы (нерушимые)

См. `../PRINCIPLES.md` полностью, особенно пункт 11 (категория ≠ хранилище) и пункт 12 (не расширять пилот).

## Контекст проекта — прочитай перед стартом

- `GMap/docs/ECONOMY_TECH_REDESIGN_SPEC.md` §5 — полное обоснование, зачем это делается.
- `GMap/server/flowEngine.mjs` — движок потоков. `addPlanetExtraction()` сейчас коллапсирует конкретный
  ресурс в бакет `flows[category][tier] = {rate, demand, capacity}` **на первом же шаге добычи** — это и
  есть корень проблемы, которую чинишь.
- `GMap/server/economyTick.mjs` — `computeFlowBreakdown()` и `runEconomyTick()`, там же баг с `treasuryPeg`
  (строки ~786-810: зеркалит весь net категории Materia, а не добычу конкретного анкор-ресурса).
- `GMap/server/ledger.mjs` — `readLedger`, `writeLedger`, `ensureFactionEco`, `adjustStock`. Сток уже хранится
  как `eco.stocks[key]` — произвольная строка-ключ, физической переделки формата НЕ требуется, только новые
  ключи (`map.solari` вместо только `currency.materia`).
- `GMap/content/core/map_resources.json` — 86 записей, у каждой уже есть `category`, `tier`, `properties`,
  `yield`. Ничего в формате менять не нужно.
- `GMap/content/core/faction_currency_bindings.json` — `treasuryPeg` уже указывает на конкретный `map.*` id
  для каждой фракции — вот кого точно нужно поддержать в первую очередь.

## Скоуп

**Только strategic-ресурсы** (см. T1.1) получают именное хранение в этом заходе. Bulk-ресурсы (~65-70 из 86)
остаются в категорийных бакетах, как сейчас — их миграция не входит в эту задачу (см. `README.md` про
намеренное сужение скоупа). Не пытайся сделать именными все 86 сразу.

## Зависимости

Нет. Стартуешь первым в волне B.

## Файлы

- `GMap/content/core/map_resources.json` — добавить поле `strategic: boolean` (~10-15 записей `true`)
- `GMap/server/flowEngine.mjs` — расширить `addPlanetExtraction`, `computeNets`
- `GMap/server/economyTick.mjs` — расширить `computeFlowBreakdown`, `runEconomyTick`, зафиксить treasuryPeg
- `GMap/server/ledger.mjs` — проверить/расширить `adjustStock`, `ensureFactionEco` под произвольные resourceId
- `GMap/server/planetActions.mjs` / место заполнения `slotFills` построек — расход именного стока
- `GMap/server/normalizeWorld.mjs` — миграция (новые поля/стоки, старые сейвы без ошибок)
- `GMap/scripts/smokeIntegration.mjs` / `sessionSmoke.mjs` — не менять логику, только убедиться, что проходят

## Цепочка задач

### T1.1. Пометить strategic-ресурсы в `map_resources.json`

Добавить `"strategic": true` для ресурсов, которые уже используются как `treasuryPeg` в
`faction_currency_bindings.json` (`map.solari`, `map.blumatid`, `map.glasssteel`) плюс явно психонически
размеченные (`map.vaitid`, `map.blakula`, `map.violid`, `map.cinnabar`). Итого ~7-10 на старте — не гнаться
за полным списком 10-15 из спека, лучше меньше, но проверенно. Всем остальным — `"strategic": false` (или
поле опустить, дефолт `false`).

### T1.2. Расширить `flows[cat][tier]` источниками по resourceId

В `flowEngine.mjs`: добавить к каждой ячейке `flows[cat][tier]` поле `sources: Record<resourceId, amount>`.
В `addPlanetExtraction()` — при начислении `cell.rate += amt`, если ресурс помечен `strategic: true` в
контенте, дополнительно писать `cell.sources[def.id] = (cell.sources[def.id] || 0) + amt`. Для
`strategic: false` ресурсов `sources` не трогать (остаются только в общем `rate`, как сейчас).

### T1.3. Распределить net категории в именные стоки для strategic-ресурсов

В `computeFlowBreakdown()`/`runEconomyTick()` (`economyTick.mjs`): после расчёта `categoryNet[cur]` — если у
соответствующей ячейки `flows[cat][tier].sources` непусто, распределить долю net **пропорционально вкладу**
каждого `sources[resourceId]` в общий `rate` этой ячейки, и записать через `adjustStock(ledger, fac.id,
resourceId, share, {turn, reason: "flow_income_named"})`. Bulk-часть (не strategic) продолжает идти в
`currency.*` как сейчас, без изменений.

### T1.4. Починить `treasuryPeg`

Найди блок в `runEconomyTick()` (~786-810), где `treasuryPeg` зеркалит `metalDelta` (по факту весь net
Materia). Замени источник: если `fac.treasuryPeg` указывает на ресурс, помеченный `strategic: true` — бери
именно его именной сток-дельту (из T1.3), а не общий `metalDelta`. Легаси-мост (metal/supply) для НЕ-strategic
пегов оставь как есть — не всем фракциям обязательно назначен strategic-анкор.

### T1.5. Проверить `ledger.mjs` на произвольные resourceId

`adjustStock`, `ensureFactionEco`, `sanitizeEconomyExplain` — убедись, что они не хардкодят список ключей
`currency.*` нигде (grep по `Object.keys(eco.stocks)` и похожим местам). Если где-то есть whitelist только
на `currency.*` — расширь на любой валидный `resourceId` из `map_resources.json`/`content.currencies`.

### T1.6. Постройки: расход именного стока при заполнении слота

Найди место, где `buildingInst.slotFills` резолвится в реальное потребление (см. `flowEngine.mjs
effectiveTierFromFills`, и вызывающий код в `economyTick`/`planetActions.mjs`). Если `slotFills[role]`
указывает на strategic-ресурс — при потреблении слота списывай именно этот сток (`adjustStock` с
отрицательной дельтой), а не общий categoryCurrency. Если slot не зафиксирован (`slotFills` пуст) — оставь
текущее поведение (общий бакет) как fallback, не ломай существующие сейвы без явного выбора игрока.

### T1.7. Миграция в `normalizeWorld.mjs`

Новых top-level полей в `WorldState` эта задача не добавляет (сток по-прежнему в `eco.stocks`, просто с
новыми ключами) — но новые ключи в `eco.stocks` должны инициализироваться `0`, если отсутствуют, не `undefined`.
Проверь, что старые сейвы (без именных ключей вообще) грузятся и тикают без ошибок — при первом тике именные
стоки появятся сами по T1.3.

### T1.8. Тесты

Прогони `npm run smoke`, `npm run smoke:tick`, `npm run smoke:real`. Особое внимание — не появился ли двойной
учёт (ресурс списан и из именного стока, и из категорийного одновременно). Добавь минимум один явный лог/ассерт
в `scripts/sessionSmoke.mjs`, что после нескольких тиков `ledger.factions[X].stocks["map.solari"]` растёт для
фракции с добычей соларита.

## DoD

- `map_resources.json` содержит `strategic: true` минимум для ресурсов из T1.1.
- Именные стоки реально накапливаются на `eco.stocks[resourceId]` для strategic-ресурсов после тика.
- `treasuryPeg` у Белатора/Ханства (соларит) корректно растёт/падает именно от добычи соларита, не от всей
  категории B — проверь вручную, отняв у фракции все системы с соларитом, и убедись, что казна перестаёт расти.
- Bulk-ресурсы (не strategic) продолжают работать ровно как раньше — регрессии нет.
- `npm run smoke`, `npm run smoke:tick`, `npm run smoke:real` проходят.
- Старые сейвы (`data/published.json` до твоих изменений) загружаются без ошибок.

## После завершения

1. Прогони все smoke-скрипты, убедись, что проходят.
2. Напиши `tmp/summary-{timestamp}.json` с кратким итогом — особенно опиши, как именно распределяется net
   между несколькими strategic-ресурсами одной ячейки, если такое встретилось (следующим агентам важно знать).
3. Обнови `GMap/docs/ECONOMY_TECH_REDESIGN_SPEC.md` §12 — отметь пункт про баг treasuryPeg как решённый.

---

## Transfer from C1 (T1.1) - metal/supply double credit

**Status (2026-08-10, B1):** ? Resolved. `bridgeMetal` / `bridgeSupply` no longer add `max(0, categoryNet)`. Legacy metal/supply receive only `mapResourceYieldLegacyOnly` (+ soft pop baseline), metal fleet upkeep debit, and soft negative-net drains. Named strategic stocks continue via `strategic_extraction`; `channels.*.bridgedFrom` is `"legacy_only"`. Asserted in `scripts/smoke-economy-v05.mjs` (`bridge_not_mirroring_category_nets`).
