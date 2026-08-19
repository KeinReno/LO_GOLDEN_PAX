import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
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
import { INTENT_LABELS_MAP } from "../editors/intentLabels";
import { ChroniclePanel } from "./ChroniclePanel";
import { ConfirmModal } from "./shared/ConfirmModal";
import { postCourtNpcUpsert } from "../state/courtRoster";
import { FloatingPopover } from "../ui/FloatingPopover";
import { isInputFocused } from "./hooks/isInputFocused";
import {
  buildReplyBody,
  canPromoteToCourt,
  findQuotedSource,
  gmWhisperPlan,
  isAsideVisibility,
  isRpSendHotkey,
  loadStoredAliases,
  parseReplyBody,
  rebuildBody,
  rememberAlias,
  snippetOf,
  speakAsFromName,
  speakLabelOf,
  uniqueSceneNames,
  type ReplyTarget,
  type SpeakAs,
} from "./rpSpeakAs";

type RailMark = {
  id: string;
  at: string;
  authorFactionId?: string | null;
  type?: string;
  fromMaster?: boolean;
  visibility?: string;
};

type Episode = {
  id: string;
  title: string;
  status: string;
  visibility?: string;
  kind?: string;
  ref?: string | null;
  pin?: { title?: string; body?: string } | null;
  rail?: {
    lastAt?: string | null;
    lastPreview?: string | null;
    openPrompts?: number;
    marks?: RailMark[];
  };
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
  intentId?: string | null;
  intentDefId?: string | null;
  editedAt?: string | null;
};

type ChannelPick = {
  chapterId: string;
  episodeId: string;
  /** Absent for campaign scene channels, which aren't tied to one faction. */
  factionId?: string;
  title: string;
  readOnly: boolean;
  visibility?: string;
  kind?: string;
};

type KitTab = "choice" | "dice" | "pin" | "chapters" | "macros";

function hqChannel(row: FactionRow): ChannelPick {
  return {
    chapterId: row.chapterId,
    episodeId: row.episodeId,
    factionId: row.factionId,
    title: row.title,
    readOnly: row.status === "closed",
    kind: "hq",
    visibility: `gm_player:${row.factionId}`,
  };
}

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

const INTENT_OPTIONS: { id: string; label: string }[] = Object.entries(
  INTENT_LABELS_MAP,
).map(([id, label]) => ({ id, label }));

export type RpGmDeskProps = {
  masterToken: string;
  onMsg?: (m: string | null) => void;
  focusFactionId?: string | null;
  onUnreadChange?: (n: number) => void;
  layout?: "panel" | "fill";
};

/**
 * Master RP desk — faction rail + scene feed + toolkit (choice / dice / pin).
 */
export function RpGmDesk({
  masterToken,
  onMsg,
  focusFactionId = null,
  onUnreadChange,
  layout = "panel",
}: RpGmDeskProps) {
  const world = useWorldStore((s) => s.world);
  const factions = world?.factions ?? [];
  const systems = world?.systems ?? [];
  const activeFactionId = useWorldStore((s) => s.activeFactionId);
  const updateFaction = useWorldStore((s) => s.updateFaction);

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
  const [inboxOnly, setInboxOnly] = useState(true);
  const [restored, setRestored] = useState(false);
  const [attachIntent, setAttachIntent] = useState(false);
  const [intentDefId, setIntentDefId] = useState(
    INTENT_OPTIONS[0]?.id || "intent.scout_reveal",
  );
  const [intentToSystemId, setIntentToSystemId] = useState("");
  const [confirmIntentSend, setConfirmIntentSend] = useState(false);
  const [personaOpen, setPersonaOpen] = useState(false);
  const [aliases, setAliases] = useState<string[]>(() =>
    typeof localStorage === "undefined" ? [] : loadStoredAliases(),
  );
  const [draftName, setDraftName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const [whisper, setWhisper] = useState(false);
  const [lineMenu, setLineMenu] = useState<{
    x: number;
    y: number;
    message: RpMessage;
    scope: "line" | "author";
  } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<RpMessage | null>(null);
  const [pendingPin, setPendingPin] = useState<RpMessage | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [atBottom, setAtBottom] = useState(true);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const composeRef = useRef<HTMLTextAreaElement | null>(null);
  const streamRef = useRef<HTMLDivElement | null>(null);
  const stickBottom = useRef(true);
  const channelRef = useRef<ChannelPick | null>(null);
  const unreadSig = useRef("");
  const appliedFocusRef = useRef<string | null>(null);
  channelRef.current = channel;

  const activeFaction = useMemo(
    () => factions.find((f) => f.id === channel?.factionId) || null,
    [factions, channel?.factionId],
  );

  const rosterFaction = useMemo(
    () =>
      factions.find((f) => f.id === (channel?.factionId || activeFactionId)) ||
      activeFaction,
    [factions, channel?.factionId, activeFactionId, activeFaction],
  );

  const npcs = useMemo(
    () =>
      (rosterFaction?.npcs || []).filter(
        (n): n is FactionNpc =>
          !!n && n.status !== "dead" && n.status !== "hidden",
      ),
    [rosterFaction?.npcs],
  );

  const refreshRail = useCallback(async () => {
    try {
      const res = await fetch("/api/rp", {
        headers: { "X-Master-Token": masterToken },
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { chapters?: Chapter[] };
      const chapters = data.chapters || [];
      const next: FactionRow[] = [];
      for (const ch of chapters) {
        for (const ep of ch.episodes || []) {
          if (ep.kind !== "hq" && !ep.id.startsWith("hq_")) continue;
          const fid = hqFactionId(ep);
          if (!fid) continue;
          const fac = factions.find((f) => f.id === fid);
          if (!fac) continue;
          const marks = ep.rail?.marks || [];
          const openPrompts = ep.rail?.openPrompts ?? 0;
          const unread = countUnread(marks, {
            episodeId: ep.id,
            viewer: GM_VIEWER,
            ignoreSystem: true,
            ignoreMaster: true,
          });
          next.push({
            factionId: fid,
            name: fac.name,
            color: fac.color || "#888",
            chapterId: ch.id,
            episodeId: ep.id,
            title: ep.title || `RP · ${fid}`,
            status: ep.status || "open",
            waiting: unread > 0 || openPrompts > 0,
            openPrompts,
            unread,
            lastAt: ep.rail?.lastAt || null,
            lastPreview: ep.rail?.lastPreview || null,
            whisperCount: marks.filter(
              (m) =>
                m.visibility === "whisper" &&
                countUnread([m], {
                  episodeId: ep.id,
                  viewer: GM_VIEWER,
                }) > 0,
            ).length,
          });
        }
      }
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
        visibility?: string;
        kind?: string | null;
        status?: string;
      };
      const msgs = data.messages || [];
      setMessages(msgs);
      setPin(data.pin || null);
      if (data.pin?.title) setPinTitle(data.pin.title);
      if (data.pin?.body) setPinBody(data.pin.body);
      setChannel((c) => {
        if (!c || c.episodeId !== channel.episodeId) return c;
        const vis = data.visibility || c.visibility;
        const kind = data.kind || c.kind;
        const readOnly = data.status === "closed" || c.readOnly;
        if (c.visibility === vis && c.kind === kind && c.readOnly === readOnly) {
          return c;
        }
        return { ...c, visibility: vis, kind, readOnly };
      });
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
    setReplyTo(null);
    setLineMenu(null);
    setPendingDelete(null);
    setPendingPin(null);
    setEditingId(null);
    setWhisper(false);
  }, [channel?.chapterId, channel?.episodeId]);

  useEffect(() => {
    if (!rows.length || restored) return;
    if (focusFactionId) {
      const row = rows.find((r) => r.factionId === focusFactionId);
      if (row) {
        setChannel(hqChannel(row));
        setRestored(true);
        return;
      }
    }
    const saved = loadGmLastChannel();
    if (saved) {
      const row = rows.find((r) => r.factionId === saved.factionId);
      if (row) {
        setChannel(hqChannel(row));
        setRestored(true);
        return;
      }
    }
    const waiting = rows.find((r) => r.waiting);
    if (waiting) setChannel(hqChannel(waiting));
    setRestored(true);
  }, [rows, focusFactionId, restored]);

  useEffect(() => {
    if (!focusFactionId) {
      appliedFocusRef.current = null;
      return;
    }
    if (!rows.length) return;
    if (appliedFocusRef.current === focusFactionId) return;
    const row = rows.find((r) => r.factionId === focusFactionId);
    if (!row) return;
    appliedFocusRef.current = focusFactionId;
    setChannel(hqChannel(row));
  }, [focusFactionId, rows]);

  useEffect(() => {
    if (!stickBottom.current) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const openChannel = (row: FactionRow) => {
    const next = hqChannel(row);
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

  /** Open a campaign scene episode (not tied to one faction) from the chapters tab. */
  const openSceneEpisode = (
    chapterId: string,
    episodeId: string,
    readOnly: boolean,
  ) => {
    setChannel({ chapterId, episodeId, title: "Сцена", readOnly, kind: "scene" });
    setSpeakAs({ kind: "master" });
    stickBottom.current = true;
    void (async () => {
      try {
        const res = await fetch("/api/rp", {
          headers: { "X-Master-Token": masterToken },
        });
        if (!res.ok) return;
        const data = (await res.json()) as { chapters?: Chapter[] };
        const ep = (data.chapters || [])
          .flatMap((c) => c.episodes || [])
          .find((e) => e.id === episodeId);
        setChannel({
          chapterId,
          episodeId,
          title: ep?.title || "Сцена",
          readOnly,
          kind: ep?.kind || "scene",
          visibility: ep?.visibility || "all",
        });
      } catch {
        /* ignore */
      }
    })();
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

  const speakLabel = speakLabelOf(speakAs);

  const attachingIntent = voice === "action" && attachIntent && !!channel?.factionId;

  const doPost = async () => {
    if (!channel || busy || !body.trim()) return;
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        chapterId: channel.chapterId,
        episodeId: channel.episodeId,
        type: voice,
        body: replyTo ? buildReplyBody(replyTo, body) : body.trim(),
        persona: speakAs.kind,
        authorName: speakLabel,
        tone: tone || undefined,
        authorFactionId: channel.factionId,
      };
      if (speakAs.kind === "npc") {
        payload.authorNpcId = speakAs.npc.id;
        payload.factionId = channel.factionId;
      }
      if (whisper && !attachingIntent) {
        payload.visibility = gmWhisperPlan({
          episodeVis: channel.visibility,
          channelFactionId: channel.factionId,
          replyFactionId: replyTo?.authorFactionId,
        }).visibility;
      }
      if (attachingIntent) {
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
        headers,
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      if (speakAs.kind === "alias") {
        setAliases(rememberAlias(speakAs.name));
      }
      if (data.intent && !data.intent.ok) {
        onMsg?.(`Сообщение отправлено, приказ: ${data.intent.error}`);
      } else if (data.intent?.ok) {
        onMsg?.("Сообщение и приказ приняты");
      }
      setBody("");
      setReplyTo(null);
      stickBottom.current = true;
      void loadMessages();
      void refreshRail();
    } catch (e) {
      onMsg?.(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const adoptSpeaker = (name: string | null | undefined) => {
    const next = speakAsFromName(name, npcs);
    setSpeakAs(next);
    if (next.kind === "alias") setAliases(rememberAlias(next.name));
    if (next.kind === "narrator") setVoice("context");
    setPersonaOpen(false);
  };

  const startEdit = (m: RpMessage) => {
    if (m.type === "prompt") return;
    setEditingId(m.id);
    setEditDraft(parseReplyBody(m.body).text);
    setLineMenu(null);
  };

  const startReply = (m: RpMessage, asWhisper = false) => {
    if (m.type === "prompt") return;
    setReplyTo({
      id: m.id,
      author: m.authorName || "—",
      snippet: snippetOf(m.body),
      authorFactionId: m.authorFactionId,
    });
    if (asWhisper) setWhisper(true);
    if (m.type === "action") setVoice("action");
    else if (m.type === "context") setVoice("context");
    else if (m.type === "ooc") setVoice("ooc");
    else setVoice("ic");
    setLineMenu(null);
    window.setTimeout(() => composeRef.current?.focus(), 40);
  };

  const saveEdit = async () => {
    if (!channel || !editingId || busy) return;
    const text = editDraft.trim();
    if (!text) return;
    const orig = messages.find((x) => x.id === editingId);
    const quote = orig ? parseReplyBody(orig.body).quote : null;
    setBusy(true);
    try {
      const res = await fetch("/api/rp/messages/edit", {
        method: "POST",
        headers,
        body: JSON.stringify({
          chapterId: channel.chapterId,
          episodeId: channel.episodeId,
          messageId: editingId,
          body: rebuildBody(quote, text),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      setEditingId(null);
      void loadMessages();
    } catch (e) {
      onMsg?.(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const applyAuthorToMessage = async (m: RpMessage) => {
    if (!channel || busy) return;
    setBusy(true);
    setLineMenu(null);
    try {
      const res = await fetch("/api/rp/messages/edit", {
        method: "POST",
        headers,
        body: JSON.stringify({
          chapterId: channel.chapterId,
          episodeId: channel.episodeId,
          messageId: m.id,
          authorName: speakLabel,
          authorAvatarUrl:
            speakAs.kind === "npc" ? speakAs.npc.avatarUrl || null : null,
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

  const deleteMessageNow = async (m: RpMessage) => {
    if (!channel || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/rp/messages/delete", {
        method: "POST",
        headers,
        body: JSON.stringify({
          chapterId: channel.chapterId,
          episodeId: channel.episodeId,
          messageId: m.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      if (editingId === m.id) setEditingId(null);
      if (replyTo?.id === m.id) setReplyTo(null);
      setPendingDelete(null);
      void loadMessages();
      void refreshRail();
    } catch (e) {
      onMsg?.(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const pinFromMessage = async (m: RpMessage) => {
    if (!channel || busy) return;
    if (pin?.body) {
      setPendingPin(m);
      setLineMenu(null);
      return;
    }
    await pinFromMessageNow(m);
  };

  const pinFromMessageNow = async (m: RpMessage) => {
    if (!channel || busy) return;
    const text = parseReplyBody(m.body).text;
    setBusy(true);
    setLineMenu(null);
    try {
      const res = await fetch("/api/rp/pin", {
        method: "POST",
        headers,
        body: JSON.stringify({
          chapterId: channel.chapterId,
          episodeId: channel.episodeId,
          title: (m.authorName || "Сцена").slice(0, 120),
          body: text.slice(0, 2000),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      setPin(data.pin);
      if (data.pin?.title) setPinTitle(data.pin.title);
      if (data.pin?.body) setPinBody(data.pin.body);
      setPendingPin(null);
    } catch (e) {
      onMsg?.(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const copyLine = async (m: RpMessage) => {
    setLineMenu(null);
    try {
      await navigator.clipboard.writeText(parseReplyBody(m.body).text);
    } catch {
      onMsg?.("Не удалось скопировать");
    }
  };

  const openLineMenu = (
    e: MouseEvent,
    m: RpMessage,
    scope: "line" | "author",
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setLineMenu({ x: e.clientX, y: e.clientY, message: m, scope });
  };

  const createNpcFromName = async (name: string) => {
    const fac = rosterFaction;
    if (!fac) {
      onMsg?.("Выберите державу в шапке, чтобы записать персонажа во двор.");
      return;
    }
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    try {
      const npc = {
        id: `npc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        name: n,
        role: "other" as const,
        status: "active" as const,
        raceId: fac.primaryRaceId || world.races[0]?.id || "race_human",
        posting: { kind: "court" as const, sinceTurn: world.meta.turn },
      };
      const res = await postCourtNpcUpsert({
        factionId: fac.id,
        masterToken,
        npc,
      });
      const created = (npc as FactionNpc);
      if (!res.ok) {
        if (!/опубликована|not found|404/i.test(res.error)) {
          throw new Error(res.error);
        }
      }
      const fromApi = res.ok
        ? (res.data.npc as FactionNpc | undefined)
        : undefined;
      const saved = fromApi || created;
      updateFaction(fac.id, {
        npcs: [...(fac.npcs || []).filter((x) => x.id !== saved.id), saved],
      });
      setSpeakAs({ kind: "npc", npc: saved });
      setPersonaOpen(false);
      setDraftName("");
    } catch (e) {
      onMsg?.(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const post = () => {
    if (!channel || busy || !body.trim()) return;
    if (attachingIntent) {
      setConfirmIntentSend(true);
      return;
    }
    void doPost();
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

  const resolveChoiceAsGm = async (messageId: string, optionId: string) => {
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
          action: "choice",
          optionId,
          authorName: "Мастер",
          factionId: channel.factionId,
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
    if (filter === "rolls") {
      return m.prompt?.kind === "dice" || (m.type === "system" && m.authorName === "Кубик");
    }
    if (filter === "waiting") {
      return m.type === "prompt" && m.prompt?.status === "open";
    }
    if (filter === "scene") {
      return m.type !== "ooc" && !isAsideVisibility(m.visibility, channel?.visibility);
    }
    return true;
  });

  const waitingCount = rows.filter((r) => r.waiting).length;
  const sceneCast = uniqueSceneNames(messages).filter(
    (n) => !["Мастер", "Рассказчик", "???"].includes(n),
  );
  const whisperPlan = channel
    ? gmWhisperPlan({
        episodeVis: channel.visibility,
        channelFactionId: channel.factionId,
        replyFactionId: replyTo?.authorFactionId,
      })
    : null;
  const whisperTargetName = whisperPlan?.hasPlayerTarget
    ? factions.find(
        (f) => f.id === (replyTo?.authorFactionId || channel?.factionId),
      )?.name
    : null;
  const canMutate = !!channel && !channel.readOnly;
  const isHq = channel?.kind === "hq" || !!channel?.factionId;

  const jumpWaiting = (dir: 1 | -1) => {
    const waiting = rows.filter((r) => r.waiting);
    if (!waiting.length) {
      onMsg?.("Никто не ждёт ответа");
      return;
    }
    const idx = waiting.findIndex((r) => r.factionId === channel?.factionId);
    const pick =
      idx < 0
        ? dir === 1
          ? waiting[0]
          : waiting[waiting.length - 1]
        : waiting[(idx + dir + waiting.length) % waiting.length];
    if (pick) openChannel(pick);
  };

  const jumpToMessage = (id: string) => {
    const el = document.getElementById(`rp-gm-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlashId(id);
    window.setTimeout(() => setFlashId((cur) => (cur === id ? null : cur)), 900);
  };

  const jumpToQuote = (quote: string) => {
    const src = findQuotedSource(messages, quote);
    if (src) jumpToMessage(src.id);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "]" && e.key !== "[") return;
      if (isInputFocused(e.target)) return;
      if (document.querySelector(".ctx-menu, .eco-doctrine-modal")) return;
      e.preventDefault();
      jumpWaiting(e.key === "]" ? 1 : -1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className={`rp-gm rp-gm--${layout}`}>
      <BackgroundBeamsLite className="rp-gm__beams" />

      <aside className="rp-gm__rail" aria-label="Державы">
        <header className="rp-gm__rail-head">
          <strong>RP</strong>
          <button
            type="button"
            className={`rp-gm__inbox ${inboxOnly ? "on" : ""}`}
            onClick={() => setInboxOnly((v) => !v)}
            title="Кто ждёт ответа · ] следующий · [ предыдущий"
          >
            Ждут{waitingCount > 0 ? ` · ${waitingCount}` : ""}
          </button>
          <button
            type="button"
            className={`rp-gm__inbox ${kit === "chapters" ? "on" : ""}`}
            onClick={() => setKit("chapters")}
            title="Общие сцены кампании"
          >
            Сцены
          </button>
        </header>
        <ul className="rp-gm__factions">
          {channel && !channel.factionId && (
            <li>
              <button
                type="button"
                className="rp-gm__fac on rp-gm__fac--scene"
                title={channel.title}
              >
                <span className="rp-gm__fac-body">
                  <strong>{channel.title}</strong>
                  <span className="hint">сцена · открыта</span>
                </span>
              </button>
            </li>
          )}
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
                title={row.name}
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
            <li className="hint rp-gm__empty-rail">
              {inboxOnly ? "Никто не ждёт · выключи «Ждут»" : "Нет каналов HQ"}
            </li>
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
                <strong>
                  {isHq
                    ? activeFaction?.name || channel.title
                    : channel.title}
                </strong>
                <span className="hint">
                  {channel.readOnly
                    ? "архив · только чтение"
                    : isHq
                      ? "штаб · видит только эта держава"
                      : channel.visibility === "gm_only"
                        ? "сцена · только стол"
                        : channel.visibility?.startsWith("gm_player:")
                          ? "сцена · один игрок"
                          : "сцена · кому открыта"}
                </span>
              </div>
              <div className="rp-gm__filters" role="tablist">
                {waitingCount > 0 && (
                  <button
                    type="button"
                    className="rp-gm__next-wait"
                    title="] следующий ждущий"
                    onClick={() => jumpWaiting(1)}
                  >
                    След. ждут
                  </button>
                )}
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
              ref={streamRef}
              className="rp-gm__stream"
              onScroll={(e) => {
                const el = e.currentTarget;
                const bottom =
                  el.scrollHeight - el.scrollTop - el.clientHeight < 48;
                stickBottom.current = bottom;
                setAtBottom(bottom);
                setLineMenu(null);
              }}
            >
              <AnimatePresence initial={false}>
                {visibleMessages.map((m) => {
                  const parsed = parseReplyBody(m.body);
                  return (
                  <motion.article
                    key={m.id}
                    className={[
                      "rp-gm-line",
                      `rp-gm-line--${m.type}`,
                      isAsideVisibility(m.visibility, channel.visibility)
                        ? "rp-gm-line--whisper"
                        : "",
                      flashId === m.id ? "rp-gm-line--flash" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    id={`rp-gm-${m.id}`}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    onContextMenu={(e) => openLineMenu(e, m, "line")}
                  >
                    {m.type !== "system" && (
                      <header>
                        <button
                          type="button"
                          className="rp-gm-line__av"
                          title="Говорить как · ПКМ — меню"
                          style={
                            m.authorAvatarUrl
                              ? {
                                  backgroundImage: `url("${String(m.authorAvatarUrl).replace(/"/g, "")}")`,
                                }
                              : undefined
                          }
                          onClick={() => adoptSpeaker(m.authorName)}
                          onContextMenu={(e) => openLineMenu(e, m, "author")}
                        >
                          {!m.authorAvatarUrl && initialOf(m.authorName)}
                        </button>
                        <button
                          type="button"
                          className="rp-gm-line__author"
                          title="Говорить как · ПКМ — меню"
                          onClick={() => adoptSpeaker(m.authorName)}
                          onContextMenu={(e) => openLineMenu(e, m, "author")}
                        >
                          {m.authorName || "—"}
                        </button>
                        {m.tone && (
                          <span className="rp-gm-line__tone">{m.tone}</span>
                        )}
                        {isAsideVisibility(m.visibility, channel.visibility) && (
                          <span className="rp-gm-line__tone">
                            {m.visibility === "gm_only"
                              ? "стол"
                              : m.visibility === "whisper"
                                ? "шёпот"
                                : "шёпот → игрок"}
                          </span>
                        )}
                        <time>
                          {fmtTime(m.at)}
                          {m.editedAt ? " · изм." : ""}
                        </time>
                      </header>
                    )}
                    {parsed.quote && (
                      <blockquote
                        className="rp-gm-line__quote"
                        onClick={() => jumpToQuote(parsed.quote || "")}
                        title="К исходной реплике"
                      >
                        {parsed.quote}
                      </blockquote>
                    )}
                    {editingId === m.id ? (
                      <div className="rp-gm-line__editor">
                        <textarea
                          value={editDraft}
                          onChange={(e) => setEditDraft(e.target.value)}
                          rows={3}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Escape") {
                              e.preventDefault();
                              setEditingId(null);
                            }
                            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                              e.preventDefault();
                              void saveEdit();
                            }
                          }}
                        />
                        <div className="rp-gm-line__editor-acts">
                          <button
                            type="button"
                            className="btn ghost"
                            onClick={() => setEditingId(null)}
                          >
                            Отмена
                          </button>
                          <StatefulButton
                            busy={busy}
                            disabled={!editDraft.trim() || busy}
                            onClick={() => void saveEdit()}
                          >
                            Сохранить
                          </StatefulButton>
                        </div>
                      </div>
                    ) : (
                      <p>{parsed.text}</p>
                    )}
                    {m.intentId && (
                      <span className="rp-gm-line__chip">приказ в очереди</span>
                    )}
                    {m.type === "prompt" && m.prompt && (
                      <div className="rp-prompt-card rp-prompt-card--gm">
                        <span className="rp-prompt-card__kind">
                          {m.prompt.kind === "choice" ? "Выбор" : "Кубик"}
                          {" · "}
                          {m.prompt.status === "open" ? "открыт" : "закрыт"}
                        </span>
                        {m.prompt.kind === "choice" && (
                          m.prompt.status === "open" && canMutate ? (
                            <div className="rp-gm-line__editor-acts">
                              {(m.prompt.options || []).map((o) => (
                                <button
                                  key={o.id}
                                  type="button"
                                  className="btn"
                                  disabled={busy}
                                  onClick={() => void resolveChoiceAsGm(m.id, o.id)}
                                >
                                  {o.label}
                                </button>
                              ))}
                            </div>
                          ) : (
                          <ul>
                            {(m.prompt.options || []).map((o) => (
                              <li key={o.id}>{o.label}</li>
                            ))}
                          </ul>
                          )
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
                  );
                })}
              </AnimatePresence>
              <div ref={bottomRef} />
            </div>
            {!atBottom && (
              <button
                type="button"
                className="rp-gm__jump"
                onClick={() => {
                  stickBottom.current = true;
                  setAtBottom(true);
                  bottomRef.current?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                ↓ к последним
              </button>
            )}

            <footer className="rp-gm__compose">
              <div className="rp-gm__persona">
                <button
                  type="button"
                  className="rp-gm__persona-now"
                  aria-expanded={personaOpen}
                  onClick={() => setPersonaOpen((v) => !v)}
                >
                  <span>{speakLabel}</span>
                  <span className="hint">▾ персонаж</span>
                </button>
                {personaOpen && (
                  <div className="rp-gm__persona-menu" role="listbox">
                    <div className="rp-gm__persona-row">
                      {(
                        [
                          ["master", "Мастер"],
                          ["narrator", "Рассказ"],
                          ["anonymous", "???"],
                        ] as const
                      ).map(([kind, label]) => (
                        <button
                          key={kind}
                          type="button"
                          className={speakAs.kind === kind ? "on" : ""}
                          onClick={() => {
                            if (kind === "narrator") {
                              setSpeakAs({ kind: "narrator" });
                              setVoice("context");
                            } else {
                              setSpeakAs({ kind });
                            }
                            setPersonaOpen(false);
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    {npcs.length > 0 && (
                      <>
                        <p className="rp-gm__persona-label">Двор</p>
                        <div className="rp-gm__persona-row">
                          {npcs.map((n) => (
                            <button
                              key={n.id}
                              type="button"
                              className={
                                speakAs.kind === "npc" && speakAs.npc.id === n.id
                                  ? "on"
                                  : ""
                              }
                              title={n.name}
                              onClick={() => {
                                setSpeakAs({ kind: "npc", npc: n });
                                setPersonaOpen(false);
                              }}
                            >
                              {n.name}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                    {sceneCast
                      .filter((n) => !npcs.some((x) => x.name === n))
                      .length > 0 && (
                      <>
                        <p className="rp-gm__persona-label">В этой сцене</p>
                        <div className="rp-gm__persona-row">
                          {sceneCast
                            .filter((n) => !npcs.some((x) => x.name === n))
                            .map((n) => (
                              <button
                                key={n}
                                type="button"
                                className={
                                  speakAs.kind === "alias" &&
                                  speakAs.name === n
                                    ? "on"
                                    : ""
                                }
                                onClick={() => adoptSpeaker(n)}
                              >
                                {n}
                              </button>
                            ))}
                        </div>
                      </>
                    )}
                    {aliases.filter(
                      (n) =>
                        !npcs.some((x) => x.name === n) &&
                        !sceneCast.includes(n),
                    ).length > 0 && (
                      <>
                        <p className="rp-gm__persona-label">Маски</p>
                        <div className="rp-gm__persona-row">
                          {aliases
                            .filter(
                              (n) =>
                                !npcs.some((x) => x.name === n) &&
                                !sceneCast.includes(n),
                            )
                            .map((n) => (
                              <button
                                key={n}
                                type="button"
                                onClick={() => adoptSpeaker(n)}
                              >
                                {n}
                              </button>
                            ))}
                        </div>
                      </>
                    )}
                    <div className="rp-gm__persona-new">
                      <input
                        value={draftName}
                        onChange={(e) => setDraftName(e.target.value)}
                        placeholder="Новый персонаж…"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            const n = draftName.trim();
                            if (!n) return;
                            adoptSpeaker(n);
                            setDraftName("");
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="btn ghost"
                        disabled={!draftName.trim()}
                        onClick={() => {
                          const n = draftName.trim();
                          if (!n) return;
                          adoptSpeaker(n);
                          setDraftName("");
                        }}
                      >
                        Говорить
                      </button>
                      <button
                        type="button"
                        className="btn ghost"
                        disabled={!draftName.trim() || !rosterFaction || busy}
                        title="Записать во двор выбранной державы"
                        onClick={() => void createNpcFromName(draftName)}
                      >
                        В двор
                      </button>
                    </div>
                    {speakAs.kind === "alias" && rosterFaction && (
                      <button
                        type="button"
                        className="btn ghost rp-gm__persona-promote"
                        disabled={busy}
                        onClick={() => void createNpcFromName(speakAs.name)}
                      >
                        Записать «{speakAs.name}» во двор
                      </button>
                    )}
                  </div>
                )}
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
                <button
                  type="button"
                  className={`rp-stage__whisper ${whisper ? "on" : ""}`}
                  disabled={attachingIntent}
                  title={
                    attachingIntent
                      ? "Шёпот выключен: приказ должен быть виден"
                      : whisperPlan?.hasPlayerTarget
                        ? `Видит ${whisperTargetName || "игрок"}`
                        : "Только стол мастера"
                  }
                  onClick={() => setWhisper((v) => !v)}
                >
                  {whisper
                    ? whisperPlan?.hasPlayerTarget
                      ? `Шёпот → ${whisperTargetName || "игрок"}`
                      : "Записка стола"
                    : "Шёпот"}
                </button>
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
              {voice === "action" && channel.factionId && (
                <div className="rp-gm__intent">
                  <label className="rp-gm__intent-toggle">
                    <input
                      type="checkbox"
                      checked={attachIntent}
                      onChange={(e) => {
                        setAttachIntent(e.target.checked);
                        if (e.target.checked) setWhisper(false);
                      }}
                    />{" "}
                    Отправить как приказ (ОД)
                  </label>
                  {attachIntent && (
                    <div className="rp-gm__intent-row">
                      <select
                        value={intentDefId}
                        onChange={(e) => setIntentDefId(e.target.value)}
                        aria-label="Тип приказа"
                      >
                        {INTENT_OPTIONS.map((x) => (
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
                        {systems.slice(0, 400).map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}
              {replyTo && (
                <div className="rp-stage__reply">
                  <div className="rp-stage__reply-body">
                    <span className="hint">Ответ</span>
                    <strong>
                      {replyTo.author}: {replyTo.snippet}
                    </strong>
                  </div>
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => setReplyTo(null)}
                  >
                    Снять
                  </button>
                </div>
              )}
              <div className="rp-gm__field">
                <textarea
                  ref={composeRef}
                  rows={2}
                  value={body}
                  disabled={busy || channel.readOnly}
                  placeholder={`${speakLabel}…`}
                  onChange={(e) => setBody(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      if (replyTo) {
                        e.preventDefault();
                        setReplyTo(null);
                      }
                      return;
                    }
                    if (isRpSendHotkey(e)) {
                      e.preventDefault();
                      post();
                    }
                    if (
                      e.key === "ArrowUp" &&
                      !body &&
                      !editingId &&
                      !replyTo &&
                      !e.altKey
                    ) {
                      const last = [...messages]
                        .reverse()
                        .find((m) => m.type !== "prompt" && m.type !== "system");
                      if (last) {
                        e.preventDefault();
                        startEdit(last);
                      }
                    }
                  }}
                />
                <StatefulButton
                  busy={busy}
                  disabled={!body.trim() || busy || channel.readOnly}
                  onClick={() => post()}
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
              ["chapters", "Главы"],
              ["macros", "Макро"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              className={kit === id ? "on" : ""}
              onClick={() => setKit(id)}
              disabled={!channel && id !== "chapters"}
            >
              {label}
            </button>
          ))}
        </div>

        {kit === "chapters" ? (
          <div className="rp-gm__kit-body rp-gm__kit-body--chapters">
            <ChroniclePanel
              headers={headers}
              mode="master"
              hideHq
              onOpenEpisode={openSceneEpisode}
              onMsg={onMsg}
              canManage
            />
          </div>
        ) : !channel ? (
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
      {lineMenu && (
        <FloatingPopover
          open
          onClose={() => setLineMenu(null)}
          x={lineMenu.x}
          y={lineMenu.y}
          className="ctx-menu"
          role="menu"
        >
          <div onContextMenu={(e) => e.preventDefault()}>
            <div className="ctx-label">
              {lineMenu.message.authorName || "реплика"}
            </div>
            {lineMenu.scope === "author" ? (
              <>
                {canMutate && lineMenu.message.type !== "prompt" && (
                  <button
                    type="button"
                    className="ctx-item"
                    role="menuitem"
                    onClick={() => startReply(lineMenu.message)}
                  >
                    Ответить
                  </button>
                )}
                <button
                  type="button"
                  className="ctx-item"
                  role="menuitem"
                  onClick={() => {
                    adoptSpeaker(lineMenu.message.authorName);
                    setLineMenu(null);
                  }}
                >
                  Говорить как
                </button>
                {canMutate &&
                  canPromoteToCourt(lineMenu.message.authorName) &&
                  !npcs.some(
                    (n) =>
                      n.name.toLowerCase() ===
                      (lineMenu.message.authorName || "").toLowerCase(),
                  ) && (
                    <button
                      type="button"
                      className="ctx-item"
                      role="menuitem"
                      onClick={() => {
                        setLineMenu(null);
                        void createNpcFromName(lineMenu.message.authorName || "");
                      }}
                    >
                      Во двор
                    </button>
                  )}
              </>
            ) : (
              <>
                {canMutate && lineMenu.message.type !== "prompt" && (
                  <>
                    <button
                      type="button"
                      className="ctx-item"
                      role="menuitem"
                      onClick={() => startReply(lineMenu.message)}
                    >
                      Ответить
                    </button>
                    <button
                      type="button"
                      className="ctx-item"
                      role="menuitem"
                      onClick={() => startReply(lineMenu.message, true)}
                    >
                      Ответить шёпотом
                    </button>
                  </>
                )}
                {lineMenu.message.type !== "system" && (
                  <button
                    type="button"
                    className="ctx-item"
                    role="menuitem"
                    onClick={() => {
                      adoptSpeaker(lineMenu.message.authorName);
                      setLineMenu(null);
                    }}
                  >
                    Говорить как
                  </button>
                )}
                {canMutate && lineMenu.message.type !== "prompt" && (
                  <button
                    type="button"
                    className="ctx-item"
                    role="menuitem"
                    onClick={() => startEdit(lineMenu.message)}
                  >
                    Править
                  </button>
                )}
                {canMutate &&
                  lineMenu.message.type !== "prompt" &&
                  speakLabel !== (lineMenu.message.authorName || "") && (
                    <button
                      type="button"
                      className="ctx-item"
                      role="menuitem"
                      onClick={() => void applyAuthorToMessage(lineMenu.message)}
                    >
                      Автор → {speakLabel}
                    </button>
                  )}
                <button
                  type="button"
                  className="ctx-item"
                  role="menuitem"
                  onClick={() => void copyLine(lineMenu.message)}
                >
                  Копировать
                </button>
                {canMutate && lineMenu.message.type !== "prompt" && (
                  <button
                    type="button"
                    className="ctx-item"
                    role="menuitem"
                    onClick={() => void pinFromMessage(lineMenu.message)}
                  >
                    В пин сцены
                  </button>
                )}
                {canMutate && (
                  <>
                    <div className="ctx-sep" />
                    <button
                      type="button"
                      className="ctx-item danger"
                      role="menuitem"
                      onClick={() => {
                        setPendingDelete(lineMenu.message);
                        setLineMenu(null);
                      }}
                    >
                      Удалить
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </FloatingPopover>
      )}
      <ConfirmModal
        open={!!pendingDelete}
        title="Удалить реплику?"
        confirmLabel="Удалить"
        confirmClassName="btn danger"
        busy={busy}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) void deleteMessageNow(pendingDelete);
        }}
      >
        <p className="hint">
          {pendingDelete
            ? `${pendingDelete.authorName || "—"}: ${snippetOf(pendingDelete.body)}`
            : ""}
          {pendingDelete?.type === "prompt" &&
          pendingDelete.prompt?.status === "open"
            ? " Открытый промпт пропадёт у игрока."
            : ""}
        </p>
      </ConfirmModal>
      <ConfirmModal
        open={!!pendingPin}
        title="Заменить пин сцены?"
        confirmLabel="Заменить"
        busy={busy}
        onClose={() => setPendingPin(null)}
        onConfirm={() => {
          if (pendingPin) void pinFromMessageNow(pendingPin);
        }}
      >
        <p className="hint">Текущая сцена в шапке канала будет перезаписана.</p>
      </ConfirmModal>
      <ConfirmModal
        open={confirmIntentSend}
        title="Отправить как приказ?"
        confirmLabel="Отправить"
        busy={busy}
        onClose={() => setConfirmIntentSend(false)}
        onConfirm={() => {
          setConfirmIntentSend(false);
          void doPost();
        }}
      >
        <p className="hint">
          Действие отправит приказ в очередь хода и может потратить ОД.
        </p>
      </ConfirmModal>
    </div>
  );
}
