import { Router } from "express";
import { runCivicTick } from "../../domain/court/civicTick.mjs";
import { upsertNpc, removeNpc, setRuler } from "../../domain/court/npcRoster.mjs";
import {
  unlockCouncilSeat,
  lockCouncilSeat,
  setSeatPortfolio,
  seatNpcCouncil,
  unseatNpcCouncil,
} from "../../domain/court/councilSeats.mjs";
import { assignPosting, recallPosting } from "../../domain/court/postings.mjs";
import { giveNpcTask } from "../../domain/court/npcTasks.mjs";
import { recomputeInternalBlocs } from "../../domain/court/internalBlocs.mjs";
import { getContent } from "../../contentLoader.mjs";
import { getDb } from "../../db/store.mjs";
import { getCampaign, getFaction, getCurrentTurn } from "../../campaign/campaignStore.mjs";
import { loadFactionCourt, saveFactionCourt } from "../../campaign/npcStore.mjs";
import { getSystem } from "../../campaign/planetStore.mjs";
import { loadForce } from "../../campaign/forcesStore.mjs";
import {
  CivicTickRequestSchema,
  CivicTickResponseSchema,
  CreateNpcRequestSchema,
  EditNpcRequestSchema,
  ConfirmRulerRequestSchema,
  SeatNpcRequestSchema,
  AssignPostingRequestSchema,
  GiveNpcTaskRequestSchema,
  SetPortfolioRequestSchema,
  CourtStateResponseSchema,
} from "../contract/court.mjs";
import { requireGm, requireActor, actorCanActForFaction } from "../auth.mjs";
import { parseBody } from "../validate.mjs";

function persist(db, campaignId, factionId, content, court) {
  const blocs = recomputeInternalBlocs(court, court.npcs, content);
  const next = { ...court, internalBlocs: blocs };
  saveFactionCourt(db, campaignId, factionId, next);
  return next;
}

function loadOr404(db, res, campaignId, factionId, content) {
  if (!getCampaign(db, campaignId)) {
    res.status(404).json({ error: "campaign_not_found" });
    return null;
  }
  if (!getFaction(db, campaignId, factionId)) {
    res.status(404).json({ error: "faction_not_found" });
    return null;
  }
  return loadFactionCourt(db, campaignId, factionId, content);
}

function requirePlayerFaction(req, res, factionId) {
  const actor = requireActor(req, res);
  if (!actor) return null;
  if (!actorCanActForFaction(actor, factionId)) {
    res.status(403).json({ error: "forbidden_faction" });
    return null;
  }
  return actor;
}

function jsonCourt(court) {
  return CourtStateResponseSchema.parse({
    rulerNpcId: court.rulerNpcId ?? null,
    council: court.council,
    npcs: court.npcs,
    internalBlocs: court.internalBlocs,
    activeEffects: court.activeEffects ?? [],
  });
}

/** Thin HTTP layer only (see CLAUDE.md rule 3). Civic-tick stays GM preview; roster/seats/postings/tasks are persisted. */
export function courtRouter() {
  const router = Router();

  router.post("/court/civic-tick", (req, res) => {
    if (!requireGm(req, res)) return;
    const body = parseBody(CivicTickRequestSchema, req, res);
    if (!body) return;
    const result = runCivicTick(body.factions, getContent());
    res.json(CivicTickResponseSchema.parse(result));
  });

  router.get("/campaign/:campaignId/factions/:factionId/court", (req, res) => {
    const { campaignId, factionId } = req.params;
    if (!requirePlayerFaction(req, res, factionId)) return;
    const db = getDb();
    const court = loadOr404(db, res, campaignId, factionId, getContent());
    if (!court) return;
    res.json(jsonCourt(court));
  });

  router.post("/campaign/:campaignId/factions/:factionId/npcs", (req, res) => {
    if (!requireGm(req, res)) return;
    const body = parseBody(CreateNpcRequestSchema, req, res);
    if (!body) return;
    const { campaignId, factionId } = req.params;
    const db = getDb();
    const content = getContent();
    const court = loadOr404(db, res, campaignId, factionId, content);
    if (!court) return;
    const result = upsertNpc(court, { ...body, factionId });
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json(jsonCourt(persist(db, campaignId, factionId, content, { ...court, ...result })));
  });

  router.patch("/campaign/:campaignId/factions/:factionId/npcs/:npcId", (req, res) => {
    if (!requireGm(req, res)) return;
    const body = parseBody(EditNpcRequestSchema, req, res);
    if (!body) return;
    const { campaignId, factionId, npcId } = req.params;
    const db = getDb();
    const content = getContent();
    const court = loadOr404(db, res, campaignId, factionId, content);
    if (!court) return;
    const existing = court.npcs.find((n) => n.id === npcId);
    if (!existing) return res.status(404).json({ error: "npc_missing" });
    const result = upsertNpc(court, { ...existing, ...body, id: npcId, factionId });
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json(jsonCourt(persist(db, campaignId, factionId, content, { ...court, ...result })));
  });

  router.delete("/campaign/:campaignId/factions/:factionId/npcs/:npcId", (req, res) => {
    if (!requireGm(req, res)) return;
    const body = parseBody(ConfirmRulerRequestSchema.partial(), { ...req, body: req.body ?? {} }, res);
    if (!body) return;
    const { campaignId, factionId, npcId } = req.params;
    const db = getDb();
    const content = getContent();
    const court = loadOr404(db, res, campaignId, factionId, content);
    if (!court) return;
    const result = removeNpc(court, npcId, { confirmSetRuler: !!body.confirmSetRuler });
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json(jsonCourt(persist(db, campaignId, factionId, content, { ...court, ...result })));
  });

  router.post("/campaign/:campaignId/factions/:factionId/npcs/:npcId/ruler", (req, res) => {
    if (!requireGm(req, res)) return;
    const body = parseBody(ConfirmRulerRequestSchema, req, res);
    if (!body) return;
    const { campaignId, factionId, npcId } = req.params;
    const db = getDb();
    const content = getContent();
    const court = loadOr404(db, res, campaignId, factionId, content);
    if (!court) return;
    const result = setRuler(court, npcId, { confirmSetRuler: body.confirmSetRuler });
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json(jsonCourt(persist(db, campaignId, factionId, content, { ...court, ...result })));
  });

  router.post("/campaign/:campaignId/factions/:factionId/council/seats/:seatId/unlock", (req, res) => {
    if (!requireGm(req, res)) return;
    const { campaignId, factionId, seatId } = req.params;
    const db = getDb();
    const content = getContent();
    const court = loadOr404(db, res, campaignId, factionId, content);
    if (!court) return;
    const council = unlockCouncilSeat(court, seatId, content);
    res.json(jsonCourt(persist(db, campaignId, factionId, content, { ...court, council })));
  });

  router.post("/campaign/:campaignId/factions/:factionId/council/seats/:seatId/lock", (req, res) => {
    if (!requireGm(req, res)) return;
    const { campaignId, factionId, seatId } = req.params;
    const db = getDb();
    const content = getContent();
    const court = loadOr404(db, res, campaignId, factionId, content);
    if (!court) return;
    const locked = lockCouncilSeat(court, seatId, content);
    res.json(jsonCourt(persist(db, campaignId, factionId, content, { ...court, council: locked.council, npcs: locked.npcs })));
  });

  router.post("/campaign/:campaignId/factions/:factionId/council/seats/:seatId/portfolio", (req, res) => {
    if (!requireGm(req, res)) return;
    const body = parseBody(SetPortfolioRequestSchema, req, res);
    if (!body) return;
    const { campaignId, factionId, seatId } = req.params;
    const db = getDb();
    const content = getContent();
    const court = loadOr404(db, res, campaignId, factionId, content);
    if (!court) return;
    const result = setSeatPortfolio(court, seatId, body.portfolioId, content);
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json(jsonCourt(persist(db, campaignId, factionId, content, { ...court, council: result.council, npcs: result.npcs })));
  });

  router.post("/campaign/:campaignId/factions/:factionId/npcs/:npcId/seat", (req, res) => {
    const { campaignId, factionId, npcId } = req.params;
    if (!requirePlayerFaction(req, res, factionId)) return;
    const body = parseBody(SeatNpcRequestSchema, req, res);
    if (!body) return;
    const db = getDb();
    const content = getContent();
    const court = loadOr404(db, res, campaignId, factionId, content);
    if (!court) return;
    const result = seatNpcCouncil(court, npcId, body.seatId, content);
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json(jsonCourt(persist(db, campaignId, factionId, content, { ...court, npcs: result.npcs })));
  });

  router.post("/campaign/:campaignId/factions/:factionId/npcs/:npcId/unseat", (req, res) => {
    const { campaignId, factionId, npcId } = req.params;
    if (!requirePlayerFaction(req, res, factionId)) return;
    const db = getDb();
    const content = getContent();
    const court = loadOr404(db, res, campaignId, factionId, content);
    if (!court) return;
    const result = unseatNpcCouncil(court, npcId);
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json(jsonCourt(persist(db, campaignId, factionId, content, { ...court, npcs: result.npcs })));
  });

  router.post("/campaign/:campaignId/factions/:factionId/npcs/:npcId/posting", (req, res) => {
    const { campaignId, factionId, npcId } = req.params;
    if (!requirePlayerFaction(req, res, factionId)) return;
    const body = parseBody(AssignPostingRequestSchema, req, res);
    if (!body) return;
    const db = getDb();
    const content = getContent();
    const court = loadOr404(db, res, campaignId, factionId, content);
    if (!court) return;
    const npc = court.npcs.find((n) => n.id === npcId);
    if (!npc) return res.status(404).json({ error: "npc_missing" });
    let target = null;
    if (body.kind === "governor") {
      const sys = getSystem(db, campaignId, body.targetId);
      if (!sys) return res.status(404).json({ error: "system_not_found" });
      target = { ownerFactionId: sys.ownerFactionId };
    } else {
      const force = loadForce(db, campaignId, body.targetId);
      if (!force) return res.status(404).json({ error: "force_not_found" });
      target = { factionId: force.factionId, kind: force.kind };
    }
    const result = assignPosting({
      npc,
      npcs: court.npcs,
      kind: body.kind,
      targetId: body.targetId,
      faction: { id: factionId, rulerNpcId: court.rulerNpcId },
      turn: getCurrentTurn(db, campaignId) ?? 0,
      target,
    });
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json(jsonCourt(persist(db, campaignId, factionId, content, { ...court, npcs: result.npcs })));
  });

  router.post("/campaign/:campaignId/factions/:factionId/npcs/:npcId/posting/recall", (req, res) => {
    const { campaignId, factionId, npcId } = req.params;
    if (!requirePlayerFaction(req, res, factionId)) return;
    const db = getDb();
    const content = getContent();
    const court = loadOr404(db, res, campaignId, factionId, content);
    if (!court) return;
    const npc = court.npcs.find((n) => n.id === npcId);
    if (!npc) return res.status(404).json({ error: "npc_missing" });
    const result = recallPosting({ npc, npcs: court.npcs, turn: getCurrentTurn(db, campaignId) ?? 0 });
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json(jsonCourt(persist(db, campaignId, factionId, content, { ...court, npcs: result.npcs })));
  });

  router.post("/campaign/:campaignId/factions/:factionId/npcs/:npcId/task", (req, res) => {
    const { campaignId, factionId, npcId } = req.params;
    if (!requirePlayerFaction(req, res, factionId)) return;
    const body = parseBody(GiveNpcTaskRequestSchema, req, res);
    if (!body) return;
    const db = getDb();
    const content = getContent();
    const court = loadOr404(db, res, campaignId, factionId, content);
    if (!court) return;
    const npc = court.npcs.find((n) => n.id === npcId);
    if (!npc) return res.status(404).json({ error: "npc_missing" });
    const result = giveNpcTask({
      npc,
      npcs: court.npcs,
      turn: getCurrentTurn(db, campaignId) ?? 0,
      content,
      ...body,
    });
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json(jsonCourt(persist(db, campaignId, factionId, content, { ...court, npcs: result.npcs })));
  });

  return router;
}
