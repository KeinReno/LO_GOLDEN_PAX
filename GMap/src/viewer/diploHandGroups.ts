export type StarGroup<T> = { star: string; items: T[] };

/** Group fleets / legions by the star they sit in. */
export function groupByStar<T extends { where?: string }>(
  items: T[],
  unlabeled = "В пути",
): StarGroup<T>[] {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const star = item.where?.trim() || unlabeled;
    const list = map.get(star);
    if (list) list.push(item);
    else map.set(star, [item]);
  }
  return [...map.entries()].map(([star, grouped]) => ({
    star,
    items: grouped,
  }));
}

export function worldsLine(worlds?: string[]): string {
  const list = (worlds ?? []).map((w) => w.trim()).filter(Boolean);
  if (list.length === 0) return "нет колоний";
  if (list.length <= 3) return `миры · ${list.join(" · ")}`;
  return `${list.length} миров · ${list.slice(0, 2).join(" · ")}…`;
}

export function groupByKey<T>(
  items: T[],
  keyOf: (item: T) => string,
  order?: readonly string[],
): { key: string; items: T[] }[] {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item) || "other";
    const list = map.get(key);
    if (list) list.push(item);
    else map.set(key, [item]);
  }
  const seen = new Set<string>();
  const keys: string[] = [];
  for (const k of order ?? []) {
    if (map.has(k)) {
      keys.push(k);
      seen.add(k);
    }
  }
  for (const k of map.keys()) {
    if (!seen.has(k)) keys.push(k);
  }
  return keys.map((key) => ({ key, items: map.get(key)! }));
}
