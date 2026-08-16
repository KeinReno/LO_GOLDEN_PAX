import type { Container } from "pixi.js";
import type { Point } from "../../generators/brushGenerator";
import type { StarSystem, SystemLink } from "../../state/types";
import { toIso } from "../iso";
import { LINK_HIT_PX } from "./constants";

export function distPointToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-6) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Fit worldLayer so systems fill the screen (iso space). */
export function fitSystemsInView(
  layer: Container,
  systems: { x: number; y: number }[],
  screenW: number,
  screenH: number,
  padding = 0.1,
): void {
  if (screenW < 8 || screenH < 8) return;
  if (!systems.length) {
    layer.position.set(screenW / 2, screenH / 2);
    layer.scale.set(0.55);
    return;
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of systems) {
    const p = toIso(s.x, s.y);
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const bw = Math.max(maxX - minX, 120);
  const bh = Math.max(maxY - minY, 120);
  if (minX === Infinity || minY === Infinity) {
    layer.position.set(screenW / 2, screenH / 2);
    layer.scale.set(0.55);
    return;
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const scale = Math.min(
    (screenW * (1 - padding * 2)) / bw,
    (screenH * (1 - padding * 2)) / bh,
    2.2,
  );
  const s = Math.max(0.04, scale);
  layer.scale.set(s);
  layer.position.set(screenW / 2 - cx * s, screenH / 2 - cy * s);
}

export function findLinkAt(
  p: Point,
  links: SystemLink[],
  systems: StarSystem[],
): SystemLink | null {
  const tip = toIso(p.x, p.y);
  const byId = new Map(systems.map((s) => [s.id, s]));
  let best: SystemLink | null = null;
  let bestD = LINK_HIT_PX;
  for (const link of links) {
    const a = byId.get(link.fromId);
    const b = byId.get(link.toId);
    if (!a || !b) continue;
    const ap = toIso(a.x, a.y);
    const bp = toIso(b.x, b.y);
    const d = distPointToSegment(tip.x, tip.y, ap.x, ap.y, bp.x, bp.y);
    if (d < bestD) {
      bestD = d;
      best = link;
    }
  }
  return best;
}
