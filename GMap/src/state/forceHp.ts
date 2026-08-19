/** Weighted HP fraction 0..1 across stacks. Null if no units. */
export function weightedHpRatio(
  rows: Array<{ hp?: number; count?: number; maxHp: number }>,
): number | null {
  let weight = 0;
  let acc = 0;
  for (const row of rows) {
    const n = Math.max(0, Number(row.count) || 0);
    if (!n) continue;
    const cap = Math.max(1, Number(row.maxHp) || 1);
    const cur = row.hp == null ? cap : Number(row.hp);
    const ratio = Math.max(0, Math.min(1, cur / cap));
    acc += ratio * n;
    weight += n;
  }
  return weight > 0 ? acc / weight : null;
}
