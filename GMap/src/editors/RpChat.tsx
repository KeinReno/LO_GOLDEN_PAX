import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useWorldStore } from "../state/worldStore";
import { CampaignSessionCtx } from "./CampaignSessionContext";

type Episode = {
  id: string;
  title: string;
  status: string;
  visibility?: string;
  kind?: string;
  ref?: string | null;
};

type Chapter = {
  id: string;
  title: string;
  kind?: string;
  episodes: Episode[];
};

type RpIndex = {
  campaignId: string;
  title?: string;
  chapters: Chapter[];
  home?: { chapterId: string; episodeId: string };
};

type RpMessage = {
  id: string;
  at: string;
  type: string;
  body: string;
  authorName?: string | null;
  authorFactionId?: string | null;
  authorAvatarUrl?: string | null;
  visibility?: string;
  intentId?: string | null;
  intentDefId?: string | null;
};

const MSG_TYPES_PLAYER = [
  { id: "ic", label: "Речь" },
  { id: "action", label: "Действие" },
  { id: "ooc", label: "Вне игры" },
] as const;

const MSG_TYPES_MASTER = [
  { id: "ic", label: "Речь" },
  { id: "action", label: "Действие" },
  { id: "ooc", label: "Вне игры" },
  { id: "context", label: "Контекст" },
  { id: "system", label: "Система" },
] as const;

const TYPE_LABEL: Record<string, string> = {
  ic: "Речь",
  action: "Действие",
  ooc: "Вне игры",
  context: "Контекст",
  system: "Система",
};

const INTENT_LABELS: { id: string; label: string }[] = [
  { id: "intent.scout_reveal", label: "Разведка" },
  { id: "intent.move_fleet", label: "Переместить флот" },
  { id: "intent.claim_system", label: "Захватить систему" },
  { id: "intent.attack_system", label: "Атаковать" },
  { id: "intent.refugee_convoy", label: "Конвой беженцев" },
];

function fmtMsgTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function initialOf(name: string | null | undefined): string {
  const s = (name || "?").trim();
  return s.slice(0, 1).toUpperCase();
}

function channelHint(ep: Episode | undefined, mode: "master" | "player"): string {
  if (!ep) return "";
  if (ep.kind === "hq") {
    return mode === "player"
      ? "Текстовый отыгрыш с мастером"
      : "Штаб фракции ↔ мастер";
  }
  if (ep.kind === "ooc") return "Служебный канал (только мастер)";
  if (ep.status === "closed") return "Архив — только чтение";
  return mode === "player" ? "Сцена с мастером" : "Сцена кампании";
}

export type RpChatProps = {
  mode?: "master" | "player";
  factionId?: string;
  password?: string;
  masterToken?: string;
  onMsg?: (m: string | null) => void;
  /** Compact for side panels; fill for sheets. */
  layout?: "panel" | "fill";
  /** Optional systems list (viewer may not use worldStore). */
  systems?: { id: string; name: string }[];
  /** Fired after messages load (for unread badges). */
  onMessagesLoaded?: (msgs: { id: string; at: string }[]) => void;
  /** Faction color for avatar placeholder. */
  factionColor?: string;
  /** Future: default avatar URL for this player. */
  avatarUrl?: string | null;
  /** Master: jump to this faction's HQ when set/changed. */
  focusFactionId?: string | null;
};

/** RP channel chat — shared by GM Campaign tab and player /view. */
export function RpChat({
  mode = "master",
  factionId,
  password,
  masterToken: masterTokenProp,
  onMsg,
  layout = "panel",
  systems: systemsProp,
  onMessagesLoaded,
  factionColor,
  avatarUrl,
  focusFactionId = null,
}: RpChatProps) {
  const session = useContext(CampaignSessionCtx);
  const masterToken = masterTokenProp ?? session?.masterToken ?? "";
  const setSyncMsg = onMsg ?? session?.setSyncMsg;

  const [index, setIndex] = useState<RpIndex | null>(null);
  const [chapterId, setChapterId] = useState("");
  const [episodeId, setEpisodeId] = useState("");
  const [messages, setMessages] = useState<RpMessage[]>([]);
  const [msgType, setMsgType] = useState("ic");
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState("all");
  const [attachIntent, setAttachIntent] = useState(false);
  const [intentDefId, setIntentDefId] = useState("intent.scout_reveal");
  const [intentToSystemId, setIntentToSystemId] = useState("");
  const [busy, setBusy] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [channelPickerOpen, setChannelPickerOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const stickBottom = useRef(true);
  const homeApplied = useRef(false);

  const storeSystems = useWorldStore((s) => s.world.systems);
  const storeFactions = useWorldStore((s) => s.world.factions);
  const systems = systemsProp?.length ? systemsProp : storeSystems;
  const factions = storeFactions;

  const headers = useMemo((): Record<string, string> => {
    if (mode === "master") return { "X-Master-Token": masterToken };
    return { "X-Faction-Id": factionId || "" };
  }, [mode, masterToken, factionId]);

  const flatChannels = useMemo(() => {
    const out: { chapterId: string; chapterTitle: string; episode: Episode }[] =
      [];
    for (const c of index?.chapters || []) {
      for (const e of c.episodes || []) {
        // Players: no table-wide / OOC — only HQ and GM scenes
        if (mode === "player" && e.kind === "ooc") continue;
        out.push({ chapterId: c.id, chapterTitle: c.title, episode: e });
      }
    }
    // HQ first, then open scenes, then OOC (master), then closed
    const rank = (e: Episode) => {
      if (e.kind === "hq") return 0;
      if (e.status === "closed") return 4;
      if (e.kind === "ooc") return 3;
      return 1;
    };
    out.sort((a, b) => rank(a.episode) - rank(b.episode));
    return out;
  }, [index, mode]);

  const chapter = index?.chapters.find((c) => c.id === chapterId);
  const episode = chapter?.episodes.find((e) => e.id === episodeId);
  const closed = episode?.status === "closed";

  const loadIndex = useCallback(async () => {
    try {
      const res = await fetch("/api/rp", { headers });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as RpIndex;
      setIndex(data);
      setChapterId((cur) => {
        if (cur) return cur;
        if (!homeApplied.current && data.home?.chapterId) {
          return data.home.chapterId;
        }
        return data.chapters?.[0]?.id || "";
      });
      setEpisodeId((cur) => {
        if (cur) return cur;
        if (!homeApplied.current && data.home?.episodeId) {
          homeApplied.current = true;
          return data.home.episodeId;
        }
        homeApplied.current = true;
        const ch0 = data.chapters?.[0];
        const prefer =
          ch0?.episodes?.find((e) => e.kind === "hq") ||
          ch0?.episodes?.find((e) => e.status !== "closed") ||
          ch0?.episodes?.[0];
        return prefer?.id || "";
      });
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
      const msgs = data.messages || [];
      setMessages(msgs);
      onMessagesLoaded?.(msgs);
    } catch (e) {
      setSyncMsg?.(e instanceof Error ? e.message : String(e));
    }
  }, [chapterId, episodeId, headers, setSyncMsg, onMessagesLoaded]);

  useEffect(() => {
    void loadIndex();
  }, [loadIndex]);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    if (mode !== "master" || !focusFactionId || !index) return;
    for (const c of index.chapters || []) {
      for (const e of c.episodes || []) {
        const hit =
          e.kind === "hq" &&
          (e.ref === `faction:${focusFactionId}` ||
            e.id === `hq_${focusFactionId}` ||
            e.visibility === `gm_player:${focusFactionId}`);
        if (hit) {
          setChapterId(c.id);
          setEpisodeId(e.id);
          setChannelPickerOpen(false);
          return;
        }
      }
    }
  }, [mode, focusFactionId, index]);

  useEffect(() => {
    if (!chapterId || !episodeId) return;
    const id = window.setInterval(() => void loadMessages(), 5000);
    return () => window.clearInterval(id);
  }, [chapterId, episodeId, loadMessages]);

  useEffect(() => {
    if (!stickBottom.current) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

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

  const selectChannel = (chId: string, epId: string) => {
    setChapterId(chId);
    setEpisodeId(epId);
    setChannelPickerOpen(false);
    stickBottom.current = true;
  };

  const post = async () => {
    if (!body.trim() || !chapterId || !episodeId || busy) return;
    if (msgType === "action" && attachIntent) {
      const ok = window.confirm(
        "Действие отправит приказ в очередь хода и может потратить AP. Продолжить?",
      );
      if (!ok) return;
    }
    setBusy(true);
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
        if (avatarUrl) payload.authorAvatarUrl = avatarUrl;
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
      stickBottom.current = true;
      if (data.intent && !data.intent.ok) {
        setSyncMsg?.(`Сообщение отправлено, приказ: ${data.intent.error}`);
      } else if (data.intent?.ok) {
        setSyncMsg?.("Сообщение и приказ приняты");
      }
      void loadMessages();
    } catch (e) {
      setSyncMsg?.(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const canCompose =
    !closed ||
    (mode === "master" && (msgType === "context" || msgType === "system"));

  const typeOptions = mode === "master" ? MSG_TYPES_MASTER : MSG_TYPES_PLAYER;

  const factionColorOf = (fid: string | null | undefined) => {
    if (!fid) return factionColor || "#6ec8d9";
    return factions.find((f) => f.id === fid)?.color || factionColor || "#6ec8d9";
  };

  return (
    <div className={`rp-chat rp-chat--${layout} rp-chat--${mode}`}>
      <header className="rp-chat-head">
        <button
          type="button"
          className="rp-channel-btn"
          onClick={() => setChannelPickerOpen((v) => !v)}
          aria-expanded={channelPickerOpen}
        >
          <span className="rp-channel-btn-title">
            {episode?.title || "Канал…"}
          </span>
          <span className="rp-channel-btn-meta">
            {channelHint(episode, mode)}
            {closed ? " · архив" : ""}
          </span>
        </button>
        <div className="rp-chat-head-actions">
          <button
            type="button"
            className="btn ghost rp-chat-icon-btn"
            title="Обновить"
            onClick={() => {
              void loadIndex();
              void loadMessages();
            }}
          >
            ↻
          </button>
          {mode === "master" && (
            <button
              type="button"
              className={`btn ghost rp-chat-icon-btn ${showAdmin ? "on" : ""}`}
              title="Управление"
              onClick={() => setShowAdmin((v) => !v)}
            >
              ⋮
            </button>
          )}
        </div>
      </header>

      {channelPickerOpen && (
        <div className="rp-channel-picker">
          {flatChannels.length === 0 && (
            <p className="hint">Нет доступных каналов</p>
          )}
          {flatChannels.map(({ chapterId: cid, episode: ep }) => {
            const on = cid === chapterId && ep.id === episodeId;
            return (
              <button
                key={`${cid}:${ep.id}`}
                type="button"
                className={`rp-channel-item ${on ? "on" : ""}`}
                onClick={() => selectChannel(cid, ep.id)}
              >
                <strong>{ep.title}</strong>
                <span className="hint">
                  {ep.kind === "hq"
                    ? mode === "player"
                      ? "С мастером"
                      : "Штаб"
                    : ep.kind === "ooc"
                      ? "Мастер"
                      : ep.status === "closed"
                        ? "Архив"
                        : "Сцена"}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {mode === "master" && showAdmin && (
        <div className="rp-chat-admin">
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
                title: `Сцена ${(chapter?.episodes.length || 0) + 1}`,
                kind: "scene",
              }).then((d) => {
                void loadIndex().then(() => {
                  if (d.episode?.id) setEpisodeId(d.episode.id);
                });
              });
            }}
          >
            + Сцена
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
            {closed ? "Открыть" : "Закрыть"}
          </button>
        </div>
      )}

      {closed && (
        <p className="rp-chat-banner">Канал в архиве — только чтение</p>
      )}

      <div
        className="rp-chat-list"
        ref={listRef}
        onScroll={() => {
          const el = listRef.current;
          if (!el) return;
          const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
          stickBottom.current = dist < 48;
        }}
      >
        {messages.length === 0 && (
          <p className="hint rp-chat-empty">Пока тихо. Напишите первым.</p>
        )}
        {messages.map((m) => {
          const color = factionColorOf(m.authorFactionId);
          return (
            <article
              key={m.id}
              className={`rp-bubble rp-bubble--${m.type}`}
              data-type={m.type}
            >
              <header className="rp-bubble-head">
                <span
                  className="rp-avatar"
                  style={
                    m.authorAvatarUrl
                      ? {
                          backgroundImage: `url("${String(m.authorAvatarUrl).replace(/"/g, "")}")`,
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                        }
                      : { background: color }
                  }
                  title="Аватар персонажа"
                >
                  {!m.authorAvatarUrl && initialOf(m.authorName)}
                </span>
                <div className="rp-bubble-who">
                  <strong>{m.authorName || "—"}</strong>
                  <span className={`rp-type rp-type--${m.type}`}>
                    {TYPE_LABEL[m.type] || m.type}
                  </span>
                </div>
                <time dateTime={m.at}>{fmtMsgTime(m.at)}</time>
              </header>
              <p className="rp-bubble-body">{m.body}</p>
              {(m.visibility &&
                m.visibility !== "all" &&
                !String(m.visibility).startsWith("gm_player:")) ||
              m.intentId ? (
                <footer className="rp-bubble-meta">
                  {m.visibility &&
                    m.visibility !== "all" &&
                    !String(m.visibility).startsWith("gm_player:") && (
                      <span>
                        {m.visibility === "gm_only"
                          ? "только мастеру"
                          : m.visibility}
                      </span>
                    )}
                  {m.intentId && (
                    <span className="rp-intent-chip">приказ в очереди</span>
                  )}
                </footer>
              ) : null}
            </article>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {canCompose ? (
        <div className="rp-chat-composer">
          <div className="rp-type-tabs" role="tablist" aria-label="Тип сообщения">
            {typeOptions.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={msgType === t.id}
                className={`rp-type-tab ${msgType === t.id ? "on" : ""}`}
                onClick={() => setMsgType(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          {mode === "master" && (
            <div className="rp-chat-composer-row">
              <select
                value={visibility}
                onChange={(e) => setVisibility(e.target.value)}
                aria-label="Кому видно"
              >
                <option value="all">всем в канале</option>
                <option value="gm_only">только мастеру</option>
                {(factions || []).map((f) => (
                  <option key={f.id} value={`faction:${f.id}`}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <textarea
            rows={layout === "fill" ? 2 : 3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={
              closed
                ? "Контекст или система…"
                : msgType === "ooc"
                  ? "Сообщение вне игры…"
                  : msgType === "action"
                    ? "Опишите действие…"
                    : "Написать…"
            }
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                void post();
              }
            }}
          />
          {msgType === "action" && (
            <div className="rp-chat-intent">
              <label>
                <input
                  type="checkbox"
                  checked={attachIntent}
                  onChange={(e) => setAttachIntent(e.target.checked)}
                />{" "}
                Отправить как приказ (AP)
              </label>
              {attachIntent && (
                <div className="rp-chat-composer-row">
                  <select
                    value={intentDefId}
                    onChange={(e) => setIntentDefId(e.target.value)}
                    aria-label="Тип приказа"
                  >
                    {INTENT_LABELS.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={intentToSystemId}
                    onChange={(e) => setIntentToSystemId(e.target.value)}
                    aria-label="Система"
                  >
                    <option value="">система —</option>
                    {(systems || []).slice(0, 400).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}
          <button
            type="button"
            className="btn primary block"
            disabled={!body.trim() || busy}
            onClick={() => void post()}
          >
            Отправить
          </button>
          <p className="hint rp-chat-hint">
            Ctrl+Enter — отправить. Текст без приказа не тратит AP.
          </p>
        </div>
      ) : (
        <p className="hint rp-chat-readonly">Канал закрыт.</p>
      )}
    </div>
  );
}
