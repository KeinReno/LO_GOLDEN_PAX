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
import { applyForceRaise, applyForceDisband } from "./forceRecruit.mjs";
import { applyBoardingToWorld } from "./boarding.mjs";
import {
  applySystemAction,
  listStationCatalog,
} from "./systemActions.mjs";
import { tryHandleCourtRoutes } from "./routes/court.mjs";
import { tryHandleEconomyTechRoutes } from "./routes/economyTech.mjs";
import { tryHandleEconomicTrackRoutes } from "./routes/diploEconomic.mjs";
import { tryHandleRpRoutes } from "./routes/rp.mjs";
import { tryHandleNarrativeRoutes } from "./routes/narrative.mjs";
import { tryHandleEngagementRoutes } from "./routes/engagements.mjs";
import { tryHandleGmRoutes } from "./routes/gm.mjs";
import { tryHandlePlayActionRoutes } from "./routes/playActions.mjs";
import { tryHandlePlayersShareRoutes } from "./routes/playersShare.mjs";
import { tryHandleTurnOpsRoutes } from "./routes/turnOps.mjs";
import { tryHandleIntentRoutes } from "./routes/intents.mjs";
import { tryHandleForcesRoutes } from "./routes/forces.mjs";
import { tryHandleFogIntelRoutes } from "./routes/fogIntel.mjs";
import { tryHandleSessionRoutes } from "./routes/session.mjs";
import { tryHandleEconomyMiscRoutes } from "./routes/economyMisc.mjs";
import { tryHandleDiploRoutes } from "./routes/diplo.mjs";
import { tryHandleMarketRoutes } from "./routes/market.mjs";
import { processTurn, getLastJournal } from "./processTurn.mjs";
import { applyInstantForceMove } from "./forceMovement.mjs";
import {
  createOrderFromIntent,
  shouldCreateEtaOrder,
  intentCategory,
} from "./orderEngine.mjs";
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
  resolvePlayerAuth,
  loginWithPassword,
  issueSessionToken,
} from "./playerAuth.mjs";
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
import { civicStatusPayload } from "./civicPaths.mjs";
import { ensureOffers } from "./techOffers.mjs";
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
  isCommonMarketMember,
  listCommonMembers,
  setCommonMarketMembership,
} from "./marketMembership.mjs";
import {
  getSuperpowerCatalog,
  purchaseSuperpowerListing,
} from "./superpowerMarket.mjs";
import { storePing, getDataFileSizes } from "./db/storeAdapter.mjs";
import {
  buildGmBalanceSnapshot,
  applyGmBalancePatch,
} from "./gmBalance.mjs";
import {
  buildFactionComparison,
  buildSessionBrief,
  listGmInterventions,
  listCockpitBackups,
  runDryRunTick,
  listGmPegMultipliers,
  setGmPegMultiplier,
} from "./gmCockpit.mjs";
import { grantPowerTouch } from "./powerPaths.mjs";
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

/** player_auth_token_v05 — master, x-player-token, or password; never bare x-faction-id. */
function requireMasterOrFactionAuth(req, world, factionIdHint) {
  return resolvePlayerAuth(req, world, { factionIdHint });
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

function authenticatePlayerFaction(body, world, req = null) {
  return resolvePlayerAuth(req, world, { body });
}

/** Token/password bind body.factionId; master keeps the posted id. */
function bindAuthedFaction(auth, body) {
  if (auth?.ok && !auth.master && auth.faction) {
    body.factionId = auth.faction.id;
  }
  return auth;
}

/** Economy/science mutations: x-player-token or password; master keeps posted factionId. */
function authenticateEconomyMutation(body, world, req) {
  return bindAuthedFaction(authenticatePlayerFaction(body, world, req), body);
}

function persistResearchOffers(factionId, world) {
  const ledger = readLedger();
  const eco = ensureFactionEco(ledger, factionId);
  const faction = (world?.factions || []).find((f) => f.id === factionId);
  const { changed } = ensureOffers(eco, getContent(), { faction, world });
  if (changed) writeLedger(ledger);
}

function playerEconomy(factionId, world = null) {
  const board = world || readLiveBoard();
  const turn = board?.meta?.turn ?? null;
  persistResearchOffers(factionId, board);
  const eco = getFactionPublicEco(factionId);
  const payload = publicEconomyPayload(eco);
  payload.civicPaths = civicStatusPayload(eco);
  return enrichEconomyWithPendingIntents(factionId, payload, turn);
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
    reservedAp: reservedAp(factionId, turn, world),
    forceApMax,
    reservedForceAp: reservedForceAp(factionId, turn, world),
  };
}

/** B4: ETA intents → world.orders; instant intents apply immediately when flagged. */
function finalizeSubmittedIntent(world, intent, def) {
  if (shouldCreateEtaOrder(def)) {
    const created = createOrderFromIntent(world, intent, def);
    if (!created.ok) return created;
    const written = writeLiveBoard(world, {
      backup: false,
      reason: intent.defId || "eta_order",
    });
    return { ok: true, world: written.world ?? world, order: created.order };
  }
  if (
    def?.instant &&
    intent.defId === "intent.gm.grant_power_touch"
  ) {
    const applied = grantPowerTouch(
      intent.payload?.factionId || intent.factionId,
      intent.payload?.powerPath,
      world,
    );
    if (!applied.ok) return applied;
    return { ok: true, world };
  }
  if (
    def?.instant &&
    (intent.defId === "intent.move_fleet" ||
      intent.defId === "intent.move_legion" ||
      intent.defId === "intent.blockade" ||
      intent.defId === "intent.fortify")
  ) {
    const applied = applyInstantForceMove(world, intent);
    if (!applied.ok) return applied;
    writeLiveBoard(world, { backup: false, reason: intent.defId });
    return { ok: true, world };
  }
  return { ok: true, world };
}

function markIntentApplied(intentId) {
  const nowIso = new Date().toISOString();
  const list = readIntents();
  const idx = list.findIndex((i) => i.id === intentId);
  if (idx < 0) return null;
  list[idx] = { ...list[idx], status: "applied", resolvedAt: nowIso };
  writeIntents(list);
  return list[idx];
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
  const playerOrders = (world.orders ?? []).filter(
    (o) =>
      o.factionId === factionId &&
      (o.status === "active" ||
        o.status === "pending" ||
        o.category === "eta"),
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
 * Start the once-daily Moscow 00:01 tick. Call only from serve.mjs (not Vite).
 */
export function startHostTickScheduler() {
  if (process.env.GMAP_PLAYER_SHARE === "1") {
    console.log("[tick] skipped — GMAP_PLAYER_SHARE=1 (tunnel-only process)");
    return;
  }
  startTickScheduler({
    getCron: () => getContent().rules?.tickCron || "1 0 * * *",
    getTimezone: () => getContent().rules?.tickTimezone || "Europe/Moscow",
    onTick: () => processTurn({ force: false }),
  });
}

/**
 * Connect-style middleware for Vite / Express.
 * Daily tick cron is NOT started here — call startHostTickScheduler() from
 * serve.mjs only (Vite + serve both mount this middleware; dual cron caused
 * turn spam every ~1s at 00:01).
 */
export function createApiMiddleware() {
  ensureDataDir();
  loadContent();
  resolveMasterToken();
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
      "Content-Type, X-Master-Token, X-Faction-Id, X-Faction-Password, X-Player-Token",
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
      if (
        await tryHandleEconomyMiscRoutes(req, res, url, {
          sendJson,
          readBody,
          requireMaster,
          authenticateEconomyMutation,
          authenticatePlayerFaction,
          requireMasterOrFactionAuth,
          playerEconomy,
          playerApBudget,
        })
      ) {
        return;
      }

      if (
        await tryHandleMarketRoutes(req, res, url, {
          sendJson,
          readBody,
          requireMaster,
          authenticatePlayerFaction,
          requireMasterOrFactionAuth,
          getVisibleSystemIds,
          playerSessionPayload,
        })
      ) {
        return;
      }

      if (
        await tryHandleDiploRoutes(req, res, url, {
          sendJson,
          readBody,
          authenticatePlayerFaction,
          playerSessionPayload,
          playerEconomy,
          getVisibleSystemIds,
        })
      ) {
        return;
      }

      if (
        await tryHandleCourtRoutes(req, res, url, {
          sendJson,
          readBody,
          requireMaster,
          authenticatePlayerFaction,
          playerSessionPayload,
        })
      ) {
        return;
      }

      if (
        await tryHandleSessionRoutes(req, res, url, {
          sendJson,
          readBody,
          requireMaster,
          authenticatePlayerFaction,
          requireMasterOrFactionAuth,
          playerSessionPayload,
          playerEconomy,
        })
      ) {
        return;
      }

      if (
        await tryHandleFogIntelRoutes(req, res, url, {
          sendJson,
          readBody,
          requireMaster,
        })
      ) {
        return;
      }

      if (
        await tryHandleEngagementRoutes(req, res, url, {
          sendJson,
          readBody,
          requireMaster,
          authenticatePlayerFaction,
          requireMasterOrFactionAuth,
          maskEngagementForFaction,
          bindAuthedFaction,
        })
      ) {
        return;
      }

      if (
        await tryHandleNarrativeRoutes(req, res, url, {
          sendJson,
          readBody,
          requireMaster,
        })
      ) {
        return;
      }

      if (
        await tryHandleRpRoutes(req, res, url, {
          sendJson,
          readBody,
          requireMaster,
          authenticatePlayerFaction,
          requireMasterOrFactionAuth,
          playerSessionPayload,
          playerApBudget,
          finalizeSubmittedIntent,
          bindAuthedFaction,
        })
      ) {
        return;
      }

      if (
        await tryHandleEconomyTechRoutes(req, res, url, {
          sendJson,
          readBody,
          requireMaster,
          authenticateEconomyMutation,
          playerEconomy,
        })
      ) {
        return;
      }

      if (
        await tryHandleTurnOpsRoutes(req, res, url, {
          sendJson,
          readBody,
          requireMaster,
          requireMasterOrFactionAuth,
          buildOpsHealthResponse,
        })
      ) {
        return;
      }

      if (
        await tryHandleIntentRoutes(req, res, url, {
          sendJson,
          readBody,
          requireMaster,
          authenticatePlayerFaction,
          requireMasterOrFactionAuth,
          playerSessionPayload,
          playerApBudget,
          playerEconomy,
          finalizeSubmittedIntent,
          markIntentApplied,
        })
      ) {
        return;
      }

      if (
        await tryHandlePlayersShareRoutes(req, res, url, {
          sendJson,
          readBody,
          requireMaster,
        })
      ) {
        return;
      }

      if (
        await tryHandleForcesRoutes(req, res, url, {
          sendJson,
          readBody,
          authenticatePlayerFaction,
          playerSessionPayload,
          playerApBudget,
        })
      ) {
        return;
      }

      if (
        await tryHandleEconomicTrackRoutes(req, res, url, {
          sendJson,
          readBody,
          requireMaster,
        })
      ) {
        return;
      }

      if (
        await tryHandlePlayActionRoutes(req, res, url, {
          sendJson,
          readBody,
          requireMaster,
          authenticatePlayerFaction,
          playerSessionPayload,
          playerApBudget,
          playerEconomy,
          filterWorldForFaction,
          finalizeSubmittedIntent,
          markIntentApplied,
        })
      ) {
        return;
      }

      if (
        await tryHandleGmRoutes(req, res, url, {
          sendJson,
          readBody,
          requireMaster,
          playerEconomy,
        })
      ) {
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
