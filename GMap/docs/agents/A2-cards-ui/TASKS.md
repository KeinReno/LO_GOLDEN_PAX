# Agent A2 — Cards UI Infrastructure

> Ты работаешь над проектом LO_GOLDEN_PAX / GMap (Vite + React 19 + TS + PixiJS 8 + Zustand + Node API).
> Это твоя полная спецификация. Читай её целиком и выполняй задачи по порядку.

## Принципы (нерушимые)

1. **Сервер = единственная правда.** Все мутации мира — через `server/api.mjs` -> `processTurn.mjs` или intents. Zustand на клиенте — только вьюха.
2. **Tailwind НЕ добавлять.** Стили — plain CSS в `src/styles/app.css` с дизайн-токенами (см. `.cursor/skills/strategy-game-ui/SKILL.md`). Анимации — `motion` (Framer Motion) + `@use-gesture/react` (уже в `package.json`).
3. **Не ломать существующий пайплайн.** После изменений запускай `npm run smoke` — должно проходить.
4. **В конце чата** напиши `tmp/summary-{timestamp}.json` (см. `.cursor/rules/after_each_chat.mdc`).

## Контекст проекта

Прочитай для понимания архитектуры:
- `GMap/docs/CAMPAIGN_TABLE_SPEC.md` — архитектура
- `GMap/src/styles/app.css` — дизайн-токены (используй их, не Tailwind)
- `GMap/src/ui/` — существующие UI-компоненты (StatefulButton, ExpandableSection, HoldButton, HoldRing, ActionRing — изучи паттерны)

## Скоуп

Общие компоненты `<DragCard>` и `<DropZone>` на `@use-gesture/react` + `motion`, которые переиспользуются агентами A7 (Card Battle), A8 (Diplomacy), A9 (Quests), A10 (RP Court). Также — портирование визуальных приёмов из Aceternity под дизайн-токены проекта.

## Зависимости

- A1 (нужны новые типы эффектов для карточек квест-выборов) — **должен быть выполнен**

## Файлы

- `GMap/package.json` — добавить `motion` (Framer Motion)
- `GMap/src/ui/DragCard.tsx` — создать
- `GMap/src/ui/DropZone.tsx` — создать
- `GMap/src/ui/CardVisual.tsx` — создать (общий стиль карточки)
- `GMap/src/styles/app.css` — добавить стили карточек
- `GMap/src/ui/DragCardDemo.tsx` — создать (демо-страница)

## Цепочка задач

### T2.1. Установить `motion`

Добавить в `package.json` зависимость `motion` (Framer Motion v11+, совместим с React 19). Запусти `npm install`.

### T2.2. Создать `<DragCard>`

Компонент на `@use-gesture/react` (`useDrag`) + `motion` для spring-физики. Props:
- `cardId: string` — идентификатор (для key)
- `title: string`
- `subtitle?: string`
- `icon?: ReactNode`
- `accent?: string` — цвет рамки/подсветки
- `children?: ReactNode` — контент карточки
- `onDragEnd?: (pos: { x, y }) => void`
- `onDropZone?: (zoneId: string) => void` — срабатывает при отпускании над DropZone
- `pinned?: boolean` — запрещает drag
- `tilt?: boolean` — наклон при перетаскивании (3D-эффект Aceterty)

Позиция карточки — локальный state компонента (spring). При `onDragEnd` — вызов колбэка с позицией. При попадании в DropZone — `onDropZone` с id зоны.

### T2.3. Создать `<DropZone>`

Компонент-контейнер, который реагирует на перетаскиваемую карточку. Props:
- `zoneId: string`
- `accepts?: string[]` — фильтр по `cardId` или типу
- `onDrop?: (cardId: string) => void`
- `highlight?: boolean` — подсветка при наведении
- `children?: ReactNode` — содержимое зоны

Использует `@use-gesture/react` `useDrag` на родителе для определения hover-зоны (через `getBoundingClientRect`).

### T2.4. Создать `<CardVisual>`

Базовый визуал карточки: рамка, тень, радиус, фон — все через CSS-токены из `app.css` (`var(--surface)`, `var(--border)`, и т.д.). Стиль — портированный из Aceterty `3D Card Effect` / `Wobble Card`, но **без Tailwind-классов**. Все стили в `app.css` с классами `drag-card`, `drag-card--dragging`, `drag-card--tilt`.

### T2.5. Демо-страница

Создай `src/ui/DragCardDemo.tsx` — холст с 3 карточками и 2 drop-зонами ("Даю" / "Хочу"). Доступна по временному роуту `/demo/cards`. Проверь: drag работает, spring-физика плавная, drop-зоны подсвечиваются, tilt-эффект при перетаскивании.

### T2.6. Документация для других агентов

В конце файла `src/ui/DragCard.tsx` — комментарий с примером использования, чтобы агенты A7-A10 могли скопировать паттерн без чтения всего кода.

## DoD

- `motion` установлен, `npm run build` проходит.
- `<DragCard>` и `<DropZone>` работают на демо-странице.
- Стили используют дизайн-токены, не Tailwind.
- `npm run smoke` проходит.

## После завершения

1. Запусти `npm run smoke` — убедись, что проходит.
2. Напиши `tmp/summary-{timestamp}.json` с кратким итогом.
3. Обнови `GMap/docs/WORK_PLAN.md` — отметь A2 как done.
