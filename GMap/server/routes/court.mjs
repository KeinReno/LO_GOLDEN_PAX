/**
 * Court HTTP routes — proposals inbox + NPC roster / seats.
 * Dispatched from api.mjs via tryHandleCourtRoutes; keeps api thin.
 */
import { readLiveBoard, writeLiveBoard } from "../tableStore.mjs";
import {
  applyUpsertNpc,
  applyRemoveNpc,
  applySetRuler,
  applyAssignNpcPosting,
  applyRecallNpcPosting,
  applyUnlockSeat,
  applyLockSeat,
  applySetSeatPortfolio,
  applySeatNpc,
  applyUnseatNpc,
} from "../courtRoster.mjs";
import {
  listCourtProposals,
  proposeCourtEdit,
  acceptCourtProposal,
  rejectCourtProposal,
} from "../courtProposals.mjs";

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {URL} url
 * @param {{
 *   sendJson: (res: import("node:http").ServerResponse, status: number, data: unknown) => void,
 *   readBody: (req: import("node:http").IncomingMessage) => Promise<any>,
 *   requireMaster: (req: import("node:http").IncomingMessage) => boolean,
 *   authenticatePlayerFaction: (body: any, world: any, req?: any) => any,
 *   playerSessionPayload: (world: any, faction: any) => Record<string, unknown>,
 * }} ctx
 * @returns {Promise<boolean>} true if this module handled the request
 */
export async function tryHandleCourtRoutes(req, res, url, ctx) {
  if (!url.pathname.startsWith("/api/court/")) return false;

  const {
    sendJson,
    readBody,
    requireMaster,
    authenticatePlayerFaction,
    playerSessionPayload,
  } = ctx;

  if (url.pathname === "/api/court/proposals" && req.method === "GET") {
    if (!requireMaster(req)) {
      sendJson(res, 401, { error: "Неверный мастер-токен" });
      return true;
    }
    const status = url.searchParams.get("status") || undefined;
    sendJson(res, 200, { proposals: listCourtProposals({ status }) });
    return true;
  }

  if (url.pathname === "/api/court/proposals" && req.method === "POST") {
    if (!requireMaster(req)) {
      sendJson(res, 401, { error: "Неверный мастер-токен" });
      return true;
    }
    const body = await readBody(req);
    const result = proposeCourtEdit(body);
    if (!result.ok) {
      sendJson(res, 400, result);
      return true;
    }
    sendJson(res, 200, result);
    return true;
  }

  if (
    url.pathname.startsWith("/api/court/proposals/") &&
    url.pathname.endsWith("/accept") &&
    req.method === "POST"
  ) {
    if (!requireMaster(req)) {
      sendJson(res, 401, { error: "Неверный мастер-токен" });
      return true;
    }
    const proposalId = url.pathname.split("/")[4];
    const result = acceptCourtProposal(proposalId);
    if (!result.ok) {
      sendJson(res, 400, result);
      return true;
    }
    sendJson(res, 200, result);
    return true;
  }

  if (
    url.pathname.startsWith("/api/court/proposals/") &&
    url.pathname.endsWith("/reject") &&
    req.method === "POST"
  ) {
    if (!requireMaster(req)) {
      sendJson(res, 401, { error: "Неверный мастер-токен" });
      return true;
    }
    const proposalId = url.pathname.split("/")[4];
    const result = rejectCourtProposal(proposalId);
    if (!result.ok) {
      sendJson(res, 400, result);
      return true;
    }
    sendJson(res, 200, result);
    return true;
  }

  /** court_roster_v05 — GM live upsert. Unique vs /api/court/proposals inbox. */
  if (url.pathname === "/api/court/npcs" && req.method === "POST") {
    if (!requireMaster(req)) {
      sendJson(res, 401, { error: "Неверный мастер-токен" });
      return true;
    }
    const body = (await readBody(req)) || {};
    const world = readLiveBoard();
    if (!world) {
      sendJson(res, 404, { error: "Карта ещё не опубликована" });
      return true;
    }
    const npc = body.npc && typeof body.npc === "object" ? body.npc : body;
    const result = applyUpsertNpc(world, {
      factionId: body.factionId,
      npc,
    });
    if (!result.ok) {
      sendJson(res, 400, result);
      return true;
    }
    writeLiveBoard(world, { backup: false, reason: "court_npc_upsert" });
    sendJson(res, 200, result);
    return true;
  }

  if (url.pathname === "/api/court/npcs/remove" && req.method === "POST") {
    if (!requireMaster(req)) {
      sendJson(res, 401, { error: "Неверный мастер-токен" });
      return true;
    }
    const body = (await readBody(req)) || {};
    const world = readLiveBoard();
    if (!world) {
      sendJson(res, 404, { error: "Карта ещё не опубликована" });
      return true;
    }
    const result = applyRemoveNpc(world, {
      factionId: body.factionId,
      npcId: body.npcId,
      confirmSetRuler: body.confirmSetRuler === true,
    });
    if (!result.ok) {
      sendJson(res, 400, result);
      return true;
    }
    writeLiveBoard(world, { backup: false, reason: "court_npc_remove" });
    sendJson(res, 200, result);
    return true;
  }

  if (url.pathname === "/api/court/npcs/ruler" && req.method === "POST") {
    if (!requireMaster(req)) {
      sendJson(res, 401, { error: "Неверный мастер-токен" });
      return true;
    }
    const body = (await readBody(req)) || {};
    const world = readLiveBoard();
    if (!world) {
      sendJson(res, 404, { error: "Карта ещё не опубликована" });
      return true;
    }
    const result = applySetRuler(world, {
      factionId: body.factionId,
      npcId: body.npcId,
      confirmSetRuler: body.confirmSetRuler === true,
    });
    if (!result.ok) {
      sendJson(res, 400, result);
      return true;
    }
    writeLiveBoard(world, { backup: false, reason: "court_npc_ruler" });
    sendJson(res, 200, result);
    return true;
  }

  if (url.pathname === "/api/court/npcs/posting" && req.method === "POST") {
    const body = (await readBody(req)) || {};
    const world = readLiveBoard();
    if (!world) {
      sendJson(res, 404, { error: "Карта ещё не опубликована" });
      return true;
    }
    const auth = authenticatePlayerFaction(body, world, req);
    if (!auth.ok) {
      sendJson(res, 401, { error: auth.error });
      return true;
    }
    const posted = applyAssignNpcPosting(world, {
      factionId: auth.faction.id,
      npcId: body.npcId,
      kind: body.kind,
      targetId: body.targetId,
      forceId: body.forceId,
      systemId: body.systemId,
      legionId: body.legionId,
      fleetId: body.fleetId,
    });
    if (!posted.ok) {
      sendJson(res, 400, posted);
      return true;
    }
    writeLiveBoard(world, { backup: false, reason: "court_npc_posting" });
    const fresh = readLiveBoard() || world;
    sendJson(res, 200, {
      ok: true,
      npc: posted.npc,
      posting: posted.posting,
      ...playerSessionPayload(fresh, auth.faction),
    });
    return true;
  }

  if (url.pathname === "/api/court/npcs/posting/recall" && req.method === "POST") {
    const body = (await readBody(req)) || {};
    const world = readLiveBoard();
    if (!world) {
      sendJson(res, 404, { error: "Карта ещё не опубликована" });
      return true;
    }
    const auth = authenticatePlayerFaction(body, world, req);
    if (!auth.ok) {
      sendJson(res, 401, { error: auth.error });
      return true;
    }
    const recalled = applyRecallNpcPosting(world, {
      factionId: auth.faction.id,
      npcId: body.npcId,
    });
    if (!recalled.ok) {
      sendJson(res, 400, recalled);
      return true;
    }
    writeLiveBoard(world, { backup: false, reason: "court_npc_recall" });
    const fresh = readLiveBoard() || world;
    sendJson(res, 200, {
      ok: true,
      npc: recalled.npc,
      fromKind: recalled.fromKind,
      ...playerSessionPayload(fresh, auth.faction),
    });
    return true;
  }

  if (url.pathname === "/api/court/seats/unlock" && req.method === "POST") {
    if (!requireMaster(req)) {
      sendJson(res, 401, { error: "Неверный мастер-токен" });
      return true;
    }
    const body = (await readBody(req)) || {};
    const world = readLiveBoard();
    if (!world) {
      sendJson(res, 404, { error: "Карта ещё не опубликована" });
      return true;
    }
    const result = applyUnlockSeat(world, {
      factionId: body.factionId,
      seatId: body.seatId,
    });
    if (!result.ok) {
      sendJson(res, 400, result);
      return true;
    }
    writeLiveBoard(world, { backup: false, reason: "court_seat_unlock" });
    sendJson(res, 200, result);
    return true;
  }

  if (url.pathname === "/api/court/seats/lock" && req.method === "POST") {
    if (!requireMaster(req)) {
      sendJson(res, 401, { error: "Неверный мастер-токен" });
      return true;
    }
    const body = (await readBody(req)) || {};
    const world = readLiveBoard();
    if (!world) {
      sendJson(res, 404, { error: "Карта ещё не опубликована" });
      return true;
    }
    const result = applyLockSeat(world, {
      factionId: body.factionId,
      seatId: body.seatId,
    });
    if (!result.ok) {
      sendJson(res, 400, result);
      return true;
    }
    writeLiveBoard(world, { backup: false, reason: "court_seat_lock" });
    sendJson(res, 200, result);
    return true;
  }

  if (url.pathname === "/api/court/seats/portfolio" && req.method === "POST") {
    if (!requireMaster(req)) {
      sendJson(res, 401, { error: "Неверный мастер-токен" });
      return true;
    }
    const body = (await readBody(req)) || {};
    const world = readLiveBoard();
    if (!world) {
      sendJson(res, 404, { error: "Карта ещё не опубликована" });
      return true;
    }
    const result = applySetSeatPortfolio(world, {
      factionId: body.factionId,
      seatId: body.seatId,
      portfolioId: body.portfolioId,
    });
    if (!result.ok) {
      sendJson(res, 400, result);
      return true;
    }
    writeLiveBoard(world, { backup: false, reason: "court_seat_portfolio" });
    sendJson(res, 200, result);
    return true;
  }

  if (url.pathname === "/api/court/npcs/seat" && req.method === "POST") {
    const body = (await readBody(req)) || {};
    const world = readLiveBoard();
    if (!world) {
      sendJson(res, 404, { error: "Карта ещё не опубликована" });
      return true;
    }
    const auth = authenticatePlayerFaction(body, world, req);
    if (!auth.ok) {
      sendJson(res, 401, { error: auth.error });
      return true;
    }
    const seated = applySeatNpc(world, {
      factionId: auth.faction.id,
      npcId: body.npcId,
      seatId: body.seatId,
    });
    if (!seated.ok) {
      sendJson(res, 400, seated);
      return true;
    }
    writeLiveBoard(world, { backup: false, reason: "court_npc_seat" });
    const fresh = readLiveBoard() || world;
    sendJson(res, 200, {
      ok: true,
      npc: seated.npc,
      ...playerSessionPayload(fresh, auth.faction),
    });
    return true;
  }

  if (url.pathname === "/api/court/npcs/unseat" && req.method === "POST") {
    const body = (await readBody(req)) || {};
    const world = readLiveBoard();
    if (!world) {
      sendJson(res, 404, { error: "Карта ещё не опубликована" });
      return true;
    }
    const auth = authenticatePlayerFaction(body, world, req);
    if (!auth.ok) {
      sendJson(res, 401, { error: auth.error });
      return true;
    }
    const unseated = applyUnseatNpc(world, {
      factionId: auth.faction.id,
      npcId: body.npcId,
    });
    if (!unseated.ok) {
      sendJson(res, 400, unseated);
      return true;
    }
    writeLiveBoard(world, { backup: false, reason: "court_npc_unseat" });
    const fresh = readLiveBoard() || world;
    sendJson(res, 200, {
      ok: true,
      npc: unseated.npc,
      ...playerSessionPayload(fresh, auth.faction),
    });
    return true;
  }

  return false;
}
