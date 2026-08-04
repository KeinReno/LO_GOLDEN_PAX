import type { CatalogShip } from "./constants";

/** Ground roles that are people — no vehicle/module outfitting UI. */
const INFANTRY_LIKE = new Set([
  "infantry",
  "line",
  "militia",
  "garrison",
  "troops",
  "assault",
  "psi",
  "marine",
]);

/** Ground roles that can take module/armor loadouts. */
const OUTFITTABLE_GROUND = new Set([
  "vehicle",
  "armor",
  "mech",
  "tank",
  "artillery",
  "fortification",
  "walker",
  "drone",
  "emplacement",
  "turret",
]);

/**
 * Ships always outfit. Legion infantry never. Vehicles / emplacements can.
 */
export function canOutfitUnit(
  catalog: CatalogShip | null | undefined,
  deckKind: "fleet" | "legion",
): boolean {
  if (!catalog?.slots?.length) return false;
  if (deckKind === "fleet") return true;
  const roles = catalog.roles ?? [];
  if (roles.some((r) => OUTFITTABLE_GROUND.has(r))) return true;
  if (roles.some((r) => INFANTRY_LIKE.has(r))) return false;
  // Unknown ground type: only if it has non-crew hardware slots
  return (catalog.slots ?? []).some(
    (s) => s.role === "weapon" || s.role === "hull" || s.role === "shield",
  ) && !roles.includes("infantry");
}
