import type { MarketTab } from "./MarketPanel";

/** Map-first rooms; forces / diplo also from Штаб. RP = scene with GM only. */
export type PlayerView =
  | "hq"
  | "forces"
  | "orders"
  | "research"
  | "economy"
  | "market"
  | "diplomacy"
  | "quests"
  | "map"
  | "court"
  | "rp"
  | "codex";

/** Sub-tabs when биржа room is open (1–4): лоты / котировки / валюты / державы. */
export const MARKET_TAB_BY_DIGIT: Record<string, MarketTab> = {
  "1": "trade",
  "2": "quotes",
  "3": "currencies",
  "4": "superpowers",
};

/** Digit hotkeys for dock rooms (F5–F9 reserved for map layer presets).
 *
 * | Key | View      | Tier      | Notes                          |
 * |-----|-----------|-----------|--------------------------------|
 * | 1   | map       | primary   | daily loop                     |
 * | 2   | forces    | primary   |                                |
 * | 3   | economy   | primary   |                                |
 * | 4   | research  | primary   |                                |
 * | 5   | diplomacy | primary   |                                |
 * | 6   | market    | secondary |                                |
 * | 7   | quests    | secondary |                                |
 * | 8   | court     | secondary | keyboard reachability (T6.4)   |
 * | 9   | codex     | non-room  | reference                      |
 * | R   | rp        | chrome    | scene with GM                   |
 * | H   | hq        | non-room  | hub / attention router         |
 * | Q   | —         | chrome    | order queue toggle             |
 * | B   | —         | chrome    | dock collapse toggle           |
 * RP on desk = R (not a digit; F5–F9 are map layers). Mobile primary = 1–5 + «Ещё» (5 = diplomacy). */
export function dockViewFromDigit(
  key: string,
  isMobile: boolean,
): PlayerView | null {
  if (isMobile) {
    const mobileMap: Record<string, PlayerView> = {
      "1": "map",
      "2": "forces",
      "3": "economy",
      "4": "research",
      "5": "diplomacy",
    };
    return mobileMap[key] ?? null;
  }
  const desktopMap: Record<string, PlayerView> = {
    "1": "map",
    "2": "forces",
    "3": "economy",
    "4": "research",
    "5": "diplomacy",
    "6": "market",
    "7": "quests",
    "8": "court",
    "9": "codex",
  };
  return desktopMap[key] ?? null;
}

export const PLAYER_START_KEY = "gmap-player-start";

export function readStoredStart(): "hq" | "map" | null {
  try {
    const v = localStorage.getItem(PLAYER_START_KEY);
    if (v === "hq" || v === "map") return v;
  } catch {
    /* ignore */
  }
  return null;
}

export function writeStoredStart(mode: "hq" | "map"): void {
  try {
    localStorage.setItem(PLAYER_START_KEY, mode);
  } catch {
    /* ignore */
  }
}

export function defaultStartForDevice(): "hq" | "map" {
  /* Galaxy map is the home screen (Stellaris / ES2 style). */
  return "map";
}

export function rpSeenStorageKey(factionId: string): string {
  return `gmap-rp-seen:${factionId}`;
}

export function readRpSeenAt(factionId: string): string {
  try {
    return localStorage.getItem(rpSeenStorageKey(factionId)) || "";
  } catch {
    return "";
  }
}

export function writeRpSeenAt(factionId: string, at: string): void {
  try {
    localStorage.setItem(rpSeenStorageKey(factionId), at);
  } catch {
    /* ignore */
  }
}
