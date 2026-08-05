/**
 * Interactive RP prompts for GM toolkit: choice cards + banded dice checks.
 */
import {
  appendMessage,
  patchMessageFields,
  readMessages,
  readRpIndex,
  writeRpIndex,
  findEpisodeExport,
} from "./rpStore.mjs";
import { rollDice, formatDiceMessage } from "./dice.mjs";

/**
 * @param {string} chapterId
 * @param {string} episodeId
 * @param {{
 *   body?: string,
 *   options: Array<{ id?: string, label: string }>,
 *   campaignId?: string,
 * }} opts
 */
export function createChoicePrompt(chapterId, episodeId, opts = {}) {
  const options = (opts.options || [])
    .map((o, i) => ({
      id: o.id || `opt_${i + 1}`,
      label: String(o.label || "").trim().slice(0, 200),
    }))
    .filter((o) => o.label);
  if (options.length < 2) {
    return { ok: false, error: "нужно минимум 2 варианта" };
  }
  const body = String(opts.body || "Выберите:").slice(0, 2000);
  return appendMessage(
    chapterId,
    episodeId,
    {
      type: "prompt",
      body,
      authorName: "Мастер",
      isMaster: true,
      prompt: {
        kind: "choice",
        status: "open",
        options,
      },
    },
    opts.campaignId,
  );
}

/**
 * Default d6 bands matching common table use:
 * 1–2 fail, 3–4 reroll, 5–6 success.
 */
export function defaultD6Bands() {
  return [
    { min: 1, max: 2, label: "Поражение", outcome: "fail" },
    { min: 3, max: 4, label: "Переброс", outcome: "reroll" },
    { min: 5, max: 6, label: "Успех", outcome: "success" },
  ];
}

/**
 * @param {string} chapterId
 * @param {string} episodeId
 * @param {{
 *   body?: string,
 *   count?: number,
 *   sides?: number,
 *   bands?: Array<{ min: number, max: number, label: string, outcome?: string }>,
 *   whoRolls?: "player" | "gm",
 *   campaignId?: string,
 * }} opts
 */
export function createDicePrompt(chapterId, episodeId, opts = {}) {
  const count = Math.max(1, Math.min(10, Math.floor(Number(opts.count) || 1)));
  const sides = Math.max(2, Math.min(100, Math.floor(Number(opts.sides) || 6)));
  let bands = Array.isArray(opts.bands) ? opts.bands : null;
  if (!bands || !bands.length) {
    bands = sides === 6 && count === 1 ? defaultD6Bands() : [
      {
        min: 1,
        max: Math.floor(sides / 2),
        label: "Провал",
        outcome: "fail",
      },
      {
        min: Math.floor(sides / 2) + 1,
        max: sides,
        label: "Успех",
        outcome: "success",
      },
    ];
  }
  bands = bands.map((b) => ({
    min: Number(b.min),
    max: Number(b.max),
    label: String(b.label || "").slice(0, 80),
    outcome: String(b.outcome || "custom").slice(0, 32),
  }));
  const body = String(
    opts.body || `Проверка ${count}d${sides}`,
  ).slice(0, 2000);
  const whoRolls = opts.whoRolls === "gm" ? "gm" : "player";
  return appendMessage(
    chapterId,
    episodeId,
    {
      type: "prompt",
      body,
      authorName: "Мастер",
      isMaster: true,
      prompt: {
        kind: "dice",
        status: "open",
        dice: {
          count,
          sides,
          bands,
          whoRolls,
          attemptsLeft: bands.some((b) => b.outcome === "reroll") ? 2 : 1,
        },
      },
    },
    opts.campaignId,
  );
}

function pickBand(bands, total) {
  for (const b of bands || []) {
    if (total >= b.min && total <= b.max) return b;
  }
  return null;
}

/**
 * Player/GM picks a choice option on an open prompt.
 */
export function resolveChoicePrompt(
  chapterId,
  episodeId,
  messageId,
  optionId,
  {
    factionId = null,
    authorName = null,
    isMaster = false,
    campaignId,
  } = {},
) {
  const msgs = readMessages(
    chapterId,
    episodeId,
    { isMaster: true, factionId },
    campaignId,
  );
  const msg = msgs.find((m) => m.id === messageId);
  if (!msg?.prompt || msg.prompt.kind !== "choice") {
    return { ok: false, error: "промпт выбора не найден" };
  }
  if (msg.prompt.status !== "open") {
    return { ok: false, error: "выбор уже закрыт" };
  }
  const opt = (msg.prompt.options || []).find((o) => o.id === optionId);
  if (!opt) return { ok: false, error: "вариант не найден" };

  const resolved = {
    at: new Date().toISOString(),
    byFactionId: factionId,
    byName: authorName || (isMaster ? "Мастер" : null),
    choiceId: opt.id,
    choiceLabel: opt.label,
  };
  const patch = patchMessageFields(
    chapterId,
    episodeId,
    messageId,
    {
      prompt: { ...msg.prompt, status: "resolved", resolved },
    },
    campaignId,
  );
  if (!patch.ok) return patch;

  const reply = appendMessage(
    chapterId,
    episodeId,
    {
      type: "action",
      body: `выбирает: ${opt.label}`,
      authorFactionId: factionId,
      authorName: authorName || "Игрок",
      isMaster: !!isMaster,
    },
    campaignId,
  );
  return {
    ok: true,
    prompt: patch.message,
    reply: reply.ok ? reply.message : null,
  };
}

/**
 * Roll against an open dice prompt (banded outcomes).
 */
export function resolveDicePrompt(
  chapterId,
  episodeId,
  messageId,
  {
    factionId = null,
    authorName = null,
    isMaster = false,
    campaignId,
  } = {},
) {
  const msgs = readMessages(
    chapterId,
    episodeId,
    { isMaster: true, factionId },
    campaignId,
  );
  const msg = msgs.find((m) => m.id === messageId);
  if (!msg?.prompt || msg.prompt.kind !== "dice") {
    return { ok: false, error: "промпт кубика не найден" };
  }
  if (msg.prompt.status !== "open") {
    return { ok: false, error: "проверка уже закрыта" };
  }
  const dice = msg.prompt.dice || {};
  if (dice.whoRolls === "gm" && !isMaster) {
    return { ok: false, error: "бросок только у мастера" };
  }
  if (dice.whoRolls === "player" && isMaster && !factionId) {
    /* GM may roll on behalf of table */
  }

  const count = Math.max(1, Math.floor(Number(dice.count) || 1));
  const sides = Math.max(2, Math.floor(Number(dice.sides) || 6));
  const rolls = rollDice({ count, sides });
  const sum = rolls.reduce((a, b) => a + b, 0);
  const band = pickBand(dice.bands, sum);
  const attemptsLeft = Math.max(0, (dice.attemptsLeft ?? 1) - 1);
  const isReroll = band?.outcome === "reroll" && attemptsLeft > 0;

  const resolved = {
    at: new Date().toISOString(),
    byFactionId: factionId,
    byName: authorName || (isMaster ? "Мастер" : null),
    rolls,
    sum,
    bandLabel: band?.label || null,
    outcome: band?.outcome || "custom",
  };

  let nextPrompt;
  if (isReroll) {
    nextPrompt = {
      ...msg.prompt,
      status: "open",
      dice: { ...dice, attemptsLeft },
      lastRoll: resolved,
    };
  } else {
    nextPrompt = {
      ...msg.prompt,
      status: "resolved",
      dice: { ...dice, attemptsLeft: 0 },
      resolved,
    };
  }

  const patch = patchMessageFields(
    chapterId,
    episodeId,
    messageId,
    { prompt: nextPrompt },
    campaignId,
  );
  if (!patch.ok) return patch;

  const line = formatDiceMessage(
    { count, sides, label: `${count}d${sides}` },
    rolls,
    band?.outcome === "success" ? true : band?.outcome === "fail" ? false : null,
    authorName || null,
  );
  const outcomeBit = band?.label ? ` → ${band.label}` : "";
  const sys = appendMessage(
    chapterId,
    episodeId,
    {
      type: "system",
      body: `${line}${outcomeBit}${isReroll ? " (можно перебросить)" : ""}`,
      authorFactionId: factionId,
      authorName: "Кубик",
      isMaster: true,
    },
    campaignId,
  );

  return {
    ok: true,
    prompt: patch.message,
    rolls,
    sum,
    band,
    reroll: isReroll,
    system: sys.ok ? sys.message : null,
  };
}

/**
 * Pin / clear scene context on an episode.
 */
export function setEpisodePin(
  chapterId,
  episodeId,
  pin,
  campaignId,
) {
  const index = readRpIndex(campaignId);
  const found = findEpisodeExport(index, chapterId, episodeId);
  if (!found?.episode) return { ok: false, error: "episode missing" };
  if (pin == null || pin === false) {
    delete found.episode.pin;
  } else {
    found.episode.pin = {
      title: String(pin.title || "Сцена").slice(0, 120),
      body: String(pin.body || "").slice(0, 2000),
      updatedAt: new Date().toISOString(),
    };
  }
  writeRpIndex(index, campaignId);
  return { ok: true, pin: found.episode.pin || null, episode: found.episode };
}
