/**
 * Auto-extracted from api.mjs — gm routes.
 */
import {
  buildGmBalanceSnapshot,
  applyGmBalancePatch,
} from "../gmBalance.mjs";
import {
  buildFactionComparison,
  buildSessionBrief,
  listGmInterventions,
  appendGmIntervention,
  listCockpitBackups,
  runDryRunTick,
  listGmPegMultipliers,
  setGmPegMultiplier,
} from "../gmCockpit.mjs";
import { grantPowerTouch } from "../powerPaths.mjs";
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
} from "../gmContent.mjs";
import { spawnStoryQuestFromCatalog } from "../storyQuestSpawn.mjs";
import { readLiveBoard, writeLiveBoard, writeJson, PUBLISHED_PATH, bumpTableRevision } from "../tableStore.mjs";
import { restoreCockpitBackup } from "../opsHealth.mjs";
import { getContent, loadContent } from "../contentLoader.mjs";
import { ensureFactionEco, readLedger, writeLedger, getFactionPublicEco, adjustStock } from "../ledger.mjs";
import {
  readGateCampaigns,
  patchGateCampaign,
  saveGateCampaignArt,
} from "../gateCampaigns.mjs";

/**
 * @returns {Promise<boolean>}
 */
export async function tryHandleGmRoutes(req, res, url, ctx) {
  if (!(url.pathname.startsWith("/api/gm/"))) return false;

  const {
    sendJson,
    readBody,
    requireMaster,
    playerEconomy,
  } = ctx;

  if (url.pathname === "/api/gm/balance/snapshot" && req.method === "GET") {
    if (!requireMaster(req)) {
      sendJson(res, 401, { error: "Неверный мастер-токен" });
      return true;
    }
    sendJson(res, 200, buildGmBalanceSnapshot());
    return true;
  }

  if (url.pathname === "/api/gm/balance/patch" && req.method === "POST") {
    if (!requireMaster(req)) {
      sendJson(res, 401, { error: "Неверный мастер-токен" });
      return true;
    }
    const body = (await readBody(req)) || {};
    const result = applyGmBalancePatch(body);
    if (!result.ok) {
      sendJson(res, 400, result);
      return true;
    }
    sendJson(res, 200, result);
    return true;
  }

  // C5 T5.1 — faction comparison (health domain)
  if (url.pathname === "/api/gm/cockpit/factions" && req.method === "GET") {
    if (!requireMaster(req)) {
      sendJson(res, 401, { error: "Неверный мастер-токен" });
      return true;
    }
    sendJson(res, 200, buildFactionComparison());
    return true;
  }

  // C5 T5.2 — session brief from turn snapshot diffs
  if (url.pathname === "/api/gm/cockpit/brief" && req.method === "GET") {
    if (!requireMaster(req)) {
      sendJson(res, 401, { error: "Неверный мастер-токен" });
      return true;
    }
    sendJson(
      res,
      200,
      buildSessionBrief({
        from: url.searchParams.get("from") || undefined,
        to: url.searchParams.get("to") || undefined,
      }),
    );
    return true;
  }

  if (url.pathname === "/api/gm/cockpit/backups" && req.method === "GET") {
    if (!requireMaster(req)) {
      sendJson(res, 401, { error: "Неверный мастер-токен" });
      return true;
    }
    sendJson(res, 200, listCockpitBackups());
    return true;
  }

  if (
    url.pathname === "/api/gm/cockpit/backups/restore" &&
    req.method === "POST"
  ) {
    if (!requireMaster(req)) {
      sendJson(res, 401, { error: "Неверный мастер-токен" });
      return true;
    }
    const body = (await readBody(req)) || {};
    const name = String(body.name || body.dir || "");
    const result = restoreCockpitBackup(name);
    sendJson(res, result.ok ? 200 : 400, result);
    return true;
  }

  // C5 T5.5 — GM intervention log
  if (
    url.pathname === "/api/gm/cockpit/interventions" &&
    req.method === "GET"
  ) {
    if (!requireMaster(req)) {
      sendJson(res, 401, { error: "Неверный мастер-токен" });
      return true;
    }
    const limit = Number(url.searchParams.get("limit") || 40);
    sendJson(res, 200, listGmInterventions(limit));
    return true;
  }

  if (
    url.pathname === "/api/gm/grant-power-touch" &&
    req.method === "POST"
  ) {
    if (!requireMaster(req)) {
      sendJson(res, 401, { error: "Неверный мастер-токен" });
      return true;
    }
    const body = await readBody(req);
    const world = readLiveBoard();
    if (!world) {
      sendJson(res, 404, { error: "Нет board" });
      return true;
    }
    const factionId = body?.factionId;
    const powerPath = body?.powerPath;
    if (!factionId || !powerPath) {
      sendJson(res, 400, { error: "factionId + powerPath required" });
      return true;
    }
    const result = grantPowerTouch(factionId, powerPath, world);
    sendJson(res, result.ok ? 200 : 400, result);
    return true;
  }

  if (url.pathname === "/api/gm/ledger/stock" && req.method === "POST") {
    if (!requireMaster(req)) {
      sendJson(res, 401, { error: "Неверный мастер-токен" });
      return true;
    }
    const body = (await readBody(req)) || {};
    const factionId = String(body.factionId || "");
    const currencyId = String(body.currencyId || "");
    const amount = Math.max(0, Math.floor(Number(body.amount) || 0));
    if (!factionId || !currencyId) {
      sendJson(res, 400, { error: "Нужны держава и ресурс" });
      return true;
    }
    const ledger = readLedger();
    const eco = ensureFactionEco(ledger, factionId);
    const before = Number(eco.stocks[currencyId] ?? 0);
    const world = readLiveBoard();
    adjustStock(ledger, factionId, currencyId, amount - before, {
      reason: "gm_set_stock",
      turn: world?.meta?.turn ?? null,
    });
    writeLedger(ledger);
    appendGmIntervention({
      action: "set_stock",
      actor: "gm",
      before: { factionId, currencyId, amount: before },
      after: { factionId, currencyId, amount },
    });
    sendJson(res, 200, {
      ok: true,
      factionId,
      currencyId,
      amount: Number(ensureFactionEco(ledger, factionId).stocks[currencyId] ?? 0),
    });
    return true;
  }

  if (url.pathname === "/api/gm/peg-multipliers" && req.method === "GET") {
    if (!requireMaster(req)) {
      sendJson(res, 401, { error: "Неверный мастер-токен" });
      return true;
    }
    sendJson(res, 200, listGmPegMultipliers(readLiveBoard()));
    return true;
  }

  if (url.pathname === "/api/gm/peg-multiplier" && req.method === "POST") {
    if (!requireMaster(req)) {
      sendJson(res, 401, { error: "Неверный мастер-токен" });
      return true;
    }
    const body = (await readBody(req)) || {};
    const result = setGmPegMultiplier(body.resourceId, body.multiplier);
    const status = result.ok ? 200 : result.error === "Нет board" ? 404 : 400;
    sendJson(res, status, result);
    return true;
  }

  // C5 T5.3 — dry-run tick (scratch via backupTurnSnapshot; live restored)
  if (url.pathname === "/api/gm/cockpit/dry-run" && req.method === "POST") {
    if (!requireMaster(req)) {
      sendJson(res, 401, { error: "Неверный мастер-токен" });
      return true;
    }
    const result = runDryRunTick();
    sendJson(res, result.ok ? 200 : 400, result);
    return true;
  }

  if (url.pathname === "/api/gm/content/catalogs" && req.method === "GET") {
    if (!requireMaster(req)) {
      sendJson(res, 401, { error: "Неверный мастер-токен" });
      return true;
    }
    sendJson(res, 200, { catalogs: listAtelierCatalogs() });
    return true;
  }

  if (url.pathname === "/api/gm/content/meta" && req.method === "GET") {
    if (!requireMaster(req)) {
      sendJson(res, 401, { error: "Неверный мастер-токен" });
      return true;
    }
    const catalog = url.searchParams.get("catalog") || "";
    const result = getCatalogMeta(catalog);
    sendJson(res, result.ok ? 200 : 400, result);
    return true;
  }

  if (url.pathname === "/api/gm/content/entries" && req.method === "GET") {
    if (!requireMaster(req)) {
      sendJson(res, 401, { error: "Неверный мастер-токен" });
      return true;
    }
    const catalog = url.searchParams.get("catalog") || "";
    const result = listCatalogEntries(catalog, {
      q: url.searchParams.get("q") || "",
      bag: url.searchParams.get("bag") || "",
      limit: url.searchParams.get("limit") || "80",
      offset: url.searchParams.get("offset") || "0",
    });
    sendJson(res, result.ok ? 200 : 400, result);
    return true;
  }

  if (url.pathname === "/api/gm/content/entry" && req.method === "GET") {
    if (!requireMaster(req)) {
      sendJson(res, 401, { error: "Неверный мастер-токен" });
      return true;
    }
    const catalog = url.searchParams.get("catalog") || "";
    const key = url.searchParams.get("key") || "";
    const bag = url.searchParams.get("bag") || "";
    const result = readCatalogEntry(catalog, key, bag);
    sendJson(res, result.ok ? 200 : 404, result);
    return true;
  }

  if (url.pathname === "/api/gm/content/entry" && req.method === "POST") {
    if (!requireMaster(req)) {
      sendJson(res, 401, { error: "Неверный мастер-токен" });
      return true;
    }
    const body = (await readBody(req)) || {};
    const catalog = body.catalog || url.searchParams.get("catalog") || "";
    const key = body.key || url.searchParams.get("key") || "";
    const bag = body.bag || url.searchParams.get("bag") || "";
    const data = body.data ?? body.value ?? body.entry;
    const result = saveCatalogEntry(
      catalog,
      key,
      bag,
      data,
      Boolean(body.create),
    );
    sendJson(res, result.ok ? 200 : 400, result);
    return true;
  }

  if (url.pathname === "/api/gm/content/entry" && req.method === "DELETE") {
    if (!requireMaster(req)) {
      sendJson(res, 401, { error: "Неверный мастер-токен" });
      return true;
    }
    const body = (await readBody(req)) || {};
    const catalog = body.catalog || url.searchParams.get("catalog") || "";
    const key = body.key || url.searchParams.get("key") || "";
    const bag = body.bag || url.searchParams.get("bag") || "";
    const result = removeCatalogEntry(catalog, key, bag);
    sendJson(res, result.ok ? 200 : 400, result);
    return true;
  }

  if (url.pathname === "/api/gm/content/document" && req.method === "GET") {
    if (!requireMaster(req)) {
      sendJson(res, 401, { error: "Неверный мастер-токен" });
      return true;
    }
    const catalog = url.searchParams.get("catalog") || "";
    const result = readCatalogDocument(catalog);
    sendJson(res, result.ok ? 200 : 400, result);
    return true;
  }

  if (url.pathname === "/api/gm/content/document" && req.method === "POST") {
    if (!requireMaster(req)) {
      sendJson(res, 401, { error: "Неверный мастер-токен" });
      return true;
    }
    const body = (await readBody(req)) || {};
    const catalog = body.catalog || url.searchParams.get("catalog") || "";
    const data = body.data ?? body.document ?? body.value;
    const result = saveCatalogDocument(catalog, data);
    sendJson(res, result.ok ? 200 : 400, result);
    return true;
  }

  if (url.pathname === "/api/gm/content/rules-knobs" && req.method === "POST") {
    if (!requireMaster(req)) {
      sendJson(res, 401, { error: "Неверный мастер-токен" });
      return true;
    }
    const body = (await readBody(req)) || {};
    const patch =
      body.patch && typeof body.patch === "object" && !Array.isArray(body.patch)
        ? body.patch
        : body;
    const result = patchRulesKnobs(patch);
    sendJson(res, result.ok ? 200 : 400, result);
    return true;
  }

  if (url.pathname === "/api/gm/content/reload" && req.method === "POST") {
    if (!requireMaster(req)) {
      sendJson(res, 401, { error: "Неверный мастер-токен" });
      return true;
    }
    loadContent();
    sendJson(res, 200, { ok: true });
    return true;
  }

  if (url.pathname === "/api/gm/quests/spawn-catalog" && req.method === "POST") {
    if (!requireMaster(req)) {
      sendJson(res, 401, { error: "Неверный мастер-токен" });
      return true;
    }
    const body = (await readBody(req)) || {};
    const catalogId = String(body.catalogId || "");
    const factionId = String(body.factionId || "");
    if (!catalogId || !factionId) {
      sendJson(res, 400, { ok: false, error: "Нужны catalogId и factionId" });
      return true;
    }
    const result = spawnStoryQuestFromCatalog(catalogId, factionId, {
      systemId: body.systemId || null,
      returnWorld: true,
    });
    if (!result.ok) {
      sendJson(res, 400, result);
      return true;
    }
    sendJson(res, 200, {
      ok: true,
      quest: result.quest,
      world: result.world,
      tableRevision: result.tableRevision ?? result.world?.meta?.tableRevision,
    });
    return true;
  }

  if (url.pathname === "/api/gm/apply-build" && req.method === "POST") {
    if (!requireMaster(req)) {
      sendJson(res, 401, { error: "Неверный мастер-токен" });
      return true;
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
    return true;
  }

  if (url.pathname === "/api/gm/gate-campaigns" && req.method === "GET") {
    if (!requireMaster(req)) {
      sendJson(res, 401, { error: "Неверный мастер-токен" });
      return true;
    }
    sendJson(res, 200, { ok: true, ...readGateCampaigns() });
    return true;
  }

  if (url.pathname === "/api/gm/gate-campaigns" && req.method === "POST") {
    if (!requireMaster(req)) {
      sendJson(res, 401, { error: "Неверный мастер-токен" });
      return true;
    }
    const body = (await readBody(req)) || {};
    const result = patchGateCampaign(body.id, body);
    sendJson(res, result.ok ? 200 : 400, result);
    return true;
  }

  if (url.pathname === "/api/gm/gate-campaigns/art" && req.method === "POST") {
    if (!requireMaster(req)) {
      sendJson(res, 401, { error: "Неверный мастер-токен" });
      return true;
    }
    const body = (await readBody(req)) || {};
    const result = saveGateCampaignArt(body.id, {
      mime: body.mime,
      data: body.data,
    });
    sendJson(res, result.ok ? 200 : 400, result);
    return true;
  }

  return false;
}
