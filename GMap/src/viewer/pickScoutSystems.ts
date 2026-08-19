export type ScoutSystem = {
  id: string;
  name: string;
  x: number;
  y: number;
  ownerFactionId?: string | null;
};

const DEFAULT_LIMIT = 20;

/** Nearest foreign systems, or name/id matches when the player is searching. */
export function pickScoutSystems(
  systems: ScoutSystem[],
  origin: { x: number; y: number } | null,
  query: string,
  viewerFactionId: string,
  limit = DEFAULT_LIMIT,
): ScoutSystem[] {
  const q = query.trim().toLowerCase();
  const pool = systems.filter((s) => s.ownerFactionId !== viewerFactionId);
  const filtered = q
    ? pool.filter(
        (s) =>
          s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q),
      )
    : pool;
  const ox = origin?.x;
  const oy = origin?.y;
  const ranked = filtered.map((s) => ({
    s,
    d:
      ox == null || oy == null
        ? 0
        : (s.x - ox) * (s.x - ox) + (s.y - oy) * (s.y - oy),
  }));
  ranked.sort((a, b) => a.d - b.d || a.s.name.localeCompare(b.s.name, "ru"));
  return ranked.slice(0, Math.max(1, limit)).map((row) => row.s);
}
