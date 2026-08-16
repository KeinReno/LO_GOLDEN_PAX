import type { MapStyleId } from "../renderers/styles/mapTheme";

const EDITOR_STORAGE_KEY = "gmap-editor-map-style";
const VIEWER_STORAGE_KEY = "gmap-viewer-map-style";

const VALID: MapStyleId[] = ["classic", "imperial", "holo"];

function parseMapStyle(raw: string | null): MapStyleId | null {
  if (raw && (VALID as string[]).includes(raw)) return raw as MapStyleId;
  return null;
}

/** GM editor — persisted in worldStore. */
export function readStoredMapStyle(): MapStyleId {
  try {
    return parseMapStyle(localStorage.getItem(EDITOR_STORAGE_KEY)) ?? "classic";
  } catch {
    return "classic";
  }
}

export function writeStoredMapStyle(style: MapStyleId): void {
  try {
    localStorage.setItem(EDITOR_STORAGE_KEY, style);
  } catch {
    /* ignore */
  }
}

/** Viewer login + in-session preference. */
export function readStoredViewerMapStyle(): MapStyleId {
  try {
    return parseMapStyle(localStorage.getItem(VIEWER_STORAGE_KEY)) ?? "classic";
  } catch {
    return "classic";
  }
}

export function writeStoredViewerMapStyle(style: MapStyleId): void {
  try {
    localStorage.setItem(VIEWER_STORAGE_KEY, style);
  } catch {
    /* ignore */
  }
}

export const MAP_STYLE_OPTIONS: {
  id: MapStyleId;
  label: string;
  hint: string;
}[] = [
  {
    id: "classic",
    label: "Классика",
    hint: "Текущий вид карты — безопасный дефолт.",
  },
  {
    id: "imperial",
    label: "Империя",
    hint: "Иллюминированный звёздный атлас — золото, розетки, плашки.",
  },
  {
    id: "holo",
    label: "Голо",
    hint: "Голографический стол брифинга — каркас, HUD-скобки, пульс.",
  },
];
