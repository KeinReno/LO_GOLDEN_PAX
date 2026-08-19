/**
 * Planetary defense: stationary garrison units spawned from defense/barracks
 * buildings, and the layered orbital/surface degrade counters used by the
 * assault-phase resolver. Extracted from ../combatResolve.mjs.
 */
import { logisticsCombatDefMult } from "../logistics.mjs";
import { unitDef } from "./properties.mjs";

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

export function degradeDefenseLayers(layers, power, phase) {
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
