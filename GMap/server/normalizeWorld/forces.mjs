/**
 * Fleet/legion normalization. Extracted from ../normalizeWorld.mjs.
 */
import { resolveAlias, normalizeCompGroup } from "./helpers.mjs";

export function normalizeFleets(raw) {
  return (raw.fleets ?? []).map((f) => ({
    ...f,
    composition: Array.isArray(f.composition)
      ? f.composition.map((g) => normalizeCompGroup(g, "ships"))
      : [],
    route: Array.isArray(f.route) ? f.route : [],
    stance: f.stance ?? "idle",
    kind: f.kind ?? "combat",
  }));
}

export function normalizeLegions(raw) {
  return (raw.legions ?? []).map((l) => {
    if (Array.isArray(l.composition) && l.composition.length > 0) {
      return {
        ...l,
        composition: l.composition.map((g) => normalizeCompGroup(g, "units")),
        route: Array.isArray(l.route) ? l.route : [],
      };
    }
    const strength = typeof l.strength === "number" ? l.strength : 1;
    return {
      ...l,
      composition: [
        {
          defId: resolveAlias("units", "unit.generic_line"),
          count: Math.max(1, Math.round(strength)),
          hp: 100,
          xp: 0,
          level: 0,
        },
      ],
      route: Array.isArray(l.route) ? l.route : [],
    };
  });
}
