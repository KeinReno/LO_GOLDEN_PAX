# LO_GOLDEN_PAX — PROJECT canon
Version: **1.0.0**

## 1. Что это
Монорепо: (A) лор/РП-канон Империи Белатор (`00_Канон/`, `02_История/`, …) и (B) playable table **GMap** — Vite/React/TS/Pixi + Node server (редактор GM + viewer игроков). Агент по умолчанию работает над **GMap**, если задача не про канон/прозу.

## 2. Стек и структура (факты с диска)
| Зона | Путь | Заметки |
|------|------|---------|
| Client | `GMap/src/` | viewer, editors, renderers, state (Zustand) |
| Server | `GMap/server/` | `serve.mjs` → `api.mjs`; tick/economy/combat/intents |
| Content | `GMap/content/core/*.json` | данные; UI не хардкодит tech/unit ids |
| Runtime data | `GMap/data/` | sqlite, journals, intel — не «исходники» |
| Lore | `00_Канон/`, `02_История/`, `05_Промпт_ИИ/` | приоритет канона — корневой README |
| Docs/tasks | `GMap/docs/agents-*` | треки B/C; не дублировать в always-on |
| Art | `art/` | постеры/ассеты — не читать бинарники в контекст |

Языки: TypeScript/TSX, Node ESM (`.mjs`), JSON content. Опционально Tauri (`GMap/src-tauri`).

Команды (из `GMap/`): `npm run dev` · `npm start` · `npm run smoke` · `npm run validate:tech`.

## 3. Boot агента (нетривиальная задача)
1. Read этот `PROJECT.md` целиком (один раз за сессию).
2. Live-блок `agent-tasks/STATUS.md` (≤~120 строк) + `agent-tasks/MEMORY.md`.
3. Skill `.cursor/skills/game-nav` перед широким поиском по GMap.
4. Не грузить forbidden (см. `token-economy` rule).

Тривиал (опечатка, CSS-токен, один label) — Boot можно сократить до STATUS+точечный файл.

## 4. Token economy
Always-on: `.cursor/rules/token-economy.mdc`. Канон здесь; rules — указатели. STATUS живой; история → `agent-tasks/_archive/status/`.

## 5. Гейт записи в MEMORY
Писать только если: (источник = код/диск/явное решение владельца) ∧ устойчиво ∧ не секрет ∧ уверенность высокая. Не стенограмма чата.

## 6. Context rot
Если агент грузит forbidden, игнорирует STATUS, или сессия распухла — **новая сессия** + короткий бриф из STATUS/MEMORY. Stop владельца абсолютен.

## 7. Риски качества
Economy / combat / persistence (sqlite) / auth-tunnel — осторожно + smoke/validate. Не ломать `main`/`master` без явной просьбы; коммит только по просьбе.
