import type { Graphics } from "pixi.js";
import { toIso, worldFromScreen } from "../iso";
import type { LinkView, SystemView } from "../../state/viewTypes";

export function drawLinksLayer(
  g: Graphics,
  links: LinkView[],
  systemsById: Map<string, SystemView>,
  visibleIds: Set<string>,
  cameraScale = 1,
): void {
  g.clear();
  const width = worldFromScreen(1.2, cameraScale);
  for (const link of links) {
    if (!visibleIds.has(link.fromId) || !visibleIds.has(link.toId)) continue;
    const a = systemsById.get(link.fromId);
    const b = systemsById.get(link.toId);
    if (!a || !b) continue;
    const pa = toIso(a.x, a.y);
    const pb = toIso(b.x, b.y);
    g.moveTo(pa.x, pa.y).lineTo(pb.x, pb.y).stroke({ width, color: 0x64748b, alpha: 0.85 });
  }
}
