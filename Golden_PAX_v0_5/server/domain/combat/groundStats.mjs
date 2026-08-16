/**
 * Ground units in units.json use defense/speed; rolePower reads
 * damage/accuracy/shields/hp. First-pass mapping at engage-group assembly
 * (do not rewrite units.json):
 *
 *   defense → shields (and armor if armor is missing)
 *   speed   → accuracy * 20  (speed 4 → 80, near ship.scout accuracy 65)
 *   missing hp/maxHp → defense, else 10
 *   missing damage   → defense, else 5
 *
 * Groups that already have the combat fields (ships, boarding militia) are
 * left unchanged for those keys.
 */

const SPEED_TO_ACCURACY = 20;
const DEFAULT_HP = 10;
const DEFAULT_DAMAGE = 5;

export function adaptGroupCombatStats(group) {
  if (!group || typeof group !== "object") return group;
  const g = { ...group };
  const defense = g.defense != null ? Number(g.defense) || 0 : null;
  if (g.shields == null && defense != null) g.shields = defense;
  if (g.armor == null && defense != null) g.armor = defense;
  if (g.accuracy == null && g.speed != null) g.accuracy = (Number(g.speed) || 0) * SPEED_TO_ACCURACY;
  if (g.hp == null) g.hp = defense != null ? defense : DEFAULT_HP;
  if (g.maxHp == null || g.maxHp === 0) g.maxHp = g.hp || DEFAULT_HP;
  if (g.damage == null) g.damage = defense != null ? defense : DEFAULT_DAMAGE;
  return g;
}

export function adaptGroupsForRolePower(groups) {
  return (groups || []).map(adaptGroupCombatStats);
}
