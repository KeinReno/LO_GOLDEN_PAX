import {
  configureCloudPubToken,
  configureNgrokAuthtoken,
  getPlayerShareStatus,
  startPlayerShare,
  stopPlayerShare,
} from "./playerShare.mjs";
import {
  DATA_DIR,
  PUBLISHED_PATH,
  ORDERS_PATH,
  DRAFT_PATH,
  LORE_PATH,
  INTENTS_PATH,
  ensureDataDir,
  readJson,
  writeJson,
  readLiveBoard,
  writeLiveBoard,
  getVersionPayload,
  backupTurnSnapshot,
  getTableMeta,
  setTableMeta,
  bumpTableRevision,
} from "./tableStore.mjs";
import { getContent, getPublicContent, loadContent } from "./contentLoader.mjs";
import {
  buildModifierStack,
  explainStack,
  resolveApMax,
  collectRaceEffects,
} from "./modifierStack.mjs";
import {
  readIntents,
  submitIntent,
  cancelIntent,
  reservedAp,
} from "./intents.mjs";
import { applyPlanetAction } from "./planetActions.mjs";
import {
  applySystemAction,
  listStationCatalog,
} from "./systemActions.mjs";
import { processTurn, getLastJournal } from "./processTurn.mjs";
import { getFactionBriefing } from "./briefingFilter.mjs";
import { startTickScheduler, getSchedulerStatus } from "./tickScheduler.mjs";
import {
  requireMasterHeader,
  masterTokenInfo,
  checkMasterToken,
  writeMasterTokenFile,
  resolveMasterToken,
} from "./auth.mjs";
import {
  getTurnHealth,
  runOpsBackup,
  clearTickAlerts,
  startBackupScheduler,
} from "./opsHealth.mjs";
import {
  readFog,
  paintFog,
  addPermanentReveal,
  resolveVisibleWithFog,
} from "./fogStore.mjs";
import {
  getFactionPublicEco,
  publicEconomyPayload,
  readLedger,
  ensureAllFactions,
  writeLedger,
} from "./ledger.mjs";
import { queueTaxChange } from "./economyTick.mjs";
import {
  getMarketRatesPayload,
  writeMarketRates,
} from "./marketRates.mjs";
import {
  getOpenMarketBook,
  getOpenMarketBookForFaction,
  getMarketHistory,
} from "./marketOrders.mjs";
import {
  getKnownFactionIds,
  getTradePartnerIds,
  getDiplomacyRelation,
} from "./factionIntel.mjs";
import {
  getDiploOffersForFaction,
  createDiploOffer,
  respondDiploOffer,
} from "./diploOffers.mjs";
import {
  isCommonMarketMember,
  listCommonMembers,
  setCommonMarketMembership,
} from "./marketMembership.mjs";
import {
  getSuperpowerCatalog,
  purchaseSuperpowerListing,
} from "./superpowerMarket.mjs";
import {
  readEngagements,
  setEngagementStance,
} from "./engagements.mjs";
import {
  applyPresetToSystems,
  scheduleTimer,
} from "./narrative.mjs";
import {
  readRpIndex,
  ensureRp,
  ensurePlayerChannels,
  filterIndexForViewer,
  episodeVisibleTo,
  pickHomeEpisode,
  createChapter,
  createEpisode,
  closeEpisode,
  reopenEpisode,
  readMessages,
  appendMessage,
  patchMessageIntentId,
  DEFAULT_CAMPAIGN,
} from "./rpStore.mjs";
import { storePing, getDataFileSizes } from "./db/storeAdapter.mjs";

export {
  DATA_DIR,
  PUBLISHED_PATH,
  ORDERS_PATH,
  DRAFT_PATH,
  LORE_PATH,
  ensureDataDir,
  readJson,
  writeJson,
};

const MASTER_TOKEN_BOOT = resolveMasterToken();

function requireMaster(req) {
  return requireMasterHeader(req);
}

function getVisibleSystemIds(world, factionId) {
  return resolveVisibleWithFog(world, factionId, readFog());
}

function authenticatePlayerFaction(body, world) {
  const faction = (world.factions ?? []).find((f) => f.id === body.factionId);
  if (!faction || faction.password !== body.password) {
    return { ok: false, error: "Неверный пароль государства" };
  }
  return { ok: true, faction };
}

function playerSessionPayload(world, faction) {
  const filtered = filterWorldForFaction(world, faction.id);
  const eco = getFactionPublicEco(faction.id);
  const apMax = eco.rules?.apPerTurn
    ? resolveApMax(eco.rules.apPerTurn, buildModifierStack([]))
    : resolveApMax(getContent().rules?.apPerTurn ?? 3, buildModifierStack([]));
  const diploOffers = getDiploOffersForFaction(faction.id);
  return {
    factionId: faction.id,
    updatedAt: world.meta?.updatedAt ?? null,
    tableRevision: world.meta?.tableRevision ?? 0,
    apMax,
    reservedAp: reservedAp(faction.id, world.meta?.turn ?? 0),
    economy: publicEconomyPayload(eco),
    briefing: getFactionBriefing(faction.id, world),
    diploOffers,
    ...filtered,
  };
}

function filterWorldForFaction(world, factionId) {
  const visible = getVisibleSystemIds(world, factionId);
  const knownIds = getKnownFactionIds(world, factionId, [...visible]);
  const tradePartnerIds = getTradePartnerIds(world, factionId, knownIds);
  const systems = (world.systems ?? []).filter((s) => visible.has(s.id));
  const systemSet = new Set(systems.map((s) => s.id));
  const links = (world.links ?? []).filter(
    (l) => systemSet.has(l.fromId) && systemSet.has(l.toId),
  );
  const fleets = (world.fleets ?? []).filter(
    (f) => f.factionId === factionId || systemSet.has(f.systemId),
  );
  const legions = (world.legions ?? []).filter(
    (l) => l.factionId === factionId || systemSet.has(l.systemId),
  );
  const playerOrders = readJson(ORDERS_PATH, []).filter(
    (o) => o.factionId === factionId,
  );
  const factions = (world.factions ?? [])
    .filter((f) => knownIds.has(f.id))
    .map((f) => {
      const { gmNotes: _fgm, ...rest } = f;
      const npcs = (f.npcs ?? []).map((n) => {
        const { gmNotes: _ngm, ...nRest } = n;
        if (f.id !== factionId && n.status === "hidden") return null;
        return nRest;
      }).filter(Boolean);
      return {
        ...rest,
        password: f.id === factionId ? f.password : "••••",
        // Other polities: hide court details; own faction keeps public court.
        notes: f.id === factionId ? f.notes : undefined,
        npcs: f.id === factionId ? npcs : undefined,
      };
    });
  const diplomacy = (world.diplomacy ?? []).filter((d) => {
    const touchesSelf = d.aId === factionId || d.bId === factionId;
    if (!touchesSelf) return false;
    const other = d.aId === factionId ? d.bId : d.aId;
    return knownIds.has(other);
  });

  return {
    visibleSystemIds: [...visible],
    knownFactionIds: [...knownIds],
    tradePartnerIds,
    world: {
      ...world,
      systems: systems.map((s) => {
        const { notes, gmNotes, timers, ...rest } = s;
        return rest;
      }),
      links,
      fleets,
      legions,
      orders: playerOrders,
      factions,
      diplomacy,
    },
  };
}

function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function buildOpsHealthResponse() {
  const auth = masterTokenInfo();
  const health = getTurnHealth({
    cron: getContent().rules?.tickCron || "1 0 * * *",
    timezone: getContent().rules?.tickTimezone || "Europe/Moscow",
  });
  const storeRaw = storePing();
  const { betterSqlite3, ...storeRest } = storeRaw;
  return {
    ...health,
    tokenIsDefault: auth.isDefault,
    auth,
    scheduler: getSchedulerStatus(),
    store: { ...storeRest, betterSqlite3 },
    dataSizes: getDataFileSizes(),
  };
}

/**
 * Connect-style middleware for Vite / Express.
 */
export function createApiMiddleware() {
  ensureDataDir();
  loadContent();
  resolveMasterToken();
  startTickScheduler({
    getCron: () => getContent().rules?.tickCron || "1 0 * * *",
    getTimezone: () => getContent().rules?.tickTimezone || "Europe/Moscow",
    onTick: () => processTurn({ force: false }),
  });
  startBackupScheduler();

  return async function gmapApi(req, res, next) {
    const url = new URL(req.url || "/", "http://localhost");
    if (!url.pathname.startsWith("/api/")) {
      next?.();
      return;
    }

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, X-Master-Token, X-Faction-Id, X-Faction-Password",
    );
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }

    try {
      if (url.pathname === "/api/health" && req.method === "GET") {
        sendJson(res, 200, {
          ok: true,
          version: getVersionPayload(),
          contentLoadedAt: getContent().loadedAt,
        });
        return;
      }

      if (url.pathname === "/api/content" && req.method === "GET") {
        if (url.searchParams.get("reload") === "1" && requireMaster(req)) {
          loadContent();
        }
        sendJson(res, 200, getPublicContent());
        return;
      }

      if (url.pathname === "/api/store/ping" && req.method === "GET") {
        sendJson(res, 200, storePing());
        return;
      }

      if (url.pathname === "/api/content/stack-preview" && req.method === "POST") {
        const body = await readBody(req);
        const effects = Array.isArray(body.effects) ? [...body.effects] : [];
        if (body.raceComposition) {
          effects.push(
            ...collectRaceEffects(getContent().races, body.raceComposition),
          );
        }
        const stack = buildModifierStack(effects, {
          mergeOrder: getContent().rules?.economyMergeOrder,
        });
        sendJson(res, 200, {
          apMax: resolveApMax(getContent().rules?.apPerTurn ?? 3, stack),
          explain: explainStack(stack),
          channels: stack.channels,
        });
        return;
      }

      // ===== New economy model: slot resolver + flow matrix =====
      if (url.pathname === "/api/economy/resource-index" && req.method === "GET") {
        const { buildResourceIndex } = await import("./slotResolver.mjs");
        sendJson(res, 200, buildResourceIndex(getContent()));
        return;
      }

      if (url.pathname === "/api/economy/resolve-slots" && req.method === "POST") {
        const body = await readBody(req);
        const c = getContent();
        const { resolveVariant, resolveSlots, buildResourceIndex } = await import(
          "./slotResolver.mjs"
        );
        const idx = buildResourceIndex(c);
        let consumer = null;
        const coll = body.collection === "ship" ? c.ships : body.collection === "unit" ? c.units : c.buildings;
        if (body.id && coll?.[body.id]) consumer = coll[body.id];
        else if (body.id) consumer = resolveVariant(body.id, c);
        if (!consumer) {
          sendJson(res, 404, { error: "consumer not found" });
          return;
        }
        sendJson(res, 200, {
          consumer,
          slots: resolveSlots(consumer, idx),
        });
        return;
      }

      if (url.pathname === "/api/economy/flows" && req.method === "GET") {
        const fid = url.searchParams.get("factionId");
        if (!fid) {
          sendJson(res, 400, { error: "factionId required" });
          return;
        }
        const world = readLiveBoard();
        if (!world) {
          sendJson(res, 503, { error: "live board not loaded" });
          return;
        }
        const { computeFlowBreakdown } = await import("./economyTick.mjs");
        const ledger = ensureAllFactions(readLedger(), world);
        const eco = ledger.factions[fid] || null;
        sendJson(res, 200, computeFlowBreakdown(world, fid, getContent(), eco));
        return;
      }

      if (url.pathname === "/api/market/book" && req.method === "GET") {
        // Unfiltered book — master tools / diagnostics.
        sendJson(res, 200, { offers: getOpenMarketBook() });
        return;
      }

      if (url.pathname === "/api/diplo/offers" && req.method === "POST") {
        const body = await readBody(req);
        const world = readLiveBoard();
        if (!world) {
          sendJson(res, 404, { error: "Карта ещё не опубликована" });
          return;
        }
        const auth = authenticatePlayerFaction(body, world);
        if (!auth.ok) {
          sendJson(res, 401, { error: auth.error });
          return;
        }
        const visible = getVisibleSystemIds(world, auth.faction.id);
        const known = getKnownFactionIds(world, auth.faction.id, [...visible]);
        const action = body.action || "create";

        if (action === "list") {
          sendJson(res, 200, {
            ok: true,
            ...getDiploOffersForFaction(auth.faction.id),
            economy: publicEconomyPayload(getFactionPublicEco(auth.faction.id)),
          });
          return;
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
            return;
          }
          sendJson(res, 200, {
            ok: true,
            offer: result.offer,
            ...getDiploOffersForFaction(auth.faction.id),
            economy: publicEconomyPayload(getFactionPublicEco(auth.faction.id)),
            ...playerSessionPayload(world, auth.faction),
          });
          return;
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
            return;
          }
          const fresh = readLiveBoard() || world;
          sendJson(res, 200, {
            ok: true,
            offer: result.offer,
            ...getDiploOffersForFaction(auth.faction.id),
            economy: publicEconomyPayload(getFactionPublicEco(auth.faction.id)),
            ...playerSessionPayload(fresh, auth.faction),
          });
          return;
        }

        sendJson(res, 400, { error: "unknown action" });
        return;
      }

      if (url.pathname === "/api/market/book" && req.method === "POST") {
        const body = await readBody(req);
        const world = readLiveBoard();
        if (!world) {
          sendJson(res, 404, { error: "Карта ещё не опубликована" });
          return;
        }
        const auth = authenticatePlayerFaction(body, world);
        if (!auth.ok) {
          sendJson(res, 401, { error: auth.error });
          return;
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
        return;
      }

      if (url.pathname === "/api/market/membership" && req.method === "POST") {
        const body = await readBody(req);
        const world = readLiveBoard();
        if (!world) {
          sendJson(res, 404, { error: "Карта ещё не опубликована" });
          return;
        }
        const auth = authenticatePlayerFaction(body, world);
        if (!auth.ok) {
          sendJson(res, 401, { error: auth.error });
          return;
        }
        const result = setCommonMarketMembership(
          auth.faction.id,
          body.join !== false,
        );
        if (!result.ok) {
          sendJson(res, 400, result);
          return;
        }
        sendJson(res, 200, {
          ok: true,
          joined: result.joined,
          memberCount: result.members.length,
        });
        return;
      }

      if (url.pathname === "/api/market/superpower" && req.method === "POST") {
        const body = await readBody(req);
        const world = readLiveBoard();
        if (!world) {
          sendJson(res, 404, { error: "Карта ещё не опубликована" });
          return;
        }
        const auth = authenticatePlayerFaction(body, world);
        if (!auth.ok) {
          sendJson(res, 401, { error: auth.error });
          return;
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
          return;
        }
        const fresh = readLiveBoard() || world;
        sendJson(res, 200, {
          ok: true,
          ...result.result,
          superpowers: getSuperpowerCatalog(fresh, auth.faction.id),
          ...playerSessionPayload(fresh, auth.faction),
        });
        return;
      }

      if (url.pathname === "/api/table" && req.method === "GET") {
        if (!requireMaster(req)) {
          sendJson(res, 401, { error: "Неверный мастер-токен" });
          return;
        }
        const world = readLiveBoard();
        if (!world) {
          sendJson(res, 404, {
            error: "Live board пуст — сохраните/опубликуйте кампанию",
            mode: "empty",
          });
          return;
        }
        sendJson(res, 200, {
          mode: "live",
          world,
          version: getVersionPayload(),
          intents: readIntents().filter((i) => i.status === "pending"),
        });
        return;
      }

      if (url.pathname === "/api/table/backup" && req.method === "POST") {
        if (!requireMaster(req)) {
          sendJson(res, 401, { error: "Неверный мастер-токен" });
          return;
        }
        const world = readLiveBoard();
        const dir = backupTurnSnapshot(world?.meta?.turn ?? 0, "manual");
        sendJson(res, 200, { ok: true, dir });
        return;
      }

      if (url.pathname === "/api/fog" && req.method === "GET") {
        if (!requireMaster(req)) {
          sendJson(res, 401, { error: "Неверный мастер-токен" });
          return;
        }
        sendJson(res, 200, readFog());
        return;
      }

      if (url.pathname === "/api/fog/paint" && req.method === "POST") {
        if (!requireMaster(req)) {
          sendJson(res, 401, { error: "Неверный мастер-токен" });
          return;
        }
        const body = await readBody(req);
        if (!body?.factionId || !Array.isArray(body.systemIds)) {
          sendJson(res, 400, { error: "factionId + systemIds[]" });
          return;
        }
        const fog = paintFog(
          body.factionId,
          body.systemIds,
          body.mode === "erase" ? "erase" : "paint",
        );
        bumpTableRevision();
        sendJson(res, 200, { ok: true, fog, version: getVersionPayload() });
        return;
      }

      if (url.pathname === "/api/fog/reveal" && req.method === "POST") {
        if (!requireMaster(req)) {
          sendJson(res, 401, { error: "Неверный мастер-токен" });
          return;
        }
        const body = await readBody(req);
        if (!body?.factionId || !body?.systemId) {
          sendJson(res, 400, { error: "factionId + systemId" });
          return;
        }
        const fog = addPermanentReveal(body.factionId, body.systemId);
        bumpTableRevision();
        sendJson(res, 200, { ok: true, fog });
        return;
      }

      if (url.pathname === "/api/ledger" && req.method === "GET") {
        if (!requireMaster(req)) {
          sendJson(res, 401, { error: "Неверный мастер-токен" });
          return;
        }
        const world = readLiveBoard();
        const ledger = world
          ? ensureAllFactions(readLedger(), world)
          : readLedger();
        if (world) writeLedger(ledger);
        sendJson(res, 200, ledger);
        return;
      }

      if (url.pathname === "/api/engagements" && req.method === "GET") {
        const list = readEngagements();
        if (requireMaster(req)) {
          sendJson(res, 200, { engagements: list });
          return;
        }
        const factionId = req.headers["x-faction-id"];
        if (!factionId) {
          sendJson(res, 401, { error: "Нужен master token или X-Faction-Id" });
          return;
        }
        sendJson(res, 200, {
          engagements: list.filter((e) =>
            (e.sides || []).some((s) => s.factionId === factionId),
          ),
        });
        return;
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
          return;
        }
        const isMaster = requireMaster(req);
        const faction = (world.factions ?? []).find(
          (f) => f.id === body.factionId,
        );
        if (!isMaster) {
          if (!faction || faction.password !== body.password) {
            sendJson(res, 401, { error: "Неверный пароль" });
            return;
          }
        }
        const result = setEngagementStance(
          engagementId,
          body.factionId,
          body.stance,
        );
        sendJson(res, result.ok ? 200 : 400, result);
        return;
      }

      if (url.pathname === "/api/narrative/paint" && req.method === "POST") {
        if (!requireMaster(req)) {
          sendJson(res, 401, { error: "Неверный мастер-токен" });
          return;
        }
        const body = await readBody(req);
        const world = readLiveBoard();
        if (!world) {
          sendJson(res, 404, { error: "Нет board" });
          return;
        }
        const content = getContent();
        const preset =
          content.consequences?.[body.presetId] ||
          content.system_presets?.[body.presetId];
        if (!preset) {
          sendJson(res, 400, { error: "unknown preset" });
          return;
        }
        const journal = [];
        const result = applyPresetToSystems(
          world,
          body.systemIds || [],
          preset,
          world.meta?.turn ?? 0,
          journal,
        );
        if (!result.ok) {
          sendJson(res, 400, result);
          return;
        }
        const written = writeLiveBoard(world, {
          backup: false,
          reason: "narrative_paint",
        });
        sendJson(res, 200, { ok: true, ...result, journal, ...written });
        return;
      }

      if (url.pathname === "/api/narrative/timer" && req.method === "POST") {
        if (!requireMaster(req)) {
          sendJson(res, 401, { error: "Неверный мастер-токен" });
          return;
        }
        const body = await readBody(req);
        const world = readLiveBoard();
        if (!world) {
          sendJson(res, 404, { error: "Нет board" });
          return;
        }
        const ids = body.systemIds || (body.systemId ? [body.systemId] : []);
        if (!ids.length) {
          sendJson(res, 400, { error: "systemId(s) required" });
          return;
        }
        const turns = Math.max(
          1,
          Math.floor(body.turns ?? body.turnsRemaining ?? 2),
        );
        const turn = world.meta?.turn ?? 0;
        let touched = 0;
        const updated = [];
        for (const sys of world.systems ?? []) {
          if (!ids.includes(sys.id)) continue;
          scheduleTimer(sys, {
            expiresTurn: turn + turns,
            action: body.action || { kind: "clear_activity" },
            label: body.label || null,
          });
          updated.push({ id: sys.id, timers: sys.timers });
          touched++;
        }
        if (!touched) {
          sendJson(res, 404, { error: "system missing" });
          return;
        }
        writeLiveBoard(world, { backup: false, reason: "timer" });
        sendJson(res, 200, { ok: true, count: touched, systems: updated });
        return;
      }

      if (url.pathname === "/api/narrative/gm-note" && req.method === "POST") {
        if (!requireMaster(req)) {
          sendJson(res, 401, { error: "Неверный мастер-токен" });
          return;
        }
        const body = await readBody(req);
        const world = readLiveBoard();
        if (!world) {
          sendJson(res, 404, { error: "Нет board" });
          return;
        }
        const ids = body.systemIds || (body.systemId ? [body.systemId] : []);
        for (const sys of world.systems ?? []) {
          if (!ids.includes(sys.id)) continue;
          sys.gmNotes = body.gmNotes ?? body.notes ?? "";
          if (body.notes != null) sys.notes = body.notes;
        }
        writeLiveBoard(world, { backup: false, reason: "gm_note" });
        sendJson(res, 200, { ok: true, count: ids.length });
        return;
      }

      // ── RP / Campaign (P7) ─────────────────────────────────
      if (url.pathname === "/api/rp" && req.method === "GET") {
        const campaignId =
          url.searchParams.get("campaignId") || DEFAULT_CAMPAIGN;
        const isMaster = requireMaster(req);
        const factionId = req.headers["x-faction-id"] || null;
        if (!isMaster && !factionId) {
          sendJson(res, 401, { error: "master или X-Faction-Id" });
          return;
        }
        const world = readLiveBoard();
        const factions = world?.factions ?? [];
        let index = ensurePlayerChannels(factions, campaignId);
        index = filterIndexForViewer(index, { isMaster, factionId });
        const home =
          !isMaster && factionId
            ? pickHomeEpisode(index, factionId)
            : { chapterId: "", episodeId: "" };
        sendJson(res, 200, { ...index, home });
        return;
      }

      if (url.pathname === "/api/rp/chapter" && req.method === "POST") {
        if (!requireMaster(req)) {
          sendJson(res, 401, { error: "Неверный мастер-токен" });
          return;
        }
        const body = await readBody(req);
        const result = createChapter(
          body.title,
          body.campaignId || DEFAULT_CAMPAIGN,
        );
        sendJson(res, 200, result);
        return;
      }

      if (url.pathname === "/api/rp/episode" && req.method === "POST") {
        if (!requireMaster(req)) {
          sendJson(res, 401, { error: "Неверный мастер-токен" });
          return;
        }
        const body = await readBody(req);
        const result = createEpisode(
          body.chapterId,
          {
            title: body.title,
            visibility: body.visibility,
            ref: body.ref,
          },
          body.campaignId || DEFAULT_CAMPAIGN,
        );
        sendJson(res, result.ok ? 200 : 400, result);
        return;
      }

      if (url.pathname === "/api/rp/episode/close" && req.method === "POST") {
        if (!requireMaster(req)) {
          sendJson(res, 401, { error: "Неверный мастер-токен" });
          return;
        }
        const body = await readBody(req);
        const result = body.reopen
          ? reopenEpisode(
              body.chapterId,
              body.episodeId,
              body.campaignId || DEFAULT_CAMPAIGN,
            )
          : closeEpisode(
              body.chapterId,
              body.episodeId,
              body.campaignId || DEFAULT_CAMPAIGN,
            );
        sendJson(res, result.ok ? 200 : 400, result);
        return;
      }

      if (url.pathname === "/api/rp/messages" && req.method === "GET") {
        const chapterId = url.searchParams.get("chapterId");
        const episodeId = url.searchParams.get("episodeId");
        const campaignId =
          url.searchParams.get("campaignId") || DEFAULT_CAMPAIGN;
        if (!chapterId || !episodeId) {
          sendJson(res, 400, { error: "chapterId + episodeId" });
          return;
        }
        const isMaster = requireMaster(req);
        const factionId = req.headers["x-faction-id"] || null;
        if (!isMaster && !factionId) {
          sendJson(res, 401, { error: "master или X-Faction-Id" });
          return;
        }
        const index = ensureRp(campaignId);
        const ch = (index.chapters || []).find((c) => c.id === chapterId);
        const ep = (ch?.episodes || []).find((e) => e.id === episodeId);
        if (
          !episodeVisibleTo(ep, { isMaster, factionId })
        ) {
          sendJson(res, 403, { error: "нет доступа к каналу" });
          return;
        }
        const messages = readMessages(
          chapterId,
          episodeId,
          { isMaster, factionId },
          campaignId,
        );
        sendJson(res, 200, { messages });
        return;
      }

      if (url.pathname === "/api/rp/messages" && req.method === "POST") {
        const body = await readBody(req);
        const world = readLiveBoard();
        const isMaster = requireMaster(req);
        let authorFactionId = body.authorFactionId || null;
        let authorName = body.authorName || null;
        let authorAvatarUrl = body.authorAvatarUrl || null;

        if (!isMaster) {
          if (!world) {
            sendJson(res, 404, { error: "Нет board" });
            return;
          }
          const faction = (world.factions ?? []).find(
            (f) => f.id === body.factionId,
          );
          if (!faction || faction.password !== body.password) {
            sendJson(res, 401, { error: "Неверный пароль" });
            return;
          }
          authorFactionId = faction.id;
          authorName = body.authorName || faction.name;
          authorAvatarUrl =
            body.authorAvatarUrl || faction.avatarUrl || null;
        } else {
          authorName = body.authorName || "Мастер";
        }

        const campaignId = body.campaignId || DEFAULT_CAMPAIGN;
        const result = appendMessage(
          body.chapterId,
          body.episodeId,
          {
            type: body.type,
            body: body.body,
            authorFactionId,
            authorName,
            authorAvatarUrl,
            visibility: body.visibility,
            intentPayload: body.intent || null,
            isMaster,
          },
          campaignId,
        );
        if (!result.ok) {
          sendJson(res, 400, result);
          return;
        }

        // Action → same intent inbox (does not touch ledger directly)
        let intentResult = null;
        if (
          body.type === "action" &&
          body.intent?.defId &&
          authorFactionId &&
          world
        ) {
          const apMax = resolveApMax(
            getContent().rules?.apPerTurn ?? 3,
            buildModifierStack([]),
          );
          intentResult = submitIntent({
            factionId: authorFactionId,
            defId: body.intent.defId,
            payload: body.intent.payload || {},
            note: body.intent.note || body.body?.slice(0, 120) || "RP action",
            source: "rp",
            turn: world.meta?.turn ?? 0,
            apMax,
            world,
          });
          if (intentResult.ok) {
            patchMessageIntentId(
              body.chapterId,
              body.episodeId,
              result.message.id,
              intentResult.intent.id,
              campaignId,
            );
            result.message.intentId = intentResult.intent.id;
          }
        }

        sendJson(res, 200, {
          ok: true,
          message: result.message,
          intent: intentResult,
        });
        return;
      }

      if (url.pathname.startsWith("/api/ledger/") && req.method === "GET") {
        const factionId = url.pathname.split("/")[3];
        if (requireMaster(req)) {
          sendJson(res, 200, getFactionPublicEco(factionId));
          return;
        }
        const world = readLiveBoard();
        const pw = req.headers["x-faction-password"];
        const fac = (world?.factions ?? []).find((f) => f.id === factionId);
        if (!fac || fac.password !== pw) {
          sendJson(res, 401, { error: "Неверный пароль" });
          return;
        }
        sendJson(res, 200, getFactionPublicEco(factionId));
        return;
      }

      if (url.pathname === "/api/economy/research" && req.method === "POST") {
        const body = await readBody(req);
        const world = readLiveBoard();
        if (!world) {
          sendJson(res, 404, { error: "Нет board" });
          return;
        }
        const isMaster = requireMaster(req);
        const faction = (world.factions ?? []).find((f) => f.id === body.factionId);
        if (!isMaster) {
          if (!faction || faction.password !== body.password) {
            sendJson(res, 401, { error: "Неверный пароль" });
            return;
          }
        }
        if (!body.techId) {
          sendJson(res, 400, { error: "techId required" });
          return;
        }
        const { researchTech } = await import("./techActions.mjs");
        const result = researchTech(body.factionId, body.techId, {
          turn: world.meta?.turn ?? null,
        });
        if (!result.ok) {
          sendJson(res, 400, result);
          return;
        }
        sendJson(res, 200, {
          ok: true,
          tech: result.tech,
          economy: getFactionPublicEco(body.factionId),
        });
        return;
      }

      if (url.pathname === "/api/economy/set-tax" && req.method === "POST") {
        const body = await readBody(req);
        const world = readLiveBoard();
        if (!world) {
          sendJson(res, 404, { error: "Нет board" });
          return;
        }
        const isMaster = requireMaster(req);
        const faction = (world.factions ?? []).find((f) => f.id === body.factionId);
        if (!isMaster) {
          if (!faction || faction.password !== body.password) {
            sendJson(res, 401, { error: "Неверный пароль" });
            return;
          }
        }
        // Queue via intent for AP, or master direct queue
        if (isMaster && body.direct) {
          const result = queueTaxChange(
            body.factionId,
            body.taxSlot,
            body.tierId,
          );
          sendJson(res, result.ok ? 200 : 400, result);
          return;
        }
        const apMax = resolveApMax(
          getContent().rules?.apPerTurn ?? 3,
          buildModifierStack([]),
        );
        const result = submitIntent({
          factionId: body.factionId,
          defId: "intent.set_tax",
          payload: { taxSlot: body.taxSlot, tierId: body.tierId },
          note: body.note,
          source: "map",
          turn: world.meta?.turn ?? 0,
          apMax,
          world,
        });
        sendJson(res, result.ok ? 200 : 400, result);
        return;
      }

      if (url.pathname === "/api/market/rates" && req.method === "GET") {
        sendJson(res, 200, getMarketRatesPayload(getContent()));
        return;
      }

      if (url.pathname === "/api/market/rates" && req.method === "POST") {
        if (!requireMaster(req)) {
          sendJson(res, 401, { error: "Неверный мастер-токен" });
          return;
        }
        const body = await readBody(req);
        const result = writeMarketRates(body?.rates);
        sendJson(res, result.ok ? 200 : 400, result);
        return;
      }

      if (url.pathname === "/api/turn/tick" && req.method === "POST") {
        if (!requireMaster(req)) {
          sendJson(res, 401, { error: "Неверный мастер-токен" });
          return;
        }
        const body = await readBody(req);
        const result = processTurn({ force: !!body?.force, master: true });
        sendJson(res, result.ok ? 200 : 400, result);
        return;
      }

      if (url.pathname === "/api/player/briefing" && req.method === "GET") {
        const world = readLiveBoard();
        if (!world) {
          sendJson(res, 404, { error: "Карта ещё не опубликована" });
          return;
        }
        const factionId =
          url.searchParams.get("factionId") || req.headers["x-faction-id"];
        const password =
          url.searchParams.get("password") || req.headers["x-faction-password"];
        const fac = (world.factions ?? []).find((f) => f.id === factionId);
        if (!fac || fac.password !== password) {
          sendJson(res, 401, { error: "Неверный пароль государства" });
          return;
        }
        sendJson(res, 200, {
          briefing: getFactionBriefing(factionId, world),
          turn: world.meta?.turn ?? null,
        });
        return;
      }

      if (url.pathname === "/api/turn/journal" && req.method === "GET") {
        sendJson(res, 200, { journal: getLastJournal(), meta: getTableMeta() });
        return;
      }

      if (url.pathname === "/api/turn/freeze" && req.method === "POST") {
        if (!requireMaster(req)) {
          sendJson(res, 401, { error: "Неверный мастер-токен" });
          return;
        }
        const body = await readBody(req);
        const meta = setTableMeta({ tickFrozen: !!body?.frozen });
        sendJson(res, 200, { ok: true, meta });
        return;
      }

      if (
        (url.pathname === "/api/turn/health" ||
          url.pathname === "/api/ops/health") &&
        req.method === "GET"
      ) {
        if (!requireMaster(req)) {
          sendJson(res, 401, { error: "Неверный мастер-токен" });
          return;
        }
        sendJson(res, 200, buildOpsHealthResponse());
        return;
      }

      if (url.pathname === "/api/turn/alerts/clear" && req.method === "POST") {
        if (!requireMaster(req)) {
          sendJson(res, 401, { error: "Неверный мастер-токен" });
          return;
        }
        sendJson(res, 200, clearTickAlerts());
        return;
      }

      if (url.pathname === "/api/backup/run" && req.method === "POST") {
        if (!requireMaster(req)) {
          sendJson(res, 401, { error: "Неверный мастер-токен" });
          return;
        }
        const body = await readBody(req);
        const result = runOpsBackup(body?.reason || "manual");
        sendJson(res, 200, result);
        return;
      }

      if (url.pathname === "/api/auth/info" && req.method === "GET") {
        if (!requireMaster(req)) {
          sendJson(res, 401, { error: "Неверный мастер-токен" });
          return;
        }
        sendJson(res, 200, masterTokenInfo());
        return;
      }

      if (url.pathname === "/api/auth/token" && req.method === "POST") {
        if (!requireMaster(req)) {
          sendJson(res, 401, { error: "Неверный мастер-токен" });
          return;
        }
        const body = await readBody(req);
        const result = writeMasterTokenFile(body?.token);
        sendJson(res, result.ok ? 200 : 400, result);
        return;
      }

      if (url.pathname === "/api/intents" && req.method === "GET") {
        if (requireMaster(req)) {
          sendJson(res, 200, readIntents());
          return;
        }
        const factionId = req.headers["x-faction-id"];
        if (!factionId) {
          sendJson(res, 401, { error: "Нужен master token или X-Faction-Id" });
          return;
        }
        sendJson(
          res,
          200,
          readIntents().filter((i) => i.factionId === factionId),
        );
        return;
      }

      if (url.pathname === "/api/intents" && req.method === "POST") {
        const body = await readBody(req);
        const world = readLiveBoard();
        if (!world) {
          sendJson(res, 404, { error: "Карта ещё не опубликована" });
          return;
        }
        const faction = (world.factions ?? []).find((f) => f.id === body.factionId);
        if (!faction || faction.password !== body.password) {
          sendJson(res, 401, { error: "Неверный пароль" });
          return;
        }
        const apMax = resolveApMax(
          getContent().rules?.apPerTurn ?? 3,
          buildModifierStack([]),
        );
        const defId =
          body.defId ||
          (body.type?.startsWith("intent.")
            ? body.type
            : `intent.${body.type}`);
        const result = submitIntent({
          factionId: faction.id,
          defId,
          payload: body.payload || {
            fleetId: body.fleetId,
            legionId: body.legionId,
            fromSystemId: body.fromSystemId,
            toSystemId: body.toSystemId,
          },
          note: body.note,
          source: body.source || "map",
          turn: world.meta?.turn ?? 0,
          apMax,
          world,
        });
        if (!result.ok) {
          sendJson(res, 400, result);
          return;
        }
        sendJson(res, 200, {
          ok: true,
          intent: result.intent,
          reservedAp: reservedAp(faction.id, world.meta?.turn ?? 0),
          apMax,
        });
        return;
      }

      if (
        url.pathname.startsWith("/api/intents/") &&
        url.pathname.endsWith("/cancel") &&
        req.method === "POST"
      ) {
        const body = await readBody(req);
        const intentId = url.pathname.split("/")[3];
        const world = readLiveBoard();
        const faction = (world?.factions ?? []).find((f) => f.id === body.factionId);
        if (!faction || faction.password !== body.password) {
          sendJson(res, 401, { error: "Неверный пароль" });
          return;
        }
        const result = cancelIntent(intentId, faction.id);
        if (!result.ok) {
          sendJson(res, 400, result);
          return;
        }
        const turn = world?.meta?.turn ?? 0;
        sendJson(res, 200, {
          ...result,
          reservedAp: reservedAp(faction.id, turn),
          apMax: resolveApMax(
            getContent().rules?.apPerTurn ?? 3,
            buildModifierStack([]),
          ),
        });
        return;
      }

      /** Public status for UI (no secrets). */
      if (url.pathname === "/api/players/share" && req.method === "GET") {
        sendJson(res, 200, getPlayerShareStatus());
        return;
      }

      /** Publish + open tunnel; returns copyable /view URL. */
      if (url.pathname === "/api/players/share" && req.method === "POST") {
        const token = req.headers["x-master-token"];
        if (!checkMasterToken(token)) {
          sendJson(res, 401, { error: "Неверный мастер-токен" });
          return;
        }
        const body = await readBody(req);
        if (body?.world?.meta && Array.isArray(body.world.systems)) {
          writeLiveBoard(body.world, { backup: true, reason: "share_publish" });
        } else {
          const published = readLiveBoard();
          if (!published) {
            sendJson(res, 400, {
              error:
                "Карта ещё не опубликована — передай world в теле или нажми «Опубликовать»",
            });
            return;
          }
        }

        try {
          const hostHeader = String(req.headers.host || "");
          const portFromHost = Number(hostHeader.split(":")[1]);
          const share = await startPlayerShare({
            prefer: body?.prefer,
            force: body?.force === true,
            ngrokAuthtoken: body?.ngrokAuthtoken,
            cloudpubToken: body?.cloudpubToken,
            localPort:
              Number(body?.port) ||
              (Number.isFinite(portFromHost) ? portFromHost : undefined),
          });
          if (!share.viewUrl) {
            sendJson(res, 502, {
              error: share.error || "Туннель не поднялся",
              share,
            });
            return;
          }
          sendJson(res, 200, { ok: true, ...share });
        } catch (e) {
          sendJson(res, 502, {
            error: e instanceof Error ? e.message : String(e),
            share: getPlayerShareStatus(),
          });
        }
        return;
      }

      if (url.pathname === "/api/players/ngrok-token" && req.method === "POST") {
        const token = req.headers["x-master-token"];
        if (!checkMasterToken(token)) {
          sendJson(res, 401, { error: "Неверный мастер-токен" });
          return;
        }
        const body = await readBody(req);
        try {
          sendJson(res, 200, configureNgrokAuthtoken(body?.token));
        } catch (e) {
          sendJson(res, 400, {
            error: e instanceof Error ? e.message : String(e),
          });
        }
        return;
      }

      if (url.pathname === "/api/players/cloudpub-token" && req.method === "POST") {
        const token = req.headers["x-master-token"];
        if (!checkMasterToken(token)) {
          sendJson(res, 401, { error: "Неверный мастер-токен" });
          return;
        }
        const body = await readBody(req);
        try {
          sendJson(res, 200, configureCloudPubToken(body?.token));
        } catch (e) {
          sendJson(res, 400, {
            error: e instanceof Error ? e.message : String(e),
          });
        }
        return;
      }

      if (url.pathname === "/api/players/share/stop" && req.method === "POST") {
        const token = req.headers["x-master-token"];
        if (!checkMasterToken(token)) {
          sendJson(res, 401, { error: "Неверный мастер-токен" });
          return;
        }
        sendJson(res, 200, stopPlayerShare());
        return;
      }

      if (url.pathname === "/api/factions" && req.method === "GET") {
        const world = readLiveBoard();
        if (!world) {
          sendJson(res, 404, { error: "Карта ещё не опубликована" });
          return;
        }
        sendJson(
          res,
          200,
          (world.factions ?? []).map((f) => ({
            id: f.id,
            name: f.name,
            color: f.color,
          })),
        );
        return;
      }

      if (url.pathname === "/api/publish" && req.method === "POST") {
        if (!requireMaster(req)) {
          sendJson(res, 401, { error: "Неверный мастер-токен" });
          return;
        }
        const world = await readBody(req);
        const written = writeLiveBoard(world, {
          backup: true,
          reason: "publish",
        });
        sendJson(res, 200, {
          ok: true,
          turn: written.turn,
          updatedAt: written.updatedAt,
          tableRevision: written.tableRevision,
        });
        return;
      }

      /** Lightweight poll for player clients — no secrets. */
      if (url.pathname === "/api/map-version" && req.method === "GET") {
        const version = getVersionPayload();
        if (!version.ok) {
          sendJson(res, 404, { error: "Карта ещё не опубликована", ...version });
          return;
        }
        sendJson(res, 200, version);
        return;
      }

      /** Re-fetch fog-filtered map without full re-login UI. */
      if (url.pathname === "/api/view-refresh" && req.method === "POST") {
        const body = await readBody(req);
        const world = readLiveBoard();
        if (!world) {
          sendJson(res, 404, { error: "Карта ещё не опубликована" });
          return;
        }
        const auth = authenticatePlayerFaction(body, world);
        if (!auth.ok) {
          sendJson(res, 401, { error: auth.error });
          return;
        }
        sendJson(res, 200, playerSessionPayload(world, auth.faction));
        return;
      }

      if (url.pathname === "/api/login" && req.method === "POST") {
        const body = await readBody(req);
        const world = readLiveBoard();
        if (!world) {
          sendJson(res, 404, { error: "Карта ещё не опубликована" });
          return;
        }
        const auth = authenticatePlayerFaction(body, world);
        if (!auth.ok) {
          sendJson(res, 401, { error: auth.error });
          return;
        }
        sendJson(res, 200, playerSessionPayload(world, auth.faction));
        return;
      }

      /** Instant planet management: build / demolish / colonize / set_colony_type. */
      if (url.pathname === "/api/planet/action" && req.method === "POST") {
        const body = await readBody(req);
        const world = readLiveBoard();
        if (!world) {
          sendJson(res, 404, { error: "Карта ещё не опубликована" });
          return;
        }
        const faction = (world.factions ?? []).find((f) => f.id === body.factionId);
        if (!faction || faction.password !== body.password) {
          sendJson(res, 401, { error: "Неверный пароль" });
          return;
        }
        const eco = getFactionPublicEco(faction.id);
        const apMax = eco.rules?.apPerTurn
          ? resolveApMax(eco.rules.apPerTurn, buildModifierStack([]))
          : resolveApMax(
              getContent().rules?.apPerTurn ?? 3,
              buildModifierStack([]),
            );
        const result = applyPlanetAction({
          world,
          factionId: faction.id,
          action: body.action,
          systemId: body.systemId,
          planetId: body.planetId,
          buildingId: body.buildingId,
          instanceId: body.instanceId,
          colonyType: body.colonyType,
          note: body.note,
          apMax,
          slotRole: body.slotRole,
          slotResourceId: body.slotResourceId,
          name: body.name,
        });
        if (!result.ok) {
          sendJson(res, 400, result);
          return;
        }
        const filtered = filterWorldForFaction(world, faction.id);
        const ecoAfter = getFactionPublicEco(faction.id);
        sendJson(res, 200, {
          ok: true,
          intent: result.intent,
          cost: result.cost ?? null,
          building: result.building ?? null,
          apMax,
          reservedAp: reservedAp(faction.id, world.meta?.turn ?? 0),
          economy: publicEconomyPayload(ecoAfter),
          ...filtered,
        });
        return;
      }

      /** System stations + ship/unit production. */
      if (url.pathname === "/api/system/action" && req.method === "POST") {
        const body = await readBody(req);
        const world = readLiveBoard();
        if (!world) {
          sendJson(res, 404, { error: "Карта ещё не опубликована" });
          return;
        }
        const faction = (world.factions ?? []).find((f) => f.id === body.factionId);
        if (!faction || faction.password !== body.password) {
          sendJson(res, 401, { error: "Неверный пароль" });
          return;
        }
        const eco = getFactionPublicEco(faction.id);
        const apMax = eco.rules?.apPerTurn
          ? resolveApMax(eco.rules.apPerTurn, buildModifierStack([]))
          : resolveApMax(
              getContent().rules?.apPerTurn ?? 3,
              buildModifierStack([]),
            );
        const result = applySystemAction({
          world,
          factionId: faction.id,
          action: body.action,
          systemId: body.systemId,
          stationKind: body.stationKind,
          stationId: body.stationId,
          shipId: body.shipId,
          unitId: body.unitId,
          count: body.count,
          fleetId: body.fleetId,
          legionId: body.legionId,
          planetId: body.planetId,
          beltAngle: body.beltAngle,
          name: body.name,
          note: body.note,
          apMax,
        });
        if (!result.ok) {
          sendJson(res, 400, result);
          return;
        }
        const filtered = filterWorldForFaction(world, faction.id);
        const ecoAfter = getFactionPublicEco(faction.id);
        sendJson(res, 200, {
          ok: true,
          intent: result.intent,
          station: result.station ?? null,
          fleet: result.fleet ?? null,
          legion: result.legion ?? null,
          stationsCatalog: listStationCatalog(),
          apMax,
          reservedAp: reservedAp(faction.id, world.meta?.turn ?? 0),
          economy: publicEconomyPayload(ecoAfter),
          ...filtered,
        });
        return;
      }

      if (url.pathname === "/api/orders" && req.method === "POST") {
        const body = await readBody(req);
        const world = readLiveBoard();
        if (!world) {
          sendJson(res, 404, { error: "Карта ещё не опубликована" });
          return;
        }
        const faction = (world.factions ?? []).find((f) => f.id === body.factionId);
        if (!faction || faction.password !== body.password) {
          sendJson(res, 401, { error: "Неверный пароль" });
          return;
        }
        const apMax = resolveApMax(
          getContent().rules?.apPerTurn ?? 3,
          buildModifierStack([]),
        );
        const defId = body.type?.startsWith("intent.")
          ? body.type
          : `intent.${body.type}`;
        const result = submitIntent({
          factionId: faction.id,
          defId,
          payload: {
            fleetId: body.fleetId,
            legionId: body.legionId,
            fromSystemId: body.fromSystemId,
            toSystemId: body.toSystemId,
          },
          note: body.note,
          source: "map",
          turn: world.meta?.turn ?? 0,
          apMax,
          world,
        });
        if (!result.ok) {
          sendJson(res, 400, result);
          return;
        }
        // Legacy shape for ViewerPage
        const order = {
          id: result.intent.id,
          factionId: result.intent.factionId,
          type: body.type,
          turn: result.intent.turn,
          status: result.intent.status,
          fleetId: body.fleetId,
          fromSystemId: body.fromSystemId,
          toSystemId: body.toSystemId,
          note: body.note || "",
          createdAt: result.intent.submittedAt,
        };
        sendJson(res, 200, {
          ok: true,
          order,
          intent: result.intent,
          apMax,
          reservedAp: reservedAp(faction.id, world.meta?.turn ?? 0),
        });
        return;
      }

      if (url.pathname === "/api/orders" && req.method === "GET") {
        if (!requireMaster(req)) {
          sendJson(res, 401, { error: "Неверный мастер-токен" });
          return;
        }
        sendJson(res, 200, readJson(ORDERS_PATH, []));
        return;
      }

      if (url.pathname === "/api/orders/clear" && req.method === "POST") {
        if (!requireMaster(req)) {
          sendJson(res, 401, { error: "Неверный мастер-токен" });
          return;
        }
        writeJson(ORDERS_PATH, []);
        writeJson(INTENTS_PATH, []);
        sendJson(res, 200, { ok: true });
        return;
      }

      /** Persist master map → live SoT (+ draft + lore seed). */
      if (url.pathname === "/api/save-campaign" && req.method === "POST") {
        if (!requireMaster(req)) {
          sendJson(res, 401, { error: "Неверный мастер-токен" });
          return;
        }
        const world = await readBody(req);
        if (!world?.meta || !Array.isArray(world.systems)) {
          sendJson(res, 400, { error: "Ожидается flat WorldState (meta + systems)" });
          return;
        }
        const written = writeLiveBoard(world, {
          backup: true,
          reason: "save_campaign",
          alsoDraft: true,
          alsoLore: true,
        });
        sendJson(res, 200, {
          ok: true,
          published: true,
          mode: "live",
          systems: written.world.systems.length,
          turn: written.turn,
          savedAt: written.updatedAt,
          updatedAt: written.updatedAt,
          tableRevision: written.tableRevision,
          paths: [
            "data/campaign-draft.json",
            "public/campaigns/lo_golden_pax.json",
            "data/published.json",
          ],
        });
        return;
      }

      sendJson(res, 404, { error: "Unknown API route" });
    } catch (err) {
      sendJson(res, 500, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };
}
