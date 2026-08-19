export type SlotRingPoint = { x: number; y: number };

/** Percent coords for SVG viewBox 0..100. First slot sits at 12 o'clock. */
export function slotRingPositions(
  count: number,
  cx = 50,
  cy = 50,
  r = 36,
): SlotRingPoint[] {
  if (count <= 0) return [];
  if (count === 1) return [{ x: cx, y: cy - r }];
  return Array.from({ length: count }, (_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / count;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  });
}
