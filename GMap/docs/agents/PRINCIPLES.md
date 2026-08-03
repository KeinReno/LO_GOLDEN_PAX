# Общие принципы для всех агентов

Эти принципы включены в каждый `TASKS.md` агента. Файл здесь — для справки.

## 1. Сервер = единственная правда
Все мутации мира — через `server/api.mjs` -> `processTurn.mjs` или intents. Zustand на клиенте — только вьюха.

## 2. Всё новое — через ModifierStack + effects.json
Никаких отдельных "систем лояльности/фракций" в обход стека. Новые каналы — это новые ключи в `channelKey` (`server/modifierStack.mjs`).

## 3. Новые intents — в content/core/intents.json
С `ap` и `ops`. Новые ops — в `server/processTurn.mjs` или специализированном модуле.

## 4. Контент — в JSON-паках content/core/
Не в коде. Новые типы эффектов — в `effects.json`.

## 5. Новые состояния — расширения существующих типов
В `src/state/types.ts`. Без новых top-level таблиц. `TurnSnapshot` остаётся плоским.

## 6. RNG — только серверный
`server/dice.mjs` или `node:crypto`. Клиент только проигрывает анимацию уже известного результата.

## 7. Tailwind НЕ добавлять
Стили — plain CSS в `src/styles/app.css` с дизайн-токенами (см. `.cursor/skills/strategy-game-ui/SKILL.md`). Анимации — `motion` (Framer Motion) + `@use-gesture/react` (уже в `package.json`).

## 8. Не ломать существующий пайплайн
Каждый агент запускает `npm run smoke` и `npm run smoke:tick` после изменений — должны проходить.

## 9. Чат-End Summary Rule
Каждый агент в конце своего чата пишет `tmp/summary-{timestamp}.json` (см. `.cursor/rules/after_each_chat.mdc`).

## 10. Миграции данных
Каждый агент, добавляющий новые поля в существующие типы — должен обновить `server/normalizeWorld.mjs` для обратной совместимости. Старые сейвы должны загружаться без ошибок.
