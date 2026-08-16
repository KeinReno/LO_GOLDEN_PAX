/**
 * Auto-extracted from api.mjs — engagements routes.
 */
import {
  readEngagements,
  setEngagementStance,
  requestCardBattle,
  forceCardBattle,
  playEngagementCard,
  passEngagementCard,
  drawEngagementCard,
  advanceEngagement,
  strikeEngagementFront,
  readyEngagementCard,
  stanceOrderEngagement,
  reorderEngagementFront,
  retreatEngagementCard,
  claimEngagementTrophy,
  skipEngagementTrophy,
  cancelEngagementsMissingForces,
} from "../engagements.mjs";
import { readLiveBoard, writeLiveBoard } from "../tableStore.mjs";

/**
 * @returns {Promise<boolean>}
 */
export async function tryHandleEngagementRoutes(req, res, url, ctx) {
  if (!(url.pathname === "/api/engagements" || url.pathname.startsWith("/api/engagements/"))) return false;

  const {
    sendJson,
    readBody,
    requireMaster,
    authenticatePlayerFaction,
    requireMasterOrFactionAuth,
    maskEngagementForFaction,
    bindAuthedFaction,
  } = ctx;

  if (url.pathname === "/api/engagements/reconcile" && req.method === "POST") {
    if (!requireMaster(req)) {
      sendJson(res, 401, { error: "Нужен master token" });
      return true;
    }
    const body = await readBody(req);
    const world = body.world || readLiveBoard();
    if (!world) {
      sendJson(res, 404, { error: "Нет board" });
      return true;
    }
    const result = cancelEngagementsMissingForces(world, {
      removedFleetIds: body.removedFleetIds || [],
      removedLegionIds: body.removedLegionIds || [],
    });
    sendJson(res, 200, {
      ok: true,
      ...result,
      engagements: readEngagements(),
    });
    return true;
  }

  if (url.pathname === "/api/engagements" && req.method === "GET") {
    const list = readEngagements();
    const world = readLiveBoard();
    const engAuth = requireMasterOrFactionAuth(req, world, null);
    if (!engAuth.ok) {
      sendJson(res, 401, { error: engAuth.error });
      return true;
    }
    if (engAuth.master) {
      sendJson(res, 200, { engagements: list });
      return true;
    }
    const factionId = engAuth.faction.id;
    const mine = list.filter((e) =>
      (e.sides || []).some((s) => s.factionId === factionId),
    );
    sendJson(res, 200, {
      engagements: mine.map((e) => maskEngagementForFaction(e, factionId)),
    });
    return true;
  }

  if (
    url.pathname.startsWith("/api/engagements/") &&
    url.pathname.endsWith("/stance") &&
    req.method === "POST"
  ) {
    const body = await readBody(req);
    const engagementId = url.pathname.split("/")[3];
    const world = readLiveBoard();
    if (!world) {
      sendJson(res, 404, { error: "Нет board" });
      return true;
    }
    const auth = bindAuthedFaction(
      authenticatePlayerFaction(body, world, req),
      body,
    );
    if (!auth.ok) {
      sendJson(res, 401, { error: auth.error });
      return true;
    }
    const result = setEngagementStance(
      engagementId,
      body.factionId,
      body.stance,
    );
    sendJson(res, result.ok ? 200 : 400, result);
    return true;
  }

  if (
    url.pathname.startsWith("/api/engagements/") &&
    url.pathname.endsWith("/advance") &&
    req.method === "POST"
  ) {
    if (!requireMaster(req)) {
      sendJson(res, 401, { error: "Неверный мастер-токен" });
      return true;
    }
    const body = await readBody(req);
    const engagementId = url.pathname.split("/")[3];
    const world = readLiveBoard();
    if (!world) {
      sendJson(res, 404, { error: "Нет board" });
      return true;
    }
    const journal = [];
    const result = advanceEngagement(engagementId, world, journal, {
      fullResolve: !!body.fullResolve,
      force: !!body.force,
    });
    if (result.ok) {
      writeLiveBoard(world, { backup: false, reason: "engagement_advance" });
    }
    sendJson(res, result.ok ? 200 : 400, { ...result, journal });
    return true;
  }

  if (
    url.pathname.startsWith("/api/engagements/") &&
    url.pathname.endsWith("/request_card") &&
    req.method === "POST"
  ) {
    const body = await readBody(req);
    const engagementId = url.pathname.split("/")[3];
    const world = readLiveBoard();
    if (!world) {
      sendJson(res, 404, { error: "Нет board" });
      return true;
    }
    const auth = bindAuthedFaction(
      authenticatePlayerFaction(body, world, req),
      body,
    );
    if (!auth.ok) {
      sendJson(res, 401, { error: auth.error });
      return true;
    }
    const result = requestCardBattle(engagementId, body.factionId, world);
    sendJson(res, result.ok ? 200 : 400, result);
    return true;
  }

  if (
    url.pathname.startsWith("/api/engagements/") &&
    url.pathname.endsWith("/force_card") &&
    req.method === "POST"
  ) {
    if (!requireMaster(req)) {
      sendJson(res, 401, { error: "Неверный мастер-токен" });
      return true;
    }
    const engagementId = url.pathname.split("/")[3];
    const world = readLiveBoard();
    const result = forceCardBattle(engagementId, world);
    sendJson(res, result.ok ? 200 : 400, result);
    return true;
  }

  if (
    url.pathname.startsWith("/api/engagements/") &&
    url.pathname.endsWith("/play_card") &&
    req.method === "POST"
  ) {
    const body = await readBody(req);
    const engagementId = url.pathname.split("/")[3];
    const world = readLiveBoard();
    if (!world) {
      sendJson(res, 404, { error: "Нет board" });
      return true;
    }
    const auth = bindAuthedFaction(
      authenticatePlayerFaction(body, world, req),
      body,
    );
    if (!auth.ok) {
      sendJson(res, 401, { error: auth.error });
      return true;
    }
    const result = playEngagementCard(
      engagementId,
      body.factionId,
      body.cardId,
      world,
      {
        mode: body.mode,
        targetId: body.targetId,
      },
    );
    if (result.ok) {
      writeLiveBoard(world, { backup: false, reason: "play_card" });
    }
    sendJson(res, result.ok ? 200 : 400, result);
    return true;
  }

  if (
    url.pathname.startsWith("/api/engagements/") &&
    url.pathname.endsWith("/strike_front") &&
    req.method === "POST"
  ) {
    const body = await readBody(req);
    const engagementId = url.pathname.split("/")[3];
    const world = readLiveBoard();
    if (!world) {
      sendJson(res, 404, { error: "Нет board" });
      return true;
    }
    const auth = bindAuthedFaction(
      authenticatePlayerFaction(body, world, req),
      body,
    );
    if (!auth.ok) {
      sendJson(res, 401, { error: auth.error });
      return true;
    }
    const result = strikeEngagementFront(
      engagementId,
      body.factionId,
      body.cardId,
      body.targetId,
      world,
    );
    if (result.ok) {
      writeLiveBoard(world, { backup: false, reason: "strike_front" });
    }
    sendJson(res, result.ok ? 200 : 400, result);
    return true;
  }

  if (
    url.pathname.startsWith("/api/engagements/") &&
    url.pathname.endsWith("/ready_card") &&
    req.method === "POST"
  ) {
    const body = await readBody(req);
    const engagementId = url.pathname.split("/")[3];
    const world = readLiveBoard();
    if (!world) {
      sendJson(res, 404, { error: "Нет board" });
      return true;
    }
    const auth = bindAuthedFaction(
      authenticatePlayerFaction(body, world, req),
      body,
    );
    if (!auth.ok) {
      sendJson(res, 401, { error: auth.error });
      return true;
    }
    const result = readyEngagementCard(
      engagementId,
      body.factionId,
      world,
    );
    if (result.ok) {
      writeLiveBoard(world, { backup: false, reason: "ready_card" });
    }
    sendJson(res, result.ok ? 200 : 400, result);
    return true;
  }

  if (
    url.pathname.startsWith("/api/engagements/") &&
    url.pathname.endsWith("/stance_order") &&
    req.method === "POST"
  ) {
    const body = await readBody(req);
    const engagementId = url.pathname.split("/")[3];
    const world = readLiveBoard();
    if (!world) {
      sendJson(res, 404, { error: "Нет board" });
      return true;
    }
    const auth = bindAuthedFaction(
      authenticatePlayerFaction(body, world, req),
      body,
    );
    if (!auth.ok) {
      sendJson(res, 401, { error: auth.error });
      return true;
    }
    const result = stanceOrderEngagement(
      engagementId,
      body.factionId,
      world,
      { stance: body.stance, cardId: body.cardId },
    );
    if (result.ok) {
      writeLiveBoard(world, { backup: false, reason: "stance_order" });
    }
    sendJson(res, result.ok ? 200 : 400, result);
    return true;
  }

  if (
    url.pathname.startsWith("/api/engagements/") &&
    url.pathname.endsWith("/reorder_front") &&
    req.method === "POST"
  ) {
    const body = await readBody(req);
    const engagementId = url.pathname.split("/")[3];
    const world = readLiveBoard();
    if (!world) {
      sendJson(res, 404, { error: "Нет board" });
      return true;
    }
    const auth = bindAuthedFaction(
      authenticatePlayerFaction(body, world, req),
      body,
    );
    if (!auth.ok) {
      sendJson(res, 401, { error: auth.error });
      return true;
    }
    const result = reorderEngagementFront(
      engagementId,
      body.factionId,
      body.cardId,
      body.toIndex,
      world,
    );
    if (result.ok) {
      writeLiveBoard(world, { backup: false, reason: "reorder_front" });
    }
    sendJson(res, result.ok ? 200 : 400, result);
    return true;
  }

  if (
    url.pathname.startsWith("/api/engagements/") &&
    url.pathname.endsWith("/retreat_card") &&
    req.method === "POST"
  ) {
    const body = await readBody(req);
    const engagementId = url.pathname.split("/")[3];
    const world = readLiveBoard();
    if (!world) {
      sendJson(res, 404, { error: "Нет board" });
      return true;
    }
    const auth = bindAuthedFaction(
      authenticatePlayerFaction(body, world, req),
      body,
    );
    if (!auth.ok) {
      sendJson(res, 401, { error: auth.error });
      return true;
    }
    const result = retreatEngagementCard(
      engagementId,
      body.factionId,
      world,
    );
    if (result.ok) {
      writeLiveBoard(world, { backup: false, reason: "retreat_card" });
    }
    sendJson(res, result.ok ? 200 : 400, result);
    return true;
  }

  if (
    url.pathname.startsWith("/api/engagements/") &&
    url.pathname.endsWith("/pass_card") &&
    req.method === "POST"
  ) {
    const body = await readBody(req);
    const engagementId = url.pathname.split("/")[3];
    const world = readLiveBoard();
    if (!world) {
      sendJson(res, 404, { error: "Нет board" });
      return true;
    }
    const auth = bindAuthedFaction(
      authenticatePlayerFaction(body, world, req),
      body,
    );
    if (!auth.ok) {
      sendJson(res, 401, { error: auth.error });
      return true;
    }
    const result = passEngagementCard(engagementId, body.factionId, world);
    if (result.ok) {
      writeLiveBoard(world, { backup: false, reason: "pass_card" });
    }
    sendJson(res, result.ok ? 200 : 400, result);
    return true;
  }

  if (
    url.pathname.startsWith("/api/engagements/") &&
    url.pathname.endsWith("/draw_card") &&
    req.method === "POST"
  ) {
    const body = await readBody(req);
    const engagementId = url.pathname.split("/")[3];
    const world = readLiveBoard();
    if (!world) {
      sendJson(res, 404, { error: "Нет board" });
      return true;
    }
    const auth = bindAuthedFaction(
      authenticatePlayerFaction(body, world, req),
      body,
    );
    if (!auth.ok) {
      sendJson(res, 401, { error: auth.error });
      return true;
    }
    const result = drawEngagementCard(engagementId, body.factionId, world);
    sendJson(res, result.ok ? 200 : 400, result);
    return true;
  }

  if (
    url.pathname.startsWith("/api/engagements/") &&
    url.pathname.endsWith("/claim_trophy") &&
    req.method === "POST"
  ) {
    const body = await readBody(req);
    const engagementId = url.pathname.split("/")[3];
    const world = readLiveBoard();
    if (!world) {
      sendJson(res, 404, { error: "Нет board" });
      return true;
    }
    const auth = bindAuthedFaction(
      authenticatePlayerFaction(body, world, req),
      body,
    );
    if (!auth.ok) {
      sendJson(res, 401, { error: auth.error });
      return true;
    }
    const result = claimEngagementTrophy(
      engagementId,
      body.factionId,
      world,
      {
        optionId: body.optionId,
        parentKind: body.parentKind,
        parentId: body.parentId,
        groupId: body.groupId,
        defId: body.defId,
      },
    );
    if (result.ok) {
      writeLiveBoard(world, { backup: false, reason: "claim_trophy" });
    }
    sendJson(res, result.ok ? 200 : 400, result);
    return true;
  }

  if (
    url.pathname.startsWith("/api/engagements/") &&
    url.pathname.endsWith("/skip_trophy") &&
    req.method === "POST"
  ) {
    const body = await readBody(req);
    const engagementId = url.pathname.split("/")[3];
    const world = readLiveBoard();
    if (!world) {
      sendJson(res, 404, { error: "Нет board" });
      return true;
    }
    const auth = bindAuthedFaction(
      authenticatePlayerFaction(body, world, req),
      body,
    );
    if (!auth.ok) {
      sendJson(res, 401, { error: auth.error });
      return true;
    }
    const result = skipEngagementTrophy(engagementId, body.factionId, world);
    if (result.ok) {
      writeLiveBoard(world, { backup: false, reason: "skip_trophy" });
    }
    sendJson(res, result.ok ? 200 : 400, result);
    return true;
  }
  return false;
}
