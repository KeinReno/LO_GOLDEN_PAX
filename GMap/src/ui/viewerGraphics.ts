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
  /** Soft baked bloom under territory fill (no live BlurFilter) */
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
const EDITOR_STORAGE_KEY = "gmap-editor-graphics";

/** Desktop-quality defaults for the GM editor — cinematic off by default. */
export const EDITOR_DEFAULT_GRAPHICS: ViewerGraphicsPrefs = {
  ...GRAPHICS_FOR_PERF.quality,
};

export function isLikelyMobileViewport(): boolean {
  // Keep in sync with viewer/useViewerViewport.isLikelyMobile (layout + portrait).
  if (typeof window === "undefined") return false;
  try {
    const mq = window.matchMedia("(max-width: 900px)").matches;
    const vw = window.visualViewport?.width ?? window.innerWidth;
    const vh = window.visualViewport?.height ?? window.innerHeight;
    const portraitPhone = vw <= 900 || (vw < vh && vw <= 980);
    return mq || portraitPhone;
  } catch {
    return false;
  }
}

/** Cinematic is desktop-only — downgrade if stored on a phone/tablet viewport. */
export function clampPerfForDevice(mode: GraphicsPerfMode): GraphicsPerfMode {
  if (mode === "cinematic" && isLikelyMobileViewport()) {
    return "quality_mobile";
  }
  return mode;
}

export function readStoredEditorGraphics(): ViewerGraphicsPrefs {
  try {
    const raw = localStorage.getItem(EDITOR_STORAGE_KEY);
    if (!raw) return { ...EDITOR_DEFAULT_GRAPHICS };
    const parsed = JSON.parse(raw) as Partial<ViewerGraphicsPrefs>;
    const merged = { ...EDITOR_DEFAULT_GRAPHICS, ...parsed };
    if (isLikelyMobileViewport()) merged.cinematic = false;
    return merged;
  } catch {
    return { ...EDITOR_DEFAULT_GRAPHICS };
  }
}

export function writeStoredEditorGraphics(prefs: ViewerGraphicsPrefs): void {
  try {
    localStorage.setItem(EDITOR_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

export function readStoredGraphics(): ViewerGraphicsPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_GRAPHICS };
    const parsed = JSON.parse(raw) as Partial<ViewerGraphicsPrefs>;
    const merged = { ...DEFAULT_GRAPHICS, ...parsed };
    if (isLikelyMobileViewport()) merged.cinematic = false;
    return merged;
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
    label: "Бой (эффекты)",
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
    label: "Кино",
    hint: "Доп. polish: звёзды, тени, пульс. Тяжелее — только ПК.",
  },
  {
    key: "liveZoomRebuild",
    label: "Зум карты",
    hint: "Пересборка на каждом кадре зума",
  },
];
