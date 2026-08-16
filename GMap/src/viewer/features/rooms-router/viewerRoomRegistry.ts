import type { ReactNode } from "react";
import type { PlayerView } from "../../viewerNavTypes";
import { pickRoomKey } from "./roomViewFlags.ts";

export type ViewerRoomPanels = Partial<Record<PlayerView, ReactNode>>;

export function resolveViewerRoomPanel(
  viewMode: PlayerView,
  mobileImmersive: boolean,
  panels: ViewerRoomPanels,
): ReactNode {
  if (mobileImmersive) return null;
  if (viewMode === "rp") return null;
  const key = pickRoomKey(viewMode, mobileImmersive);
  if (!key) return null;
  return panels[key] ?? null;
}

export function resolveImmersivePanel(
  viewMode: PlayerView,
  mobileImmersive: boolean,
  panels: ViewerRoomPanels,
): ReactNode {
  if (!mobileImmersive) return null;
  if (viewMode === "rp") return panels.rp ?? null;
  if (viewMode === "quests") return panels.quests ?? null;
  return null;
}
