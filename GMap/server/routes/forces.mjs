/**
 * Auto-extracted from api.mjs — forces routes.
 */
import { applyForcesMutate } from "../forcesActions.mjs";
import { applyForceRaise, applyForceDisband } from "../forceRecruit.mjs";
import { applyBoardingToWorld } from "../boarding.mjs";
import { readLiveBoard, writeLiveBoard } from "../tableStore.mjs";

/**
 * @returns {Promise<boolean>}
 */
export async function tryHandleForcesRoutes(req, res, url, ctx) {
  if (!(url.pathname.startsWith("/api/forces/"))) return false;

  const {
    sendJson,
    readBody,
    authenticatePlayerFaction,
    playerSessionPayload,
    playerApBudget,
  } = ctx;

  if (url.pathname === "/api/forces/mutate" && req.method === "POST") {
    const body = await readBody(req);
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
    if (!auth.faction) {
      sendJson(res, 400, { error: "factionId required (player auth)" });
      return true;
    }
    const result = applyForcesMutate({
      world,
      factionId: auth.faction.id,
      kind: body.kind,
      id: body.id,
      composition: body.composition,
      stockDeltas: body.stockDeltas,
      forceReserve: body.forceReserve,
    });
    if (!result.ok) {
      sendJson(res, 400, result);
      return true;
    }
    const fresh = readLiveBoard() || world;
    sendJson(res, 200, {
      ok: true,
      unit: result.unit,
      kind: result.kind,
      id: result.id,
      forceReserve: result.forceReserve,
      ...playerSessionPayload(fresh, auth.faction),
    });
    return true;
  }

  /** forces_raise_from_planet_v05 — raise units from planet pop + currency. */
  if (url.pathname === "/api/forces/raise" && req.method === "POST") {
    const body = await readBody(req);
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
    if (!auth.faction) {
      sendJson(res, 400, { error: "factionId required (player auth)" });
      return true;
    }
    const raised = applyForceRaise({
      world,
      factionId: auth.faction.id,
      systemId: body.systemId,
      planetId: body.planetId,
      kind: body.kind,
      defId: body.defId,
      count: body.count,
      forceId: body.forceId || body.legionId || body.fleetId,
      overrideCeiling: body.overrideCeiling === true,
      name: body.name,
    });
    if (!raised.ok) {
      sendJson(res, 400, raised);
      return true;
    }
    const freshRaise = readLiveBoard() || world;
    sendJson(res, 200, {
      ok: true,
      force: raised.force,
      kind: raised.kind,
      planet: raised.planet,
      popCost: raised.popCost,
      cost: raised.cost,
      ...playerSessionPayload(freshRaise, auth.faction),
    });
    return true;
  }

  /** forces_raise_from_planet_v05 — disband returns population, not currency. */
  if (url.pathname === "/api/forces/disband-raised" && req.method === "POST") {
    const body = await readBody(req);
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
    if (!auth.faction) {
      sendJson(res, 400, { error: "factionId required (player auth)" });
      return true;
    }
    const disbanded = applyForceDisband({
      world,
      factionId: auth.faction.id,
      kind: body.kind,
      id: body.id,
      count: body.count,
      defId: body.defId,
      planetId: body.planetId,
    });
    if (!disbanded.ok) {
      sendJson(res, 400, disbanded);
      return true;
    }
    const freshDisband = readLiveBoard() || world;
    sendJson(res, 200, {
      ok: true,
      force: disbanded.force,
      planet: disbanded.planet,
      disbandedCount: disbanded.disbandedCount,
      ...playerSessionPayload(freshDisband, auth.faction),
    });
    return true;
  }

  /** Boarding: legion vs fleet crew. Unique marker: forces_board_v05. */
  if (url.pathname === "/api/forces/board" && req.method === "POST") {
    const body = await readBody(req);
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
    if (!auth.faction) {
      sendJson(res, 400, { error: "factionId required (player auth)" });
      return true;
    }
    const boarded = applyBoardingToWorld({
      world,
      factionId: auth.faction.id,
      legionId: body.legionId,
      targetFleetId: body.targetFleetId || body.fleetId,
    });
    if (!boarded.ok) {
      sendJson(res, 400, { error: boarded.error });
      return true;
    }
    writeLiveBoard(world, { backup: false, reason: "forces_board" });
    const freshBoard = readLiveBoard() || world;
    sendJson(res, 200, {
      ok: true,
      captured: boarded.captured,
      outcome: boarded.outcome,
      powerA: boarded.powerA,
      powerB: boarded.powerB,
      lossesA: boarded.lossesA,
      lossesB: boarded.lossesB,
      legion: boarded.legion,
      fleet: boarded.fleet,
      ...playerSessionPayload(freshBoard, auth.faction),
    });
    return true;
  }
  return false;
}
