/**
 * Economic track HTTP — /api/diplo|gm/economic/{barter,quote,quote-settle,union}.
 * Unique vs /api/diplo/offers. Dispatched from api.mjs.
 */
import { readLiveBoard, writeLiveBoard } from "../tableStore.mjs";
import { getContent } from "../contentLoader.mjs";
import { executeEconomicRequest } from "../economicTrack.mjs";
import { resolvePlayerAuth } from "../playerAuth.mjs";

const ECO_PATH =
  /^\/api\/(diplo|gm)\/economic\/(barter|quote|quote-settle|union)$/;

/**
 * @returns {Promise<boolean>} true if handled
 */
export async function tryHandleEconomicTrackRoutes(req, res, url, ctx) {
  const ecoMatch = url.pathname.match(ECO_PATH);
  if (!ecoMatch || req.method !== "POST") return false;

  const { sendJson, readBody, requireMaster } = ctx;
  const scope = ecoMatch[1];
  const action = ecoMatch[2];
  const body = (await readBody(req)) || {};
  const world = readLiveBoard();
  if (!world) {
    sendJson(res, 404, { error: "Карта ещё не опубликована" });
    return true;
  }
  if (scope === "gm") {
    if (!requireMaster(req)) {
      sendJson(res, 401, { error: "Неверный мастер-токен" });
      return true;
    }
  } else {
    const auth = resolvePlayerAuth(req, world, { body });
    if (!auth.ok) {
      sendJson(res, 401, { error: auth.error });
      return true;
    }
    const pair =
      action === "quote"
        ? [body.factionAId, body.factionBId]
        : [body.fromFactionId, body.toFactionId || body.intoFactionId];
    const inPair =
      auth.master ||
      (auth.faction?.id && pair.includes(auth.faction.id));
    if (!inPair) {
      sendJson(res, 403, { error: "forbidden_faction" });
      return true;
    }
    if (
      action === "union" &&
      !auth.master &&
      auth.faction?.id !== body.fromFactionId
    ) {
      sendJson(res, 403, { error: "forbidden_faction" });
      return true;
    }
  }
  const result = executeEconomicRequest(action, world, body, {
    content: getContent(),
    turn: body.turn ?? world.meta?.turn ?? 0,
  });
  if (!result.ok) {
    sendJson(res, 400, { error: result.error });
    return true;
  }
  if (action === "quote" || action === "union") {
    writeLiveBoard(world, { backup: false, reason: `economic_${action}` });
  }
  sendJson(res, 200, { ok: true, ...result });
  return true;
}
