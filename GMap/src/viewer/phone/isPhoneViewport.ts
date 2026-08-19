/** Phone shell vs desktop chrome. Not “narrow window of a PC”. */

export function isPhoneViewport(width: number, height: number): boolean {
  if (!Number.isFinite(width) || !Number.isFinite(height)) return false;
  if (width <= 0 || height <= 0) return false;
  if (width <= 900) return true;
  const short = Math.min(width, height);
  const long = Math.max(width, height);
  // Landscape phone (Pixel 915×412): short side is the tell, long stays handset-sized.
  return short <= 540 && long <= 980;
}

export function readViewportBox(): { width: number; height: number } {
  if (typeof window === "undefined") return { width: 1024, height: 768 };
  const vw = window.visualViewport?.width ?? window.innerWidth;
  const vh = window.visualViewport?.height ?? window.innerHeight;
  return { width: vw, height: vh };
}
