import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ChevronLeft, SlidersHorizontal } from "lucide-react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import type { FactionNpc, ViewerPayload } from "../state/types";
import { playerAuthHeaders, playerJsonBody } from "../state/playerAuth";
import { BackgroundBeamsLite } from "../ui/BackgroundBeamsLite";
import { FlipWords } from "../ui/FlipWords";
import { DiceRoller } from "../ui/DiceRoller";
import { StatefulButton } from "../ui/StatefulButton";
import { useMagnetic, useSpotlight } from "../ui/aceternityFx";
import { ChroniclePanel } from "./ChroniclePanel";
import { ConfirmModal } from "./shared/ConfirmModal";
import {
  buildReplyBody,
  isAsideVisibility,
  isRpSendHotkey,
  parseReplyBody,
  snippetOf,
  type ReplyTarget,
} from "./rpSpeakAs";

type RpPrompt = {
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
};

type RpMessage = {
  id: string;
  at: string;
  type: string;
  body: string;
  authorName?: string | null;
  authorFactionId?: string | null;
  authorAvatarUrl?: string | null;
  intentId?: string | null;
  visibility?: string;
  tone?: string | null;
  prompt?: RpPrompt | null;
};

type ScenePin = { title?: string; body?: string } | null;

type ChannelPick = {
  chapterId: string;
  episodeId: string;
  readOnly: boolean;
  title?: string;
  visibility?: string;
};

type Voice = "ic" | "action" | "context" | "ooc";
type Persona =
  | { kind: "self" }
  | { kind: "npc"; npc: FactionNpc };

type Gesture = {
  id: string;
  label: string;
  body: string;
  instant?: boolean;
};

const VOICES: { id: Voice; label: string; hint: string }[] = [
  { id: "ic", label: "Говорю", hint: "Речь от лица" },
  { id: "action", label: "Действую", hint: "Жест и поступок" },
  { id: "context", label: "Опишу", hint: "Обстановка / 3-е лицо" },
  { id: "ooc", label: "В сторону", hint: "Вне игры" },
];

const GESTURE_PACKS: { id: string; label: string; items: Gesture[] }[] = [
  {
    id: "court",
    label: "Двор",
    items: [
      { id: "look", label: "Взгляд", body: "смотрит внимательно" },
      { id: "nod", label: "Кивок", body: "коротко кивает" },
      { id: "smile", label: "Улыбка", body: "тепло улыбается" },
      { id: "bow", label: "Поклон", body: "отвешивает сдержанный поклон" },
      {
        id: "shoulder",
        label: "Плечо",
        body: "кладёт руку на плечо собеседника",
      },
      {
        id: "believe",
        label: "Верю",
        body: "верит сказанному",
        instant: true,
      },
    ],
  },
  {
    id: "steel",
    label: "Сталь",
    items: [
      { id: "step", label: "Шаг", body: "отходит на шаг, сохраняя дистанцию" },
      { id: "hand", label: "К оружию", body: "кладёт ладонь на рукоять" },
      { id: "stand", label: "Выпрямиться", body: "выпрямляется, голос тверже" },
      {
        id: "silence",
        label: "Молчание",
        body: "молчит дольше, чем положено",
        instant: true,
      },
      { id: "study", label: "Изучить", body: "изучает карты и донесения" },
    ],
  },
  {
    id: "tone",
    label: "Тон",
    items: [
      { id: "laugh", label: "Смех", body: "коротко смеётся — без злости" },
      { id: "frown", label: "Хмуро", body: "хмурится, взвешивая слова" },
      {
        id: "warm",
        label: "Тепло",
        body: "смотрит теплым золотом, без давления",
      },
      {
        id: "cut",
        label: "Обрубить",
        body: "обрывает тему жестом — хватит",
        instant: true,
      },
    ],
  },
];

const LINE_REACTS: { id: string; label: string; body: (a: string) => string }[] =
  [
    {
      id: "believe",
      label: "Верю",
      body: (a) => `в ответ на слова ${a} — верит сказанному`,
    },
    {
      id: "nod",
      label: "Кивок",
      body: (a) => `в ответ на слова ${a} — коротко кивает`,
    },
    {
      id: "look",
      label: "Взгляд",
      body: (a) => `в ответ на слова ${a} — смотрит внимательнее`,
    },
    {
      id: "doubt",
      label: "Сомнение",
      body: (a) => `в ответ на слова ${a} — на мгновение сомневается`,
    },
  ];

/** Initial rendered scrollback window — bounds animated-line cost on long scenes. */
const RENDER_CAP = 60;

const DICE = [4, 6, 8, 10, 12, 20] as const;
const DICE_MACROS = [
  { id: "d20", label: "d20", count: 1, sides: 20 },
  { id: "2d6", label: "2d6", count: 2, sides: 6 },
  { id: "d6", label: "d6", count: 1, sides: 6 },
] as const;

const TONES = [
  { id: "", label: "тон" },
  { id: "спокойно", label: "спокойно" },
  { id: "жёстко", label: "жёстко" },
  { id: "тепло", label: "тепло" },
  { id: "угроза", label: "угроза" },
  { id: "иронично", label: "иронично" },
] as const;

/** Hot gesture → intent cards (friction: confirm on send). */
const INTENT_HOT: {
  id: string;
  label: string;
  body: string;
  defId: string;
}[] = [
  {
    id: "scout",
    label: "Разведка",
    body: "посылает разведку по выбранному направлению",
    defId: "intent.scout_reveal",
  },
  {
    id: "move",
    label: "Флот",
    body: "отдаёт приказ флоту на перемещение",
    defId: "intent.move_fleet",
  },
  {
    id: "claim",
    label: "Претензия",
    body: "заявляет претензию на систему",
    defId: "intent.claim_system",
  },
];

const PLACEHOLDERS: Record<Voice, string[]> = {
  ic: ["— Решение за тобой…", "Обратиться к залу…", "Сказать тихо…"],
  action: ["Отходит на шаг…", "Изучает карты…", "Кладёт руку на плечо…"],
  context: ["В зале пахнет озоном…", "За окном — орбитальный свет…"],
  ooc: ["((вопрос мастеру))…", "Вне игры: уточнить…"],
};

function initialOf(name: string | null | undefined): string {
  return (name || "?").trim().slice(0, 1).toUpperCase();
}

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

/** Tap inserts; double-click / long-press (~400ms) sends immediately. */
function GestureChip({
  gesture,
  disabled,
  onTap,
  onSend,
}: {
  gesture: Gesture;
  disabled?: boolean;
  onTap: () => void;
  onSend: () => void;
}) {
  const timer = useRef<number | null>(null);
  const sent = useRef(false);

  const clear = () => {
    if (timer.current != null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };

  return (
    <button
      type="button"
      className={`rp-gesture ${gesture.instant ? "rp-gesture--hot" : ""}`}
      disabled={disabled}
      title={`${gesture.body} · удержание — отправить`}
      onPointerDown={() => {
        sent.current = false;
        clear();
        timer.current = window.setTimeout(() => {
          sent.current = true;
          onSend();
        }, 420);
      }}
      onPointerUp={() => {
        clear();
      }}
      onPointerLeave={() => {
        clear();
      }}
      onClick={() => {
        if (sent.current) return;
        if (gesture.instant) onSend();
        else onTap();
      }}
      onDoubleClick={(e) => {
        e.preventDefault();
        clear();
        onSend();
      }}
    >
      {gesture.label}
    </button>
  );
}

export type RpStageProps = {
  payload: ViewerPayload;
  password: string;
  onMsg?: (m: string | null) => void;
  onMessagesLoaded?: (msgs: { id: string; at: string }[]) => void;
  factionColor?: string;
  avatarUrl?: string | null;
  layout?: "panel" | "fill";
  /** Phone sheet — lighter chrome, larger tap targets. */
  compact?: boolean;
  /** Phone immersive room — back to map. */
  onBack?: () => void;
};

/**
 * Player RP stage — immersive play-by-post for one polity.
 */
export function RpStage({
  payload,
  password,
  onMsg,
  onMessagesLoaded,
  factionColor,
  avatarUrl,
  layout = "fill",
  compact = false,
  onBack,
}: RpStageProps) {
  const fac = payload.world.factions.find((f) => f.id === payload.factionId);
  const accent = factionColor || fac?.color || "var(--accent, #c9a227)";
  const crest = avatarUrl || fac?.avatarUrl || null;
  const factionName = fac?.name || "Держава";
  const spotlight = useSpotlight();
  const magSend = useMagnetic(0.22, 70);

  const npcs = useMemo(
    () =>
      (fac?.npcs || []).filter(
        (n): n is FactionNpc =>
          !!n && n.status !== "dead" && n.status !== "hidden",
      ),
    [fac?.npcs],
  );

  const headers = useMemo((): Record<string, string> => {
    const h = playerAuthHeaders({
      "X-Faction-Id": payload.factionId,
    });
    if (password) h["X-Faction-Password"] = password;
    return h;
  }, [payload.factionId, password]);

  const [channel, setChannel] = useState<ChannelPick | null>(null);
  const [bootDone, setBootDone] = useState(false);
  const [messages, setMessages] = useState<RpMessage[]>([]);
  const [voice, setVoice] = useState<Voice>("ic");
  const [persona, setPersona] = useState<Persona>({ kind: "self" });
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [sentOk, setSentOk] = useState(false);
  const [scenesOpen, setScenesOpen] = useState(false);
  const [diceOpen, setDiceOpen] = useState(false);
  const [diceSides, setDiceSides] = useState(20);
  const [diceCount, setDiceCount] = useState(1);
  const [diceAnim, setDiceAnim] = useState<{
    value: number;
    sides: number;
    rolling: boolean;
    label?: string;
  } | null>(null);
  const [lastRoll, setLastRoll] = useState<string | null>(null);
  const [phIndex, setPhIndex] = useState(0);
  const [gesturePack, setGesturePack] = useState(GESTURE_PACKS[0].id);
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  const [freshIds, setFreshIds] = useState<Set<string>>(() => new Set());
  const [newBelowCount, setNewBelowCount] = useState(0);
  const [renderLimit, setRenderLimit] = useState(RENDER_CAP);
  const olderScrollFix = useRef<{ el: HTMLDivElement; prevHeight: number } | null>(
    null,
  );
  const [pin, setPin] = useState<ScenePin>(null);
  const [whisper, setWhisper] = useState(false);
  const [tone, setTone] = useState("");
  const [feedFilter, setFeedFilter] = useState<"all" | "scene" | "rolls">(
    "all",
  );
  const [intentsOpen, setIntentsOpen] = useState(false);
  const [intentConfirm, setIntentConfirm] = useState<{
    type?: Voice;
    text?: string;
    clearReply?: boolean;
    whisper?: boolean;
    tone?: string;
    intent?: { defId: string; note?: string };
  } | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [desktopToolsCollapsed, setDesktopToolsCollapsed] = useState(false);
  const seenIds = useRef<Set<string>>(new Set());
  const firstLoad = useRef(true);

  const listRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const stickBottom = useRef(true);
  const composeRef = useRef<HTMLTextAreaElement | null>(null);

  const boot = useCallback(async () => {
    try {
      const res = await fetch("/api/rp", { headers });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as {
        home?: { chapterId?: string; episodeId?: string };
        chapters?: {
          id: string;
          episodes?: {
            id: string;
            title?: string;
            status?: string;
            kind?: string;
            visibility?: string;
          }[];
        }[];
      };
      let chapterId = data.home?.chapterId || "";
      let episodeId = data.home?.episodeId || "";
      const flat =
        data.chapters?.flatMap((c) =>
          (c.episodes || []).map((e) => ({
            chapterId: c.id,
            episodeId: e.id,
            status: e.status,
            kind: e.kind,
            title: e.title,
            visibility: e.visibility,
          })),
        ) ?? [];
      if (!chapterId || !episodeId) {
        const hq = flat.find((e) => e.kind === "hq");
        const open =
          hq ??
          flat.find((e) => e.status !== "closed" && e.kind !== "ooc") ??
          flat[0];
        chapterId = open?.chapterId || "";
        episodeId = open?.episodeId || "";
      }
      const ep = flat.find((e) => e.episodeId === episodeId);
      if (chapterId && episodeId) {
        setChannel({
          chapterId,
          episodeId,
          readOnly: ep?.status === "closed",
          title: ep?.title || `RP · ${factionName}`,
          visibility: ep?.visibility,
        });
      } else {
        setChannel(null);
      }
    } catch (e) {
      onMsg?.(e instanceof Error ? e.message : String(e));
      setChannel(null);
    } finally {
      setBootDone(true);
    }
  }, [headers, onMsg, factionName]);

  const loadMessages = useCallback(async () => {
    if (!channel) {
      setMessages([]);
      return;
    }
    try {
      const q = new URLSearchParams({
        chapterId: channel.chapterId,
        episodeId: channel.episodeId,
      });
      const res = await fetch(`/api/rp/messages?${q}`, { headers });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as {
        messages?: RpMessage[];
        pin?: ScenePin;
        visibility?: string;
      };
      const msgs = data.messages || [];
      if (firstLoad.current) {
        seenIds.current = new Set(msgs.map((m) => m.id));
        firstLoad.current = false;
      } else {
        const neu = msgs.filter((m) => !seenIds.current.has(m.id));
        if (neu.length) {
          setFreshIds(new Set(neu.map((m) => m.id)));
          for (const m of neu) seenIds.current.add(m.id);
          window.setTimeout(() => setFreshIds(new Set()), 1600);
          if (!stickBottom.current) {
            setNewBelowCount((n) => n + neu.length);
          }
        }
      }
      setMessages(msgs);
      setPin(data.pin || null);
      if (data.visibility) {
        setChannel((c) =>
          c && c.visibility !== data.visibility
            ? { ...c, visibility: data.visibility }
            : c,
        );
      }
      const sys = [...msgs].reverse().find((m) => m.type === "system");
      if (sys?.body) {
        const rollMatch = sys.body.match(/(\d+d\d+):\s*([^=\n]+(?:=\d+)?)/i);
        if (rollMatch) setLastRoll(`${rollMatch[1]} · ${rollMatch[2].trim()}`);
      }
      onMessagesLoaded?.(msgs);
    } catch (e) {
      onMsg?.(e instanceof Error ? e.message : String(e));
    }
  }, [channel, headers, onMsg, onMessagesLoaded]);

  useEffect(() => {
    void boot();
  }, [boot]);

  useEffect(() => {
    firstLoad.current = true;
    seenIds.current = new Set();
    setRenderLimit(RENDER_CAP);
    setNewBelowCount(0);
    void loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    if (!channel) return;
    const id = window.setInterval(() => void loadMessages(), 5000);
    return () => window.clearInterval(id);
  }, [channel, loadMessages]);

  useEffect(() => {
    if (!stickBottom.current) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  useLayoutEffect(() => {
    const fix = olderScrollFix.current;
    if (!fix) return;
    olderScrollFix.current = null;
    fix.el.scrollTop += fix.el.scrollHeight - fix.prevHeight;
  }, [renderLimit]);

  const showOlderMessages = () => {
    const el = listRef.current;
    if (el) olderScrollFix.current = { el, prevHeight: el.scrollHeight };
    setRenderLimit((n) => n + RENDER_CAP);
  };

  useEffect(() => {
    setPhIndex(0);
    const list = PLACEHOLDERS[voice];
    if (list.length <= 1) return;
    const id = window.setInterval(
      () => setPhIndex((i) => (i + 1) % list.length),
      3400,
    );
    return () => window.clearInterval(id);
  }, [voice]);

  const personaLabel =
    persona.kind === "npc" ? persona.npc.name : factionName;

  const pack =
    GESTURE_PACKS.find((p) => p.id === gesturePack) || GESTURE_PACKS[0];

  const post = async (
    opts?: {
      type?: Voice;
      text?: string;
      clearReply?: boolean;
      whisper?: boolean;
      tone?: string;
      intent?: { defId: string; note?: string };
    },
    postOptions?: { skipIntentConfirm?: boolean },
  ) => {
    if (!channel || channel.readOnly || busy) return;
    const type = opts?.type ?? voice;
    let text = (opts?.text ?? body).trim();
    if (!text) return;
    if (replyTo && !opts?.text) {
      text = buildReplyBody(replyTo, text);
    }
    if (opts?.intent && !postOptions?.skipIntentConfirm) {
      setIntentConfirm(opts);
      return;
    }
    setBusy(true);
    setSentOk(false);
    try {
      const useWhisper = opts?.whisper ?? whisper;
      const payloadBody: Record<string, unknown> = {
        chapterId: channel.chapterId,
        episodeId: channel.episodeId,
        type,
        body: text,
        factionId: payload.factionId,
        password,
        persona: persona.kind === "npc" ? "npc" : "self",
        tone: (opts?.tone ?? tone) || undefined,
        visibility: useWhisper ? "whisper" : undefined,
      };
      if (persona.kind === "npc") payloadBody.authorNpcId = persona.npc.id;
      if (persona.kind === "self") {
        payloadBody.authorName = factionName;
        if (crest) payloadBody.authorAvatarUrl = crest;
      }
      if (opts?.intent) {
        payloadBody.intent = {
          defId: opts.intent.defId,
          payload: {},
          note: opts.intent.note || text.slice(0, 120),
        };
      }
      const res = await fetch("/api/rp/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(playerJsonBody(payloadBody)),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      if (!opts?.text) setBody("");
      if (opts?.clearReply !== false) setReplyTo(null);
      setWhisper(false);
      if (data.intent && !data.intent.ok) {
        onMsg?.(`Реплика ушла, приказ: ${data.intent.error}`);
      }
      setSentOk(true);
      stickBottom.current = true;
      void loadMessages();
    } catch (e) {
      onMsg?.(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const resolvePrompt = async (
    messageId: string,
    action: "choice" | "dice",
    optionId?: string,
  ) => {
    if (!channel || channel.readOnly || busy) return;
    const promptMsg = messages.find((m) => m.id === messageId);
    const sides = promptMsg?.prompt?.dice?.sides || 6;
    const count = promptMsg?.prompt?.dice?.count || 1;
    if (action === "dice") {
      setDiceOpen(true);
      setDiceAnim({
        value: sides,
        sides,
        rolling: true,
        label: `${count}d${sides}`,
      });
    }
    setBusy(true);
    try {
      const res = await fetch("/api/rp/prompt/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(
          playerJsonBody({
          chapterId: channel.chapterId,
          episodeId: channel.episodeId,
          messageId,
          action,
          optionId,
          factionId: payload.factionId,
          password,
          authorName: personaLabel,
          }),
        ),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      if (action === "dice") {
        const value = Number(
          data.sum ??
            data.rolls?.[data.rolls.length - 1] ??
            data.rolls?.[0] ??
            1,
        );
        const label = `${count}d${sides}`;
        const detail =
          Array.isArray(data.rolls) && data.rolls.length > 1
            ? `${data.rolls.join("+")}=${data.sum}`
            : String(value);
        const band = data.band?.label ? ` → ${data.band.label}` : "";
        setLastRoll(`${label} · ${detail}${band}`);
        setDiceAnim({ value, sides, rolling: true, label });
        window.setTimeout(() => {
          setDiceAnim((d) => (d ? { ...d, rolling: false } : d));
        }, 220);
      }
      stickBottom.current = true;
      void loadMessages();
    } catch (e) {
      if (action === "dice") setDiceAnim(null);
      onMsg?.(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const rollDice = async (opts?: { count?: number; sides?: number }) => {
    if (!channel || channel.readOnly || busy) return;
    const count = opts?.count ?? diceCount;
    const sides = opts?.sides ?? diceSides;
    setBusy(true);
    setDiceAnim({ value: sides, sides, rolling: true, label: `${count}d${sides}` });
    try {
      const res = await fetch("/api/rp/dice", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(
          playerJsonBody({
          chapterId: channel.chapterId,
          episodeId: channel.episodeId,
          count,
          sides,
          authorName: personaLabel,
          factionId: payload.factionId,
          password,
          }),
        ),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      const value = Number(
        data.sum ?? data.rolls?.[data.rolls.length - 1] ?? data.rolls?.[0] ?? 1,
      );
      const label = `${count}d${sides}`;
      const detail =
        Array.isArray(data.rolls) && data.rolls.length > 1
          ? `${data.rolls.join("+")}=${data.sum}`
          : String(value);
      setLastRoll(`${label} · ${detail}`);
      setDiceAnim({ value, sides, rolling: true, label });
      stickBottom.current = true;
      window.setTimeout(() => {
        setDiceAnim((d) => (d ? { ...d, rolling: false } : d));
        void loadMessages();
      }, 180);
    } catch (e) {
      setDiceAnim(null);
      onMsg?.(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const reactTo = (m: RpMessage, reactId: string) => {
    const def = LINE_REACTS.find((r) => r.id === reactId);
    if (!def) return;
    const who = m.authorName || "собеседника";
    setVoice("action");
    void post({ type: "action", text: def.body(who), clearReply: true });
    setActiveLineId(null);
  };

  const startReply = (m: RpMessage) => {
    setReplyTo({
      id: m.id,
      author: m.authorName || "—",
      snippet: snippetOf(m.body),
    });
    setVoice(m.type === "action" ? "action" : "ic");
    setActiveLineId(null);
    window.setTimeout(() => composeRef.current?.focus(), 40);
  };

  const applyGesture = (g: Gesture, mode: "tap" | "hold" | "dbl") => {
    setVoice("action");
    if (g.instant || mode === "hold" || mode === "dbl") {
      void post({ type: "action", text: g.body });
      return;
    }
    setBody((cur) => {
      const t = cur.trim();
      if (!t) return g.body;
      if (t.includes(g.body)) return t;
      return `${t}; ${g.body}`;
    });
  };

  const openScene = (
    chapterId: string,
    episodeId: string,
    readOnly: boolean,
  ) => {
    setChannel({ chapterId, episodeId, readOnly, title: undefined });
    setScenesOpen(false);
    firstLoad.current = true;
    void (async () => {
      try {
        const res = await fetch("/api/rp", { headers });
        if (!res.ok) return;
        const data = await res.json();
        const ep = (data.chapters || [])
          .flatMap(
            (c: { episodes?: { id: string; title?: string }[] }) =>
              c.episodes || [],
          )
          .find((e: { id: string }) => e.id === episodeId);
        setChannel({
          chapterId,
          episodeId,
          readOnly,
          title: ep?.title || "Сцена",
          visibility: (ep as { visibility?: string } | undefined)?.visibility,
        });
      } catch {
        /* ignore */
      }
    })();
  };

  const placeholder =
    PLACEHOLDERS[voice][phIndex % PLACEHOLDERS[voice].length] || "…";

  const visibleMessages = messages.filter((m) => {
    if (feedFilter === "rolls") {
      return m.prompt?.kind === "dice" || (m.type === "system" && m.authorName === "Кубик");
    }
    if (feedFilter === "scene") {
      return (
        m.type !== "ooc" &&
        !isAsideVisibility(m.visibility, channel?.visibility)
      );
    }
    return true;
  });

  const olderCount = Math.max(0, visibleMessages.length - renderLimit);
  const renderedMessages =
    olderCount > 0 ? visibleMessages.slice(olderCount) : visibleMessages;

  const openPromptMsg = messages.find(
    (m) => m.type === "prompt" && m.prompt?.status === "open",
  );

  if (!bootDone) {
    return (
      <div className={`rp-stage rp-stage--${layout} rp-stage--loading`}>
        <p className="hint">Собираем сцену…</p>
      </div>
    );
  }

  if (!channel) {
    return (
      <div className={`rp-stage rp-stage--${layout} rp-stage--empty`}>
        <BackgroundBeamsLite className="rp-stage__beams" />
        <h2>RP</h2>
        <p className="hint">Канал державы ещё не готов.</p>
        <button type="button" className="btn ghost" onClick={() => void boot()}>
          Повторить
        </button>
      </div>
    );
  }

  return (
    <div
      className={`rp-stage rp-stage--${layout}${compact ? " rp-stage--compact" : ""}`}
      style={{ ["--rp-accent" as string]: accent }}
      aria-label="RP"
    >
      {!compact && <BackgroundBeamsLite className="rp-stage__beams" />}

      <header className="rp-stage__notch">
        {compact && onBack ? (
          <button
            type="button"
            className="rp-stage__back-btn"
            aria-label="Назад к карте"
            onClick={onBack}
          >
            <ChevronLeft size={22} strokeWidth={2} aria-hidden />
          </button>
        ) : null}
        <div className="rp-stage__identity">
          <span
            className="rp-stage__crest"
            style={
              crest
                ? {
                    backgroundImage: `url("${String(crest).replace(/"/g, "")}")`,
                  }
                : { background: accent }
            }
          >
            {!crest && initialOf(factionName)}
          </span>
          <div className="rp-stage__titles">
            <strong>{channel.title || `RP · ${factionName}`}</strong>
            <span>
              {factionName} · ход {payload.world.meta.turn}
              {channel.readOnly ? " · архив" : ""}
              {lastRoll ? ` · ${lastRoll}` : ""}
            </span>
          </div>
        </div>
        <div className="rp-stage__notch-actions">
          {!compact && !channel.readOnly && (
            <button
              type="button"
              className={`rp-stage__icon-btn ${!desktopToolsCollapsed ? "on" : ""}`}
              title={
                desktopToolsCollapsed
                  ? "Показать панель ввода"
                  : "Свернуть панель ввода"
              }
              aria-label={
                desktopToolsCollapsed
                  ? "Показать панель ввода"
                  : "Свернуть панель ввода"
              }
              aria-expanded={!desktopToolsCollapsed}
              onClick={() => setDesktopToolsCollapsed((v) => !v)}
            >
              <SlidersHorizontal size={16} aria-hidden />
            </button>
          )}
          {!channel.readOnly &&
            !compact &&
            DICE_MACROS.map((m) => (
              <button
                key={m.id}
                type="button"
                className="rp-stage__icon-btn rp-stage__icon-btn--macro"
                title={`Бросить ${m.label}`}
                aria-label={`Бросить ${m.label}`}
                disabled={busy}
                onClick={() => void rollDice({ count: m.count, sides: m.sides })}
              >
                {m.label}
              </button>
            ))}
          <button
            type="button"
            className={`rp-stage__icon-btn ${diceOpen ? "on" : ""}`}
            title="Кубики"
            aria-label="Кубики"
            aria-pressed={diceOpen}
            disabled={channel.readOnly}
            onClick={() => {
              setDiceOpen((v) => !v);
              setScenesOpen(false);
            }}
          >
            d6
          </button>
          <button
            type="button"
            className={`rp-stage__icon-btn ${scenesOpen ? "on" : ""}`}
            title="Сцены"
            aria-label="Сцены"
            aria-pressed={scenesOpen}
            onClick={() => {
              setScenesOpen((v) => !v);
              setDiceOpen(false);
            }}
          >
            Сцены
          </button>
        </div>
      </header>

      <AnimatePresence>
        {diceOpen && (
          <motion.div
            className="rp-stage__sheet rp-stage__sheet--dice"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
          >
            <div className="rp-stage__dice-row">
              {DICE.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`rp-stage__die ${diceSides === s ? "on" : ""}`}
                  onClick={() => setDiceSides(s)}
                >
                  d{s}
                </button>
              ))}
              <label className="rp-stage__die-count">
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
                disabled={busy || channel.readOnly}
                onClick={() => void rollDice()}
              >
                Бросить
              </button>
            </div>
            {diceAnim && (
              <div className="rp-stage__dice-stage">
                <DiceRoller
                  value={diceAnim.value}
                  sides={diceAnim.sides}
                  rolling={diceAnim.rolling}
                />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {pin?.body && (
        <div className="rp-stage__pin" role="note">
          <strong>{pin.title || "Сцена"}</strong>
          <p>{pin.body}</p>
        </div>
      )}

      <div className="rp-stage__feed-filters" role="tablist" aria-label="Лента">
        {(
          [
            ["all", "Всё"],
            ["scene", "Сцена"],
            ["rolls", "Броски"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={feedFilter === id}
            className={feedFilter === id ? "on" : ""}
            onClick={() => setFeedFilter(id)}
          >
            {label}
          </button>
        ))}
        {openPromptMsg && (
          <button
            type="button"
            className="rp-stage__prompt-jump"
            title="Перейти к открытому промпту"
            onClick={() =>
              document
                .getElementById(`rp-line-${openPromptMsg.id}`)
                ?.scrollIntoView({ behavior: "smooth", block: "center" })
            }
          >
            Есть промпт ↑
          </button>
        )}
      </div>

      <div
        className="rp-stage__stream"
        ref={listRef}
        onScroll={() => {
          const el = listRef.current;
          if (!el) return;
          const stuck = el.scrollHeight - el.scrollTop - el.clientHeight < 56;
          stickBottom.current = stuck;
          if (stuck) setNewBelowCount(0);
        }}
      >
        {visibleMessages.length === 0 && (
          <div className="rp-stage__empty-stream">
            <p>Сцена пуста.</p>
            <p className="hint">Начните речью, действием — или ответьте жестом.</p>
          </div>
        )}
        {olderCount > 0 && (
          <button
            type="button"
            className="rp-stage__load-older"
            onClick={showOlderMessages}
          >
            Показать более раннее ({olderCount})
          </button>
        )}
        <AnimatePresence initial={false}>
          {renderedMessages.map((m) => {
            const parsed = parseReplyBody(m.body);
            const fresh = freshIds.has(m.id);
            const open = activeLineId === m.id;
            const isPrompt = m.type === "prompt";
            const canReply = m.type !== "system" && !isPrompt;
            return (
              <motion.article
                key={m.id}
                id={`rp-line-${m.id}`}
                className={[
                  "rp-line",
                  `rp-line--${m.type}`,
                  fresh ? "rp-line--fresh" : "",
                  open ? "rp-line--open" : "",
                  isAsideVisibility(m.visibility, channel.visibility)
                    ? "rp-line--whisper"
                    : "",
                  m.type !== "system" && !isPrompt ? "fx-spotlight" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                initial={{ opacity: 0, y: 10, scale: 0.985 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.24 }}
                {...(m.type !== "system" && !isPrompt ? spotlight.bind : {})}
                title={
                  canReply && !channel.readOnly
                    ? "Нажмите — реакции и ответ"
                    : undefined
                }
                onClick={() => {
                  if (m.type === "system" || isPrompt || channel.readOnly)
                    return;
                  setActiveLineId((cur) => (cur === m.id ? null : m.id));
                }}
              >
                {canReply && !channel.readOnly && !open && (
                  <span className="rp-line__reply-hint" aria-hidden>
                    ↩
                  </span>
                )}
                {m.type !== "system" && (
                  <header className="rp-line__head">
                    <span
                      className="rp-line__av"
                      style={
                        m.authorAvatarUrl
                          ? {
                              backgroundImage: `url("${String(m.authorAvatarUrl).replace(/"/g, "")}")`,
                            }
                          : {
                              background:
                                m.authorFactionId === payload.factionId
                                  ? accent
                                  : "var(--signal-neutral, #6a7380)",
                            }
                      }
                    >
                      {!m.authorAvatarUrl && initialOf(m.authorName)}
                    </span>
                    <strong>{m.authorName || "—"}</strong>
                    <span className={`rp-line__kind rp-line__kind--${m.type}`}>
                      {isPrompt
                        ? "Промпт"
                        : VOICES.find((v) => v.id === m.type)?.label ||
                          (m.type === "system" ? "Система" : m.type)}
                    </span>
                    {m.tone && (
                      <span className="rp-line__tone">{m.tone}</span>
                    )}
                    {isAsideVisibility(m.visibility, channel.visibility) && (
                      <span className="rp-line__tone">
                        {m.visibility === "whisper" ? "шёпот → ГМ" : "шёпот"}
                      </span>
                    )}
                    <time dateTime={m.at}>{fmtTime(m.at)}</time>
                  </header>
                )}
                {parsed.quote && (
                  <blockquote className="rp-line__quote">{parsed.quote}</blockquote>
                )}
                <p className="rp-line__body">{parsed.text}</p>
                {isPrompt && m.prompt && (
                  <div className="rp-prompt-card">
                    <span className="rp-prompt-card__kind">
                      {m.prompt.kind === "choice"
                        ? "Выбор"
                        : "Проверка кубиком"}
                      {m.prompt.status === "resolved" ? " · закрыт" : ""}
                    </span>
                    {m.prompt.kind === "choice" &&
                      m.prompt.status === "open" &&
                      !channel.readOnly && (
                        <div className="rp-prompt-card__opts">
                          {(m.prompt.options || []).map((o) => (
                            <button
                              key={o.id}
                              type="button"
                              className="rp-prompt-card__opt"
                              disabled={busy}
                              onClick={(e) => {
                                e.stopPropagation();
                                void resolvePrompt(m.id, "choice", o.id);
                              }}
                            >
                              {o.label}
                            </button>
                          ))}
                        </div>
                      )}
                    {m.prompt.kind === "choice" &&
                      m.prompt.status === "resolved" && (
                        <p className="hint">
                          Выбрано: {m.prompt.resolved?.choiceLabel}
                        </p>
                      )}
                    {m.prompt.kind === "dice" && (
                      <div className="rp-prompt-card__dice">
                        <div className="rp-prompt-card__bands">
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
                        </div>
                        {m.prompt.lastRoll && m.prompt.status === "open" && (
                          <p className="hint">
                            Было: {m.prompt.lastRoll.sum}
                            {m.prompt.lastRoll.bandLabel
                              ? ` → ${m.prompt.lastRoll.bandLabel}`
                              : ""}{" "}
                            · можно перебросить
                          </p>
                        )}
                        {m.prompt.status === "open" &&
                          m.prompt.dice?.whoRolls !== "gm" &&
                          !channel.readOnly && (
                            <button
                              type="button"
                              className="btn"
                              disabled={busy}
                              onClick={(e) => {
                                e.stopPropagation();
                                void resolvePrompt(m.id, "dice");
                              }}
                            >
                              Бросить{" "}
                              {m.prompt.dice?.count || 1}d
                              {m.prompt.dice?.sides || 6}
                            </button>
                          )}
                        {m.prompt.status === "open" &&
                          m.prompt.dice?.whoRolls === "gm" && (
                            <p className="hint">Ждём бросок мастера…</p>
                          )}
                        {m.prompt.status === "resolved" && (
                          <p className="hint">
                            Итог:{" "}
                            {m.prompt.resolved?.bandLabel ||
                              m.prompt.resolved?.outcome}
                            {m.prompt.resolved?.sum != null
                              ? ` (${m.prompt.resolved.sum})`
                              : ""}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {m.intentId && (
                  <span className="rp-line__chip">приказ в очереди</span>
                )}
                {open && !channel.readOnly && m.type !== "system" && !isPrompt && (
                  <motion.div
                    className="rp-line__reacts"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {LINE_REACTS.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        className="rp-react"
                        disabled={busy}
                        onClick={() => reactTo(m, r.id)}
                      >
                        {r.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="rp-react rp-react--reply"
                      onClick={() => startReply(m)}
                    >
                      Ответить
                    </button>
                  </motion.div>
                )}
              </motion.article>
            );
          })}
        </AnimatePresence>
        <div ref={bottomRef} />
        {newBelowCount > 0 && (
          <button
            type="button"
            className="rp-stage__jump-new"
            onClick={() => {
              stickBottom.current = true;
              setNewBelowCount(0);
              bottomRef.current?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            Новые сообщения · {newBelowCount > 9 ? "9+" : newBelowCount} ↓
          </button>
        )}
      </div>

      {!channel.readOnly && (
        <footer className="rp-stage__dock">
          {compact ? (
            <div className="rp-stage__mobile-bar">
              <button
                type="button"
                className={`rp-stage__mobile-toggle ${toolsOpen ? "on" : ""}`}
                aria-expanded={toolsOpen}
                onClick={() => setToolsOpen((v) => !v)}
              >
                <SlidersHorizontal size={16} aria-hidden />
                <span>{personaLabel}</span>
                <span className="hint">
                  {VOICES.find((v) => v.id === voice)?.label}
                </span>
              </button>
              <div className="rp-stage__mobile-quick">
                <button
                  type="button"
                  className={`rp-stage__icon-btn ${whisper ? "on" : ""}`}
                  title="Шёпот ГМ"
                  aria-label="Шёпот только мастеру"
                  aria-pressed={whisper}
                  onClick={() => setWhisper((v) => !v)}
                >
                  {whisper ? "Ш" : "·"}
                </button>
                <button
                  type="button"
                  className={`rp-stage__icon-btn ${diceOpen ? "on" : ""}`}
                  title="Кубики"
                  disabled={channel.readOnly}
                  onClick={() => {
                    setDiceOpen((v) => !v);
                    setScenesOpen(false);
                  }}
                >
                  🎲
                </button>
              </div>
            </div>
          ) : null}

          {(compact ? toolsOpen : !desktopToolsCollapsed) && (
            <>
          <div
            className={`rp-stage__cast ${persona.kind !== "self" ? "rp-stage__cast--focus" : ""}`}
            role="listbox"
            aria-label="От кого"
          >
            <button
              type="button"
              role="option"
              aria-selected={persona.kind === "self"}
              className={`rp-cast ${persona.kind === "self" ? "on" : ""}`}
              title={factionName}
              onClick={() => setPersona({ kind: "self" })}
            >
              <span
                className="rp-cast__av"
                style={
                  crest
                    ? {
                        backgroundImage: `url("${String(crest).replace(/"/g, "")}")`,
                      }
                    : { background: accent }
                }
              >
                {!crest && initialOf(factionName)}
              </span>
              <span className="rp-cast__name">Я</span>
            </button>
            {npcs.slice(0, 8).map((n) => (
              <button
                key={n.id}
                type="button"
                role="option"
                aria-selected={
                  persona.kind === "npc" && persona.npc.id === n.id
                }
                className={`rp-cast ${
                  persona.kind === "npc" && persona.npc.id === n.id ? "on" : ""
                }`}
                title={n.title ? `${n.name} · ${n.title}` : n.name}
                onClick={() => setPersona({ kind: "npc", npc: n })}
              >
                <span
                  className="rp-cast__av"
                  style={
                    n.avatarUrl
                      ? {
                          backgroundImage: `url("${String(n.avatarUrl).replace(/"/g, "")}")`,
                        }
                      : { background: accent }
                  }
                >
                  {!n.avatarUrl && initialOf(n.name)}
                </span>
                <span className="rp-cast__name">{n.name.split(" ")[0]}</span>
              </button>
            ))}
          </div>

          <LayoutGroup>
            <div className="rp-stage__voices" role="tablist" aria-label="Голос">
              {VOICES.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  role="tab"
                  aria-selected={voice === v.id}
                  title={v.hint}
                  className={`rp-voice ${voice === v.id ? "on" : ""}`}
                  onClick={() => setVoice(v.id)}
                >
                  {voice === v.id && (
                    <motion.span
                      layoutId="rp-voice-pill"
                      className="rp-voice__pill"
                      transition={{
                        type: "spring",
                        stiffness: 420,
                        damping: 36,
                      }}
                    />
                  )}
                  <span className="rp-voice__label">{v.label}</span>
                </button>
              ))}
            </div>
          </LayoutGroup>

          {(voice === "action" || voice === "ic") && (
            <div className="rp-stage__gesture-panel">
              <div className="rp-stage__packs" role="tablist" aria-label="Жесты">
                {GESTURE_PACKS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    role="tab"
                    aria-selected={gesturePack === p.id}
                    className={`rp-pack ${gesturePack === p.id ? "on" : ""}`}
                    onClick={() => {
                      setGesturePack(p.id);
                      if (voice !== "action") setVoice("action");
                    }}
                  >
                    {p.label}
                  </button>
                ))}
                <span className="rp-stage__gesture-tip hint">
                  тап — в текст · двойной / удержание — сразу
                </span>
              </div>
              <div className="rp-stage__gestures">
                {pack.items.map((g) => (
                  <GestureChip
                    key={g.id}
                    gesture={g}
                    disabled={busy}
                    onTap={() => applyGesture(g, "tap")}
                    onSend={() => applyGesture(g, "hold")}
                  />
                ))}
              </div>
            </div>
          )}

          <AnimatePresence>
            {replyTo && (
              <motion.div
                className="rp-stage__reply"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
              >
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
              </motion.div>
            )}
          </AnimatePresence>

          <div className="rp-stage__meta-row">
            <button
              type="button"
              className={`rp-stage__whisper ${whisper ? "on" : ""}`}
              title="Только мастеру"
              aria-pressed={whisper}
              aria-label={whisper ? "Шёпот только мастеру, включён" : "Шёпот только мастеру"}
              onClick={() => setWhisper((v) => !v)}
            >
              {whisper ? "Шёпот → ГМ" : "Шёпот"}
            </button>
            <select
              className="rp-stage__tone"
              value={tone}
              aria-label="Тон речи"
              onChange={(e) => setTone(e.target.value)}
            >
              {TONES.map((t) => (
                <option key={t.id || "none"} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={`rp-stage__icon-btn ${intentsOpen ? "on" : ""}`}
              title="Жест → приказ"
              onClick={() => setIntentsOpen((v) => !v)}
            >
              Приказ
            </button>
          </div>

          {intentsOpen && (
            <div className="rp-stage__intent-hot" aria-label="Горячие приказы">
              {INTENT_HOT.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  className="rp-gesture rp-gesture--hot"
                  disabled={busy}
                  title={h.body}
                  onClick={() =>
                    void post({
                      type: "action",
                      text: h.body,
                      intent: { defId: h.defId, note: h.body },
                    })
                  }
                >
                  {h.label}
                </button>
              ))}
            </div>
          )}
            </>
          )}

          <div className="rp-stage__compose">
            <div className="rp-stage__field">
              {!body.trim() && (
                <div className="rp-stage__ph" aria-hidden>
                  <span className="rp-stage__ph-who">{personaLabel}</span>
                  <FlipWords word={placeholder} />
                </div>
              )}
              <textarea
                ref={composeRef}
                rows={2}
                value={body}
                disabled={busy}
                aria-label="Текст реплики"
                onChange={(e) => setBody(e.target.value)}
                onFocus={() => {
                  if (!compact) return;
                  window.setTimeout(
                    () =>
                      bottomRef.current?.scrollIntoView({
                        behavior: "smooth",
                        block: "end",
                      }),
                    280,
                  );
                }}
                onKeyDown={(e) => {
                  if (isRpSendHotkey(e)) {
                    e.preventDefault();
                    void post();
                  }
                  if (e.key === "Escape" && replyTo) {
                    e.preventDefault();
                    setReplyTo(null);
                  }
                }}
              />
            </div>
            <div {...magSend.bind} className="rp-stage__send-wrap fx-magnetic">
              <StatefulButton
                className="rp-stage__send"
                busy={busy}
                success={sentOk}
                successLabel="Ушло"
                disabled={!body.trim() || busy}
                onClick={() => void post()}
                onSuccessEnd={() => setSentOk(false)}
              >
                {whisper ? "Шёпот" : "Отправить"}
              </StatefulButton>
            </div>
          </div>
          {!compact && (
            <p className="rp-stage__hint">
              Enter шлёт · Shift+Enter новая строка · клик по реплике — ответ ·{" "}
              {personaLabel} ·{" "}
              {VOICES.find((v) => v.id === voice)?.label}
              {tone ? ` · ${tone}` : ""}
              {whisper ? " · только мастеру" : ""}
            </p>
          )}
        </footer>
      )}

      <AnimatePresence>
        {scenesOpen && (
          <motion.aside
            className="rp-stage__drawer"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 36 }}
            aria-label="Сцены"
          >
            <header className="rp-stage__drawer-head">
              <h3>Сцены</h3>
              <button
                type="button"
                className="btn ghost"
                onClick={() => setScenesOpen(false)}
              >
                Закрыть
              </button>
            </header>
            <ChroniclePanel
              headers={headers}
              mode="player"
              hideHq
              onMsg={onMsg}
              onOpenEpisode={openScene}
            />
          </motion.aside>
        )}
      </AnimatePresence>
      {scenesOpen && (
        <button
          type="button"
          className="rp-stage__scrim"
          aria-label="Закрыть сцены"
          onClick={() => setScenesOpen(false)}
        />
      )}
      <ConfirmModal
        open={!!intentConfirm}
        title="Потратить ОД на приказ?"
        confirmLabel="Отправить"
        busy={busy}
        onClose={() => setIntentConfirm(null)}
        onConfirm={() => {
          const pending = intentConfirm;
          setIntentConfirm(null);
          if (pending) void post(pending, { skipIntentConfirm: true });
        }}
      >
        <p className="hint">
          Приказ попадёт в очередь хода и может зарезервировать ОД.
        </p>
      </ConfirmModal>
    </div>
  );
}
