export type IsoBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

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

export function isoInBounds(ix: number, iy: number, b: IsoBounds): boolean {
  return ix >= b.minX && ix <= b.maxX && iy >= b.minY && iy <= b.maxY;
}
