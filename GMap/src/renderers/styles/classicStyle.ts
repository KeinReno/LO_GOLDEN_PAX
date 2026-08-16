import type { Graphics } from "pixi.js";
import type { StarSystem, WorldState } from "../../state/types";
import { starColor } from "../../generators/systemFactory";
import {
  censusPlanets,
  HABIT_COLORS,
  isCorridorSystem,
} from "../../state/planets";
import {
  getFactionBlobs,
  systemsForStateTerritory,
} from "../../state/territory";
import { toIso } from "../iso";
import { mapIconsReady } from "../mapIconAssets";
import {
  drawSystemToken,
  type AnimClock,
  type MapLod,
} from "../drawMapIcons";
import type { FactionThemeColors, MapTheme } from "./mapTheme";

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

function drawStarPolygon(
  g: Graphics,
  cx: number,
  cy: number,
  points: number,
  outerR: number,
  innerR: number,
  rotation: number,
): void {
  const steps = points * 2;
  for (let i = 0; i <= steps; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const a = rotation + (i / steps) * Math.PI * 2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
}

function drawTerritory(
  g: Graphics,
  world: WorldState,
  factionColors: Map<string, FactionThemeColors>,
  _anim: AnimClock,
  opts: { rich: boolean; cinematic: boolean },
): void {
  const rich = opts.rich;
  const cinematic = opts.cinematic;
  g.clear();
  const blobs = getFactionBlobs(systemsForStateTerritory(world));

  for (const blob of blobs) {
    const color = factionColors.get(blob.factionId)?.fill ?? 0x888888;
    const r = blob.radius;
    const coreRy = 0.58 / 1.2;

    const poly = blob.outline;
    if (poly.length >= 3) {
      g.moveTo(poly[0]!.x, poly[0]!.y);
      for (let i = 1; i < poly.length; i++) {
        g.lineTo(poly[i]!.x, poly[i]!.y);
      }
      g.closePath();
      g.fill({ color, alpha: rich ? 0.17 : 0.22 });
    }

    if (!rich) {
      for (const c of blob.cores) {
        ellipse(g, c.x, c.y, r * 1.2, r * 0.58);
        g.fill({ color, alpha: 0.14 });
      }
      for (const [a, b] of blob.bridges) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const steps = Math.max(1, Math.ceil(len / 70));
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          ellipse(g, a.x + dx * t, a.y + dy * t, r * 0.85, r * 0.42);
          g.fill({ color, alpha: 0.1 });
        }
      }
      continue;
    }

    for (const c of blob.cores) {
      const rings = [
        { rx: r * 1.9, alpha: 0.04 },
        { rx: r * 1.55, alpha: 0.07 },
        { rx: r * 1.25, alpha: 0.11 },
        { rx: r * 1.05, alpha: 0.14 },
      ];
      if (cinematic) {
        rings.unshift({ rx: r * 2.15, alpha: 0.025 });
      }
      for (const { rx, alpha } of rings) {
        ellipse(g, c.x, c.y, rx, rx * coreRy);
        g.fill({ color, alpha });
      }
    }

    for (const [a, b] of blob.bridges) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const steps = Math.max(1, Math.ceil(len / 70));
      const bridgeRy = 0.42 / 0.85;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = a.x + dx * t;
        const y = a.y + dy * t;
        for (const { rx, alpha } of [
          { rx: r * 1.05, alpha: 0.05 },
          { rx: r * 0.85, alpha: 0.1 },
        ]) {
          ellipse(g, x, y, rx, rx * bridgeRy);
          g.fill({ color, alpha });
        }
      }
    }
  }
}

function drawTerritoryBorder(
  g: Graphics,
  world: WorldState,
  factionColors: Map<string, FactionThemeColors>,
  anim: AnimClock,
): void {
  g.clear();
  const blobs = getFactionBlobs(systemsForStateTerritory(world));

  for (const blob of blobs) {
    const color = factionColors.get(blob.factionId)?.border ?? 0x888888;
    const poly = blob.outline;
    if (poly.length < 3) continue;

    const strokePoly = (width: number, col: number, alpha: number) => {
      g.moveTo(poly[0]!.x, poly[0]!.y);
      for (let i = 1; i < poly.length; i++) {
        g.lineTo(poly[i]!.x, poly[i]!.y);
      }
      g.closePath();
      g.stroke({ width, color: col, alpha });
    };

    strokePoly(7.5, 0x06080c, 0.55);
    strokePoly(5.2, color, 0.22 + anim.pulse * 0.06);
    strokePoly(2.1, color, 0.82 + anim.pulse * 0.1);
    strokePoly(0.9, 0xc9a227, 0.28 + anim.pulse * 0.08);
  }
}

function drawSystem(
  g: Graphics,
  s: StarSystem,
  selected: boolean,
  anim: AnimClock,
  colors: FactionThemeColors | undefined,
  lod: MapLod = "near",
  shareColors?: number[],
  opts?: { dim?: number; emphasize?: boolean },
): void {
  const ownerColor = colors?.system;
  const p = toIso(s.x, s.y);
  const dim = opts?.dim ?? 1;
  const emphasize = !!opts?.emphasize || selected;
  const near = lod === "near" || emphasize;
  const corridor = isCorridorSystem(s);
  const phase = s.id.charCodeAt(0) * 0.17;
  const isCapital = !!s.isCapital;
  const censusEarly = censusPlanets(s.planets);
  const inhabited = censusEarly.inhabited > 0;
  const unsettled =
    !corridor && censusEarly.total > 0 && censusEarly.inhabited === 0;
  const rim =
    ownerColor ??
    (s.poiType && s.poiType !== "none"
      ? undefined
      : starColor(s.stars[0]?.class ?? "G"));
  const neutral = !ownerColor;
  const shares =
    shareColors && shareColors.length >= 2 ? shareColors : undefined;

  if (!corridor && inhabited) {
    if (near) {
      ellipse(g, p.x, p.y + 1, 24, 12);
      g.fill({
        color: 0x3dcea8,
        alpha: (0.06 + anim.pulse * 0.03) * dim,
      });
    }
    ellipse(g, p.x, p.y + 1, near ? 20 : 16, near ? 10 : 8);
    g.stroke({
      width: near ? 1.5 : 1.15,
      color: 0x5cdb95,
      alpha: (near ? 0.5 + anim.pulse * 0.15 : 0.32) * dim,
    });
  } else if (unsettled) {
    ellipse(g, p.x, p.y + 1, near ? 17 : 14, near ? 8.5 : 7);
    g.stroke({
      width: 1,
      color: 0x6b7280,
      alpha: (near ? 0.32 + anim.pulse * 0.08 : 0.22) * dim,
    });
  }

  if (corridor) {
    const spin = anim.t * 1.4 + phase;
    drawSystemToken(g, p.x, p.y, 0x7a9bb8, selected, anim, { neutral: true });
    const r = 5 + anim.pulse * 0.8;
    for (let i = 0; i < 4; i++) {
      const a = spin + (Math.PI / 2) * i;
      const x = p.x + Math.cos(a) * r;
      const y = p.y + Math.sin(a) * r * 0.5 - 6;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
    g.stroke({ width: 1.6, color: 0xc9a227, alpha: 0.85 * dim });
    if (near) {
      const beamH = 10 + anim.pulse * 4;
      g.moveTo(p.x, p.y - 4);
      g.lineTo(p.x, p.y - 4 - beamH);
      g.stroke({
        width: 2,
        color: 0xe8c547,
        alpha: (0.3 + anim.pulse * 0.35) * dim,
      });
    }
  } else if (isCapital) {
    const accent = rim ?? 0xc9a227;
    const cx = p.x;
    const cy = p.y - 9;
    const breathe = 1 + anim.pulse * (near ? 0.06 : 0.03);
    drawSystemToken(g, p.x, p.y, accent, selected, anim, {
      capital: true,
      neutral,
      shareColors: shares,
    });
    if (near) {
      ellipse(g, p.x, p.y + 1, 20 * breathe, 10 * breathe);
      g.stroke({
        width: 1.4,
        color: 0xc9a227,
        alpha: (0.45 + anim.pulse * 0.15) * dim,
      });
    }
    g.circle(cx, cy, (near ? 12 : 10) * breathe);
    g.fill({ color: accent, alpha: (0.1 + anim.pulse * 0.04) * dim });
    drawStarPolygon(g, cx, cy, 5, 8.5 * breathe, 3.8 * breathe, -Math.PI / 2);
    g.fill({ color: accent, alpha: 0.95 * dim });
    drawStarPolygon(g, cx, cy, 5, 8.5 * breathe, 3.8 * breathe, -Math.PI / 2);
    g.stroke({ width: 1.4, color: 0xfff4d0, alpha: 0.9 * dim });
    g.circle(cx, cy, 2);
    g.fill({ color: 0xffffff, alpha: 0.95 * dim });
    if (near) {
      for (const ox of [-5, 0, 5]) {
        g.moveTo(cx + ox, cy - 12 * breathe);
        g.lineTo(cx + ox, cy - 15.5 * breathe);
        g.stroke({ width: 1.3, color: 0xe8c547, alpha: 0.85 * dim });
      }
    }
  } else {
    const primary = s.stars[0]?.class ?? "G";
    const color = rim ?? starColor(primary);
    const lum = s.stars[0]?.luminosity ?? 1;
    const breathe = 1 + anim.pulse * (near ? 0.1 : 0.04);
    const cx = p.x;
    const cy = p.y - 8;

    drawSystemToken(g, p.x, p.y, color, selected, anim, {
      neutral,
      shareColors: shares,
    });

    const glowR =
      (4 + lum * 1.8) *
      breathe *
      (inhabited ? 1.15 : unsettled ? 0.85 : 1) *
      (near ? 1 : 0.85);
    if (near) {
      g.circle(cx, cy, glowR + 8);
      g.fill({
        color: inhabited ? 0x5cdb95 : color,
        alpha:
          (inhabited ? 0.05 + anim.pulse * 0.02 : 0.04 + anim.pulse * 0.02) *
          dim,
      });
    }
    g.circle(cx, cy, glowR + (near ? 4 : 2));
    g.fill({
      color: inhabited ? 0x5cdb95 : color,
      alpha:
        (inhabited ? 0.1 + anim.pulse * 0.04 : 0.08 + anim.pulse * 0.03) * dim,
    });
    g.circle(cx, cy, glowR);
    g.fill({
      color,
      alpha:
        (unsettled ? 0.16 + anim.pulse * 0.05 : 0.28 + anim.pulse * 0.08) * dim,
    });

    if (near && (s.stars?.length ?? 0) > 1) {
      const a = anim.t * 0.9 + phase;
      g.circle(cx + Math.cos(a) * 7, cy + Math.sin(a) * 2.5, 2.2);
      g.fill({ color: starColor(s.stars[1]!.class), alpha: 0.95 * dim });
    }

    if (unsettled) {
      g.circle(cx, cy, selected ? 4.2 : 3.4);
      g.stroke({ width: 1.4, color, alpha: 0.85 * dim });
      g.circle(cx, cy, 1.2);
      g.fill({ color, alpha: 0.55 * dim });
    } else {
      g.circle(cx, cy, selected ? 4.6 : 3.6);
      g.fill({ color, alpha: dim });
      g.circle(cx - 1, cy - 1.2, 1.1);
      g.fill({
        color: 0xffffff,
        alpha: (inhabited ? 0.7 : 0.5) * dim,
      });
    }
  }

  const census = censusEarly;
  if (near && census.total > 0) {
    const pip = 2.2;
    const gap = 1.4;
    const totalW =
      census.total * (pip * 2) + Math.max(0, census.total - 1) * gap;
    let x = p.x - totalW / 2 + pip;
    const y = p.y + 12;
    const order: (keyof typeof HABIT_COLORS)[] = [
      "inhabited",
      "habitable",
      "uninhabitable",
    ];
    for (const key of order) {
      for (let i = 0; i < census[key]; i++) {
        ellipse(g, x, y, pip, pip * 0.55);
        g.fill({ color: HABIT_COLORS[key], alpha: 0.9 * dim });
        ellipse(g, x, y, pip, pip * 0.55);
        g.stroke({ width: 0.7, color: 0xffffff, alpha: 0.18 * dim });
        x += pip * 2 + gap;
      }
    }
  }

  if (near && (s.resources?.length ?? 0) > 0 && !mapIconsReady()) {
    const bx = p.x - 22;
    const by = p.y - 18;
    g.circle(bx, by, 7);
    g.fill({ color: 0x1a1408, alpha: 0.55 * dim });
    g.circle(bx, by, 7);
    g.stroke({ width: 1.1, color: 0xc9a227, alpha: 0.65 * dim });
  }

  const stations = s.stations ?? [];
  if (near && stations.length > 0) {
    const n = Math.min(stations.length, 3);
    for (let i = 0; i < n; i++) {
      const a = Math.PI * 0.55 + i * 0.45;
      const sx = p.x + Math.cos(a) * 26;
      const sy = p.y + Math.sin(a) * 13;
      g.circle(sx, sy, 2.8);
      g.fill({ color: 0x1a2233, alpha: 0.92 * dim });
      g.circle(sx, sy, 2.8);
      g.stroke({ width: 1.2, color: 0xa8c0e0, alpha: 0.95 * dim });
      g.circle(sx, sy, 1);
      g.fill({ color: 0xffffff, alpha: 0.85 * dim });
    }
  }
}

export const classicTheme: MapTheme = {
  id: "classic",
  drawTerritory,
  drawTerritoryBorder,
  drawSystem,
  iconPlateStyle: "classic",
};
