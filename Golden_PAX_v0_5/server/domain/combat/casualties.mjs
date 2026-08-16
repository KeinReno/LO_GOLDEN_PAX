/**
 * Damage absorption + casualties. Ported from GMap/server/combatResolve.mjs's
 * targetingOrder/applyCasualties — same math, reshaped from mutate-in-place
 * to return a new groups array (matching this domain's convention; GMap
 * also wrote through a `.ref` to a persistent composition stack, which
 * doesn't exist here yet — see veterancy.mjs's header for the same note).
 * Parity verified in casualties.parity.test.mjs.
 */

const TARGETING_ORDER = {
  screen_first: ["screen", "line", "carrier", "capital", "support", "bombard"],
  line_first: ["line", "screen", "capital", "carrier", "support"],
  capital_first: ["capital", "line", "carrier", "screen", "support"],
  garrison_first: ["garrison", "infantry", "assault", "armor", "psi"],
  infantry_first: ["infantry", "assault", "garrison", "armor", "psi"],
  assault_first: ["assault", "infantry", "garrison", "armor", "psi"],
  flee: ["support", "screen", "line"],
};

export function targetingOrder(targeting) {
  return TARGETING_ORDER[targeting] || TARGETING_ORDER.line_first;
}

/**
 * Apply raw damage points across a side's groups, in targeting-priority
 * order, until the damage budget is spent.
 *
 * @param {object[]} groups
 * @param {number} damagePoints
 * @param {string} preferredTargeting
 * @returns {{ groups: object[], log: object[] }}
 */
export function applyCasualties(groups, damagePoints, preferredTargeting) {
  const log = [];
  let dmg = damagePoints;
  const order = targetingOrder(preferredTargeting);
  const indices = groups
    .map((_, i) => i)
    .sort((ia, ib) => {
      const ra = order.indexOf(groups[ia].roles[0]);
      const rb = order.indexOf(groups[ib].roles[0]);
      return (ra < 0 ? 99 : ra) - (rb < 0 ? 99 : rb);
    });

  const next = [...groups];

  for (const i of indices) {
    const g = next[i];
    if (dmg <= 0) break;
    if ((g.count || 0) <= 0) continue;

    const absorb = Math.max(1, (g.armor || 0) * 0.15 + (g.shields || 0) * 0.1);
    const maxHp = Math.max(1, g.maxHp || g.hp || 1);
    const currentHp = g.hp || maxHp;
    const hpPool = Math.max(0, currentHp + Math.max(0, (g.count || 0) - 1) * maxHp);
    const absorbDiv = Math.max(0.5, absorb / 10);
    const effectiveDmg = dmg / absorbDiv;
    const inflicted = Math.min(hpPool, effectiveDmg);
    dmg -= inflicted * absorbDiv;

    const beforeCount = g.count;
    let remainCount = beforeCount;
    let remainHp = currentHp;

    if (inflicted >= hpPool) {
      remainCount = 0;
      remainHp = 0;
    } else {
      let remainDmg = inflicted;
      if (remainDmg >= remainHp) {
        remainDmg -= remainHp;
        remainCount -= 1;
        remainHp = maxHp;
        if (remainDmg > 0) {
          const unitsLost = Math.floor(remainDmg / maxHp);
          remainCount -= unitsLost;
          remainDmg -= unitsLost * maxHp;
          remainHp -= remainDmg;
        }
      } else {
        remainHp -= remainDmg;
      }
    }

    const unitsLost = beforeCount - remainCount;
    if (unitsLost > 0 || remainHp < currentHp) {
      log.push({
        defId: g.defId,
        parentId: g.parentId,
        lost: unitsLost,
        before: beforeCount,
        after: remainCount,
        stationary: !!g.stationary,
      });
    }

    const count = Math.max(0, remainCount);
    next[i] = { ...g, count, hp: count > 0 ? Math.max(1, remainHp) : 0 };
  }

  return { groups: next, log };
}

/**
 * Drop fully-destroyed stacks (count reached 0). Ported in spirit from
 * GMap/server/combatResolve.mjs's cleanupEmptyComposition — GMap's version
 * also prunes empty top-level fleets/legions from `world`, which doesn't
 * exist here; this is the part of it that matters for resolveExchange.mjs.
 *
 * Why this matters, found via a real 10-turn playtest (not a hypothetical):
 * a defeated side left in the `groups` array as a zero-count entry isn't
 * harmless — roleMatchups.mjs's totalPower() weights the attacker's power
 * by the enemy's role distribution, and an all-zero-but-present enemy side
 * makes that weight computation degenerate to 0 instead of falling back to
 * a neutral 1x the way a genuinely *empty* array does. Concretely: fighting
 * an already-annihilated enemy without pruning it first reports the
 * attacker's own power as 0 too. Always call this between engagements.
 */
export function removeDestroyedGroups(groups) {
  return groups.filter((g) => (g.count || 0) > 0);
}
