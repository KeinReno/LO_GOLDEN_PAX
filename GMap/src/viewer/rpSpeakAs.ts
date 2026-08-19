import type { FactionNpc } from "../state/types";

export type SpeakAs =
  | { kind: "master" }
  | { kind: "narrator" }
  | { kind: "anonymous" }
  | { kind: "npc"; npc: FactionNpc }
  | { kind: "alias"; name: string };

const ALIAS_KEY = "gmap-rp-aliases";

const RESERVED: Record<string, SpeakAs> = {
  мастер: { kind: "master" },
  master: { kind: "master" },
  рассказчик: { kind: "narrator" },
  рассказ: { kind: "narrator" },
  narrator: { kind: "narrator" },
  "???": { kind: "anonymous" },
  кубик: { kind: "master" },
};

export function speakLabelOf(speak: SpeakAs): string {
  if (speak.kind === "narrator") return "Рассказчик";
  if (speak.kind === "anonymous") return "???";
  if (speak.kind === "npc") return speak.npc.name;
  if (speak.kind === "alias") return speak.name;
  return "Мастер";
}

export function speakAsFromName(
  name: string | null | undefined,
  npcs: FactionNpc[],
): SpeakAs {
  const raw = (name || "").trim();
  if (!raw) return { kind: "master" };
  const reserved = RESERVED[raw.toLowerCase()];
  if (reserved) return reserved;
  const npc = npcs.find(
    (n) => n.name === raw || n.name.toLowerCase() === raw.toLowerCase(),
  );
  if (npc) return { kind: "npc", npc };
  return { kind: "alias", name: raw };
}

export function uniqueSceneNames(
  messages: { authorName?: string | null; type?: string }[],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of messages) {
    const n = (m.authorName || "").trim();
    if (!n || m.type === "system") continue;
    const key = n.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
  return out;
}

export function loadStoredAliases(): string[] {
  try {
    const raw = localStorage.getItem(ALIAS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is string => typeof x === "string")
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 40);
  } catch {
    return [];
  }
}

export function rememberAlias(name: string): string[] {
  const n = name.trim();
  if (!n) return loadStoredAliases();
  const next = [n, ...loadStoredAliases().filter((x) => x.toLowerCase() !== n.toLowerCase())].slice(
    0,
    40,
  );
  try {
    localStorage.setItem(ALIAS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

export type ReplyTarget = {
  id: string;
  author: string;
  snippet: string;
  authorFactionId?: string | null;
};

/** Player + GM share this quote shape so replies round-trip. */
export function parseReplyBody(body: string): { quote: string | null; text: string } {
  const m = body.match(/^»\s*(.+)\n\n([\s\S]*)$/);
  if (!m) return { quote: null, text: body };
  return { quote: m[1], text: m[2] };
}

export function snippetOf(body: string, n = 72): string {
  const one = parseReplyBody(body).text.replace(/\s+/g, " ").trim();
  return one.length > n ? `${one.slice(0, n - 1)}…` : one;
}

export function buildReplyBody(reply: ReplyTarget, text: string): string {
  return `» ${reply.author} — «${reply.snippet}»\n\n${text.trim()}`;
}

export function rebuildBody(quote: string | null, text: string): string {
  const t = text.trim();
  return quote ? `» ${quote}\n\n${t}` : t;
}

export function canPromoteToCourt(name: string | null | undefined): boolean {
  const n = (name || "").trim();
  if (!n) return false;
  return !RESERVED[n.toLowerCase()];
}

/**
 * Aside vs the channel default. HQ `gm_player:{faction}` is the channel,
 * not a whisper. `whisper` / `gm_only` and a tighter-than-episode vis are asides.
 */
export function isAsideVisibility(
  msgVis?: string | null,
  episodeVis?: string | null,
): boolean {
  const v = msgVis || "all";
  if (v === "whisper" || v === "gm_only") return true;
  if (!v.startsWith("gm_player:")) return false;
  if (!episodeVis) return false;
  return v !== episodeVis;
}

export function gmWhisperPlan(opts: {
  episodeVis?: string | null;
  channelFactionId?: string | null;
  replyFactionId?: string | null;
}): { visibility: string; hasPlayerTarget: boolean } {
  const target = (opts.replyFactionId || opts.channelFactionId || "").trim();
  const ep = opts.episodeVis || "all";
  if (!target) return { visibility: "gm_only", hasPlayerTarget: false };
  if (ep === `gm_player:${target}` || (ep.startsWith("gm_player:") && !opts.replyFactionId)) {
    return { visibility: "whisper", hasPlayerTarget: true };
  }
  return { visibility: `gm_player:${target}`, hasPlayerTarget: true };
}

/** Enter sends; Shift+Enter stays a newline. Ignores IME composition. */
export function isRpSendHotkey(e: {
  key: string;
  shiftKey: boolean;
  nativeEvent?: { isComposing?: boolean };
}): boolean {
  if (e.nativeEvent?.isComposing) return false;
  return e.key === "Enter" && !e.shiftKey;
}

export function findQuotedSource<T extends { authorName?: string | null; body: string }>(
  messages: T[],
  quote: string,
): T | undefined {
  const m = quote.match(/^(.+?)\s+—\s+«(.+)»$/);
  if (!m) return undefined;
  const author = m[1];
  const snip = m[2];
  const hits = [...messages].reverse();
  return (
    hits.find(
      (x) => (x.authorName || "—") === author && snippetOf(x.body) === snip,
    ) ||
    hits.find(
      (x) =>
        (x.authorName || "—") === author &&
        snippetOf(x.body).startsWith(snip.slice(0, 32)),
    )
  );
}
