import type { Container, Graphics, Sprite, Text } from "pixi.js";
import type { Faction, StarSystem, WorldState } from "../../state/types";
import {
  resolveFactionBorder,
  resolveFactionFill,
  resolveFactionNameColor,
  resolveFactionNameFont,
  resolveFactionSystemColor,
} from "../../state/territory";
import { parseFactionColor, type AnimClock, type MapLod } from "../drawMapIcons";

export type MapStyleId = "classic" | "imperial" | "holo";

export type IconPlateStyle = "classic" | "imperial-rim" | "holo-outline";

/** Faction colors — always from territory resolvers, never a fixed palette. */
export interface FactionThemeColors {
  fill: number;
  border: number;
  system: number;
  name: number;
  nameFont: string;
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
    colors: FactionThemeColors | undefined,
    lod: MapLod,
    shareColors: number[] | undefined,
    opts: { dim: number; emphasize: boolean },
  ): void;

  iconPlateStyle: IconPlateStyle;

  /** When omitted, MapCanvas falls back to drawFactionLabels in drawMapIcons. */
  drawFactionLabels?: (
    labels: Container,
    world: WorldState,
    anim: AnimClock,
    textCache: Map<string, Text>,
    emblemCache: Map<string, Sprite>,
    emblemLoading: Set<string>,
    factionColors: Map<string, FactionThemeColors>,
    labelScale?: number,
    onlyFactionId?: string | null,
  ) => void;
}

export function resolveFactionThemeColors(f: Faction): FactionThemeColors {
  return {
    fill: parseFactionColor(resolveFactionFill(f)),
    border: parseFactionColor(resolveFactionBorder(f)),
    system: parseFactionColor(resolveFactionSystemColor(f)),
    name: parseFactionColor(resolveFactionNameColor(f)),
    nameFont: resolveFactionNameFont(f),
  };
}

export function buildFactionThemeColorMap(
  factions: Faction[],
): Map<string, FactionThemeColors> {
  return new Map(factions.map((f) => [f.id, resolveFactionThemeColors(f)]));
}
