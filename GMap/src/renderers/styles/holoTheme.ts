import { Assets, Container, Graphics, Sprite, Text } from "pixi.js";
import type { StarSystem, WorldState } from "../../state/types";
import { starColor } from "../../generators/systemFactory";
import { censusPlanets, isCorridorSystem } from "../../state/planets";
import {
  centroid,
  getFactionBlobs,
  resolveFactionNameColor,
  resolveFactionNameFont,
  systemsForStateTerritory,
  type Pt,
} from "../../state/territory";
import { toIso } from "../iso";
import { mapIconsReady } from "../mapIconAssets";
import {
  drawCrossedSwords,
  linkHasTraffic,
  parseFactionColor,
  type AnimClock,
  type MapLod,
} from "../drawMapIcons";
import type { FactionThemeColors, MapTheme } from "./mapTheme";

/** Fixed structural HUD accent — not faction color. */
export const HOLO_STRUCTURAL = 0x5fe3d0;
const HOLO_NODE_FILL = 0x0a2a28;
const HABIT_RING = 0x5cdb95;
const CONTESTED_THREAT = 0xe8a54c;
const GRID_STEP = 20;

function strokePoly(
  g: Graphics,
  poly: Pt[],
  width: number,
  color: number,
  alpha: number,
): void {
  if (poly.length < 3) return;
  g.moveTo(poly[0]!.x, poly[0]!.y);
  for (let i = 1; i < poly.length; i++) {
    g.lineTo(poly[i]!.x, poly[i]!.y);
  }
  g.closePath();
  g.stroke({ width, color, alpha });
}

function fillPoly(
  g: Graphics,
  poly: Pt[],
  color: number,
  alpha: number,
): void {
  if (poly.length < 3) return;
  g.moveTo(poly[0]!.x, poly[0]!.y);
  for (let i = 1; i < poly.length; i++) {
    g.lineTo(poly[i]!.x, poly[i]!.y);
  }
  g.closePath();
  g.fill({ color, alpha });
}

/** Two most extreme vertices by distance from centroid — for HUD corner brackets. */
function extremeVertices(poly: Pt[], count = 2): Pt[] {
  if (poly.length === 0) return [];
  const c = centroid(poly);
  const ranked = [...poly].sort((a, b) => {
    const da = (a.x - c.x) ** 2 + (a.y - c.y) ** 2;
    const db = (b.x - c.x) ** 2 + (b.y - c.y) ** 2;
    return db - da;
  });
  return ranked.slice(0, Math.min(count, ranked.length));
}

function drawHudCornerBracket(
  g: Graphics,
  vx: number,
  vy: number,
  cx: number,
  cy: number,
  len: number,
  color: number,
  alpha: number,
): void {
  const dx = vx - cx;
  const dy = vy - cy;
  const mag = Math.hypot(dx, dy) || 1;
  const ux = dx / mag;
  const uy = dy / mag;
  const px = -uy;
  const py = ux;
  g.moveTo(vx - ux * len, vy - uy * len);
  g.lineTo(vx, vy);
  g.lineTo(vx + px * len, vy + py * len);
  g.stroke({ width: 1.1, color, alpha });
}

function drawDiamond(
  g: Graphics,
  cx: number,
  cy: number,
  half: number,
): void {
  g.moveTo(cx, cy - half);
  g.lineTo(cx + half, cy);
  g.lineTo(cx, cy + half);
  g.lineTo(cx - half, cy);
  g.closePath();
}

function drawHexagon(
  g: Graphics,
  cx: number,
  cy: number,
  r: number,
  rotation = 0,
): void {
  for (let i = 0; i <= 6; i++) {
    const a = rotation + (i / 6) * Math.PI * 2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
}

function drawDashedCircle(
  g: Graphics,
  cx: number,
  cy: number,
  r: number,
  segments: number,
  color: number,
  alpha: number,
  width = 1,
): void {
  for (let i = 0; i < segments; i++) {
    if (i % 2 === 1) continue;
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 0.55) / segments) * Math.PI * 2;
    g.moveTo(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r * 0.55);
    g.lineTo(cx + Math.cos(a1) * r, cy + Math.sin(a1) * r * 0.55);
  }
  g.stroke({ width, color, alpha });
}

function drawPieDiamond(
  g: Graphics,
  cx: number,
  cy: number,
  half: number,
  colors: number[],
  dim: number,
): void {
  const n = colors.length;
  const start = -Math.PI / 2;
  for (let i = 0; i < n; i++) {
    const a0 = start + (i / n) * Math.PI * 2;
    const a1 = start + ((i + 1) / n) * Math.PI * 2;
    g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(a0) * half, cy + Math.sin(a0) * half);
    g.lineTo(cx + Math.cos(a1) * half, cy + Math.sin(a1) * half);
    g.closePath();
    g.fill({ color: colors[i]!, alpha: 0.92 * dim });
  }
  drawDiamond(g, cx, cy, half);
  g.stroke({ width: 1.2, color: HOLO_STRUCTURAL, alpha: 0.55 * dim });
}

function drawTerritory(
  g: Graphics,
  world: WorldState,
  factionColors: Map<string, FactionThemeColors>,
  _anim: AnimClock,
  _opts: { rich: boolean; cinematic: boolean },
): void {
  g.clear();
  const blobs = getFactionBlobs(systemsForStateTerritory(world));

  for (const blob of blobs) {
    const color = factionColors.get(blob.factionId)?.fill ?? 0x888888;
    const poly = blob.outline;
    if (poly.length < 3) continue;
    fillPoly(g, poly, color, 0.05);
  }
}

function drawTerritoryBorder(
  g: Graphics,
  world: WorldState,
  factionColors: Map<string, FactionThemeColors>,
  _anim: AnimClock,
): void {
  g.clear();
  const blobs = getFactionBlobs(systemsForStateTerritory(world));

  for (const blob of blobs) {
    const color = factionColors.get(blob.factionId)?.border ?? 0x888888;
    const poly = blob.outline;
    if (poly.length < 3) continue;

    strokePoly(g, poly, 1.2, color, 0.8);

    const c = centroid(poly);
    for (const v of extremeVertices(poly, 2)) {
      drawHudCornerBracket(g, v.x, v.y, c.x, c.y, 9, HOLO_STRUCTURAL, 0.75);
    }
  }
}

function drawHabitRing(
  g: Graphics,
  cx: number,
  cy: number,
  near: boolean,
  anim: AnimClock,
  dim: number,
): void {
  const rx = near ? 20 : 16;
  const ry = near ? 10 : 8;
  for (let i = 0; i <= 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    const x = cx + Math.cos(a) * rx;
    const y = cy + 1 + Math.sin(a) * ry;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
  g.stroke({
    width: near ? 1.5 : 1.15,
    color: HABIT_RING,
    alpha: (near ? 0.5 + anim.pulse * 0.15 : 0.32) * dim,
  });
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
  const shares =
    shareColors && shareColors.length >= 2
      ? shareColors.filter((c) => Number.isFinite(c))
      : undefined;

  if (!corridor && inhabited) {
    drawHabitRing(g, p.x, p.y, near, anim, dim);
  } else if (unsettled) {
    drawHabitRing(g, p.x, p.y, false, anim, dim * 0.6);
  }

  const cx = p.x;
  const cy = p.y - 8;

  if (corridor) {
    const half = near ? 5.5 : 4.5;
    drawDiamond(g, cx, cy, half);
    g.fill({ color: HOLO_NODE_FILL, alpha: 0.95 * dim });
    drawDiamond(g, cx, cy, half);
    g.stroke({ width: 1.2, color: 0x7a9bb8, alpha: 0.85 * dim });
    g.circle(cx, cy, 1.2);
    g.fill({ color: 0x7a9bb8, alpha: 0.9 * dim });
  } else if (isCapital) {
    const accent = rim ?? HOLO_STRUCTURAL;
    const r = near ? 11 : 9;
    drawHexagon(g, cx, cy, r, Math.PI / 6);
    g.fill({ color: HOLO_NODE_FILL, alpha: 0.95 * dim });
    drawHexagon(g, cx, cy, r, Math.PI / 6);
    g.stroke({
      width: selected ? 2.2 : 1.6,
      color: accent,
      alpha: 0.92 * dim,
    });
    g.circle(cx, cy, 1.8);
    g.fill({ color: accent, alpha: 0.95 * dim });

    if (near) {
      drawDashedCircle(g, cx, cy, 17, 16, HOLO_STRUCTURAL, 0.65 * dim, 1.1);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 - Math.PI / 2;
        const inner = 19;
        const outer = 23;
        g.moveTo(
          cx + Math.cos(a) * inner,
          cy + Math.sin(a) * inner * 0.55,
        );
        g.lineTo(
          cx + Math.cos(a) * outer,
          cy + Math.sin(a) * outer * 0.55,
        );
      }
      g.stroke({ width: 1.2, color: HOLO_STRUCTURAL, alpha: 0.8 * dim });
    }
  } else {
    const color = rim ?? 0x6a849e;
    const half = near ? 4 : 3.2;

    if (shares && shares.length >= 2) {
      drawPieDiamond(g, cx, cy, half, shares, dim);
    } else {
      drawDiamond(g, cx, cy, half);
      g.fill({ color: HOLO_NODE_FILL, alpha: 0.95 * dim });
      drawDiamond(g, cx, cy, half);
      g.stroke({
        width: selected ? 1.8 : 1.2,
        color,
        alpha: 0.9 * dim,
      });
      g.circle(cx, cy, 1.1);
      g.fill({ color, alpha: 0.95 * dim });
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
    const order: ("inhabited" | "habitable" | "uninhabitable")[] = [
      "inhabited",
      "habitable",
      "uninhabitable",
    ];
    const habitColors = {
      inhabited: 0x5cdb95,
      habitable: 0x7a9bb8,
      uninhabitable: 0x6b7280,
    };
    for (const key of order) {
      for (let i = 0; i < census[key]; i++) {
        drawDiamond(g, x, y, pip);
        g.fill({ color: habitColors[key], alpha: 0.9 * dim });
        x += pip * 2 + gap;
      }
    }
  }

  if (near && (s.resources?.length ?? 0) > 0 && !mapIconsReady()) {
    const bx = p.x - 22;
    const by = p.y - 18;
    drawHexagon(g, bx, by, 7, 0);
    g.stroke({ width: 1, color: HOLO_STRUCTURAL, alpha: 0.55 * dim });
  }
}

/** Optional scene grid — call from MapCanvas when tier !== bare. */
export function drawTableGrid(
  g: Graphics,
  bounds: { x: number; y: number; width: number; height: number },
  opts?: { clear?: boolean },
): void {
  if (opts?.clear !== false) g.clear();
  const { x, y, width, height } = bounds;
  const x0 = Math.floor(x / GRID_STEP) * GRID_STEP;
  const y0 = Math.floor(y / GRID_STEP) * GRID_STEP;
  const x1 = x + width;
  const y1 = y + height;

  for (let gx = x0; gx <= x1; gx += GRID_STEP) {
    g.moveTo(gx, y0);
    g.lineTo(gx, y1);
  }
  for (let gy = y0; gy <= y1; gy += GRID_STEP) {
    g.moveTo(x0, gy);
    g.lineTo(x1, gy);
  }
  g.stroke({ width: 0.6, color: HOLO_STRUCTURAL, alpha: 0.04 });
}

export function drawHoloLink(
  g: Graphics,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  _linkType: string,
  _anim: AnimClock,
  selected = false,
): void {
  const a = toIso(ax, ay);
  const b = toIso(bx, by);

  g.moveTo(a.x, a.y);
  g.lineTo(b.x, b.y);
  g.stroke({
    width: selected ? 2.4 : 1.2,
    color: selected ? 0xe8c547 : HOLO_STRUCTURAL,
    alpha: selected ? 0.9 : 0.55,
  });
}

type TrafficSegment = { ax: number; ay: number; bx: number; by: number };

/** One pulse in viewport at a time across traffic links — avoids salute effect. */
export function drawHoloTrafficPulse(
  g: Graphics,
  segments: TrafficSegment[],
  anim: AnimClock,
): void {
  if (segments.length === 0) return;
  const idx = Math.floor(anim.t * 0.45) % segments.length;
  const seg = segments[idx]!;
  const a = toIso(seg.ax, seg.ay);
  const b = toIso(seg.bx, seg.by);
  const u = (anim.t * 0.38) % 1;
  const sx = a.x + (b.x - a.x) * u;
  const sy = a.y + (b.y - a.y) * u;
  g.circle(sx, sy, 2.6);
  g.fill({ color: 0xffffff, alpha: 0.95 });
  g.circle(sx, sy, 5);
  g.fill({ color: HOLO_STRUCTURAL, alpha: 0.22 });
}

export function drawHoloContestedClaim(
  g: Graphics,
  s: StarSystem,
  anim: AnimClock,
): void {
  if (!s.contested) return;
  const p = toIso(s.x, s.y);
  const cx = p.x;
  const cy = p.y - 8;
  const half = 14 + anim.pulse * 1.2;
  drawDiamond(g, cx, cy, half);
  g.stroke({
    width: 2,
    color: CONTESTED_THREAT,
    alpha: 0.75 + anim.pulse * 0.1,
  });
  if (!mapIconsReady()) {
    drawCrossedSwords(g, p.x, p.y - 34 - anim.pulse * 0.6, 0.75, anim);
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
      .catch(() => {})
      .finally(() => {
        emblemLoading.delete(emblemKey);
      });
  }
  sprite = emblemCache.get(emblemKey);
  if (sprite && !sprite.destroyed) {
    sprite.visible = true;
    sprite.width = size;
    sprite.height = size;
    sprite.position.set(x, y - anim.pulse * 0.8);
    sprite.alpha = 0.88 + anim.pulse * 0.06;
  }
}

const plaqueCache = new WeakMap<Container, Map<string, Graphics>>();

function plaqueMapFor(labels: Container): Map<string, Graphics> {
  let m = plaqueCache.get(labels);
  if (!m) {
    m = new Map();
    plaqueCache.set(labels, m);
  }
  return m;
}

/** Drop plaque Graphics maps when MapCanvas purges labels on style switch. */
export function clearHoloPlaqueCache(labels: Container | null): void {
  if (!labels) return;
  plaqueCache.delete(labels);
}

function drawFactionLabels(
  labels: Container,
  world: WorldState,
  anim: AnimClock,
  textCache: Map<string, Text>,
  emblemCache: Map<string, Sprite>,
  emblemLoading: Set<string>,
  factionColors: Map<string, FactionThemeColors>,
  labelScale = 1,
  onlyFactionId?: string | null,
): void {
  const blobs = getFactionBlobs(systemsForStateTerritory(world));
  const seen = new Set<string>();
  const plaques = plaqueMapFor(labels);
  const prefixStyle = {
    fontSize: 9,
    fill: HOLO_STRUCTURAL,
    fontFamily: "ui-monospace, Consolas, 'JetBrains Mono', monospace",
    fontWeight: "500" as const,
    letterSpacing: 0.6,
  };

  for (const blob of blobs) {
    const faction = world.factions.find((f) => f.id === blob.factionId);
    if (!faction) continue;
    if (onlyFactionId && faction.id !== onlyFactionId) continue;
    seen.add(faction.id);
    const c = centroid(blob.outline);
    const hasEmblem = !!(faction.emblemPath && faction.emblemPath.length > 8);
    const themeCol = factionColors.get(faction.id);
    const fill = themeCol?.name ?? parseFactionColor(resolveFactionNameColor(faction));
    const fontFamily = themeCol?.nameFont ?? resolveFactionNameFont(faction);
    const cacheKey = `fac:${faction.id}`;
    const prefixKey = `facpfx:${faction.id}`;
    const labelY = c.y + (hasEmblem ? 22 : -6);

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
          stroke: { color: 0x05070c, width: 3, join: "round" },
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
    label.visible = true;
    label.scale.set(labelScale);
    label.position.set(c.x, labelY);
    label.alpha = 0.82 + anim.pulse * 0.05;

    let prefix = textCache.get(prefixKey);
    if (!prefix) {
      prefix = new Text({ text: "SECTOR //", style: prefixStyle });
      prefix.anchor.set(0.5);
      textCache.set(prefixKey, prefix);
      labels.addChild(prefix);
    }
    prefix.visible = true;
    prefix.scale.set(labelScale * 0.92);
    prefix.position.set(c.x, labelY - 14 * labelScale);
    prefix.alpha = 0.7 + anim.pulse * 0.06;

    const pad = 6 * labelScale;
    const tw = Math.max(label.width, prefix.width) + pad * 2;
    const th = label.height + prefix.height + 6 * labelScale + pad * 2;
    const left = c.x - tw / 2;
    const top = labelY - 14 * labelScale - prefix.height / 2 - pad;
    const bracket = 7 * labelScale;

    let plaque = plaques.get(cacheKey);
    if (!plaque || plaque.destroyed) {
      plaque = new Graphics();
      plaques.set(cacheKey, plaque);
      labels.addChildAt(plaque, 0);
    }
    plaque.clear();
    plaque.visible = true;
    const corners: [number, number, number, number][] = [
      [left, top, 1, 1],
      [left + tw, top, -1, 1],
      [left, top + th, 1, -1],
      [left + tw, top + th, -1, -1],
    ];
    for (const [x, y, sx, sy] of corners) {
      plaque.moveTo(x, y + sy * bracket);
      plaque.lineTo(x, y);
      plaque.lineTo(x + sx * bracket, y);
    }
    plaque.stroke({ width: 1, color: HOLO_STRUCTURAL, alpha: 0.72 });

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
    if (key.startsWith("fac:") && !seen.has(key.slice(4))) {
      label.visible = false;
    }
    if (key.startsWith("facpfx:") && !seen.has(key.slice(7))) {
      label.visible = false;
    }
  }
  for (const [key, sprite] of emblemCache) {
    if (key.startsWith("emb:") && !seen.has(key.slice(4))) {
      sprite.visible = false;
    }
  }
  for (const [key, plaque] of plaques) {
    if (plaque.destroyed) {
      plaques.delete(key);
      continue;
    }
    if (key.startsWith("fac:") && !seen.has(key.slice(4))) {
      plaque.visible = false;
    }
  }
}

export const holoTheme: MapTheme = {
  id: "holo",
  drawTerritory,
  drawTerritoryBorder,
  drawSystem,
  iconPlateStyle: "holo-outline",
  drawFactionLabels,
};

export function isHoloTheme(theme: MapTheme): boolean {
  return theme.id === "holo";
}

export { linkHasTraffic };
