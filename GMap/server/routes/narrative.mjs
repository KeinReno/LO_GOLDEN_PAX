/**
 * Auto-extracted from api.mjs — narrative routes.
 */
import { applyPresetToSystems, scheduleTimer } from "../narrative.mjs";
import { readLiveBoard, writeLiveBoard } from "../tableStore.mjs";
import { getContent } from "../contentLoader.mjs";

/**
 * @returns {Promise<boolean>}
 */
export async function tryHandleNarrativeRoutes(req, res, url, ctx) {
  if (!(url.pathname.startsWith("/api/narrative/"))) return false;

  const {
    sendJson,
    readBody,
    requireMaster,
  } = ctx;

  if (url.pathname === "/api/narrative/paint" && req.method === "POST") {
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
    const content = getContent();
    const preset =
      content.consequences?.[body.presetId] ||
      content.system_presets?.[body.presetId];
    if (!preset) {
      sendJson(res, 400, { error: "unknown preset" });
      return true;
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
      return true;
    }
    const written = writeLiveBoard(world, {
      backup: false,
      reason: "narrative_paint",
    });
    sendJson(res, 200, { ok: true, ...result, journal, ...written });
    return true;
  }

  if (url.pathname === "/api/narrative/timer" && req.method === "POST") {
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
    const ids = body.systemIds || (body.systemId ? [body.systemId] : []);
    if (!ids.length) {
      sendJson(res, 400, { error: "systemId(s) required" });
      return true;
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
      return true;
    }
    writeLiveBoard(world, { backup: false, reason: "timer" });
    sendJson(res, 200, { ok: true, count: touched, systems: updated });
    return true;
  }

  if (url.pathname === "/api/narrative/gm-note" && req.method === "POST") {
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
    const ids = body.systemIds || (body.systemId ? [body.systemId] : []);
    for (const sys of world.systems ?? []) {
      if (!ids.includes(sys.id)) continue;
      sys.gmNotes = body.gmNotes ?? body.notes ?? "";
      if (body.notes != null) sys.notes = body.notes;
    }
    writeLiveBoard(world, { backup: false, reason: "gm_note" });
    sendJson(res, 200, { ok: true, count: ids.length });
    return true;
  }

  // ── RP / Campaign (P7) ─────────────────────────────────
  return false;
}
