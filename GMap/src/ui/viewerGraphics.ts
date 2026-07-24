/** Viewer graphics toggles — independent of which map layers are on. */

export interface ViewerGraphicsPrefs {
  /** Pulse / battle motion clock */
  animations: boolean;
  /** Drop shadows on system name labels */
  labelShadows: boolean;
  /** Table floor + starfield background */
  tableFx: boolean;
  /** Battle rings / particle field */
  battleFx: boolean;
  /** Soft blur under territory fill (expensive) */
  territoryGlow: boolean;
  /** Rebuild geometry every zoom frame (off = rebuild after gesture — recommended) */
  liveZoomRebuild: boolean;
  /** On-map turn stamp HUD */
  turnStamp: boolean;
  /** Soft ember FX on debris / scar systems */
  scarFx: boolean;
  /** Extra cinematic polish (desktop only; never default on mobile) */
  cinematic: boolean;
}

export const DEFAULT_GRAPHICS: ViewerGraphicsPrefs = {
  animations: true,
  labelShadows: true,
  tableFx: true,
  battleFx: true,
  territoryGlow: true,
  liveZoomRebuild: false,
  turnStamp: true,
  scarFx: true,
  cinematic: false,
};

export type GraphicsPerfMode =
  | "ultralight"
  | "mobile"
  | "quality_mobile"
  | "quality"
  | "cinematic";

export const GRAPHICS_FOR_PERF: Record<GraphicsPerfMode, ViewerGraphicsPrefs> =
  {
    ultralight: {
      animations: false,
      labelShadows: false,
      tableFx: false,
      battleFx: false,
      territoryGlow: false,
      liveZoomRebuild: false,
      turnStamp: false,
      scarFx: false,
      cinematic: false,
    },
    mobile: {
      animations: false,
      labelShadows: false,
      tableFx: true,
      battleFx: false,
      territoryGlow: false,
      liveZoomRebuild: false,
      turnStamp: true,
      scarFx: false,
      cinematic: false,
    },
    quality_mobile: {
      animations: true,
      labelShadows: false,
      tableFx: true,
      battleFx: true,
      territoryGlow: true,
      liveZoomRebuild: false,
      turnStamp: true,
      scarFx: true,
      cinematic: false,
    },
    quality: {
      animations: true,
      labelShadows: true,
      tableFx: true,
      battleFx: true,
      territoryGlow: true,
      liveZoomRebuild: false,
      turnStamp: true,
      scarFx: true,
      cinematic: false,
    },
    cinematic: {
      animations: true,
      labelShadows: true,
      tableFx: true,
      battleFx: true,
      territoryGlow: true,
      liveZoomRebuild: false,
      turnStamp: true,
      scarFx: true,
      cinematic: true,
    },
  };

const STORAGE_KEY = "gmap-viewer-graphics";

export function readStoredGraphics(): ViewerGraphicsPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_GRAPHICS };
    const parsed = JSON.parse(raw) as Partial<ViewerGraphicsPrefs>;
    return { ...DEFAULT_GRAPHICS, ...parsed };
  } catch {
    return { ...DEFAULT_GRAPHICS };
  }
}

export function writeStoredGraphics(prefs: ViewerGraphicsPrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

export function graphicsForPerf(mode: GraphicsPerfMode): ViewerGraphicsPrefs {
  return { ...GRAPHICS_FOR_PERF[mode] };
}

export type GraphicsPrefKey = keyof ViewerGraphicsPrefs;

export const GRAPHICS_TOGGLES: {
  key: GraphicsPrefKey;
  label: string;
  hint: string;
}[] = [
  {
    key: "animations",
    label: "Анимация",
    hint: "Пульс и движение на карте",
  },
  {
    key: "labelShadows",
    label: "Тени подписей",
    hint: "Мягкая тень у имён систем",
  },
  {
    key: "tableFx",
    label: "Стол / фон",
    hint: "Пол стола и звёзды",
  },
  {
    key: "battleFx",
    label: "Бой FX",
    hint: "Искры / кольца в системах сражения",
  },
  {
    key: "scarFx",
    label: "Шрамы",
    hint: "Тлеющие обломки после боя",
  },
  {
    key: "territoryGlow",
    label: "Свечение терр.",
    hint: "Blur под территориями (дорого)",
  },
  {
    key: "turnStamp",
    label: "Штамп хода",
    hint: "Надпись «ход N» на карте",
  },
  {
    key: "cinematic",
    label: "Cinematic",
    hint: "Макс. эффекты (не для телефона)",
  },
  {
    key: "liveZoomRebuild",
    label: "Live zoom",
    hint: "Пересборка на каждом кадре зума",
  },
];
