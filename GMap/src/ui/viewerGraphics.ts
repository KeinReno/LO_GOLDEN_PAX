/** Viewer graphics toggles — independent of which map layers are on. */

export interface ViewerGraphicsPrefs {
  /** Pulse / battle motion clock */
  animations: boolean;
  /** Drop shadows on system name Text */
  labelShadows: boolean;
  /** Table floor + starfield background */
  tableFx: boolean;
  /** Battle rings / particle field */
  battleFx: boolean;
  /** Soft blur under territory fill (expensive) */
  territoryGlow: boolean;
  /** Rebuild geometry every zoom frame (off = rebuild after gesture — recommended) */
  liveZoomRebuild: boolean;
}

export const DEFAULT_GRAPHICS: ViewerGraphicsPrefs = {
  animations: true,
  labelShadows: true,
  tableFx: true,
  battleFx: true,
  territoryGlow: true,
  liveZoomRebuild: false,
};

export const GRAPHICS_FOR_PERF: Record<
  "ultralight" | "mobile" | "quality_mobile" | "quality",
  ViewerGraphicsPrefs
> = {
  ultralight: {
    animations: false,
    labelShadows: false,
    tableFx: false,
    battleFx: false,
    territoryGlow: false,
    liveZoomRebuild: false,
  },
  mobile: {
    animations: false,
    labelShadows: false,
    tableFx: true,
    battleFx: false,
    territoryGlow: false,
    liveZoomRebuild: false,
  },
  quality_mobile: {
    animations: true,
    labelShadows: false,
    tableFx: true,
    battleFx: true,
    territoryGlow: true,
    liveZoomRebuild: false,
  },
  quality: {
    animations: true,
    labelShadows: true,
    tableFx: true,
    battleFx: true,
    territoryGlow: true,
    liveZoomRebuild: false,
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

export function graphicsForPerf(
  mode: keyof typeof GRAPHICS_FOR_PERF,
): ViewerGraphicsPrefs {
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
    label: "Анимации",
    hint: "Пульс, мерцание, движение маркеров",
  },
  {
    key: "labelShadows",
    label: "Тени у названий",
    hint: "Красивее, но тяжелее на GPU",
  },
  {
    key: "tableFx",
    label: "Фон стола",
    hint: "Металлический стол и звёзды",
  },
  {
    key: "battleFx",
    label: "Эффекты боя",
    hint: "Кольца и вспышки на спорных системах",
  },
  {
    key: "territoryGlow",
    label: "Свечение территорий",
    hint: "Мягкая заливка с blur — дорого",
  },
  {
    key: "liveZoomRebuild",
    label: "Перерисовка при зуме",
    hint: "Выкл = плавный зум, подписи после жеста (рекомендуется)",
  },
];
