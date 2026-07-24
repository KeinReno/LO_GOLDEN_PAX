/**
 * Combat resolve by roles + matchups + composition casualties (P5).
 */
import { getContent } from "./contentLoader.mjs";
import { resolveAlias } from "./normalizeWorld.mjs";

const STANCE_DEFAULT = {
  powerMult: 1,
  casualtyTakenMult: 1,
};

function shipDef(content, typeOrId) {
  const id = resolveAlias("ships", typeOrId);
  return (
    content.ships?.[id] ||
    content.ships?.[typeOrId] ||
    Object.values(content.ships || {}).find(
      (s) => s.name === typeOrId || s.id === typeOrId,
    )
  );
}

function unitDef(content, typeOrId) {
  const id = resolveAlias("units", typeOrId);
  return (
    content.units?.[id] ||
    content.units?.[typeOrId] ||
    Object.values(content.units || {}).find((u) => u.id === typeOrId)
  );
}

/**
 * Flatten fleet/legion into fight groups.
 * @param {"space"|"ground"|"assault"} theater
 */
export function gatherGroups(world, side, theater, content) {
  const groups = [];
  for (const fleetId of side.fleetIds || []) {
    const fleet = (world.fleets ?? []).find((f) => f.id === fleetId);
    if (!fleet) continue;
    for (const g of fleet.composition || []) {
      const def = shipDef(content, g.defId || g.type);
      if (!def) continue;
      const tm = def.theaterMult?.[theater] ?? (theater === "space" ? 1 : 0);
      if (tm <= 0) continue;
      groups.push({
        kind: "ship",
        parentId: fleet.id,
        parentKind: "fleet",
        defId: def.id,
        roles: def.roles || ["line"],
        count: g.count || 1,
        hp: g.hp ?? def.stats?.hp ?? 40,
        maxHp: def.stats?.hp ?? 40,
        damage: (def.stats?.damage ?? 10) * tm,
        armor: def.stats?.armor ?? 0,
        shields: def.stats?.shields ?? 0,
        accuracy: def.stats?.accuracy ?? 50,
        targeting: def.targeting || "line_first",
        ref: g,
      });
    }
  }
  for (const legionId of side.legionIds || []) {
    const legion = (world.legions ?? []).find((l) => l.id === legionId);
    if (!legion) continue;
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
      const def = unitDef(content, g.defId || g.type);
      if (!def) continue;
      const tm = def.theaterMult?.[theater] ?? (theater === "space" ? 0 : 1);
      if (tm <= 0) continue;
      groups.push({
        kind: "unit",
        parentId: legion.id,
        parentKind: "legion",
        defId: def.id,
        roles: def.roles || ["infantry"],
        count: g.count || 1,
        hp: g.hp ?? def.stats?.hp ?? 100,
        maxHp: def.stats?.hp ?? 100,
        damage: (def.stats?.damage ?? 12) * tm,
        armor: def.stats?.defense ?? def.stats?.armor ?? 0,
        shields: 0,
        accuracy: 55,
        targeting: def.targeting || "infantry_first",
        ref: g,
        legion,
      });
    }
  }
  return groups;
}

function rolePower(groups) {
  const out = {};
  for (const g of groups) {
    const role = g.roles[0] || "line";
    const unitPower =
      g.damage *
      (0.5 + g.accuracy / 200) *
      (1 + g.shields / 200) *
      g.count *
      (g.hp / Math.max(1, g.maxHp));
    out[role] = (out[role] || 0) + unitPower;
  }
  return out;
}

function totalPower(roleMap, matchups, enemyRoles) {
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
  return sum;
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
    const absorb = Math.max(1, g.armor * 0.15 + g.shields * 0.1);
    const hpPool = g.hp * g.count;
    const inflicted = Math.min(hpPool, dmg / Math.max(0.5, absorb / 10));
    dmg -= inflicted * (absorb / 10);

    const lostHp = inflicted;
    const unitsLost = Math.floor(lostHp / Math.max(1, g.maxHp));
    const remainCount = Math.max(0, g.count - unitsLost);
    const remainHp =
      remainCount === 0
        ? 0
        : Math.max(1, Math.floor(g.hp - (lostHp % Math.max(1, g.maxHp))));

    if (unitsLost > 0 || remainHp < g.hp) {
      log.push({
        defId: g.defId,
        parentId: g.parentId,
        lost: unitsLost,
        before: g.count,
        after: remainCount,
      });
    }

    g.count = remainCount;
    g.hp = remainCount > 0 ? remainHp : 0;
    if (g.ref) {
      g.ref.count = g.count;
      if (g.count > 0) g.ref.hp = g.hp;
    }
  }

  // Remove empty composition entries from parents later
  return log;
}

export function cleanupEmptyComposition(world) {
  for (const f of world.fleets ?? []) {
    f.composition = (f.composition || []).filter((g) => (g.count || 0) > 0);
  }
  for (const l of world.legions ?? []) {
    if (Array.isArray(l.composition)) {
      l.composition = l.composition.filter((g) => (g.count || 0) > 0);
      l.strength = l.composition.reduce((s, g) => s + (g.count || 0), 0);
    }
  }
}

function stanceMult(content, stanceId) {
  return content.combat_stances?.[stanceId] || STANCE_DEFAULT;
}

/**
 * Resolve one engagement side vs side.
 */
export function resolveEngagementFight(world, engagement) {
  const content = getContent();
  const matchups = content.combat_matchups || {};
  const theater = engagement.theater || "space";
  const sideA = engagement.sides[0];
  const sideB = engagement.sides[1];
  if (!sideA || !sideB) {
    return { ok: false, error: "need two sides" };
  }

  const groupsA = gatherGroups(world, sideA, theater, content);
  const groupsB = gatherGroups(world, sideB, theater, content);
  if (groupsA.length === 0 && groupsB.length === 0) {
    return { ok: false, error: "no forces" };
  }

  const stA = stanceMult(content, sideA.stance || "hold");
  const stB = stanceMult(content, sideB.stance || "hold");

  const rolesA = rolePower(groupsA);
  const rolesB = rolePower(groupsB);
  let powerA = totalPower(rolesA, matchups, rolesB) * (stA.powerMult ?? 1);
  let powerB = totalPower(rolesB, matchups, rolesA) * (stB.powerMult ?? 1);

  // Retreat: mostly escape
  if ((sideA.stance || "hold") === "retreat" && powerA < powerB * 0.8) {
    return {
      ok: true,
      outcome: "retreat_a",
      powerA,
      powerB,
      lossesA: [],
      lossesB: [],
      retreated: sideA.factionId,
    };
  }
  if ((sideB.stance || "hold") === "retreat" && powerB < powerA * 0.8) {
    return {
      ok: true,
      outcome: "retreat_b",
      powerA,
      powerB,
      lossesA: [],
      lossesB: [],
      retreated: sideB.factionId,
    };
  }

  const shareA = powerA / Math.max(1, powerA + powerB);
  const rawDmgToB =
    powerA * 0.55 * (stB.casualtyTakenMult ?? 1);
  const rawDmgToA =
    powerB * 0.55 * (stA.casualtyTakenMult ?? 1);

  const lossesB = applyCasualties(
    groupsB,
    rawDmgToB,
    groupsA[0]?.targeting || "line_first",
  );
  const lossesA = applyCasualties(
    groupsA,
    rawDmgToA,
    groupsB[0]?.targeting || "line_first",
  );
  cleanupEmptyComposition(world);

  let outcome = "draw";
  if (shareA > 0.58) outcome = "win_a";
  else if (shareA < 0.42) outcome = "win_b";

  // Destroyed sides
  const aliveA = groupsA.some((g) => g.count > 0);
  const aliveB = groupsB.some((g) => g.count > 0);
  if (aliveA && !aliveB) outcome = "win_a";
  if (!aliveA && aliveB) outcome = "win_b";
  if (!aliveA && !aliveB) outcome = "draw";

  return {
    ok: true,
    outcome,
    powerA,
    powerB,
    lossesA,
    lossesB,
  };
}
