/**
 * Auto-extracted from api.mjs — rp routes.
 */
import {
  ensureRp,
  ensurePlayerChannels,
  filterIndexForViewer,
  attachHqRails,
  episodeVisibleTo,
  pickHomeEpisode,
  createChapter,
  createEpisode,
  closeEpisode,
  reopenEpisode,
  readMessages,
  appendMessage,
  patchMessageFields,
  deleteMessage,
  patchMessageIntentId,
  DEFAULT_CAMPAIGN,
} from "../rpStore.mjs";
import { rollDiceToRpEpisode } from "../dice.mjs";
import {
  createChoicePrompt,
  createDicePrompt,
  resolveChoicePrompt,
  resolveDicePrompt,
  setEpisodePin,
} from "../rpPrompts.mjs";
import { readLiveBoard, writeLiveBoard } from "../tableStore.mjs";
import { readIntents, writeIntents, submitIntent } from "../intents.mjs";
import { getContent } from "../contentLoader.mjs";
import { normalizeRpPersona } from "../rpPersona.mjs";

/**
 * @returns {Promise<boolean>}
 */
export async function tryHandleRpRoutes(req, res, url, ctx) {
  if (!(url.pathname === "/api/rp" || url.pathname.startsWith("/api/rp/"))) return false;

  const {
    sendJson,
    readBody,
    requireMaster,
    authenticatePlayerFaction,
    requireMasterOrFactionAuth,
    playerSessionPayload,
    playerApBudget,
    finalizeSubmittedIntent,
    bindAuthedFaction,
  } = ctx;

  if (url.pathname === "/api/rp" && req.method === "GET") {
    const campaignId =
      url.searchParams.get("campaignId") || DEFAULT_CAMPAIGN;
    const world = readLiveBoard();
    const auth = requireMasterOrFactionAuth(req, world, null);
    if (!auth.ok) {
      sendJson(res, 401, { error: auth.error });
      return true;
    }
    const isMaster = !!auth.master;
    const factionId = isMaster ? null : auth.faction?.id || null;
    const factions = world?.factions ?? [];
    let index = ensurePlayerChannels(factions, campaignId);
    const viewer = { isMaster, factionId };
    index = filterIndexForViewer(index, viewer);
    index = attachHqRails(index, viewer, campaignId);
    const home =
      !isMaster && factionId
        ? pickHomeEpisode(index, factionId)
        : { chapterId: "", episodeId: "" };
    sendJson(res, 200, { ...index, home });
    return true;
  }

  if (url.pathname === "/api/rp/chapter" && req.method === "POST") {
    if (!requireMaster(req)) {
      sendJson(res, 401, { error: "Неверный мастер-токен" });
      return true;
    }
    const body = await readBody(req);
    const result = createChapter(
      body.title,
      body.campaignId || DEFAULT_CAMPAIGN,
    );
    sendJson(res, 200, result);
    return true;
  }

  if (url.pathname === "/api/rp/episode" && req.method === "POST") {
    if (!requireMaster(req)) {
      sendJson(res, 401, { error: "Неверный мастер-токен" });
      return true;
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
    return true;
  }

  if (url.pathname === "/api/rp/episode/close" && req.method === "POST") {
    if (!requireMaster(req)) {
      sendJson(res, 401, { error: "Неверный мастер-токен" });
      return true;
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
    return true;
  }

  if (url.pathname === "/api/rp/messages" && req.method === "GET") {
    const chapterId = url.searchParams.get("chapterId");
    const episodeId = url.searchParams.get("episodeId");
    const campaignId =
      url.searchParams.get("campaignId") || DEFAULT_CAMPAIGN;
    if (!chapterId || !episodeId) {
      sendJson(res, 400, { error: "chapterId + episodeId" });
      return true;
    }
    const world = readLiveBoard();
    const auth = requireMasterOrFactionAuth(req, world, null);
    if (!auth.ok) {
      sendJson(res, 401, { error: auth.error });
      return true;
    }
    const isMaster = !!auth.master;
    const factionId = isMaster ? null : auth.faction?.id || null;
    const index = ensureRp(campaignId);
    const ch = (index.chapters || []).find((c) => c.id === chapterId);
    const ep = (ch?.episodes || []).find((e) => e.id === episodeId);
    if (
      !episodeVisibleTo(ep, { isMaster, factionId })
    ) {
      sendJson(res, 403, { error: "нет доступа к каналу" });
      return true;
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
      visibility: ep?.visibility || "all",
      kind: ep?.kind || null,
      status: ep?.status || "open",
    });
    return true;
  }

  if (url.pathname === "/api/rp/messages" && req.method === "POST") {
    const body = await readBody(req);
    const world = readLiveBoard();
    const auth = bindAuthedFaction(
      authenticatePlayerFaction(body, world, req),
      body,
    );
    if (!auth.ok) {
      sendJson(res, 401, { error: auth.error });
      return true;
    }
    const isMaster = !!auth.master;
    let authorFactionId = body.authorFactionId || null;
    let authorName = body.authorName || null;
    let authorAvatarUrl = body.authorAvatarUrl || null;
    let playerFaction = null;

    if (!isMaster) {
      if (!world) {
        sendJson(res, 404, { error: "Нет board" });
        return true;
      }
      const faction = auth.faction;
      playerFaction = faction;
      authorFactionId = faction.id;
      authorName = body.authorName || faction.name;
      authorAvatarUrl =
        body.authorAvatarUrl || faction.avatarUrl || null;
    } else {
      authorName = body.authorName || "Мастер";
    }

    // Persona: narrator / NPC / anonymous speak-as. Players cannot narrate.
    const persona = normalizeRpPersona(body.persona, isMaster);
    if (persona === "narrator") {
      authorName = "Рассказчик";
      authorAvatarUrl = null;
    } else if (persona === "anonymous" && isMaster) {
      authorName = body.authorName || "???";
      authorAvatarUrl = null;
    } else if (persona === "alias" && isMaster) {
      authorName = String(body.authorName || "???").slice(0, 80);
      authorAvatarUrl = body.authorAvatarUrl || null;
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
      return true;
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
    return true;
  }

  if (url.pathname === "/api/rp/messages/edit" && req.method === "POST") {
    if (!requireMaster(req)) {
      sendJson(res, 401, { error: "Неверный мастер-токен" });
      return true;
    }
    const body = await readBody(req);
    const fields = {};
    if (typeof body.body === "string") {
      fields.body = String(body.body).slice(0, 4000);
    }
    if (typeof body.authorName === "string" && body.authorName.trim()) {
      fields.authorName = String(body.authorName).trim().slice(0, 80);
    }
    if (body.authorAvatarUrl === null) {
      fields.authorAvatarUrl = null;
    } else if (typeof body.authorAvatarUrl === "string") {
      fields.authorAvatarUrl = String(body.authorAvatarUrl).slice(0, 500);
    }
    if (Object.keys(fields).length === 0) {
      sendJson(res, 400, { error: "нечего менять" });
      return true;
    }
    fields.editedAt = new Date().toISOString();
    const result = patchMessageFields(
      body.chapterId,
      body.episodeId,
      body.messageId,
      fields,
      body.campaignId || DEFAULT_CAMPAIGN,
    );
    sendJson(res, result.ok ? 200 : 400, result);
    return true;
  }

  if (url.pathname === "/api/rp/dice" && req.method === "POST") {
    const body = await readBody(req);
    const world = readLiveBoard();
    const auth = bindAuthedFaction(
      authenticatePlayerFaction(body, world, req),
      body,
    );
    if (!auth.ok) {
      sendJson(res, 401, { error: auth.error });
      return true;
    }
    const isMaster = !!auth.master;
    let factionId = body.factionId || null;
    let authorName = body.authorName || null;
    if (!isMaster) {
      if (!world) {
        sendJson(res, 404, { error: "Нет board" });
        return true;
      }
      factionId = auth.faction.id;
      authorName = body.authorName || auth.faction.name;
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
    return true;
  }

  if (url.pathname === "/api/rp/prompt" && req.method === "POST") {
    if (!requireMaster(req)) {
      sendJson(res, 401, { error: "Неверный мастер-токен" });
      return true;
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
      return true;
    }
    sendJson(res, result.ok ? 200 : 400, result);
    return true;
  }

  if (url.pathname === "/api/rp/prompt/resolve" && req.method === "POST") {
    const body = await readBody(req);
    const world = readLiveBoard();
    const auth = bindAuthedFaction(
      authenticatePlayerFaction(body, world, req),
      body,
    );
    if (!auth.ok) {
      sendJson(res, 401, { error: auth.error });
      return true;
    }
    const isMaster = !!auth.master;
    let factionId = null;
    let authorName = null;
    if (!isMaster) {
      if (!world) {
        sendJson(res, 404, { error: "Нет board" });
        return true;
      }
      factionId = auth.faction.id;
      authorName = body.authorName || auth.faction.name;
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
    return true;
  }

  if (url.pathname === "/api/rp/messages/delete" && req.method === "POST") {
    if (!requireMaster(req)) {
      sendJson(res, 401, { error: "Неверный мастер-токен" });
      return true;
    }
    const body = await readBody(req);
    const result = deleteMessage(
      body.chapterId,
      body.episodeId,
      body.messageId,
      body.campaignId || DEFAULT_CAMPAIGN,
    );
    sendJson(res, result.ok ? 200 : 400, result);
    return true;
  }

  if (url.pathname === "/api/rp/pin" && req.method === "POST") {
    if (!requireMaster(req)) {
      sendJson(res, 401, { error: "Неверный мастер-токен" });
      return true;
    }
    const body = await readBody(req);
    const result = setEpisodePin(
      body.chapterId,
      body.episodeId,
      body.clear ? null : { title: body.title, body: body.body },
      body.campaignId || DEFAULT_CAMPAIGN,
    );
    sendJson(res, result.ok ? 200 : 400, result);
    return true;
  }
  return false;
}
