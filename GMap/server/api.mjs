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
  collectRaceEffects,
} from "./modifierStack.mjs";
import {
  readIntents,
  writeIntents,
  submitIntent,
  cancelIntent,
  reservedAp,
  reservedForceAp,
} from "./intents.mjs";
import {
  DEFAULT_AP_PER_TURN,
  resolveEmpireApMax,
  resolveForceApMax,
} from "./apBudget.mjs";
import { applyPlanetAction } from "./planetActions.mjs";
import { applyQuestAction } from "./questActions.mjs";
import { applyForcesMutate } from "./forcesActions.mjs";
import {
  applySystemAction,
  listStationCatalog,
} from "./systemActions.mjs";
import { processTurn, getLastJournal } from "./processTurn.mjs";
import { applyInstantForceMove } from "./forceMovement.mjs";
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
  ensureFactionEco,
  writeLedger,
  setStockReserve,
} from "./ledger.mjs";
import { enrichEconomyWithPendingIntents } from "./economyPending.mjs";
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
  bootstrapOwnKnowledge,
  ensureFactionIntel,
  getLevel,
  maskFactionForIntel,
  publicIntelPayload,
  approximateStat,
  setKnowledgeLevel,
} from "./intel.mjs";
import {
  getDiploOffersForFaction,
  createDiploOffer,
  respondDiploOffer,
  applyUnilateralStance,
} from "./diploOffers.mjs";
import {
  listCourtProposals,
  proposeCourtEdit,
  acceptCourtProposal,
  rejectCourtProposal,
} from "./courtProposals.mjs";
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
  cancelEngagementsMissingForces,
} from "./engagements.mjs";
import {
  applyPresetToSystems,
  scheduleTimer,
} from "./narrative.mjs";
import {
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
import { rollDiceToRpEpisode } from "./dice.mjs";
import {
  createChoicePrompt,
  createDicePrompt,
  resolveChoicePrompt,
  resolveDicePrompt,
  setEpisodePin,
} from "./rpPrompts.mjs";
import { storePing, getDataFileSizes } from "./db/storeAdapter.mjs";
import {
  buildGmBalanceSnapshot,
  applyGmBalancePatch,
} from "./gmBalance.mjs";
import {
  listAtelierCatalogs,
  getCatalogMeta,
  listCatalogEntries,
  readCatalogEntry,
  saveCatalogEntry,
  removeCatalogEntry,
  readCatalogDocument,
  saveCatalogDocument,
  patchRulesKnobs,
} from "./gmContent.mjs";
import { spawnStoryQuestFromCatalog } from "./storyQuestSpawn.mjs";
import os from "node:os";

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

/** Master token, or matching faction password via X-Faction-Id + X-Faction-Password. */
function requireMasterOrFactionAuth(req, world, factionIdHint) {
  if (requireMaster(req)) return { ok: true, master: true };
  const factionId =
    factionIdHint ||
    req.headers["x-faction-id"] ||
    null;
  const password = req.headers["x-faction-password"];
  if (!factionId || password == null || password === "") {
    return { ok: false, error: "Нужен master token или пароль фракции" };
  }
  const faction = (world?.factions ?? []).find((f) => f.id === factionId);
  if (!faction || faction.password !== password) {
    return { ok: false, error: "Неверный пароль государства" };
  }
  return { ok: true, master: false, faction };
}

/** Strip opponent cardBattle hands for non-master viewers. */
function maskEngagementForFaction(eng, factionId) {
  if (!eng?.cardBattle?.hands) return eng;
  const hands = {};
  for (const [fid, hand] of Object.entries(eng.cardBattle.hands)) {
    if (fid === factionId) hands[fid] = hand;
    else hands[fid] = (hand || []).map((c) => ({ id: c?.id ? "hidden" : "hidden" }));
  }
  return {
    ...eng,
    cardBattle: { ...eng.cardBattle, hands },
  };
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

function playerEconomy(factionId, world = null) {
  const board = world || readLiveBoard();
  const turn = board?.meta?.turn ?? null;
  return enrichEconomyWithPendingIntents(
    factionId,
    publicEconomyPayload(getFactionPublicEco(factionId)),
    turn,
  );
}

function playerApBudget(world, factionId, eco = null) {
  const rules = getContent().rules || {};
  const stack = buildModifierStack([]);
  const apBase =
    eco?.rules?.apPerTurn != null ? eco.rules.apPerTurn : rules.apPerTurn;
  const apMax = resolveEmpireApMax(
    { ...rules, apPerTurn: apBase ?? DEFAULT_AP_PER_TURN },
    stack,
  );
  const forceApMax = resolveForceApMax(world, factionId, rules);
  const turn = world?.meta?.turn ?? 0;
  return {
    apMax,
    reservedAp: reservedAp(factionId, turn),
    forceApMax,
    reservedForceAp: reservedForceAp(factionId, turn),
  };
}

function playerSessionPayload(world, faction) {
  const eco = getFactionPublicEco(faction.id);
  bootstrapOwnKnowledge(world, faction.id, {
    turn: world.meta?.turn ?? 0,
    unlockedTechs: eco.unlockedTechs,
  });
  const filtered = filterWorldForFaction(world, faction.id);
  const apBudget = playerApBudget(world, faction.id, eco);
  const diploOffers = getDiploOffersForFaction(faction.id);
  return {
    factionId: faction.id,
    updatedAt: world.meta?.updatedAt ?? null,
    tableRevision: world.meta?.tableRevision ?? 0,
    ...apBudget,
    economy: playerEconomy(faction.id, world),
    briefing: getFactionBriefing(faction.id, world),
    diploOffers,
    intel: publicIntelPayload(faction.id),
    ...filtered,
  };
}

function maskFleetOrLegion(unit, viewerFactionId, intelRow) {
  if (!unit) return null;
  if (unit.factionId === viewerFactionId) return unit;
  const uid = unit.unitDefId ?? unit.templateId ?? unit.classId;
  const unitLevel = uid
    ? Number(intelRow.knownUnits?.[uid] ?? 0)
    : Number(intelRow.knownFactions?.[unit.factionId] ?? 1);
  const factionLevel = Number(intelRow.knownFactions?.[unit.factionId] ?? 0);
  const level = Math.max(unitLevel, Math.min(factionLevel, 2), 1);

  if (level >= 4) {
    const { gmNotes: _g, ...rest } = unit;
    return rest;
  }
  if (level >= 3) {
    const { gmNotes: _g, hiddenProperties: _h, ...rest } = unit;
    return rest;
  }
  if (level >= 2) {
    return {
      id: unit.id,
      name: unit.name,
      factionId: unit.factionId,
      systemId: unit.systemId,
      classId: unit.classId,
      unitDefId: unit.unitDefId,
      templateId: unit.templateId,
      stance: unit.stance,
      power:
        unit.power != null ? approximateStat(unit.power) : undefined,
      level: 2,
    };
  }
  return {
    id: unit.id,
    name: unit.name,
    factionId: unit.factionId,
    systemId: unit.systemId,
    classId: unit.classId,
    level: 1,
  };
}

function maskBuildingEntry(b, viewerFactionId, systemOwnerId, intelRow) {
  const bid = typeof b === "string" ? b : b?.buildingId ?? b?.id;
  const owned =
    systemOwnerId === viewerFactionId ||
    (typeof b === "object" && b?.factionId === viewerFactionId);
  if (owned) return b;
  const level = bid ? Number(intelRow.knownBuildings?.[bid] ?? 1) : 1;
  if (typeof b === "string") {
    return level >= 1 ? b : null;
  }
  if (level >= 3) {
    const { hiddenProperties: _h, gmNotes: _g, ...rest } = b;
    return rest;
  }
  if (level >= 2) {
    return {
      id: b.id,
      buildingId: b.buildingId ?? bid,
      name: b.name,
      tier: b.tier,
      level: 2,
    };
  }
  return {
    id: b.id,
    buildingId: b.buildingId ?? bid,
    name: b.name,
    level: 1,
  };
}

function maskBuildingList(list, viewerFactionId, systemOwnerId, intelRow) {
  return (list ?? [])
    .map((b) => maskBuildingEntry(b, viewerFactionId, systemOwnerId, intelRow))
    .filter(Boolean);
}

function maskPlanetBuildings(planet, viewerFactionId, systemOwnerId, intelRow) {
  if (!planet) return planet;
  return {
    ...planet,
    buildings: maskBuildingList(
      planet.buildings,
      viewerFactionId,
      systemOwnerId,
      intelRow,
    ),
    surfaceBuildings: maskBuildingList(
      planet.surfaceBuildings,
      viewerFactionId,
      systemOwnerId,
      intelRow,
    ),
    orbitalBuildings: maskBuildingList(
      planet.orbitalBuildings,
      viewerFactionId,
      systemOwnerId,
      intelRow,
    ),
  };
}

function filterWorldForFaction(world, factionId) {
  const visible = getVisibleSystemIds(world, factionId);
  const knownIds = getKnownFactionIds(world, factionId, [...visible]);
  const tradePartnerIds = getTradePartnerIds(world, factionId, knownIds);
  ensureFactionIntel(factionId);
  bootstrapOwnKnowledge(world, factionId, {
    turn: world.meta?.turn ?? 0,
  });
  const intelRow = ensureFactionIntel(factionId);

  const systems = (world.systems ?? [])
    .filter((s) => visible.has(s.id))
    .map((s) => {
      const { notes, gmNotes, timers, ...rest } = s;
      const planets = (rest.planets ?? []).map((p) =>
        maskPlanetBuildings(p, factionId, s.ownerFactionId, intelRow),
      );
      return { ...rest, planets };
    });
  const systemSet = new Set(systems.map((s) => s.id));
  const links = (world.links ?? []).filter(
    (l) => systemSet.has(l.fromId) && systemSet.has(l.toId),
  );
  const fleets = (world.fleets ?? [])
    .filter((f) => f.factionId === factionId || systemSet.has(f.systemId))
    .map((f) => maskFleetOrLegion(f, factionId, intelRow))
    .filter(Boolean);
  const legions = (world.legions ?? [])
    .filter((l) => l.factionId === factionId || systemSet.has(l.systemId))
    .map((l) => maskFleetOrLegion(l, factionId, intelRow))
    .filter(Boolean);
  const playerOrders = readJson(ORDERS_PATH, []).filter(
    (o) => o.factionId === factionId,
  );

  // Factions: known boolean ∪ intel level ≥ 1; mask by level
  const factions = (world.factions ?? [])
    .map((f) => {
      if (f.id === factionId) {
        const { gmNotes: _fgm, ...rest } = f;
        const npcs = (f.npcs ?? [])
          .map((n) => {
            const { gmNotes: _ngm, ...nRest } = n;
            return nRest;
          })
          .filter(Boolean);
        return { ...rest, npcs };
      }
      const level = getLevel(factionId, "faction", f.id);
      if (level < 1 && !knownIds.has(f.id)) return null;
      const effective = level < 1 && knownIds.has(f.id) ? 1 : level;
      return maskFactionForIntel(f, effective, factionId);
    })
    .filter(Boolean);

  const diplomacy = (world.diplomacy ?? []).filter((d) => {
    const touchesSelf = d.aId === factionId || d.bId === factionId;
    if (!touchesSelf) return false;
    const other = d.aId === factionId ? d.bId : d.aId;
    return (
      knownIds.has(other) || getLevel(factionId, "faction", other) >= 1
    );
  });

  const quests = (world.quests ?? []).filter((q) => {
    if (q.status === "hidden") return false;
    // Own / unscoped / intentional foreign & main story quests
    if (!q.sourceFactionId || q.sourceFactionId === factionId) return true;
    if (q.type === "foreign" || q.type === "main") return true;
    return false;
  });

  const caravans = (world.caravans ?? []).filter((c) => {
    if (c.factionId === factionId) return true;
    if (c.factionId == null) {
      return systemSet.has(c.fromSystemId) || systemSet.has(c.toSystemId);
    }
    return false;
  });

  const courtEvents = (world.courtEvents ?? []).filter(
    (e) => !e.factionId || e.factionId === factionId,
  );

  // Explicit allow-list — do not spread raw world (leaks foreign court/caravans/notes).
  return {
    visibleSystemIds: [...visible],
    knownFactionIds: [...knownIds],
    tradePartnerIds,
    world: {
      meta: world.meta ? { ...world.meta } : undefined,
      schemaVersion: world.schemaVersion,
      systems,
      links,
      fleets,
      legions,
      orders: playerOrders,
      factions,
      diplomacy,
      quests,
      caravans,
      courtEvents,
      sectors: world.sectors ?? [],
      races: world.races ?? [],
      loyaltyMatrix: world.loyaltyMatrix ?? {},
      turnHistory: [],
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
  // Share tunnel process must not run a second cron alongside Vite/dev.
  if (process.env.GMAP_PLAYER_SHARE === "1") {
    console.log("[tick] skipped — GMAP_PLAYER_SHARE=1 (tunnel-only process)");
  } else {
    startTickScheduler({
      getCron: () => getContent().rules?.tickCron || "1 0 * * *",
      getTimezone: () => getContent().rules?.tickTimezone || "Europe/Moscow",
      onTick: () => processTurn({ force: false }),
    });
  }
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

      // LAN IPs for GM phone preview (same Wi‑Fi as host)
      if (url.pathname === "/api/lan" && req.method === "GET") {
        const ips = [];
        for (const addrs of Object.values(os.networkInterfaces() || {})) {
          for (const a of addrs || []) {
            const fam = a.family;
            const v4 = fam === "IPv4" || fam === 4;
            if (v4 && !a.internal && a.address) ips.push(a.address);
          }
        }
        sendJson(res, 200, { ips: [...new Set(ips)] });
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
          apMax: resolveEmpireApMax(getContent().rules, stack),
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
        if (!requireMaster(req)) {
          const worldAuth = readLiveBoard();
          const pw =
            req.headers["x-faction-password"] ||
            url.searchParams.get("password");
          const fac = (worldAuth?.factions ?? []).find((f) => f.id === fid);
          if (!fac || fac.password !== pw) {
            sendJson(res, 401, { error: "Неверный пароль" });
            return;
          }
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
        if (!requireMaster(req)) {
          const factionId = req.headers["x-faction-id"];
          const pw = req.headers["x-faction-password"];
          const world = readLiveBoard();
          const fac = (world?.factions ?? []).find((f) => f.id === factionId);
          if (!fac || fac.password !== pw) {
            sendJson(res, 401, { error: "Нужен master token или пароль фракции" });
            return;
          }
          // Own offers only + public rates (not the full open book).
          const offers = getOpenMarketBook().filter(
            (o) => o.factionId === factionId,
          );
          sendJson(res, 200, {
            offers,
            rates: getMarketRatesPayload(getContent()),
          });
          return;
        }
        sendJson(res, 200, {
          offers: getOpenMarketBook(),
          rates: getMarketRatesPayload(getContent()),
        });
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
            economy: playerEconomy(auth.faction.id, world),
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
            economy: playerEconomy(auth.faction.id, world),
            ...playerSessionPayload(world, auth.faction),
          });
          return;
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
            return;
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
            economy: playerEconomy(auth.faction.id, world),
            ...playerSessionPayload(fresh, auth.faction),
          });
          return;
        }

        sendJson(res, 400, { error: "unknown action" });
        return;
      }

      if (url.pathname === "/api/court/proposals" && req.method === "GET") {
        if (!requireMaster(req)) {
          sendJson(res, 401, { error: "Неверный мастер-токен" });
          return;
        }
        const status = url.searchParams.get("status") || undefined;
        sendJson(res, 200, { proposals: listCourtProposals({ status }) });
        return;
      }

      if (url.pathname === "/api/court/proposals" && req.method === "POST") {
        if (!requireMaster(req)) {
          sendJson(res, 401, { error: "Неверный мастер-токен" });
          return;
        }
        const body = await readBody(req);
        const result = proposeCourtEdit(body);
        if (!result.ok) {
          sendJson(res, 400, result);
          return;
        }
        sendJson(res, 200, result);
        return;
      }

      if (
        url.pathname.startsWith("/api/court/proposals/") &&
        url.pathname.endsWith("/accept") &&
        req.method === "POST"
      ) {
        if (!requireMaster(req)) {
          sendJson(res, 401, { error: "Неверный мастер-токен" });
          return;
        }
        const proposalId = url.pathname.split("/")[4];
        const result = acceptCourtProposal(proposalId);
        if (!result.ok) {
          sendJson(res, 400, result);
          return;
        }
        sendJson(res, 200, result);
        return;
      }

      if (
        url.pathname.startsWith("/api/court/proposals/") &&
        url.pathname.endsWith("/reject") &&
        req.method === "POST"
      ) {
        if (!requireMaster(req)) {
          sendJson(res, 401, { error: "Неверный мастер-токен" });
          return;
        }
        const proposalId = url.pathname.split("/")[4];
        const result = rejectCourtProposal(proposalId);
        if (!result.ok) {
          sendJson(res, 400, result);
          return;
        }
        sendJson(res, 200, result);
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

      if (url.pathname === "/api/intel/set" && req.method === "POST") {
        if (!requireMaster(req)) {
          sendJson(res, 401, { error: "Неверный мастер-токен" });
          return;
        }
        const body = await readBody(req);
        if (!body?.factionId || !body?.entityType || !body?.entityId) {
          sendJson(res, 400, {
            error: "factionId + entityType + entityId + level",
          });
          return;
        }
        const world = readLiveBoard();
        const turn = world?.meta?.turn ?? 0;
        const changed = setKnowledgeLevel(
          body.factionId,
          body.entityType,
          body.entityId,
          body.level ?? 1,
          { source: body.source || "gm", turn },
        );
        bumpTableRevision();
        sendJson(res, 200, {
          ok: true,
          changed,
          intel: publicIntelPayload(body.factionId),
        });
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

      if (url.pathname === "/api/engagements/reconcile" && req.method === "POST") {
        if (!requireMaster(req)) {
          sendJson(res, 401, { error: "Нужен master token" });
          return;
        }
        const body = await readBody(req);
        const world = body.world || readLiveBoard();
        if (!world) {
          sendJson(res, 404, { error: "Нет board" });
          return;
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
        return;
      }

      if (url.pathname === "/api/engagements" && req.method === "GET") {
        const list = readEngagements();
        if (requireMaster(req)) {
          sendJson(res, 200, { engagements: list });
          return;
        }
        const factionId = req.headers["x-faction-id"];
        const pw = req.headers["x-faction-password"];
        const world = readLiveBoard();
        const fac = (world?.factions ?? []).find((f) => f.id === factionId);
        if (!fac || fac.password !== pw) {
          sendJson(res, 401, { error: "Нужен master token или пароль фракции" });
          return;
        }
        const mine = list.filter((e) =>
          (e.sides || []).some((s) => s.factionId === factionId),
        );
        sendJson(res, 200, {
          engagements: mine.map((e) => maskEngagementForFaction(e, factionId)),
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

      if (
        url.pathname.startsWith("/api/engagements/") &&
        url.pathname.endsWith("/advance") &&
        req.method === "POST"
      ) {
        if (!requireMaster(req)) {
          sendJson(res, 401, { error: "Неверный мастер-токен" });
          return;
        }
        const body = await readBody(req);
        const engagementId = url.pathname.split("/")[3];
        const world = readLiveBoard();
        if (!world) {
          sendJson(res, 404, { error: "Нет board" });
          return;
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
        return;
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
        const result = requestCardBattle(engagementId, body.factionId, world);
        sendJson(res, result.ok ? 200 : 400, result);
        return;
      }

      if (
        url.pathname.startsWith("/api/engagements/") &&
        url.pathname.endsWith("/force_card") &&
        req.method === "POST"
      ) {
        if (!requireMaster(req)) {
          sendJson(res, 401, { error: "Неверный мастер-токен" });
          return;
        }
        const engagementId = url.pathname.split("/")[3];
        const world = readLiveBoard();
        const result = forceCardBattle(engagementId, world);
        sendJson(res, result.ok ? 200 : 400, result);
        return;
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
        return;
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
        return;
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
        const result = readyEngagementCard(
          engagementId,
          body.factionId,
          world,
        );
        if (result.ok) {
          writeLiveBoard(world, { backup: false, reason: "ready_card" });
        }
        sendJson(res, result.ok ? 200 : 400, result);
        return;
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
        return;
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
        return;
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
        const result = retreatEngagementCard(
          engagementId,
          body.factionId,
          world,
        );
        if (result.ok) {
          writeLiveBoard(world, { backup: false, reason: "retreat_card" });
        }
        sendJson(res, result.ok ? 200 : 400, result);
        return;
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
        const result = passEngagementCard(engagementId, body.factionId, world);
        if (result.ok) {
          writeLiveBoard(world, { backup: false, reason: "pass_card" });
        }
        sendJson(res, result.ok ? 200 : 400, result);
        return;
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
        const result = drawEngagementCard(engagementId, body.factionId, world);
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
        const world = readLiveBoard();
        const auth = requireMasterOrFactionAuth(req, world, null);
        if (!auth.ok) {
          sendJson(res, 401, { error: auth.error });
          return;
        }
        const isMaster = !!auth.master;
        const factionId = isMaster
          ? null
          : auth.faction?.id || req.headers["x-faction-id"] || null;
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
        const world = readLiveBoard();
        const auth = requireMasterOrFactionAuth(req, world, null);
        if (!auth.ok) {
          sendJson(res, 401, { error: auth.error });
          return;
        }
        const isMaster = !!auth.master;
        const factionId = isMaster
          ? null
          : auth.faction?.id || req.headers["x-faction-id"] || null;
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
        sendJson(res, 200, {
          messages,
          pin: ep?.pin || null,
        });
        return;
      }

      if (url.pathname === "/api/rp/messages" && req.method === "POST") {
        const body = await readBody(req);
        const world = readLiveBoard();
        const isMaster = requireMaster(req);
        let authorFactionId = body.authorFactionId || null;
        let authorName = body.authorName || null;
        let authorAvatarUrl = body.authorAvatarUrl || null;
        let playerFaction = null;

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
          playerFaction = faction;
          authorFactionId = faction.id;
          authorName = body.authorName || faction.name;
          authorAvatarUrl =
            body.authorAvatarUrl || faction.avatarUrl || null;
        } else {
          authorName = body.authorName || "Мастер";
        }

        // Persona: narrator / NPC / anonymous speak-as
        const persona = body.persona || "self";
        if (persona === "narrator") {
          authorName = "Рассказчик";
          authorAvatarUrl = null;
        } else if (persona === "anonymous" && isMaster) {
          authorName = body.authorName || "???";
          authorAvatarUrl = null;
        } else if (persona === "npc" || body.authorNpcId) {
          const npcId = body.authorNpcId;
          const facId = isMaster
            ? body.authorFactionId || body.factionId || authorFactionId
            : authorFactionId;
          const fac = (world?.factions ?? []).find((f) => f.id === facId);
          const npc = (fac?.npcs || []).find((n) => n.id === npcId);
          if (npc) {
            authorName = npc.name;
            authorAvatarUrl = npc.avatarUrl || null;
            if (isMaster) authorFactionId = fac?.id || authorFactionId;
          }
        } else if (persona === "master" && isMaster) {
          authorName = body.authorName || "Мастер";
        } else if (playerFaction && persona === "self") {
          authorName = body.authorName || playerFaction.name;
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
            tone: body.tone || null,
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
          const apBudget = playerApBudget(world, authorFactionId);
          intentResult = submitIntent({
            factionId: authorFactionId,
            defId: body.intent.defId,
            payload: body.intent.payload || {},
            note: body.intent.note || body.body?.slice(0, 120) || "RP action",
            source: "rp",
            turn: world.meta?.turn ?? 0,
            apMax: apBudget.apMax,
            forceApMax: apBudget.forceApMax,
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

      if (url.pathname === "/api/rp/dice" && req.method === "POST") {
        const body = await readBody(req);
        const world = readLiveBoard();
        const isMaster = requireMaster(req);
        let factionId = body.factionId || null;
        let authorName = body.authorName || null;
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
          factionId = faction.id;
          authorName = body.authorName || faction.name;
        } else {
          authorName = body.authorName || "Мастер";
        }
        const result = rollDiceToRpEpisode({
          factionId,
          chapterId: body.chapterId,
          episodeId: body.episodeId,
          count: body.count,
          sides: body.sides,
          label: body.label,
          authorName,
          campaignId: body.campaignId || DEFAULT_CAMPAIGN,
        });
        sendJson(res, result.ok ? 200 : 400, result);
        return;
      }

      if (url.pathname === "/api/rp/prompt" && req.method === "POST") {
        if (!requireMaster(req)) {
          sendJson(res, 401, { error: "Неверный мастер-токен" });
          return;
        }
        const body = await readBody(req);
        const campaignId = body.campaignId || DEFAULT_CAMPAIGN;
        const kind = body.kind || body.prompt?.kind;
        let result;
        if (kind === "choice") {
          result = createChoicePrompt(
            body.chapterId,
            body.episodeId,
            {
              body: body.body,
              options: body.options || body.prompt?.options,
              campaignId,
            },
          );
        } else if (kind === "dice") {
          result = createDicePrompt(
            body.chapterId,
            body.episodeId,
            {
              body: body.body,
              count: body.count ?? body.prompt?.dice?.count,
              sides: body.sides ?? body.prompt?.dice?.sides,
              bands: body.bands || body.prompt?.dice?.bands,
              whoRolls: body.whoRolls || body.prompt?.dice?.whoRolls,
              campaignId,
            },
          );
        } else {
          sendJson(res, 400, { error: "kind: choice | dice" });
          return;
        }
        sendJson(res, result.ok ? 200 : 400, result);
        return;
      }

      if (url.pathname === "/api/rp/prompt/resolve" && req.method === "POST") {
        const body = await readBody(req);
        const world = readLiveBoard();
        const isMaster = requireMaster(req);
        let factionId = null;
        let authorName = null;
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
          factionId = faction.id;
          authorName = body.authorName || faction.name;
        } else {
          authorName = body.authorName || "Мастер";
          factionId = body.factionId || null;
        }
        const campaignId = body.campaignId || DEFAULT_CAMPAIGN;
        const action = body.action || (body.optionId ? "choice" : "dice");
        let result;
        if (action === "choice" || body.optionId) {
          result = resolveChoicePrompt(
            body.chapterId,
            body.episodeId,
            body.messageId,
            body.optionId,
            { factionId, authorName, isMaster, campaignId },
          );
        } else {
          result = resolveDicePrompt(
            body.chapterId,
            body.episodeId,
            body.messageId,
            { factionId, authorName, isMaster, campaignId },
          );
        }
        sendJson(res, result.ok ? 200 : 400, result);
        return;
      }

      if (url.pathname === "/api/rp/pin" && req.method === "POST") {
        if (!requireMaster(req)) {
          sendJson(res, 401, { error: "Неверный мастер-токен" });
          return;
        }
        const body = await readBody(req);
        const result = setEpisodePin(
          body.chapterId,
          body.episodeId,
          body.clear ? null : { title: body.title, body: body.body },
          body.campaignId || DEFAULT_CAMPAIGN,
        );
        sendJson(res, result.ok ? 200 : 400, result);
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
        sendJson(res, 200, playerEconomy(factionId, world));
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
        const { researchTech, gmGrantTech } = await import("./techActions.mjs");
        const result =
          isMaster && body.free
            ? gmGrantTech(body.factionId, body.techId, {
                turn: world.meta?.turn ?? null,
                world,
              })
            : researchTech(body.factionId, body.techId, {
                turn: world.meta?.turn ?? null,
                world,
              });
        if (!result.ok) {
          sendJson(res, 400, result);
          return;
        }
        if (result.worldMutated) {
          writeLiveBoard(world, { backup: false, reason: "research_tech" });
        }
        sendJson(res, 200, {
          ok: true,
          tech: result.tech,
          economy: playerEconomy(body.factionId, world),
        });
        return;
      }

      if (url.pathname === "/api/economy/alchemy/preview" && req.method === "POST") {
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
        if (!body.techA || !body.techB) {
          sendJson(res, 400, { error: "techA + techB required" });
          return;
        }
        const { previewAlchemyExperiment } = await import("./alchemyActions.mjs");
        const result = previewAlchemyExperiment(
          body.factionId,
          body.techA,
          body.techB,
          { mode: body.mode || "auto", world },
        );
        sendJson(res, result.ok === false ? 400 : 200, result);
        return;
      }

      if (url.pathname === "/api/economy/alchemy/experiment" && req.method === "POST") {
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
        if (!body.techA || !body.techB) {
          sendJson(res, 400, { error: "techA + techB required" });
          return;
        }
        const { alchemyExperiment } = await import("./alchemyActions.mjs");
        const result = alchemyExperiment(body.factionId, body.techA, body.techB, {
          mode: body.mode || "auto",
          turn: world.meta?.turn ?? null,
          world,
        });
        if (!result.ok) {
          sendJson(res, 400, result);
          return;
        }
        if (result.worldMutated) {
          writeLiveBoard(world, { backup: false, reason: "alchemy_experiment" });
        }
        sendJson(res, 200, {
          ...result,
          economy: playerEconomy(body.factionId, world),
        });
        return;
      }

      if (url.pathname === "/api/economy/alchemy/grant-recipe" && req.method === "POST") {
        if (!requireMaster(req)) {
          sendJson(res, 401, { error: "Неверный мастер-токен" });
          return;
        }
        const body = await readBody(req);
        if (!body.factionId || !body.recipeId) {
          sendJson(res, 400, { error: "factionId + recipeId required" });
          return;
        }
        const world = readLiveBoard();
        const { grantRecipe } = await import("./alchemyActions.mjs");
        const result = grantRecipe(body.factionId, body.recipeId, {
          turn: world?.meta?.turn ?? null,
        });
        if (!result.ok) {
          sendJson(res, 400, result);
          return;
        }
        sendJson(res, 200, {
          ...result,
          economy: world
            ? playerEconomy(body.factionId, world)
            : getFactionPublicEco(body.factionId),
        });
        return;
      }

      if (url.pathname === "/api/economy/research-upgrade" && req.method === "POST") {
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
        if (!body.techId || !body.upgradeId) {
          sendJson(res, 400, { error: "techId and upgradeId required" });
          return;
        }
        const { researchUpgrade } = await import("./techActions.mjs");
        const result = researchUpgrade(body.factionId, body.techId, body.upgradeId, {
          turn: world.meta?.turn ?? null,
          world,
        });
        if (!result.ok) {
          sendJson(res, 400, result);
          return;
        }
        if (result.worldMutated) {
          writeLiveBoard(world, { backup: false, reason: "research_upgrade" });
        }
        sendJson(res, 200, {
          ok: true,
          upgrade: result.upgrade,
          tech: result.tech,
          economy: playerEconomy(body.factionId, world),
        });
        return;
      }

      if (url.pathname === "/api/economy/research-queue" && req.method === "POST") {
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
        if (!Array.isArray(body.queue)) {
          sendJson(res, 400, { error: "queue required (array of techId)" });
          return;
        }
        const { setResearchQueue } = await import("./techActions.mjs");
        const result = setResearchQueue(body.factionId, body.queue);
        if (!result.ok) {
          sendJson(res, 400, result);
          return;
        }
        sendJson(res, 200, {
          ok: true,
          queue: result.eco?.researchQueue ?? [],
          economy: playerEconomy(body.factionId, world),
        });
        return;
      }

      if (url.pathname === "/api/economy/research-accelerate" && req.method === "POST") {
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
        const { accelerateResearch } = await import("./techActions.mjs");
        const result = accelerateResearch(body.factionId, body.techId, {
          world,
          turn: world.meta?.turn ?? null,
        });
        if (!result.ok) {
          sendJson(res, 400, result);
          return;
        }
        if (result.worldMutated) {
          writeLiveBoard(world, { backup: false, reason: "research_rush" });
        }
        sendJson(res, 200, {
          ok: true,
          tech: result.tech,
          cost: result.cost,
          economy: playerEconomy(body.factionId, world),
        });
        return;
      }

      if (url.pathname === "/api/economy/research-path" && req.method === "POST") {
        const body = await readBody(req);
        if (!body.techId) {
          sendJson(res, 400, { error: "techId required" });
          return;
        }
        const ledger = readLedger();
        const eco = ensureFactionEco(ledger, body.factionId || "");
        const { researchPathTo } = await import("./techActions.mjs");
        const path = researchPathTo(
          body.techId,
          eco.unlockedTechs || [],
          getContent(),
          {
            eco,
            factionId: body.factionId || null,
            world: readLiveBoard(),
          },
        );
        sendJson(res, 200, { ok: true, ...path });
        return;
      }

      if (url.pathname === "/api/economy/tech-market" && req.method === "GET") {
        const { listTechMarket } = await import("./techPool.mjs");
        const listings = listTechMarket(getContent());
        sendJson(res, 200, { ok: true, listings });
        return;
      }

      if (url.pathname === "/api/economy/build-queue" && req.method === "POST") {
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
        if (!Array.isArray(body.queue)) {
          sendJson(res, 400, { error: "queue required (array)" });
          return;
        }
        const { setBuildQueue } = await import("./planetActions.mjs");
        const result = setBuildQueue(body.factionId, body.queue);
        if (!result.ok) {
          sendJson(res, 400, result);
          return;
        }
        sendJson(res, 200, {
          ok: true,
          queue: result.eco?.buildQueue ?? [],
          economy: playerEconomy(body.factionId, world),
        });
        return;
      }

      if (url.pathname === "/api/economy/preview-build" && req.method === "POST") {
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
        if (!body.systemId || !body.planetId || !body.buildingId) {
          sendJson(res, 400, {
            error: "systemId, planetId, buildingId required",
          });
          return;
        }
        const { previewBuild } = await import("./planetActions.mjs");
        const result = await previewBuild({
          world,
          factionId: body.factionId,
          systemId: body.systemId,
          planetId: body.planetId,
          buildingId: body.buildingId,
        });
        if (!result.ok) {
          sendJson(res, 400, result);
          return;
        }
        sendJson(res, 200, result);
        return;
      }

      if (url.pathname === "/api/planet/building-variants" && req.method === "POST") {
        const body = await readBody(req);
        const world = readLiveBoard();
        if (!world) {
          sendJson(res, 404, { error: "Карта ещё не опубликована" });
          return;
        }
        if (!body.systemId || !body.planetId || !body.buildingId) {
          sendJson(res, 400, {
            error: "systemId, planetId, buildingId required",
          });
          return;
        }
        const { listBuildingVariantsForPlanet } = await import(
          "./planetActions.mjs"
        );
        const result = listBuildingVariantsForPlanet(
          world,
          body.systemId,
          body.planetId,
          body.buildingId,
        );
        if (!result.ok) {
          sendJson(res, 400, result);
          return;
        }
        sendJson(res, 200, result);
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
        const apBudget = playerApBudget(world, body.factionId);
        const result = submitIntent({
          factionId: body.factionId,
          defId: "intent.set_tax",
          payload: { taxSlot: body.taxSlot, tierId: body.tierId },
          note: body.note,
          source: "map",
          turn: world.meta?.turn ?? 0,
          apMax: apBudget.apMax,
          forceApMax: apBudget.forceApMax,
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
        const factionId = req.headers["x-faction-id"];
        const password = req.headers["x-faction-password"];
        const fac = (world.factions ?? []).find((f) => f.id === factionId);
        if (!fac || password == null || fac.password !== password) {
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
        const world = readLiveBoard();
        const auth = requireMasterOrFactionAuth(req, world, null);
        if (!auth.ok) {
          sendJson(res, 401, { error: auth.error });
          return;
        }
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
        const pw = req.headers["x-faction-password"];
        const world = readLiveBoard();
        const fac = (world?.factions ?? []).find((f) => f.id === factionId);
        if (!fac || fac.password !== pw) {
          sendJson(res, 401, { error: "Нужен master token или пароль фракции" });
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
        const apBudget = playerApBudget(world, faction.id);
        const defId =
          body.defId ||
          (body.type?.startsWith("intent.")
            ? body.type
            : `intent.${body.type}`);
        const payload = body.payload || {
          fleetId: body.fleetId,
          legionId: body.legionId,
          fromSystemId: body.fromSystemId,
          toSystemId: body.toSystemId,
        };
        const result = submitIntent({
          factionId: faction.id,
          defId,
          payload,
          note: body.note,
          source: body.source || "map",
          turn: world.meta?.turn ?? 0,
          apMax: apBudget.apMax,
          forceApMax: apBudget.forceApMax,
          world,
        });
        if (!result.ok) {
          sendJson(res, 400, result);
          return;
        }

        // Honor content instant flag for stock reserves (apply now, skip tick).
        const def = getContent().intents?.[defId];
        let intentOut = result.intent;
        if (defId === "intent.reserve_stock" && def?.instant) {
          const currencyId = String(payload.currencyId || "");
          const applied = setStockReserve(
            faction.id,
            currencyId,
            Number(payload.amount) || 0,
            String(payload.label || "резерв"),
          );
          if (!applied.ok) {
            const list = readIntents().filter((i) => i.id !== result.intent.id);
            writeIntents(list);
            sendJson(res, 400, applied);
            return;
          }
          const nowIso = new Date().toISOString();
          const list = readIntents();
          for (let i = 0; i < list.length; i++) {
            const row = list[i];
            if (!row || row.factionId !== faction.id) continue;
            if (row.id === result.intent.id) {
              list[i] = { ...row, status: "applied", resolvedAt: nowIso };
              intentOut = list[i];
              continue;
            }
            if (
              row.status === "pending" &&
              row.defId === "intent.reserve_stock" &&
              String(row.payload?.currencyId || "") === currencyId
            ) {
              list[i] = {
                ...row,
                status: "cancelled",
                cancelledAt: nowIso,
                note: `${row.note || ""} · superseded`.trim(),
              };
            }
          }
          writeIntents(list);
        }

        sendJson(res, 200, {
          ok: true,
          intent: intentOut,
          ...playerApBudget(world, faction.id),
          economy: playerEconomy(faction.id, world),
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
          ...playerApBudget(world, faction.id),
          economy: playerEconomy(faction.id, world),
        });
        return;
      }

      /** Public status for UI (no secrets). Master-only — avoids leaking WAN/tunnel URLs. */
      if (url.pathname === "/api/players/share" && req.method === "GET") {
        if (!requireMaster(req)) {
          sendJson(res, 401, { error: "Неверный мастер-токен" });
          return;
        }
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
        const expectedRevision =
          world?.expectedRevision ?? world?.meta?.tableRevision ?? null;
        const written = writeLiveBoard(world, {
          backup: true,
          reason: "publish",
          expectedRevision:
            expectedRevision != null ? Number(expectedRevision) : undefined,
        });
        if (written?.ok === false && written.conflict) {
          sendJson(res, 409, {
            error: "Конфликт ревизии — перезагрузите стол и опубликуйте снова",
            tableRevision: written.tableRevision,
          });
          return;
        }
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
        const apBudget = playerApBudget(world, faction.id, eco);
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
          apMax: apBudget.apMax,
          slotRole: body.slotRole,
          slotResourceId: body.slotResourceId,
          name: body.name,
        });
        if (!result.ok) {
          sendJson(res, 400, result);
          return;
        }
        const filtered = filterWorldForFaction(world, faction.id);
        sendJson(res, 200, {
          ok: true,
          intent: result.intent,
          cost: result.cost ?? null,
          building: result.building ?? null,
          ...playerApBudget(world, faction.id, eco),
          economy: playerEconomy(faction.id, world),
          ...filtered,
        });
        return;
      }

      if (url.pathname === "/api/society/found-lineage" && req.method === "POST") {
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
        const apBudget = playerApBudget(world, faction.id);
        const { applyFoundHybridLineageInstant } = await import(
          "./hybridActions.mjs"
        );
        const result = applyFoundHybridLineageInstant({
          world,
          factionId: faction.id,
          systemId: body.systemId,
          planetId: body.planetId,
          raceA: body.raceA,
          raceB: body.raceB,
          apMax: apBudget.apMax,
        });
        if (!result.ok) {
          sendJson(res, 400, result);
          return;
        }
        const filtered = filterWorldForFaction(world, faction.id);
        sendJson(res, 200, {
          ok: true,
          lineageId: result.lineageId,
          intent: result.intent,
          economy: result.economy,
          ...playerApBudget(world, faction.id),
          ...filtered,
        });
        return;
      }

      /** Instant quest actions: yearly dice / choice / quest dice (A9). */
      if (url.pathname === "/api/quest/action" && req.method === "POST") {
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
        const result = applyQuestAction({
          world,
          factionId: auth.faction.id,
          action: body.action,
          questId: body.questId,
          choiceId: body.choiceId,
          specIndex: body.specIndex,
          note: body.note,
          message: body.message,
        });
        if (!result.ok) {
          sendJson(res, 400, result);
          return;
        }
        const fresh = readLiveBoard() || world;
        sendJson(res, 200, {
          ok: true,
          ...result,
          ...playerSessionPayload(fresh, auth.faction),
        });
        return;
      }

      /** Instant forces deck: composition + stocks + reserve. */
      if (url.pathname === "/api/forces/mutate" && req.method === "POST") {
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
          return;
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
        const apBudget = playerApBudget(world, faction.id, eco);
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
          apMax: apBudget.apMax,
          forceApMax: apBudget.forceApMax,
        });
        if (!result.ok) {
          sendJson(res, 400, result);
          return;
        }
        const filtered = filterWorldForFaction(world, faction.id);
        sendJson(res, 200, {
          ok: true,
          intent: result.intent,
          station: result.station ?? null,
          fleet: result.fleet ?? null,
          legion: result.legion ?? null,
          stationsCatalog: listStationCatalog(),
          ...playerApBudget(world, faction.id, eco),
          economy: playerEconomy(faction.id, world),
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
        const apBudget = playerApBudget(world, faction.id);
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
          apMax: apBudget.apMax,
          forceApMax: apBudget.forceApMax,
          world,
        });
        if (!result.ok) {
          sendJson(res, 400, result);
          return;
        }

        const def = getContent().intents?.[defId];
        let intentOut = result.intent;
        let worldOut = world;

        if (
          def?.instant &&
          (defId === "intent.move_fleet" || defId === "intent.move_legion")
        ) {
          const applied = applyInstantForceMove(world, result.intent);
          if (!applied.ok) {
            const list = readIntents().filter((i) => i.id !== result.intent.id);
            writeIntents(list);
            sendJson(res, 400, applied);
            return;
          }
          writeLiveBoard(world, { backup: false, reason: defId });
          worldOut = world;
          const nowIso = new Date().toISOString();
          const list = readIntents();
          const idx = list.findIndex((i) => i.id === result.intent.id);
          if (idx >= 0) {
            list[idx] = {
              ...list[idx],
              status: "applied",
              resolvedAt: nowIso,
            };
            writeIntents(list);
            intentOut = list[idx];
          }
        }

        // Legacy shape for ViewerPage
        const order = {
          id: intentOut.id,
          factionId: intentOut.factionId,
          type: body.type,
          turn: intentOut.turn,
          status: intentOut.status,
          fleetId: body.fleetId,
          fromSystemId: body.fromSystemId,
          toSystemId: body.toSystemId,
          note: body.note || "",
          createdAt: intentOut.submittedAt,
        };
        sendJson(res, 200, {
          ok: true,
          order,
          intent: intentOut,
          world: worldOut,
          ...playerApBudget(worldOut, faction.id),
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

      /**
       * GM: reload content packs from disk + bump tableRevision so viewers
       * and the GM client pick up build/catalog changes after save.
       * Optional body.world writes the live board first.
       */
      if (url.pathname === "/api/gm/balance/snapshot" && req.method === "GET") {
        if (!requireMaster(req)) {
          sendJson(res, 401, { error: "Неверный мастер-токен" });
          return;
        }
        sendJson(res, 200, buildGmBalanceSnapshot());
        return;
      }

      if (url.pathname === "/api/gm/balance/patch" && req.method === "POST") {
        if (!requireMaster(req)) {
          sendJson(res, 401, { error: "Неверный мастер-токен" });
          return;
        }
        const body = (await readBody(req)) || {};
        const result = applyGmBalancePatch(body);
        if (!result.ok) {
          sendJson(res, 400, result);
          return;
        }
        sendJson(res, 200, result);
        return;
      }

      if (url.pathname === "/api/gm/content/catalogs" && req.method === "GET") {
        if (!requireMaster(req)) {
          sendJson(res, 401, { error: "Неверный мастер-токен" });
          return;
        }
        sendJson(res, 200, { catalogs: listAtelierCatalogs() });
        return;
      }

      if (url.pathname === "/api/gm/content/meta" && req.method === "GET") {
        if (!requireMaster(req)) {
          sendJson(res, 401, { error: "Неверный мастер-токен" });
          return;
        }
        const catalog = url.searchParams.get("catalog") || "";
        const result = getCatalogMeta(catalog);
        sendJson(res, result.ok ? 200 : 400, result);
        return;
      }

      if (url.pathname === "/api/gm/content/entries" && req.method === "GET") {
        if (!requireMaster(req)) {
          sendJson(res, 401, { error: "Неверный мастер-токен" });
          return;
        }
        const catalog = url.searchParams.get("catalog") || "";
        const result = listCatalogEntries(catalog, {
          q: url.searchParams.get("q") || "",
          bag: url.searchParams.get("bag") || "",
          limit: url.searchParams.get("limit") || "80",
          offset: url.searchParams.get("offset") || "0",
        });
        sendJson(res, result.ok ? 200 : 400, result);
        return;
      }

      if (url.pathname === "/api/gm/content/entry" && req.method === "GET") {
        if (!requireMaster(req)) {
          sendJson(res, 401, { error: "Неверный мастер-токен" });
          return;
        }
        const catalog = url.searchParams.get("catalog") || "";
        const key = url.searchParams.get("key") || "";
        const bag = url.searchParams.get("bag") || "";
        const result = readCatalogEntry(catalog, key, bag);
        sendJson(res, result.ok ? 200 : 404, result);
        return;
      }

      if (url.pathname === "/api/gm/content/entry" && req.method === "POST") {
        if (!requireMaster(req)) {
          sendJson(res, 401, { error: "Неверный мастер-токен" });
          return;
        }
        const body = (await readBody(req)) || {};
        const result = saveCatalogEntry(
          body.catalog,
          body.key,
          body.bag,
          body.data,
          Boolean(body.create),
        );
        sendJson(res, result.ok ? 200 : 400, result);
        return;
      }

      if (url.pathname === "/api/gm/content/entry" && req.method === "DELETE") {
        if (!requireMaster(req)) {
          sendJson(res, 401, { error: "Неверный мастер-токен" });
          return;
        }
        const catalog = url.searchParams.get("catalog") || "";
        const key = url.searchParams.get("key") || "";
        const bag = url.searchParams.get("bag") || "";
        const result = removeCatalogEntry(catalog, key, bag);
        sendJson(res, result.ok ? 200 : 400, result);
        return;
      }

      if (url.pathname === "/api/gm/content/document" && req.method === "GET") {
        if (!requireMaster(req)) {
          sendJson(res, 401, { error: "Неверный мастер-токен" });
          return;
        }
        const catalog = url.searchParams.get("catalog") || "";
        const result = readCatalogDocument(catalog);
        sendJson(res, result.ok ? 200 : 400, result);
        return;
      }

      if (url.pathname === "/api/gm/content/document" && req.method === "POST") {
        if (!requireMaster(req)) {
          sendJson(res, 401, { error: "Неверный мастер-токен" });
          return;
        }
        const body = (await readBody(req)) || {};
        const result = saveCatalogDocument(body.catalog, body.data);
        sendJson(res, result.ok ? 200 : 400, result);
        return;
      }

      if (url.pathname === "/api/gm/content/rules-knobs" && req.method === "POST") {
        if (!requireMaster(req)) {
          sendJson(res, 401, { error: "Неверный мастер-токен" });
          return;
        }
        const body = (await readBody(req)) || {};
        const result = patchRulesKnobs(body);
        sendJson(res, result.ok ? 200 : 400, result);
        return;
      }

      if (url.pathname === "/api/gm/content/reload" && req.method === "POST") {
        if (!requireMaster(req)) {
          sendJson(res, 401, { error: "Неверный мастер-токен" });
          return;
        }
        loadContent();
        sendJson(res, 200, { ok: true });
        return;
      }

      if (url.pathname === "/api/gm/quests/spawn-catalog" && req.method === "POST") {
        if (!requireMaster(req)) {
          sendJson(res, 401, { error: "Неверный мастер-токен" });
          return;
        }
        const body = (await readBody(req)) || {};
        const catalogId = String(body.catalogId || "");
        const factionId = String(body.factionId || "");
        if (!catalogId || !factionId) {
          sendJson(res, 400, { ok: false, error: "Нужны catalogId и factionId" });
          return;
        }
        const result = spawnStoryQuestFromCatalog(catalogId, factionId, {
          systemId: body.systemId || null,
          returnWorld: true,
        });
        if (!result.ok) {
          sendJson(res, 400, result);
          return;
        }
        const meta = bumpTableRevision();
        if (result.world?.meta) {
          result.world.meta.tableRevision = meta.tableRevision;
          result.world.meta.updatedAt = meta.updatedAt;
        }
        sendJson(res, 200, {
          ok: true,
          quest: result.quest,
          world: result.world,
          tableRevision: meta.tableRevision,
        });
        return;
      }

      if (url.pathname === "/api/gm/apply-build" && req.method === "POST") {
        if (!requireMaster(req)) {
          sendJson(res, 401, { error: "Неверный мастер-токен" });
          return;
        }
        const body = (await readBody(req)) || {};
        if (body.world?.meta && Array.isArray(body.world.systems)) {
          writeLiveBoard(body.world, {
            backup: true,
            reason: "apply_build",
            alsoDraft: true,
            alsoLore: true,
          });
        }
        let contentPacks = 0;
        if (body.reloadContent !== false) {
          const content = loadContent();
          contentPacks = Array.isArray(content?.packs)
            ? content.packs.length
            : content
              ? 1
              : 0;
        }
        const meta = bumpTableRevision();
        // Keep live board meta in sync so /api/map-version and saves agree.
        const live = readLiveBoard();
        if (live?.meta) {
          live.meta.tableRevision = meta.tableRevision;
          live.meta.updatedAt = meta.updatedAt;
          writeJson(PUBLISHED_PATH, live);
        }
        sendJson(res, 200, {
          ok: true,
          tableRevision: meta.tableRevision,
          updatedAt: meta.updatedAt,
          contentPacks,
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
