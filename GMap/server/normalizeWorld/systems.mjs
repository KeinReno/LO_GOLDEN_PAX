/**
 * System/planet normalization. Extracted from ../normalizeWorld.mjs.
 */
import { derivedGradeFields } from "../planetGrade.mjs";
import { resolveAlias } from "./helpers.mjs";

export function normalizeSystems(raw, content) {
  return (raw.systems ?? []).map((s) => ({
    ...s,
    visibleToFactionIds: Array.isArray(s.visibleToFactionIds)
      ? s.visibleToFactionIds
      : [],
    spaceObjects: Array.isArray(s.spaceObjects) ? s.spaceObjects : [],
    spaceObjectRemaining:
      s.spaceObjectRemaining && typeof s.spaceObjectRemaining === "object"
        ? s.spaceObjectRemaining
        : {},
    resources: Array.isArray(s.resources)
      ? s.resources.map((r) => resolveAlias("resources", r))
      : [],
    planets: Array.isArray(s.planets)
      ? s.planets.map((p) => ({
          ...p,
          resources: Array.isArray(p.resources)
            ? p.resources.map((r) => resolveAlias("resources", r))
            : [],
          loyalty:
            typeof p.loyalty === "number" && Number.isFinite(p.loyalty)
              ? Math.max(0, Math.min(100, p.loyalty))
              : 50,
          stability:
            typeof p.stability === "number" && Number.isFinite(p.stability)
              ? Math.max(0, Math.min(100, p.stability))
              : p.stability,
          raceComposition: Array.isArray(p.raceComposition)
            ? p.raceComposition
            : [],
          cultureId:
            typeof p.cultureId === "string" && p.cultureId
              ? p.cultureId
              : undefined,
          lineageId:
            typeof p.lineageId === "string" && p.lineageId
              ? p.lineageId
              : undefined,
          faithShare: Array.isArray(p.faithShare)
            ? p.faithShare.map((row) => ({
                faithId: String(row.faithId || row.id || ""),
                percent: Number(row.percent ?? row.share ?? 0),
              }))
            : undefined,
          ...derivedGradeFields(p, content),
        }))
      : [],
    logistics:
      s.logistics && typeof s.logistics === "object" ? s.logistics : undefined,
  }));
}
