/**
 * Shared fight math used by both resolve entry points (resolveEngagementFight
 * and resolveAssaultPhase): group gathering, role power, matchups, combat-role
 * tech bonuses, space-object modifiers, casualty application, composition
 * cleanup. Extracted from ../combatResolve.mjs.
 */
import { readLedger, ensureFactionEco } from "../ledger.mjs";
import { spaceObjectCombatModifier } from "../spaceObjects.mjs";
import { buildModifierStack, applyFlatThenMult } from "../modifierStack.mjs";
import { applyCourtStatMultToGroups } from "../courtStatMult.mjs";
import { shipDef, unitDef } from "./properties.mjs";
import { applyVeterancyToGroup } from "./veterancy.mjs";
import { gatherDefenseUnits } from "./defenseLayers.mjs";

export { applyCourtStatMultToGroups };

const STANCE_DEFAULT = {
  powerMult: 1,
  casualtyTakenMult: 1,
};

/**
 * Flatten fleet/legion into fight groups.
 * @param {"space"|"ground"|"assault"} theater
 */
export function gatherGroups(world, side, theater, content, engagement = null) {
  const groups = [];
  const faction = (world.factions ?? []).find((f) => f.id === side.factionId);

  const resolveRaceId = (entity, systemId) => {
    if (entity?.raceId) return entity.raceId;
    if (faction?.primaryRaceId) return faction.primaryRaceId;
    if (faction?.primaryRace) return faction.primaryRace;
    const sys = (world.systems ?? []).find((s) => s.id === systemId);
    const planet = (sys?.planets || []).find((p) => (p.population ?? 0) > 0);
    const top = (planet?.raceComposition || [])
      .slice()
      .sort((a, b) => (b.percent || 0) - (a.percent || 0))[0];
    return top?.raceId || null;
  };

  const applyRaceVariantStats = (group, def, raceId) => {
    if (!raceId || !def?.raceVariants?.[raceId]) return;
    const variant = def.raceVariants[raceId];
    const mult = variant.statsMult || {};
    for (const [k, m] of Object.entries(mult)) {
      if (typeof group[k] === "number" && typeof m === "number") {
        group[k] = group[k] * m;
      }
      if (k === "defense" && typeof m === "number" && typeof group.armor === "number") {
        group.armor = group.armor * m;
      }
      if (k === "hp" && typeof m === "number") {
        group.maxHp = (group.maxHp || group.hp) * m;
      }
    }
    group.raceId = raceId;
    if (variant.name) group.variantName = variant.name;
  };

  for (const fleetId of side.fleetIds || []) {
    const fleet = (world.fleets ?? []).find((f) => f.id === fleetId);
    if (!fleet) continue;
    const raceId = resolveRaceId(fleet, fleet.systemId);
    for (const g of fleet.composition || []) {
      const rawCount = Number(g.count);
      if (Number.isFinite(rawCount) && rawCount <= 0) continue;
      const def = shipDef(content, g.defId || g.type);
      if (!def) continue;
      const tm = def.theaterMult?.[theater] ?? (theater === "space" ? 1 : 0);
      if (tm <= 0) continue;
      const group = {
        kind: "ship",
        parentId: fleet.id,
        parentKind: "fleet",
        defId: def.id,
        roles: def.roles || ["line"],
        count: Number.isFinite(rawCount) && rawCount > 0 ? rawCount : 1,
        hp: g.hp ?? def.stats?.hp ?? 40,
        maxHp: def.stats?.hp ?? 40,
        damage: (def.stats?.damage ?? 10) * tm,
        armor: def.stats?.armor ?? 0,
        shields: def.stats?.shields ?? 0,
        accuracy: def.stats?.accuracy ?? 50,
        targeting: def.targeting || "line_first",
        slotDefs: def.slots || [],
        filledSlots: { ...(g.filledSlots || g.slotFills || {}) },
        compSlots: g.slots || [],
        ref: g,
        xp: g.xp || 0,
        level: g.level || 0,
      };
      applyRaceVariantStats(group, def, raceId);
      applyVeterancyToGroup(group, content);
      groups.push(group);
    }
  }
  for (const legionId of side.legionIds || []) {
    const legion = (world.legions ?? []).find((l) => l.id === legionId);
    if (!legion) continue;
    const raceId = resolveRaceId(legion, legion.systemId);
    const comps =
      Array.isArray(legion.composition) && legion.composition.length > 0
        ? legion.composition
        : [
            {
              defId: "unit.generic_line",
              count: Math.max(1, Math.round(legion.strength || 1)),
              hp: 100,
            },
          ];
    for (const g of comps) {
      const rawCount = Number(g.count);
      if (Number.isFinite(rawCount) && rawCount <= 0) continue;
      const def = unitDef(content, g.defId || g.type);
      if (!def) continue;
      const tm = def.theaterMult?.[theater] ?? (theater === "space" ? 0 : 1);
      if (tm <= 0) continue;
      const group = {
        kind: "unit",
        parentId: legion.id,
        parentKind: "legion",
        defId: def.id,
        roles: def.roles || ["infantry"],
        count: Number.isFinite(rawCount) && rawCount > 0 ? rawCount : 1,
        hp: g.hp ?? def.stats?.hp ?? 100,
        maxHp: def.stats?.hp ?? 100,
        damage: (def.stats?.damage ?? 12) * tm,
        armor: def.stats?.defense ?? def.stats?.armor ?? 0,
        shields: 0,
        accuracy: 55,
        targeting: def.targeting || "infantry_first",
        slotDefs: def.slots || [],
        filledSlots: { ...(g.filledSlots || g.slotFills || {}) },
        compSlots: g.slots || [],
        ref: g,
        legion,
        xp: g.xp || 0,
        level: g.level || 0,
      };
      applyRaceVariantStats(group, def, raceId);
      applyVeterancyToGroup(group, content);
      groups.push(group);
    }
  }

  if (engagement && theater !== "space") {
    // Defender side gets planetary defense installations
    const isDefender =
      engagement.sides?.[1]?.factionId === side.factionId ||
      side === engagement.sides?.[1];
    if (isDefender) {
      const defense = gatherDefenseUnits(
        world,
        engagement,
        side,
        theater,
        content,
      );
      for (const g of defense) applyVeterancyToGroup(g, content);
      groups.push(...defense);
    }
  }

  return groups;
}

export function groupsForFight(world, side, theater, content, engagement) {
  const groups = gatherGroups(world, side, theater, content, engagement);
  const fac = (world.factions ?? []).find((f) => f.id === side.factionId);
  return applyCourtStatMultToGroups(groups, fac);
}

export function rolePower(groups) {
  const out = {};
  for (const g of groups) {
    if ((g.count || 0) <= 0) continue;
    const role = (g.roles && g.roles[0]) || "line";
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
 * Anti-role bonus: when the opponent has any power in `role`, multiply
 * this side's power by channel `combat_role:${role}`.
 */
export function applyCombatRoleBonus(power, combatRoleChannels, enemyRoles) {
  if (!combatRoleChannels) return power;
  let out = power;
  for (const [role, enemyPow] of Object.entries(enemyRoles || {})) {
    if ((Number(enemyPow) || 0) <= 0) continue;
    const ch = combatRoleChannels[`combat_role:${role}`];
    if (!ch) continue;
    out = applyFlatThenMult(out, ch);
  }
  return out;
}

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

export function factionCombatRoleChannels(world, factionId, content) {
  const ledger = readLedger();
  const eco = ensureFactionEco(ledger, factionId);
  const effects = [];
  const unlockedUpgrades = new Set(eco?.unlockedUpgrades || []);
  for (const id of eco?.unlockedTechs || []) {
    const def = content.technologies?.[id];
    if (!def) continue;
    for (const e of def.effects || []) {
      if (e.effect === "combat_role_mult") effects.push(e);
    }
    for (const u of def.upgrades || []) {
      if (!unlockedUpgrades.has(u.id)) continue;
      for (const e of u.effects || []) {
        if (e.effect === "combat_role_mult") effects.push(e);
      }
    }
  }
  if (!effects.length) return undefined;
  return buildModifierStack(effects).channels;
}

export function applySpaceObjectPower(powerA, powerB, system, content, sideA, sideB) {
  if (!system) return { powerA, powerB };
  return {
    powerA:
      powerA * spaceObjectCombatModifier(system, content, sideA.factionId),
    powerB:
      powerB * spaceObjectCombatModifier(system, content, sideB.factionId),
  };
}

function targetingOrder(targeting) {
  const map = {
    screen_first: ["screen", "line", "carrier", "capital", "support", "bombard"],
    line_first: ["line", "screen", "capital", "carrier", "support"],
    capital_first: ["capital", "line", "carrier", "screen", "support"],
    garrison_first: ["garrison", "infantry", "assault", "armor", "psi"],
    infantry_first: ["infantry", "assault", "garrison", "armor", "psi"],
    assault_first: ["assault", "infantry", "garrison", "armor", "psi"],
    flee: ["support", "screen", "line"],
  };
  return map[targeting] || map.line_first;
}

/**
 * Apply raw damage points to groups; mutate count/hp on refs.
 */
export function applyCasualties(groups, damagePoints, preferredTargeting) {
  const log = [];
  let dmg = damagePoints;
  const order = targetingOrder(preferredTargeting);
  const sorted = [...groups].sort((a, b) => {
    const ra = order.indexOf(a.roles[0]);
    const rb = order.indexOf(b.roles[0]);
    return (ra < 0 ? 99 : ra) - (rb < 0 ? 99 : rb);
  });

  for (const g of sorted) {
    if (dmg <= 0) break;
    if ((g.count || 0) <= 0) continue;

    const absorb = Math.max(1, (g.armor || 0) * 0.15 + (g.shields || 0) * 0.1);
    const maxHp = Math.max(1, g.maxHp || g.hp || 1);
    const currentHp = g.hp || maxHp;
    const hpPool = Math.max(0, currentHp + Math.max(0, (g.count || 0) - 1) * maxHp);
    // Same clamped divisor for HP conversion and budget drain (weak armor must not inflate effectiveDmg).
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

    g.count = Math.max(0, remainCount);
    g.hp = g.count > 0 ? Math.max(1, remainHp) : 0;
    if (g.ref) {
      g.ref.count = g.count;
      if (g.count > 0) g.ref.hp = g.hp;
    }
  }

  return log;
}

/**
 * After stationary (building-spawned) units take losses, disable matching
 * defense/barracks buildings so occupation re-gather does not respawn them.
 */
export function persistStationaryCasualties(world, engagement, losses) {
  const lost = (losses || [])
    .filter((e) => e.stationary && (e.lost || 0) > 0)
    .reduce((s, e) => s + (e.lost || 0), 0);
  if (lost <= 0) return 0;

  const sys = (world.systems ?? []).find((s) => s.id === engagement.systemId);
  if (!sys) return 0;

  const planets = (sys.planets || []).filter((p) => {
    if (engagement.planetId) return p.id === engagement.planetId;
    return true;
  });

  let remaining = lost;
  let disabled = 0;
  for (const p of planets) {
    if (remaining <= 0) break;
    const lists = [
      p.surfaceBuildings,
      p.orbitalBuildings,
      p.buildings,
    ].filter(Array.isArray);
    for (const buildings of lists) {
      for (const b of buildings) {
        if (remaining <= 0) break;
        if (b.disabled) continue;
        if (b.kind !== "defense" && b.kind !== "barracks") continue;
        b.disabled = true;
        remaining -= 1;
        disabled += 1;
      }
    }
  }
  return disabled;
}

/**
 * Drop fully-destroyed stacks (`count: 0`). A leftover zero-count group is
 * not harmless: totalPower weights the attacker by the enemy's role mix, and
 * an all-zero-but-present enemy side collapses attacker power to 0 instead
 * of falling back to neutral 1×. Mutates `groups` in place when it is an array.
 */
export function pruneDestroyedGroups(groups) {
  if (!Array.isArray(groups)) return [];
  let w = 0;
  for (let i = 0; i < groups.length; i++) {
    if ((groups[i].count || 0) > 0) groups[w++] = groups[i];
  }
  groups.length = w;
  return groups;
}

export function cleanupEmptyComposition(world) {
  if (world.fleets) {
    for (const f of world.fleets) {
      f.composition = pruneDestroyedGroups(f.composition || []);
    }
    world.fleets = world.fleets.filter((f) => f.composition.length > 0);
  }
  if (world.legions) {
    for (const l of world.legions) {
      if (Array.isArray(l.composition)) {
        l.composition = pruneDestroyedGroups(l.composition);
        l.strength = l.composition.reduce((s, g) => s + (g.count || 0), 0);
      }
    }
    world.legions = world.legions.filter((l) => (l.composition || []).length > 0);
  }
}

export function stanceMult(content, stanceId) {
  return content.combat_stances?.[stanceId] || STANCE_DEFAULT;
}

export function filterGroupsByRoles(groups, roles) {
  const set = new Set(roles);
  return groups.filter((g) => (g.roles || []).some((r) => set.has(r)));
}
