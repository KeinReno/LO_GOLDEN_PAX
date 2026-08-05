/** Local last-read markers for RP channels (GM + player). */

const PREFIX = "gmap-rp-read:";
const LAST_CHANNEL_KEY = "gmap-rp-gm-last-channel";

export function readMarkerKey(episodeId: string, viewer: string): string {
  return `${PREFIX}${viewer}:${episodeId}`;
}

export function getLastReadAt(
  episodeId: string,
  viewer: string,
): string | null {
  try {
    return localStorage.getItem(readMarkerKey(episodeId, viewer));
  } catch {
    return null;
  }
}

export function markEpisodeRead(
  episodeId: string,
  viewer: string,
  at?: string,
): void {
  try {
    localStorage.setItem(
      readMarkerKey(episodeId, viewer),
      at || new Date().toISOString(),
    );
  } catch {
    /* ignore */
  }
}

/** Count messages newer than last-read, excluding own faction lines. */
export function countUnread(
  messages: {
    id: string;
    at: string;
    authorFactionId?: string | null;
    type?: string;
    fromMaster?: boolean;
    visibility?: string;
  }[],
  opts: {
    episodeId: string;
    viewer: string;
    /** Faction id whose messages don't count as unread for this viewer. */
    ignoreFactionId?: string | null;
    /** When true, ignore master-authored system noise. */
    ignoreSystem?: boolean;
    /** When true (GM inbox), skip messages authored by master. */
    ignoreMaster?: boolean;
  },
): number {
  const last = getLastReadAt(opts.episodeId, opts.viewer);
  let n = 0;
  for (const m of messages) {
    if (last && m.at <= last) continue;
    if (opts.ignoreFactionId && m.authorFactionId === opts.ignoreFactionId) {
      continue;
    }
    if (opts.ignoreMaster && m.fromMaster && m.visibility !== "whisper") {
      continue;
    }
    if (opts.ignoreSystem && m.type === "system") continue;
    if (opts.ignoreMaster && m.type === "prompt") continue;
    n += 1;
  }
  return n;
}

export type GmLastChannel = {
  factionId: string;
  chapterId: string;
  episodeId: string;
};

export function loadGmLastChannel(): GmLastChannel | null {
  try {
    const raw = localStorage.getItem(LAST_CHANNEL_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as GmLastChannel;
    if (!v?.factionId || !v.chapterId || !v.episodeId) return null;
    return v;
  } catch {
    return null;
  }
}

export function saveGmLastChannel(ch: GmLastChannel): void {
  try {
    localStorage.setItem(LAST_CHANNEL_KEY, JSON.stringify(ch));
  } catch {
    /* ignore */
  }
}
