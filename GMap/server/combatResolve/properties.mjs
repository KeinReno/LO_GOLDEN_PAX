/**
 * Ship/unit/resource-def lookups + property-layer combat matchup math.
 * Extracted from ../combatResolve.mjs.
 */
import { resolveAlias } from "../normalizeWorld.mjs";

function defByIdOrName(bag, typeOrId, aliased) {
  if (!typeOrId) return undefined;
  const needle = String(typeOrId).toLowerCase();
  return (
    bag?.[aliased] ||
    bag?.[typeOrId] ||
    Object.values(bag || {}).find(
      (d) =>
        d?.id === typeOrId ||
        d?.id === aliased ||
        d?.name === typeOrId ||
        (d?.name && String(d.name).toLowerCase() === needle),
    )
  );
}

export function shipDef(content, typeOrId) {
  const id = resolveAlias("ships", typeOrId);
  return defByIdOrName(content.ships, typeOrId, id);
}

export function unitDef(content, typeOrId) {
  const id = resolveAlias("units", typeOrId);
  return defByIdOrName(content.units, typeOrId, id);
}

function mapResource(content, idOrName) {
  if (!idOrName) return null;
  for (const bag of [content.map_resources, content.modules]) {
    if (bag?.[idOrName]) return bag[idOrName];
    const hit = Object.values(bag || {}).find(
      (r) => r.id === idOrName || r.name === idOrName,
    );
    if (hit) return hit;
  }
  return null;
}

function groupHasSlotFills(group) {
  if (Object.keys(group.filledSlots || {}).length > 0) return true;
  for (const s of group.compSlots || []) {
    if (s.resourceId || s.resource) return true;
  }
  return false;
}

/**
 * Resolve a combat slot role to filled resource properties + bottleneck tier.
 * @returns {{ properties: string[], effectiveTier: number|null } | null}
 */
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
  const tiers = resources
    .map((r) => Number(r.tier))
    .filter((t) => Number.isFinite(t));
  const effectiveTier = tiers.length ? Math.min(...tiers) : null;
  const properties = [
    ...new Set(resources.flatMap((r) => r.properties || [])),
  ];
  return { properties, effectiveTier };
}

/**
 * Property-layer strike tags + multiplier (v1).
 * No-op when attacker has no slot fills.
 * Tags: amp | hull_break | shield_pierce | shield_absorb | hull_pierce | hull_resist
 */
export function propertyCombatBreakdown(attackerGroup, defenderGroup, content) {
  const tags = [];
  const cfg = content?.combat_property_matchups;
  if (!cfg || !groupHasSlotFills(attackerGroup)) {
    return { mult: 1, tags };
  }

  let mult = 1;
  const weapon = resolveRoleSlot(attackerGroup, "weapon", content);
  const shield = defenderGroup
    ? resolveRoleSlot(defenderGroup, "shield", content)
    : null;
  const hull = defenderGroup
    ? resolveRoleSlot(defenderGroup, "hull", content)
    : null;

  if (weapon) {
    const wp = weapon.properties;
    if (wp.includes("weapon_amp")) {
      mult *= 1.2;
      tags.push("amp");
    }
    if (wp.includes("matter_destroy")) {
      mult *= 1.5;
      tags.push("hull_break");
    }
  }

  if (weapon && shield) {
    const wProps = weapon.properties;
    if (wProps.includes("psion_suppress") || wProps.includes("matter_destroy")) {
      mult *= 1.4;
      tags.push("shield_pierce");
    } else if (shield.properties.includes("shield")) {
      mult *= 0.6;
      tags.push("shield_absorb");
    }
  }

  if (weapon && hull) {
    const wt = weapon.effectiveTier;
    const ht = hull.effectiveTier;
    if (wt != null && ht != null) {
      if (wt > ht) {
        mult *= 1.5;
        tags.push("hull_pierce");
      } else {
        mult *= 0.7;
        tags.push("hull_resist");
      }
    }
  }

  return { mult, tags };
}

/** Property-layer damage multiplier (v1). No-op when attacker has no slot fills. */
export function propertyCombatMult(attackerGroup, defenderGroup, content) {
  return propertyCombatBreakdown(attackerGroup, defenderGroup, content).mult;
}

export function meanPropertyMultVsSample(attackers, defenderSample, content) {
  if (!attackers.length || !defenderSample) return 1;
  let sum = 0;
  for (const a of attackers) {
    sum += propertyCombatMult(a, defenderSample, content);
  }
  return sum / attackers.length;
}
