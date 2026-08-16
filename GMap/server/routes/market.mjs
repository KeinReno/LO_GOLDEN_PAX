/**
 * Auto-extracted from api.mjs — market routes.
 */
import {
  getMarketRatesPayload,
  writeMarketRates,
} from "../marketRates.mjs";
import {
  getOpenMarketBook,
  getOpenMarketBookForFaction,
  getMarketHistory,
} from "../marketOrders.mjs";
import {
  isCommonMarketMember,
  listCommonMembers,
  setCommonMarketMembership,
} from "../marketMembership.mjs";
import {
  getSuperpowerCatalog,
  purchaseSuperpowerListing,
} from "../superpowerMarket.mjs";
import { readLiveBoard, writeLiveBoard } from "../tableStore.mjs";
import {
  getKnownFactionIds,
  getTradePartnerIds,
  getDiplomacyRelation,
} from "../factionIntel.mjs";
import { getContent } from "../contentLoader.mjs";

/**
 * @returns {Promise<boolean>}
 */
export async function tryHandleMarketRoutes(req, res, url, ctx) {
  if (!(url.pathname.startsWith("/api/market/"))) return false;

  const {
    sendJson,
    readBody,
    requireMaster,
    authenticatePlayerFaction,
    requireMasterOrFactionAuth,
    getVisibleSystemIds,
    playerSessionPayload,
  } = ctx;

  if (url.pathname === "/api/market/book" && req.method === "GET") {
    const world = readLiveBoard();
    const bookAuth = requireMasterOrFactionAuth(req, world, null);
    if (!bookAuth.ok) {
      sendJson(res, 401, { error: bookAuth.error });
      return true;
    }
    if (!bookAuth.master) {
      const factionId = bookAuth.faction.id;
      const offers = getOpenMarketBook().filter(
        (o) => o.factionId === factionId,
      );
      sendJson(res, 200, {
        offers,
        rates: getMarketRatesPayload(getContent()),
      });
      return true;
    }
    sendJson(res, 200, {
      offers: getOpenMarketBook(),
      rates: getMarketRatesPayload(getContent()),
    });
    return true;
  }

  if (url.pathname === "/api/market/book" && req.method === "POST") {
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
    const visible = getVisibleSystemIds(world, auth.faction.id);
    const known = getKnownFactionIds(world, auth.faction.id, [...visible]);
    const partners = getTradePartnerIds(world, auth.faction.id, known);
    const venue =
      body.venue === "common" || body.venue === "contacts"
        ? body.venue
        : "all";
    const joinedCommon = isCommonMarketMember(auth.faction.id);
    const memberIds = listCommonMembers();
    sendJson(res, 200, {
      offers: getOpenMarketBookForFaction(
        auth.faction.id,
        world,
        partners,
        venue,
      ),
      tradePartnerIds: partners,
      partners: partners.map((id) => {
        const f = (world.factions ?? []).find((x) => x.id === id);
        return {
          id,
          name: f?.name ?? id,
          color: f?.color ?? null,
          relation: getDiplomacyRelation(world, auth.faction.id, id),
        };
      }),
      commonMarket: {
        joined: joinedCommon,
        memberCount: memberIds.length,
        members: memberIds.map((id) => {
          const f = (world.factions ?? []).find((x) => x.id === id);
          return {
            id,
            name: f?.name ?? id,
            color: f?.color ?? null,
          };
        }),
      },
      history: getMarketHistory(24),
      factionCurrencies: getContent().faction_currencies ?? {},
      quoteSeedMeta: getContent().market_quote_seed?.meta ?? null,
      superpowers: getSuperpowerCatalog(world, auth.faction.id),
    });
    return true;
  }

  if (url.pathname === "/api/market/membership" && req.method === "POST") {
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
    const result = setCommonMarketMembership(
      auth.faction.id,
      body.join !== false,
    );
    if (!result.ok) {
      sendJson(res, 400, result);
      return true;
    }
    sendJson(res, 200, {
      ok: true,
      joined: result.joined,
      memberCount: result.members.length,
    });
    return true;
  }

  if (url.pathname === "/api/market/superpower" && req.method === "POST") {
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
    const result = purchaseSuperpowerListing({
      world,
      factionId: auth.faction.id,
      listingId: body.listingId,
      systemId: body.systemId,
      turn: world.meta?.turn ?? 0,
    });
    if (!result.ok) {
      sendJson(res, 400, result);
      return true;
    }
    const fresh = readLiveBoard() || world;
    sendJson(res, 200, {
      ok: true,
      ...result.result,
      superpowers: getSuperpowerCatalog(fresh, auth.faction.id),
      ...playerSessionPayload(fresh, auth.faction),
    });
    return true;
  }

  if (url.pathname === "/api/market/rates" && req.method === "GET") {
    sendJson(res, 200, getMarketRatesPayload(getContent()));
    return true;
  }

  if (url.pathname === "/api/market/rates" && req.method === "POST") {
    if (!requireMaster(req)) {
      sendJson(res, 401, { error: "Неверный мастер-токен" });
      return true;
    }
    const body = await readBody(req);
    const result = writeMarketRates(body?.rates);
    sendJson(res, result.ok ? 200 : 400, result);
    return true;
  }

  return false;
}
