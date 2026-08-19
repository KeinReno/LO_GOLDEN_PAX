/**
 * Build engagements from attack intents + auto war contacts in systems.
 * collectContactsAndAttacks is kept as one function — the fleet/legion attack
 * scan, defender scoping, and both auto-contact passes all share the same
 * `list`/`created`/journal accumulation; splitting it raises real risk for
 * modest line-count benefit (same judgment as the other correctness-critical
 * files today). Extracted from ../engagements.mjs.
 */
import { factionsAtWar as atWar } from "../diplomacyCombat.mjs";
import { canEngageSides } from "../forceKindGuard.mjs";
import {
  isOpenEngagement,
  readEngagements,
  writeEngagements,
  createEngagement,
} from "./store.mjs";
import { applyCardBattleTriggers } from "./cardActions.mjs";

function clearPendingAttackMarker(world, intent, systemId) {
  const fleetId = intent.payload?.fleetId;
  const legionId = intent.payload?.legionId;
  if (fleetId) {
    const f = (world.fleets ?? []).find((x) => x.id === fleetId);
    if (f?.pendingAttackSystemId === systemId) delete f.pendingAttackSystemId;
  }
  if (legionId) {
    const l = (world.legions ?? []).find((x) => x.id === legionId);
    if (l?.pendingAttackSystemId === systemId) delete l.pendingAttackSystemId;
  }
}

function pendingAttackIntents(world) {
  const out = [];
  for (const f of world.fleets ?? []) {
    if (
      f.pendingAttackSystemId &&
      f.systemId === f.pendingAttackSystemId
    ) {
      out.push({
        factionId: f.factionId,
        payload: {
          toSystemId: f.pendingAttackSystemId,
          fleetId: f.id,
          stance: "assault",
          source: "pending_attack",
        },
      });
    }
  }
  for (const l of world.legions ?? []) {
    if (
      l.pendingAttackSystemId &&
      l.systemId === l.pendingAttackSystemId
    ) {
      out.push({
        factionId: l.factionId,
        payload: {
          toSystemId: l.pendingAttackSystemId,
          legionId: l.id,
          theater: "assault",
          stance: "assault",
          source: "pending_attack",
        },
      });
    }
  }
  return out;
}

export function collectContactsAndAttacks(world, turn, attackIntents, journal) {
  const list = readEngagements();
  const created = [];
  const allAttackIntents = [...attackIntents, ...pendingAttackIntents(world)];

  for (const intent of allAttackIntents) {
    const toId = intent.payload?.toSystemId;
    const fleetId = intent.payload?.fleetId;
    const legionId = intent.payload?.legionId;
    if (!toId) continue;
    const sys = (world.systems ?? []).find((s) => s.id === toId);
    if (!sys) continue;

    const theater =
      intent.payload?.theater ||
      (intent.payload?.planetId || intent.payload?.assault
        ? "assault"
        : legionId && !fleetId
          ? "assault"
          : "space");

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

    const targetFleetId = intent.payload?.targetFleetId;
    const targetLegionId = intent.payload?.targetLegionId;
    let defendersFleetsScoped = defendersFleets;
    let defendersLegionsScoped = defendersLegions;
    if (targetFleetId) {
      defendersFleetsScoped = defendersFleets.filter((id) => id === targetFleetId);
      defendersLegionsScoped = [];
    } else if (targetLegionId) {
      defendersLegionsScoped = defendersLegions.filter(
        (id) => id === targetLegionId,
      );
      defendersFleetsScoped = [];
    }

    // Only fleets/legions already at the target system fight this tick (not mid-route).
    const attackerFleets = (
      fleetId
        ? (world.fleets ?? []).filter(
            (f) =>
              f.id === fleetId &&
              f.factionId === intent.factionId &&
              f.systemId === toId,
          )
        : (world.fleets ?? []).filter(
            (f) => f.factionId === intent.factionId && f.systemId === toId,
          )
    ).map((f) => f.id);
    const attackerLegions = (
      legionId
        ? (world.legions ?? []).filter(
            (l) =>
              l.id === legionId &&
              l.factionId === intent.factionId &&
              l.systemId === toId,
          )
        : (world.legions ?? []).filter(
            (l) => l.factionId === intent.factionId && l.systemId === toId,
          )
    ).map((l) => l.id);

    const attackersPresent =
      attackerFleets.length > 0 ||
      (theater === "assault" && attackerLegions.length > 0);
    if (!attackersPresent) {
      journal.push({
        type: "attack_deferred",
        reason: "attacker_not_at_target",
        systemId: toId,
        factionId: intent.factionId,
        fleetId: fleetId || null,
      });
      continue;
    }

    let defFaction =
      defendersFleetsScoped[0] &&
      (world.fleets ?? []).find((f) => f.id === defendersFleetsScoped[0])
        ?.factionId;
    if (!defFaction && defendersLegionsScoped[0]) {
      defFaction = (world.legions ?? []).find(
        (l) => l.id === defendersLegionsScoped[0],
      )?.factionId;
    }
    if (!defFaction) defFaction = sys.ownerFactionId;

    if (!defFaction || defFaction === intent.factionId) {
      sys.activity = "battle";
      journal.push({
        type: "attack_unopposed",
        systemId: toId,
        factionId: intent.factionId,
      });
      const hasPresence =
        (world.fleets ?? []).some(
          (f) => f.factionId === intent.factionId && f.systemId === toId,
        ) ||
        (world.legions ?? []).some(
          (l) => l.factionId === intent.factionId && l.systemId === toId,
        );
      if (
        hasPresence &&
        (theater === "assault" || intent.payload?.claimOnWin)
      ) {
        sys.ownerFactionId = intent.factionId;
      }
      clearPendingAttackMarker(world, intent, toId);
      continue;
    }

    const sideAIds = {
      fleetIds: attackerFleets,
      legionIds: theater === "assault" ? attackerLegions : [],
    };
    const sideBIds = {
      fleetIds: defendersFleetsScoped,
      legionIds: defendersLegionsScoped,
    };
    const planetaryAssault = !!(
      intent.payload?.planetId || intent.payload?.assault
    );
    const kindGate = canEngageSides(sideAIds, sideBIds, {
      allowPlanetaryAssault: planetaryAssault && theater === "assault",
    });
    if (!kindGate.ok) {
      journal.push({
        type: "cross_kind_engage_not_allowed",
        systemId: toId,
        factionId: intent.factionId,
        error: kindGate.error,
      });
      continue;
    }

    const eng = createEngagement({
      theater: theater === "assault" ? "assault" : "space",
      systemId: toId,
      planetId: intent.payload?.planetId || null,
      turn,
      source: "attack_intent",
      world,
      sideA: {
        factionId: intent.factionId,
        fleetIds: attackerFleets,
        legionIds: theater === "assault" ? attackerLegions : [],
        stance: intent.payload?.stance || "assault",
      },
      sideB: {
        factionId: defFaction,
        fleetIds: defendersFleetsScoped,
        legionIds: defendersLegionsScoped,
        stance: defendersFleetsScoped.some((id) => {
          const f = (world.fleets ?? []).find((x) => x.id === id);
          return f?.stance === "fortify";
        })
          ? "fortify"
          : "hold",
      },
    });
    if (
      attackerFleets.length === 0 &&
      defendersFleets.length === 0 &&
      (attackerLegions.length || defendersLegions.length)
    ) {
      eng.theater = "ground";
      eng.phase = undefined;
      eng.defenseLayers = undefined;
      eng.sides[0].legionIds = attackerLegions;
      eng.sides[1].legionIds = defendersLegions;
    }
    list.push(eng);
    created.push(eng);
    applyCardBattleTriggers(world, eng);
    clearPendingAttackMarker(world, intent, toId);
    sys.activity = "battle";
    journal.push({
      type: "engagement_created",
      engagementId: eng.id,
      theater: eng.theater,
      systemId: toId,
      phase: eng.phase || null,
      attacker: intent.factionId,
      defender: defFaction,
      sides: [intent.factionId, defFaction],
      mode: eng.mode,
      cardBattleOffer: !!eng.cardBattleOffer,
    });
  }

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
            isOpenEngagement(e) &&
            e.sides.some((s) => s.factionId === a) &&
            e.sides.some((s) => s.factionId === b),
        );
        if (already) continue;
        const eng = createEngagement({
          theater: "space",
          systemId,
          turn,
          source: "auto_contact",
          world,
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
        applyCardBattleTriggers(world, eng);
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
          sides: [a, b],
          mode: eng.mode,
          cardBattleOffer: !!eng.cardBattleOffer,
        });
      }
    }
  }

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
            isOpenEngagement(e),
        );
        if (already) continue;
        const eng = createEngagement({
          theater: "ground",
          systemId,
          turn,
          source: "auto_contact",
          world,
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
        applyCardBattleTriggers(world, eng);
        journal.push({
          type: "engagement_created",
          engagementId: eng.id,
          theater: "ground",
          systemId,
          attacker: a,
          defender: b,
          sides: [a, b],
          mode: eng.mode,
          cardBattleOffer: !!eng.cardBattleOffer,
        });
      }
    }
  }

  writeEngagements(list);
  return created;
}
