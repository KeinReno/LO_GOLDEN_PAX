/** Continuous 2:1-ish isometric projection for map space. */

const AX = 0.92;
const AY = 0.48;

export function toIso(x: number, y: number): { x: number; y: number } {
  return {
    x: (x - y) * AX,
    y: (x + y) * AY,
  };
}

export function fromIso(ix: number, iy: number): { x: number; y: number } {
  return {
    x: (ix / AX + iy / AY) / 2,
    y: (iy / AY - ix / AX) / 2,
  };
}

export function isoDist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = (ay - by) / AY;
  return dx * dx + dy * dy * AY * AY;
}

/** World units that cover `screenPx` at the current camera scale. */
export function worldFromScreen(screenPx: number, cameraScale: number): number {
  return screenPx / Math.max(cameraScale, 0.02);
}
