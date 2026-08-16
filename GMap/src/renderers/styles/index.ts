import { classicTheme } from "./classicStyle";
import { imperialTheme } from "./imperialTheme";
import { holoTheme } from "./holoTheme";
import type { MapTheme, MapStyleId } from "./mapTheme";

export const MAP_THEMES: Record<MapStyleId, MapTheme> = {
  classic: classicTheme,
  imperial: imperialTheme,
  holo: holoTheme,
};

export function resolveTheme(id: MapStyleId): MapTheme {
  return MAP_THEMES[id] ?? MAP_THEMES.classic;
}

export type { FactionThemeColors, IconPlateStyle, MapStyleId, MapTheme } from "./mapTheme";
export { buildFactionThemeColorMap, resolveFactionThemeColors } from "./mapTheme";
