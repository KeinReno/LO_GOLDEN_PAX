import type { Graphics } from "pixi.js";
import { toIso, worldFromScreen } from "../iso";
import type { ForceView, SystemView } from "../../state/viewTypes";

const SCREEN_RADIUS = 5;

export function drawForcesLayer(
  g: Graphics,
  forces: ForceView[],
  systemsById: Map<string, SystemView>,
  factionColors: Record<string, string>,
  selfFactionId: string | null,
  selectedForceId: string | null,
  dragForceId: string | null,
  cameraScale = 1,
): void {
  g.clear();
  const r = worldFromScreen(SCREEN_RADIUS, cameraScale);
  const bySystem = new Map<string, ForceView[]>();
  for (const force of forces) {
    if (!force.systemId) continue;
    const list = bySystem.get(force.systemId) ?? [];
    list.push(force);
    bySystem.set(force.systemId, list);
  }

  for (const [systemId, list] of bySystem) {
    const sys = systemsById.get(systemId);
    if (!sys) continue;
    const base = toIso(sys.x, sys.y);
    list.forEach((force, i) => {
      const offset = stackOffset(i, list.length, cameraScale);
      const ix = base.x + offset.x;
      const iy = base.y + offset.y;
      const isOwn = selfFactionId != null && force.factionId === selfFactionId;
      const color = parseHex(factionColors[force.factionId] ?? "#9ca3af");
      const shape = force.kind === "legion" ? "square" : "triangle";

      if (shape === "square") {
        g.rect(ix - r, iy - r, r * 2, r * 2).fill({ color, alpha: isOwn ? 1 : 0.75 });
      } else {
        drawTriangle(g, ix, iy, r, color, isOwn ? 1 : 0.75);
      }

      if (selectedForceId === force.id || dragForceId === force.id) {
        g.circle(ix, iy, r + worldFromScreen(3, cameraScale)).stroke({
          width: worldFromScreen(2, cameraScale),
          color: 0x60a5fa,
          alpha: 0.95,
        });
      }
    });
  }
}

function stackOffset(index: number, total: number, cameraScale = 1): { x: number; y: number } {
  const ox = worldFromScreen(14, cameraScale);
  const oy = worldFromScreen(-10, cameraScale);
  if (total <= 1) return { x: ox, y: oy };
  const angle = (index / total) * Math.PI * 2;
  const spread = worldFromScreen(8, cameraScale);
  return { x: ox + Math.cos(angle) * spread, y: oy + Math.sin(angle) * spread * 0.75 };
}

function drawTriangle(g: Graphics, x: number, y: number, r: number, color: number, alpha: number): void {
  g.moveTo(x, y - r)
    .lineTo(x + r, y + r)
    .lineTo(x - r, y + r)
    .closePath()
    .fill({ color, alpha });
}

function parseHex(hex: string): number {
  const h = hex.replace("#", "");
  const n = parseInt(h, 16);
  return Number.isFinite(n) ? n : 0x9ca3af;
}

export function forceHitRadius(cameraScale = 1): number {
  return worldFromScreen(SCREEN_RADIUS + 6, cameraScale);
}

export function forceScreenOffsets(cameraScale = 1): { x: number; y: number } {
  return { x: worldFromScreen(14, cameraScale), y: worldFromScreen(-10, cameraScale) };
}

export function pickForceAtIso(
  forces: ForceView[],
  systemsById: Map<string, SystemView>,
  ix: number,
  iy: number,
  cameraScale = 1,
): ForceView | null {
  const bySystem = new Map<string, ForceView[]>();
  for (const force of forces) {
    if (!force.systemId) continue;
    const list = bySystem.get(force.systemId) ?? [];
    list.push(force);
    bySystem.set(force.systemId, list);
  }

  let best: { force: ForceView; d2: number } | null = null;
  const r2 = forceHitRadius(cameraScale) ** 2;

  for (const [systemId, list] of bySystem) {
    const sys = systemsById.get(systemId);
    if (!sys) continue;
    const base = toIso(sys.x, sys.y);
    for (let i = 0; i < list.length; i += 1) {
      const force = list[i]!;
      const offset = stackOffset(i, list.length, cameraScale);
      const fx = base.x + offset.x;
      const fy = base.y + offset.y;
      const d2 = (ix - fx) ** 2 + (iy - fy) ** 2;
      if (d2 <= r2 && (!best || d2 < best.d2)) {
        best = { force, d2 };
      }
    }
  }
  return best ? best.force : null;
}
