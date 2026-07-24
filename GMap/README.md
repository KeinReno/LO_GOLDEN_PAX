# GMap — редактор космических карт

Прототип редактора звёздных карт для РП-стратегии.  
Стек: **Vite + React + TypeScript + PixiJS + Zustand** + лёгкий API на вашем ПК.

## Быстрый старт

```bash
cd GMap
npm install
npm run dev
```

- Редактор: http://localhost:5173/
- Игроки: http://localhost:5173/view

### Открыть карту для игроков (автоматом)

В редакторе: **Для игроков** → поднимает **CloudPub** (РФ), иначе Cloudflare / ngrok / loca.lt.

Или:

```bash
npm run players
# = npm run players:cloudpub
```

Нужны: [CloudPub CLI](https://cloudpub.ru) в `tools/cloudpub/clo.exe` и API-ключ (`clo set token …` или GUI).

Ссылка также пишется в `tmp/player-url.txt`.

### Туннель вручную (если нужно)

```bash
# CloudPub
tools\cloudpub\clo.exe publish http 4173

# или Cloudflare
cloudflared tunnel --url http://localhost:4173
```

## Сценарий сессии

1. Кисть → системы; **Владение** → государства; **Сектор** → полигоны регионов.
2. **Связь** — ручные гиперлинки; **Флот** / **Легион**; Shift+клик — маршрут.
3. **Разведка** + превью тумана; при необходимости «открыть всё / сбросить».
4. **Опубликовать для игроков** (мастер-токен по умолчанию `master2142`).
5. Игрок: `/view`, государство, пароль (`2142` / `5831` / `9074`) → приказы.
6. Мастер: **Загрузить приказы** → OK/Нет → **Следующий ход (снимок)**.

## Архитектура (для ИИ)

| Слой | Папка | Ответственность |
|------|--------|-----------------|
| State | `src/state/` | World model, fog, sectors, turns, Zustand |
| Generators | `src/generators/` | Кисть → системы |
| Editors | `src/editors/` | UI мастера |
| Renderers | `src/renderers/` | Pixi |
| Viewer | `src/viewer/` | Вход игрока + приказы |
| IO | `src/io/` | ZIP/JSON/Markdown/PNG |
| Server | `server/` | Publish / login / orders API |

**Сектор ≠ государство.** Сектор — пространство; государство — политика/цвет/пароль/герб.

## Туман войны

Система видна фракции, если:
- она владелец, или
- id фракции в `visibleToFactionIds` (инструмент **Разведка**), или
- там стоит её флот / легион.

В редакторе: слой **Превью тумана** — затемняет системы, которые активная фракция не видит.

## Формат кампании (ZIP)

```
campaign/
  meta.json
  map/systems.json
  map/links.json
  map/sectors.json
  state/fleets.json
  state/legions.json
  state/diplomacy.json
  state/orders.json
  state/turn-history.json
  lexicon/factions.json
  lexicon/races.json
```

Schema version: **6**. Runtime publish: `data/published.json`, приказы: `data/player-orders.json`.

## API

| Метод | Путь | Заголовки |
|-------|------|-----------|
| POST | `/api/publish` | `X-Master-Token` |
| GET | `/api/factions` | — |
| POST | `/api/login` | body: `{factionId,password}` |
| POST | `/api/orders` | body + пароль фракции |
| GET | `/api/orders` | `X-Master-Token` |

## Production на своём ПК

```bash
npm run build
npm run serve
```

Откроется http://localhost:4173 (тоже с API). Туннель направьте на `4173`.

## Экспорт

- ZIP / JSON — полный сейв
- Markdown — брифинг кампании
- PNG — снимок текущего canvas карты

## Кампания по лору

Готовый снимок мира из канона (`Карта.canvas` + `00_Канон/`):

1. `npm run lore` — пересобрать JSON из canvas  
2. В редакторе: **Загрузить лор LO GOLDEN PAX**  
   или откройте `public/campaigns/lo_golden_pax.json`

Включено: ~120+ систем, связи, секторы, державы, дипломатия, флоты/легионы (Сессия 2 / начало III).

## Desktop (Tauri) — P8.6

Лаунчер для **мастера** (не для игроков): поднимает `node server/serve.mjs` на `:4173`, tray (показать / `/view` / data / выход), закрытие окна → в трей.

Нужны: [Rust](https://www.rust-lang.org/tools/install) + WebView2 (обычно уже есть на Windows) + Node в PATH.

```bash
cd GMap
npm install
npm run tauri:dev          # Vite :5173 + окно Tauri
```

Сборка NSIS-инсталлятора / `.exe`:

```bash
npm run tauri:build
# или: npm run tauri:host
```

В TopBar появляется бейдж «Хост :4173» только внутри desktop-приложения. Иконки-заглушки в `src-tauri/icons/` — замените: `npx tauri icon path/to/icon.png`.

Веб-режим по-прежнему: `npm run dev` → http://localhost:5173/

## Дальше (опционально)

- Живой sync / websocket между мастером и игроками
- Нативный open/save папки кампании через Tauri dialog
- Кастомные иконки приложения
- P8.1 белый IP (когда будет готов)