import { Container, Graphics, Text, Sprite } from "pixi.js";
import type { WorldState } from "../../state/types";
import type { AnimClock } from "../drawMapIcons";
import type { MapStyleId } from "../styles";
import { clearHoloPlaqueCache } from "../styles/holoTheme";
import { clearImperialPlaqueCache } from "../styles/imperialTheme";
import type { MapViewModel, PerfTier } from "./types";

export const STATIC_ANIM: AnimClock = { t: 0, pulse: 0.5, pulse2: 0.5 };

export function territoryFingerprint(world: WorldState): string {
  const sys = world.systems
    .map(
      (s) =>
        `${s.id}:${s.ownerFactionId ?? ""}:${s.x.toFixed(1)}:${s.y.toFixed(1)}`,
    )
    .join("|");
  const fac = world.factions
    .map(
      (f) =>
        `${f.id}:${f.kind ?? ""}:${f.color}:${f.fillColor ?? ""}:${f.borderColor ?? ""}:${f.systemColor ?? ""}`,
    )
    .join("|");
  return `${sys}||${fac}`;
}

export function resolvePerfTier(
  mode: "editor" | "viewer",
  pref: MapViewModel["perfMode"],
): PerfTier {
  if (pref === "quality" || pref === "cinematic") return "full";
  if (pref === "quality_mobile") return "soft";
  if (pref === "ultralight") return "bare";
  if (pref === "mobile") return "lite";
  if (mode !== "viewer" || typeof window === "undefined") return "full";
  if (window.matchMedia("(max-width: 700px)").matches) return "soft";
  return "full";
}

export function resolveMapStyle(model: MapViewModel, _tier: PerfTier): MapStyleId {
  return model.mapStyle ?? "classic";
}

export function isFactionLabelKey(key: string): boolean {
  return key.startsWith("fac:") || key.startsWith("facpfx:");
}

/** Drop theme-specific label plaques/prefixes so style switches cannot stack artifacts. */
export function purgeThemeLabelCaches(
  labels: Container | null,
  labelMap: Map<string, Text>,
  emblemMap: Map<string, Sprite>,
  emblemLoading: Set<string>,
): void {
  for (const [key, label] of [...labelMap.entries()]) {
    if (isFactionLabelKey(key)) {
      labels?.removeChild(label);
      label.destroy();
      labelMap.delete(key);
    }
  }
  for (const [key, sprite] of [...emblemMap.entries()]) {
    if (key.startsWith("emb:")) {
      labels?.removeChild(sprite);
      sprite.destroy();
      emblemMap.delete(key);
    }
  }
  emblemLoading.clear();
  // Destroyed Graphics stay in theme WeakMaps unless we drop them here —
  // style switch then blows up on plaque.clear() every frame.
  clearImperialPlaqueCache(labels);
  clearHoloPlaqueCache(labels);
  if (labels) {
    const tagged = labels as Container & { __embGen?: number };
    tagged.__embGen = (tagged.__embGen ?? 0) + 1;
  }
  if (!labels) return;
  for (let i = labels.children.length - 1; i >= 0; i--) {
    const child = labels.children[i];
    if (child instanceof Graphics) {
      labels.removeChild(child);
      child.destroy();
    }
  }
}

export function resolveGraphics(
  model: MapViewModel,
  tier: PerfTier,
): {
  animations: boolean;
  labelShadows: boolean;
  tableFx: boolean;
  battleFx: boolean;
  territoryGlow: boolean;
  liveZoomRebuild: boolean;
  turnStamp: boolean;
  scarFx: boolean;
  cinematic: boolean;
} {
  const g = model.graphics ?? {};
  const defaults =
    tier === "bare"
      ? {
          animations: false,
          labelShadows: false,
          tableFx: false,
          battleFx: false,
          territoryGlow: false,
          liveZoomRebuild: false,
          turnStamp: false,
          scarFx: false,
          cinematic: false,
        }
      : tier === "lite"
        ? {
            animations: false,
            labelShadows: false,
            tableFx: true,
            battleFx: false,
            territoryGlow: false,
            liveZoomRebuild: false,
            turnStamp: true,
            scarFx: false,
            cinematic: false,
          }
        : tier === "soft"
          ? {
              animations: true,
              labelShadows: false,
              tableFx: true,
              battleFx: true,
              territoryGlow: true,
              liveZoomRebuild: false,
              turnStamp: true,
              scarFx: true,
              cinematic: false,
            }
          : {
              animations: true,
              labelShadows: true,
              tableFx: true,
              battleFx: true,
              territoryGlow: true,
              liveZoomRebuild: false,
              turnStamp: true,
              scarFx: true,
              cinematic: model.perfMode === "cinematic",
            };
  return {
    animations: g.animations ?? defaults.animations,
    labelShadows: g.labelShadows ?? defaults.labelShadows,
    tableFx: g.tableFx ?? defaults.tableFx,
    battleFx: g.battleFx ?? defaults.battleFx,
    territoryGlow: g.territoryGlow ?? defaults.territoryGlow,
    liveZoomRebuild: g.liveZoomRebuild ?? defaults.liveZoomRebuild,
    turnStamp: g.turnStamp ?? defaults.turnStamp,
    scarFx: g.scarFx ?? defaults.scarFx,
    cinematic: g.cinematic ?? defaults.cinematic,
  };
}

