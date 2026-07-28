/**
 * RP channels / episodes — chapters / messages.jsonl (P7).
 * Append-only messages; index holds chapter/episode metadata.
 *
 * Channel kinds:
 *   hq   — faction HQ (default home for that player), visibility gm_player:{id}
 *   ooc  — optional table-wide OOC
 *   scene / (unset) — narrative episodes (GM opens)
 */
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, ensureDataDir, readJson, writeJson } from "./tableStore.mjs";

export const RP_ROOT = path.join(DATA_DIR, "rp");
const DEFAULT_CAMPAIGN = "golden_pax";
const CHANNELS_CHAPTER_ID = "ch_channels";
const OOC_EPISODE_ID = "ep_ooc_table";

const MSG_TYPES = new Set(["ooc", "ic", "action", "context", "system"]);

function campaignDir(campaignId = DEFAULT_CAMPAIGN) {
  return path.join(RP_ROOT, campaignId || DEFAULT_CAMPAIGN);
}

function indexPath(campaignId) {
  return path.join(campaignDir(campaignId), "index.json");
}

function episodeDir(campaignId, chapterId, episodeId) {
  return path.join(
    campaignDir(campaignId),
    "chapters",
    chapterId,
    "episodes",
    episodeId,
  );
}

function messagesPath(campaignId, chapterId, episodeId) {
  return path.join(
    episodeDir(campaignId, chapterId, episodeId),
    "messages.jsonl",
  );
}

function ensureEpisodeFiles(campaignId, chapterId, episodeId) {
  const dir = episodeDir(campaignId, chapterId, episodeId);
  fs.mkdirSync(dir, { recursive: true });
  const file = messagesPath(campaignId, chapterId, episodeId);
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, "", "utf8");
  }
}

function emptyIndex(campaignId) {
  return {
    campaignId: campaignId || DEFAULT_CAMPAIGN,
    title: "LO Golden Pax",
    chapters: [
      {
        id: CHANNELS_CHAPTER_ID,
        title: "Связь",
        kind: "channels",
        episodes: [],
      },
    ],
  };
}

export function ensureRp(campaignId = DEFAULT_CAMPAIGN) {
  ensureDataDir();
  const dir = campaignDir(campaignId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const ip = indexPath(campaignId);
  if (!fs.existsSync(ip)) {
    writeJson(ip, emptyIndex(campaignId));
  }
  return readJson(ip, emptyIndex(campaignId));
}

export function readRpIndex(campaignId = DEFAULT_CAMPAIGN) {
  return ensureRp(campaignId);
}

export function writeRpIndex(index, campaignId = DEFAULT_CAMPAIGN) {
  ensureDataDir();
  const dir = campaignDir(campaignId || index.campaignId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  writeJson(indexPath(campaignId || index.campaignId), index);
}

function findEpisode(index, chapterId, episodeId) {
  const ch = (index.chapters || []).find((c) => c.id === chapterId);
  if (!ch) return { chapter: null, episode: null };
  const ep = (ch.episodes || []).find((e) => e.id === episodeId);
  return { chapter: ch, episode: ep };
}

/**
 * Whether a player/master may open this channel/episode.
 */
export function episodeVisibleTo(ep, viewer) {
  if (!ep) return false;
  if (viewer?.isMaster) return true;
  const vis = ep.visibility || "all";
  if (vis === "all") return true;
  if (vis === "gm_only") return false;
  if (vis.startsWith("faction:")) {
    return vis.slice("faction:".length) === viewer?.factionId;
  }
  if (vis.startsWith("gm_player:")) {
    return vis.slice("gm_player:".length) === viewer?.factionId;
  }
  return false;
}

/** Strip chapters/episodes the viewer cannot see. */
export function filterIndexForViewer(index, viewer) {
  if (viewer?.isMaster) return index;
  return {
    ...index,
    chapters: (index.chapters || [])
      .map((ch) => ({
        ...ch,
        episodes: (ch.episodes || []).filter((ep) =>
          episodeVisibleTo(ep, viewer),
        ),
      }))
      .filter((ch) => (ch.episodes || []).length > 0),
  };
}

/**
 * Prefer faction HQ channel as home; fall back to first visible open episode.
 */
export function pickHomeEpisode(index, factionId) {
  const flat =
    index?.chapters?.flatMap((c) =>
      (c.episodes || []).map((e) => ({
        chapterId: c.id,
        episode: e,
      })),
    ) ?? [];
  const hq = flat.find(
    (x) =>
      x.episode.kind === "hq" &&
      (x.episode.ref === `faction:${factionId}` ||
        x.episode.id === `hq_${factionId}` ||
        x.episode.visibility === `gm_player:${factionId}`),
  );
  if (hq) {
    return { chapterId: hq.chapterId, episodeId: hq.episode.id };
  }
  const open = flat.find((x) => x.episode.status !== "closed") ?? flat[0];
  if (!open) return { chapterId: "", episodeId: "" };
  return { chapterId: open.chapterId, episodeId: open.episode.id };
}

/**
 * Ensure per-faction HQ channels + optional table OOC.
 * Soft-migrates legacy «Открытие стола» (keeps archive, not player home).
 */
export function ensurePlayerChannels(
  factions = [],
  campaignId = DEFAULT_CAMPAIGN,
) {
  const index = readRpIndex(campaignId);
  let dirty = false;

  let ch = (index.chapters || []).find((c) => c.id === CHANNELS_CHAPTER_ID);
  if (!ch) {
    ch = {
      id: CHANNELS_CHAPTER_ID,
      title: "Связь",
      kind: "channels",
      episodes: [],
    };
    index.chapters = index.chapters || [];
    index.chapters.unshift(ch);
    dirty = true;
  } else {
    if (ch.title === "Глава I" || !ch.title) {
      ch.title = "Связь";
      dirty = true;
    }
    if (!ch.kind) {
      ch.kind = "channels";
      dirty = true;
    }
  }
  ch.episodes = ch.episodes || [];

  for (const fac of factions) {
    if (!fac?.id) continue;
    const hqId = `hq_${fac.id}`;
    let ep = ch.episodes.find(
      (e) =>
        e.id === hqId ||
        e.ref === `faction:${fac.id}` ||
        (e.kind === "hq" && e.visibility === `gm_player:${fac.id}`),
    );
    if (!ep) {
      // Also search other chapters (legacy)
      for (const other of index.chapters || []) {
        ep = (other.episodes || []).find(
          (e) =>
            e.id === hqId ||
            e.ref === `faction:${fac.id}` ||
            (e.kind === "hq" && e.visibility === `gm_player:${fac.id}`),
        );
        if (ep) break;
      }
    }
    if (!ep) {
      ep = {
        id: hqId,
        title: `Штаб · ${fac.name || fac.id}`,
        status: "open",
        visibility: `gm_player:${fac.id}`,
        kind: "hq",
        ref: `faction:${fac.id}`,
        createdAt: new Date().toISOString(),
      };
      ch.episodes.push(ep);
      ensureEpisodeFiles(campaignId, ch.id, ep.id);
      dirty = true;
    } else {
      const wantTitle = `Штаб · ${fac.name || fac.id}`;
      if (ep.kind !== "hq") {
        ep.kind = "hq";
        dirty = true;
      }
      if (ep.visibility !== `gm_player:${fac.id}`) {
        ep.visibility = `gm_player:${fac.id}`;
        dirty = true;
      }
      if (ep.ref !== `faction:${fac.id}`) {
        ep.ref = `faction:${fac.id}`;
        dirty = true;
      }
      if (ep.title !== wantTitle && String(ep.title || "").startsWith("Штаб")) {
        ep.title = wantTitle;
        dirty = true;
      }
      ensureEpisodeFiles(
        campaignId,
        (index.chapters || []).find((c) =>
          (c.episodes || []).some((e) => e.id === ep.id),
        )?.id || ch.id,
        ep.id,
      );
    }
  }

  let ooc = ch.episodes.find((e) => e.id === OOC_EPISODE_ID || e.kind === "ooc");
  if (!ooc) {
    ooc = {
      id: OOC_EPISODE_ID,
      title: "Служебный (мастер)",
      status: "open",
      visibility: "gm_only",
      kind: "ooc",
      ref: null,
      createdAt: new Date().toISOString(),
    };
    ch.episodes.push(ooc);
    ensureEpisodeFiles(campaignId, ch.id, ooc.id);
    dirty = true;
  } else {
    if (ooc.title === "Открытие стола" || ooc.title === "Общий стол") {
      ooc.title = "Служебный (мастер)";
      dirty = true;
    }
    ooc.kind = ooc.kind || "ooc";
    // Players: no table-wide chat — RP is GM↔faction only for now.
    if (ooc.visibility !== "gm_only") {
      ooc.visibility = "gm_only";
      dirty = true;
    }
  }

  // Soft-migrate legacy default episode name / visibility
  for (const chapter of index.chapters || []) {
    for (const ep of chapter.episodes || []) {
      if (ep.id === "ep1" && ep.title === "Открытие стола") {
        ep.title = "Архив · открытие стола";
        ep.kind = ep.kind || "scene";
        if (ep.status === "open") {
          ep.status = "closed";
          ep.closedAt = ep.closedAt || new Date().toISOString();
        }
        dirty = true;
      }
    }
  }

  if (dirty) writeRpIndex(index, campaignId);
  return readRpIndex(campaignId);
}

export function createChapter(title, campaignId = DEFAULT_CAMPAIGN) {
  const index = readRpIndex(campaignId);
  const id = `ch_${Date.now().toString(36)}`;
  index.chapters.push({
    id,
    title: title || `Глава ${index.chapters.length + 1}`,
    episodes: [],
  });
  writeRpIndex(index, campaignId);
  return { ok: true, chapter: index.chapters[index.chapters.length - 1], index };
}

export function createEpisode(
  chapterId,
  { title, visibility, ref, kind } = {},
  campaignId = DEFAULT_CAMPAIGN,
) {
  const index = readRpIndex(campaignId);
  const ch = (index.chapters || []).find((c) => c.id === chapterId);
  if (!ch) return { ok: false, error: "chapter missing" };
  const id = `ep_${Date.now().toString(36)}`;
  const ep = {
    id,
    title: title || `Сцена ${(ch.episodes || []).length + 1}`,
    status: "open",
    visibility: visibility || "all",
    kind: kind || "scene",
    ref: ref || null,
    createdAt: new Date().toISOString(),
  };
  ch.episodes = ch.episodes || [];
  ch.episodes.push(ep);
  ensureEpisodeFiles(campaignId, chapterId, id);
  writeRpIndex(index, campaignId);
  return { ok: true, episode: ep, index };
}

export function closeEpisode(chapterId, episodeId, campaignId = DEFAULT_CAMPAIGN) {
  const index = readRpIndex(campaignId);
  const { episode } = findEpisode(index, chapterId, episodeId);
  if (!episode) return { ok: false, error: "episode missing" };
  episode.status = "closed";
  episode.closedAt = new Date().toISOString();
  writeRpIndex(index, campaignId);
  return { ok: true, episode, index };
}

export function reopenEpisode(chapterId, episodeId, campaignId = DEFAULT_CAMPAIGN) {
  const index = readRpIndex(campaignId);
  const { episode } = findEpisode(index, chapterId, episodeId);
  if (!episode) return { ok: false, error: "episode missing" };
  episode.status = "open";
  delete episode.closedAt;
  writeRpIndex(index, campaignId);
  return { ok: true, episode, index };
}

/**
 * @param {{ visibility: string, factionId?: string|null, isMaster?: boolean }} viewer
 */
export function messageVisibleTo(msg, viewer) {
  const vis = msg.visibility || "all";
  if (viewer?.isMaster) return true;
  if (vis === "all") return true;
  if (vis === "gm_only") return false;
  if (vis.startsWith("faction:")) {
    return vis.slice("faction:".length) === viewer?.factionId;
  }
  if (vis.startsWith("gm_player:")) {
    return vis.slice("gm_player:".length) === viewer?.factionId;
  }
  return false;
}

export function readMessages(
  chapterId,
  episodeId,
  viewer,
  campaignId = DEFAULT_CAMPAIGN,
) {
  ensureRp(campaignId);
  const index = readRpIndex(campaignId);
  const { episode } = findEpisode(index, chapterId, episodeId);
  if (!episodeVisibleTo(episode, viewer)) return [];
  const file = messagesPath(campaignId, chapterId, episodeId);
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean);
  const out = [];
  for (const line of lines) {
    try {
      const msg = JSON.parse(line);
      if (messageVisibleTo(msg, viewer)) out.push(msg);
    } catch {
      /* skip bad line */
    }
  }
  return out;
}

/**
 * Append message. Does not mutate board/ledger.
 * @returns {{ ok: true, message } | { ok: false, error: string }}
 */
export function appendMessage(
  chapterId,
  episodeId,
  {
    type,
    body,
    authorFactionId,
    authorName,
    authorAvatarUrl,
    visibility,
    intentPayload,
    isMaster,
  },
  campaignId = DEFAULT_CAMPAIGN,
) {
  const index = readRpIndex(campaignId);
  const { episode } = findEpisode(index, chapterId, episodeId);
  if (!episode) return { ok: false, error: "episode missing" };
  if (!episodeVisibleTo(episode, { isMaster, factionId: authorFactionId })) {
    return { ok: false, error: "нет доступа к каналу" };
  }
  if (episode.status === "closed" && !isMaster) {
    return { ok: false, error: "канал закрыт (только чтение)" };
  }
  if (episode.status === "closed" && type !== "system" && type !== "context") {
    return { ok: false, error: "канал закрыт — только контекст / система" };
  }

  const t = type || "ic";
  if (!MSG_TYPES.has(t)) return { ok: false, error: "unknown message type" };

  let vis = visibility || episode.visibility || "all";
  if (t === "context" && isMaster && !visibility) vis = "all";
  if (!isMaster && (vis === "gm_only" || t === "system")) {
    return { ok: false, error: "нет прав на этот тип/видимость" };
  }
  // Players always inherit channel visibility (no broadcast from private HQ)
  if (!isMaster) {
    vis = episode.visibility || "all";
  }

  const msg = {
    id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    at: new Date().toISOString(),
    type: t,
    body: String(body || "").slice(0, 4000),
    authorFactionId: authorFactionId || null,
    authorName: authorName || (isMaster ? "Мастер" : null),
    authorAvatarUrl: authorAvatarUrl || null,
    visibility: vis,
    intentId: null,
    intentDefId: intentPayload?.defId || null,
  };

  ensureEpisodeFiles(campaignId, chapterId, episodeId);
  fs.appendFileSync(
    messagesPath(campaignId, chapterId, episodeId),
    JSON.stringify(msg) + "\n",
    "utf8",
  );
  return { ok: true, message: msg, episode };
}

export function patchMessageIntentId(
  chapterId,
  episodeId,
  messageId,
  intentId,
  campaignId = DEFAULT_CAMPAIGN,
) {
  const file = messagesPath(campaignId, chapterId, episodeId);
  if (!fs.existsSync(file)) return { ok: false, error: "no messages" };
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean);
  let found = false;
  const msgs = lines
    .map((line) => {
      try {
        const m = JSON.parse(line);
        if (m.id === messageId) {
          found = true;
          return { ...m, intentId };
        }
        return m;
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  if (!found) return { ok: false, error: "message missing" };
  fs.writeFileSync(
    file,
    msgs.map((m) => JSON.stringify(m)).join("\n") + "\n",
    "utf8",
  );
  return { ok: true };
}

export {
  DEFAULT_CAMPAIGN,
  MSG_TYPES,
  CHANNELS_CHAPTER_ID,
  OOC_EPISODE_ID,
};
