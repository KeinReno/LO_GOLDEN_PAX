# GMap — Оркестратор работ (B + C + IA)

> Дата: 2026-08-10 · **Сверка с кодом: 2026-08-11** · Статус: **канон оркестрации** + актуальный статус фаз.
> Это не третья «волна задач» и не замена `agents-pathways/` / `agents-hardening/`.
> Это **порядок фаз**, чтобы агенты не переписывали весь UI разом и не дублировали B/C.
>
> **Важно:** статус ниже = снимок репозитория. Не выводить «не начато» из устаревших строк батчей A/B/C.

## Зачем этот файл

Склеены три уже существующих потока:

| Поток | Папка | Роль |
|---|---|---|
| Волна B | `../agents-pathways/` | Именные ресурсы, RoleScore, FX, Order+ETA, пути |
| Волна C | `../agents-hardening/` | Корректность, баланс JSON, UX-контракт, SQLite, GM |
| Целевое IA | `../VIEWER_WIREFRAME_SPEC.md` | «10 сек / 1 CTA / запреты» по экранам — **компас**, не flat-backlog |

Плюс пробел, которого не было в C1–C5: **C6** (док-тиры + Штаб-роутер) — см. `../agents-hardening/C6-viewer-ia/`.

## Нерушимые правила оркестрации

1. **Один агент = один трек** (`C1/`, `B4/`, `C6/` …). В чат кладётся папка трека + PRINCIPLES + (для UI) UX-контракт + **только свой экран** из wireframe, не весь wireframe.
2. **Wireframe — целевое состояние**, не список «сделать всё сейчас». Закрывать комнату по wireframe DoD можно только если трек явно это поручает.
3. **Не параллелить** задачи, которые все трогают `ViewerPage.tsx`: B4, B7, C3.T3.8, C6 (уже приземлены — правило для *новых* правок тех же зон).
4. Перед стартом UI-трека: открой `../UX_UI_DESIGN_PROCESS.md` (скоуп = `src/viewer/**` только).
5. Перед стартом любого C-трека: физически открой `../agents/PRINCIPLES.md` и `../agents-pathways/PRINCIPLES.md`.

## Снимок статуса (2026-08-11) — сверяй с кодом

| Фаза / трек | Статус | Где смотреть в коде (якоря) |
|---|---|---|
| Фаза 0 (канон доков) | ✅ | этот README, wireframe, UX-контракт |
| Фаза I (C1∖хвост, C2, B1) | ✅ | `economyTick`, content balance JSON, smokes |
| Фаза II (C3 T3.1–T3.7+T3.9, C5) | ✅ (T3.8 partial) | viewer UX primitives; `ViewerPage` ещё толстый |
| **B2 RoleScore (пилот 2 роли)** | ✅ | `economyTick` → `eco.roleScores`; **нет** отдельного `/api/role-*` — в economy payload (`ledger.publicEconomyPayload` / `api.playerEconomy`). Искать отдельный роут → `Unknown API route` — by design (B2.T2.5) |
| **B3 FX** | ✅ | `server/fxExchange.mjs`, `data/fx-exchange.json` |
| **B4 Order+ETA** | ✅ | `orderEngine.mjs`, `OrderTray.tsx` |
| **B5 tech paths (пилот)** | ✅ | `techPaths.mjs`, `content/core/tech_paths.json`, ResearchOverview |
| **B6 civic paths** | ✅ | `civicPaths.mjs`, `civicTick.mjs` (в `processTurn`), `eco.civicPaths` |
| **B7 PathsStrip (10 слотов)** | ✅ пилот | `PathsStrip.tsx` + `buildPathStripRows.ts`: 8 material + trade/culture; **живые** только `structural`/`energy`, остальные material = `pilot: false` |
| **B8 / B9** | частично / ✅ lore | B8 — точечные фиксы; B9 — `powerPaths.mjs` + lore flags (не в PathsStrip) |
| **C4 SQLite** | ✅ инфраструктура | `server/db/*`; default store всё ещё **file**, opt-in `GMAP_STORE=sqlite` |
| **C6 ViewerDock / HQ IA** | ✅ | `ViewerDock.tsx`, `useViewerDockChrome`, HQ attention |
| Фаза III целиком | ✅ **пилот** | DoD фазы закрыт по коду; **не** = «все 8 ролей / полный tech catalog» |
| C3.T3.8 ViewerPage split | 🟡 partial | **2026-08-11:** 8 Zustand slices — … + battle + **`viewerOrderSessionStore`** (orderType/note/msg + AP meters). Дальше — engagements/catalogs или JSX room extraction |
| Полные 8 RoleScore / доктрины / полный §10.1 tech | ❌ out of scope волны B | см. `agents-pathways/README.md` |

## Фазы продукта

```
ФАЗА 0  Канон документов          ← ✅
ФАЗА I  Доверие к числам          ← ✅
ФАЗА II Комфорт игрока            ← ✅ (T3.8 не полный DoD)
ФАЗА III Идентичность и время     ← ✅ пилот (B4→B5–B7→C6 + B2/B3)
ФАЗА IV Мастер и долгая кампания  ← ✅ C5; C4 infra ✅ (file default)
ПАРАЛЛЕЛЬНО map-visual-redesign   ← ✅ themes classic/imperial/holo
```

### Фаза 0 — Канон (человек / доки)

- [x] C5 переписан под существующий `GmWorkbench` (не параллельный кокпит)
- [x] UX-контракт ограничен `src/viewer/**`
- [x] C1.T1.9 = убывающая отдача AP (зафиксировано)
- [x] `VIEWER_WIREFRAME_SPEC.md` — целевое IA
- [x] Трек C6 — док-тиры + Штаб
- [x] Caravan false-affordance — пункт в C3

### Фаза I — Доверие к столу

| Трек | Статус | Блокер |
|---|---|---|
| C1 T1.2–T1.9 | ✅ | — |
| C2 | ✅ | — |
| B1 / C1.T1.1 | ✅ | мост metal/supply снят |

**DoD фазы:** `npm run smoke`, `smoke:tick`; повтор тика не двоит экономику; research caps пропускают штрафы; absorb симметричен.

### Фаза II — Комфорт игрока

| Трек | Статус | Примечание |
|---|---|---|
| C3 T3.1–T3.7 + T3.9 | ✅ | caravan intent без false affordance |
| Z0 (бой > док) | ✅ / сверить | z-stack |
| C3.T3.8 | 🟡 | partial split; **не** перезапускать «с нуля» |

**DoD фазы:** Наука с touch-drag; нет `window.confirm` в viewer бое/RP; caravan не врёт жестом; smoke зелёный.

### Фаза III — Идентичность и время

Порядок исполнения был жёсткий (все лезут в viewer/time model) — **уже пройден пилотом:**

1. **B4** Order + ETA + AP-as-parallelism → ✅  
2. **B5 → B6 → B7** пути / civic / HUD strip → ✅ пилот  
3. **C6** док-тиры + Штаб «утро» + hotkey Двора → ✅  

Связанные треки волны B вне нумерации фазы, но нужны для полосы:

- **B2** RoleScore (structural/energy) → ✅ в ledger/tick/economy payload  
- **B3** FX → ✅  

**DoD фазы (пилот):** процессы с ETA в OrderTray; PathsStrip виден; primary-док через `ViewerDock`; HQ attention с глаголами.  
**Не DoD:** 6 не-пилотных material-ролей, полный civic/tech каталог, доктрины воплощения.

### Фаза IV — Мастер и долгая кампания

1. C1.T1.4 ✅  
2. **C5** T5.1–T5.5 ✅ (на существующем GM)  
3. **C4** SQLite hot-state ✅ как код; runtime default = files (`GMAP_STORE=sqlite` для opt-in)

Контент (story quests / court tasks / units) — отдельные content-чаты, не этот оркестратор.

---

## История батчей агентов (архив)

Открой **отдельный чат на каждый** пункт только если трек ещё не ✅ в таблице выше.

### Батч A — параллельно, безопасно

> **Статус 2026-08-10:** Batch A **закрыт** (C1 T1.2–T1.9, C2 T2.1–T2.8, C3 T3.1–T3.2, C5 T5.1/2/5).
> T1.1 передан в B1. Parent smoke re-check PASS.

| # | Трек | Что положить в чат | Запрет файлов |
|---|---|---|---|
| A1 | C1 | `agents-hardening/C1-engine-correctness/` + PRINCIPLES (C+A+B) | Не трогать UI. T1.1 — только проверить/передать в B1 |
| A2 | C2 | `agents-hardening/C2-balance-data-pass/` + PRINCIPLES | Только `content/core/*.json` |
| A3 | C3 partial | `agents-hardening/C3-ux-consistency/` — **только T3.1 и T3.2** + UX-контракт | Не T3.3+, не ViewerPage decom |
| A4 | C5 early | `agents-hardening/C5-gm-cockpit/` — **только T5.1, T5.2, T5.5** | Не T5.3/T5.4 до C1.T1.4 |

### Батч B — после A3

> **Статус 2026-08-10:** Batch B **закрыт** — C3 T3.3–T3.7+T3.9 + C5 T5.3–T5.4.
> **B1 / B4:** закрыты тем же днём.
> ~~T3.8 / C6 не стартовали~~ → **устарело:** C6 ✅; T3.8 🟡 partial (2026-08-11).

### Батч C — Фаза III (пути / док)

> **Статус 2026-08-11:** Batch C **закрыт пилотом** — B2, B3, B4, B5, B6, B7, C6 в коде.
> Дальше: не «запускать Фазу III с нуля», а точечные хвосты (T3.8, полный 8-ролей — только по новому ТЗ, C4 default-store если решите).

Порядок, которым шли (для истории): B4 → B5–B7 → C6 (+ B2/B3 параллельно по зависимостям pathways).

---

## Что делать сейчас (после сверки)

1. **Не** перезапускать агентов B2/B5/B6/B7/C6 «как не начатые».
2. RoleScore смотреть в economy/viewer payload (`roleScores`), не в отдельном API.
3. Оставшийся осмысленный UI-долг: **C3.T3.8** (осторожные слайсы `ViewerPage`) и content/balance за пределами пилота.
4. Map-visual themes: classic/imperial/holo — уже в `src/renderers/styles/`.

## Шаблон промпта агенту

```text
Ты агент трека <ID>. Работай только по TASKS.md этого трека.
Сначала свернись со статусом в GMap/docs/agents-roadmap/README.md (снимок 2026-08-11) —
если трек уже ✅, не переписывай с нуля; чини хвост или остановись.
Обязательно открой и прочитай:
- GMap/docs/agents-hardening/PRINCIPLES.md
- GMap/docs/agents/PRINCIPLES.md
- GMap/docs/agents-pathways/PRINCIPLES.md
(+ для UI: GMap/docs/UX_UI_DESIGN_PROCESS.md)
(+ для комнаты X: только раздел X из GMap/docs/VIEWER_WIREFRAME_SPEC.md)

Не расширяй скоуп. Не переписывай подсистему с нуля (принцип 17).
По завершении: npm run smoke && npm run smoke:tick, затем tmp/summary-*.json.
```

## Карта ссылок

| Документ | Зачем |
|---|---|
| `../agents-pathways/README.md` | Волна B (+ статус треков) |
| `../agents-hardening/README.md` | Волна C (+ C6) |
| `../VIEWER_WIREFRAME_SPEC.md` | Целевое IA экранов |
| `../UX_UI_DESIGN_PROCESS.md` | Жесты / DoD панели |
| `../ECONOMY_TECH_REDESIGN_SPEC.md` | Модель Order/RoleScore/paths |
| `../map-visual-redesign/00-OVERVIEW.md` | Параллельный арт карты |
