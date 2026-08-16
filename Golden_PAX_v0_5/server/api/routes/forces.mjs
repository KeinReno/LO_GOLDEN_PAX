import { Router } from "express";
import { getDb } from "../../db/store.mjs";
import { getContent } from "../../contentLoader.mjs";
import { getCurrentTurn, bumpTableRevision, listFactions } from "../../campaign/campaignStore.mjs";
import { loadEconomyAccount, saveEconomyAccount } from "../../campaign/economyStore.mjs";
import { loadSystemWithPlanets, loadPlanet, savePlanet, listSystemsWithPlanets, getSystem } from "../../campaign/planetStore.mjs";
import { createForce, loadForce, listFactionForces, listCampaignForces, saveForce, deleteForce, transferForceFaction } from "../../campaign/forcesStore.mjs";
import { listSystemLinks } from "../../campaign/systemLinksStore.mjs";
import { loadRelations } from "../../campaign/diplomacyStore.mjs";
import { raiseUnit, disbandUnits, reduceComposition } from "../../domain/forces/recruitment.mjs";
import { loadTechAccount } from "../../campaign/techStore.mjs";
import { loadFactionCourt } from "../../campaign/npcStore.mjs";
import { collectCourtActiveEffects } from "../../domain/court/courtActiveEffects.mjs";
import { collectTechModifierEffects } from "../../domain/tech/techModifierEffects.mjs";
import { canEngage, forceAfterExchange, resolveEngageSystemId } from "../../domain/forces/engage.mjs";
import { shouldOccupyAfterEngage, shouldOccupyEmptySystem } from "../../domain/forces/occupation.mjs";
import { persistOccupation } from "../../campaign/occupy.mjs";
import { appendTickEvent } from "../../campaign/tickJournalStore.mjs";
import { canBoard, resolveBoarding } from "../../domain/combat/boarding.mjs";
import { resolveUntilDecisive } from "../../domain/combat/resolveExchange.mjs";
import { spaceObjectCombatModifier } from "../../domain/planets/spaceObjects.mjs";
import { computeLogisticsNetwork } from "../../domain/systems/logistics.mjs";
import { completeForceTravel, maxMovementPoints, tiersFromDef } from "../../domain/forces/movement.mjs";
import { isRebelOccupyingForce } from "../../campaign/stabilityStore.mjs";
import {
  RaiseUnitRequestSchema,
  RaiseUnitResponseSchema,
  DisbandForceRequestSchema,
  DisbandForceResponseSchema,
  ListForcesResponseSchema,
  EngageForcesRequestSchema,
  EngageForcesResponseSchema,
  BoardForceRequestSchema,
  BoardForceResponseSchema,
  MoveForceRequestSchema,
  MoveForceResponseSchema,
} from "../contract/forces.mjs";
import { requireActor, actorCanActForFaction } from "../auth.mjs";
import { parseBody } from "../validate.mjs";

function courtArgs(db, campaignId, factionId, content) {
  const court = loadFactionCourt(db, campaignId, factionId, content);
  return [court, court.npcs, content, { factionId }];
}

/**
 * Where legions/fleets actually come from (domain/forces/*.mjs, see its
 * README) — raising, disbanding, and engaging units. Faction-scoped player
 * actions, same auth pattern as domain/planets' colonize/build routes.
 */
export function forcesRouter() {
  const router = Router();

  router.post("/campaign/:campaignId/systems/:systemId/planets/:planetId/forces", (req, res) => {
    const { campaignId, systemId, planetId } = req.params;
    const db = getDb();
    const system = loadSystemWithPlanets(db, campaignId, systemId);
    const planet = system?.planets.find((p) => p.id === planetId);
    if (!system || !planet) return res.status(404).json({ error: "not_found" });
    if (!planet.ownerFactionId) return res.status(400).json({ error: "planet_not_colonized" });

    const actor = requireActor(req, res);
    if (!actor) return;
    if (!actorCanActForFaction(actor, planet.ownerFactionId)) {
      return res.status(403).json({ error: "forbidden_faction" });
    }

    const body = parseBody(RaiseUnitRequestSchema, req, res);
    if (!body) return;

    const content = getContent();
    const catalog = body.kind === "ship" ? content.ships : content.units;
    const def = catalog?.[body.defId];
    if (!def) return res.status(400).json({ error: "unknown_def" });

    const factionId = planet.ownerFactionId;
    const eco = loadEconomyAccount(db, campaignId, factionId);
    const techAccount = loadTechAccount(db, campaignId, factionId);
    const result = raiseUnit(system, planet, def, body.kind, factionId, body.count, eco.stocks, content, {
      overrideCeiling: body.overrideCeiling === true,
      techAccount,
    });
    if (result.ok) {
      savePlanet(db, campaignId, result.planet);
      saveEconomyAccount(db, campaignId, factionId, { ...eco, stocks: result.stocks }, { turn: getCurrentTurn(db, campaignId) ?? 0, journal: result.journal });
      const kind = body.kind === "ship" ? "fleet" : "legion";
      const tiers = tiersFromDef(def);
      const seed = { kind, ...tiers };
      const force = createForce(db, campaignId, {
        factionId,
        kind,
        name: body.name || def.name || def.id,
        homePlanetId: planet.id,
        systemId,
        engineTier: tiers.engineTier,
        fuelTier: tiers.fuelTier,
        movementPoints: maxMovementPoints(seed, content),
        composition: [result.group],
      });
      bumpTableRevision(db, campaignId);
      return res.json(RaiseUnitResponseSchema.parse({ ok: true, planet: result.planet, stocks: result.stocks, journal: result.journal, force }));
    }
    res.json(RaiseUnitResponseSchema.parse(result));
  });

  router.get("/campaign/:campaignId/factions/:factionId/forces", (req, res) => {
    const actor = requireActor(req, res);
    if (!actor) return;
    const { campaignId, factionId } = req.params;
    if (!actorCanActForFaction(actor, factionId)) {
      return res.status(403).json({ error: "forbidden_faction" });
    }
    const db = getDb();
    res.json(ListForcesResponseSchema.parse({ forces: listFactionForces(db, campaignId, factionId) }));
  });

  router.post("/campaign/:campaignId/forces/:forceId/move", (req, res) => {
    const { campaignId, forceId } = req.params;
    const db = getDb();
    const force = loadForce(db, campaignId, forceId);
    if (!force) return res.status(404).json({ error: "not_found" });

    const actor = requireActor(req, res);
    if (!actor) return;
    if (!actorCanActForFaction(actor, force.factionId)) {
      return res.status(403).json({ error: "forbidden_faction" });
    }

    const body = parseBody(MoveForceRequestSchema, req, res);
    if (!body) return;
    if (!getSystem(db, campaignId, body.toSystemId)) {
      return res.status(404).json({ error: "system_not_found" });
    }

    const content = getContent();
    const world = { links: listSystemLinks(db, campaignId) };
    const travel = completeForceTravel(world, force, body.toSystemId, content, {
      effects: [
        ...collectCourtActiveEffects(...courtArgs(db, campaignId, force.factionId, content)),
        ...collectTechModifierEffects(loadTechAccount(db, campaignId, force.factionId), content),
      ],
    });
    const payload = { ...travel, hops: Number.isFinite(travel.hops) ? travel.hops : undefined };
    if (!travel.ok) {
      return res.status(400).json(MoveForceResponseSchema.parse(payload));
    }
    saveForce(db, campaignId, travel.force);
    const dest = getSystem(db, campaignId, body.toSystemId);
    const occupierId = shouldOccupyEmptySystem({
      force: travel.force,
      system: dest,
      remainingForces: listCampaignForces(db, campaignId),
    });
    if (occupierId) {
      const occ = persistOccupation(db, campaignId, body.toSystemId, occupierId);
      if (occ.ok) {
        appendTickEvent(db, campaignId, getCurrentTurn(db, campaignId) ?? 0, "occupy", {
          systemId: body.toSystemId,
          factionId: occupierId,
        });
      }
    }
    appendTickEvent(db, campaignId, getCurrentTurn(db, campaignId) ?? 0, "move", {
      factionId: force.factionId,
      forceId: force.id,
      fromSystemId: force.systemId,
      toSystemId: body.toSystemId,
    });
    bumpTableRevision(db, campaignId);
    res.json(MoveForceResponseSchema.parse(payload));
  });

  // Disbanding returns that much population to the force's home planet
  // (recruitment.mjs's disbandUnits — see its header for what this does and
  // doesn't do, e.g. no currency refund). Omitting `count` and `defId`
  // disbands the whole force. Optional `defId` targets one composition group.
  router.post("/campaign/:campaignId/forces/:forceId/disband", (req, res) => {
    const { campaignId, forceId } = req.params;
    const db = getDb();
    const force = loadForce(db, campaignId, forceId);
    if (!force) return res.status(404).json({ error: "not_found" });

    const actor = requireActor(req, res);
    if (!actor) return;
    if (!actorCanActForFaction(actor, force.factionId)) {
      return res.status(403).json({ error: "forbidden_faction" });
    }

    const body = parseBody(DisbandForceRequestSchema, req, res);
    if (!body) return;

    const reduced = reduceComposition(force.composition, body.count, body.defId);
    if (!reduced.ok) return res.status(400).json({ error: reduced.error });

    // homePlanetId alone doesn't carry its systemId, so look it up directly.
    const homePlanet = findPlanetById(db, campaignId, force.homePlanetId);

    let updatedPlanet = null;
    if (homePlanet && reduced.disbandedCount > 0) {
      updatedPlanet = disbandUnits(homePlanet, reduced.disbandedCount);
      savePlanet(db, campaignId, updatedPlanet);
    }

    if (reduced.composition.length === 0) {
      deleteForce(db, campaignId, forceId);
      bumpTableRevision(db, campaignId);
      return res.json(DisbandForceResponseSchema.parse({ ok: true, planet: updatedPlanet ?? undefined, force: null }));
    }

    const nextForce = { ...force, composition: reduced.composition };
    saveForce(db, campaignId, nextForce);
    bumpTableRevision(db, campaignId);
    res.json(DisbandForceResponseSchema.parse({ ok: true, planet: updatedPlanet ?? undefined, force: nextForce }));
  });

  // Wire a raised force into domain/combat's resolveExchange and persist
  // the casualties. Caller must be able to act for force A's faction;
  // force B is just the other side (mirrors the stateless combat preview).
  // Combat loss is not a disband — wiped forces are deleted with no
  // population returned to any planet.
  router.post("/campaign/:campaignId/forces/:forceAId/engage", (req, res) => {
    const { campaignId, forceAId } = req.params;
    const db = getDb();
    const forceA = loadForce(db, campaignId, forceAId);
    if (!forceA) return res.status(404).json({ error: "not_found" });

    const actor = requireActor(req, res);
    if (!actor) return;
    if (!actorCanActForFaction(actor, forceA.factionId)) {
      return res.status(403).json({ error: "forbidden_faction" });
    }

    const body = parseBody(EngageForcesRequestSchema, req, res);
    if (!body) return;

    const forceB = loadForce(db, campaignId, body.forceBId);
    if (!forceB) return res.status(404).json({ error: "not_found" });
    if (forceA.id === forceB.id) return res.status(400).json({ error: "same_force" });
    const kindGate = canEngage(forceA, forceB);
    if (!kindGate.ok) return res.status(400).json({ error: kindGate.error });

    const content = getContent();
    const rebelOccupying = isRebelOccupyingForce(db, campaignId, forceB.id);
    const stanceB = body.stanceB || (rebelOccupying ? "retreat" : undefined);
    let powerMultA = 1;
    let powerMultB = 1;
    let combatSystem;
    const systemId = resolveEngageSystemId(body, forceA, forceB);
    if (systemId) {
      const world = {
        systems: listSystemsWithPlanets(db, campaignId),
        links: listSystemLinks(db, campaignId),
        factions: listFactions(db, campaignId),
        relations: loadRelations(db, campaignId),
      };
      combatSystem = world.systems.find((s) => s.id === systemId);
      if (!combatSystem) return res.status(404).json({ error: "system_not_found" });
      powerMultA = spaceObjectCombatModifier(combatSystem, content, forceA.factionId);
      powerMultB = spaceObjectCombatModifier(combatSystem, content, forceB.factionId);
      if (combatSystem.ownerFactionId) computeLogisticsNetwork(world, combatSystem.ownerFactionId, content);
    }

    const result = resolveUntilDecisive(
      forceA.composition,
      forceB.composition,
      {
        stanceA: body.stanceA,
        stanceB,
        factionIdA: forceA.factionId,
        factionIdB: forceB.factionId,
        powerMultA,
        powerMultB,
        system: combatSystem,
        techAccountA: loadTechAccount(db, campaignId, forceA.factionId),
        techAccountB: loadTechAccount(db, campaignId, forceB.factionId),
        courtEffectsA: collectCourtActiveEffects(
          ...courtArgs(db, campaignId, forceA.factionId, content),
        ),
        courtEffectsB: collectCourtActiveEffects(
          ...courtArgs(db, campaignId, forceB.factionId, content),
        ),
        forceIdA: forceA.id,
        forceIdB: forceB.id,
      },
      content,
    );
    if (!result.ok) return res.json(EngageForcesResponseSchema.parse(result));

    const nextA = forceAfterExchange(forceA, result.groupsA);
    const nextB = forceAfterExchange(forceB, result.groupsB);
    const deletedForceIds = [];
    if (nextA.deleted) {
      deleteForce(db, campaignId, forceA.id);
      deletedForceIds.push(forceA.id);
    } else {
      saveForce(db, campaignId, nextA.force);
    }
    if (nextB.deleted) {
      deleteForce(db, campaignId, forceB.id);
      deletedForceIds.push(forceB.id);
    } else {
      saveForce(db, campaignId, nextB.force);
    }

    const remainingForces = listCampaignForces(db, campaignId);
    const occupierId = shouldOccupyAfterEngage({
      outcome: result.outcome,
      forceA,
      forceB,
      remainingForces,
    });
    let occupied = false;
    if (occupierId && forceA.systemId) {
      const occ = persistOccupation(db, campaignId, forceA.systemId, occupierId);
      occupied = occ.ok === true;
      if (occupied) {
        appendTickEvent(db, campaignId, getCurrentTurn(db, campaignId) ?? 0, "occupy", {
          systemId: forceA.systemId,
          factionId: occupierId,
        });
      }
    }
    appendTickEvent(db, campaignId, getCurrentTurn(db, campaignId) ?? 0, "combat", {
      outcome: result.outcome,
      attacker: forceA.factionId,
      defender: forceB.factionId,
      systemId: forceA.systemId,
      sides: [forceA.factionId, forceB.factionId],
    });
    bumpTableRevision(db, campaignId);

    res.json(
      EngageForcesResponseSchema.parse({
        ...result,
        deletedForceIds,
        forceA: nextA.force,
        forceB: nextB.force,
        occupied,
        ownerFactionId: occupierId || undefined,
      }),
    );
  });

  // Boarding is the one cross-kind exception — its own action, not a flag
  // on engage. Domain owns the rule (canBoard / resolveBoarding); this
  // route persists capture + casualties. Caller supplies systemId with the
  // same trust-the-caller pattern as engage (no independent location
  // tracking in this project).
  router.post("/campaign/:campaignId/forces/:legionForceId/board", (req, res) => {
    const { campaignId, legionForceId } = req.params;
    const db = getDb();
    const legionForce = loadForce(db, campaignId, legionForceId);
    if (!legionForce) return res.status(404).json({ error: "not_found" });

    const actor = requireActor(req, res);
    if (!actor) return;
    if (!actorCanActForFaction(actor, legionForce.factionId)) {
      return res.status(403).json({ error: "forbidden_faction" });
    }

    const body = parseBody(BoardForceRequestSchema, req, res);
    if (!body) return;

    const fleetForce = loadForce(db, campaignId, body.targetFleetForceId);
    if (!fleetForce) return res.status(404).json({ error: "not_found" });
    const boardGate = canBoard(legionForce, fleetForce);
    if (!boardGate.ok) return res.status(400).json({ error: boardGate.error });

    if (body.systemId) {
      const system = loadSystemWithPlanets(db, campaignId, body.systemId);
      if (!system) return res.status(404).json({ error: "system_not_found" });
    }

    const result = resolveBoarding(legionForce, fleetForce, getContent());
    if (!result.ok) return res.status(400).json({ error: result.error });

    const nextLegion = forceAfterExchange(legionForce, result.groupsA);
    const deletedForceIds = [];
    if (nextLegion.deleted) {
      deleteForce(db, campaignId, legionForce.id);
      deletedForceIds.push(legionForce.id);
    } else {
      saveForce(db, campaignId, nextLegion.force);
    }

    let nextFleet = { ...fleetForce, composition: result.fleetComposition };
    if (result.captured) {
      transferForceFaction(db, campaignId, fleetForce.id, legionForce.factionId);
      nextFleet = { ...nextFleet, factionId: legionForce.factionId };
    }
    saveForce(db, campaignId, nextFleet);
    bumpTableRevision(db, campaignId);

    res.json(
      BoardForceResponseSchema.parse({
        ...result,
        deletedForceIds,
        forceA: nextLegion.force,
        forceB: nextFleet,
      }),
    );
  });

  return router;
}

function findPlanetById(db, campaignId, planetId) {
  if (!planetId) return null;
  const row = db.prepare("SELECT system_id as systemId FROM planets WHERE campaign_id = ? AND id = ?").get(campaignId, planetId);
  return row ? loadPlanet(db, row.systemId, planetId) : null;
}
