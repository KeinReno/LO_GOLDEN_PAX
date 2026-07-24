import type { StarSystem, SystemPoiType } from "./types";
import { SPACE_OBJECT_TYPES } from "./types";

const SPACE_SET = new Set<string>(SPACE_OBJECT_TYPES);

/** Resolved multi space-object tags for a system (legacy poiType aware). */
export function systemSpaceObjects(s: StarSystem): SystemPoiType[] {
  const raw = s.spaceObjects?.filter((t) => t && t !== "none") ?? [];
  if (raw.length) {
    const uniq = [...new Set(raw)];
    return uniq.filter((t) => SPACE_SET.has(t) || t === "quest");
  }
  const derived: SystemPoiType[] = [];
  if (s.poiType && s.poiType !== "none") derived.push(s.poiType);
  if (s.scannerDeadZone && !derived.includes("dead_zone"))
    derived.push("dead_zone");
  if (s.trafficHub && !derived.includes("hub")) derived.push("hub");
  if (s.anomalyMotion && !derived.includes("anomaly")) derived.push("anomaly");
  return derived;
}

export function hasSpaceObject(s: StarSystem, tag: SystemPoiType): boolean {
  return systemSpaceObjects(s).includes(tag);
}

/** Toggle / set space object list and sync related flags + legacy poiType. */
export function withSpaceObjects(
  s: StarSystem,
  next: SystemPoiType[],
): StarSystem {
  const cleaned = [...new Set(next.filter((t) => t && t !== "none"))];
  const primary = cleaned[0] ?? "none";
  return {
    ...s,
    spaceObjects: cleaned,
    poiType: primary,
    scannerDeadZone: cleaned.includes("dead_zone"),
  trafficHub: cleaned.includes("hub"),
  anomalyMotion: cleaned.includes("anomaly")
    ? (s.anomalyMotion ?? { driftDx: 0, driftDy: 0, radius: 40 })
    : null,
  };
}

export function toggleSpaceObject(
  s: StarSystem,
  tag: SystemPoiType,
): StarSystem {
  if (tag === "none") {
    return withSpaceObjects(s, []);
  }
  const cur = systemSpaceObjects(s);
  const has = cur.includes(tag);
  return withSpaceObjects(
    s,
    has ? cur.filter((t) => t !== tag) : [...cur, tag],
  );
}
