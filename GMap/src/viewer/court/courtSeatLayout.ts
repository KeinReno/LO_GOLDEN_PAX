/** JSON angleDeg: 0 = right, −90 = top (screen Y down). */
export const COURT_SEAT_RADIUS_PCT = 37;

export function courtSeatOffset(
  angleDeg: number,
  radiusPct = COURT_SEAT_RADIUS_PCT,
): { left: number; top: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    left: 50 + radiusPct * Math.cos(rad),
    top: 50 + radiusPct * Math.sin(rad),
  };
}
