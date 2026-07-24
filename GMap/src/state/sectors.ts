import type { Sector, StarSystem } from "./types";
import { toIso } from "../renderers/iso";

export function sectorPoints(sector: Sector): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  const poly = sector.polygon ?? [];
  for (let i = 0; i + 1 < poly.length; i += 2) {
    pts.push({ x: poly[i]!, y: poly[i + 1]! });
  }
  return pts;
}

export function pointInPolygon(
  x: number,
  y: number,
  polygon: number[],
): boolean {
  const n = Math.floor(polygon.length / 2);
  if (n < 3) return false;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i * 2]!;
    const yi = polygon[i * 2 + 1]!;
    const xj = polygon[j * 2]!;
    const yj = polygon[j * 2 + 1]!;
    const intersect =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function assignSystemsToSector(
  systems: StarSystem[],
  sectorId: string,
  polygon: number[],
): StarSystem[] {
  return systems.map((s) => {
    const inside = pointInPolygon(s.x, s.y, polygon);
    if (inside) return { ...s, sectorId };
    if (s.sectorId === sectorId) return { ...s, sectorId: null };
    return s;
  });
}

export function sectorCentroidIso(sector: Sector): { x: number; y: number } | null {
  const pts = sectorPoints(sector);
  if (pts.length === 0) return null;
  let x = 0;
  let y = 0;
  for (const p of pts) {
    const ip = toIso(p.x, p.y);
    x += ip.x;
    y += ip.y;
  }
  return { x: x / pts.length, y: y / pts.length };
}
