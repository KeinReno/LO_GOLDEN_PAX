import type { CatalogShip } from "./constants";

/**
 * Ships and ground forces both outfit, but from different slot/module catalogs
 * (space vs ground theater). Infantry is no longer blocked.
 */
export function canOutfitUnit(
  catalog: CatalogShip | null | undefined,
  _deckKind: "fleet" | "legion",
): boolean {
  return Boolean(catalog?.slots?.length);
}
