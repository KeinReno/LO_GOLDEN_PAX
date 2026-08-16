import { isoDist2, toIso } from "./iso";
import { systemHitRadius, systemIsoPosition } from "./layers/systemsLayer";
import { pickForceAtIso } from "./layers/forcesLayer";
import type { ForceView, SystemView } from "../state/viewTypes";

export function screenToIso(
  screenX: number,
  screenY: number,
  layerX: number,
  layerY: number,
  scale: number,
): { ix: number; iy: number } {
  const localX = (screenX - layerX) / scale;
  const localY = (screenY - layerY) / scale;
  return { ix: localX, iy: localY };
}

export function pickSystemAtIso(
  systems: SystemView[],
  ix: number,
  iy: number,
  cameraScale = 1,
): SystemView | null {
  const r2 = systemHitRadius(cameraScale) ** 2;
  let best: { sys: SystemView; d2: number } | null = null;
  for (const sys of systems) {
    const pos = systemIsoPosition(sys);
    const d2 = isoDist2(ix, iy, pos.ix, pos.iy);
    if (d2 <= r2 && (!best || d2 < best.d2)) {
      best = { sys, d2 };
    }
  }
  return best?.sys ?? null;
}

export function pickMapTarget(
  systems: SystemView[],
  forces: ForceView[],
  systemsById: Map<string, SystemView>,
  ix: number,
  iy: number,
  cameraScale = 1,
): { type: "force"; force: ForceView } | { type: "system"; system: SystemView } | null {
  const force = pickForceAtIso(forces, systemsById, ix, iy, cameraScale);
  if (force) return { type: "force", force };
  const system = pickSystemAtIso(systems, ix, iy, cameraScale);
  if (system) return { type: "system", system };
  return null;
}

export function mapBounds(systems: SystemView[]): { minX: number; maxX: number; minY: number; maxY: number } {
  let minX = 0;
  let maxX = 0;
  let minY = 0;
  let maxY = 0;
  if (systems.length === 0) return { minX, maxX, minY, maxY };
  minX = maxX = systems[0].x;
  minY = maxY = systems[0].y;
  for (const s of systems) {
    minX = Math.min(minX, s.x);
    maxX = Math.max(maxX, s.x);
    minY = Math.min(minY, s.y);
    maxY = Math.max(maxY, s.y);
  }
  return { minX, maxX, minY, maxY };
}

export function fitMapToScreen(
  systems: SystemView[],
  screenW: number,
  screenH: number,
  padding = 80,
): { scale: number; x: number; y: number } {
  const b = mapBounds(systems);
  const corners = [
    toIso(b.minX, b.minY),
    toIso(b.maxX, b.minY),
    toIso(b.minX, b.maxY),
    toIso(b.maxX, b.maxY),
  ];
  let minIx = corners[0].x;
  let maxIx = corners[0].x;
  let minIy = corners[0].y;
  let maxIy = corners[0].y;
  for (const c of corners.slice(1)) {
    minIx = Math.min(minIx, c.x);
    maxIx = Math.max(maxIx, c.x);
    minIy = Math.min(minIy, c.y);
    maxIy = Math.max(maxIy, c.y);
  }
  const w = maxIx - minIx || 1;
  const h = maxIy - minIy || 1;
  if (screenW < 40 || screenH < 40) return { scale: 1, x: 0, y: 0 };
  const scale = Math.max(0.02, Math.min((screenW - padding * 2) / w, (screenH - padding * 2) / h, 2.5));
  const cx = (minIx + maxIx) / 2;
  const cy = (minIy + maxIy) / 2;
  return {
    scale,
    x: screenW / 2 - cx * scale,
    y: screenH / 2 - cy * scale,
  };
}
