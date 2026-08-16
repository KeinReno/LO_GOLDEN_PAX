/**
 * Veterancy: XP → level → stat multipliers. Ported from GMap/server/
 * combatResolve.mjs. Reshaped from mutate-group-in-place to return a new
 * group, matching this domain's convention — and from "XP lives on a
 * separate persistent `.ref` object, distinct from the transient combat
 * group" (GMap's world model) to "XP lives on the group itself", since
 * there's no persistent fleet/composition store here yet. Parity verified
 * in veterancy.parity.test.mjs (levelFromXp, and applyStatMult's math via
 * applyVeterancyToGroup).
 */

export function veterancyConfig(content) {
  return (
    content?.rules?.veterancy || {
      thresholds: [0, 100, 250, 500, 900, 1500],
      bonuses: [{}, {}, {}, {}, {}, {}],
      xpPerBattle: 50,
      xpLossOnUnitUpgrade: 0.5,
    }
  );
}

export function levelFromXp(xp, thresholds) {
  const t = thresholds || veterancyConfig({}).thresholds;
  let level = 0;
  for (let i = 0; i < t.length; i++) {
    if ((xp || 0) >= t[i]) level = i;
  }
  return Math.min(level, (t.length || 1) - 1);
}

function applyStatMult(group, bonus) {
  const next = { ...group };
  const sm = bonus?.stat_mult || {};
  if (sm.damage) next.damage = group.damage * sm.damage;
  if (sm.defense) next.armor = (next.armor ?? group.armor) * sm.defense;
  if (sm.armor) next.armor = (next.armor ?? group.armor) * sm.armor;
  if (sm.shields) next.shields = group.shields * sm.shields;
  if (sm.hp) {
    next.hp = group.hp * sm.hp;
    next.maxHp = group.maxHp * sm.hp;
  }
  return next;
}

/** @param {object} group  needs xp and/or level; content for bonus lookup by level */
export function applyVeterancyToGroup(group, content) {
  const cfg = veterancyConfig(content);
  const xp = group.xp ?? 0;
  const level = group.level ?? levelFromXp(xp, cfg.thresholds);
  const bonus = cfg.bonuses?.[level] || {};
  return applyStatMult({ ...group, xp, level }, bonus);
}

/** Battle XP for every group that fought (alive, non-stationary). */
export function awardVeterancyXp(groups, content) {
  const cfg = veterancyConfig(content);
  const gain = cfg.xpPerBattle ?? 50;
  return groups.map((g) => {
    if ((g.count || 0) <= 0 || g.stationary) return g;
    const xp = (g.xp || 0) + gain;
    return { ...g, xp, level: levelFromXp(xp, cfg.thresholds) };
  });
}
