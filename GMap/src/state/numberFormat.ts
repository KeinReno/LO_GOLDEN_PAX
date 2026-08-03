/**
 * Shared number formatters — kill floating-point noise (16+ decimals) in UI.
 * Tabular numerals handled by --font-mono in CSS.
 */

/** Round to 1 decimal, drop trailing .0. e.g. 87.3617 → "87.4", -1767.4352 → "-1767.4". */
export function fmt1(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/** Signed + rounded to 1 decimal. e.g. 87.36 → "+87.4", -5.0 → "-5". */
export function fmtSigned(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const r = Math.round(n * 10) / 10;
  const s = Number.isInteger(r) ? String(r) : r.toFixed(1);
  return n > 0 ? `+${s}` : s;
}

/** Integer with thousands separator (ru-RU uses space). e.g. 8567 → "8 567". */
export function fmtInt(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return Math.round(n).toLocaleString("ru-RU");
}

/** Compact large numbers: 1234 → "1.2k", 1500000 → "1.5M". */
export function fmtCompact(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return fmt1(n / 1_000_000) + "M";
  if (abs >= 1_000) return fmt1(n / 1_000) + "k";
  return fmt1(n);
}
