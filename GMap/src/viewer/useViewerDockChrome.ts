import { useEffect } from "react";
import { useViewerChromeStore } from "../state/viewerChromeStore";

/** Closes mobile dock «Ещё» menu on outside pointerdown. */
export function useViewerDockChrome(): void {
  const dockMoreOpen = useViewerChromeStore((s) => s.dockMoreOpen);
  const setDockMoreOpen = useViewerChromeStore((s) => s.setDockMoreOpen);

  useEffect(() => {
    if (!dockMoreOpen) return;
    const close = (e: PointerEvent) => {
      const el = e.target as Element | null;
      if (el?.closest?.(".viewer-dock-more")) return;
      setDockMoreOpen(false);
    };
    const timer = window.setTimeout(() => {
      window.addEventListener("pointerdown", close, true);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointerdown", close, true);
    };
  }, [dockMoreOpen, setDockMoreOpen]);
}
