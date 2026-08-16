export function mapVersionStamp(ver: {
  turn?: number;
  tableRevision?: number;
}): string {
  return `${ver.turn ?? ""}|${ver.tableRevision ?? ""}`;
}

export function boardRefreshCue(turn: unknown, rev: unknown): string {
  return `Стол обновлён · ход ${turn} · rev ${rev}`;
}

export function engagementPollMs(cardTableOpen: boolean): number {
  return cardTableOpen ? 1600 : 8000;
}

export function countRpUnread(
  messages: { at: string }[],
  seenAt: string | null | undefined,
): number {
  if (seenAt) return messages.filter((m) => m.at > seenAt).length;
  return messages.length > 0 ? Math.min(messages.length, 9) : 0;
}

type RpIndex = {
  home?: { chapterId?: string; episodeId?: string };
  chapters?: {
    id: string;
    episodes?: { id: string; status?: string; kind?: string }[];
  }[];
};

export function pickRpHomeEpisode(
  idx: RpIndex,
): { chapterId: string; episodeId: string } | null {
  if (idx.home?.chapterId && idx.home?.episodeId) {
    return { chapterId: idx.home.chapterId, episodeId: idx.home.episodeId };
  }
  const flat =
    idx.chapters?.flatMap((c) =>
      (c.episodes || []).map((e) => ({
        chapterId: c.id,
        episodeId: e.id,
        status: e.status,
        kind: e.kind,
      })),
    ) ?? [];
  const hq = flat.find((e) => e.kind === "hq");
  const openEp =
    hq ??
    flat.find((e) => e.status !== "closed" && e.kind !== "ooc") ??
    flat[0] ??
    null;
  if (!openEp?.chapterId || !openEp?.episodeId) return null;
  return { chapterId: openEp.chapterId, episodeId: openEp.episodeId };
}
