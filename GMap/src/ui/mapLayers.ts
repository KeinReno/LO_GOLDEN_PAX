/** Shared map layer visibility — faction-neutral overlays (ES2-style). */

export interface MapLayerFlags {
  showLinks: boolean;
  showOwnership: boolean;
  showTerritory: boolean;
  showSectors: boolean;
  showFactionLabels: boolean;
  showLabels: boolean;
  showFleets: boolean;
  showLegions: boolean;
  showOrders: boolean;
  showDiplomacy: boolean;
  showFogPreview: boolean;
  gmOmniscientView: boolean;
  showJumpRange: boolean;
  showSupply: boolean;
  showCaravans: boolean;
  showBlockades: boolean;
  showDeadZones: boolean;
  showTraffic: boolean;
  showQuests: boolean;
  /** Loyalty heat halo (A3). */
  showLoyalty: boolean;
  /**
   * Signal icon layout on systems:
   * false/undefined = priority stack (1–2 icons + "+N")
   * true = fan (up to 4 icons, no overflow chip)
   */
  showSignalFan?: boolean;
}

export type MapLayerKey = keyof MapLayerFlags;

/** Lucide icon names used by viewer/editor chrome */
export type LayerLucideIcon =
  | "map"
  | "route"
  | "ship"
  | "shield"
  | "navigation"
  | "type"
  | "landmark"
  | "circle-dot"
  | "handshake"
  | "eye-off"
  | "eye"
  | "flag"
  | "radar"
  | "truck"
  | "zap"
  | "help-circle"
  | "activity"
  | "heart";

export const DEFAULT_MAP_LAYERS: MapLayerFlags = {
  showLinks: true,
  showOwnership: false,
  showTerritory: true,
  showSectors: false,
  showFactionLabels: true,
  showLabels: true,
  showFleets: true,
  showLegions: true,
  showOrders: true,
  showDiplomacy: false,
  showFogPreview: false,
  gmOmniscientView: true,
  showJumpRange: true,
  showSupply: false,
  showCaravans: true,
  showBlockades: true,
  showDeadZones: true,
  showTraffic: true,
  showQuests: true,
  showLoyalty: false,
  showSignalFan: false,
};

/** Light defaults for phone / ultralight — fewer overlays = higher FPS. */
export const MOBILE_LIGHT_LAYERS: MapLayerFlags = {
  showLinks: true,
  showOwnership: false,
  showTerritory: true,
  showSectors: false,
  showFactionLabels: false,
  showLabels: true,
  showFleets: true,
  showLegions: false,
  showOrders: true,
  showDiplomacy: false,
  showFogPreview: false,
  gmOmniscientView: true,
  showJumpRange: false,
  showSupply: false,
  showCaravans: false,
  showBlockades: false,
  showDeadZones: false,
  showTraffic: false,
  showQuests: false,
  showLoyalty: false,
  showSignalFan: false,
};

export const ULTRALIGHT_LAYERS: MapLayerFlags = {
  showLinks: true,
  showOwnership: false,
  showTerritory: false,
  showSectors: false,
  showFactionLabels: false,
  showLabels: false,
  showFleets: true,
  showLegions: false,
  showOrders: false,
  showDiplomacy: false,
  showFogPreview: false,
  gmOmniscientView: true,
  showJumpRange: false,
  showSupply: false,
  showCaravans: false,
  showBlockades: false,
  showDeadZones: false,
  showTraffic: false,
  showQuests: false,
  showLoyalty: false,
  showSignalFan: false,
};

export type ViewerPerfChoice =
  | "ultralight"
  | "mobile"
  | "quality_mobile"
  | "quality"
  | "cinematic";

/** Layer preset applied when player picks a performance mode at login. */
export function layersForPerfChoice(mode: ViewerPerfChoice): MapLayerFlags {
  if (mode === "ultralight") return { ...ULTRALIGHT_LAYERS };
  if (mode === "mobile") return { ...MOBILE_LIGHT_LAYERS };
  if (mode === "quality_mobile") {
    return {
      ...DEFAULT_MAP_LAYERS,
      showTraffic: false,
      showCaravans: false,
      showSupply: false,
      showQuests: false,
      showDeadZones: false,
      showLegions: true,
      showFactionLabels: true,
    };
  }
  if (mode === "cinematic") {
    return {
      ...DEFAULT_MAP_LAYERS,
      showOwnership: true,
      showDiplomacy: true,
      showQuests: true,
      showTraffic: true,
      showCaravans: true,
    };
  }
  return { ...DEFAULT_MAP_LAYERS };
}

/** Compact on-map chips (viewer). */
export const VIEWER_LAYER_CHIPS: {
  key: MapLayerKey;
  label: string;
  title: string;
  icon: LayerLucideIcon;
}[] = [
  { key: "showTerritory", label: "Терр.", title: "Территории", icon: "map" },
  { key: "showLinks", label: "Связи", title: "Гиперлинии", icon: "route" },
  { key: "showFleets", label: "Флоты", title: "Флоты", icon: "ship" },
  { key: "showLegions", label: "Легионы", title: "Легионы", icon: "shield" },
  { key: "showOrders", label: "Приказы", title: "Приказы и маршруты", icon: "navigation" },
  { key: "showLabels", label: "Имена", title: "Подписи систем", icon: "type" },
  { key: "showQuests", label: "Квесты", title: "Квесты", icon: "help-circle" },
  {
    key: "showSignalFan",
    label: "Веер",
    title: "Сигналы: веер иконок вместо +N",
    icon: "activity",
  },
];

export const EDITOR_LAYER_GROUPS: {
  title: string;
  items: { key: MapLayerKey; label: string; icon: LayerLucideIcon }[];
}[] = [
  {
    title: "Политика",
    items: [
      { key: "showTerritory", label: "Территории", icon: "map" },
      { key: "showOwnership", label: "Ауры владения", icon: "circle-dot" },
      { key: "showSectors", label: "Секторы", icon: "landmark" },
      { key: "showFactionLabels", label: "Имена / гербы", icon: "flag" },
      { key: "showDiplomacy", label: "Дипломатия", icon: "handshake" },
      { key: "showSupply", label: "Снабжение", icon: "route" },
    ],
  },
  {
    title: "Военное",
    items: [
      { key: "showFleets", label: "Флоты", icon: "ship" },
      { key: "showLegions", label: "Легионы", icon: "shield" },
      { key: "showOrders", label: "Приказы", icon: "navigation" },
      { key: "showJumpRange", label: "Дальность прыжка", icon: "radar" },
      { key: "showBlockades", label: "Блокады", icon: "zap" },
    ],
  },
  {
    title: "Карта",
    items: [
      { key: "showLinks", label: "Связи / врата", icon: "route" },
      { key: "showLabels", label: "Подписи систем", icon: "type" },
      { key: "showFogPreview", label: "Скрытое (как у игрока)", icon: "eye-off" },
      { key: "gmOmniscientView", label: "Видимость ГМа", icon: "eye" },
      { key: "showDeadZones", label: "Мёртвые зоны", icon: "eye-off" },
      { key: "showTraffic", label: "Трафик хабов", icon: "activity" },
      { key: "showCaravans", label: "Караваны", icon: "truck" },
      { key: "showQuests", label: "Квесты", icon: "help-circle" },
    ],
  },
];


export type LayerPresetId =
  | "overview"
  | "politics"
  | "military"
  | "war"
  | "econ"
  | "logistics"
  | "quest"
  | "loyalty"
  | "gm"
  | "minimal";

export const LAYER_PRESETS: {
  id: LayerPresetId;
  label: string;
  hint: string;
  flags: Partial<MapLayerFlags>;
}[] = [
  {
    id: "overview",
    label: "Обзор",
    hint: "Баланс: территории, связи, силы, имена",
    flags: {
      showTerritory: true,
      showOwnership: false,
      showSectors: false,
      showLinks: true,
      showFleets: true,
      showLegions: true,
      showOrders: true,
      showLabels: true,
      showFactionLabels: true,
      showDiplomacy: false,
      showSupply: false,
      showTraffic: true,
      showQuests: true,
      showFogPreview: false,
    },
  },
  {
    id: "politics",
    label: "Политика",
    hint: "Владение и дипломатия без военной суеты",
    flags: {
      showTerritory: true,
      showOwnership: true,
      showSectors: true,
      showFactionLabels: true,
      showLabels: true,
      showLinks: true,
      showFleets: false,
      showLegions: false,
      showOrders: false,
      showDiplomacy: true,
      showSupply: false,
      showJumpRange: false,
      showQuests: false,
      showCaravans: false,
      showFogPreview: false,
    },
  },
  {
    id: "military",
    label: "Война",
    hint: "Флоты, легионы, приказы, блокады, прыжок",
    flags: {
      showTerritory: true,
      showOwnership: false,
      showSectors: false,
      showFleets: true,
      showLegions: true,
      showOrders: true,
      showLinks: true,
      showLabels: true,
      showFactionLabels: false,
      showDiplomacy: false,
      showJumpRange: true,
      showBlockades: true,
      showSupply: false,
      showQuests: false,
      showCaravans: false,
      showTraffic: false,
      showFogPreview: false,
    },
  },
  {
    id: "war",
    label: "Война (алиас)",
    hint: "То же, что «Война»",
    flags: {
      showTerritory: true,
      showOwnership: false,
      showSectors: false,
      showFleets: true,
      showLegions: true,
      showOrders: true,
      showLinks: true,
      showLabels: true,
      showFactionLabels: false,
      showDiplomacy: false,
      showJumpRange: true,
      showBlockades: true,
      showSupply: false,
      showQuests: false,
      showCaravans: false,
      showTraffic: false,
      showFogPreview: false,
    },
  },
  {
    id: "econ",
    label: "Экономика",
    hint: "Снабжение, караваны, хабы, владение",
    flags: {
      showTerritory: true,
      showOwnership: true,
      showSectors: false,
      showFactionLabels: true,
      showLabels: true,
      showLinks: true,
      showFleets: false,
      showLegions: false,
      showOrders: false,
      showDiplomacy: false,
      showSupply: true,
      showCaravans: true,
      showTraffic: true,
      showJumpRange: false,
      showBlockades: false,
      showQuests: false,
      showFogPreview: false,
    },
  },
  {
    id: "logistics",
    label: "Логистика",
    hint: "Сеть снабжения: зелёный / узкое место / отрезано",
    flags: {
      showTerritory: true,
      showOwnership: true,
      showSectors: false,
      showFactionLabels: true,
      showLabels: true,
      showLinks: true,
      showFleets: false,
      showLegions: false,
      showOrders: false,
      showDiplomacy: false,
      showSupply: true,
      showCaravans: false,
      showTraffic: false,
      showJumpRange: false,
      showBlockades: true,
      showQuests: false,
      showFogPreview: false,
      showDeadZones: false,
    },
  },
  {
    id: "quest",
    label: "Квест",
    hint: "Квесты и подписи, минимум войны",
    flags: {
      showTerritory: false,
      showOwnership: false,
      showSectors: false,
      showFactionLabels: false,
      showLabels: true,
      showLinks: true,
      showFleets: false,
      showLegions: false,
      showOrders: false,
      showDiplomacy: false,
      showSupply: false,
      showCaravans: false,
      showTraffic: false,
      showQuests: true,
      showLoyalty: false,
      showJumpRange: false,
      showBlockades: false,
      showFogPreview: false,
    },
  },
  {
    id: "loyalty",
    label: "Лояльность",
    hint: "Ореол лояльности населения: красный / жёлтый / зелёный",
    flags: {
      showTerritory: true,
      showOwnership: false,
      showSectors: false,
      showFactionLabels: true,
      showLabels: true,
      showLinks: true,
      showFleets: false,
      showLegions: false,
      showOrders: false,
      showDiplomacy: false,
      showSupply: false,
      showCaravans: false,
      showTraffic: false,
      showQuests: false,
      showLoyalty: true,
      showJumpRange: false,
      showBlockades: false,
      showFogPreview: false,
    },
  },
  {
    id: "gm",
    label: "GM",
    hint: "Туман-превью, дипломатия, владение, всё видно",
    flags: {
      showTerritory: true,
      showOwnership: true,
      showSectors: true,
      showFactionLabels: true,
      showLabels: true,
      showLinks: true,
      showFleets: true,
      showLegions: true,
      showOrders: true,
      showDiplomacy: true,
      showSupply: false,
      showCaravans: true,
      showTraffic: true,
      showQuests: true,
      showLoyalty: false,
      showJumpRange: true,
      showBlockades: true,
      showDeadZones: true,
      showFogPreview: true,
    },
  },
  {
    id: "minimal",
    label: "Минимум",
    hint: "Только узлы и связи",
    flags: {
      showTerritory: false,
      showOwnership: false,
      showSectors: false,
      showFleets: false,
      showLegions: false,
      showOrders: false,
      showLabels: false,
      showFactionLabels: false,
      showDiplomacy: false,
      showLinks: true,
      showJumpRange: false,
      showSupply: false,
      showCaravans: false,
      showBlockades: false,
      showDeadZones: false,
      showTraffic: false,
      showQuests: false,
      showFogPreview: false,
    },
  },
];

/** Primary map modes — toolbar chips + on-map strip (F5–F9). */
export const MAP_MODE_PRESETS: {
  id: LayerPresetId;
  label: string;
  hint: string;
  hotkey: string;
}[] = [
  {
    id: "politics",
    label: "Политика",
    hint: "Владение и дипломатия без военной суеты",
    hotkey: "F5",
  },
  {
    id: "military",
    label: "Война",
    hint: "Флоты, легионы, приказы, блокады, прыжок",
    hotkey: "F6",
  },
  {
    id: "econ",
    label: "Экономика",
    hint: "Снабжение, караваны, хабы, владение",
    hotkey: "F7",
  },
  {
    id: "quest",
    label: "Квест",
    hint: "Квесты и подписи, минимум войны",
    hotkey: "F8",
  },
  {
    id: "gm",
    label: "GM",
    hint: "Туман-превью, дипломатия, владение, всё видно",
    hotkey: "F9",
  },
  {
    id: "logistics",
    label: "Логистика",
    hint: "Сеть снабжения от столицы",
    hotkey: "F10",
  },
  {
    id: "loyalty",
    label: "Лояльность",
    hint: "Ореол лояльности населения",
    hotkey: "F4",
  },
];

const MAP_MODE_PRESET_IDS = new Set<LayerPresetId>([
  "politics",
  "military",
  "war",
  "econ",
  "logistics",
  "quest",
  "loyalty",
  "gm",
]);

/** Extra presets in settings (overview / minimal). */
export const LAYER_PRESET_BUTTONS = LAYER_PRESETS.filter(
  (p) => p.id === "overview" || p.id === "minimal",
);

/** Keys compared when highlighting an active map mode. */
const MODE_MATCH_KEYS: MapLayerKey[] = [
  "showTerritory",
  "showOwnership",
  "showSectors",
  "showFactionLabels",
  "showLabels",
  "showLinks",
  "showFleets",
  "showLegions",
  "showOrders",
  "showDiplomacy",
  "showJumpRange",
  "showBlockades",
  "showSupply",
  "showCaravans",
  "showTraffic",
  "showQuests",
  "showLoyalty",
  "showFogPreview",
  "showDeadZones",
];

function presetFlagsMatch(
  current: MapLayerFlags,
  partial: Partial<MapLayerFlags>,
): boolean {
  for (const key of MODE_MATCH_KEYS) {
    if (key in partial && current[key] !== partial[key]) return false;
  }
  return true;
}

export function activeMapModePreset(
  flags: MapLayerFlags,
): LayerPresetId | null {
  for (const mode of MAP_MODE_PRESETS) {
    const preset = LAYER_PRESETS.find((p) => p.id === mode.id);
    if (preset && presetFlagsMatch(flags, preset.flags)) return mode.id;
  }
  return null;
}

export function mapModePresetFromHotkey(key: string): LayerPresetId | null {
  return MAP_MODE_PRESETS.find((p) => p.hotkey === key)?.id ?? null;
}

const STORAGE_KEY = "gmap-viewer-layers";
/** One-shot: turn off capital→systems spokes that used to default on. */
const SUPPLY_OFF_MIGRATION = "gmap-viewer-layers-supply-off-v1";

export function readStoredViewerLayers(): MapLayerFlags {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_MAP_LAYERS };
    const parsed = JSON.parse(raw) as Partial<MapLayerFlags>;
    let flags: MapLayerFlags = { ...DEFAULT_MAP_LAYERS, ...parsed };
    if (!localStorage.getItem(SUPPLY_OFF_MIGRATION)) {
      flags = { ...flags, showSupply: false };
      localStorage.setItem(SUPPLY_OFF_MIGRATION, "1");
      localStorage.setItem(STORAGE_KEY, JSON.stringify(flags));
    }
    return flags;
  } catch {
    return { ...DEFAULT_MAP_LAYERS };
  }
}

export function writeStoredViewerLayers(flags: MapLayerFlags): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(flags));
  } catch {
    /* ignore */
  }
}

export function applyLayerPreset(
  current: MapLayerFlags,
  id: LayerPresetId,
): MapLayerFlags {
  const resolved = id === "war" ? "military" : id;
  const preset = LAYER_PRESETS.find((p) => p.id === resolved);
  if (!preset) return current;
  const base = MAP_MODE_PRESET_IDS.has(resolved)
    ? { ...DEFAULT_MAP_LAYERS, gmOmniscientView: current.gmOmniscientView }
    : { ...current };
  return { ...base, ...preset.flags };
}
