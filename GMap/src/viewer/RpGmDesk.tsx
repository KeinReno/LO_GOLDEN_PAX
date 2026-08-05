import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useWorldStore } from "../state/worldStore";
import type { FactionNpc } from "../state/types";
import {
  countUnread,
  loadGmLastChannel,
  markEpisodeRead,
  saveGmLastChannel,
} from "../state/rpReadState";
import { BackgroundBeamsLite } from "../ui/BackgroundBeamsLite";
import { playRpChime } from "../ui/rpNotify";
import { StatefulButton } from "../ui/StatefulButton";

type Episode = {
  id: string;
  title: string;
  status: string;
  visibility?: string;
  kind?: string;
  ref?: string | null;
  pin?: { title?: string; body?: string } | null;
};

type Chapter = {
  id: string;
  title: string;
  kind?: string;
  episodes: Episode[];
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
  tone?: string | null;
  fromMaster?: boolean;
  prompt?: {
    kind: "choice" | "dice";
    status: "open" | "resolved";
    options?: { id: string; label: string }[];
    dice?: {
      count: number;
      sides: number;
      whoRolls?: string;
      bands?: { min: number; max: number; label: string; outcome?: string }[];
      attemptsLeft?: number;
    };
    resolved?: {
      choiceLabel?: string;
      bandLabel?: string;
      sum?: number;
      outcome?: string;
    };
    lastRoll?: { sum?: number; bandLabel?: string };
  } | null;
};

type ChannelPick = {
  chapterId: string;
  episodeId: string;
  factionId: string;
  title: string;
  readOnly: boolean;
};

type SpeakAs =
  | { kind: "master" }
  | { kind: "narrator" }
  | { kind: "anonymous" }
  | { kind: "npc"; npc: FactionNpc };

type KitTab = "choice" | "dice" | "pin" | "macros";

type FactionRow = {
  factionId: string;
  name: string;
  color: string;
  chapterId: string;
  episodeId: string;
  title: string;
  status: string;
  waiting: boolean;
  openPrompts: number;
  unread: number;
  lastAt: string | null;
  lastPreview: string | null;
  whisperCount: number;
};

const GM_VIEWER = "master";

const STAMPS = [
  { id: "beat", type: "context" as const, body: "— Пауза. Зал ждёт." },
  {
    id: "cut",
    type: "context" as const,
    body: "— Сцена обрывается. Тишина.",
  },
  {
    id: "focus",
    type: "system" as const,
    body: "Мастер: внимание на стол переговоров.",
  },
  {
    id: "time",
    type: "system" as const,
    body: "Мастер: часы тикают — решение до конца хода.",
  },
];

const VOICE_OPTS = [
  { id: "ic", label: "Речь" },
  { id: "action", label: "Действие" },
  { id: "context", label: "Контекст" },
  { id: "ooc", label: "Вне игры" },
  { id: "system", label: "Система" },
] as const;

const TONES = ["спокойно", "жёстко", "тепло", "угроза", "иронично"] as const;

const MACROS = [
  {
    id: "choice_yesno",
    label: "Да / Нет",
    kind: "choice" as const,
    body: "Решение?",
    options: [
      { id: "yes", label: "Да" },
      { id: "no", label: "Нет" },
    ],
  },
  {
    id: "choice_abc",
    label: "A / B / C",
    kind: "choice" as const,
    body: "Выберите путь:",
    options: [
      { id: "a", label: "A" },
      { id: "b", label: "B" },
      { id: "c", label: "C" },
    ],
  },
  {
    id: "dice_d6",
    label: "d6 · 1–2 / 3–4 / 5–6",
    kind: "dice" as const,
    body: "Проверка d6",
    count: 1,
    sides: 6,
    whoRolls: "player" as const,
  },
];

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function initialOf(name: string | null | undefined): string {
  return (name || "?").trim().slice(0, 1).toUpperCase();
}

function hqFactionId(ep: Episode): string | null {
  if (ep.ref?.startsWith("faction:")) return ep.ref.slice("faction:".length);
  if (ep.visibility?.startsWith("gm_player:")) {
    return ep.visibility.slice("gm_player:".length);
  }
  if (ep.id.startsWith("hq_")) return ep.id.slice(3);
  return null;
}

export type RpGmDeskProps = {
  masterToken: string;
  onMsg?: (m: string | null) => void;
  focusFactionId?: string | null;
  onUnreadChange?: (n: number) => void;
};

/**
 * Master RP desk — faction rail + scene feed + toolkit (choice / dice / pin).
 */
export function RpGmDesk({
  masterToken,
  onMsg,
  focusFactionId = null,
  onUnreadChange,
}: RpGmDeskProps) {
  const world = useWorldStore((s) => s.world);
  const factions = world?.factions ?? [];

  const headers = useMemo(
    (): Record<string, string> => ({
      "X-Master-Token": masterToken,
      "Content-Type": "application/json",
    }),
    [masterToken],
  );

  const [rows, setRows] = useState<FactionRow[]>([]);
  const [channel, setChannel] = useState<ChannelPick | null>(null);
  const [messages, setMessages] = useState<RpMessage[]>([]);
  const [pin, setPin] = useState<{ title?: string; body?: string } | null>(
    null,
  );
  const [body, setBody] = useState("");
  const [voice, setVoice] = useState<(typeof VOICE_OPTS)[number]["id"]>("ic");
  const [speakAs, setSpeakAs] = useState<SpeakAs>({ kind: "master" });
  const [tone, setTone] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [kit, setKit] = useState<KitTab>("choice");
  const [choiceBody, setChoiceBody] = useState("Выберите:");
  const [choiceOpts, setChoiceOpts] = useState("Да\nНет\nОтложить");
  const [diceBody, setDiceBody] = useState("Проверка d6");
  const [diceWho, setDiceWho] = useState<"player" | "gm">("player");
  const [pinTitle, setPinTitle] = useState("Сцена");
  const [pinBody, setPinBody] = useState("");
  const [filter, setFilter] = useState<"all" | "scene" | "rolls" | "waiting">(
    "all",
  );
  const [inboxOnly, setInboxOnly] = useState(false);
  const [restored, setRestored] = useState(false);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const stickBottom = useRef(true);
  const channelRef = useRef<ChannelPick | null>(null);
  const unreadSig = useRef("");
  channelRef.current = channel;

  const activeFaction = useMemo(
    () => factions.find((f) => f.id === channel?.factionId) || null,
    [factions, channel?.factionId],
  );

  const npcs = useMemo(
    () =>
      (activeFaction?.npcs || []).filter(
        (n): n is FactionNpc =>
          !!n && n.status !== "dead" && n.status !== "hidden",
      ),
    [activeFaction?.npcs],
  );

  const refreshRail = useCallback(async () => {
    try {
      const res = await fetch("/api/rp", {
        headers: { "X-Master-Token": masterToken },
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { chapters?: Chapter[] };
      const chapters = data.chapters || [];
      const hqList: {
        factionId: string;
        chapterId: string;
        episodeId: string;
        title: string;
        status: string;
      }[] = [];
      for (const ch of chapters) {
        for (const ep of ch.episodes || []) {
          if (ep.kind !== "hq" && !ep.id.startsWith("hq_")) continue;
          const fid = hqFactionId(ep);
          if (!fid) continue;
          hqList.push({
            factionId: fid,
            chapterId: ch.id,
            episodeId: ep.id,
            title: ep.title || `RP · ${fid}`,
            status: ep.status || "open",
          });
        }
      }

      const next: FactionRow[] = [];
      await Promise.all(
        hqList.map(async (hq) => {
          const fac = factions.find((f) => f.id === hq.factionId);
          const q = new URLSearchParams({
            chapterId: hq.chapterId,
            episodeId: hq.episodeId,
          });
          try {
            const mr = await fetch(`/api/rp/messages?${q}`, {
              headers: { "X-Master-Token": masterToken },
            });
            if (!mr.ok) return;
            const md = (await mr.json()) as { messages?: RpMessage[] };
            const msgs = md.messages || [];
            const openPrompts = msgs.filter(
              (m) => m.type === "prompt" && m.prompt?.status === "open",
            ).length;
            const whispers = msgs.filter((m) => m.visibility === "whisper");
            const unread = countUnread(msgs, {
              episodeId: hq.episodeId,
              viewer: GM_VIEWER,
              ignoreSystem: true,
              ignoreMaster: true,
            });
            const waiting = unread > 0 || openPrompts > 0;
            const last = msgs[msgs.length - 1];
            next.push({
              factionId: hq.factionId,
              name: fac?.name || hq.factionId,
              color: fac?.color || "#888",
              chapterId: hq.chapterId,
              episodeId: hq.episodeId,
              title: hq.title,
              status: hq.status,
              waiting,
              openPrompts,
              unread,
              lastAt: last?.at || null,
              lastPreview: last?.body
                ? last.body.replace(/\s+/g, " ").slice(0, 48)
                : null,
              whisperCount: whispers.filter(
                (m) =>
                  countUnread([m], {
                    episodeId: hq.episodeId,
                    viewer: GM_VIEWER,
                  }) > 0,
              ).length,
            });
          } catch {
            /* skip */
          }
        }),
      );
      next.sort((a, b) => {
        if (a.waiting !== b.waiting) return a.waiting ? -1 : 1;
        if (a.unread !== b.unread) return b.unread - a.unread;
        return (b.lastAt || "").localeCompare(a.lastAt || "");
      });
      setRows(next);
      const totalUnread = next.reduce((s, r) => s + r.unread, 0);
      onUnreadChange?.(totalUnread);
      const otherUnread = next
        .filter((r) => r.factionId !== channelRef.current?.factionId && r.unread > 0)
        .map((r) => `${r.factionId}:${r.lastAt}`)
        .join("|");
      if (
        otherUnread &&
        otherUnread !== unreadSig.current &&
        unreadSig.current !== ""
      ) {
        playRpChime();
      }
      unreadSig.current = otherUnread;
    } catch (e) {
      onMsg?.(e instanceof Error ? e.message : String(e));
    }
  }, [factions, masterToken, onMsg, onUnreadChange]);

  const loadMessages = useCallback(async () => {
    if (!channel) {
      setMessages([]);
      setPin(null);
      return;
    }
    try {
      const q = new URLSearchParams({
        chapterId: channel.chapterId,
        episodeId: channel.episodeId,
      });
      const res = await fetch(`/api/rp/messages?${q}`, {
        headers: { "X-Master-Token": masterToken },
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as {
        messages?: RpMessage[];
        pin?: { title?: string; body?: string } | null;
      };
      const msgs = data.messages || [];
      setMessages(msgs);
      setPin(data.pin || null);
      if (data.pin?.title) setPinTitle(data.pin.title);
      if (data.pin?.body) setPinBody(data.pin.body);
      const lastAt = msgs[msgs.length - 1]?.at;
      markEpisodeRead(channel.episodeId, GM_VIEWER, lastAt);
    } catch (e) {
      onMsg?.(e instanceof Error ? e.message : String(e));
    }
  }, [channel, masterToken, onMsg]);

  useEffect(() => {
    void refreshRail();
    const id = window.setInterval(() => void refreshRail(), 8000);
    return () => window.clearInterval(id);
  }, [refreshRail]);

  useEffect(() => {
    void loadMessages();
    if (!channel) return;
    const id = window.setInterval(() => void loadMessages(), 4000);
    return () => window.clearInterval(id);
  }, [channel, loadMessages]);

  useEffect(() => {
    if (!rows.length || restored) return;
    if (focusFactionId) {
      const row = rows.find((r) => r.factionId === focusFactionId);
      if (row) {
        setChannel({
          chapterId: row.chapterId,
          episodeId: row.episodeId,
          factionId: row.factionId,
          title: row.title,
          readOnly: row.status === "closed",
        });
        setRestored(true);
        return;
      }
    }
    const saved = loadGmLastChannel();
    if (saved) {
      const row = rows.find((r) => r.factionId === saved.factionId);
      if (row) {
        setChannel({
          chapterId: row.chapterId,
          episodeId: row.episodeId,
          factionId: row.factionId,
          title: row.title,
          readOnly: row.status === "closed",
        });
      }
    }
    setRestored(true);
  }, [rows, focusFactionId, restored]);

  useEffect(() => {
    if (!focusFactionId || !rows.length) return;
    const row = rows.find((r) => r.factionId === focusFactionId);
    if (!row) return;
    if (channel?.factionId === focusFactionId) return;
    setChannel({
      chapterId: row.chapterId,
      episodeId: row.episodeId,
      factionId: row.factionId,
      title: row.title,
      readOnly: row.status === "closed",
    });
  }, [focusFactionId, rows, channel?.factionId]);

  useEffect(() => {
    if (!stickBottom.current) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const openChannel = (row: FactionRow) => {
    const next = {
      chapterId: row.chapterId,
      episodeId: row.episodeId,
      factionId: row.factionId,
      title: row.title,
      readOnly: row.status === "closed",
    };
    setChannel(next);
    saveGmLastChannel({
      factionId: row.factionId,
      chapterId: row.chapterId,
      episodeId: row.episodeId,
    });
    markEpisodeRead(row.episodeId, GM_VIEWER, row.lastAt || undefined);
    setSpeakAs({ kind: "master" });
    stickBottom.current = true;
    setRows((prev) =>
      prev.map((r) =>
        r.factionId === row.factionId
          ? { ...r, unread: 0, waiting: r.openPrompts > 0, whisperCount: 0 }
          : r,
      ),
    );
  };

  const postStamp = async (stamp: (typeof STAMPS)[number]) => {
    if (!channel || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/rp/messages", {
        method: "POST",
        headers,
        body: JSON.stringify({
          chapterId: channel.chapterId,
          episodeId: channel.episodeId,
          type: stamp.type,
          body: stamp.body,
          persona: stamp.type === "context" ? "narrator" : "master",
          authorName: stamp.type === "context" ? "Рассказчик" : "Мастер",
          authorFactionId: channel.factionId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      stickBottom.current = true;
      void loadMessages();
      void refreshRail();
    } catch (e) {
      onMsg?.(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const speakLabel =
    speakAs.kind === "narrator"
      ? "Рассказчик"
      : speakAs.kind === "anonymous"
        ? "???"
        : speakAs.kind === "npc"
          ? speakAs.npc.name
          : "Мастер";

  const post = async () => {
    if (!channel || busy || !body.trim()) return;
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        chapterId: channel.chapterId,
        episodeId: channel.episodeId,
        type: voice,
        body: body.trim(),
        persona: speakAs.kind,
        authorName: speakLabel,
        tone: tone || undefined,
        authorFactionId: channel.factionId,
      };
      if (speakAs.kind === "npc") {
        payload.authorNpcId = speakAs.npc.id;
        payload.factionId = channel.factionId;
      }
      const res = await fetch("/api/rp/messages", {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      setBody("");
      stickBottom.current = true;
      void loadMessages();
      void refreshRail();
    } catch (e) {
      onMsg?.(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const createPrompt = async (
    kind: "choice" | "dice",
    opts?: {
      body?: string;
      options?: { id: string; label: string }[];
      count?: number;
      sides?: number;
      whoRolls?: "player" | "gm";
    },
  ) => {
    if (!channel || busy) return;
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        chapterId: channel.chapterId,
        episodeId: channel.episodeId,
        kind,
        body: opts?.body,
      };
      if (kind === "choice") {
        payload.options =
          opts?.options ||
          choiceOpts
            .split(/\n/)
            .map((l) => l.trim())
            .filter(Boolean)
            .map((label, i) => ({ id: `opt_${i + 1}`, label }));
        payload.body = opts?.body || choiceBody;
      } else {
        payload.body = opts?.body || diceBody;
        payload.count = opts?.count ?? 1;
        payload.sides = opts?.sides ?? 6;
        payload.whoRolls = opts?.whoRolls || diceWho;
      }
      const res = await fetch("/api/rp/prompt", {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      stickBottom.current = true;
      void loadMessages();
      void refreshRail();
    } catch (e) {
      onMsg?.(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const resolveDiceAsGm = async (messageId: string) => {
    if (!channel || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/rp/prompt/resolve", {
        method: "POST",
        headers,
        body: JSON.stringify({
          chapterId: channel.chapterId,
          episodeId: channel.episodeId,
          messageId,
          action: "dice",
          authorName: "Мастер",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      void loadMessages();
      void refreshRail();
    } catch (e) {
      onMsg?.(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const savePin = async (clear = false) => {
    if (!channel || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/rp/pin", {
        method: "POST",
        headers,
        body: JSON.stringify({
          chapterId: channel.chapterId,
          episodeId: channel.episodeId,
          title: pinTitle,
          body: pinBody,
          clear,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      setPin(clear ? null : data.pin);
      void loadMessages();
    } catch (e) {
      onMsg?.(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const rollFree = async (count: number, sides: number) => {
    if (!channel || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/rp/dice", {
        method: "POST",
        headers,
        body: JSON.stringify({
          chapterId: channel.chapterId,
          episodeId: channel.episodeId,
          count,
          sides,
          authorName: speakLabel,
          factionId: channel.factionId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      void loadMessages();
    } catch (e) {
      onMsg?.(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const visibleRows = inboxOnly ? rows.filter((r) => r.waiting) : rows;

  const visibleMessages = messages.filter((m) => {
    if (filter === "rolls") return m.type === "system" || m.prompt?.kind === "dice";
    if (filter === "waiting") {
      return m.type === "prompt" && m.prompt?.status === "open";
    }
    if (filter === "scene") {
      return m.type !== "ooc" && m.visibility !== "whisper";
    }
    return true;
  });

  const waitingCount = rows.filter((r) => r.waiting).length;

  return (
    <div className="rp-gm">
      <BackgroundBeamsLite className="rp-gm__beams" />

      <aside className="rp-gm__rail" aria-label="Державы">
        <header className="rp-gm__rail-head">
          <strong>RP</strong>
          <button
            type="button"
            className={`rp-gm__inbox ${inboxOnly ? "on" : ""}`}
            onClick={() => setInboxOnly((v) => !v)}
            title="Кто ждёт ответа"
          >
            Ждут{waitingCount > 0 ? ` · ${waitingCount}` : ""}
          </button>
        </header>
        <ul className="rp-gm__factions">
          {visibleRows.map((row) => (
            <li key={row.factionId}>
              <button
                type="button"
                className={[
                  "rp-gm__fac",
                  channel?.factionId === row.factionId ? "on" : "",
                  row.waiting ? "rp-gm__fac--wait" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => openChannel(row)}
              >
                <span
                  className="rp-gm__fac-dot"
                  style={{ background: row.color }}
                />
                <span className="rp-gm__fac-body">
                  <strong>{row.name}</strong>
                  <span className="hint">
                    {row.unread > 0
                      ? `+${row.unread}`
                      : row.openPrompts > 0
                        ? `промпт ×${row.openPrompts}`
                        : row.lastAt
                          ? fmtTime(row.lastAt)
                          : "тихо"}
                    {row.whisperCount > 0 ? ` · шёпот` : ""}
                    {row.lastPreview && row.unread > 0
                      ? ` · ${row.lastPreview}`
                      : ""}
                  </span>
                </span>
                {row.unread > 0 ? (
                  <span className="rp-gm__badge rp-gm__badge--n">
                    {row.unread > 9 ? "9+" : row.unread}
                  </span>
                ) : row.waiting ? (
                  <span className="rp-gm__badge">●</span>
                ) : null}
              </button>
            </li>
          ))}
          {!visibleRows.length && (
            <li className="hint rp-gm__empty-rail">Нет каналов HQ</li>
          )}
        </ul>
      </aside>

      <section className="rp-gm__stage">
        {!channel ? (
          <div className="rp-gm__empty">
            <h2>Пульт мастера</h2>
            <p className="hint">Выберите державу слева — откроется её RP-канал.</p>
          </div>
        ) : (
          <>
            <header className="rp-gm__stage-head">
              <div>
                <strong>{activeFaction?.name || channel.title}</strong>
                <span className="hint">{channel.title}</span>
              </div>
              <div className="rp-gm__filters" role="tablist">
                {(
                  [
                    ["all", "Всё"],
                    ["scene", "Сцена"],
                    ["rolls", "Броски"],
                    ["waiting", "Промпты"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    className={filter === id ? "on" : ""}
                    onClick={() => setFilter(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </header>

            {pin?.body && (
              <div className="rp-gm__pin">
                <strong>{pin.title || "Сцена"}</strong>
                <p>{pin.body}</p>
              </div>
            )}

            <div
              className="rp-gm__stream"
              onScroll={(e) => {
                const el = e.currentTarget;
                stickBottom.current =
                  el.scrollHeight - el.scrollTop - el.clientHeight < 48;
              }}
            >
              <AnimatePresence initial={false}>
                {visibleMessages.map((m) => (
                  <motion.article
                    key={m.id}
                    className={[
                      "rp-gm-line",
                      `rp-gm-line--${m.type}`,
                      m.visibility === "whisper" ? "rp-gm-line--whisper" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    {m.type !== "system" && (
                      <header>
                        <span
                          className="rp-gm-line__av"
                          style={
                            m.authorAvatarUrl
                              ? {
                                  backgroundImage: `url("${String(m.authorAvatarUrl).replace(/"/g, "")}")`,
                                }
                              : undefined
                          }
                        >
                          {!m.authorAvatarUrl && initialOf(m.authorName)}
                        </span>
                        <strong>{m.authorName || "—"}</strong>
                        {m.tone && (
                          <span className="rp-gm-line__tone">{m.tone}</span>
                        )}
                        {m.visibility === "whisper" && (
                          <span className="rp-gm-line__tone">шёпот</span>
                        )}
                        <time>{fmtTime(m.at)}</time>
                      </header>
                    )}
                    <p>{m.body}</p>
                    {m.type === "prompt" && m.prompt && (
                      <div className="rp-prompt-card rp-prompt-card--gm">
                        <span className="rp-prompt-card__kind">
                          {m.prompt.kind === "choice" ? "Выбор" : "Кубик"}
                          {" · "}
                          {m.prompt.status === "open" ? "открыт" : "закрыт"}
                        </span>
                        {m.prompt.kind === "choice" && (
                          <ul>
                            {(m.prompt.options || []).map((o) => (
                              <li key={o.id}>{o.label}</li>
                            ))}
                          </ul>
                        )}
                        {m.prompt.kind === "dice" && (
                          <div className="rp-prompt-card__dice">
                            <span>
                              {m.prompt.dice?.count || 1}d
                              {m.prompt.dice?.sides || 6}
                              {" · "}
                              {m.prompt.dice?.whoRolls === "gm"
                                ? "бросок мастера"
                                : "бросок игрока"}
                            </span>
                            {(m.prompt.dice?.bands || []).map((b, i) => (
                              <span
                                key={i}
                                className={`rp-prompt-card__band${
                                  b.outcome === "success"
                                    ? " rp-prompt-card__band--success"
                                    : b.outcome === "fail"
                                      ? " rp-prompt-card__band--fail"
                                      : b.outcome === "reroll"
                                        ? " rp-prompt-card__band--reroll"
                                        : ""
                                }`}
                              >
                                {b.min}–{b.max}: {b.label}
                              </span>
                            ))}
                            {m.prompt.status === "open" &&
                              m.prompt.dice?.whoRolls === "gm" && (
                                <button
                                  type="button"
                                  className="btn"
                                  disabled={busy}
                                  onClick={() => void resolveDiceAsGm(m.id)}
                                >
                                  Бросить
                                </button>
                              )}
                          </div>
                        )}
                        {m.prompt.resolved && (
                          <p className="hint">
                            Итог:{" "}
                            {m.prompt.resolved.choiceLabel ||
                              m.prompt.resolved.bandLabel ||
                              m.prompt.resolved.outcome}
                            {m.prompt.resolved.sum != null
                              ? ` (${m.prompt.resolved.sum})`
                              : ""}
                          </p>
                        )}
                      </div>
                    )}
                  </motion.article>
                ))}
              </AnimatePresence>
              <div ref={bottomRef} />
            </div>

            <footer className="rp-gm__compose">
              <div className="rp-gm__speak" role="listbox" aria-label="От кого">
                <button
                  type="button"
                  className={speakAs.kind === "master" ? "on" : ""}
                  onClick={() => setSpeakAs({ kind: "master" })}
                >
                  Мастер
                </button>
                <button
                  type="button"
                  className={speakAs.kind === "narrator" ? "on" : ""}
                  onClick={() => {
                    setSpeakAs({ kind: "narrator" });
                    setVoice("context");
                  }}
                >
                  Рассказ
                </button>
                <button
                  type="button"
                  className={speakAs.kind === "anonymous" ? "on" : ""}
                  onClick={() => setSpeakAs({ kind: "anonymous" })}
                >
                  ???
                </button>
                {npcs.slice(0, 6).map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    className={
                      speakAs.kind === "npc" && speakAs.npc.id === n.id
                        ? "on"
                        : ""
                    }
                    title={n.name}
                    onClick={() => setSpeakAs({ kind: "npc", npc: n })}
                  >
                    {n.name.split(" ")[0]}
                  </button>
                ))}
              </div>
              <div className="rp-gm__voices">
                {VOICE_OPTS.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    className={voice === v.id ? "on" : ""}
                    onClick={() => setVoice(v.id)}
                  >
                    {v.label}
                  </button>
                ))}
                <select
                  className="rp-gm__tone"
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  aria-label="Тон"
                >
                  <option value="">тон…</option>
                  {TONES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div className="rp-gm__field">
                <textarea
                  rows={2}
                  value={body}
                  disabled={busy || channel.readOnly}
                  placeholder={`${speakLabel}…`}
                  onChange={(e) => setBody(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault();
                      void post();
                    }
                  }}
                />
                <StatefulButton
                  busy={busy}
                  disabled={!body.trim() || busy || channel.readOnly}
                  onClick={() => void post()}
                >
                  Отправить
                </StatefulButton>
              </div>
            </footer>
          </>
        )}
      </section>

      <aside className="rp-gm__kit" aria-label="Инструменты">
        <div className="rp-gm__kit-tabs" role="tablist">
          {(
            [
              ["choice", "Выбор"],
              ["dice", "Кубик"],
              ["pin", "Пин"],
              ["macros", "Макро"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              className={kit === id ? "on" : ""}
              onClick={() => setKit(id)}
              disabled={!channel}
            >
              {label}
            </button>
          ))}
        </div>

        {!channel ? (
          <p className="hint">Сначала канал.</p>
        ) : kit === "choice" ? (
          <div className="rp-gm__kit-body">
            <label>
              Вопрос
              <textarea
                rows={2}
                value={choiceBody}
                onChange={(e) => setChoiceBody(e.target.value)}
              />
            </label>
            <label>
              Варианты (по строке)
              <textarea
                rows={4}
                value={choiceOpts}
                onChange={(e) => setChoiceOpts(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => void createPrompt("choice")}
            >
              Выставить карточку
            </button>
          </div>
        ) : kit === "dice" ? (
          <div className="rp-gm__kit-body">
            <label>
              Текст проверки
              <textarea
                rows={2}
                value={diceBody}
                onChange={(e) => setDiceBody(e.target.value)}
              />
            </label>
            <label>
              Кто бросает
              <select
                value={diceWho}
                onChange={(e) =>
                  setDiceWho(e.target.value === "gm" ? "gm" : "player")
                }
              >
                <option value="player">Игрок</option>
                <option value="gm">Мастер</option>
              </select>
            </label>
            <p className="hint">Полосы d6: 1–2 провал · 3–4 переброс · 5–6 успех</p>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => void createPrompt("dice")}
            >
              Выставить проверку
            </button>
            <div className="rp-gm__quick-dice">
              {[6, 20].map((s) => (
                <button
                  key={s}
                  type="button"
                  className="btn ghost"
                  disabled={busy}
                  onClick={() => void rollFree(1, s)}
                >
                  d{s}
                </button>
              ))}
              <button
                type="button"
                className="btn ghost"
                disabled={busy}
                onClick={() => void rollFree(2, 6)}
              >
                2d6
              </button>
            </div>
          </div>
        ) : kit === "pin" ? (
          <div className="rp-gm__kit-body">
            <label>
              Заголовок
              <input
                value={pinTitle}
                onChange={(e) => setPinTitle(e.target.value)}
              />
            </label>
            <label>
              Контекст сцены
              <textarea
                rows={5}
                value={pinBody}
                onChange={(e) => setPinBody(e.target.value)}
                placeholder="Где мы, что на кону…"
              />
            </label>
            <div className="rp-gm__kit-row">
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => void savePin(false)}
              >
                Закрепить
              </button>
              <button
                type="button"
                className="btn ghost"
                disabled={busy || !pin}
                onClick={() => void savePin(true)}
              >
                Снять
              </button>
            </div>
          </div>
        ) : (
          <div className="rp-gm__kit-body">
            <p className="hint">Штампы сцены</p>
            <div className="rp-gm__kit-row">
              {STAMPS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="btn ghost"
                  disabled={busy}
                  onClick={() => void postStamp(s)}
                >
                  {s.id === "beat"
                    ? "Пауза"
                    : s.id === "cut"
                      ? "Обрыв"
                      : s.id === "focus"
                        ? "Фокус"
                        : "Срок"}
                </button>
              ))}
            </div>
            <p className="hint">Пресеты в ленту</p>
            {MACROS.map((m) => (
              <button
                key={m.id}
                type="button"
                className="rp-gm__macro"
                disabled={busy}
                onClick={() => {
                  if (m.kind === "choice") {
                    void createPrompt("choice", {
                      body: m.body,
                      options: m.options,
                    });
                  } else {
                    void createPrompt("dice", {
                      body: m.body,
                      count: m.count,
                      sides: m.sides,
                      whoRolls: m.whoRolls,
                    });
                  }
                }}
              >
                {m.label}
              </button>
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}
