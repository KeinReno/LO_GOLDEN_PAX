import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { useWorldStore } from "../state/worldStore";
import type { FactionNpc } from "../state/types";
import { CampaignSessionCtx } from "./CampaignSessionContext";
import { FlipWords } from "../ui/FlipWords";
import { DiceRoller } from "../ui/DiceRoller";

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

type PersonaKind = "self" | "narrator" | "npc" | "master";

const MSG_TYPES_PLAYER = [
  { id: "ic", label: "Речь", hint: "1" },
  { id: "action", label: "Действие", hint: "2" },
  { id: "context", label: "Контекст", hint: "3" },
  { id: "ooc", label: "Вне игры", hint: "4" },
] as const;

const MSG_TYPES_MASTER = [
  { id: "ic", label: "Речь", hint: "1" },
  { id: "action", label: "Действие", hint: "2" },
  { id: "context", label: "Контекст", hint: "3" },
  { id: "ooc", label: "Вне игры", hint: "4" },
  { id: "system", label: "Система", hint: "5" },
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

const QUICK_GESTURES: { id: string; label: string; body: string }[] = [
  { id: "look", label: "Посмотреть", body: "смотрит внимательно" },
  { id: "nod", label: "Кивнуть", body: "коротко кивает" },
  { id: "smile", label: "Улыбнуться", body: "тепло улыбается" },
  {
    id: "shoulder",
    label: "Рука на плечо",
    body: "кладёт руку на плечо собеседника",
  },
  { id: "study", label: "Изучить", body: "изучает документы и карты" },
  { id: "believe", label: "Верю", body: "верит сказанному" },
];

const DICE_PRESETS = [
  { sides: 4, label: "d4" },
  { sides: 6, label: "d6" },
  { sides: 8, label: "d8" },
  { sides: 10, label: "d10" },
  { sides: 12, label: "d12" },
  { sides: 20, label: "d20" },
] as const;

const PLACEHOLDER_BY_TYPE: Record<string, string[]> = {
  ic: ["Сказать вслух…", "— Решение за тобой…", "Обратиться к залу…"],
  action: ["Опишите жест…", "Положить руку на плечо…", "Изучить документ…"],
  ooc: ["Вне игры: вопрос мастеру…", "((уточнить правила))"],
  context: ["Описать, что видят вокруг…", "Уточнить обстановку сцены…"],
  system: ["Системная ремарка…"],
};

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
      ? "Личный RP-канал державы"
      : "RP державы ↔ мастер";
  }
  if (ep.kind === "ooc") return "Служебный канал (только мастер)";
  if (ep.status === "closed") return "Архив — только чтение";
  return mode === "player" ? "Общая сцена" : "Сцена кампании";
}

export type RpChatProps = {
  mode?: "master" | "player";
  factionId?: string;
  password?: string;
  masterToken?: string;
  onMsg?: (m: string | null) => void;
  layout?: "panel" | "fill";
  systems?: { id: string; name: string }[];
  onMessagesLoaded?: (msgs: { id: string; at: string }[]) => void;
  factionColor?: string;
  factionName?: string;
  avatarUrl?: string | null;
  npcs?: FactionNpc[];
  focusFactionId?: string | null;
  initialChapterId?: string;
  initialEpisodeId?: string;
  onBackToCourt?: () => void;
  forceReadOnly?: boolean;
  sceneOnly?: boolean;
  preferScenes?: boolean;
  /** Prefer faction HQ / API home channel. */
  preferHome?: boolean;
  showGestures?: boolean;
  showDice?: boolean;
  showPersona?: boolean;
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
  factionName,
  avatarUrl,
  npcs: npcsProp,
  focusFactionId = null,
  initialChapterId,
  initialEpisodeId,
  onBackToCourt,
  forceReadOnly = false,
  sceneOnly = false,
  preferScenes = false,
  preferHome = false,
  showGestures = false,
  showDice = false,
  showPersona = false,
}: RpChatProps) {
  const session = useContext(CampaignSessionCtx);
  const masterToken = masterTokenProp ?? session?.masterToken ?? "";
  const setSyncMsg = onMsg ?? session?.setSyncMsg;

  const [index, setIndex] = useState<RpIndex | null>(null);
  const [chapterId, setChapterId] = useState(initialChapterId || "");
  const [episodeId, setEpisodeId] = useState(initialEpisodeId || "");
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
  const [persona, setPersona] = useState<PersonaKind>(
    mode === "master" ? "master" : "self",
  );
  const [personaNpcId, setPersonaNpcId] = useState("");
  const [diceOpen, setDiceOpen] = useState(false);
  const [diceCount, setDiceCount] = useState(1);
  const [diceSides, setDiceSides] = useState(20);
  const [diceAnim, setDiceAnim] = useState<{
    value: number;
    sides: number;
    rolling: boolean;
  } | null>(null);
  const [phIndex, setPhIndex] = useState(0);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const stickBottom = useRef(true);
  const homeApplied = useRef(false);

  const storeSystems = useWorldStore((s) => s.world.systems);
  const storeFactions = useWorldStore((s) => s.world.factions);
  const systems = systemsProp?.length ? systemsProp : storeSystems;
  const factions = storeFactions;

  const faction = useMemo(
    () => factions.find((f) => f.id === factionId) || null,
    [factions, factionId],
  );
  const npcs = useMemo(() => {
    if (npcsProp?.length) return npcsProp;
    return (faction?.npcs || []).filter(
      (n) => n.status !== "dead" && n.status !== "hidden",
    );
  }, [npcsProp, faction?.npcs]);

  const displayFactionName = factionName || faction?.name || "Держава";

  const headers = useMemo((): Record<string, string> => {
    if (mode === "master") return { "X-Master-Token": masterToken };
    const h: Record<string, string> = {
      "X-Faction-Id": factionId || "",
    };
    if (password) h["X-Faction-Password"] = password;
    return h;
  }, [mode, masterToken, factionId, password]);

  const flatChannels = useMemo(() => {
    const out: { chapterId: string; chapterTitle: string; episode: Episode }[] =
      [];
    for (const c of index?.chapters || []) {
      for (const e of c.episodes || []) {
        if (mode === "player" && e.kind === "ooc") continue;
        if (sceneOnly && (e.kind === "hq" || e.kind === "ooc")) continue;
        out.push({ chapterId: c.id, chapterTitle: c.title, episode: e });
      }
    }
    const rank = (e: Episode) => {
      if (preferScenes || sceneOnly) {
        if (e.status === "closed") return 3;
        if (e.kind === "hq") return 2;
        if (e.kind === "ooc") return 4;
        return 0;
      }
      if (e.kind === "hq") return 0;
      if (e.status === "closed") return 4;
      if (e.kind === "ooc") return 3;
      return 1;
    };
    out.sort((a, b) => rank(a.episode) - rank(b.episode));
    return out;
  }, [index, mode, sceneOnly, preferScenes]);

  const chapter = index?.chapters.find((c) => c.id === chapterId);
  const episode = chapter?.episodes.find((e) => e.id === episodeId);
  const closed = forceReadOnly || episode?.status === "closed";

  const activePersonaLabel = useMemo(() => {
    if (persona === "narrator") return "Повествование";
    if (persona === "master") return "Мастер";
    if (persona === "npc") {
      return npcs.find((n) => n.id === personaNpcId)?.name || "NPC";
    }
    return displayFactionName;
  }, [persona, personaNpcId, npcs, displayFactionName]);

  const activePersonaAvatar = useMemo(() => {
    if (persona === "npc") {
      return npcs.find((n) => n.id === personaNpcId)?.avatarUrl || avatarUrl;
    }
    return avatarUrl || faction?.avatarUrl || null;
  }, [persona, personaNpcId, npcs, avatarUrl, faction?.avatarUrl]);

  const loadIndex = useCallback(async () => {
    try {
      const res = await fetch("/api/rp", { headers });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as RpIndex;
      setIndex(data);

      const flat = (data.chapters || []).flatMap((c) =>
        (c.episodes || [])
          .filter((e) => {
            if (sceneOnly && (e.kind === "hq" || e.kind === "ooc")) return false;
            if (mode === "player" && e.kind === "ooc") return false;
            return true;
          })
          .map((e) => ({ chapterId: c.id, episode: e })),
      );
      const homeEp =
        data.home?.chapterId && data.home?.episodeId
          ? flat.find(
              (x) =>
                x.chapterId === data.home!.chapterId &&
                x.episode.id === data.home!.episodeId,
            )
          : null;
      const hq = flat.find((x) => x.episode.kind === "hq");
      const openScene = flat.find(
        (x) => x.episode.status !== "closed" && x.episode.kind !== "hq",
      );
      const prefer =
        (preferHome && (homeEp || hq)) ||
        ((preferScenes || sceneOnly) && openScene) ||
        homeEp ||
        hq ||
        openScene ||
        flat[0];

      setChapterId((cur) => {
        if (cur) return cur;
        if (initialChapterId) return initialChapterId;
        return prefer?.chapterId || data.chapters?.[0]?.id || "";
      });
      setEpisodeId((cur) => {
        if (cur) return cur;
        if (initialEpisodeId) {
          homeApplied.current = true;
          return initialEpisodeId;
        }
        homeApplied.current = true;
        return prefer?.episode.id || "";
      });
    } catch (e) {
      setSyncMsg?.(e instanceof Error ? e.message : String(e));
    }
  }, [
    headers,
    setSyncMsg,
    initialChapterId,
    initialEpisodeId,
    preferScenes,
    preferHome,
    sceneOnly,
    mode,
  ]);

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

  useEffect(() => {
    setPhIndex(0);
    const list = PLACEHOLDER_BY_TYPE[msgType] || PLACEHOLDER_BY_TYPE.ic;
    if (list.length <= 1) return;
    const id = window.setInterval(() => {
      setPhIndex((i) => (i + 1) % list.length);
    }, 3200);
    return () => window.clearInterval(id);
  }, [msgType]);

  useEffect(() => {
    if (persona === "npc" && !personaNpcId && npcs[0]) {
      setPersonaNpcId(npcs[0].id);
    }
  }, [persona, personaNpcId, npcs]);

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

  const post = async (opts?: { type?: string; body?: string }) => {
    const type = opts?.type ?? msgType;
    const text = (opts?.body ?? body).trim();
    if (!text || !chapterId || !episodeId || busy) return;
    if (type === "action" && attachIntent && !opts?.body) {
      const ok = window.confirm(
        "Действие отправит приказ в очередь хода и может потратить ОД. Продолжить?",
      );
      if (!ok) return;
    }
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        chapterId,
        episodeId,
        type,
        body: text,
        visibility,
        persona:
          persona === "master"
            ? "self"
            : persona === "npc"
              ? "npc"
              : persona,
      };
      if (persona === "npc" && personaNpcId) {
        payload.authorNpcId = personaNpcId;
      }
      if (mode === "player") {
        payload.factionId = factionId;
        payload.password = password;
        if (persona === "self" && avatarUrl) {
          payload.authorAvatarUrl = avatarUrl;
        }
        if (persona === "self") {
          payload.authorName = displayFactionName;
        }
      } else if (persona === "npc") {
        payload.factionId = factionId;
      }
      if (type === "action" && attachIntent && !opts?.body) {
        payload.intent = {
          defId: intentDefId,
          payload: {
            toSystemId: intentToSystemId || undefined,
            systemId: intentToSystemId || undefined,
          },
          note: text.slice(0, 120),
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
      if (!opts?.body) setBody("");
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

  const applyGesture = (g: (typeof QUICK_GESTURES)[number]) => {
    setMsgType("action");
    setAttachIntent(false);
    if (g.id === "believe") {
      void post({ type: "action", body: g.body });
      return;
    }
    setBody((cur) => {
      const t = cur.trim();
      if (!t) return g.body;
      if (t.includes(g.body)) return t;
      return `${t}; ${g.body}`;
    });
  };

  const rollDice = async () => {
    if (!chapterId || !episodeId || busy || closed) return;
    setBusy(true);
    setDiceAnim({ value: diceSides, sides: diceSides, rolling: true });
    try {
      const payload: Record<string, unknown> = {
        chapterId,
        episodeId,
        count: diceCount,
        sides: diceSides,
        authorName: activePersonaLabel,
        factionId,
      };
      if (mode === "player") payload.password = password;
      const res = await fetch("/api/rp/dice", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      const value = Number(data.rolls?.[0] ?? data.sum ?? 1);
      setDiceAnim({ value, sides: diceSides, rolling: true });
      stickBottom.current = true;
      window.setTimeout(() => {
        setDiceAnim((d) => (d ? { ...d, rolling: false } : d));
        void loadMessages();
      }, 200);
    } catch (e) {
      setDiceAnim(null);
      setSyncMsg?.(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const canCompose =
    !closed ||
    (mode === "master" && (msgType === "context" || msgType === "system"));

  const typeOptions = mode === "master" ? MSG_TYPES_MASTER : MSG_TYPES_PLAYER;
  const placeholders = PLACEHOLDER_BY_TYPE[msgType] || PLACEHOLDER_BY_TYPE.ic;
  const activePlaceholder =
    placeholders[phIndex % placeholders.length] || "Написать…";

  const factionColorOf = (fid: string | null | undefined) => {
    if (!fid) return factionColor || "var(--line-accent)";
    return (
      factions.find((f) => f.id === fid)?.color ||
      factionColor ||
      "var(--line-accent)"
    );
  };

  return (
    <div
      className={[
        "rp-chat",
        `rp-chat--${layout}`,
        `rp-chat--${mode}`,
        showGestures ? "rp-chat--gestures" : "",
        showPersona ? "rp-chat--persona" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <header className="rp-chat-head">
        {onBackToCourt ? (
          <button
            type="button"
            className="btn ghost rp-back-court"
            onClick={onBackToCourt}
          >
            ← Назад
          </button>
        ) : null}
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
          {(showDice || mode === "master") && (
            <button
              type="button"
              className={`btn ghost rp-chat-icon-btn ${diceOpen ? "on" : ""}`}
              title="Кубики"
              disabled={closed && mode === "player"}
              onClick={() => setDiceOpen((v) => !v)}
            >
              🎲
            </button>
          )}
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
                    ? "RP державы"
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

      {diceOpen && (
        <div className="rp-dice-tray" aria-label="Кубики">
          <div className="rp-dice-presets">
            {DICE_PRESETS.map((d) => (
              <button
                key={d.sides}
                type="button"
                className={`rp-dice-chip ${diceSides === d.sides ? "on" : ""}`}
                onClick={() => setDiceSides(d.sides)}
              >
                {d.label}
              </button>
            ))}
          </div>
          <div className="rp-dice-controls">
            <label>
              ×
              <input
                type="number"
                min={1}
                max={10}
                value={diceCount}
                onChange={(e) =>
                  setDiceCount(
                    Math.max(1, Math.min(10, Number(e.target.value) || 1)),
                  )
                }
              />
            </label>
            <button
              type="button"
              className="btn primary"
              disabled={busy || (closed && mode === "player")}
              onClick={() => void rollDice()}
            >
              Бросить {diceCount}d{diceSides}
            </button>
          </div>
          {diceAnim && (
            <div className="rp-dice-stage">
              <DiceRoller
                value={diceAnim.value}
                sides={diceAnim.sides}
                rolling={diceAnim.rolling}
                onSettled={() =>
                  setDiceAnim((d) => (d ? { ...d, rolling: false } : d))
                }
              />
            </div>
          )}
        </div>
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
          <p className="hint rp-chat-empty">
            Пока тихо. Напишите первым — речь, действие или контекст.
          </p>
        )}
        <AnimatePresence initial={false}>
          {messages.map((m) => {
            const color = factionColorOf(m.authorFactionId);
            return (
              <motion.article
                key={m.id}
                className={`rp-bubble rp-bubble--${m.type}`}
                data-type={m.type}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
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
                    title="Аватар"
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
              </motion.article>
            );
          })}
        </AnimatePresence>
        <div ref={bottomRef} />
      </div>

      {canCompose ? (
        <div className="rp-chat-composer">
          {(showPersona || mode === "master") && (
            <div className="rp-persona-bar" aria-label="От кого пишете">
              <div
                className="rp-persona-av"
                style={
                  activePersonaAvatar
                    ? {
                        backgroundImage: `url("${String(activePersonaAvatar).replace(/"/g, "")}")`,
                      }
                    : {
                        background:
                          factionColor || faction?.color || "var(--line-accent)",
                      }
                }
                aria-hidden
              >
                {!activePersonaAvatar && initialOf(activePersonaLabel)}
              </div>
              <div className="rp-persona-fields">
                <label className="rp-persona-label">
                  От кого
                  <select
                    value={
                      persona === "npc"
                        ? `npc:${personaNpcId}`
                        : persona
                    }
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v.startsWith("npc:")) {
                        setPersona("npc");
                        setPersonaNpcId(v.slice(4));
                      } else {
                        setPersona(v as PersonaKind);
                      }
                    }}
                    aria-label="Персонаж"
                  >
                    {mode === "master" ? (
                      <option value="master">Мастер</option>
                    ) : (
                      <option value="self">{displayFactionName}</option>
                    )}
                    <option value="narrator">Повествование (3-е лицо)</option>
                    {npcs.map((n) => (
                      <option key={n.id} value={`npc:${n.id}`}>
                        {n.name}
                        {n.title ? ` · ${n.title}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="hint rp-persona-hint">
                  {persona === "narrator"
                    ? "Пишете от третьего лица"
                    : persona === "npc"
                      ? "Голос придворного"
                      : mode === "master"
                        ? "Голос мастера"
                        : "Голос державы"}
                </span>
              </div>
            </div>
          )}

          <LayoutGroup>
            <div className="rp-type-tabs" role="tablist" aria-label="Тип сообщения">
              {typeOptions.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={msgType === t.id}
                  className={`rp-type-tab rp-type-tab--${t.id} ${msgType === t.id ? "on" : ""}`}
                  onClick={() => setMsgType(t.id)}
                  title={`Горячая клавиша ${t.hint}`}
                >
                  {msgType === t.id && (
                    <motion.span
                      layoutId="rp-type-pill"
                      className="rp-type-tab__pill"
                      transition={{
                        type: "spring",
                        stiffness: 420,
                        damping: 34,
                      }}
                    />
                  )}
                  <span className="rp-type-tab__label">
                    {t.label}
                    <kbd className="rp-type-tab__key">{t.hint}</kbd>
                  </span>
                </button>
              ))}
            </div>
          </LayoutGroup>

          {showGestures && !closed && msgType === "action" && (
            <div className="rp-gesture-row" aria-label="Быстрые жесты">
              {QUICK_GESTURES.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  className={`rp-gesture-chip ${g.id === "believe" ? "rp-gesture-chip--believe" : ""}`}
                  disabled={busy}
                  title={g.body}
                  onClick={() => applyGesture(g)}
                >
                  {g.label}
                </button>
              ))}
            </div>
          )}

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

          <div className="rp-composer-field">
            {!body.trim() && (
              <div className="rp-composer-placeholder" aria-hidden>
                <FlipWords word={activePlaceholder} />
              </div>
            )}
            <textarea
              rows={layout === "fill" ? 3 : 3}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder=""
              aria-label="Текст сообщения"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  void post();
                  return;
                }
                if (e.altKey && !e.ctrlKey && !e.metaKey) {
                  const map: Record<string, string> = {
                    "1": "ic",
                    "2": "action",
                    "3": "context",
                    "4": "ooc",
                    "5": "system",
                  };
                  const next = map[e.key];
                  if (next && typeOptions.some((t) => t.id === next)) {
                    e.preventDefault();
                    setMsgType(next);
                  }
                }
              }}
            />
          </div>

          {msgType === "action" && (
            <div className="rp-chat-intent">
              <label>
                <input
                  type="checkbox"
                  checked={attachIntent}
                  onChange={(e) => setAttachIntent(e.target.checked)}
                />{" "}
                Отправить как приказ (ОД)
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

          <div className="rp-composer-actions">
            <button
              type="button"
              className="btn primary rp-send-btn"
              disabled={!body.trim() || busy}
              onClick={() => void post()}
            >
              Отправить · {TYPE_LABEL[msgType] || msgType}
            </button>
          </div>
          <p className="hint rp-chat-hint">
            Ctrl+Enter — отправить · Alt+1…4 — тип
            {showDice ? " · 🎲 кубики в шапке" : ""}
          </p>
        </div>
      ) : (
        <p className="hint rp-chat-readonly">Канал закрыт.</p>
      )}
    </div>
  );
}
