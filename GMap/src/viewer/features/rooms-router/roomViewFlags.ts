import type { PlayerView } from "../../viewerNavTypes";

const DESKTOP_WORKBENCH: ReadonlySet<PlayerView> = new Set([
  "hq",
  "forces",
  "research",
  "economy",
  "market",
  "diplomacy",
  "quests",
  "court",
  "codex",
]);

export function isDesktopWorkbenchView(
  mobile: boolean,
  viewMode: PlayerView,
): boolean {
  return !mobile && DESKTOP_WORKBENCH.has(viewMode);
}

export function isMobileImmersiveView(
  mobile: boolean,
  viewMode: PlayerView,
): boolean {
  return mobile && (viewMode === "rp" || viewMode === "quests");
}

export function pickRoomKey(
  viewMode: PlayerView,
  mobileImmersive: boolean,
): PlayerView | null {
  if (viewMode === "map" || viewMode === "orders") return null;
  if (viewMode === "rp") return "rp";
  if (viewMode === "quests" && mobileImmersive) return "quests";
  return viewMode;
}
