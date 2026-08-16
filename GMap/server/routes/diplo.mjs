/**
 * Auto-extracted from api.mjs — diplo routes.
 */
import {
  createDiploOffer,
  respondDiploOffer,
  applyUnilateralStance,
  getDiploOffersForFaction,
} from "../diploOffers.mjs";
import { readLiveBoard, writeLiveBoard } from "../tableStore.mjs";
import { getKnownFactionIds } from "../factionIntel.mjs";

/**
 * @returns {Promise<boolean>}
 */
export async function tryHandleDiploRoutes(req, res, url, ctx) {
  if (!(url.pathname.startsWith("/api/diplo/") && !url.pathname.startsWith("/api/diplo/economic/"))) return false;

  const {
    sendJson,
    readBody,
    authenticatePlayerFaction,
    playerSessionPayload,
    playerEconomy,
    getVisibleSystemIds,
  } = ctx;

  if (url.pathname === "/api/diplo/offers" && req.method === "POST") {
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
    const visible = getVisibleSystemIds(world, auth.faction.id);
    const known = getKnownFactionIds(world, auth.faction.id, [...visible]);
    const action = body.action || "create";

    if (action === "list") {
      sendJson(res, 200, {
        ok: true,
        ...getDiploOffersForFaction(auth.faction.id),
        economy: playerEconomy(auth.faction.id, world),
      });
      return true;
    }

    if (action === "create") {
      const result = createDiploOffer({
        fromFactionId: auth.faction.id,
        toFactionId: body.toFactionId,
        give: body.give,
        want: body.want,
        note: body.note,
        turn: world.meta?.turn ?? 0,
        knownOk: known.has(body.toFactionId),
      });
      if (!result.ok) {
        sendJson(res, 400, result);
        return true;
      }
      sendJson(res, 200, {
        ok: true,
        offer: result.offer,
        ...getDiploOffersForFaction(auth.faction.id),
        economy: playerEconomy(auth.faction.id, world),
        ...playerSessionPayload(world, auth.faction),
      });
      return true;
    }

    if (action === "stance") {
      const result = applyUnilateralStance({
        fromFactionId: auth.faction.id,
        toFactionId: body.toFactionId,
        stance: body.stance,
        turn: world.meta?.turn ?? 0,
        knownOk: known.has(body.toFactionId),
      });
      if (!result.ok) {
        sendJson(res, 400, result);
        return true;
      }
      const fresh = readLiveBoard() || world;
      sendJson(res, 200, {
        ok: true,
        relation: result.relation,
        previous: result.previous,
        message: result.message,
        ...getDiploOffersForFaction(auth.faction.id),
        economy: playerEconomy(auth.faction.id, fresh),
        ...playerSessionPayload(fresh, auth.faction),
      });
      return true;
    }

    if (action === "accept" || action === "reject" || action === "cancel") {
      const result = respondDiploOffer({
        offerId: body.offerId,
        factionId: auth.faction.id,
        accept: action === "accept",
        turn: world.meta?.turn ?? 0,
      });
      if (!result.ok) {
        sendJson(res, 400, result);
        return true;
      }
      const fresh = readLiveBoard() || world;
      sendJson(res, 200, {
        ok: true,
        offer: result.offer,
        ...getDiploOffersForFaction(auth.faction.id),
        economy: playerEconomy(auth.faction.id, world),
        ...playerSessionPayload(fresh, auth.faction),
      });
      return true;
    }

    sendJson(res, 400, { error: "unknown action" });
    return true;
  }

  return false;
}
