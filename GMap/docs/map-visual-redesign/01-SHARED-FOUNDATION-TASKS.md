# 01 — Общий фундамент (делать первым, до разделения на два трека)

> Прочитать сначала `00-OVERVIEW.md` — там объяснение, зачем это разделение файлов и почему цвет фракции обязателен.
> Репозиторий: `GMap/` (React + PixiJS, TypeScript). Все пути ниже — от корня `GMap/`.
> Цель этого файла: подготовить общую инфраструктуру так, чтобы направления А (Имперская картография) и Б (Голо-стол) можно было реализовать каждое в своём новом файле, не трогая одни и те же строки.

Каждая задача — с acceptance criteria в конце. Не переходить к следующей, пока текущая не проходит свою проверку.

---

## Задача 1 — Общий интерфейс темы

Создать `src/renderers/styles/mapTheme.ts`:

```ts
export type MapStyleId = "classic" | "imperial" | "holo";

/** Разрешённые цвета фракции для темы — ВСЕГДА из resolveFactionFill/Border/SystemColor/NameColor,
 *  никогда не хардкодить отдельную палитру. См. 00-OVERVIEW.md §3. */
export interface FactionThemeColors {
  fill: number;    // parseFactionColor(resolveFactionFill(faction))
  border: number;  // parseFactionColor(resolveFactionBorder(faction))
  system: number;  // parseFactionColor(resolveFactionSystemColor(faction))
  name: number;    // parseFactionColor(resolveFactionNameColor(faction))
  nameFont: string; // resolveFactionNameFont(faction)
}

export interface MapTheme {
  id: MapStyleId;

  drawTerritory(
    g: Graphics,
    world: WorldState,
    factionColors: Map<string, FactionThemeColors>,
    anim: AnimClock,
    opts: { rich: boolean; cinematic: boolean },
  ): void;

  drawTerritoryBorder(
    g: Graphics,
    world: WorldState,
    factionColors: Map<string, FactionThemeColors>,
    anim: AnimClock,
  ): void;

  drawSystem(
    g: Graphics,
    s: StarSystem,
    selected: boolean,
    anim: AnimClock,
    colors: FactionThemeColors | undefined, // undefined = нейтральная/ничья система
    lod: MapLod,
    shareColors: number[] | undefined,
    opts: { dim: number; emphasize: boolean },
  ): void;

  /** Возвращает id плашки-иконки для MapIconOverlay (см. Задачу 7). */
  iconPlateStyle: "classic" | "imperial-rim" | "holo-outline";
}
```

Не копировать сигнатуры один в один, если реальные сигнатуры `drawTerritoryGlow`/`drawTerritoryBorders`/`drawSystemGlyph` в `src/renderers/drawMapIcons.ts` чуть отличаются на момент реализации — свериться с актуальным кодом и подогнать интерфейс под него. Главное требование: один общий тип, который `classicStyle.ts`, `imperialTheme.ts`, `holoTheme.ts` реализуют одинаково.

**Acceptance:** файл компилируется, экспортирует `MapStyleId`, `FactionThemeColors`, `MapTheme`. Ничего пока не вызывается.

---

## Задача 2 — Helper цвета фракции (обязательная часть, без деривации)

В `src/renderers/styles/mapTheme.ts` (или отдельно `src/renderers/styles/factionColors.ts`) добавить:

```ts
export function resolveFactionThemeColors(f: Faction): FactionThemeColors {
  return {
    fill: parseFactionColor(resolveFactionFill(f)),
    border: parseFactionColor(resolveFactionBorder(f)),
    system: parseFactionColor(resolveFactionSystemColor(f)),
    name: parseFactionColor(resolveFactionNameColor(f)),
    nameFont: resolveFactionNameFont(f),
  };
}
```

Импорты: `resolveFactionFill/Border/SystemColor/NameColor/NameFont` из `src/state/territory.ts`, `parseFactionColor` из `src/renderers/drawMapIcons.ts`.

Это ЕДИНСТВЕННАЯ обязательная часть цветовой проводки. Обе темы обязаны получать цвета только через эту функцию (или строить `Map<factionId, FactionThemeColors>` вызовом её для каждой фракции — по образцу существующего кода в `MapCanvas.tsx` ~2799-2816, который уже строит три отдельные `Map` через `resolveFactionFill/Border/SystemColor` + `parseFactionColor`; эту тройную сборку можно заменить одним вызовом `resolveFactionThemeColors`).

**Acceptance:** для фракции Карнед (`color:"#3a7bd5"`, `borderColor:"#1e6fd9"`, `fillColor:"#2a3038"`, `systemColor:"#4a8ee0"`, `nameColor:"#c8d8f0"` — реальная запись в `public/campaigns/lo_golden_pax.json`) функция возвращает 4 РАЗНЫХ числа. Для фракции Белатор (только `color:"#ffd500"`) все поля `fill/border/system` возвращают одно и то же число (это ожидаемо и корректно, см. Задачу 3).

---

## Задача 3 (ОПЦИОНАЛЬНО, не блокирует остальное) — Мягкая деривация недостающих слотов

Проблема: у большинства реальных фракций задан только `color` → `fill === border === system` (плоский монохром). Это не нарушение требования пользователя (используются РЕАЛЬНО заданные цвета), но может визуально обеднять территорию с мягкой заливкой.

Если есть время — добавить `resolveFactionThemeColorsDerived(f: Faction): FactionThemeColors`, которая:
1. Сначала пробует явные поля как в Задаче 2 — **если поле задано ГМом, используется оно, без исключений.**
2. Только для полей, которые НЕ заданы (`fillColor`/`borderColor`/`systemColor` — `undefined` или пустая строка), вычисляет мягкий производный вариант через HSL от `color`: `fill` = та же H, S×0.7, L×0.6 (притушенная заливка), `system` = та же H, S как есть, L×1.15 clamp 0.85 (чуть ярче для маркера), `border` остаётся `color` как сегодня (уже логично для окантовки).
3. Переиспользовать существующий HSL↔hex код из `src/editors/PolityEditor.tsx` (`hslToHex`, ~строки 956-973) — не писать конвертацию заново, вынести её в общий `src/utils/color.ts` если её там ещё нет, и импортировать в обоих местах.

Пометить эту функцию явно как «используется по умолчанию, но обе темы должны уметь работать и без неё» — 02/03 файлы должны ссылаться на `resolveFactionThemeColors` (Задача 2) как базовое требование, деривация — только усиление.

**Acceptance:** для Белатора (только `color`) `fill`/`system` теперь визуально отличимы от `border`, но при явной установке `fillColor` в редакторе значение немедленно и точно совпадает с выбранным в `<input type="color">`, без какой-либо примеси деривации.

---

## Задача 4 — Поле `mapStyle` в `MapViewModel` и резолвер

В `src/renderers/MapCanvas.tsx`:

1. Добавить в `interface MapViewModel` (рядом с `perfMode`):
```ts
mapStyle?: MapStyleId;
```
2. Добавить функцию рядом с `resolvePerfTier`/`resolveGraphics` (~строки 194-289):
```ts
function resolveMapStyle(model: MapViewModel, tier: PerfTier): MapStyleId {
  return model.mapStyle ?? "classic";
}
```
(Если появится тир-зависимая логика — например, `holo`-пульс отключать на `bare` — расширить здесь, а не в местах вызова.)
3. В `defaultRead()` (editor-путь, ~строка 780) прокинуть `mapStyle: s.mapStyle` (см. Задачу 5).

**Acceptance:** типы компилируются, `resolveMapStyle` вызывается и возвращает `"classic"` по умолчанию, если `mapStyle` нигде не выставлен.

---

## Задача 5 — Проводка в редакторе (worldStore)

В `src/state/worldStore.ts`, по образцу `editorGraphics`/`toggleEditorGraphic`:

1. Добавить состояние: `mapStyle: MapStyleId;` (тип импортировать из `src/renderers/styles/mapTheme.ts`).
2. Дефолт: `mapStyle: readStoredMapStyle(),` — новую пару read/write helper'ов завести в `src/ui/viewerGraphics.ts` (или соседнем `src/ui/mapStylePrefs.ts`) по образцу `readStoredEditorGraphics`/`writeStoredEditorGraphics`, localStorage-ключ `"gmap-editor-map-style"`.
3. Экшен — **explicit setter, не toggle** (это 3-вариантный выбор, не булев флаг):
```ts
setMapStyle: (style: MapStyleId) =>
  set(() => {
    writeStoredMapStyle(style);
    return { mapStyle: style };
  }),
```

**Acceptance:** `useWorldStore.getState().setMapStyle("imperial")` меняет `mapStyle` в сторе и переживает перезагрузку страницы (localStorage).

---

## Задача 6 — Проводка во viewer (ViewerPage.tsx)

По образцу `perfMode` (`ViewerPage.tsx:490-492`, `applyPerfMode` ~583-600), но **БЕЗ** remount-паттерна `key={viewer-map-${perfMode}}` — mapStyle не требует пересоздания `Application` (см. `00-OVERVIEW.md` §4):

1. `const [mapStyle, setMapStyleState] = useState<MapStyleId>(() => readStoredMapStyle() ?? "classic");`
2. Функция применения по образцу `applyPerfMode`, но проще (нет device-clamp логики):
```ts
const applyMapStyle = (style: MapStyleId) => {
  setMapStyleState(style);
  try { localStorage.setItem("gmap-viewer-map-style", style); } catch {}
};
```
3. Прокинуть в объект, который возвращает `readModel()` (~строки 2063-2102): добавить `mapStyle,` рядом с `perfMode`.
4. В JSX `<MapCanvas key={\`viewer-map-${perfMode}\`} ...>` (~строка 4569) — **не добавлять** `mapStyle` в этот key.

**Acceptance:** переключение стиля во viewer не вызывает мигания/пересоздания canvas (в отличие от смены `perfMode`), карта перерисовывается на следующий кадр.

---

## Задача 7 — UI-переключатели

1. **Редактор**, `src/editors/Toolbar.tsx`, вкладка «Слои» → группа «Графика» (~строки 374-375, 902-935) — рядом с существующими chip-кнопками (`animations`/`tableFx`/`battleFx`/`scarFx`/`cinematic`) добавить сегментированный контрол на 3 позиции (Классика / Империя / Голо), вызывающий `setMapStyle`. Не превращать в chip-toggle — это mutually exclusive выбор, нужен `role="radiogroup"` или похожий паттерн, как в `PERF_OPTIONS`-селекторе viewer'а (см. пункт 2).

2. **Viewer, экран входа**, `ViewerPage.tsx` ~3379-3409 (`PERF_OPTIONS`/`login-perf` блок) — добавить параллельный блок «Язык карты» с 3 карточками (по образцу `login-perf-card`), состояние — локальный `loginMapStyle`, применяется вместе с `applyMapStyle` при входе.

3. **Viewer, внутриигровая панель «Настройки карты»**, `ViewerPage.tsx` ~5156-5184 (второй экземпляр `PERF_OPTIONS`-селектора, живой `perfMode`) — добавить туда же живой селектор стиля, вызывающий `applyMapStyle` напрямую (без remount, см. Задачу 6).

**Acceptance:** во всех трёх местах видно 3 варианта, выбор из редактора/viewer сохраняется между сессиями (localStorage/store), выбор `imperial`/`holo` пока визуально ничего не меняет (это нормально — темы ещё не зарегистрированы, см. Задачу 9).

---

## Задача 8 — Извлечь текущее поведение в `classicStyle.ts` без изменений картинки

Создать `src/renderers/styles/classicStyle.ts`, перенести туда (переносить логику, не переписывать):
- Тело `drawTerritoryGlow` (`drawMapIcons.ts:1108-1189`) → `classicTheme.drawTerritory`.
- Тело `drawTerritoryBorders` (`drawMapIcons.ts:1192-1220`) → `classicTheme.drawTerritoryBorder`.
- Тело `drawSystemGlyph` (`drawMapIcons.ts:510-733`, включая вызовы `drawSystemToken`) → `classicTheme.drawSystem`. `drawSystemToken` может остаться в `drawMapIcons.ts` как общий низкоуровневый примитив, если он переиспользуется другими темами (посмотреть по факту в задачах 02/03 — если да, не дублировать, экспортировать и импортировать).

Старые экспорты `drawTerritoryGlow`/`drawTerritoryBorders`/`drawSystemGlyph` в `drawMapIcons.ts` — либо оставить как тонкие обёртки, вызывающие `classicTheme.*` (чтобы не ломать другие места кода, которые их импортируют напрямую — проверить через grep все call sites в `MapCanvas.tsx` перед удалением), либо обновить все call sites на прямой вызов через реестр тем (Задача 9) — выбрать вариант с меньшим количеством затронутых файлов.

**Acceptance (критично):** скриншот карты с `mapStyle: "classic"` (или без явного `mapStyle` вовсе) до и после этого рефакторинга — **пиксель-в-пиксель идентичен** (сравнить вручную или через простой diff двух PNG). Это единственная задача в этом документе, где визуальная регрессия недопустима вообще.

---

## Задача 9 — Реестр тем и точки диспатча

Создать `src/renderers/styles/index.ts`:
```ts
import { classicTheme } from "./classicStyle";
import type { MapTheme, MapStyleId } from "./mapTheme";

export const MAP_THEMES: Record<MapStyleId, MapTheme> = {
  classic: classicTheme,
  imperial: classicTheme, // временная заглушка до 02-IMPERIAL-CARTOGRAPHY-TASKS.md
  holo: classicTheme,     // временная заглушка до 03-HOLOGRAPHIC-TABLE-TASKS.md
};

export function resolveTheme(id: MapStyleId): MapTheme {
  return MAP_THEMES[id] ?? MAP_THEMES.classic;
}
```

В `MapCanvas.tsx`, в местах, где сейчас напрямую вызываются `drawTerritoryGlow(...)`/`drawTerritoryBorders(...)`/`drawSystemGlyph(...)` внутри `redrawAll()` (искать через grep по этим именам — они встречаются в нескольких местах: инициализация, fingerprint-гейт ~2855-2874, per-frame tick) — заменить на:
```ts
const theme = resolveTheme(resolveMapStyle(model, tier));
theme.drawTerritory(territoryG, world, factionColors, anim, {...});
theme.drawTerritoryBorder(territoryBorderG, world, factionColors, anim);
// и т.д. для системных глифов
```

**Важно:** сохранить существующий fingerprint-кеш паттерн (`territoryFpRef`, `MapCanvas.tsx` ~2855-2874) — добавить `mapStyle` в строку фингерпринта (`fp = territoryFingerprint(world) + ":" + mapStyle + ...`), иначе смена темы не инвалидирует закешированную геометрию и старая картинка останется на экране до следующего непричастного изменения мира.

**Acceptance:** с заглушками (`imperial`/`holo` → `classicTheme`) выбор любого из 3 стилей в UI даёт одинаковую (текущую) картинку — это доказывает, что диспатч и инвалидация кеша работают, готово к передаче на 02/03.

---

## Задача 10 — Финальная проверка перед разделением на треки

- [ ] `npm run build` (или `tsc`) проходит без ошибок типов.
- [ ] Скриншот-сравнение по Задаче 8 подтверждён.
- [ ] Смена `mapStyle` в редакторе, на экране входа viewer'а и в «Настройках карты» viewer'а во время сессии — без ошибок в консоли, без remount canvas.
- [ ] `git status` — новые файлы `src/renderers/styles/*.ts`, изменения в `MapCanvas.tsx`, `worldStore.ts`, `ViewerPage.tsx`, `Toolbar.tsx`. Ничего лишнего не затронуто.

После этого пункта — параллельно раздать `02-IMPERIAL-CARTOGRAPHY-TASKS.md` и `03-HOLOGRAPHIC-TABLE-TASKS.md` двум агентам.
