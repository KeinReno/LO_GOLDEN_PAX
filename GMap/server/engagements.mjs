/**
 * Engagement store + contact/resolve pipeline (P5).
 */
import path from "node:path";
import { DATA_DIR, readJson, writeJson, ensureDataDir } from "./tableStore.mjs";
import { resolveEngagementFight, cleanupEmptyComposition } from "./combatResolve.mjs";
import { getContent } from "./contentLoader.mjs";

export const ENGAGEMENTS_PATH = path.join(DATA_DIR, "engagements.json");

export function readEngagements() {
  ensureDataDir();
  const raw = readJson(ENGAGEMENTS_PATH, null);
  return Array.isArray(raw) ? raw : [];
}

export function writeEngagements(list) {
  writeJson(ENGAGEMENTS_PATH, list);
}

function atWar(world, aId, bId) {
  if (!aId || !bId || aId === bId) return false;
  return (world.diplomacy ?? []).some((e) => {
    if (e.relation !== "war") return false;
    return (
      (e.aId === aId && e.bId === bId) || (e.aId === bId && e.bId === aId)
    );
  });
}

export function createEngagement({
  theater,
  systemId,
  planetId,
  sideA,
  sideB,
  turn,
  source,
}) {
  return {
    id: `eng_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    theater: theater || "space",
    systemId,
    planetId: planetId || null,
    turnCreated: turn ?? 0,
    status: "commit",
    source: source || "contact",
    sides: [
      {
        factionId: sideA.factionId,
        fleetIds: sideA.fleetIds || [],
        legionIds: sideA.legionIds || [],
        stance: sideA.stance || "assault",
        locked: true,
      },
      {
        factionId: sideB.factionId,
        fleetIds: sideB.fleetIds || [],
        legionIds: sideB.legionIds || [],
        stance: sideB.stance || "hold",
        locked: true,
      },
    ],
    result: null,
  };
}

function retreatFleet(world, fleetId, fromSystemId) {
  const fleet = (world.fleets ?? []).find((f) => f.id === fleetId);
  if (!fleet) return;
  const routeBack = (fleet.route || [])[0];
  if (routeBack && routeBack !== fromSystemId) {
    fleet.systemId = routeBack;
    fleet.route = [];
    fleet.stance = "move";
    return;
  }
  const neighbors = (world.links ?? [])
    .filter((l) => l.fromId === fromSystemId || l.toId === fromSystemId)
    .map((l) => (l.fromId === fromSystemId ? l.toId : l.fromId));
  const dest = neighbors[0];
  if (dest) {
    fleet.systemId = dest;
    fleet.stance = "move";
  }
}

function applyAftermath(world, eng, fight, journal) {
  const sys = (world.systems ?? []).find((s) => s.id === eng.systemId);
  if (sys) {
    sys.activity = "battle";
    // scar tag via space object
    const objs = new Set(sys.spaceObjects || []);
    objs.add("debris");
    sys.spaceObjects = [...objs];
    if (!sys.poiType || sys.poiType === "none") sys.poiType = "debris";
  }

  const a = eng.sides[0];
  const b = eng.sides[1];

  if (fight.outcome === "retreat_a" || fight.retreated === a.factionId) {
    for (const fid of a.fleetIds || []) retreatFleet(world, fid, eng.systemId);
  }
  if (fight.outcome === "retreat_b" || fight.retreated === b.factionId) {
    for (const fid of b.fleetIds || []) retreatFleet(world, fid, eng.systemId);
  }

  // Assault success: contest / claim planet owner system if win attacker
  if (eng.theater === "assault" && fight.outcome === "win_a" && sys) {
    const prev = sys.ownerFactionId;
    if (prev && prev !== a.factionId) {
      sys.contested = true;
      sys.coOwnerFactionIds = Array.from(
        new Set([...(sys.coOwnerFactionIds || []), a.factionId, prev]),
      );
    } else {
      sys.ownerFactionId = a.factionId;
    }
    // pop hit
    for (const p of sys.planets || []) {
      if ((p.population || 0) > 0) {
        const loss = Math.max(1, Math.floor(p.population * 0.08));
        p.population = Math.max(0, p.population - loss);
      }
    }
  }

  if (eng.theater === "space" && (a.stance === "bombard" || eng.source === "bombard")) {
    if (sys) {
      for (const p of sys.planets || []) {
        if ((p.population || 0) > 0) {
          const loss = Math.max(1, Math.floor(p.population * 0.05));
          p.population = Math.max(0, p.population - loss);
        }
      }
    }
  }

  journal.push({
    type: "engagement_resolved",
    engagementId: eng.id,
    theater: eng.theater,
    systemId: eng.systemId,
    outcome: fight.outcome,
    powerA: Math.round(fight.powerA || 0),
    powerB: Math.round(fight.powerB || 0),
    lossesA: fight.lossesA,
    lossesB: fight.lossesB,
    sides: eng.sides.map((s) => s.factionId),
  });
}

export function resolveOpenEngagements(world, journal) {
  const list = readEngagements();
  const open = list.filter((e) => e.status === "commit" || e.status === "contact");
  for (const eng of open) {
    const fight = resolveEngagementFight(world, eng);
    if (!fight.ok) {
      eng.status = "cancelled";
      eng.result = fight;
      journal.push({
        type: "engagement_cancelled",
        engagementId: eng.id,
        reason: fight.error,
      });
      continue;
    }
    eng.status = "resolved";
    eng.result = fight;
    applyAftermath(world, eng, fight, journal);
  }
  cleanupEmptyComposition(world);
  writeEngagements(list);
  return open.length;
}

/**
 * Build engagements from attack intent + auto war contacts in systems.
 */
export function collectContactsAndAttacks(world, turn, attackIntents, journal) {
  const list = readEngagements();
  const created = [];

  for (const intent of attackIntents) {
    const toId = intent.payload?.toSystemId;
    const fleetId = intent.payload?.fleetId;
    if (!toId) continue;
    const sys = (world.systems ?? []).find((s) => s.id === toId);
    if (!sys) continue;

    const theater =
      intent.payload?.theater ||
      (intent.payload?.planetId || intent.payload?.assault ? "assault" : "space");

    // Move already applied; find defender fleets/legions
    const defendersFleets = (world.fleets ?? [])
      .filter(
        (f) =>
          f.systemId === toId &&
          f.factionId !== intent.factionId &&
          (atWar(world, intent.factionId, f.factionId) ||
            sys.ownerFactionId === f.factionId),
      )
      .map((f) => f.id);
    const defendersLegions = (world.legions ?? [])
      .filter(
        (l) =>
          l.systemId === toId &&
          l.factionId !== intent.factionId &&
          (atWar(world, intent.factionId, l.factionId) ||
            sys.ownerFactionId === l.factionId),
      )
      .map((l) => l.id);

    const attackerFleets = fleetId
      ? [fleetId]
      : (world.fleets ?? [])
          .filter((f) => f.factionId === intent.factionId && f.systemId === toId)
          .map((f) => f.id);
    const attackerLegions = (world.legions ?? [])
      .filter((l) => l.factionId === intent.factionId && l.systemId === toId)
      .map((l) => l.id);

    let defFaction =
      defendersFleets[0] &&
      (world.fleets ?? []).find((f) => f.id === defendersFleets[0])?.factionId;
    if (!defFaction && defendersLegions[0]) {
      defFaction = (world.legions ?? []).find(
        (l) => l.id === defendersLegions[0],
      )?.factionId;
    }
    if (!defFaction) defFaction = sys.ownerFactionId;

    if (!defFaction || defFaction === intent.factionId) {
      // empty system claim-like attack
      sys.activity = "battle";
      journal.push({
        type: "attack_unopposed",
        systemId: toId,
        factionId: intent.factionId,
      });
      if (theater === "assault" || intent.payload?.claimOnWin) {
        sys.ownerFactionId = intent.factionId;
      }
      continue;
    }

    const eng = createEngagement({
      theater: theater === "assault" ? "assault" : "space",
      systemId: toId,
      planetId: intent.payload?.planetId || null,
      turn,
      source: "attack_intent",
      sideA: {
        factionId: intent.factionId,
        fleetIds: attackerFleets,
        legionIds: theater === "assault" ? attackerLegions : [],
        stance: intent.payload?.stance || "assault",
      },
      sideB: {
        factionId: defFaction,
        fleetIds: defendersFleets,
        legionIds:
          theater === "assault" || theater === "ground"
            ? defendersLegions
            : defendersLegions,
        stance: "hold",
      },
    });
    // ground-only if only legions
    if (
      attackerFleets.length === 0 &&
      defendersFleets.length === 0 &&
      (attackerLegions.length || defendersLegions.length)
    ) {
      eng.theater = "ground";
      eng.sides[0].legionIds = attackerLegions;
      eng.sides[1].legionIds = defendersLegions;
    }
    list.push(eng);
    created.push(eng);
    sys.activity = "battle";
    journal.push({
      type: "engagement_created",
      engagementId: eng.id,
      theater: eng.theater,
      systemId: toId,
      attacker: intent.factionId,
      defender: defFaction,
    });
  }

  // Auto contacts: same system, war, both have fleets
  const bySys = new Map();
  for (const f of world.fleets ?? []) {
    if (!bySys.has(f.systemId)) bySys.set(f.systemId, []);
    bySys.get(f.systemId).push(f);
  }
  for (const [systemId, fleets] of bySys) {
    const facs = [...new Set(fleets.map((f) => f.factionId))];
    if (facs.length < 2) continue;
    for (let i = 0; i < facs.length; i++) {
      for (let j = i + 1; j < facs.length; j++) {
        const a = facs[i];
        const b = facs[j];
        if (!atWar(world, a, b)) continue;
        const already = list.some(
          (e) =>
            e.systemId === systemId &&
            (e.status === "commit" || e.status === "contact") &&
            e.sides.some((s) => s.factionId === a) &&
            e.sides.some((s) => s.factionId === b),
        );
        if (already) continue;
        const eng = createEngagement({
          theater: "space",
          systemId,
          turn,
          source: "auto_contact",
          sideA: {
            factionId: a,
            fleetIds: fleets.filter((f) => f.factionId === a).map((f) => f.id),
            stance: "hold",
          },
          sideB: {
            factionId: b,
            fleetIds: fleets.filter((f) => f.factionId === b).map((f) => f.id),
            stance: "hold",
          },
        });
        list.push(eng);
        created.push(eng);
        const sys = (world.systems ?? []).find((s) => s.id === systemId);
        if (sys) sys.activity = "battle";
        journal.push({
          type: "engagement_created",
          engagementId: eng.id,
          theater: "space",
          systemId,
          attacker: a,
          defender: b,
          source: "auto_contact",
        });
      }
    }
  }

  // Legion ground contacts
  const legBySys = new Map();
  for (const l of world.legions ?? []) {
    if (!legBySys.has(l.systemId)) legBySys.set(l.systemId, []);
    legBySys.get(l.systemId).push(l);
  }
  for (const [systemId, legs] of legBySys) {
    const facs = [...new Set(legs.map((l) => l.factionId))];
    if (facs.length < 2) continue;
    for (let i = 0; i < facs.length; i++) {
      for (let j = i + 1; j < facs.length; j++) {
        const a = facs[i];
        const b = facs[j];
        if (!atWar(world, a, b)) continue;
        const already = list.some(
          (e) =>
            e.systemId === systemId &&
            e.theater === "ground" &&
            (e.status === "commit" || e.status === "contact"),
        );
        if (already) continue;
        const eng = createEngagement({
          theater: "ground",
          systemId,
          turn,
          source: "auto_contact",
          sideA: {
            factionId: a,
            legionIds: legs.filter((l) => l.factionId === a).map((l) => l.id),
            stance: "assault",
          },
          sideB: {
            factionId: b,
            legionIds: legs.filter((l) => l.factionId === b).map((l) => l.id),
            stance: "hold",
          },
        });
        list.push(eng);
        created.push(eng);
        journal.push({
          type: "engagement_created",
          engagementId: eng.id,
          theater: "ground",
          systemId,
          attacker: a,
          defender: b,
        });
      }
    }
  }

  writeEngagements(list);
  return created;
}

export function setEngagementStance(engagementId, factionId, stance) {
  const content = getContent();
  if (!content.combat_stances?.[stance]) {
    return { ok: false, error: "unknown stance" };
  }
  const list = readEngagements();
  const eng = list.find((e) => e.id === engagementId);
  if (!eng || (eng.status !== "commit" && eng.status !== "contact")) {
    return { ok: false, error: "engagement not open" };
  }
  const side = eng.sides.find((s) => s.factionId === factionId);
  if (!side) return { ok: false, error: "not a side" };
  side.stance = stance;
  side.locked = true;
  writeEngagements(list);
  return { ok: true, engagement: eng };
}
