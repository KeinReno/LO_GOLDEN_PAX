/**
 * Combat resolve by roles + matchups + composition casualties (P5 / A6).
 * Veterancy, stationary defense units, assault phases.
 */
import { getContent } from "./contentLoader.mjs";
import { resolveAlias } from "./normalizeWorld.mjs";
import { logisticsCombatDefMult } from "./logistics.mjs";
import { randomInt } from "node:crypto";

const STANCE_DEFAULT = {
  powerMult: 1,
  casualtyTakenMult: 1,
};

const ASSAULT_PHASES = ["bombard", "landing", "ground", "occupation"];

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

function mapResource(content, idOrName) {
  if (!idOrName) return null;
  return (
    content.map_resources?.[idOrName] ||
    Object.values(content.map_resources || {}).find(
      (r) => r.id === idOrName || r.name === idOrName,
    )
  );
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
 * Property-layer damage multiplier (v1). No-op when attacker has no slot fills.
 */
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

function meanPropertyMultVsSample(attackers, defenderSample, content) {
  if (!attackers.length || !defenderSample) return 1;
  let sum = 0;
  for (const a of attackers) {
    sum += propertyCombatMult(a, defenderSample, content);
  }
  return sum / attackers.length;
}

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

function applyVeterancyToGroup(group, content) {
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

function pushStationaryUnit(groups, def, count, parentId) {
  if (!def || count <= 0) return;
  groups.push({
    kind: "unit",
    parentId: parentId || "defense",
    parentKind: "stationary",
    defId: def.id,
    roles: def.roles || ["garrison"],
    count,
    hp: def.stats?.hp ?? 100,
    maxHp: def.stats?.hp ?? 100,
    damage: def.stats?.damage ?? 0,
    armor: def.stats?.defense ?? def.stats?.armor ?? 0,
    shields: def.stats?.shields ?? 0,
    accuracy: 55,
    targeting: def.targeting || "assault_first",
    slotDefs: [],
    filledSlots: {},
    compSlots: [],
    ref: null,
    stationary: true,
  });
}

/**
 * Count defense/barracks buildings on relevant planets and spawn stationary units.
 */
export function gatherDefenseUnits(world, engagement, side, theater, content) {
  if (theater === "space") return [];
  const groups = [];
  const sys = (world.systems ?? []).find((s) => s.id === engagement.systemId);
  if (!sys) return groups;

  const planets = (sys.planets || []).filter((p) => {
    if (engagement.planetId) return p.id === engagement.planetId;
    const owner = p.ownerFactionId || sys.ownerFactionId;
    return owner === side.factionId;
  });

  let defenseCount = 0;
  let barracksCount = 0;
  for (const p of planets) {
    const buildings = [
      ...(p.surfaceBuildings || []),
      ...(p.orbitalBuildings || []),
      ...(p.buildings || []),
    ];
    for (const b of buildings) {
      if (b.disabled) continue;
      if (b.kind === "defense") defenseCount += 1;
      if (b.kind === "barracks") barracksCount += 1;
    }
  }

  // Optional A3/A4 hooks: loyalty / logistics combatDefMult
  let defMult = 1;
  for (const p of planets) {
    if (typeof p.loyalty === "number" && p.loyalty < 40) {
      defMult *= 0.85 + (p.loyalty / 40) * 0.15;
    }
  }
  if (typeof sys.combatDefMult === "number") {
    defMult *= sys.combatDefMult;
  } else {
    defMult *= logisticsCombatDefMult(sys, content);
  }

  const gunDef = unitDef(content, "unit.planetary_gun");
  const bunkerDef = unitDef(content, "unit.bunker");
  const domeDef = unitDef(content, "unit.shield_dome");

  if (defenseCount > 0) {
    pushStationaryUnit(groups, bunkerDef, defenseCount, `def_${sys.id}`);
    pushStationaryUnit(groups, gunDef, defenseCount, `def_${sys.id}`);
    if (defenseCount >= 2) {
      pushStationaryUnit(
        groups,
        domeDef,
        Math.floor(defenseCount / 2),
        `def_${sys.id}`,
      );
    }
  }
  if (barracksCount > 0) {
    pushStationaryUnit(groups, bunkerDef, barracksCount, `def_${sys.id}`);
  }

  if (defMult !== 1) {
    for (const g of groups) {
      g.damage *= defMult;
      g.armor *= defMult;
      g.shields *= defMult;
    }
  }
  return groups;
}

export function buildDefenseLayers(world, engagement) {
  const sys = (world.systems ?? []).find((s) => s.id === engagement.systemId);
  const layers = {
    orbital: { guns: 0, shields: 0 },
    surface: { guns: 0, bunkers: 0 },
    garrison: { unitIds: [], fortBonus: 0 },
  };
  if (!sys) return layers;

  const planets = (sys.planets || []).filter((p) => {
    if (engagement.planetId) return p.id === engagement.planetId;
    return true;
  });

  for (const p of planets) {
    const buildings = [
      ...(p.surfaceBuildings || []),
      ...(p.orbitalBuildings || []),
      ...(p.buildings || []),
    ];
    for (const b of buildings) {
      if (b.disabled) continue;
      if (b.kind === "defense") {
        if ((b.zone || "surface") === "orbital") {
          layers.orbital.guns += 1;
          layers.orbital.shields += 1;
        } else {
          layers.surface.guns += 1;
          layers.surface.bunkers += 1;
          layers.garrison.fortBonus += 5;
        }
      }
      if (b.kind === "barracks") {
        layers.surface.bunkers += 1;
        layers.garrison.fortBonus += 3;
      }
    }
  }
  return layers;
}

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
        count: g.count || 1,
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
        count: g.count || 1,
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

function rolePower(groups) {
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
    if ((g.count || 0) <= 0) continue;
    
    const absorb = Math.max(1, (g.armor || 0) * 0.15 + (g.shields || 0) * 0.1);
    const maxHp = Math.max(1, g.maxHp || g.hp || 1);
    const currentHp = g.hp || maxHp;
    const hpPool = Math.max(0, currentHp + Math.max(0, (g.count || 0) - 1) * maxHp);
    
    const effectiveDmg = dmg / Math.max(0.5, absorb / 10);
    const inflicted = Math.min(hpPool, effectiveDmg);
    dmg -= inflicted * (absorb / 10);

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

export function cleanupEmptyComposition(world) {
  if (world.fleets) {
    for (const f of world.fleets) {
      f.composition = (f.composition || []).filter((g) => (g.count || 0) > 0);
    }
    world.fleets = world.fleets.filter((f) => f.composition.length > 0);
  }
  if (world.legions) {
    for (const l of world.legions) {
      if (Array.isArray(l.composition)) {
        l.composition = l.composition.filter((g) => (g.count || 0) > 0);
        l.strength = l.composition.reduce((s, g) => s + (g.count || 0), 0);
      }
    }
    world.legions = world.legions.filter((l) => (l.composition || []).length > 0);
  }
}

function stanceMult(content, stanceId) {
  return content.combat_stances?.[stanceId] || STANCE_DEFAULT;
}

function filterGroupsByRoles(groups, roles) {
  const set = new Set(roles);
  return groups.filter((g) => (g.roles || []).some((r) => set.has(r)));
}

function degradeDefenseLayers(layers, power, phase) {
  if (!layers) return { orbitalHit: 0, surfaceHit: 0 };
  let remaining = power;
  let orbitalHit = 0;
  let surfaceHit = 0;
  if (phase === "bombard") {
    while (remaining > 8 && layers.orbital.shields > 0) {
      layers.orbital.shields -= 1;
      remaining -= 12;
      orbitalHit += 1;
    }
    while (remaining > 8 && layers.orbital.guns > 0) {
      layers.orbital.guns -= 1;
      remaining -= 10;
      orbitalHit += 1;
    }
    while (remaining > 8 && layers.surface.guns > 0) {
      layers.surface.guns -= 1;
      remaining -= 10;
      surfaceHit += 1;
    }
    while (remaining > 8 && layers.surface.bunkers > 0) {
      layers.surface.bunkers -= 1;
      remaining -= 14;
      surfaceHit += 1;
    }
  }
  return { orbitalHit, surfaceHit };
}

/**
 * Resolve one engagement side vs side (full fight, non-phased).
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

  const groupsA = gatherGroups(world, sideA, theater, content, engagement);
  const groupsB = gatherGroups(world, sideB, theater, content, engagement);
  if (groupsA.length === 0 && groupsB.length === 0) {
    return { ok: false, error: "no forces" };
  }

  const stA = stanceMult(content, sideA.stance || "hold");
  const stB = stanceMult(content, sideB.stance || "hold");

  const rolesA = rolePower(groupsA);
  const rolesB = rolePower(groupsB);
  let powerA = totalPower(rolesA, matchups, rolesB) * (stA.powerMult ?? 1);
  let powerB = totalPower(rolesB, matchups, rolesA) * (stB.powerMult ?? 1);

  powerA *= meanPropertyMultVsSample(groupsA, groupsB[0], content);
  powerB *= meanPropertyMultVsSample(groupsB, groupsA[0], content);

  // Logistics combatDefMult is applied once in gatherDefenseUnits (stationary stats).
  const fightSys = (world.systems ?? []).find(
    (s) => s.id === engagement.systemId,
  );

  // Loyalty defense penalty / garrison defection (ground & assault)
  const loyaltyNotes = [];
  if ((theater === "ground" || theater === "assault") && fightSys) {
    const inhabited = (fightSys.planets || []).filter(
      (p) => (p.population ?? 0) > 0,
    );
    if (inhabited.length) {
      const avg =
        inhabited.reduce((s, p) => s + (p.loyalty ?? 50), 0) /
        inhabited.length;
      const ownerId = fightSys.ownerFactionId;
      let defMult = 1;
      if (avg < 20) {
        if (randomInt(100) < 25) {
          loyaltyNotes.push({
            type: "garrison_defect",
            loyalty: Math.round(avg),
          });
          defMult = 0.35;
        } else {
          defMult = 0.8;
        }
      } else if (avg < 40) {
        defMult = 0.8;
      }
      if (defMult !== 1 && ownerId) {
        if (sideA.factionId === ownerId) powerA *= defMult;
        if (sideB.factionId === ownerId) powerB *= defMult;
      }
    }
  }

  if ((sideA.stance || "hold") === "retreat" && powerA < powerB * 0.8) {
    return {
      ok: true,
      outcome: "retreat_a",
      powerA,
      powerB,
      lossesA: [],
      lossesB: [],
      retreated: sideA.factionId,
      phase: engagement.phase || null,
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
      phase: engagement.phase || null,
    };
  }

  const shareA = powerA / Math.max(1, powerA + powerB);
  const rawDmgToB = powerA * 0.55 * (stB.casualtyTakenMult ?? 1);
  const rawDmgToA = powerB * 0.55 * (stA.casualtyTakenMult ?? 1);

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
  persistStationaryCasualties(world, engagement, [...lossesA, ...lossesB]);
  cleanupEmptyComposition(world);
  awardVeterancyXp(groupsA, content);
  awardVeterancyXp(groupsB, content);

  let outcome = "draw";
  if (shareA > 0.58) outcome = "win_a";
  else if (shareA < 0.42) outcome = "win_b";

  const aliveA = groupsA.some((g) => (g.count || 0) > 0);
  const aliveB = groupsB.some((g) => (g.count || 0) > 0);
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
    loyaltyNotes,
    phase: engagement.phase || null,
  };
}

/**
 * Resolve a single assault phase. Returns fight result + whether engagement continues.
 */
export function resolveAssaultPhase(world, engagement) {
  const content = getContent();
  const matchups = content.combat_matchups || {};
  const phase = engagement.phase || "bombard";
  const sideA = engagement.sides[0];
  const sideB = engagement.sides[1];
  if (!sideA || !sideB) {
    return { ok: false, error: "need two sides" };
  }

  if (!engagement.defenseLayers) {
    engagement.defenseLayers = buildDefenseLayers(world, engagement);
  }
  const layers = engagement.defenseLayers;

  const theater = phase === "bombard" ? "space" : "assault";
  let groupsA = gatherGroups(world, sideA, theater, content, engagement);
  let groupsB = gatherGroups(world, sideB, theater === "space" ? "assault" : theater, content, engagement);

  const stA = stanceMult(content, sideA.stance || "assault");
  const stB = stanceMult(content, sideB.stance || "hold");

  let powerA = 0;
  let powerB = 0;
  let lossesA = [];
  let lossesB = [];
  let phaseNote = null;
  let continueEngagement = true;
  let outcome = "phase_continue";

  if (phase === "bombard") {
    const bombA = filterGroupsByRoles(groupsA, ["bombard", "capital"]);
    const bombPower =
      bombA.reduce(
        (s, g) => s + (g.damage || 0) * (g.count || 0) * (0.5 + (g.accuracy || 0) / 200),
        0,
      ) * (stA.powerMult ?? 1);
    powerA = bombPower;
    const hits = degradeDefenseLayers(layers, bombPower, "bombard");
    phaseNote = `orbital −${hits.orbitalHit}, surface −${hits.surfaceHit}`;

    // Orbital guns return fire on bombarding ships only
    const returnFire =
      (layers.orbital.guns + layers.orbital.shields) * 8 * (stB.powerMult ?? 1);
    powerB = returnFire;
    lossesA = applyCasualties(bombA, returnFire * 0.4, "capital_first");
    lossesB = [];
    engagement.orbitalControl =
      layers.orbital.guns + layers.orbital.shields <= 0
        ? "attacker"
        : layers.orbital.guns === 0
          ? "contested"
          : "defender";
  } else if (phase === "landing") {
    let assaultA = filterGroupsByRoles(groupsA, ["assault", "infantry"]);
    if (assaultA.length === 0) assaultA = groupsA.filter((g) => g.kind === "unit");
    const defB = filterGroupsByRoles(groupsB, [
      "garrison",
      "infantry",
      "assault",
    ]);
    const shieldPenalty =
      (layers.orbital?.shields || 0) > 0 ? 0.65 : 1;
    const fortBonus = 1 + (layers.garrison?.fortBonus || 0) / 100;

    const rolesA = rolePower(assaultA);
    const rolesB = rolePower(defB);
    powerA =
      totalPower(rolesA, matchups, rolesB) *
      (stA.powerMult ?? 1) *
      shieldPenalty;
    powerB =
      totalPower(rolesB, matchups, rolesA) * (stB.powerMult ?? 1) * fortBonus;

    lossesB = applyCasualties(
      defB,
      powerA * 0.5 * (stB.casualtyTakenMult ?? 1),
      "garrison_first",
    );
    lossesA = applyCasualties(
      assaultA,
      powerB * 0.55 * (stA.casualtyTakenMult ?? 1),
      "assault_first",
    );
    phaseNote =
      (layers.orbital?.shields || 0) > 0
        ? "landing under shields"
        : "landing clear";
  } else if (phase === "ground") {
    const groundA = groupsA.filter((g) => g.kind === "unit" || g.stationary);
    const groundB = groupsB.filter((g) => g.kind === "unit" || g.stationary);
    const fortBonus = 1 + (layers.garrison?.fortBonus || 0) / 80;
    const rolesA = rolePower(groundA);
    const rolesB = rolePower(groundB);
    powerA = totalPower(rolesA, matchups, rolesB) * (stA.powerMult ?? 1);
    powerB =
      totalPower(rolesB, matchups, rolesA) * (stB.powerMult ?? 1) * fortBonus;

    lossesB = applyCasualties(
      groundB,
      powerA * 0.55 * (stB.casualtyTakenMult ?? 1),
      groundA[0]?.targeting || "infantry_first",
    );
    lossesA = applyCasualties(
      groundA,
      powerB * 0.55 * (stA.casualtyTakenMult ?? 1),
      groundB[0]?.targeting || "assault_first",
    );
    persistStationaryCasualties(world, engagement, [...lossesA, ...lossesB]);

    const aliveA = groundA.some((g) => (g.count || 0) > 0);
    const aliveB = groundB.some((g) => (g.count || 0) > 0);
    if (aliveA && !aliveB) outcome = "win_a";
    else if (!aliveA && aliveB) outcome = "win_b";
    else if (!aliveA && !aliveB) outcome = "draw";
    else {
      const share = powerA / Math.max(1, powerA + powerB);
      if (share > 0.58) outcome = "win_a";
      else if (share < 0.42) outcome = "win_b";
      else outcome = "draw";
    }
  } else if (phase === "occupation") {
    // Occupation: claim if attackers still have ground presence and defenders wiped.
    // Stationary wiped in ground phase stay gone (persistStationaryCasualties).
    groupsA = gatherGroups(world, sideA, "assault", content, engagement);
    groupsB = gatherGroups(world, sideB, "assault", content, engagement);
    const aliveA = groupsA.some((g) => (g.count || 0) > 0 && !g.stationary);
    // Wiped stationary stay count 0 / buildings disabled — only remaining forces block.
    const aliveB = groupsB.some((g) => (g.count || 0) > 0);
    powerA = aliveA ? 1 : 0;
    powerB = aliveB ? 1 : 0;
    if (aliveA && !aliveB) outcome = "win_a";
    else if (!aliveA) outcome = "win_b";
    else outcome = "draw";
    continueEngagement = false;
    phaseNote = "occupation";
  }

  cleanupEmptyComposition(world);
  awardVeterancyXp(groupsA, content);
  awardVeterancyXp(groupsB, content);

  const phaseIdx = ASSAULT_PHASES.indexOf(phase);
  const nextPhase =
    phaseIdx >= 0 && phaseIdx < ASSAULT_PHASES.length - 1
      ? ASSAULT_PHASES[phaseIdx + 1]
      : null;

  // Decisive early end
  if (phase === "ground" && (outcome === "win_a" || outcome === "win_b")) {
    // Still run occupation for win_a claim; skip occupation for win_b
    if (outcome === "win_b") {
      continueEngagement = false;
    } else if (nextPhase === "occupation") {
      continueEngagement = true;
    }
  }
  if (phase === "bombard" || phase === "landing") {
    continueEngagement = true;
    outcome = "phase_continue";
  }
  if (!nextPhase) continueEngagement = false;

  return {
    ok: true,
    outcome,
    powerA,
    powerB,
    lossesA,
    lossesB,
    phase,
    nextPhase: continueEngagement ? nextPhase : null,
    continueEngagement,
    phaseNote,
    defenseLayers: layers,
  };
}

export { ASSAULT_PHASES };
