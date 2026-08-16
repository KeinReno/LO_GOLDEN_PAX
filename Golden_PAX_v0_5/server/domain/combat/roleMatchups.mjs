import { applyFlatThenMult } from "../economy/modifierStack.mjs";

/**
 * The core "who's winning this fight" formula. Ported verbatim from
 * GMap/server/combatResolve.mjs's rolePower/totalPower — module-private
 * there, exported here since domain/* functions are meant to be
 * unit-tested directly (CLAUDE.md rule 3). Parity verified in
 * roleMatchups.parity.test.mjs.
 *
 * rolePower: per-unit-stack power (damage × accuracy × shields × count ×
 * hp-ratio), summed by role. totalPower: that power reweighted by how
 * favorably each of your roles matches up against the enemy's role mix
 * (content.combat_matchups), i.e. "line beats screen" style rock-paper-
 * scissors on top of raw firepower.
 */

/** @param {object[]} groups */
export function rolePower(groups) {
  const out = {};
  for (const g of groups) {
    const role = g.roles[0] || "line";
    const unitPower =
      (g.damage || 0) *
      (0.5 + (g.accuracy || 0) / 200) *
      (1 + (g.shields || 0) / 200) *
      (g.count || 0) *
      ((g.hp || 0) / Math.max(1, g.maxHp || 1));
    out[role] = (out[role] || 0) + unitPower;
  }
  return out;
}

/**
 * @param {Record<string, number>} roleMap  this side's rolePower() output
 * @param {object} matchups  content.combat_matchups
 * @param {Record<string, number>} enemyRoles  enemy's rolePower() output
 * @param {Record<string, { flat?: number, mult?: number }>} [combatRoleChannels]
 *   Tech Tree 2.0 Priority 5c (NOT a port): modifier-stack channels keyed
 *   `combat_role:<role>`. Applied to this side's total when the enemy's
 *   forces include that role. Omit = previous behavior.
 */
export function totalPower(roleMap, matchups, enemyRoles, combatRoleChannels) {
  let sum = 0;
  const enemyEntries = Object.entries(enemyRoles);
  const enemyTotal = enemyEntries.reduce((s, [, v]) => s + v, 0) || 1;
  for (const [role, pow] of Object.entries(roleMap)) {
    let mult = 1;
    if (enemyEntries.length) {
      let w = 0;
      for (const [er, ep] of enemyEntries) {
        const m = matchups?.[role]?.[er] ?? 1;
        w += m * (ep / enemyTotal);
      }
      mult = w;
    }
    sum += pow * mult;
  }
  return applyCombatRoleBonus(sum, combatRoleChannels, enemyRoles);
}

/**
 * Apply generic `stat:${stat}` channels to unit-stack fields *before*
 * rolePower. COURT_AND_NPC_ROSTER_SPEC Part 4 — parallel to
 * `combat_role:${role}`, not a replacement. Multiplies the named stat
 * when the group actually has that field (damage, accuracy, shields, hp,
 * defense, armor, …). A channel for a stat the power formula doesn't
 * read is still applied to the group object; it just won't change power.
 */
export function applyStatChannelsToGroups(groups, channels) {
  if (!channels || !groups?.length) return groups;
  return groups.map((g) => {
    const next = { ...g };
    for (const [key, ch] of Object.entries(channels)) {
      if (!key.startsWith("stat:")) continue;
      const stat = key.slice("stat:".length);
      if (!stat || stat === "*" || next[stat] == null) continue;
      next[stat] = applyFlatThenMult(Number(next[stat]) || 0, ch);
    }
    const wild = channels["stat:*"];
    if (wild && next.damage != null) next.damage = applyFlatThenMult(Number(next.damage) || 0, wild);
    return next;
  });
}

/**
 * Anti-role bonus: when the opponent has any power in `role`, multiply
 * this side's power by that channel. Uses applyFlatThenMult's (base+flat)*mult
 * on a base of `power` so a 1.15 combat_role_mult is a 15% bump.
 */
export function applyCombatRoleBonus(power, combatRoleChannels, enemyRoles) {
  if (!combatRoleChannels) return power;
  let out = power;
  for (const [role, enemyPow] of Object.entries(enemyRoles || {})) {
    if ((Number(enemyPow) || 0) <= 0) continue;
    const ch = combatRoleChannels[`combat_role:${role}`];
    if (!ch) continue;
    const flat = Number(ch.flat) || 0;
    const mult = Number(ch.mult) || 1;
    out = (out + flat) * mult;
  }
  return out;
}
