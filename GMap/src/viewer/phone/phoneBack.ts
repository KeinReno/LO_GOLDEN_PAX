import type { PlayerView } from "../viewerNavTypes";

export type PhoneBackSnap = {
  dockMoreOpen: boolean;
  queueOpen: boolean;
  menuOpen: boolean;
  settingsOpen: boolean;
  mapFiltersOpen: boolean;
  mapFocusLevel: string;
  systemFocusId: string | null;
  viewMode: PlayerView;
};

export type PhoneBackLayer =
  | "more"
  | "queue"
  | "drawer"
  | "planet"
  | "dive"
  | "room";

/** Top overlay the Android Back key should close. Null = leave the table. */
export function pickPhoneBackLayer(s: PhoneBackSnap): PhoneBackLayer | null {
  if (s.dockMoreOpen) return "more";
  if (s.queueOpen) return "queue";
  if (s.menuOpen || s.settingsOpen || s.mapFiltersOpen) return "drawer";
  if (s.mapFocusLevel === "planet") return "planet";
  if (s.systemFocusId) return "dive";
  if (s.viewMode !== "map" && s.viewMode !== "orders") return "room";
  return null;
}
