import type { Graphics } from "pixi.js";
import { toIso, worldFromScreen } from "../iso";
import type { SystemView } from "../../state/viewTypes";

export function drawMoveRangeLayer(
  g: Graphics,
  systems: SystemView[],
  reachableIds: Set<string>,
  cameraScale = 1,
): void {
  g.clear();
  const r = worldFromScreen(12, cameraScale);
  const width = worldFromScreen(2, cameraScale);
  for (const sys of systems) {
    if (!reachableIds.has(sys.id)) continue;
    const { x: ix, y: iy } = toIso(sys.x, sys.y);
    g.circle(ix, iy, r + worldFromScreen(2, cameraScale)).stroke({ width, color: 0x3b82f6, alpha: 0.55 });
    g.circle(ix, iy, r).fill({ color: 0x3b82f6, alpha: 0.12 });
  }
}
