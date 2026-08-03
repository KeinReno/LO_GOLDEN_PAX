import type { Graphics } from "pixi.js";

export interface TableAnim {
  t: number;
  pulse: number;
  pulse2: number;
}

/** Imperial briefing-table art direction (shared hex). */
export const TABLE = {
  void: 0x05070c,
  metalDeep: 0x0c1018,
  metal: 0x151c28,
  metalEdge: 0x2a3548,
  gold: 0xc9a227,
  goldSoft: 0xe8c547,
  ash: 0x6b6358,
  holo: 0x7a9bb8,
} as const;

/**
 * World-space table floor: brushed metal disc + briefing grid + ash haze.
 */
export function drawTableFloor(g: Graphics, anim: TableAnim, lite = false): void {
  g.clear();

  g.ellipse(0, 40, 1600, 980);
  g.fill({ color: TABLE.void, alpha: 1 });

  g.ellipse(0, 20, 1320, 820);
  g.fill({ color: TABLE.metalDeep, alpha: 0.95 });
  g.ellipse(0, 20, 1320, 820);
  g.stroke({ width: 3, color: TABLE.metalEdge, alpha: 0.55 });

  g.ellipse(0, 20, 1340, 835);
  g.stroke({
    width: 1.5,
    color: TABLE.gold,
    alpha: 0.22 + anim.pulse * 0.06,
  });

  if (lite) {
    g.ellipse(0, 20, 48, 28);
    g.stroke({ width: 1.6, color: TABLE.gold, alpha: 0.4 });
    return;
  }

  for (const r of [280, 520, 780, 1050]) {
    g.ellipse(0, 20, r, r * 0.62);
    g.stroke({
      width: 1,
      color: TABLE.holo,
      alpha: 0.07,
    });
  }

  const ticks = 24;
  for (let i = 0; i < ticks; i++) {
    const a = (i / ticks) * Math.PI * 2;
    const inner = 180;
    const outer = i % 6 === 0 ? 240 : 210;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    g.moveTo(cos * inner, 20 + sin * inner * 0.62);
    g.lineTo(cos * outer, 20 + sin * outer * 0.62);
    g.stroke({
      width: i % 6 === 0 ? 1.4 : 0.8,
      color: i % 6 === 0 ? TABLE.gold : TABLE.holo,
      alpha: i % 6 === 0 ? 0.28 : 0.1,
    });
  }

  for (let i = 0; i < 8; i++) {
    const seed = i * 41.7;
    const x = Math.sin(seed) * 900;
    const y = Math.cos(seed * 1.4) * 520 + 20;
    g.ellipse(x, y, 120 + (i % 3) * 40, 55 + (i % 2) * 20);
    g.fill({ color: TABLE.ash, alpha: 0.035 + (i % 3) * 0.01 });
  }

  g.ellipse(0, 20, 48, 28);
  g.fill({ color: TABLE.metal, alpha: 0.9 });
  g.ellipse(0, 20, 48, 28);
  g.stroke({ width: 1.6, color: TABLE.gold, alpha: 0.45 + anim.pulse * 0.15 });
  g.ellipse(0, 20, 18, 10);
  g.fill({ color: TABLE.gold, alpha: 0.2 + anim.pulse * 0.08 });
}

export type StarfieldOpts = { lite?: boolean; cinematic?: boolean };

export function drawStarfield(
  g: Graphics,
  anim: TableAnim,
  opts: boolean | StarfieldOpts = false,
): void {
  g.clear();
  const lite = typeof opts === "boolean" ? opts : (opts.lite ?? false);
  const cinematic = typeof opts === "object" && !!opts.cinematic;
  const n = lite ? 50 : cinematic ? 180 : 120;
  for (let i = 0; i < n; i++) {
    const seed = i * 97.13;
    const x = ((Math.sin(seed) * 0.5 + 0.5) * 2800) - 1400;
    const y = ((Math.cos(seed * 1.3) * 0.5 + 0.5) * 1800) - 900;
    const tw = 0.15 + 0.85 * (0.5 + 0.5 * Math.sin(anim.t * 1.35 + seed));
    const big = i % 17 === 0;
    g.circle(x, y, big ? 1.5 : 0.65 + (i % 3) * 0.25);
    g.fill({
      color: big ? TABLE.goldSoft : 0xb8c8e0,
      alpha: (big ? 0.28 : 0.08) + tw * (big ? 0.5 : 0.32),
    });
  }
}
