/**
 * Property-layer damage multiplier: equipped weapon/shield/hull resource
 * properties (from combat_property_matchups content) modify the base
 * role-matchup power on top of roleMatchups.mjs. Ported verbatim from
 * GMap/server/combatResolve.mjs. Parity verified in
 * propertyMatchup.parity.test.mjs.
 */

function mapResource(content, idOrName) {
  if (!idOrName) return null;
  return (
    content.map_resources?.[idOrName] ||
    Object.values(content.map_resources || {}).find((r) => r.id === idOrName || r.name === idOrName)
  );
}

function groupHasSlotFills(group) {
  if (Object.keys(group.filledSlots || {}).length > 0) return true;
  for (const s of group.compSlots || []) {
    if (s.resourceId || s.resource) return true;
  }
  return false;
}

/** @returns {{ properties: string[], effectiveTier: number|null } | null} */
function resolveRoleSlot(group, role, content) {
  const resIds = [];
  const fill = group.filledSlots?.[role];
  if (fill) resIds.push(fill);
  for (const s of group.compSlots || []) {
    if (s.role === role && (s.resourceId || s.resource)) {
      resIds.push(s.resourceId || s.resource);
    }
  }
  if (resIds.length === 0) return null;
  const resources = resIds.map((id) => mapResource(content, id)).filter(Boolean);
  if (resources.length === 0) return null;
  const tiers = resources.map((r) => Number(r.tier)).filter((t) => Number.isFinite(t));
  const effectiveTier = tiers.length ? Math.min(...tiers) : null;
  const properties = [...new Set(resources.flatMap((r) => r.properties || []))];
  return { properties, effectiveTier };
}

/** Property-layer damage multiplier (v1). No-op when attacker has no slot fills. */
export function propertyCombatMult(attackerGroup, defenderGroup, content) {
  const cfg = content.combat_property_matchups;
  if (!cfg || !groupHasSlotFills(attackerGroup)) return 1;

  let mult = 1;
  const weapon = resolveRoleSlot(attackerGroup, "weapon", content);
  const shield = resolveRoleSlot(defenderGroup, "shield", content);
  const hull = resolveRoleSlot(defenderGroup, "hull", content);

  if (weapon) {
    const wp = weapon.properties;
    if (wp.includes("weapon_amp")) mult *= 1.2;
    if (wp.includes("matter_destroy")) mult *= 1.5;
  }

  if (weapon && shield) {
    const wProps = weapon.properties;
    if (wProps.includes("psion_suppress") || wProps.includes("matter_destroy")) {
      mult *= 1.4;
    } else if (shield.properties.includes("shield")) {
      mult *= 0.6;
    }
  }

  if (weapon && hull) {
    const wt = weapon.effectiveTier;
    const ht = hull.effectiveTier;
    if (wt != null && ht != null) {
      mult *= wt > ht ? 1.5 : 0.7;
    }
  }

  return mult;
}

/** Mean property multiplier of every attacker vs. one sample defender. */
export function meanPropertyMultVsSample(attackers, defenderSample, content) {
  if (!attackers.length || !defenderSample) return 1;
  let sum = 0;
  for (const a of attackers) sum += propertyCombatMult(a, defenderSample, content);
  return sum / attackers.length;
}
