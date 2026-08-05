const KEY = "gmap-stock-alerts";

/** Toggle / list local stock watch flags (no server yet). */
export function readStockAlerts(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

export function toggleStockAlert(currencyId: string): { on: boolean; list: string[] } {
  const set = new Set(readStockAlerts());
  let on: boolean;
  if (set.has(currencyId)) {
    set.delete(currencyId);
    on = false;
  } else {
    set.add(currencyId);
    on = true;
  }
  const list = [...set];
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
  return { on, list };
}

export function isStockAlertOn(currencyId: string): boolean {
  return readStockAlerts().includes(currencyId);
}
