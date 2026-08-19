# LO_GOLDEN_PAX — Agent Skills

Скиллы для Cursor. Каждый — в `.cursor/skills/<name>/SKILL.md`. Агент подтягивает релевантный по описанию при работе над соответствующей частью проекта. Не always-on.

**Сначала навигация:** `game-nav` — до широкого Read/Grep по GMap.

## Установленные скиллы

### Meta
| Скилл | Где применяется |
|---|---|
| `game-nav` | Любой поиск систем GMap: entrypoints, content→server→UI; forbidden loads |
| `tech-path-catalog` | Сигнатурный каталог путей (6 пустых RoleScore-кластеров): retag vs new, референсы, баланс |
| `technologies-content` | Общий контракт `technologies.json` (схема, эффекты, validate, без хардкода id) |

### QA / отладка
| Скилл | Где применяется |
|---|---|
| `gmap-bug-hunt` | Оркестратор: пройти режим, найти косяк, починить — не патчить вслепую |
| `systematic-debugging` | Любой баг: reproduce → root cause → одна гипотеза → фикс |
| `verifying-in-browser` | После UI/API: Vite 5173, консоль, сеть, исходный репро |
| `verification-before-completion` | Нельзя сказать «готово», пока нет свежего вывода команды |
| `test-playable-web-games` | Матрица пути игрока + детерминированные фикстуры |
| `visual-qa-testing` | Скрин + консоль + сеть после UI |
| `grinding-until-pass` | Цикл fix→proof до зелёного, max 10 |
| `pixijs-rendering` | Pixi v8 / MapCanvas (фрагменты, не весь файл) |
| `card-game` | Зоны/эффекты; `cardBattle.mjs` осторожно |
| `save-systems` | Атомарный write, revision, не затирать сервер клиентом |
| `game-ui-ux` | Оверлеи/фокус/стек; 4X-токены — `strategy-game-ui` |
| `iterate-until-verified` | Фан-аут / цикл до гейтов |
| `ship-web-games` | Релиз: smoke, proof, rollback |

### Game development — механика
| Скилл | Где применяется |
|---|---|
| `build-game-inventory` | `buildings.json`, `colonies.json`, `intents.json`, `worldStore.ts`, `economyTick.mjs`, `Inspector.tsx`, `PlayerHqPanels.tsx`, `PlayerPlanetManage.tsx` — ID-контракт, атомарные транзакции, миграция сейвов |
| `tune-enemy-ai` | `economyTick.mjs` (AI-фазы), `planetActions.mjs`, `pathfinding.ts` — FSM фракций, perception/intent/motion |
| `design-action-combat` | `planetActions.mjs`, `intents.mjs`, `drawMapIcons.tsx` — детерминированный бой, авторитетный контакт |
| `design-game-encounters` | `planetActions.mjs`, `lo_golden_pax.json` — композиция давления, читаемые пути, seedable-фикстуры |
| `build-game-camera-controls` | `MapCanvas.tsx` — pan/zoom/focus, clamp, reduced-motion |
| `create-game-vfx` | `drawMapIcons.tsx`, `MapCanvas.tsx`, `TurnStampHud.tsx` — реестр эффектов по ID, пул, idempotent cleanup |
| `build-game-audio-feedback` | новый `audioBus.ts` + эмиттеры в `economyTick`/`planetActions`/UI — реестр cue→event |
| `test-playable-web-games` | вся `GMap/` + `GMap/test/` — матрица пути игрока, детерминированные фикстуры |
| `ship-web-games` | CI/деплой `GMap` — релиз верифицированного коммита, production-proof |
| `optimize-web-games` | `MapCanvas.tsx`, `drawMapIcons.tsx`, `pathfinding.ts`, `economyTick.mjs` — профилирование canvas, batch, кэш слоёв |

### UI / UX
| Скилл | Где применяется |
|---|---|
| `design-first-ui-prompting` | Промпт-дисциплина для генерации панелей (GOAL→FORMAT→LAYOUT→TYPE→COLOR→CONSTRAINTS→NEGATIVE) |
| `operational-enterprise-ai` | Интенты/экономика/planetActions — audit/exception/rollback-состояния, expandable rows, тёмный command-center |
| `technical-wireframe-info-layout` | `SystemDossier.tsx`, диагностические оверлеи — монохромный wireframe, connector-аннотации |
| `framed-grid-layout` | Базовая сетка панелей (Inspector/IntentsInbox/SystemDossier/PlayerHqPanels) — тонкие границы, L-скобки |
| `strategy-game-ui` | **Кастомный, главный UI-скилл** — токены, анатомия компонентов, 4X-паттерны (action-at-source, keyboard-first, progressive density, intentional friction, offscreen indicators), a11y, do/don't |

## Рекомендуемый порядок внедрения

0. **Контракты данных** — `build-game-inventory`: ID-контракт на JSON, `schemaVersion`, транзакции в `intents.mjs`/`economyTick.mjs`.
1. **Детерминированный бой** — `design-action-combat` + `design-game-encounters`: боевые глаголы в `planetActions.mjs`, seedable debug-роуты.
2. **AI фракций** — `tune-enemy-ai`: FSM в `economyTick.mjs`/новом `factionAi.mjs`, авторитетная навигация через `pathfinding.ts`.
3. **Камера** — `build-game-camera-controls`: `MapCanvas.tsx` pan/zoom/focus/clamp.
4. **VFX + аудио** — `create-game-vfx` + `build-game-audio-feedback`: единые реестры эффектов и cue→event.
5. **Перформанс** — `optimize-web-games`: только когда карта начнёт тормозить.
6. **QA + релиз** — `test-playable-web-games` + `ship-web-games`.

UI-скиллы (`strategy-game-ui`, `framed-grid-layout`, `operational-enterprise-ai`, `technical-wireframe-info-layout`, `design-first-ui-prompting`) применяются параллельно на каждом этапе, где затрагивается интерфейс.

## Источники

- Game-dev и UI-скиллы адаптированы из [MengTo/Skills](https://github.com/MengTo/Skills) (MIT).
- QA/debug: [obra/superpowers](https://github.com/obra/superpowers) (`systematic-debugging`, `verification-before-completion`); браузер — [spencerpauly/awesome-cursor-skills](https://github.com/spencerpauly/awesome-cursor-skills).
- Не ставить целиком [gamedev-skills/awesome-gamedev-agent-skills](https://github.com/gamedev-skills/awesome-gamedev-agent-skills) (67 скиллов Godot/Unity) — засоряет роутинг. Точечно: Pixi/card-game по нужде.
- `strategy-game-ui` — кастомный, синтез 4X-паттернов из [GalCiv IV Dev Journal #114](https://www.stardock.com/games/article/541308/galciv-iv-dev-journal-114-the-evolving-4x-interface-and-v33), [GameDeveloper: Strategy UI Dos & Don'ts](https://www.gamedeveloper.com/design/ui-strategy-game-design-dos-and-don-ts), [treeform: Strategy Battle UI](https://medium.com/@treeform/strategy-game-battle-ui-3b313ffd3769) и паттерна «design system as skill» из [TypeUI](https://www.typeui.sh/blog/design-skills-for-claude).
