import { toIso } from "../renderers/iso";
import type { Faction, PolityKind, StarSystem, WorldState } from "./types";

/** IDs that are never sovereign states (even if a save wrongly marked them "state"). */
const KNOWN_NON_STATE_IDS = new Set([
  "faction_pirates",
  "faction_north_swarm",
  "faction_south_swarm",
  "faction_or",
  "faction_sahale",
  "faction_sikuri",
  "faction_huchi",
  "faction_free_traders",
  "faction_scavengers",
]);

export function resolvePolityKind(f: Faction | undefined | null): PolityKind {
  if (!f) return "faction";
  // Explicit kind from GM / campaign data always wins (including promoted rogues).
  if (f.kind === "faction" || f.kind === "state") return f.kind;
  // Legacy saves without kind: canonical NPC ids stay non-states.
  if (KNOWN_NON_STATE_IDS.has(f.id)) return "faction";
  const n = (f.name ?? "").toLowerCase();
  if (/пират|рой|умбра|сахале|сикури|хучи|ор\s*\/|пожирател|караван|сборщик/.test(n)) {
    return "faction";
  }
  return "state";
}

export function isStatePolity(f: Faction | undefined | null): boolean {
  return resolvePolityKind(f) === "state";
}

/** Territory fill / glow colour. */
export function resolveFactionFill(f: Faction): string {
  return f.fillColor || f.color;
}

/** Territory border colour. */
export function resolveFactionBorder(f: Faction): string {
  return f.borderColor || f.color;
}

/** System token / ownership aura colour. */
export function resolveFactionSystemColor(f: Faction): string {
  return f.systemColor || f.color;
}

/** Map label colour for the polity name. */
export function resolveFactionNameColor(f: Faction): string {
  return f.nameColor || "#e8c547";
}

/** Map label font-family for the polity name. */
export function resolveFactionNameFont(f: Faction): string {
  return f.nameFont || "Cinzel, Times New Roman, serif";
}

export const FACTION_NAME_FONT_OPTIONS: { value: string; label: string }[] = [
  { value: "Cinzel, Times New Roman, serif", label: "Cinzel (имперский)" },
  { value: "Spectral, Georgia, serif", label: "Spectral (книга)" },
  { value: "Rajdhani, Segoe UI, sans-serif", label: "Rajdhani (брифинг)" },
  { value: "Exo 2, Segoe UI, sans-serif", label: "Exo 2 (техн.)" },
  { value: "Orbitron, Segoe UI, sans-serif", label: "Orbitron (sci-fi)" },
  { value: "Georgia, Times New Roman, serif", label: "Georgia" },
  { value: "Segoe UI, Tahoma, sans-serif", label: "Segoe UI" },
];

/** Systems that contribute to state territory blobs (excludes pirates etc.). */
export function systemsForStateTerritory(world: WorldState): StarSystem[] {
  const stateIds = new Set(
    world.factions.filter((f) => isStatePolity(f)).map((f) => f.id),
  );
  return world.systems.filter(
    (s) =>
      s.ownerFactionId != null &&
      stateIds.has(s.ownerFactionId) &&
      s.poiType !== "pirate",
  );
}

export interface Pt {
  x: number;
  y: number;
}

function cross(o: Pt, a: Pt, b: Pt): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

export function convexHull(points: Pt[]): Pt[] {
  if (points.length <= 1) return points.slice();
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const lower: Pt[] = [];
  for (const p of sorted) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0
    ) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: Pt[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i]!;
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0
    ) {
      upper.pop();
    }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/** Chaikin corner-cutting → soft closed curve. */
export function chaikinSmooth(poly: Pt[], iterations = 3): Pt[] {
  if (poly.length < 3) return poly.slice();
  let cur = poly;
  for (let iter = 0; iter < iterations; iter++) {
    const next: Pt[] = [];
    const n = cur.length;
    for (let i = 0; i < n; i++) {
      const p0 = cur[i]!;
      const p1 = cur[(i + 1) % n]!;
      next.push({
        x: p0.x * 0.75 + p1.x * 0.25,
        y: p0.y * 0.75 + p1.y * 0.25,
      });
      next.push({
        x: p0.x * 0.25 + p1.x * 0.75,
        y: p0.y * 0.25 + p1.y * 0.75,
      });
    }
    cur = next;
  }
  return cur;
}

/** Uniform outward offset in iso-space (ellipse-aware). */
export function inflateSmooth(poly: Pt[], padding: number): Pt[] {
  if (poly.length < 3) return poly.slice();
  const n = poly.length;
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const prev = poly[(i - 1 + n) % n]!;
    const cur = poly[i]!;
    const next = poly[(i + 1) % n]!;
    const ax = cur.x - prev.x;
    const ay = (cur.y - prev.y) / 0.55;
    const bx = next.x - cur.x;
    const by = (next.y - cur.y) / 0.55;
    const al = Math.hypot(ax, ay) || 1;
    const bl = Math.hypot(bx, by) || 1;
    let nx = -ay / al - by / bl;
    let ny = ax / al + bx / bl;
    const nl = Math.hypot(nx, ny) || 1;
    nx /= nl;
    ny /= nl;
    out.push({
      x: cur.x + nx * padding,
      y: cur.y + ny * padding * 0.55,
    });
  }
  return out;
}

function sampleIsoEllipse(cx: number, cy: number, rx: number, steps: number): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    pts.push({
      x: cx + Math.cos(a) * rx,
      y: cy + Math.sin(a) * rx * 0.5,
    });
  }
  return pts;
}

function sampleCapsule(a: Pt, b: Pt, radius: number, steps = 12): Pt[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * radius;
  const ny = (dx / len) * radius * 0.5;
  const pts: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    pts.push({ x: a.x + dx * t + nx, y: a.y + dy * t + ny });
  }
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    pts.push({ x: b.x - dx * t - nx, y: b.y - dy * t - ny });
  }
  pts.push(...sampleIsoEllipse(a.x, a.y, radius, 10));
  pts.push(...sampleIsoEllipse(b.x, b.y, radius, 10));
  return pts;
}

export interface FactionBlob {
  factionId: string;
  /** Centers in iso-space for soft ellipse underlay */
  cores: Pt[];
  /** Nearby pairs to bridge */
  bridges: [Pt, Pt][];
  /** Smooth outer contour for border */
  outline: Pt[];
  radius: number;
}

const CORE_R = 62;
const BRIDGE_DIST = 240;
/** Dark corridor between rival borders (iso-space). */
const BORDER_GAP = 28;

function isoDist(a: Pt, b: Pt): number {
  const dy = (a.y - b.y) * 2;
  const dx = a.x - b.x;
  return Math.sqrt(dx * dx + dy * dy);
}

function nearestPt(p: Pt, pts: Pt[]): { pt: Pt; d: number } {
  let best = pts[0]!;
  let bestD = isoDist(p, best);
  for (let i = 1; i < pts.length; i++) {
    const q = pts[i]!;
    const d = isoDist(p, q);
    if (d < bestD) {
      best = q;
      bestD = d;
    }
  }
  return { pt: best, d: bestD };
}

/**
 * Pull outline vertices onto each faction's half-space with a gap.
 * Cheap: cores only, 2 passes, skip vertices already clear of rivals.
 */
export function separateFactionOutlines(
  blobs: FactionBlob[],
  gap = BORDER_GAP,
): FactionBlob[] {
  if (blobs.length < 2) return blobs;

  const cores = blobs.map((b) => b.cores);
  // Quick reject: if no rival cores are within contact range, skip work
  let anyContact = false;
  const contactR = CORE_R * 2 + gap + 80;
  for (let i = 0; i < blobs.length && !anyContact; i++) {
    for (let j = i + 1; j < blobs.length && !anyContact; j++) {
      for (const a of cores[i]!) {
        for (const b of cores[j]!) {
          if (isoDist(a, b) < contactR) {
            anyContact = true;
            break;
          }
        }
        if (anyContact) break;
      }
    }
  }
  if (!anyContact) return blobs;

  return blobs.map((blob, bi) => {
    const own = cores[bi]!;
    if (own.length === 0 || blob.outline.length < 3) return blob;

    const foreign: Pt[] = [];
    for (let oi = 0; oi < blobs.length; oi++) {
      if (oi === bi) continue;
      foreign.push(...cores[oi]!);
    }
    if (foreign.length === 0) return blob;

    let outline = blob.outline.map((p) => ({ x: p.x, y: p.y }));

    for (let pass = 0; pass < 2; pass++) {
      const strength = pass === 0 ? 0.85 : 0.55;
      for (let vi = 0; vi < outline.length; vi++) {
        const p = outline[vi]!;
        let x = p.x;
        let y = p.y;
        const ownN = nearestPt({ x, y }, own);
        const foreignN = nearestPt({ x, y }, foreign);
        const need = ownN.d + gap - foreignN.d;
        if (need <= 1) continue;

        const toOwnX = ownN.pt.x - x;
        const toOwnY = (ownN.pt.y - y) * 2;
        const awayX = x - foreignN.pt.x;
        const awayY = (y - foreignN.pt.y) * 2;
        let mx = toOwnX * 0.5 + awayX;
        let my = toOwnY * 0.5 + awayY;
        const ml = Math.sqrt(mx * mx + my * my) || 1;
        const step = Math.min(22, need * strength);
        x += (mx / ml) * step;
        y += (my / ml) * step * 0.5;

        const ownCore = nearestPt({ x, y }, own);
        const minOwn = blob.radius * 0.7;
        if (ownCore.d < minOwn && ownCore.d > 0.01) {
          const push = (minOwn - ownCore.d) / ownCore.d;
          x += (x - ownCore.pt.x) * push;
          y += (y - ownCore.pt.y) * push;
        }
        outline[vi] = { x, y };
      }
    }

    outline = chaikinSmooth(outline, 1);
    return { ...blob, outline };
  });
}

let blobCacheKey = "";
let blobCache: FactionBlob[] = [];

/** Ownership + positions fingerprint for blob cache. */
export function factionBlobCacheKey(systems: StarSystem[]): string {
  let key = "";
  for (const s of systems) {
    if (!s.ownerFactionId) continue;
    key += `${s.id}:${s.ownerFactionId}:${s.x | 0}:${s.y | 0};`;
  }
  return key;
}

/**
 * Cached blobs — buildFactionBlobs is expensive; callers hit this every frame.
 */
export function getFactionBlobs(systems: StarSystem[]): FactionBlob[] {
  const key = factionBlobCacheKey(systems);
  if (key === blobCacheKey) return blobCache;
  blobCacheKey = key;
  blobCache = buildFactionBlobsUncached(systems);
  return blobCache;
}

export function invalidateFactionBlobCache(): void {
  blobCacheKey = "";
  blobCache = [];
}

/** Soft blob influence fields per faction (uncached). Prefer getFactionBlobs. */
export function buildFactionBlobs(systems: StarSystem[]): FactionBlob[] {
  return getFactionBlobs(systems);
}

function buildFactionBlobsUncached(systems: StarSystem[]): FactionBlob[] {
  const byFaction = new Map<string, StarSystem[]>();
  for (const s of systems) {
    if (!s.ownerFactionId) continue;
    const list = byFaction.get(s.ownerFactionId) ?? [];
    list.push(s);
    byFaction.set(s.ownerFactionId, list);
  }

  const result: FactionBlob[] = [];
  for (const [factionId, owned] of byFaction) {
    const cores = owned.map((s) => toIso(s.x, s.y));
    const bridges: [Pt, Pt][] = [];
    for (let i = 0; i < cores.length; i++) {
      for (let j = i + 1; j < cores.length; j++) {
        const a = cores[i]!;
        const b = cores[j]!;
        const d = isoDist(a, b);
        if (d < BRIDGE_DIST) bridges.push([a, b]);
      }
    }

    const cloud: Pt[] = [];
    for (const c of cores) {
      cloud.push(...sampleIsoEllipse(c.x, c.y, CORE_R, 16));
    }
    for (const [a, b] of bridges) {
      cloud.push(...sampleCapsule(a, b, CORE_R * 0.9, 8));
    }

    let outline = convexHull(cloud);
    outline = inflateSmooth(outline, 10);
    // 3× Chaikin ≈ 8× vertices (was 5× → 32× — too heavy with separation)
    outline = chaikinSmooth(outline, 3);

    result.push({
      factionId,
      cores,
      bridges,
      outline,
      radius: CORE_R,
    });
  }

  return separateFactionOutlines(result);
}

/** @deprecated use buildFactionBlobs — kept for diplomacy centroids */
export function buildFactionTerritories(
  systems: StarSystem[],
  _padding = 48,
): { factionId: string; polygon: Pt[] }[] {
  return buildFactionBlobs(systems).map((b) => ({
    factionId: b.factionId,
    polygon: b.outline,
  }));
}

export function centroid(poly: Pt[]): Pt {
  if (poly.length === 0) return { x: 0, y: 0 };
  let x = 0;
  let y = 0;
  for (const p of poly) {
    x += p.x;
    y += p.y;
  }
  return { x: x / poly.length, y: y / poly.length };
}
