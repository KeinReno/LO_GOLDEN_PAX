import { getCachedContent } from "../../../state/contentCatalog";
import { directionDef, type TechDirectionId } from "../../../state/techDirections";

/**
 * Bridges the two axes that both feed the science-screen orbit:
 *  - the 6 tech "directions" (industry/military/culture/commerce/diplomacy/
 *    governance) the orbit sectors and computeOrbitLayout are built on;
 *  - the 8 "material" RoleScore paths (structural/energy/offensive/
 *    defensive/mobility/cognitive/biological/exotic) that the pre-existing
 *    breakthrough mechanic (buildPathStripRows.ts, tech_paths.json) runs on.
 *
 * These are genuinely different taxonomies — a tech's direction and a
 * RoleScore path aren't the same thing — spec §1e names 6 silhouettes (one
 * per direction) while §1f talks about flagship/breakthrough nodes without
 * pinning down which axis owns them. Resolved here by reading
 * tech_directions.json's own `paths` field (already the source of truth
 * resolveTechDirection's industry-fallback uses), filtered to only the 8
 * "material" ids buildPathStripRows.ts pilots — the 2 "civic" paths
 * (trade/culture) navigate to Market/Court in the existing app, never
 * Research, so they never belong to an orbit sector's flagship.
 *
 * Real result from live content/core/tech_directions.json: industry <- 4
 * (structural, energy, biological, exotic), military <- 3 (offensive,
 * defensive, mobility), governance <- 1 (cognitive), diplomacy <- ["will"]
 * (not a material RoleScore id, so 0 in practice), culture/commerce <- 0.
 * A direction with 0 mapped paths simply has no flagship/breakthrough
 * opportunity right now — an honest reflection of current data (its
 * specialization lives in Court/Market instead), not a bug to paper over.
 */

export const MATERIAL_ROLE_SCORE_IDS = [
  "structural",
  "energy",
  "offensive",
  "defensive",
  "mobility",
  "cognitive",
  "biological",
  "exotic",
] as const;

export type MaterialRoleScoreId = (typeof MATERIAL_ROLE_SCORE_IDS)[number];

const MATERIAL_ID_SET: Set<string> = new Set(MATERIAL_ROLE_SCORE_IDS);

/** Which material RoleScore path ids this direction's flagship draws from, per tech_directions.json. */
export function roleScorePathsForDirection(
  direction: TechDirectionId,
  c = getCachedContent(),
): MaterialRoleScoreId[] {
  const paths = directionDef(direction, c)?.paths ?? [];
  return paths.filter((p): p is MaterialRoleScoreId => MATERIAL_ID_SET.has(p));
}
