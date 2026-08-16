import { Assets, Graphics, Sprite, Text, type Container } from "pixi.js";
import type { StarSystem, WorldState } from "../../state/types";
import { starColor } from "../../generators/systemFactory";
import {
  censusPlanets,
  HABIT_COLORS,
  isCorridorSystem,
} from "../../state/planets";
import {
  centroid,
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

/** Brand brass — not faction colors. */
const BRASS = 0xc9a227;
const BRASS_SOFT = 0xe8c547;
const DARK_RAIL = 0x06080c;
const PLAQUE_BG = 0x0d0e10;

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

/** Short radial strokes + center dot — imperial rosette compass. */
function drawRosette(
  g: Graphics,
  cx: number,
  cy: number,
  rays: number,
  innerR: number,
  outerR: number,
  color: number,
  alpha: number,
  dim: number,
): void {
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2 - Math.PI / 2;
    const x0 = cx + Math.cos(a) * innerR;
    const y0 = cy + Math.sin(a) * innerR * 0.5;
    const x1 = cx + Math.cos(a) * outerR;
    const y1 = cy + Math.sin(a) * outerR * 0.5;
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.stroke({ width: 1.15, color, alpha: alpha * dim });
  }
  g.circle(cx, cy, 1.4);
  g.fill({ color, alpha: alpha * dim });
}

function drawTerritory(
  g: Graphics,
  world: WorldState,
  factionColors: Map<string, FactionThemeColors>,
  _anim: AnimClock,
  opts: { rich: boolean; cinematic: boolean },
): void {
  void opts;
  g.clear();
  const blobs = getFactionBlobs(systemsForStateTerritory(world));

  for (const blob of blobs) {
    const color = factionColors.get(blob.factionId)?.fill ?? 0x888888;
    const poly = blob.outline;
    if (poly.length < 3) continue;

    g.moveTo(poly[0]!.x, poly[0]!.y);
    for (let i = 1; i < poly.length; i++) {
      g.lineTo(poly[i]!.x, poly[i]!.y);
    }
    g.closePath();
    g.fill({ color, alpha: 0.18 });
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

    strokePoly(7.5, DARK_RAIL, 0.55);
    strokePoly(5.2, color, 0.22 + anim.pulse * 0.04);
    strokePoly(2.1, color, 0.82 + anim.pulse * 0.04);
    strokePoly(0.9, BRASS, 0.28 + anim.pulse * 0.04);
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
  const ownerSystem = colors?.system;
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
    ownerSystem ??
    (s.poiType && s.poiType !== "none"
      ? undefined
      : starColor(s.stars[0]?.class ?? "G"));
  const neutral = !ownerSystem;
  const shares =
    shareColors && shareColors.length >= 2 ? shareColors : undefined;

  if (!corridor && inhabited) {
    ellipse(g, p.x, p.y + 1, near ? 20 : 16, near ? 10 : 8);
    g.stroke({
      width: near ? 1.5 : 1.15,
      color: 0x5cdb95,
      alpha: (near ? 0.5 + anim.pulse * 0.12 : 0.32) * dim,
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
    g.stroke({ width: 1.6, color: BRASS, alpha: 0.85 * dim });
  } else if (isCapital) {
    const accent = rim ?? BRASS;
    const borderCol = colors?.border ?? accent;
    const cx = p.x;
    const cy = p.y - 9;
    const breathe = 1 + anim.pulse * (near ? 0.04 : 0.02);

    drawSystemToken(g, p.x, p.y, accent, selected, anim, {
      capital: true,
      neutral,
      shareColors: shares,
    });

    ellipse(g, p.x, p.y + 1, 15 * breathe, 7.5 * breathe);
    g.stroke({
      width: 1.35,
      color: borderCol,
      alpha: 0.75 * dim,
    });

    if (near) {
      drawRosette(
        g,
        cx,
        cy - 1,
        8,
        5.5 * breathe,
        9.5 * breathe,
        BRASS_SOFT,
        0.88,
        dim,
      );
    }

    drawStarPolygon(g, cx, cy, 5, 8.5 * breathe, 3.8 * breathe, -Math.PI / 2);
    g.fill({ color: accent, alpha: 0.95 * dim });
    drawStarPolygon(g, cx, cy, 5, 8.5 * breathe, 3.8 * breathe, -Math.PI / 2);
    g.stroke({ width: 1.4, color: 0xfff4d0, alpha: 0.9 * dim });
    g.circle(cx, cy, 2);
    g.fill({ color: 0xffffff, alpha: 0.95 * dim });
  } else {
    const primary = s.stars[0]?.class ?? "G";
    const color = rim ?? starColor(primary);
    const lum = s.stars[0]?.luminosity ?? 1;
    const cx = p.x;
    const cy = p.y - 8;
    const rosetteCol = ownerSystem ?? color;

    drawSystemToken(g, p.x, p.y, color, selected, anim, {
      neutral,
      shareColors: shares,
    });

    if (near) {
      drawRosette(g, cx, cy, 4, 4.5, 7.5, rosetteCol, 0.82, dim);
    }

    const starR =
      (3.2 + lum * 0.9) *
      (inhabited ? 1.1 : unsettled ? 0.9 : 1) *
      (near ? 1 : 0.9);
    g.circle(cx, cy, starR + 2);
    g.fill({
      color: inhabited ? 0x5cdb95 : color,
      alpha: (inhabited ? 0.06 : 0.05) * dim,
    });
    g.circle(cx, cy, starR);
    g.fill({
      color,
      alpha: (unsettled ? 0.2 : 0.32) * dim,
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
    g.stroke({ width: 1.1, color: BRASS, alpha: 0.65 * dim });
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
export function clearImperialPlaqueCache(labels: Container | null): void {
  if (!labels) return;
  plaqueCache.delete(labels);
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
        const sp = new Sprite(texture) as Sprite & { __src?: string };
        sp.anchor.set(0.5);
        sp.width = size;
        sp.height = size;
        sp.__src = src;
        emblemCache.set(emblemKey, sp);
        labels.addChild(sp);
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

  for (const blob of blobs) {
    const faction = world.factions.find((f) => f.id === blob.factionId);
    if (!faction) continue;
    if (onlyFactionId && faction.id !== onlyFactionId) continue;
    seen.add(faction.id);

    const themeCol = factionColors.get(faction.id);
    const fill = themeCol?.name ?? BRASS_SOFT;
    const fontFamily = themeCol?.nameFont ?? "Cinzel, Times New Roman, serif";
    const c = centroid(blob.outline);
    const hasEmblem = !!(faction.emblemPath && faction.emblemPath.length > 8);
    const cacheKey = `fac:${faction.id}`;
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
    label.position.set(c.x, labelY);
    label.alpha = 0.88 + anim.pulse * 0.04;

    const padX = 14;
    const padY = 7;
    const tw = label.width;
    const th = label.height;
    const px = c.x - tw / 2 - padX;
    const py = labelY - th / 2 - padY;
    const pw = tw + padX * 2;
    const ph = th + padY * 2;

    let plaque = plaques.get(cacheKey);
    if (!plaque || plaque.destroyed) {
      plaque = new Graphics();
      plaques.set(cacheKey, plaque);
      const labelIdx = label.parent === labels ? labels.getChildIndex(label) : 0;
      labels.addChildAt(plaque, Math.max(0, labelIdx));
    }
    plaque.clear();
    plaque.visible = true;
    plaque.roundRect(px, py, pw, ph, 3);
    plaque.fill({ color: PLAQUE_BG, alpha: 0.85 });
    plaque.moveTo(px + 2, py + 0.5);
    plaque.lineTo(px + pw - 2, py + 0.5);
    plaque.stroke({ width: 0.8, color: BRASS, alpha: 0.5 });
    plaque.moveTo(px + 2, py + ph - 0.5);
    plaque.lineTo(px + pw - 2, py + ph - 0.5);
    plaque.stroke({ width: 0.8, color: BRASS, alpha: 0.5 });

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

export const imperialTheme: MapTheme = {
  id: "imperial",
  drawTerritory,
  drawTerritoryBorder,
  drawSystem,
  drawFactionLabels,
  iconPlateStyle: "imperial-rim",
};
