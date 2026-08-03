import { useCallback, useEffect, useMemo, useState } from "react";

export type ChronicleEpisode = {
  id: string;
  title: string;
  status: string;
  kind?: string;
  visibility?: string;
  createdAt?: string;
  turn?: number;
};

export type ChronicleChapter = {
  id: string;
  title: string;
  kind?: string;
  episodes: ChronicleEpisode[];
};

export type ChronicleIndex = {
  campaignId: string;
  title?: string;
  chapters: ChronicleChapter[];
};

export type ChroniclePanelProps = {
  headers: Record<string, string>;
  /** Player mode hides OOC. */
  mode?: "master" | "player";
  onOpenEpisode: (chapterId: string, episodeId: string, readOnly: boolean) => void;
  onMsg?: (m: string | null) => void;
};

/** Scroll / chronicle of RP episodes grouped by chapter. */
export function ChroniclePanel({
  headers,
  mode = "player",
  onOpenEpisode,
  onMsg,
}: ChroniclePanelProps) {
  const [index, setIndex] = useState<ChronicleIndex | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/rp", { headers });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as ChronicleIndex;
      setIndex(data);
    } catch (e) {
      onMsg?.(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [headers, onMsg]);

  useEffect(() => {
    void load();
  }, [load]);

  const chapters = useMemo(() => {
    const list = index?.chapters ?? [];
    return list
      .map((c) => ({
        ...c,
        episodes: (c.episodes || []).filter((e) => {
          if (mode === "player" && e.kind === "ooc") return false;
          return true;
        }),
      }))
      .filter((c) => c.episodes.length > 0);
  }, [index, mode]);

  const epMeta = (ep: ChronicleEpisode) => {
    const bits: string[] = [];
    if (ep.kind === "hq") bits.push("штаб");
    else bits.push("сцена");
    if (typeof ep.turn === "number") bits.push(`ход ${ep.turn}`);
    else if (ep.createdAt) {
      try {
        bits.push(
          new Date(ep.createdAt).toLocaleDateString("ru-RU", {
            day: "2-digit",
            month: "2-digit",
          }),
        );
      } catch {
        /* ignore */
      }
    }
    bits.push(ep.status === "closed" ? "архив · только чтение" : "открыта");
    return bits.join(" · ");
  };

  if (loading && !index) {
    return (
      <div className="chronicle-panel chronicle-panel--loading">
        <p className="hint">Загрузка хроники…</p>
      </div>
    );
  }

  if (chapters.length === 0) {
    return (
      <div className="chronicle-panel chronicle-panel--empty">
        <p className="hint">Хроника пуста — мастер ещё не открыл сцены.</p>
      </div>
    );
  }

  return (
    <div className="chronicle-panel" aria-label="Хроника">
      <header className="chronicle-head">
        <h3>Хроника</h3>
        <p className="hint">{index?.title || "Летопись кампании"}</p>
      </header>
      <div className="chronicle-scroll">
        {chapters.map((ch) => {
          const active = ch.episodes.filter((e) => e.status !== "closed");
          const closed = ch.episodes.filter((e) => e.status === "closed");
          return (
            <section key={ch.id} className="chronicle-chapter">
              <h4 className="chronicle-chapter-title">{ch.title}</h4>
              <ul className="chronicle-ep-list">
                {active.map((ep) => (
                  <li key={ep.id}>
                    <button
                      type="button"
                      className="chronicle-ep chronicle-ep--active"
                      onClick={() => onOpenEpisode(ch.id, ep.id, false)}
                    >
                      <strong>{ep.title}</strong>
                      <span className="hint">{epMeta(ep)}</span>
                    </button>
                  </li>
                ))}
                {closed.map((ep) => (
                  <li key={ep.id}>
                    <button
                      type="button"
                      className="chronicle-ep chronicle-ep--closed"
                      onClick={() => onOpenEpisode(ch.id, ep.id, true)}
                    >
                      <strong>{ep.title}</strong>
                      <span className="hint">{epMeta(ep)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
