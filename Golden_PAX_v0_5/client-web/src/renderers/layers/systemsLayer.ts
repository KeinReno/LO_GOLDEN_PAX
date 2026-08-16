import type { Graphics } from "pixi.js";
import { toIso, worldFromScreen } from "../iso";
import type { SystemView } from "../../state/viewTypes";

const SCREEN_RADIUS = 6;

export function drawSystemsLayer(
  g: Graphics,
  systems: SystemView[],
  factionColors: Record<string, string>,
  selectedId: string | null,
  cameraScale = 1,
): void {
  g.clear();
  const baseR = worldFromScreen(SCREEN_RADIUS, cameraScale);
  for (const sys of systems) {
    const { x: ix, y: iy } = toIso(sys.x, sys.y);
    const owner = sys.ownerFactionId ?? "";
    const color = parseHex(factionColors[owner] ?? "#4b5563");
    const r = sys.isCapital ? baseR * 1.35 : baseR;
    const alpha = sys.knowledge === 1 ? 0.55 : 1;

    g.circle(ix, iy, r + worldFromScreen(2, cameraScale)).stroke({
      width: worldFromScreen(1, cameraScale),
      color: 0x1f2937,
      alpha: 0.8,
    });
    g.circle(ix, iy, r).fill({ color, alpha });

    if (selectedId === sys.id) {
      g.circle(ix, iy, r + worldFromScreen(3, cameraScale)).stroke({
        width: worldFromScreen(2, cameraScale),
        color: 0xfbbf24,
        alpha: 0.95,
      });
    }
  }
}

function parseHex(hex: string): number {
  const h = hex.replace("#", "");
  const n = parseInt(h, 16);
  return Number.isFinite(n) ? n : 0x6b7280;
}

export function systemHitRadius(cameraScale = 1): number {
  return worldFromScreen(SCREEN_RADIUS + 6, cameraScale);
}

export function systemIsoPosition(sys: SystemView): { ix: number; iy: number } {
  const p = toIso(sys.x, sys.y);
  return { ix: p.x, iy: p.y };
}
