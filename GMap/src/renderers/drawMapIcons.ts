import { Assets, Sprite, Text, type Container, type Graphics } from "pixi.js";
import type {
  Fleet,
  FleetKind,
  Legion,
  StarSystem,
  SystemActivity,
  WorldState,
} from "../state/types";
import { centroid, getFactionBlobs, systemsForStateTerritory, isStatePolity, resolveFactionNameColor, resolveFactionNameFont, type Pt } from "../state/territory";
import { sectorPoints } from "../state/sectors";
import { toIso } from "./iso";
import { mapIconsReady } from "./mapIconAssets";
import { classicTheme } from "./styles/classicStyle";
import type { FactionThemeColors } from "./styles/mapTheme";

export interface AnimClock {
  /** seconds */
  t: number;
  /** 0.5 + 0.5*sin */
  pulse: number;
  /** secondary phase */
  pulse2: number;
}

/** Zoom tiers for map detail / label density. */
export type MapLod = "far" | "mid" | "near";

/**
 * far  — overview: battle markers only; polity labels gated
 * mid  — silhouette + name for inhabited/capitals; 1 quiet signal; no resource billboards
 * near — habit pips + quiet resource glyph; dense stats live in hover tip
 */
export function resolveMapLod(scale: number): MapLod {
  if (scale < 0.62) return "far";
  if (scale < 1.15) return "mid";
  return "near";
}

/** Screen-stable label scale; milder than 1:1 inverse so far zoom stays calm. */
export function resolveLabelScale(worldScale: number, lod: MapLod): number {
  const raw = 0.88 / Math.max(0.28, worldScale);
  if (lod === "far") return Math.min(1.35, Math.max(0.7, raw * 0.85));
  if (lod === "mid") return Math.min(1.55, Math.max(0.55, raw * 0.95));
  return Math.min(1.7, Math.max(0.5, raw));
}

export function makeAnim(t: number): AnimClock {
  return {
    t,
    pulse: 0.5 + 0.5 * Math.sin(t * 2.2),
    pulse2: 0.5 + 0.5 * Math.sin(t * 3.1 + 1.2),
  };
}

export function parseFactionColor(hex: string): number {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  return Number.isFinite(n) ? n : 0x888888;
}

function ellipse(
  g: Graphics,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): void {
  const steps = 28;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const x = cx + Math.cos(a) * rx;
    const y = cy + Math.sin(a) * ry;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
}

/** Iso oval pie wedge from angle a0→a1 (radians, 0 = east). */
function ellipseWedge(
  g: Graphics,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  a0: number,
  a1: number,
): void {
  const span = a1 - a0;
  const steps = Math.max(6, Math.ceil(32 * Math.abs(span) / (Math.PI * 2)));
  g.moveTo(cx, cy);
  for (let i = 0; i <= steps; i++) {
    const a = a0 + (span * i) / steps;
    g.lineTo(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry);
  }
  g.closePath();
}

/** Imperial briefing token — metal disc + faction rim (game piece, not GIS dot). */
export function drawSystemToken(
  g: Graphics,
  cx: number,
  cy: number,
  rimColor: number,
  selected: boolean,
  anim: AnimClock,
  opts?: {
    capital?: boolean;
    neutral?: boolean;
    /** Extra faction colors → pie-split control disc. */
    shareColors?: number[];
  },
): void {
  const capital = !!opts?.capital;
  const neutral = !!opts?.neutral;
  const shares = (opts?.shareColors ?? []).filter((c) => Number.isFinite(c));
  const rx = capital ? 17 : 14;
  const ry = capital ? 8.5 : 7;

  ellipse(g, cx, cy + 4, rx * 1.05, ry * 0.95);
  g.fill({ color: 0x000000, alpha: 0.4 });

  if (shares.length >= 2) {
    // Pie control disc: equal slices among owner + co-owners
    const n = shares.length;
    const start = -Math.PI / 2;
    for (let i = 0; i < n; i++) {
      const a0 = start + (i / n) * Math.PI * 2;
      const a1 = start + ((i + 1) / n) * Math.PI * 2;
      ellipseWedge(g, cx, cy, rx, ry, a0, a1);
      g.fill({ color: shares[i]!, alpha: 0.88 });
    }
    // Dark metal core so it still reads as a token
    ellipse(g, cx, cy, rx * 0.42, ry * 0.42);
    g.fill({ color: 0x0c1018, alpha: 0.92 });
    ellipse(g, cx, cy, rx, ry);
    g.stroke({
      width: capital ? 2.4 : 1.8,
      color: 0xe8d5a0,
      alpha: 0.55 + anim.pulse * 0.1,
    });
  } else {
    ellipse(g, cx, cy, rx, ry);
    g.fill({ color: neutral ? 0x1a1c20 : 0x10161f, alpha: 0.95 });

    // Outer dark bevel + faction rim for metal token depth
    ellipse(g, cx, cy, rx, ry);
    g.stroke({
      width: capital ? 3.6 : 2.8,
      color: 0x05070c,
      alpha: 0.55,
    });
    ellipse(g, cx, cy, rx, ry);
    g.stroke({
      width: capital ? 2.6 : 2,
      color: rimColor,
      alpha: neutral ? 0.55 : 0.94,
    });

    ellipse(g, cx, cy, rx * 0.72, ry * 0.72);
    g.stroke({
      width: 1,
      color: 0xffffff,
      alpha: 0.14 + anim.pulse * 0.06,
    });
    // Specular rim highlight (top-left of ellipse)
    ellipse(g, cx - rx * 0.12, cy - ry * 0.18, rx * 0.55, ry * 0.35);
    g.stroke({
      width: 1.1,
      color: 0xffffff,
      alpha: 0.1 + anim.pulse * 0.04,
    });
  }

  if (selected) {
    // Soft pin-light halo (readable select, not 3D tilt)
    ellipse(g, cx, cy, rx + 11 + anim.pulse * 2, ry + 5.5 + anim.pulse);
    g.stroke({ width: 1, color: 0xe8c547, alpha: 0.22 + anim.pulse * 0.1 });
    ellipse(g, cx, cy, rx + 7 + anim.pulse * 1.6, ry + 3.5 + anim.pulse);
    g.stroke({ width: 1.35, color: 0xffe08a, alpha: 0.45 + anim.pulse2 * 0.12 });
    ellipse(g, cx, cy, rx + 5 + anim.pulse * 1.5, ry + 2.5 + anim.pulse);
    g.stroke({ width: 1.8, color: 0xe8c547, alpha: 0.85 });
  }
}

export function drawOwnershipAura(
  g: Graphics,
  s: StarSystem,
  color: number,
  anim: AnimClock,
  shareColors?: number[],
  opts?: { dim?: number; emphasize?: boolean },
): void {
  const p = toIso(s.x, s.y);
  const dim = opts?.dim ?? 1;
  const emph = !!opts?.emphasize;
  const breathe = 1 + anim.pulse * (emph ? 0.05 : 0.02);
  const rx = (emph ? 24 : 20) * breathe;
  const ry = (emph ? 12 : 10) * breathe;
  const shares = (shareColors ?? []).filter((c) => Number.isFinite(c));

  if (shares.length >= 2) {
    const n = shares.length;
    const start = -Math.PI / 2;
    for (let i = 0; i < n; i++) {
      const a0 = start + (i / n) * Math.PI * 2;
      const a1 = start + ((i + 1) / n) * Math.PI * 2;
      ellipseWedge(g, p.x, p.y + 2, rx, ry, a0, a1);
      g.fill({
        color: shares[i]!,
        alpha: (0.1 + anim.pulse * 0.03) * dim,
      });
    }
    ellipse(g, p.x, p.y + 2, rx, ry);
    g.stroke({
      width: 1.2,
      color: 0xe8d5a0,
      alpha: (0.28 + anim.pulse * 0.08) * dim,
    });
    return;
  }

  ellipse(g, p.x, p.y + 2, rx, ry);
  g.fill({ color, alpha: (0.07 + anim.pulse * 0.03) * dim });
  ellipse(g, p.x, p.y + 2, rx, ry);
  g.stroke({ width: 1.15, color, alpha: (0.28 + anim.pulse * 0.1) * dim });
  // Outer ring only when focused — cuts mid-map concentric noise
  if (emph) {
    ellipse(g, p.x, p.y + 2, 28 * breathe, 14 * breathe);
    g.stroke({
      width: 0.8,
      color: 0xc9a227,
      alpha: (0.18 + anim.pulse * 0.06) * dim,
    });
  }
}

/** Red / amber / green loyalty halo for map mode «Лояльность». */
export function drawLoyaltyAura(
  g: Graphics,
  s: StarSystem,
  loyalty: number | null,
  anim: AnimClock,
  opts?: { dim?: number },
): void {
  if (loyalty == null) return;
  const dim = opts?.dim ?? 1;
  const p = toIso(s.x, s.y);
  const color =
    loyalty < 20
      ? 0xc44a3a
      : loyalty < 40
        ? 0xd4a017
        : loyalty < 60
          ? 0x8a93a5
          : 0x3d9a5c;
  const breathe = 1 + anim.pulse * 0.04;
  const rx = 22 * breathe;
  const ry = 11 * breathe;
  ellipse(g, p.x, p.y + 2, rx, ry);
  g.fill({ color, alpha: (0.12 + anim.pulse * 0.04) * dim });
  ellipse(g, p.x, p.y + 2, rx * 1.15, ry * 1.15);
  g.stroke({
    width: 1.4,
    color,
    alpha: (0.35 + anim.pulse * 0.08) * dim,
  });
}

export function drawIntelRing(
  g: Graphics,
  s: StarSystem,
  anim: AnimClock,
): void {
  const p = toIso(s.x, s.y);
  const r = 28 + anim.pulse2 * 1.5;
  ellipse(g, p.x, p.y, r, r * 0.5);
  g.stroke({ width: 1.2, color: 0xc9a227, alpha: 0.35 + anim.pulse2 * 0.25 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + anim.t * 0.4;
    const x0 = p.x + Math.cos(a) * (r - 3);
    const y0 = p.y + Math.sin(a) * (r * 0.5 - 1.5);
    const x1 = p.x + Math.cos(a) * (r + 2);
    const y1 = p.y + Math.sin(a) * (r * 0.5 + 1);
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.stroke({ width: 1.2, color: 0xe8c547, alpha: 0.55 });
  }
}

/** Soft pin-light preview when pointer hovers a system (not selected). */
export function drawHoverRing(
  g: Graphics,
  s: StarSystem,
  anim: AnimClock,
): void {
  const p = toIso(s.x, s.y);
  const rx = 20 + anim.pulse * 1.2;
  const ry = 10 + anim.pulse * 0.6;
  ellipse(g, p.x, p.y, rx + 8, ry + 4);
  g.fill({ color: 0xe8c547, alpha: 0.04 + anim.pulse * 0.02 });
  ellipse(g, p.x, p.y, rx + 4, ry + 2);
  g.stroke({ width: 1, color: 0xe8c547, alpha: 0.22 + anim.pulse * 0.08 });
  ellipse(g, p.x, p.y, rx, ry);
  g.stroke({ width: 1.35, color: 0xffe08a, alpha: 0.42 + anim.pulse2 * 0.1 });
}

/** Gold corner brackets for selected system. */
export function drawSelectionBrackets(
  g: Graphics,
  s: StarSystem,
  anim: AnimClock,
): void {
  const p = toIso(s.x, s.y);
  const rx = 20 + anim.pulse * 1.2;
  const ry = 10 + anim.pulse * 0.6;
  const len = 7;
  for (const [sx, sy] of [
    [-rx, -ry],
    [rx, -ry],
    [-rx, ry],
    [rx, ry],
  ] as const) {
    const cx = p.x + sx;
    const cy = p.y + sy;
    const hx = Math.sign(sx) || 1;
    const hy = Math.sign(sy) || 1;
    g.moveTo(cx, cy + hy * len);
    g.lineTo(cx, cy);
    g.lineTo(cx - hx * len, cy);
    g.stroke({ width: 1.6, color: 0xe8c547, alpha: 0.9 });
  }
}

export function drawFogVeil(g: Graphics, s: StarSystem): void {
  const p = toIso(s.x, s.y);
  // Soft outer veil — unexplored as unresolved canvas
  ellipse(g, p.x, p.y, 22, 11);
  g.fill({ color: 0x05070c, alpha: 0.28 });
  ellipse(g, p.x, p.y, 18, 9);
  g.fill({ color: 0x05070c, alpha: 0.52 });
  ellipse(g, p.x, p.y, 18, 9);
  g.stroke({ width: 1, color: 0x3a4250, alpha: 0.42 });
  ellipse(g, p.x, p.y, 14, 7);
  g.stroke({ width: 0.8, color: 0x5a6578, alpha: 0.2 });
  const seed = s.id.charCodeAt(0) * 0.37 + s.id.charCodeAt(s.id.length - 1);
  for (let i = 0; i < 10; i++) {
    const a = seed + i * 0.73;
    const dx = Math.cos(a) * (3.5 + (i % 4) * 2.8);
    const dy = Math.sin(a * 1.3) * (1.8 + (i % 3) * 2.1);
    g.circle(p.x + dx, p.y + dy, i % 3 === 0 ? 1.4 : 0.85);
    g.fill({ color: 0x7a9bb8, alpha: 0.14 + (i % 5) * 0.035 });
  }
  g.moveTo(p.x - 10, p.y - 2);
  g.lineTo(p.x + 8, p.y + 4);
  g.moveTo(p.x - 6, p.y - 5);
  g.lineTo(p.x + 10, p.y + 1);
  g.stroke({ width: 1, color: 0x6b6358, alpha: 0.32 });
}

export function drawContestedRing(
  g: Graphics,
  s: StarSystem,
  anim: AnimClock,
): void {
  const p = toIso(s.x, s.y);
  const r = 26 + anim.pulse * 2;
  ellipse(g, p.x, p.y, r, r * 0.48);
  g.stroke({ width: 1.4, color: 0xe85d4c, alpha: 0.35 + anim.pulse * 0.25 });
  ellipse(g, p.x, p.y, r + 4, (r + 4) * 0.48);
  g.stroke({ width: 0.9, color: 0xff8a7a, alpha: 0.14 + anim.pulse2 * 0.12 });

  // Sprite overlay (MapIconOverlay) draws swords when assets are ready
  if (!mapIconsReady()) {
    drawCrossedSwords(g, p.x, p.y - 34 - anim.pulse * 0.6, 0.75, anim);
  }
}

/** Two crossed swords — battle / contested marker. */
export function drawCrossedSwords(
  g: Graphics,
  cx: number,
  cy: number,
  scale: number,
  anim?: AnimClock,
): void {
  const flash = anim ? 0.75 + anim.pulse * 0.25 : 0.95;
  const drawOne = (ang: number, blade: number, guard: number) => {
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    const len = 11 * scale;
    // blade
    g.moveTo(cx - c * len, cy - s * len);
    g.lineTo(cx + c * len, cy + s * len);
    g.stroke({ width: 2.2 * scale, color: blade, alpha: flash });
    // tip highlight
    g.moveTo(cx + c * (len - 2), cy + s * (len - 2));
    g.lineTo(cx + c * len, cy + s * len);
    g.stroke({ width: 1.2 * scale, color: 0xfff5e8, alpha: flash });
    // crossguard
    const px = -s;
    const py = c;
    const midX = cx + c * 2 * scale;
    const midY = cy + s * 2 * scale;
    g.moveTo(midX - px * 4 * scale, midY - py * 4 * scale);
    g.lineTo(midX + px * 4 * scale, midY + py * 4 * scale);
    g.stroke({ width: 2 * scale, color: guard, alpha: flash });
    // pommel
    g.circle(cx - c * len, cy - s * len, 1.6 * scale);
    g.fill({ color: guard, alpha: flash });
  };
  drawOne((-Math.PI / 4) * 0.95, 0xffe8e0, 0xc9a227);
  drawOne((Math.PI / 4) * 0.95, 0xe85d4c, 0xc9a227);
}

/**
 * Tactical battle aura — thin rings, sparse tracers, soft embers.
 * No opaque comic explosions; fits imperial briefing table.
 */
export function drawBattleFx(
  g: Graphics,
  s: StarSystem,
  anim: AnimClock,
): void {
  const p = toIso(s.x, s.y);
  const seed = s.id.charCodeAt(0) * 0.13;
  const cx = p.x;
  const cy = p.y - 2;

  // Soft hazard wash under the node
  ellipse(g, cx, cy, 16, 8);
  g.fill({ color: 0xe85d4c, alpha: 0.06 + anim.pulse * 0.04 });

  // Dual pulsing tactical rings (isometric)
  const r1 = 18 + anim.pulse * 2.5;
  ellipse(g, cx, cy, r1, r1 * 0.48);
  g.stroke({
    width: 1.15,
    color: 0xe85d4c,
    alpha: 0.28 + anim.pulse * 0.18,
  });
  const r2 = 24 + anim.pulse2 * 2;
  ellipse(g, cx, cy, r2, r2 * 0.48);
  g.stroke({
    width: 0.9,
    color: 0xc9a227,
    alpha: 0.12 + anim.pulse2 * 0.1,
  });

  // Expanding shock ring — thin, fades out
  const shock = (anim.t * 0.55 + seed) % 1;
  const sr = 12 + shock * 22;
  ellipse(g, cx, cy, sr, sr * 0.48);
  g.stroke({
    width: 1,
    color: 0xff8a7a,
    alpha: 0.22 * (1 - shock),
  });

  // Sparse muzzle tracers — short, low alpha
  for (let i = 0; i < 4; i++) {
    const a = seed + i * 1.55 + anim.t * (1.1 + (i % 2) * 0.25);
    const dist = 8 + ((anim.t * 18 + i * 9) % 20);
    const x0 = cx + Math.cos(a) * dist;
    const y0 = cy + Math.sin(a) * dist * 0.48;
    const x1 = cx + Math.cos(a) * (dist + 5);
    const y1 = cy + Math.sin(a) * (dist + 5) * 0.48;
    const life = 0.18 + 0.28 * (0.5 + 0.5 * Math.sin(anim.t * 4.2 + i));
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.stroke({
      width: 1,
      color: i % 2 === 0 ? 0xffd27a : 0xe85d4c,
      alpha: life,
    });
  }

  // Tiny ember sparks (not big blobs)
  for (let i = 0; i < 5; i++) {
    const phase = (anim.t * 1.15 + seed + i * 0.61) % 1;
    const fade = Math.sin(phase * Math.PI);
    if (fade < 0.2) continue;
    const ang = seed * 3 + i * 1.25 + anim.t * 0.35;
    const rad = 6 + phase * 14;
    const ex = cx + Math.cos(ang) * rad;
    const ey = cy + Math.sin(ang) * rad * 0.48;
    g.circle(ex, ey, 0.9 + fade * 0.8);
    g.fill({
      color: phase < 0.4 ? 0xffe8b0 : 0xe85d4c,
      alpha: 0.35 * fade * (1 - phase * 0.5),
    });
  }

  // Small disc under swords marker
  g.circle(cx, cy - 32, 7);
  g.fill({ color: 0x0a101c, alpha: 0.55 });
  g.circle(cx, cy - 32, 7);
  g.stroke({
    width: 1,
    color: 0xe85d4c,
    alpha: 0.45 + anim.pulse * 0.2,
  });
}

/** Stellar / corridor / capital — imperial briefing tokens. */
export function drawSystemGlyph(
  g: Graphics,
  s: StarSystem,
  selected: boolean,
  anim: AnimClock,
  ownerColor?: number,
  lod: MapLod = "near",
  shareColors?: number[],
  opts?: { dim?: number; emphasize?: boolean },
): void {
  const colors: FactionThemeColors | undefined = ownerColor
    ? {
        fill: ownerColor,
        border: ownerColor,
        system: ownerColor,
        name: ownerColor,
        nameFont: "",
      }
    : undefined;
  classicTheme.drawSystem(
    g,
    s,
    selected,
    anim,
    colors,
    lod,
    shareColors,
    { dim: opts?.dim ?? 1, emphasize: !!opts?.emphasize },
  );
}

export interface FleetSlot {
  fleet: Fleet;
  x: number;
  y: number;
  /** How many fleets of this faction are stacked on this glyph. */
  stackCount: number;
  fleetIds: string[];
}

/**
 * One glyph per fleet on an east arc (so multiple fleets of one faction stay visible).
 * Selected fleet is drawn slightly closer to the star.
 */
export function layoutFleetsAroundSystem(
  system: StarSystem,
  fleets: Fleet[],
  anim?: AnimClock,
  selectedFleetId?: string | null,
): FleetSlot[] {
  const p = toIso(system.x, system.y);
  if (fleets.length === 0) return [];

  const ordered = [...fleets];
  if (selectedFleetId) {
    const idx = ordered.findIndex((f) => f.id === selectedFleetId);
    if (idx > 0) {
      const [sel] = ordered.splice(idx, 1);
      ordered.unshift(sel!);
    }
  }

  const n = ordered.length;
  // Orbit radius ~2× prior — larger hit/visual fleet icons
  const rx = 72 + Math.min(n, 8) * 8;
  const ry = rx * 0.48;
  const a0 = -0.85;
  const a1 = 1.15;

  return ordered.map((fleet, i) => {
    const t = n === 1 ? 0.35 : i / Math.max(n - 1, 1);
    const a = a0 + (a1 - a0) * t;
    const bob = anim ? Math.sin(anim.t * 2.2 + i) * 0.5 : 0;
    const pull = fleet.id === selectedFleetId ? 0.88 : 1;
    return {
      fleet,
      x: p.x + Math.cos(a) * rx * pull,
      y: p.y + Math.sin(a) * ry * pull + bob,
      stackCount: 1,
      fleetIds: [fleet.id],
    };
  });
}

/** Stance pip + selection only — ship body comes from game-icons sprites. */
export function drawFleetStanceBadge(
  g: Graphics,
  x: number,
  y: number,
  stance: Fleet["stance"],
  selected: boolean,
  stackCount = 1,
): void {
  if (selected) {
    ellipse(g, x, y + 4, 12, 5.5);
    g.stroke({ width: 1.4, color: 0xc9a227, alpha: 0.85 });
  }
  const bx = x + 10;
  const by = y - 9;
  if (stance === "attack") {
    g.moveTo(bx, by - 3);
    g.lineTo(bx + 3, by + 2);
    g.lineTo(bx - 3, by + 2);
    g.closePath();
    g.fill({ color: 0xe85d4c, alpha: 0.95 });
  } else if (stance === "defend" || stance === "fortify") {
    g.moveTo(bx, by - 3);
    g.lineTo(bx + 3.5, by);
    g.lineTo(bx + 2.5, by + 3.5);
    g.lineTo(bx - 2.5, by + 3.5);
    g.lineTo(bx - 3.5, by);
    g.closePath();
    g.fill({
      color: stance === "fortify" ? 0x3dcea8 : 0x5cdb95,
      alpha: 0.95,
    });
  } else if (stance === "move") {
    g.moveTo(bx - 2, by - 2);
    g.lineTo(bx + 4, by);
    g.lineTo(bx - 2, by + 2);
    g.closePath();
    g.fill({ color: 0x4cc9f0, alpha: 0.95 });
  } else if (stance === "blockade") {
    g.circle(bx, by, 3.2);
    g.stroke({ width: 1.6, color: 0xe8a54c, alpha: 0.95 });
    g.moveTo(bx - 2.2, by - 2.2);
    g.lineTo(bx + 2.2, by + 2.2);
    g.stroke({ width: 1.4, color: 0xe8a54c, alpha: 0.95 });
  } else if (stance === "repair") {
    g.moveTo(bx - 2, by);
    g.lineTo(bx + 2, by);
    g.moveTo(bx, by - 2);
    g.lineTo(bx, by + 2);
    g.stroke({ width: 1.6, color: 0x9b6bff, alpha: 0.95 });
  }
  if (stackCount > 1) {
    const sx = x - 10;
    const sy2 = y - 10;
    g.rect(sx - 8, sy2 - 7, 16, 13);
    g.fill({ color: 0x0a1018, alpha: 0.75 });
    g.rect(sx - 8, sy2 - 7, 16, 13);
    g.stroke({ width: 1, color: 0xc9a227, alpha: 0.7 });
  }
}

/** Clear chevron / ship — optional ×N stack badge. Fallback when sprites unavailable. */
export function drawFleetGlyph(
  g: Graphics,
  x: number,
  y: number,
  color: number,
  selected: boolean,
  stance: Fleet["stance"],
  anim: AnimClock,
  kind: FleetKind = "combat",
  stackCount = 1,
): void {
  const kt = fleetKindTint(kind);
  const scale = selected ? 1.15 : 1;
  const bob = Math.sin(anim.t * 2.4 + x * 0.02) * 0.5;
  const sy = y + bob;

  ellipse(g, x, sy + 6, 7 * scale, 3 * scale);
  g.fill({ color: 0x000000, alpha: 0.35 });
  ellipse(g, x, sy + 4, 6.5 * scale, 2.8 * scale);
  g.stroke({ width: 1.4, color, alpha: 0.85 });

  if (kind === "trade" || kind === "transport") {
    g.moveTo(x, sy - 9 * scale);
    g.lineTo(x + 8 * scale, sy + 5 * scale);
    g.lineTo(x + 3 * scale, sy + 3 * scale);
    g.lineTo(x + 3 * scale, sy + 6 * scale);
    g.lineTo(x - 3 * scale, sy + 6 * scale);
    g.lineTo(x - 3 * scale, sy + 3 * scale);
    g.lineTo(x - 8 * scale, sy + 5 * scale);
    g.closePath();
    g.fill({ color, alpha: 0.96 });
    g.stroke({ width: 1.2, color: kt, alpha: 0.9 });
  } else if (kind === "carrier") {
    g.moveTo(x, sy - 10 * scale);
    g.lineTo(x + 9 * scale, sy + 2 * scale);
    g.lineTo(x + 4 * scale, sy + 1 * scale);
    g.lineTo(x + 5 * scale, sy + 6 * scale);
    g.lineTo(x - 5 * scale, sy + 6 * scale);
    g.lineTo(x - 4 * scale, sy + 1 * scale);
    g.lineTo(x - 9 * scale, sy + 2 * scale);
    g.closePath();
    g.fill({ color, alpha: 0.96 });
    g.stroke({ width: 1.2, color: kt, alpha: 0.9 });
  } else {
    g.moveTo(x, sy - 11 * scale);
    g.lineTo(x + 7.5 * scale, sy + 6 * scale);
    g.lineTo(x, sy + 2.5 * scale);
    g.lineTo(x - 7.5 * scale, sy + 6 * scale);
    g.closePath();
    g.fill({ color, alpha: 0.97 });
    g.stroke({ width: 1.3, color: 0xc9a227, alpha: 0.45 });
    g.moveTo(x, sy - 5 * scale);
    g.lineTo(x, sy + 1 * scale);
    g.stroke({ width: 1.5, color: kt, alpha: 0.95 });
  }

  const flicker = 0.5 + anim.pulse2 * 0.5;
  g.moveTo(x - 2, sy + 6 * scale);
  g.lineTo(x, sy + 6 * scale + 4 * flicker);
  g.lineTo(x + 2, sy + 6 * scale);
  g.fill({
    color: stance === "attack" ? 0xe85d4c : 0xc9a227,
    alpha: 0.55 * flicker,
  });

  drawFleetStanceBadge(g, x, sy, stance, selected, stackCount);
}

export function drawLink(
  g: Graphics,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  linkType:
    | "corridor"
    | "gate"
    | "unstable"
    | "damyl_space"
    | "damyl_planet",
  anim: AnimClock,
  selected = false,
  /** Moving packet — only empire interior / trade routes. */
  traffic = false,
): void {
  if (linkType === "damyl_space" || linkType === "damyl_planet") {
    /* drawn via drawSpecialLink in MapCanvas */
    return;
  }
  const a = toIso(ax, ay);
  const b = toIso(bx, by);
  const isCorridor = linkType === "corridor";
  const isGate = linkType === "gate";
  const isUnstable = linkType === "unstable";

  g.moveTo(a.x, a.y);
  g.lineTo(b.x, b.y);
  g.stroke({
    width: selected ? 5.5 : isGate ? 4.2 : isCorridor ? 3.4 : 2.6,
    color: 0x0a0e14,
    alpha: 0.55,
  });

  const baseColor = selected
    ? 0xe8c547
    : isGate
      ? 0xc9a227
      : isUnstable
        ? 0xe85d4c
        : isCorridor
          ? 0x6a849e
          : 0x3a4a66;

  g.moveTo(a.x, a.y);
  g.lineTo(b.x, b.y);
  g.stroke({
    width: selected ? 2.6 : isCorridor || isGate ? 1.9 : 1.4,
    color: baseColor,
    alpha: selected
      ? 0.95
      : isCorridor || isGate
        ? 0.55
        : 0.7,
  });

  if (traffic && (isCorridor || isGate || selected)) {
    const u = (anim.t * 0.28) % 1;
    const sx = a.x + (b.x - a.x) * u;
    const sy = a.y + (b.y - a.y) * u;
    g.circle(sx, sy, isGate ? 2.6 : 2);
    g.fill({
      color: selected ? 0xffe08a : isGate ? 0xe8c547 : 0x9bb4cc,
      alpha: 0.8,
    });
  }
}

/** Animate traffic on links inside a state empire or on trade routes. */
export function linkHasTraffic(
  a: StarSystem,
  b: StarSystem,
  world: WorldState,
): boolean {
  if (a.tradeWithSystemId === b.id || b.tradeWithSystemId === a.id) return true;
  if (
    a.ownerFactionId &&
    a.ownerFactionId === b.ownerFactionId
  ) {
    const f = world.factions.find((x) => x.id === a.ownerFactionId);
    if (isStatePolity(f)) return true;
  }
  return false;
}

export function drawOrderArrowIso(
  g: Graphics,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  color: number,
  anim: AnimClock,
): void {
  const ang = Math.atan2(by - ay, bx - ax);
  const dx = Math.cos(ang);
  const dy = Math.sin(ang);

  g.moveTo(ax, ay);
  g.lineTo(bx, by);
  g.stroke({ width: 5, color: 0x0a0e14, alpha: 0.5 });

  g.moveTo(ax, ay);
  g.lineTo(bx, by);
  g.stroke({
    width: 2.4,
    color,
    alpha: 0.7 + anim.pulse * 0.22,
  });

  const len = Math.hypot(bx - ax, by - ay) || 1;
  const steps = Math.max(2, Math.floor(len / 28));
  const phase = (anim.t * 0.4) % 1;
  for (let i = 0; i < steps; i++) {
    const t = (i + phase) / steps;
    if (t > 0.92) continue;
    const px = ax + (bx - ax) * t;
    const py = ay + (by - ay) * t;
    g.circle(px, py, 2);
    g.fill({ color, alpha: 0.55 + anim.pulse * 0.25 });
  }

  g.moveTo(bx, by);
  g.lineTo(bx - 12 * Math.cos(ang - 0.42), by - 12 * Math.sin(ang - 0.42));
  g.lineTo(bx - 12 * Math.cos(ang + 0.42), by - 12 * Math.sin(ang + 0.42));
  g.closePath();
  g.fill({ color, alpha: 0.95 });
  g.circle(bx - dx * 4, by - dy * 4, 2);
  g.fill({ color: 0xffffff, alpha: 0.55 });
}

export function drawOrderArrow(
  g: Graphics,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  color: number,
  anim: AnimClock,
): void {
  const a = toIso(ax, ay);
  const b = toIso(bx, by);
  drawOrderArrowIso(g, a.x, a.y, b.x, b.y, color, anim);
}

/** Soft nebula / star dust — kept as light dust; main field is drawStarfield. */
export function drawAmbientFx(g: Graphics, anim: AnimClock): void {
  g.clear();
  for (let i = 0; i < 18; i++) {
    const seed = i * 97.13;
    const x = ((Math.sin(seed) * 0.5 + 0.5) * 2400) - 1200;
    const y = ((Math.cos(seed * 1.3) * 0.5 + 0.5) * 1600) - 800;
    const tw = 0.15 + 0.85 * (0.5 + 0.5 * Math.sin(anim.t * 1.7 + seed));
    g.circle(x, y, 0.7 + (i % 3) * 0.3);
    g.fill({ color: 0xc9a227, alpha: 0.03 + tw * 0.05 });
  }
}

/** Canonical activity badge colors — shared with mapIconSprites ACTIVITY_TINT. */
export const ACTIVITY_COLOR: Record<SystemActivity, number> = {
  none: 0x000000,
  battle: 0xe85d4c,
  trade: 0xf0c14a,
  repair: 0x4cc9f0,
  garrison: 0x5cdb95,
  transit: 0x7b6cff,
};

function numericColorMapToFactionColors(
  colors: Map<string, number>,
  slot: "fill" | "border" | "system",
): Map<string, FactionThemeColors> {
  const out = new Map<string, FactionThemeColors>();
  for (const [id, n] of colors) {
    out.set(id, {
      fill: slot === "fill" ? n : 0x888888,
      border: slot === "border" ? n : 0x888888,
      system: slot === "system" ? n : 0x888888,
      name: n,
      nameFont: "",
    });
  }
  return out;
}

/** Soft influence glow under systems — baked concentric bloom, no filter. */
export function drawTerritoryGlow(
  g: Graphics,
  world: WorldState,
  fillColors: Map<string, number>,
  opts?: { rich?: boolean; cinematic?: boolean },
): void {
  classicTheme.drawTerritory(
    g,
    world,
    numericColorMapToFactionColors(fillColors, "fill"),
    { t: 0, pulse: 0.5, pulse2: 0.5 },
    {
      rich: opts?.rich ?? true,
      cinematic: opts?.cinematic ?? false,
    },
  );
}

/** Crisp faction borders — dual-rail imperial enamel. */
export function drawTerritoryBorders(
  g: Graphics,
  world: WorldState,
  borderColors: Map<string, number>,
  anim: AnimClock,
): void {
  classicTheme.drawTerritoryBorder(
    g,
    world,
    numericColorMapToFactionColors(borderColors, "border"),
    anim,
  );
}

/** @deprecated use drawTerritoryGlow + drawTerritoryBorders */
export function drawTerritories(
  g: Graphics,
  world: WorldState,
  factionColors: Map<string, number>,
  anim: AnimClock,
): void {
  drawTerritoryGlow(g, world, factionColors);
  drawTerritoryBorders(g, world, factionColors, anim);
}

/** Geographic sector plates — barely-visible briefing grid. */
export function drawSectors(
  g: Graphics,
  world: WorldState,
  selectedSectorId: string | null,
  draftPoints: number[],
): void {
  g.clear();
  for (const sector of world.sectors) {
    const pts = sectorPoints(sector).map((p) => toIso(p.x, p.y));
    if (pts.length < 2) continue;
    const selected = sector.id === selectedSectorId;
    const color = parseFactionColor(sector.color ?? "#8a9bb0");

    g.moveTo(pts[0]!.x, pts[0]!.y);
    for (let i = 1; i < pts.length; i++) {
      g.lineTo(pts[i]!.x, pts[i]!.y);
    }
    g.closePath();
    g.fill({ color, alpha: selected ? 0.05 : 0.012 });

    g.moveTo(pts[0]!.x, pts[0]!.y);
    for (let i = 1; i < pts.length; i++) {
      g.lineTo(pts[i]!.x, pts[i]!.y);
    }
    g.closePath();
    g.stroke({
      width: selected ? 1.4 : 0.7,
      color: selected ? 0xc9a227 : 0xb8c4d4,
      alpha: selected ? 0.55 : 0.11,
    });
  }

  if (draftPoints.length >= 2) {
    const dpts: { x: number; y: number }[] = [];
    for (let i = 0; i + 1 < draftPoints.length; i += 2) {
      dpts.push(toIso(draftPoints[i]!, draftPoints[i + 1]!));
    }
    g.moveTo(dpts[0]!.x, dpts[0]!.y);
    for (let i = 1; i < dpts.length; i++) {
      g.lineTo(dpts[i]!.x, dpts[i]!.y);
    }
    g.stroke({ width: 2, color: 0xffe08a, alpha: 0.85 });
    for (const p of dpts) {
      g.circle(p.x, p.y, 3.5);
      g.fill({ color: 0xffe08a, alpha: 0.9 });
    }
  }
}

/** Faction labels + heraldry emblems at ownership blob centroids. */
export function drawFactionLabels(
  labels: Container,
  world: WorldState,
  anim: AnimClock,
  textCache: Map<string, Text>,
  emblemCache: Map<string, Sprite>,
  emblemLoading: Set<string>,
  labelScale = 1,
  /** When set, only this faction's polity label is drawn (progressive density). */
  onlyFactionId?: string | null,
): void {
  const blobs = getFactionBlobs(systemsForStateTerritory(world));
  const seen = new Set<string>();

  for (const blob of blobs) {
    const faction = world.factions.find((f) => f.id === blob.factionId);
    if (!faction) continue;
    if (onlyFactionId && faction.id !== onlyFactionId) continue;
    seen.add(faction.id);
    const c = centroid(blob.outline);
    const hasEmblem = !!(faction.emblemPath && faction.emblemPath.length > 8);
    const fill = parseFactionColor(resolveFactionNameColor(faction));
    const fontFamily = resolveFactionNameFont(faction);
    const cacheKey = `fac:${faction.id}`;

    let label = textCache.get(cacheKey);
    if (!label) {
      label = new Text({
        text: faction.name,
        style: {
          fontSize: 17,
          fill,
          fontFamily,
          fontWeight: "600",
          letterSpacing: 0.9,
          align: "center",
          stroke: { color: 0x05070c, width: 4, join: "round" },
          dropShadow: {
            color: 0x000000,
            alpha: 0.4,
            blur: 2,
            distance: 1,
            angle: Math.PI / 2,
          },
        },
      });
      label.anchor.set(0.5);
      textCache.set(cacheKey, label);
      labels.addChild(label);
    }
    label.text = faction.name;
    label.style.fontFamily = fontFamily;
    label.style.fill = fill;
    label.style.fontSize = 17;
    label.style.letterSpacing = 0.9;
    label.visible = true;
    label.scale.set(labelScale);
    label.position.set(c.x, c.y + (hasEmblem ? 22 : -6));
    label.alpha = 0.72 + anim.pulse * 0.05;

    ensureEmblemSprite(
      labels,
      emblemCache,
      emblemLoading,
      `emb:${faction.id}`,
      faction.emblemPath,
      c.x,
      c.y - 24,
      40,
      anim,
    );
  }

  for (const [key, label] of textCache) {
    const factionId = key.startsWith("facpfx:")
      ? key.slice(7)
      : key.startsWith("fac:")
        ? key.slice(4)
        : null;
    if (factionId && !seen.has(factionId)) {
      label.visible = false;
    }
  }
  for (const [key, sprite] of emblemCache) {
    if (key.startsWith("emb:") && !seen.has(key.slice(4))) {
      sprite.visible = false;
    }
  }
}

/** Heraldry over capital systems (easy to spot on the galaxy map). */
export function drawCapitalEmblems(
  labels: Container,
  world: WorldState,
  anim: AnimClock,
  emblemCache: Map<string, Sprite>,
  emblemLoading: Set<string>,
): void {
  const seen = new Set<string>();
  for (const s of world.systems) {
    if (!s.isCapital || !s.ownerFactionId) continue;
    const faction = world.factions.find((f) => f.id === s.ownerFactionId);
    if (!faction?.emblemPath || faction.emblemPath.length < 8) continue;
    const key = `capemb:${s.id}`;
    seen.add(key);
    const p = toIso(s.x, s.y);
    ensureEmblemSprite(
      labels,
      emblemCache,
      emblemLoading,
      key,
      faction.emblemPath,
      p.x,
      p.y - 42,
      28,
      anim,
    );
  }
  for (const [key, sprite] of emblemCache) {
    if (key.startsWith("capemb:") && !seen.has(key)) {
      sprite.visible = false;
    }
  }
}

function ensureEmblemSprite(
  labels: Container,
  emblemCache: Map<string, Sprite>,
  emblemLoading: Set<string>,
  emblemKey: string,
  src: string | undefined,
  x: number,
  y: number,
  size: number,
  anim: AnimClock,
): void {
  if (!src || src.length < 8) {
    const sprite = emblemCache.get(emblemKey);
    if (sprite) sprite.visible = false;
    return;
  }
  let sprite = emblemCache.get(emblemKey);
  const stale =
    sprite && (sprite as Sprite & { __src?: string }).__src !== src;
  if (stale && sprite) {
    labels.removeChild(sprite);
    sprite.destroy();
    emblemCache.delete(emblemKey);
    sprite = undefined;
  }
  if (!sprite && !emblemLoading.has(emblemKey)) {
    emblemLoading.add(emblemKey);
    const loadGen =
      (labels as Container & { __embGen?: number }).__embGen ?? 0;
    void Assets.load(src)
      .then((texture) => {
        if (labels.destroyed) return;
        if (
          ((labels as Container & { __embGen?: number }).__embGen ?? 0) !==
          loadGen
        ) {
          return;
        }
        const existing = emblemCache.get(emblemKey);
        if (existing && !existing.destroyed) {
          labels.removeChild(existing);
          existing.destroy();
        }
        const s = new Sprite(texture) as Sprite & { __src?: string };
        s.anchor.set(0.5);
        s.width = size;
        s.height = size;
        s.__src = src;
        emblemCache.set(emblemKey, s);
        labels.addChild(s);
      })
      .catch(() => {
        /* ignore bad image */
      })
      .finally(() => {
        emblemLoading.delete(emblemKey);
      });
  }
  sprite = emblemCache.get(emblemKey);
  if (sprite && !sprite.destroyed) {
    sprite.visible = true;
    sprite.width = size;
    sprite.height = size;
    sprite.position.set(x, y);
    sprite.alpha = 0.92 + anim.pulse * 0.05;
  }
}

export function drawActivityBadge(
  g: Graphics,
  s: StarSystem,
  anim: AnimClock,
): void {
  if (!s.activity || s.activity === "none") return;
  const p = toIso(s.x, s.y);
  const color = ACTIVITY_COLOR[s.activity];
  const cx = p.x - 22;
  const cy = p.y - 26;

  g.circle(cx, cy, 7);
  g.fill({ color: 0x0a101c, alpha: 0.9 });
  g.circle(cx, cy, 7);
  g.stroke({ width: 1.3, color, alpha: 0.9 });

  // Glyphs come from MapIconOverlay when game-icons are loaded
  if (mapIconsReady()) {
    if (s.activity === "battle") {
      g.circle(cx, cy, 10 + anim.pulse * 1.5);
      g.stroke({ width: 1, color, alpha: 0.3 + anim.pulse * 0.25 });
    }
    return;
  }

  if (s.activity === "battle") {
    drawCrossedSwords(g, cx, cy, 0.55, anim);
    g.circle(cx, cy, 10 + anim.pulse * 1.5);
    g.stroke({ width: 1, color, alpha: 0.3 + anim.pulse * 0.25 });
  } else if (s.activity === "trade") {
    g.circle(cx, cy, 3);
    g.fill({ color, alpha: 0.95 });
  } else if (s.activity === "repair") {
    g.moveTo(cx - 3.5, cy);
    g.lineTo(cx + 3.5, cy);
    g.moveTo(cx, cy - 3.5);
    g.lineTo(cx, cy + 3.5);
    g.stroke({ width: 1.6, color, alpha: 0.95 });
  } else if (s.activity === "garrison") {
    g.moveTo(cx, cy - 4);
    g.lineTo(cx + 4, cy - 1);
    g.lineTo(cx + 3, cy + 3.5);
    g.lineTo(cx - 3, cy + 3.5);
    g.lineTo(cx - 4, cy - 1);
    g.closePath();
    g.fill({ color, alpha: 0.9 });
  } else if (s.activity === "transit") {
    g.moveTo(cx - 4, cy - 2.5);
    g.lineTo(cx + 4, cy);
    g.lineTo(cx - 4, cy + 2.5);
    g.stroke({ width: 1.5, color, alpha: 0.95 });
  }
}

export function drawTradeLanes(
  g: Graphics,
  world: WorldState,
  anim: AnimClock,
): void {
  const byId = new Map(world.systems.map((s) => [s.id, s]));
  for (const s of world.systems) {
    if (s.activity !== "trade" || !s.tradeWithSystemId) continue;
    const other = byId.get(s.tradeWithSystemId);
    if (!other) continue;
    if (s.id > other.id) continue; // draw once
    const a = toIso(s.x, s.y);
    const b = toIso(other.x, other.y);
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);
    g.stroke({
      width: 2,
      color: 0xf0c14a,
      alpha: 0.35 + anim.pulse * 0.25,
    });
    const u = (anim.t * 0.25) % 1;
    g.circle(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u, 2.5);
    g.fill({ color: 0xffe08a, alpha: 0.85 });
  }
}

export function drawDiplomacyLines(
  g: Graphics,
  world: WorldState,
  anim: AnimClock,
): void {
  g.clear();
  const territories = getFactionBlobs(systemsForStateTerritory(world));
  const centers = new Map<string, Pt>();
  for (const t of territories) {
    centers.set(t.factionId, centroid(t.outline));
  }
  // fallback: average of owned systems
  for (const f of world.factions) {
    if (centers.has(f.id)) continue;
    const owned = world.systems.filter((s) => s.ownerFactionId === f.id);
    if (!owned.length) continue;
    let x = 0;
    let y = 0;
    for (const s of owned) {
      const p = toIso(s.x, s.y);
      x += p.x;
      y += p.y;
    }
    centers.set(f.id, { x: x / owned.length, y: y / owned.length });
  }

  const colorByRel: Record<string, number> = {
    alliance: 0x5cdb95,
    trade: 0xf0c14a,
    war: 0xe85d4c,
    vassal: 0x7b6cff,
    truce: 0xc9a227,
    nap: 0x7a9bb8,
    research_pact: 0x9b6bff,
    migration_treaty: 0x4cc9f0,
    embargo: 0xe8a54c,
    neutral: 0x556677,
  };

  for (const edge of world.diplomacy ?? []) {
    if (edge.relation === "neutral") continue;
    const a = centers.get(edge.aId);
    const b = centers.get(edge.bId);
    if (!a || !b) continue;
    const col = colorByRel[edge.relation] ?? 0x888888;
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);
    g.stroke({
      width: edge.relation === "war" ? 2.5 : 2,
      color: col,
      alpha: 0.45 + anim.pulse * 0.25,
    });
    if (edge.relation === "war") {
      const u = 0.5 + Math.sin(anim.t * 4) * 0.05;
      g.circle(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u, 3);
      g.fill({ color: col, alpha: 0.8 });
    }
  }
}

/** Legion stance pip when body is a game-icons sprite. */
export function drawLegionStanceBadge(
  g: Graphics,
  x: number,
  y: number,
  status: Legion["status"],
  selected: boolean,
): void {
  if (selected) {
    ellipse(g, x, y + 8, 12, 4.5);
    g.stroke({ width: 1.4, color: 0xe8c547, alpha: 0.85 });
  }
  if (status === "assault") {
    g.moveTo(x + 10, y - 6);
    g.lineTo(x + 14, y - 3);
    g.lineTo(x + 10, y);
    g.closePath();
    g.fill({ color: 0xe85d4c, alpha: 0.95 });
  } else if (status === "recovering") {
    g.circle(x + 11, y - 2, 2.2);
    g.stroke({ width: 1.3, color: 0x7a9bb8, alpha: 0.95 });
  } else if (status === "garrison" || status === "fortify") {
    g.rect(x + 9, y - 4, 3.5, 5);
    g.fill({ color: 0x5cdb95, alpha: 0.9 });
  } else if (status === "blockade") {
    g.circle(x + 11, y - 2, 3);
    g.stroke({ width: 1.4, color: 0xe8a54c, alpha: 0.95 });
  } else if (status === "move") {
    g.moveTo(x + 8, y - 3);
    g.lineTo(x + 13, y - 1);
    g.lineTo(x + 8, y + 1);
    g.closePath();
    g.fill({ color: 0x4cc9f0, alpha: 0.95 });
  }
}

/** Legion as campaign banner — pole + flag, south of the system. */
export function drawLegionGlyph(
  g: Graphics,
  x: number,
  y: number,
  color: number,
  selected: boolean,
  status: Legion["status"],
  anim: AnimClock,
): void {
  const bob = Math.sin(anim.t * 2 + x * 0.01) * 0.5;
  const top = y - 14 + bob;
  const mid = y - 2 + bob;
  const bot = y + 8 + bob;

  ellipse(g, x, y + 10, 5, 2.2);
  g.fill({ color: 0x000000, alpha: 0.3 });

  g.moveTo(x - 0.5, top - 2);
  g.lineTo(x - 0.5, bot);
  g.lineTo(x + 0.5, bot);
  g.lineTo(x + 0.5, top - 2);
  g.closePath();
  g.fill({ color: 0xd8c890, alpha: 0.95 });
  g.circle(x, top - 2, 1.8);
  g.fill({ color: 0xc9a227, alpha: 0.95 });

  g.moveTo(x + 0.5, top);
  g.lineTo(x + 14, top + 1);
  g.lineTo(x + 11, mid - 1);
  g.lineTo(x + 14, mid + 4);
  g.lineTo(x + 0.5, mid + 5);
  g.closePath();
  g.fill({ color, alpha: 0.96 });
  g.stroke({ width: 1.1, color: 0xe8c547, alpha: 0.55 });

  g.moveTo(x + 0.5, top + 4);
  g.lineTo(x + 10, top + 5);
  g.stroke({ width: 1.2, color: 0x000000, alpha: 0.25 });

  drawLegionStanceBadge(g, x, y + bob, status, selected);
}

export function layoutLegionsAroundSystem(
  system: StarSystem,
  legions: Legion[],
  anim?: AnimClock,
): { legion: Legion; x: number; y: number }[] {
  const p = toIso(system.x, system.y);
  const n = legions.length;
  // South row, wide spacing — clear of fleets (east) and resources (SW)
  return legions.map((legion, i) => {
    const offset = (i - (n - 1) / 2) * 44;
    const bob = anim ? Math.sin(anim.t * 2 + i) * 0.4 : 0;
    return {
      legion,
      x: p.x + offset,
      y: p.y + 56 + bob,
    };
  });
}

export function fleetKindTint(kind: FleetKind): number {
  switch (kind) {
    case "trade":
      return 0xe8c547;
    case "patrol":
      return 0x7a9bb8;
    case "transport":
      return 0xb8c4d9;
    case "carrier":
      return 0xc9a227;
    case "support":
      return 0x5cdb95;
    default:
      return 0xe8eef4;
  }
}
