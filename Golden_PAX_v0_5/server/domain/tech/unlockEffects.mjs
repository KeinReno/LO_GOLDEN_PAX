/**
 * Apply a tech/upgrade's unlock effects to a tech account. Ported from
 * GMap/server/techActions.mjs's applyUnlockEffects — the unlock_tech_tier
 * and unlock_property cases (both pure); reshaped from mutate-in-place to
 * return a new account, matching this domain's convention.
 *
 * Deferred: the open_path effect (GMap/server/techPaths.mjs's
 * applyOpenPathEffect) isn't ported — tech/civic/power paths are a
 * separate progression system layered on top of tech unlocks, out of
 * scope for this slice.
 *
 * @param {{ techTiers: Record<string, number>, unlockedProperties: string[] }} techAccount
 * @param {object[]} effects
 */
export function applyUnlockEffects(techAccount, effects) {
  const techTiers = { ...techAccount.techTiers };
  const unlockedProperties = [...(techAccount.unlockedProperties || [])];

  for (const e of effects || []) {
    if (e.effect === "unlock_tech_tier") {
      const cat = e.args?.category;
      const to = Number(e.args?.to);
      if (!cat || !Number.isFinite(to)) continue;
      const cur = Number(techTiers[cat] ?? 1);
      if (to > cur) techTiers[cat] = to;
    } else if (e.effect === "unlock_property") {
      const prop = e.args?.property;
      if (prop && !unlockedProperties.includes(prop)) unlockedProperties.push(prop);
    }
  }

  return { ...techAccount, techTiers, unlockedProperties };
}
