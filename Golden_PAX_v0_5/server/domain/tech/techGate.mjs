/**
 * Whether a faction may build/research something given its current tech
 * state. Ported from GMap/server/techActions.mjs's `factionMaxTier` and
 * `canBuildWithTech` (tier-check portion only) — behavior-tested, GMap's
 * originals aren't independently diffable (canBuildWithTech pulls
 * `getContent()` internally for its RoleScore branch).
 *
 * NOT ported: `canBuildWithTech`'s `requireRoleMilestone` branch (GMap's
 * RoleScore/role_milestones pilot system, `tech_paths.json` — a separate,
 * still-"pilot"-in-GMap progression layer, not built anywhere in this
 * project, same scope cut as domain/tech/README's other deferrals).
 *
 * Found live 2026-08-14 (see notes/2026-08-14-tech-tree-audit.md): before
 * this file, nothing anywhere in domain/planets read `techTiers` at all —
 * a faction could place a tier-10 building on turn 1 with zero research.
 * This wires GMap's real, intentional design back in: base tier 1-3 is
 * always buildable with no tech (`Math.max(3, ...)`), higher tiers need
 * the matching category's `unlock_tech_tier` research first.
 */

/** @param {{ techTiers?: Record<string, number> }} techAccount */
export function factionMaxTier(techAccount, category) {
  if (!techAccount?.techTiers) return 1;
  return Number(techAccount.techTiers[category] ?? 1);
}

/**
 * @param {{ techTiers?: Record<string, number> }} techAccount
 * @param {{ category?: string, tier?: number, name?: string }} buildingDef
 * @returns {{ ok: boolean, error?: string }}
 */
export function canBuildWithTech(techAccount, buildingDef) {
  if (!buildingDef?.category) return { ok: true };
  const need = Number(buildingDef.tier) || 1;
  const maxTier = factionMaxTier(techAccount, buildingDef.category);
  // Buildings up to tier+2 of unlock are craftable (unlock raises ceiling; base allows T1-T3 early).
  const max = Math.max(3, maxTier + 1);
  if (need > max) {
    return { ok: false, error: `requires ${buildingDef.category} tier >= ${need - 1} (currently ${maxTier})` };
  }
  return { ok: true };
}
