/**
 * Cheap map FX: static baked Graphics + per-frame alpha/scale.
 * Geometry rebuilds only on sync(); ticker only mutates transforms.
 */
import { Container, Graphics } from "pixi.js";
import type { AnimClock } from "./drawMapIcons";
import { toIso } from "./iso";

export type MapFxKind = "selection" | "contested" | "battle" | "intel";

export type MapFxSite = {
  id: string;
  kind: MapFxKind;
  x: number;
  y: number;
};

type FxNode = {
  kind: MapFxKind;
  root: Container;
  g: Graphics;
};

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

function bakeSelection(g: Graphics): void {
  g.clear();
  const rx = 20.6;
  const ry = 10.3;
  const len = 7;
  for (const [sx, sy] of [
    [-rx, -ry],
    [rx, -ry],
    [-rx, ry],
    [rx, ry],
  ] as const) {
    const cx = sx;
    const cy = sy;
    const hx = Math.sign(sx) || 1;
    const hy = Math.sign(sy) || 1;
    g.moveTo(cx, cy + hy * len);
    g.lineTo(cx, cy);
    g.lineTo(cx - hx * len, cy);
    g.stroke({ width: 1.6, color: 0xe8c547, alpha: 0.9 });
  }
}

function bakeContested(g: Graphics): void {
  g.clear();
  ellipse(g, 0, 0, 27, 13);
  g.stroke({ width: 1.4, color: 0xe85d4c, alpha: 0.5 });
  ellipse(g, 0, 0, 31, 15);
  g.stroke({ width: 0.9, color: 0xff8a7a, alpha: 0.2 });
}

function bakeBattle(g: Graphics): void {
  g.clear();
  ellipse(g, 0, -2, 16, 8);
  g.fill({ color: 0xe85d4c, alpha: 0.08 });
  ellipse(g, 0, -2, 19, 9.1);
  g.stroke({ width: 1.15, color: 0xe85d4c, alpha: 0.4 });
  ellipse(g, 0, -2, 25, 12);
  g.stroke({ width: 0.9, color: 0xc9a227, alpha: 0.18 });
}

function bakeIntel(g: Graphics): void {
  g.clear();
  const r = 28.75;
  ellipse(g, 0, 0, r, r * 0.5);
  g.stroke({ width: 1.2, color: 0xc9a227, alpha: 0.5 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    g.moveTo(Math.cos(a) * (r - 3), Math.sin(a) * (r * 0.5 - 1.5));
    g.lineTo(Math.cos(a) * (r + 2), Math.sin(a) * (r * 0.5 + 1));
    g.stroke({ width: 1.2, color: 0xe8c547, alpha: 0.55 });
  }
}

function bake(kind: MapFxKind, g: Graphics): void {
  if (kind === "selection") bakeSelection(g);
  else if (kind === "contested") bakeContested(g);
  else if (kind === "battle") bakeBattle(g);
  else bakeIntel(g);
}

function siteKey(s: MapFxSite): string {
  return `${s.kind}:${s.id}`;
}

/**
 * Overlay of pulsing selection / contested / battle / intel markers.
 */
export class MapFxOverlay {
  readonly root = new Container();
  private readonly nodes = new Map<string, FxNode>();
  private enabled = true;

  constructor() {
    this.root.eventMode = "none";
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    this.root.visible = on;
    if (!on) {
      for (const n of this.nodes.values()) n.root.visible = false;
    }
  }

  /** Rebuild pool membership; geometry baked once per node. */
  sync(sites: MapFxSite[]): void {
    if (!this.enabled) {
      for (const n of this.nodes.values()) n.root.visible = false;
      return;
    }
    const alive = new Set<string>();
    for (const site of sites) {
      const key = siteKey(site);
      alive.add(key);
      let node = this.nodes.get(key);
      if (!node) {
        const root = new Container();
        root.eventMode = "none";
        const g = new Graphics();
        bake(site.kind, g);
        root.addChild(g);
        this.root.addChild(root);
        node = { kind: site.kind, root, g };
        this.nodes.set(key, node);
      }
      const iso = toIso(site.x, site.y);
      node.root.position.set(iso.x, iso.y);
      node.root.visible = true;
    }
    for (const [key, node] of this.nodes) {
      if (!alive.has(key)) {
        node.root.destroy({ children: true });
        this.nodes.delete(key);
      }
    }
  }

  /**
   * Per-frame pulse. Rebakes a few local Graphics (not the whole map) so the
   * pulse is visible even if Container transform updates don't present.
   */
  tick(anim: AnimClock): void {
    if (!this.enabled) return;
    const p = anim.pulse;
    const p2 = anim.pulse2;
    for (const node of this.nodes.values()) {
      if (!node.root.visible) continue;
      node.root.scale.set(1, 1);
      node.root.rotation = 0;
      node.root.alpha = 1;
      const g = node.g;
      g.clear();
      if (node.kind === "selection") {
        const rx = 20 + p * 2.2;
        const ry = 10 + p * 1.1;
        const len = 7;
        for (const [sx, sy] of [
          [-rx, -ry],
          [rx, -ry],
          [-rx, ry],
          [rx, ry],
        ] as const) {
          const hx = Math.sign(sx) || 1;
          const hy = Math.sign(sy) || 1;
          g.moveTo(sx, sy + hy * len);
          g.lineTo(sx, sy);
          g.lineTo(sx - hx * len, sy);
          g.stroke({
            width: 1.6,
            color: 0xe8c547,
            alpha: 0.75 + p * 0.25,
          });
        }
      } else if (node.kind === "contested") {
        const r = 26 + p * 3;
        ellipse(g, 0, 0, r, r * 0.48);
        g.stroke({
          width: 1.4,
          color: 0xe85d4c,
          alpha: 0.35 + p * 0.35,
        });
        ellipse(g, 0, 0, r + 4, (r + 4) * 0.48);
        g.stroke({
          width: 0.9,
          color: 0xff8a7a,
          alpha: 0.14 + p2 * 0.2,
        });
      } else if (node.kind === "battle") {
        ellipse(g, 0, -2, 16, 8);
        g.fill({ color: 0xe85d4c, alpha: 0.06 + p * 0.06 });
        const r1 = 18 + p * 3;
        ellipse(g, 0, -2, r1, r1 * 0.48);
        g.stroke({
          width: 1.15,
          color: 0xe85d4c,
          alpha: 0.28 + p * 0.28,
        });
        const r2 = 24 + p2 * 2.5;
        ellipse(g, 0, -2, r2, r2 * 0.48);
        g.stroke({
          width: 0.9,
          color: 0xc9a227,
          alpha: 0.12 + p2 * 0.18,
        });
        const shock = (anim.t * 0.55) % 1;
        const sr = 12 + shock * 22;
        ellipse(g, 0, -2, sr, sr * 0.48);
        g.stroke({
          width: 1,
          color: 0xff8a7a,
          alpha: 0.25 * (1 - shock),
        });
      } else {
        const r = 28 + p2 * 2;
        ellipse(g, 0, 0, r, r * 0.5);
        g.stroke({
          width: 1.2,
          color: 0xc9a227,
          alpha: 0.35 + p2 * 0.35,
        });
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + anim.t * 0.4;
          g.moveTo(Math.cos(a) * (r - 3), Math.sin(a) * (r * 0.5 - 1.5));
          g.lineTo(Math.cos(a) * (r + 2), Math.sin(a) * (r * 0.5 + 1));
          g.stroke({ width: 1.2, color: 0xe8c547, alpha: 0.55 });
        }
      }
    }
  }

  destroy(): void {
    for (const n of this.nodes.values()) {
      if (!n.root.destroyed) n.root.destroy({ children: true });
    }
    this.nodes.clear();
    if (!this.root.destroyed) this.root.destroy({ children: true });
  }
}
