/**
 * Iso-space viewport culling for map redraw.
 * World layer uses position + uniform scale; children are in iso coords.
 */

export type IsoBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

/** Visible iso rect in world-layer local space, expanded by margin (iso units). */
export function isoViewportBounds(
  layerPosX: number,
  layerPosY: number,
  layerScale: number,
  screenW: number,
  screenH: number,
  marginIso = 80,
): IsoBounds {
  const s = Math.max(0.05, layerScale);
  const minX = -layerPosX / s - marginIso;
  const maxX = (screenW - layerPosX) / s + marginIso;
  const minY = -layerPosY / s - marginIso;
  const maxY = (screenH - layerPosY) / s + marginIso;
  return { minX, maxX, minY, maxY };
}

export function isoInBounds(
  ix: number,
  iy: number,
  b: IsoBounds,
): boolean {
  return ix >= b.minX && ix <= b.maxX && iy >= b.minY && iy <= b.maxY;
}
