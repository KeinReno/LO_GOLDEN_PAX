import { useEffect, useState } from "react";
import type { ViewerGraphicsPrefs } from "../ui/viewerGraphics";

/** Shared mobile detection for layout + graphics clamps. */
export function isLikelyMobile(): boolean {
  if (typeof window === "undefined") return false;
  try {
    // Prefer layout viewport; fall back to visualViewport (iOS quirks /
    // in-app browsers sometimes report a wide layout width).
    const mq = window.matchMedia("(max-width: 900px)").matches;
    const vw = window.visualViewport?.width ?? window.innerWidth;
    const vh = window.visualViewport?.height ?? window.innerHeight;
    const portraitPhone = vw <= 900 || (vw < vh && vw <= 980);
    return mq || portraitPhone;
  } catch {
    return false;
  }
}

function writeViewportVars(): void {
  try {
    const vv = window.visualViewport;
    const h = vv?.height ?? window.innerHeight;
    if (Number.isFinite(h) && h > 0) {
      document.documentElement.style.setProperty("--app-vh", `${h}px`);
    }
    if (vv) {
      const keyboardInset = Math.max(
        0,
        window.innerHeight - vv.height - vv.offsetTop,
      );
      document.documentElement.style.setProperty(
        "--keyboard-inset",
        `${keyboardInset}px`,
      );
      document.documentElement.style.setProperty(
        "--visual-vv-offset-top",
        `${vv.offsetTop}px`,
      );
    } else {
      document.documentElement.style.setProperty("--keyboard-inset", "0px");
      document.documentElement.style.setProperty("--visual-vv-offset-top", "0px");
    }
  } catch {
    /* ignore */
  }
}

/**
 * Mobile class sync + CSS `--app-vh` (visual viewport height in px)
 * for Android Chrome URL-bar / keyboard layout.
 */
export function useViewerViewport(): { mobile: boolean } {
  const [mobile, setMobile] = useState(() => isLikelyMobile());

  useEffect(() => {
    const sync = () => {
      setMobile(isLikelyMobile());
      writeViewportVars();
    };
    sync();
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", sync);
    vv?.addEventListener("scroll", sync);
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
      vv?.removeEventListener("resize", sync);
      vv?.removeEventListener("scroll", sync);
    };
  }, []);

  return { mobile };
}

/** Viewer sections that open as a full-height BottomSheet on phone. */
export type MobileRoomView =
  | "hq"
  | "forces"
  | "research"
  | "economy"
  | "market"
  | "diplomacy"
  | "quests"
  | "court"
  | "codex"
  | "rp";

const MOBILE_ROOM_VIEWS = new Set<string>([
  "hq",
  "forces",
  "research",
  "economy",
  "market",
  "diplomacy",
  "quests",
  "court",
  "codex",
  "rp",
]);

export function isMobileRoomView(
  mobile: boolean,
  viewMode: string,
): viewMode is MobileRoomView {
  return mobile && MOBILE_ROOM_VIEWS.has(viewMode);
}

/** Pause ambient map FX while a room sheet or map entity sheet is open. */
export function mapGraphicsWhenPaused(
  graphics: ViewerGraphicsPrefs,
  paused: boolean,
): ViewerGraphicsPrefs {
  if (!paused) return graphics;
  return {
    ...graphics,
    animations: false,
    battleFx: false,
    scarFx: false,
    territoryGlow: false,
  };
}
