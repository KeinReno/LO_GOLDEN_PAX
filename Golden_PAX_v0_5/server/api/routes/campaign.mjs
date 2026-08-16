import { Router } from "express";
import { getDb } from "../../db/store.mjs";
import { getContent } from "../../contentLoader.mjs";
import { createCampaign, getCampaign, listLoginCampaigns, addFaction, getFaction, getFactionById, listFactions, getCurrentTurn, getTableRevision, bumpTableRevision } from "../../campaign/campaignStore.mjs";
import { seedFactionAccounts } from "../../campaign/seed.mjs";
import { loadEconomyAccount, saveEconomyAccount } from "../../campaign/economyStore.mjs";
import { loadTechAccount, saveTechAccount } from "../../campaign/techStore.mjs";
import { loadCivicAccount } from "../../campaign/civicStore.mjs";
import { loadDiplomacyAccount, saveDiplomacyAccount, loadRelations, setRelation as setRelationRow } from "../../campaign/diplomacyStore.mjs";
import { loadFactionCourt } from "../../campaign/npcStore.mjs";
import { loadStability, listFactionRevolts } from "../../campaign/stabilityStore.mjs";
import { loadFxExchangeState } from "../../campaign/fxExchangeStore.mjs";
import { runCampaignTurn } from "../../campaign/turn.mjs";
import { researchTech } from "../../domain/tech/researchTech.mjs";
import { upgradeTechGrade } from "../../domain/tech/techGrade.mjs";
import { fillTechSocket } from "../../domain/tech/techSocket.mjs";
import { ensureOffers, rerollOffer } from "../../domain/tech/techOffers.mjs";
import { syncTreatiesFromEdge, stanceTrack } from "../../domain/diplomacy/treaties.mjs";
import { createSystem, getSystem, updateSystem, createPlanet, loadPlanet, loadSystemWithPlanets, listSystemsWithPlanets, listFactionPlanets, savePlanet, addSpaceObject, deleteSpaceObject } from "../../campaign/planetStore.mjs";
import { listSystemLinks, createSystemLink, deleteSystemLink, replaceOutgoingLinks } from "../../campaign/systemLinksStore.mjs";
import { listSectors } from "../../campaign/sectorStore.mjs";
import { listCampaignForces } from "../../campaign/forcesStore.mjs";
import { loadLastTickJournal, appendTickEvent } from "../../campaign/tickJournalStore.mjs";
import { colonizePlanet } from "../../domain/planets/colonization.mjs";
import { placeBuilding } from "../../domain/planets/construction.mjs";
import { resolvePlanetResources } from "../../domain/planets/depositGeneration.mjs";
import { upgradeOrbitalGrade, upgradeSurfaceGrade } from "../../domain/planets/planetGrade.mjs";
import { instantiateSpaceObject } from "../../domain/planets/spaceObjects.mjs";
import {
  CreateCampaignRequestSchema,
  CreateCampaignResponseSchema,
  AddFactionRequestSchema,
  AddFactionResponseSchema,
  CampaignStateResponseSchema,
  CampaignListResponseSchema,
  RunTurnRequestSchema,
  RunTurnResponseSchema,
  SetRelationRequestSchema,
  SetRelationResponseSchema,
  PersistedResearchRequestSchema,
  PersistedResearchResponseSchema,
  FillTechSocketRequestSchema,
  TechAccountActionResponseSchema,
  TechDirectionSchema,
  CreateSystemRequestSchema,
  UpdateSystemRequestSchema,
  AddSystemLinkRequestSchema,
  CreatePlanetRequestSchema,
  ColonizeRequestSchema,
  BuildRequestSchema,
  UpgradeGradeRequestSchema,
  AddSpaceObjectRequestSchema,
  PlanetActionResponseSchema,
} from "../contract/campaign.mjs";
import { requireGm, requireActor, actorCanActForFaction } from "../auth.mjs";
import { parseBody } from "../validate.mjs";

/**
 * The persisted campaign layer: wraps the same domain functions every
 * other route uses (server/domain/*) with load/save through
 * server/campaign/*Store.mjs instead of round-tripping full state through
 * the client on every call. See server/campaign/turn.mjs's header for
 * what the turn orchestrator does and doesn't cover yet.
 *
 * Campaign/faction setup is GM-only throughout — a player doesn't create
 * campaigns or seats, they're invited into one.
 */
export function campaignRouter() {
  const router = Router();

  router.get("/campaigns", (_req, res) => {
    const db = getDb();
    res.json(CampaignListResponseSchema.parse({ campaigns: listLoginCampaigns(db) }));
  });

  router.post("/campaign", (req, res) => {
    if (!requireGm(req, res)) return;
    const body = parseBody(CreateCampaignRequestSchema, req, res);
    if (!body) return;

    const db = getDb();
    if (body.id && getCampaign(db, body.id)) return res.status(409).json({ error: "campaign_already_exists" });

    const campaign = createCampaign(db, body);
    bumpTableRevision(db, campaign.id);
    res.json(CreateCampaignResponseSchema.parse(campaign));
  });

  router.post("/campaign/:campaignId/factions", (req, res) => {
    if (!requireGm(req, res)) return;
    const body = parseBody(AddFactionRequestSchema, req, res);
    if (!body) return;

    const db = getDb();
    const { campaignId } = req.params;
    if (!getCampaign(db, campaignId)) return res.status(404).json({ error: "campaign_not_found" });
    if (getFactionById(db, body.id)) return res.status(409).json({ error: "faction_already_exists" });

    let faction;
    try {
      faction = addFaction(db, campaignId, body);
    } catch (err) {
      if (err?.code === "SQLITE_CONSTRAINT_UNIQUE" || /UNIQUE constraint failed/i.test(String(err?.message || ""))) {
        return res.status(409).json({ error: "faction_already_exists" });
      }
      throw err;
    }
    seedFactionAccounts(db, campaignId, faction.id, getContent());
    bumpTableRevision(db, campaignId);
    res.json(AddFactionResponseSchema.parse(faction));
  });

  router.get("/campaign/:campaignId/state", (req, res) => {
    if (!requireGm(req, res)) return;

    const db = getDb();
    const { campaignId } = req.params;
    const campaign = getCampaign(db, campaignId);
    if (!campaign) return res.status(404).json({ error: "campaign_not_found" });

    const factions = listFactions(db, campaignId).map((faction) => {
      const factionPlanets = listFactionPlanets(db, campaignId, faction.id);
      let tech = loadTechAccount(db, campaignId, faction.id);
      if (tech) {
        const ensured = ensureOffers(tech, getContent(), { factionPlanets });
        if (ensured.changed) {
          saveTechAccount(db, campaignId, faction.id, ensured.techAccount, { turn: getCurrentTurn(db, campaignId) ?? 0 });
        }
        tech = ensured.techAccount;
      }
      return {
        faction,
        economy: loadEconomyAccount(db, campaignId, faction.id),
        tech,
        civic: loadCivicAccount(db, campaignId, faction.id),
        diplomacy: loadDiplomacyAccount(db, campaignId, faction.id),
        court: loadFactionCourt(db, campaignId, faction.id, getContent()),
        stability: loadStability(db, campaignId, faction.id, getContent()),
        revolts: listFactionRevolts(db, campaignId, faction.id),
      };
    });

    res.json(
      CampaignStateResponseSchema.parse({
        campaign,
        currentTurn: getCurrentTurn(db, campaignId) ?? 0,
        tableRevision: getTableRevision(db, campaignId),
        factions,
        relations: loadRelations(db, campaignId),
        systems: listSystemsWithPlanets(db, campaignId),
        links: listSystemLinks(db, campaignId),
        sectors: listSectors(db, campaignId),
        fx: loadFxExchangeState(db, campaignId),
        forces: listCampaignForces(db, campaignId),
        journal: loadLastTickJournal(db, campaignId),
      }),
    );
  });

  router.post("/campaign/:campaignId/turn", (req, res) => {
    if (!requireGm(req, res)) return;
    const body = parseBody(RunTurnRequestSchema, req, res);
    if (!body) return;

    const db = getDb();
    const { campaignId } = req.params;
    if (!getCampaign(db, campaignId)) return res.status(404).json({ error: "campaign_not_found" });

    const result = runCampaignTurn(db, campaignId, getContent(), body.factionInputs);
    res.json(RunTurnResponseSchema.parse(result));
  });

  // Sets the relation both in diplomacy_relations (what opinion.mjs's
  // tickOpinions reads next turn) and syncs the bilateral treaty records
  // (domain/diplomacy/treaties.mjs) so relation-granted effects apply
  // immediately, not just from the next tick onward.
  router.post("/campaign/:campaignId/relations", (req, res) => {
    if (!requireGm(req, res)) return;
    const body = parseBody(SetRelationRequestSchema, req, res);
    if (!body) return;

    const db = getDb();
    const { campaignId } = req.params;
    const { factionAId, factionBId, relation, turn } = body;
    const factionA = { id: factionAId, diplomacy: loadDiplomacyAccount(db, campaignId, factionAId) };
    const factionB = { id: factionBId, diplomacy: loadDiplomacyAccount(db, campaignId, factionBId) };
    if (!factionA.diplomacy || !factionB.diplomacy) return res.status(404).json({ error: "faction_not_found" });

    const content = getContent();
    const stances = content.diplomacy_stances || {};
    const result = syncTreatiesFromEdge(factionA, factionB, relation, turn ?? getCurrentTurn(db, campaignId) ?? 0, stances);
    // Economic relations live on the treaty track only — writing them into
    // diplomacy_relations would overwrite the political edge opinion.mjs reads.
    if (stanceTrack(stances[relation]) !== "economic") {
      setRelationRow(db, campaignId, factionAId, factionBId, relation);
    }
    saveDiplomacyAccount(db, campaignId, factionAId, result.factionA.diplomacy);
    saveDiplomacyAccount(db, campaignId, factionBId, result.factionB.diplomacy);
    bumpTableRevision(db, campaignId);

    res.json(SetRelationResponseSchema.parse({ factionA: result.factionA, factionB: result.factionB }));
  });

  // --- World: systems/planets (domain/planets/*, see its README) ---
  // Worldgen (create a system/planet) is GM-only, same reasoning as
  // faction setup. Colonize/build are faction-scoped player actions.

  router.post("/campaign/:campaignId/systems", (req, res) => {
    if (!requireGm(req, res)) return;
    const body = parseBody(CreateSystemRequestSchema, req, res);
    if (!body) return;

    const db = getDb();
    const { campaignId } = req.params;
    if (!getCampaign(db, campaignId)) return res.status(404).json({ error: "campaign_not_found" });
    if (getSystem(db, campaignId, body.id)) return res.status(409).json({ error: "system_already_exists" });

    const content = getContent();
    const spaceObjects = [];
    for (const spec of body.spaceObjects || []) {
      const made = instantiateSpaceObject(spec.typeId, content, { remainingAmount: spec.remainingAmount });
      if (!made.ok) return res.status(400).json({ error: made.error });
      spaceObjects.push(made.instance);
    }

    for (const spec of body.links || []) {
      if (spec.toSystemId === body.id) return res.status(400).json({ error: "invalid_link" });
      if (!getSystem(db, campaignId, spec.toSystemId)) {
        return res.status(400).json({ error: "missing_link_target", toSystemId: spec.toSystemId });
      }
    }

    const system = createSystem(db, campaignId, { ...body, spaceObjects });
    const links = [];
    for (const spec of body.links || []) {
      const made = createSystemLink(db, campaignId, { fromId: body.id, toId: spec.toSystemId, type: spec.type });
      if (!made.ok) return res.status(400).json({ error: made.error });
      links.push(made.link);
    }
    res.json({ ...system, links });
  });

  router.patch("/campaign/:campaignId/systems/:systemId", (req, res) => {
    if (!requireGm(req, res)) return;
    const body = parseBody(UpdateSystemRequestSchema, req, res);
    if (!body) return;

    const db = getDb();
    const { campaignId, systemId } = req.params;
    if (!getSystem(db, campaignId, systemId)) return res.status(404).json({ error: "system_not_found" });

    if (body.links) {
      for (const spec of body.links) {
        if (spec.toSystemId === systemId) return res.status(400).json({ error: "invalid_link" });
        if (!getSystem(db, campaignId, spec.toSystemId)) {
          return res.status(400).json({ error: "missing_link_target", toSystemId: spec.toSystemId });
        }
      }
    }

    const system = updateSystem(db, campaignId, systemId, body);
    let links;
    if (body.links) {
      const replaced = replaceOutgoingLinks(db, campaignId, systemId, body.links);
      if (!replaced.ok) return res.status(400).json({ error: replaced.error });
      links = replaced.links;
    }
    res.json({ ...system, ...(links ? { links } : {}) });
  });

  router.post("/campaign/:campaignId/systems/:systemId/links", (req, res) => {
    if (!requireGm(req, res)) return;
    const body = parseBody(AddSystemLinkRequestSchema, req, res);
    if (!body) return;

    const db = getDb();
    const { campaignId, systemId } = req.params;
    if (!getSystem(db, campaignId, systemId)) return res.status(404).json({ error: "system_not_found" });
    if (!getSystem(db, campaignId, body.toSystemId)) return res.status(400).json({ error: "missing_link_target" });

    const made = createSystemLink(db, campaignId, { fromId: systemId, toId: body.toSystemId, type: body.type });
    if (!made.ok) return res.status(409).json({ error: made.error, link: made.link });
    res.json(made.link);
  });

  router.delete("/campaign/:campaignId/links/:linkId", (req, res) => {
    if (!requireGm(req, res)) return;
    const db = getDb();
    const { campaignId, linkId } = req.params;
    if (!deleteSystemLink(db, campaignId, linkId)) return res.status(404).json({ error: "link_not_found" });
    res.json({ ok: true });
  });

  router.post("/campaign/:campaignId/systems/:systemId/space-objects", (req, res) => {
    if (!requireGm(req, res)) return;
    const body = parseBody(AddSpaceObjectRequestSchema, req, res);
    if (!body) return;

    const db = getDb();
    const { campaignId, systemId } = req.params;
    if (!getSystem(db, campaignId, systemId)) return res.status(404).json({ error: "system_not_found" });

    const made = instantiateSpaceObject(body.typeId, getContent(), { remainingAmount: body.remainingAmount });
    if (!made.ok) return res.status(400).json({ error: made.error });
    res.json(addSpaceObject(db, campaignId, systemId, made.instance));
  });

  router.delete("/campaign/:campaignId/systems/:systemId/space-objects/:objectId", (req, res) => {
    if (!requireGm(req, res)) return;
    const db = getDb();
    const { campaignId, systemId, objectId } = req.params;
    if (!getSystem(db, campaignId, systemId)) return res.status(404).json({ error: "system_not_found" });
    if (!deleteSpaceObject(db, campaignId, systemId, objectId)) return res.status(404).json({ error: "space_object_not_found" });
    res.json({ ok: true });
  });

  router.post("/campaign/:campaignId/systems/:systemId/planets", (req, res) => {
    if (!requireGm(req, res)) return;
    const body = parseBody(CreatePlanetRequestSchema, req, res);
    if (!body) return;

    const db = getDb();
    const { campaignId, systemId } = req.params;
    if (!getSystem(db, campaignId, systemId)) return res.status(404).json({ error: "system_not_found" });
    if (loadPlanet(db, systemId, body.id)) return res.status(409).json({ error: "planet_already_exists" });

    const { autoGenerateResources, resources, ...planet } = body;
    planet.resources = resolvePlanetResources({ resources, autoGenerateResources, type: planet.type, climate: planet.climate }, getContent());
    res.json(createPlanet(db, campaignId, systemId, planet));
  });

  router.post("/campaign/:campaignId/systems/:systemId/planets/:planetId/colonize", (req, res) => {
    const { campaignId, systemId, planetId } = req.params;
    const db = getDb();
    const system = loadSystemWithPlanets(db, campaignId, systemId);
    const planet = system?.planets.find((p) => p.id === planetId);
    if (!system || !planet) return res.status(404).json({ error: "not_found" });

    // Colonizing requires the *system* be yours already (see
    // domain/planets/colonization.mjs's canColonizePlanet) — a player acts
    // as the system's owning faction, so check against that, not a body field.
    const actor = requireActor(req, res);
    if (!actor) return;
    if (!actorCanActForFaction(actor, system.ownerFactionId)) {
      return res.status(403).json({ error: "forbidden_faction" });
    }

    const body = parseBody(ColonizeRequestSchema, req, res);
    if (!body) return;

    const factionId = system.ownerFactionId;
    const eco = loadEconomyAccount(db, campaignId, factionId);
    const faction = getFaction(db, campaignId, factionId);
    const factionPlanets = listFactionPlanets(db, campaignId, factionId);
    const result = colonizePlanet(system, planet, factionId, body.colonyType, eco.stocks, getContent(), {
      mode: body.mode,
      founderRaceId: faction?.raceId,
      factionPlanets,
      manualComposition: body.manualComposition,
      sourcePlanetId: body.sourcePlanetId,
    });
    if (result.ok) {
      savePlanet(db, campaignId, result.planet);
      for (const sourcePlanet of result.sourcePlanets || []) savePlanet(db, campaignId, sourcePlanet);
      saveEconomyAccount(db, campaignId, factionId, { ...eco, stocks: result.stocks }, { turn: getCurrentTurn(db, campaignId) ?? 0, journal: result.journal });
      bumpTableRevision(db, campaignId);
    }
    res.json(PlanetActionResponseSchema.parse(result));
  });

  router.post("/campaign/:campaignId/systems/:systemId/planets/:planetId/build", (req, res) => {
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

    const body = parseBody(BuildRequestSchema, req, res);
    if (!body) return;

    const content = getContent();
    const def = content.buildings?.[body.buildingId];
    if (!def) return res.status(400).json({ error: "unknown_building" });

    const factionId = planet.ownerFactionId;
    const eco = loadEconomyAccount(db, campaignId, factionId);
    const techAccount = loadTechAccount(db, campaignId, factionId);
    const result = placeBuilding(system, planet, def, factionId, eco.stocks, content, techAccount);
    if (result.ok) {
      savePlanet(db, campaignId, result.planet);
      saveEconomyAccount(db, campaignId, factionId, { ...eco, stocks: result.stocks }, { turn: getCurrentTurn(db, campaignId) ?? 0, journal: result.journal });
      bumpTableRevision(db, campaignId);
    }
    res.json(PlanetActionResponseSchema.parse(result));
  });

  router.post("/campaign/:campaignId/systems/:systemId/planets/:planetId/upgrade-grade", (req, res) => {
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

    const body = parseBody(UpgradeGradeRequestSchema, req, res);
    if (!body) return;

    const factionId = planet.ownerFactionId;
    const eco = loadEconomyAccount(db, campaignId, factionId);
    const upgrade = body.zone === "orbital" ? upgradeOrbitalGrade : upgradeSurfaceGrade;
    const result = upgrade(planet, factionId, eco.stocks, getContent());
    if (result.ok) {
      savePlanet(db, campaignId, result.planet);
      saveEconomyAccount(db, campaignId, factionId, { ...eco, stocks: result.stocks }, { turn: getCurrentTurn(db, campaignId) ?? 0, journal: result.journal });
      bumpTableRevision(db, campaignId);
    }
    res.json(PlanetActionResponseSchema.parse(result));
  });

  router.post("/campaign/:campaignId/factions/:factionId/research", (req, res) => {
    const actor = requireActor(req, res);
    if (!actor) return;
    const { campaignId, factionId } = req.params;
    if (!actorCanActForFaction(actor, factionId)) {
      return res.status(403).json({ error: "forbidden_faction" });
    }

    const body = parseBody(PersistedResearchRequestSchema, req, res);
    if (!body) return;

    const db = getDb();
    const techAccount = loadTechAccount(db, campaignId, factionId);
    const economyAccount = loadEconomyAccount(db, campaignId, factionId);
    if (!techAccount || !economyAccount) return res.status(404).json({ error: "faction_not_found" });

    // Pre-existing bug found live 2026-08-14: `turn` defaulting was missing
    // here (every other route in this file falls back to
    // getCurrentTurn ?? 0) — omitting it in the request crashed
    // saveEconomyAccount on ledger_entries.turn's NOT NULL constraint.
    const turn = body.turn ?? getCurrentTurn(db, campaignId) ?? 0;
    const factionPlanets = listFactionPlanets(db, campaignId, factionId);
    const result = researchTech(techAccount, economyAccount.stocks, body.techId, getContent(), { turn, factionPlanets });
    if (result.ok) {
      saveTechAccount(db, campaignId, factionId, result.techAccount, { turn });
      saveEconomyAccount(db, campaignId, factionId, { ...economyAccount, stocks: result.stocks }, { turn, journal: result.journal });
      appendTickEvent(db, campaignId, turn, "research", { factionId, techId: body.techId });
      bumpTableRevision(db, campaignId);
    }
    res.json(PersistedResearchResponseSchema.parse(result));
  });

  router.post("/campaign/:campaignId/factions/:factionId/tech/:techId/upgrade-grade", (req, res) => {
    const actor = requireActor(req, res);
    if (!actor) return;
    const { campaignId, factionId, techId } = req.params;
    if (!actorCanActForFaction(actor, factionId)) {
      return res.status(403).json({ error: "forbidden_faction" });
    }
    const db = getDb();
    const techAccount = loadTechAccount(db, campaignId, factionId);
    const economyAccount = loadEconomyAccount(db, campaignId, factionId);
    if (!techAccount || !economyAccount) return res.status(404).json({ error: "faction_not_found" });
    const result = upgradeTechGrade(techAccount, techId, economyAccount.stocks, getContent());
    if (result.ok) {
      const turn = getCurrentTurn(db, campaignId) ?? 0;
      saveTechAccount(db, campaignId, factionId, result.techAccount, { turn });
      saveEconomyAccount(db, campaignId, factionId, { ...economyAccount, stocks: result.stocks }, { turn, journal: result.journal });
    }
    res.json(TechAccountActionResponseSchema.parse(result));
  });

  router.post("/campaign/:campaignId/factions/:factionId/tech/:techId/fill-socket", (req, res) => {
    const actor = requireActor(req, res);
    if (!actor) return;
    const { campaignId, factionId, techId } = req.params;
    if (!actorCanActForFaction(actor, factionId)) {
      return res.status(403).json({ error: "forbidden_faction" });
    }
    const body = parseBody(FillTechSocketRequestSchema, req, res);
    if (!body) return;
    const db = getDb();
    const techAccount = loadTechAccount(db, campaignId, factionId);
    const economyAccount = loadEconomyAccount(db, campaignId, factionId);
    if (!techAccount || !economyAccount) return res.status(404).json({ error: "faction_not_found" });
    const result = fillTechSocket(techAccount, techId, body.resourceId, economyAccount.stocks, getContent());
    if (result.ok) {
      const turn = getCurrentTurn(db, campaignId) ?? 0;
      saveTechAccount(db, campaignId, factionId, result.techAccount, { turn });
      saveEconomyAccount(db, campaignId, factionId, { ...economyAccount, stocks: result.stocks }, { turn, journal: result.journal });
    }
    res.json(TechAccountActionResponseSchema.parse(result));
  });

  router.post("/campaign/:campaignId/factions/:factionId/tech/offers/:direction/reroll", (req, res) => {
    const actor = requireActor(req, res);
    if (!actor) return;
    const { campaignId, factionId, direction } = req.params;
    if (!actorCanActForFaction(actor, factionId)) {
      return res.status(403).json({ error: "forbidden_faction" });
    }
    const parsed = TechDirectionSchema.safeParse(direction);
    if (!parsed.success) return res.status(400).json({ error: "unknown_direction" });
    const db = getDb();
    const techAccount = loadTechAccount(db, campaignId, factionId);
    if (!techAccount) return res.status(404).json({ error: "faction_not_found" });
    const factionPlanets = listFactionPlanets(db, campaignId, factionId);
    const result = rerollOffer(techAccount, getContent(), parsed.data, undefined, factionPlanets);
    if (result.ok) {
      saveTechAccount(db, campaignId, factionId, result.techAccount, { turn: getCurrentTurn(db, campaignId) ?? 0 });
    }
    res.json(TechAccountActionResponseSchema.parse(result));
  });

  return router;
}
