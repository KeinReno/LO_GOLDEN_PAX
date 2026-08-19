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
  /** Hide faction HQ channels (Chronicle is scene RP only). */
  hideHq?: boolean;
  onOpenEpisode: (chapterId: string, episodeId: string, readOnly: boolean) => void;
  onMsg?: (m: string | null) => void;
  /** GM-only: show chapter/scene create + close/reopen controls. Requires master-token headers. */
  canManage?: boolean;
};

/** Scroll / chronicle of RP episodes grouped by chapter. */
export function ChroniclePanel({
  headers,
  mode = "player",
  hideHq = false,
  onOpenEpisode,
  onMsg,
  canManage = false,
}: ChroniclePanelProps) {
  const [index, setIndex] = useState<ChronicleIndex | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

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

  const manage = useCallback(
    async (path: string, bodyObj: Record<string, unknown>) => {
      if (busy) return;
      setBusy(true);
      try {
        const res = await fetch(path, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify(bodyObj),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || res.statusText);
        await load();
      } catch (e) {
        onMsg?.(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [busy, headers, load, onMsg],
  );

  const chapters = useMemo(() => {
    const list = index?.chapters ?? [];
    return list
      .map((c) => ({
        ...c,
        episodes: (c.episodes || []).filter((e) => {
          if (mode === "player" && e.kind === "ooc") return false;
          if (hideHq && e.kind === "hq") return false;
          return true;
        }),
      }))
      .filter((c) => c.episodes.length > 0);
  }, [index, mode, hideHq]);

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

  if (chapters.length === 0 && !canManage) {
    return (
      <div className="chronicle-panel chronicle-panel--empty">
        <p className="hint">Архив пуст — мастер ещё не открыл сцены.</p>
      </div>
    );
  }

  return (
    <div className="chronicle-panel" aria-label="Сцены кампании">
      <header className="chronicle-head">
        <div className="chronicle-head-row">
          <h3>Сцены</h3>
          {canManage && (
            <button
              type="button"
              className="btn ghost chronicle-manage-btn"
              disabled={busy}
              onClick={() =>
                void manage("/api/rp/chapter", {
                  title: `Глава ${(index?.chapters.length || 0) + 1}`,
                })
              }
            >
              + Глава
            </button>
          )}
        </div>
        <p className="hint">{index?.title || "Общие эпизоды кампании"}</p>
      </header>
      <div className="chronicle-scroll">
        {chapters.map((ch) => {
          const active = ch.episodes.filter((e) => e.status !== "closed");
          const closed = ch.episodes.filter((e) => e.status === "closed");
          return (
            <section key={ch.id} className="chronicle-chapter">
              <div className="chronicle-chapter-head">
                <h4 className="chronicle-chapter-title">{ch.title}</h4>
                {canManage && (
                  <button
                    type="button"
                    className="btn ghost chronicle-manage-btn"
                    disabled={busy}
                    onClick={() =>
                      void manage("/api/rp/episode", {
                        chapterId: ch.id,
                        title: `Сцена ${ch.episodes.length + 1}`,
                        kind: "scene",
                      })
                    }
                  >
                    + Сцена
                  </button>
                )}
              </div>
              <ul className="chronicle-ep-list">
                {active.map((ep) => (
                  <li key={ep.id} className="chronicle-ep-row">
                    <button
                      type="button"
                      className="chronicle-ep chronicle-ep--active"
                      onClick={() => onOpenEpisode(ch.id, ep.id, false)}
                    >
                      <strong>{ep.title}</strong>
                      <span className="hint">{epMeta(ep)}</span>
                    </button>
                    {canManage && (
                      <button
                        type="button"
                        className="btn ghost chronicle-ep-toggle"
                        title="Закрыть сцену"
                        disabled={busy}
                        onClick={(e) => {
                          e.stopPropagation();
                          void manage("/api/rp/episode/close", {
                            chapterId: ch.id,
                            episodeId: ep.id,
                            reopen: false,
                          });
                        }}
                      >
                        Закрыть
                      </button>
                    )}
                  </li>
                ))}
                {closed.map((ep) => (
                  <li key={ep.id} className="chronicle-ep-row">
                    <button
                      type="button"
                      className="chronicle-ep chronicle-ep--closed"
                      onClick={() => onOpenEpisode(ch.id, ep.id, true)}
                    >
                      <strong>{ep.title}</strong>
                      <span className="hint">{epMeta(ep)}</span>
                    </button>
                    {canManage && (
                      <button
                        type="button"
                        className="btn ghost chronicle-ep-toggle"
                        title="Открыть сцену"
                        disabled={busy}
                        onClick={(e) => {
                          e.stopPropagation();
                          void manage("/api/rp/episode/close", {
                            chapterId: ch.id,
                            episodeId: ep.id,
                            reopen: true,
                          });
                        }}
                      >
                        Открыть
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        {canManage && chapters.length === 0 && (
          <p className="hint">Нет глав — создайте первую кнопкой «+ Глава» выше.</p>
        )}
      </div>
    </div>
  );
}
