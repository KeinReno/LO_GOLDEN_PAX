import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWorldStore } from "../state/worldStore";
import { useCampaignSessionCtx } from "./CampaignSessionContext";

type Episode = {
  id: string;
  title: string;
  status: string;
  visibility?: string;
};

type Chapter = {
  id: string;
  title: string;
  episodes: Episode[];
};

type RpIndex = {
  campaignId: string;
  title?: string;
  chapters: Chapter[];
};

type RpMessage = {
  id: string;
  at: string;
  type: string;
  body: string;
  authorName?: string | null;
  authorFactionId?: string | null;
  visibility?: string;
  intentId?: string | null;
  intentDefId?: string | null;
};

const MSG_TYPES = [
  { id: "ooc", label: "OOC" },
  { id: "ic", label: "IC" },
  { id: "action", label: "Action" },
  { id: "context", label: "Context (GM)" },
  { id: "system", label: "System" },
];

export function CampaignPanel({
  mode = "master",
  factionId,
  password,
}: {
  mode?: "master" | "player";
  factionId?: string;
  password?: string;
}) {
  const world = useWorldStore((s) => s.world);
  const { masterToken, setSyncMsg } = useCampaignSessionCtx();
  const [index, setIndex] = useState<RpIndex | null>(null);
  const [chapterId, setChapterId] = useState<string>("");
  const [episodeId, setEpisodeId] = useState<string>("");
  const [messages, setMessages] = useState<RpMessage[]>([]);
  const [msgType, setMsgType] = useState("ic");
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState("all");
  const [attachIntent, setAttachIntent] = useState(false);
  const [intentDefId, setIntentDefId] = useState("intent.scout_reveal");
  const [intentToSystemId, setIntentToSystemId] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const headers = useMemo(() => {
    if (mode === "master") {
      return { "X-Master-Token": masterToken };
    }
    return { "X-Faction-Id": factionId || "" };
  }, [mode, masterToken, factionId]);

  const loadIndex = useCallback(async () => {
    try {
      const res = await fetch("/api/rp", { headers });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as RpIndex;
      setIndex(data);
      const ch0 = data.chapters?.[0];
      const ep0 = ch0?.episodes?.[0];
      setChapterId((cur) => cur || ch0?.id || "");
      setEpisodeId((cur) => cur || ep0?.id || "");
    } catch (e) {
      setSyncMsg?.(e instanceof Error ? e.message : String(e));
    }
  }, [headers, setSyncMsg]);

  const loadMessages = useCallback(async () => {
    if (!chapterId || !episodeId) {
      setMessages([]);
      return;
    }
    try {
      const q = new URLSearchParams({ chapterId, episodeId });
      const res = await fetch(`/api/rp/messages?${q}`, { headers });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setMessages(data.messages || []);
    } catch (e) {
      setSyncMsg?.(e instanceof Error ? e.message : String(e));
    }
  }, [chapterId, episodeId, headers, setSyncMsg]);

  useEffect(() => {
    void loadIndex();
  }, [loadIndex]);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const chapter = index?.chapters.find((c) => c.id === chapterId);
  const episode = chapter?.episodes.find((e) => e.id === episodeId);
  const closed = episode?.status === "closed";

  const post = async () => {
    if (!body.trim() || !chapterId || !episodeId) return;
    try {
      const payload: Record<string, unknown> = {
        chapterId,
        episodeId,
        type: msgType,
        body: body.trim(),
        visibility,
      };
      if (mode === "player") {
        payload.factionId = factionId;
        payload.password = password;
      }
      if (msgType === "action" && attachIntent) {
        payload.intent = {
          defId: intentDefId,
          payload: {
            toSystemId: intentToSystemId || undefined,
            systemId: intentToSystemId || undefined,
          },
          note: body.trim().slice(0, 120),
        };
      }
      const res = await fetch("/api/rp/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(mode === "master" ? { "X-Master-Token": masterToken } : {}),
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      setBody("");
      if (data.intent && !data.intent.ok) {
        setSyncMsg?.(`RP ок, intent: ${data.intent.error}`);
      } else if (data.intent?.ok) {
        setSyncMsg?.(`RP action → intent ${data.intent.intent.id}`);
      }
      void loadMessages();
    } catch (e) {
      setSyncMsg?.(e instanceof Error ? e.message : String(e));
    }
  };

  const masterPost = async (
    path: string,
    bodyObj: Record<string, unknown>,
  ) => {
    const res = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Master-Token": masterToken,
      },
      body: JSON.stringify(bodyObj),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.statusText);
    return data;
  };

  return (
    <section>
      <h3>Кампания · RP</h3>
      <p className="hint">
        Текст без intent не меняет казну. Action + intent → тот же inbox.
      </p>

      <div className="btn-row" style={{ gap: 6, flexWrap: "wrap" }}>
        <button type="button" className="btn ghost" onClick={() => void loadIndex()}>
          Обновить
        </button>
        {mode === "master" && (
          <>
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                void masterPost("/api/rp/chapter", {
                  title: `Глава ${(index?.chapters.length || 0) + 1}`,
                }).then(() => loadIndex());
              }}
            >
              + Глава
            </button>
            <button
              type="button"
              className="btn ghost"
              disabled={!chapterId}
              onClick={() => {
                void masterPost("/api/rp/episode", {
                  chapterId,
                  title: `Эпизод ${(chapter?.episodes.length || 0) + 1}`,
                }).then((d) => {
                  void loadIndex().then(() => {
                    if (d.episode?.id) setEpisodeId(d.episode.id);
                  });
                });
              }}
            >
              + Эпизод
            </button>
            <button
              type="button"
              className="btn ghost"
              disabled={!chapterId || !episodeId}
              onClick={() => {
                void masterPost("/api/rp/episode/close", {
                  chapterId,
                  episodeId,
                  reopen: closed,
                }).then(() => loadIndex());
              }}
            >
              {closed ? "Открыть снова" : "Закрыть эпизод"}
            </button>
          </>
        )}
      </div>

      <label className="field">
        <span>Глава</span>
        <select
          value={chapterId}
          onChange={(e) => {
            setChapterId(e.target.value);
            const ch = index?.chapters.find((c) => c.id === e.target.value);
            setEpisodeId(ch?.episodes?.[0]?.id || "");
          }}
        >
          {(index?.chapters || []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Эпизод {closed ? "(архив)" : ""}</span>
        <select
          value={episodeId}
          onChange={(e) => setEpisodeId(e.target.value)}
        >
          {(chapter?.episodes || []).map((e) => (
            <option key={e.id} value={e.id}>
              {e.title} [{e.status}]
            </option>
          ))}
        </select>
      </label>

      <div
        className="order-list"
        style={{
          maxHeight: 280,
          overflow: "auto",
          marginTop: 8,
          border: "1px solid var(--border, #333)",
          padding: 8,
        }}
      >
        {messages.length === 0 && (
          <p className="hint">Пока нет сообщений в этом эпизоде.</p>
        )}
        {messages.map((m) => (
          <div key={m.id} className="order-card" style={{ marginBottom: 6 }}>
            <div>
              <strong>
                [{m.type}] {m.authorName || "—"}
              </strong>{" "}
              <span className="hint">{m.visibility}</span>
              <br />
              <span>{m.body}</span>
              {m.intentId && (
                <>
                  <br />
                  <span className="hint">intent: {m.intentId}</span>
                </>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {(!closed || mode === "master") && (
        <>
          <label className="field" style={{ marginTop: 8 }}>
            <span>Тип</span>
            <select
              value={msgType}
              onChange={(e) => setMsgType(e.target.value)}
            >
              {MSG_TYPES.filter((t) =>
                mode === "master"
                  ? true
                  : t.id !== "system" && (t.id !== "context" || mode === "master"),
              )
                .filter((t) => mode === "player" ? t.id !== "context" && t.id !== "system" : true)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
            </select>
          </label>
          {mode === "master" && (
            <label className="field">
              <span>Visibility</span>
              <select
                value={visibility}
                onChange={(e) => setVisibility(e.target.value)}
              >
                <option value="all">all</option>
                <option value="gm_only">gm_only</option>
                {(world.factions || []).map((f) => (
                  <option key={f.id} value={`faction:${f.id}`}>
                    faction:{f.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="field">
            <span>Сообщение</span>
            <textarea
              rows={3}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={
                closed
                  ? "эпизод закрыт — GM: только context/system"
                  : "текст…"
              }
            />
          </label>
          {msgType === "action" && (
            <div style={{ marginTop: 6 }}>
              <label className="field">
                <span>
                  <input
                    type="checkbox"
                    checked={attachIntent}
                    onChange={(e) => setAttachIntent(e.target.checked)}
                  />{" "}
                  Прикрепить intent (AP)
                </span>
              </label>
              {attachIntent && (
                <>
                  <label className="field">
                    <span>Intent</span>
                    <select
                      value={intentDefId}
                      onChange={(e) => setIntentDefId(e.target.value)}
                    >
                      <option value="intent.scout_reveal">scout_reveal</option>
                      <option value="intent.move_fleet">move_fleet</option>
                      <option value="intent.claim_system">claim_system</option>
                      <option value="intent.attack_system">attack_system</option>
                      <option value="intent.refugee_convoy">
                        refugee_convoy
                      </option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Система (to/systemId)</span>
                    <select
                      value={intentToSystemId}
                      onChange={(e) => setIntentToSystemId(e.target.value)}
                    >
                      <option value="">—</option>
                      {(world.systems || []).slice(0, 400).map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
            </div>
          )}
          <button
            type="button"
            className="btn primary"
            disabled={!body.trim()}
            onClick={() => void post()}
          >
            Отправить
          </button>
        </>
      )}
      {closed && mode === "player" && (
        <p className="hint">Эпизод закрыт — только чтение.</p>
      )}
    </section>
  );
}
