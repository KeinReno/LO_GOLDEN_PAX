/**
 * Veterancy: xp thresholds, stat bonuses, tech-upgrade xp loss, post-battle
 * xp award. Extracted from ../combatResolve.mjs.
 */
import { getContent } from "../contentLoader.mjs";

export function veterancyConfig(content) {
  return (
    content.rules?.veterancy || {
      thresholds: [0, 100, 250, 500, 900, 1500],
      bonuses: [{}, {}, {}, {}, {}, {}],
      xpPerBattle: 50,
      xpLossOnUnitUpgrade: 0.5,
    }
  );
}

export function levelFromXp(xp, thresholds) {
  const t = thresholds || veterancyConfig(getContent()).thresholds;
  let level = 0;
  for (let i = 0; i < t.length; i++) {
    if ((xp || 0) >= t[i]) level = i;
  }
  return Math.min(level, (t.length || 1) - 1);
}

function applyStatMult(group, bonus) {
  const sm = bonus?.stat_mult || {};
  if (sm.damage) group.damage *= sm.damage;
  if (sm.defense) group.armor *= sm.defense;
  if (sm.armor) group.armor *= sm.armor;
  if (sm.shields) group.shields *= sm.shields;
  if (sm.hp) {
    group.hp *= sm.hp;
    group.maxHp *= sm.hp;
  }
}

export function applyVeterancyToGroup(group, content) {
  const cfg = veterancyConfig(content);
  const xp = group.ref?.xp ?? group.xp ?? 0;
  const level =
    group.ref?.level ?? group.level ?? levelFromXp(xp, cfg.thresholds);
  group.xp = xp;
  group.level = level;
  const bonus = cfg.bonuses?.[level] || {};
  applyStatMult(group, bonus);
}

/**
 * Apply xp loss when a composition stack is upgraded via tech (A5 hook).
 */
export function applyVeterancyOnUnitUpgrade(compRef, content = getContent()) {
  if (!compRef || typeof compRef !== "object") return;
  const cfg = veterancyConfig(content);
  const loss = cfg.xpLossOnUnitUpgrade ?? 0.5;
  const xp = Math.floor((compRef.xp || 0) * loss);
  compRef.xp = xp;
  compRef.level = levelFromXp(xp, cfg.thresholds);
}

/**
 * When tech unlocks `unit_upgrade` {from,to}: convert matching stacks and apply xp loss.
 */
export function applyUnitUpgradeEffectsToWorld(
  world,
  factionId,
  effects,
  content = getContent(),
) {
  if (!world || !factionId) return 0;
  let changed = 0;
  for (const e of effects || []) {
    if (e?.effect !== "unit_upgrade") continue;
    const from = e.args?.from;
    const to = e.args?.to;
    if (!from || !to) continue;
    for (const fleet of world.fleets ?? []) {
      if (fleet.factionId !== factionId) continue;
      for (const g of fleet.composition || []) {
        const id = g.defId || g.type;
        if (id !== from) continue;
        applyVeterancyOnUnitUpgrade(g, content);
        g.defId = to;
        g.type = to;
        changed += 1;
      }
    }
    for (const legion of world.legions ?? []) {
      if (legion.factionId !== factionId) continue;
      for (const g of legion.composition || []) {
        const id = g.defId || g.type;
        if (id !== from) continue;
        applyVeterancyOnUnitUpgrade(g, content);
        g.defId = to;
        g.type = to;
        changed += 1;
      }
    }
  }
  return changed;
}

export function awardVeterancyXp(groups, content = getContent()) {
  const cfg = veterancyConfig(content);
  const gain = cfg.xpPerBattle ?? 50;
  for (const g of groups) {
    if (!g.ref || (g.count || 0) <= 0 || g.stationary) continue;
    g.ref.xp = (g.ref.xp || 0) + gain;
    g.ref.level = levelFromXp(g.ref.xp, cfg.thresholds);
  }
}
