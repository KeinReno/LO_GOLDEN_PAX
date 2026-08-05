/**
 * Tactical skirmish table — energy, deploy/strike, stance orders, ready → clash.
 * Aceternity-inspired: beams backdrop, flip-words result, spotlight cards.
 */
import { AnimatePresence, motion } from "motion/react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { CardBoard } from "../ui/cardBoardContext";
import { DragCard } from "../ui/DragCard";
import { DropZone } from "../ui/DropZone";
import { BackgroundBeamsLite } from "../ui/BackgroundBeamsLite";
import { FlipWords } from "../ui/FlipWords";
import { useSpotlight } from "../ui/aceternityFx";
import type { BattleCard, CardBattleLogEntry, CardBattleState } from "../state/types";
import { resolveShipOrUnitName } from "../state/displayLabels";
import {
  cardEnergyCost,
  estimateStrikePreview,
  frontStrikeCost,
  hintTone,
  intentLabel,
  keywordsForCard,
  roleLabel,
} from "../state/cardBattleHints";
import type { ViewerEngagement } from "./PlayerEngagementPanel";
import { COMBAT_STANCE_LABELS, type CombatStanceId } from "./PlayerEngagementPanel";
import { CombatCardMeta } from "./forces/CombatCardMeta";

function CardFace({
  card,
  compact,
  showHints,
  statuses,
  previewDmg,
}: {
  card: BattleCard;
  compact?: boolean;
  showHints?: boolean;
  statuses?: { vulnerable?: boolean; weak?: boolean; focus?: boolean };
  previewDmg?: number | null;
}) {
  const cost =
    (card as BattleCard & { energyCost?: number }).energyCost ??
    cardEnergyCost(card.role);
  const tac = (card as BattleCard & { tactical?: boolean; tacticLabel?: string })
    .tactical;
  const hpPct = Math.max(
    0,
    Math.min(100, (card.hp / Math.max(1, card.maxHp)) * 100),
  );
  const deploy =
    (card as BattleCard & { deployOrder?: number }).deployOrder;
  return (
    <div className={`cbt-card-stats${compact ? " is-compact" : ""}`}>
      <CombatCardMeta
        role={card.role}
        energyCost={cost}
        bonusKeywords={
          (card as BattleCard & { bonusKeywords?: string[] }).bonusKeywords
        }
        showMatchup={!!showHints && !tac}
        hpPercent={hpPct}
        compact={compact}
      />
      {tac && <span className="cbt-stat cbt-stat--tac">тактика</span>}
      {statuses?.vulnerable && (
        <span className="cbt-stat cbt-stat--vuln">уязв.</span>
      )}
      {statuses?.weak && <span className="cbt-stat cbt-stat--weak">слаб.</span>}
      {statuses?.focus && (
        <span className="cbt-stat cbt-stat--focus">фокус</span>
      )}
      {deploy != null && !tac && (
        <span className="cbt-stat" title="Порядок из колоды Сил">
          #{deploy + 1}
        </span>
      )}
      <span className="cbt-stat" title="Урон">
        ✦{card.damage}
      </span>
      <span className="cbt-stat" title="HP">
        ♥{card.hp}/{card.maxHp}
      </span>
      <span className="cbt-stat" title="Кол-во">
        ×{card.count}
      </span>
      {!compact && card.shields > 0 && (
        <span className="cbt-stat" title="Щиты">
          ⬡{card.shields}
        </span>
      )}
      {previewDmg != null && previewDmg > 0 && (
        <span className="cbt-stat cbt-stat--preview" title="Оценка урона">
          ≈{previewDmg}
        </span>
      )}
    </div>
  );
}

function EnergyPips({ current, max }: { current: number; max: number }) {
  return (
    <div className="cbt-energy" aria-label={`Энергия ${current} из ${max}`}>
      {Array.from({ length: max }).map((_, i) => (
        <span
          key={i}
          className={`cbt-energy-pip${i < current ? " is-on" : ""}`}
        />
      ))}
      <span className="cbt-energy-label">
        {current}/{max}
      </span>
    </div>
  );
}

function BaseBar({
  label,
  hp,
  max,
  tone,
  block = 0,
  selectable,
  selected,
  onSelect,
  previewDmg,
}: {
  label: string;
  hp: number;
  max: number;
  tone: "me" | "opp";
  block?: number;
  selectable?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  previewDmg?: number | null;
}) {
  const pct = Math.max(0, Math.min(100, (hp / Math.max(1, max)) * 100));
  const Tag = selectable ? "button" : "div";
  return (
    <Tag
      type={selectable ? "button" : undefined}
      className={`cbt-base cbt-base--${tone}${selected ? " is-selected" : ""}${selectable ? " is-selectable" : ""}`}
      onClick={selectable ? onSelect : undefined}
      aria-label={`${label}: база ${Math.round(hp)}${block ? `, блок ${block}` : ""}`}
    >
      <span className="cbt-base-label">{label}</span>
      <div className="cbt-base-track">
        <div className="cbt-base-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="cbt-base-hp">{Math.round(hp)}</span>
      {block > 0 && (
        <span className="cbt-block-badge" title="Block">
          🛡{block}
        </span>
      )}
      {previewDmg != null && previewDmg > 0 && (
        <span className="cbt-dmg-preview">≈{previewDmg}</span>
      )}
    </Tag>
  );
}

function StackPile({
  label,
  count,
  onClick,
  faceDown,
}: {
  label: string;
  count: number;
  onClick?: () => void;
  faceDown?: boolean;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      className={`cbt-pile${faceDown ? " is-facedown" : ""}${onClick ? " is-clickable" : ""}`}
      onClick={onClick}
      disabled={onClick ? count <= 0 : undefined}
      aria-label={`${label}: ${count}`}
    >
      <span className="cbt-pile-label">{label}</span>
      <span className="cbt-pile-count">{count}</span>
    </Tag>
  );
}

function LogList({
  log,
  factionNames,
}: {
  log: CardBattleLogEntry[];
  factionNames: Record<string, string>;
}) {
  const recent = log.slice(-14).reverse();
  if (!recent.length) return <p className="hint">Лог пуст.</p>;
  return (
    <ul className="cbt-log" aria-live="polite">
      {recent.map((e, i) => {
        const who = factionNames[e.side] || e.side;
        let text = `${who}: ${e.action}`;
        if (e.action === "deploy") text = `${who} выставил карту`;
        if (e.action === "strike") text = `${who} атакует`;
        if (e.action === "play") text = `${who} сыграл карту`;
        if (e.action === "pass" || e.action === "ready") text = `${who} готов`;
        if (e.action === "resolve" || e.action === "clash") {
          const bits = [`урон ${e.outcome?.damageDealt ?? 0}`];
          if (e.outcome?.blocked)
            bits.push(`Block −${e.outcome.blocked}`);
          if (e.outcome?.redirected) bits.push("эскорт");
          if (e.outcome?.overflowToBase)
            bits.push(`прорыв ${e.outcome.overflowToBase}`);
          if (e.outcome?.statusApplied)
            bits.push(String(e.outcome.statusApplied));
          text = `Стычка · ${bits.join(" · ")}`;
        }
        if (e.action === "base_hit") {
          const blk = e.outcome?.blocked
            ? ` (Block −${e.outcome.blocked})`
            : "";
          text = `${who} → база (−${e.outcome?.damageDealt ?? 0})${blk}`;
        }
        if (e.action === "stance_order") {
          text = `${who}: приказ «${e.outcome?.label || e.orderId}»`;
        }
        if (e.action === "round_start") {
          text = e.outcome?.label || `Раунд ${e.round}`;
        }
        if (e.action === "draw") text = `${who} добрал карту`;
        if (e.action === "brace") {
          text = `${who}: оплот ${e.outcome?.label || ""}`;
        }
        if (e.action === "focus") {
          text = `${who}: фокус-огонь`;
        }
        if (e.action === "reorder") {
          text = `${who}: перестройка ${e.outcome?.label || ""}`;
        }
        if (e.action === "retreat") {
          text = `${who}: отступление`;
        }
        return (
          <li key={`${e.round}-${e.action}-${i}`}>
            <span className="cbt-log-round">R{e.round}</span> {text}
          </li>
        );
      })}
    </ul>
  );
}

function ClashCinema({
  events,
  step,
  factionNames,
  nameOf,
}: {
  events: NonNullable<CardBattleState["clashEvents"]>;
  step: number;
  factionNames: Record<string, string>;
  nameOf: (cardId: string) => string;
}) {
  const ev = events[step];
  if (!ev) return null;
  const who = factionNames[ev.side] || ev.side;
  const isKill = !!ev.killedTarget;
  const isBreach = ev.targetId === "base" || (ev.overflowToBase ?? 0) > 0;
  const bits: string[] = [`−${ev.damageDealt ?? 0}`];
  if (ev.blocked) bits.push(`Block −${ev.blocked}`);
  if (ev.redirected) bits.push("эскорт");
  if (ev.overflowToBase) bits.push(`прорыв ${ev.overflowToBase}`);
  if (ev.splashDamage) bits.push(`волна −${ev.splashDamage}`);
  if (ev.statusApplied) bits.push(String(ev.statusApplied));
  if (isKill) bits.push("уничтожен");
  const styleTags = ev.styleTags?.length ? ev.styleTags : [];
  const lane =
    typeof ev.laneIndex === "number" ? `Линия ${ev.laneIndex + 1}` : null;
  return (
    <motion.div
      className={`cbt-clash-cinema${isKill ? " is-kill" : ""}${isBreach ? " is-breach" : ""}`}
      key={`${ev.cardId}-${step}`}
      initial={{ opacity: 0, scale: 0.88, y: 8 }}
      animate={{
        opacity: 1,
        scale: isKill ? [1.08, 1] : 1,
        y: 0,
      }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: isKill ? 0.42 : 0.28 }}
    >
      <p className="cbt-clash-cinema__who">
        {who}
        {lane ? ` · ${lane}` : ""}
      </p>
      <motion.div
        className="cbt-clash-cinema__arrow"
        initial={{ x: -48, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.35 }}
      >
        <span className="cbt-clash-cinema__card">{nameOf(ev.cardId)}</span>
        <span aria-hidden>→</span>
        <span className="cbt-clash-cinema__card">
          {ev.targetId === "base" ? "БАЗА" : nameOf(ev.targetId)}
        </span>
      </motion.div>
      <motion.p
        className={`cbt-clash-cinema__dmg${isKill ? " is-kill" : ""}`}
        initial={{ scale: 0.55, opacity: 0 }}
        animate={{ scale: isKill ? [1.35, 1] : [1.15, 1], opacity: 1 }}
        transition={{ delay: 0.12, duration: 0.38 }}
      >
        {bits.join(" · ")}
      </motion.p>
      {styleTags.length > 0 && (
        <motion.div
          className="cbt-clash-cinema__styles"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          {styleTags.map((t) => (
            <span key={t} className="cbt-style-banner">
              {t}
            </span>
          ))}
        </motion.div>
      )}
    </motion.div>
  );
}

export type CardBattleTableProps = {
  engagement: ViewerEngagement;
  factionId: string;
  password: string;
  factionNames: Record<string, string>;
  busy?: boolean;
  onUpdated?: (engagement: ViewerEngagement) => void;
  onClose?: () => void;
};

type TargetSel =
  | { kind: "base" }
  | { kind: "card"; cardId: string }
  | null;

export function CardBattleTable({
  engagement,
  factionId,
  password,
  factionNames,
  busy: busyProp = false,
  onUpdated,
  onClose,
}: CardBattleTableProps) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [resolveFlash, setResolveFlash] = useState<string | null>(null);
  const [selectedHandId, setSelectedHandId] = useState<string | null>(null);
  const [selectedFrontId, setSelectedFrontId] = useState<string | null>(null);
  const [target, setTarget] = useState<TargetSel>(null);
  const [clashStep, setClashStep] = useState(-1);
  const [showResults, setShowResults] = useState(false);
  const [commitFlash, setCommitFlash] = useState(false);
  const [cinemaDone, setCinemaDone] = useState(true);
  const spot = useSpotlight();
  const postLock = useRef(false);
  const lastClashKey = useRef("");
  const clashIvRef = useRef<number | null>(null);

  const state = engagement.cardBattle as CardBattleState | null | undefined;
  const myStance = engagement.sides.find((s) => s.factionId === factionId)?.stance;
  const oppId =
    engagement.sides.find((s) => s.factionId !== factionId)?.factionId || "";

  const myHand = state?.hands?.[factionId] || [];
  const myFront = state?.frontLines?.[factionId] || [];
  const oppFront = state?.frontLines?.[oppId] || [];
  const myDeck = state?.decks?.[factionId] || [];
  const myDiscard = state?.discard?.[factionId] || [];
  const oppHandCount = state?.hands?.[oppId]?.length || 0;
  const myBase = state?.baseHp?.[factionId] ?? 0;
  const oppBase = state?.baseHp?.[oppId] ?? 0;
  const myBaseMax = state?.baseHpMax?.[factionId] ?? (myBase || 1);
  const oppBaseMax = state?.baseHpMax?.[oppId] ?? (oppBase || 1);
  const energy = state?.energy?.[factionId] ?? 0;
  const maxEnergy = state?.maxEnergy ?? 5;
  const maxFront = state?.maxFront ?? 5;
  const iReady = (state?.readySides || []).includes(factionId);
  const theyReady = (state?.readySides || []).includes(oppId);
  const phase = state?.phase || "plan";
  const clashEvents = state?.clashEvents || [];
  const clashPlaying = clashStep >= 0 && clashStep < clashEvents.length;
  const cinemaEv =
    clashPlaying && clashStep >= 0 ? clashEvents[clashStep] : null;
  const canAct =
    state?.status === "active" &&
    phase === "plan" &&
    !iReady &&
    !busy &&
    !busyProp &&
    !clashPlaying &&
    !commitFlash;
  const resolved =
    state?.status === "resolved" ||
    engagement.status === "resolved" ||
    phase === "resolved";

  const nameOf = (cardId: string) => {
    const all = [
      ...myFront,
      ...oppFront,
      ...myHand,
      ...(state?.discard?.[factionId] || []),
      ...(state?.discard?.[oppId] || []),
      ...(state?.decks?.[factionId] || []),
      ...(state?.decks?.[oppId] || []),
      ...((state?.clashEvents || []).length
        ? [
            ...Object.values(state?.frontLines || {}).flat(),
            ...Object.values(state?.discard || {}).flat(),
          ]
        : []),
    ];
    const c = all.find((x) => x && x.cardId === cardId);
    if (!c) return cardId.slice(0, 8);
    const tac = (c as BattleCard & { tacticLabel?: string }).tacticLabel;
    return tac || resolveShipOrUnitName(c.defId);
  };

  // Live sync while waiting for opponent Ready / AI
  useEffect(() => {
    if (!state || resolved || showResults) return;
    const waiting = iReady && !theyReady;
    if (!waiting && phase !== "plan") return;
    if (!waiting) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch("/api/engagements", {
          headers: {
            "X-Faction-Id": factionId,
            "X-Faction-Password": password,
          },
        });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const next = (data.engagements || []).find(
          (e: ViewerEngagement) => e.id === engagement.id,
        );
        if (next) onUpdated?.(next);
      } catch {
        /* ignore */
      }
    };
    void tick();
    const id = window.setInterval(tick, 1500);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [
    state?.readySides,
    iReady,
    theyReady,
    resolved,
    showResults,
    phase,
    factionId,
    password,
    engagement.id,
    onUpdated,
  ]);

  // Play clash cinema when events arrive (commit beat → timeline)
  useEffect(() => {
    if (!clashEvents.length) {
      setClashStep(-1);
      setCommitFlash(false);
      setCinemaDone(true);
      return;
    }
    const key = `${state?.clashSeq ?? state?.round}-${clashEvents.length}-${clashEvents[0]?.cardId}-${clashEvents[0]?.targetId ?? ""}`;
    if (key === lastClashKey.current) return;
    let cancelled = false;
    let started = false;
    let stepTimer: number | null = null;
    setCinemaDone(false);
    setCommitFlash(true);
    setClashStep(-1);

    const dwellFor = (idx: number) => {
      const ev = clashEvents[idx];
      if (!ev) return 800;
      if (ev.killedTarget) return 1250;
      if (ev.targetId === "base" || (ev.overflowToBase ?? 0) > 0) return 1100;
      if (ev.styleTags?.length) return 1000;
      return 750;
    };

    const playStep = (step: number) => {
      if (cancelled) return;
      if (step >= clashEvents.length) {
        setClashStep(-1);
        setCinemaDone(true);
        return;
      }
      setClashStep(step);
      stepTimer = window.setTimeout(() => playStep(step + 1), dwellFor(step));
    };

    const commitT = window.setTimeout(() => {
      if (cancelled) return;
      // Mark only after commit starts — survives React Strict Mode re-run
      started = true;
      lastClashKey.current = key;
      setCommitFlash(false);
      playStep(0);
    }, 1100);

    return () => {
      cancelled = true;
      window.clearTimeout(commitT);
      if (stepTimer) window.clearTimeout(stepTimer);
      if (clashIvRef.current) window.clearInterval(clashIvRef.current);
      clashIvRef.current = null;
      if (!started) {
        setCommitFlash(false);
        setCinemaDone(false);
      }
    };
  }, [
    state?.clashSeq,
    state?.round,
    clashEvents.length,
    clashEvents[0]?.cardId,
    clashEvents[0]?.targetId,
  ]);

  // Show results after resolve — wait for clash cinema on the final round
  useEffect(() => {
    if (!resolved) {
      setShowResults(false);
      return;
    }
    if (clashEvents.length > 0 && !cinemaDone) return;
    const t = window.setTimeout(() => setShowResults(true), 350);
    return () => window.clearTimeout(t);
  }, [resolved, cinemaDone, clashEvents.length]);

  const hoverRole = useMemo(() => {
    if (selectedHandId) {
      return myHand.find((c) => c.cardId === selectedHandId)?.role;
    }
    if (selectedFrontId) {
      return myFront.find((c) => c.cardId === selectedFrontId)?.role;
    }
    return null;
  }, [selectedHandId, selectedFrontId, myHand, myFront]);

  const stanceLabel = useMemo(() => {
    const open = state?.openingStance?.[factionId];
    if (open) return open;
    if (!myStance) return null;
    return COMBAT_STANCE_LABELS[myStance as CombatStanceId] || myStance;
  }, [myStance, state?.openingStance, factionId]);

  const orderCooldown = useMemo(() => {
    const last = state?.stanceOrderUsedRound?.[factionId] ?? 0;
    if (!last) return 0;
    const cd = 2;
    return Math.max(0, cd - ((state?.round ?? 1) - last));
  }, [state, factionId]);

  const myLosses = useMemo(() => {
    const byFac = engagement.result?.lossesByFaction?.[factionId];
    if (byFac?.length) return byFac;
    const idx = engagement.sides.findIndex((s) => s.factionId === factionId);
    if (idx === 0) return engagement.result?.lossesA || [];
    if (idx === 1) return engagement.result?.lossesB || [];
    return [];
  }, [engagement, factionId]);

  const trophies = engagement.result?.trophies;
  const iWon = state?.winnerFactionId === factionId;
  const draw = resolved && !state?.winnerFactionId;

  const post = async (path: string, body: Record<string, unknown> = {}) => {
    if (postLock.current) return false;
    postLock.current = true;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/engagements/${engagement.id}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ factionId, password, ...body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (data && (data.error || data.message)) ||
            `Ошибка ${res.status}`,
        );
      }
      if (data.engagement) onUpdated?.(data.engagement as ViewerEngagement);
      if (data.pairResult) {
        setResolveFlash(
          data.pairResult.loserCard
            ? `Поражение стека`
            : `Урон ${data.pairResult.damageDealt ?? ""}`,
        );
        window.setTimeout(() => setResolveFlash(null), 900);
      }
      if (data.clashed) {
        setResolveFlash("Стычка!");
        window.setTimeout(() => setResolveFlash(null), 700);
      }
      setSelectedHandId(null);
      setSelectedFrontId(null);
      setTarget(null);
      return true;
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      postLock.current = false;
      setBusy(false);
    }
  };

  /** Cards that can legally strike right now (energy gate). */
  const dropAccepts = useMemo(() => {
    if (!canAct) return [];
    const ids: string[] = [];
    for (const c of myHand) {
      const cost =
        (c as BattleCard & { energyCost?: number }).energyCost ??
        cardEnergyCost(c.role);
      if (energy >= cost) ids.push(c.cardId);
    }
    for (const c of myFront) {
      const cost = frontStrikeCost(state, factionId, c.cardId);
      if (energy >= cost) ids.push(c.cardId);
    }
    return ids;
  }, [canAct, myHand, myFront, energy, state, factionId]);

  const handAccepts = useMemo(() => {
    if (!canAct || myFront.length >= maxFront) return [];
    return myHand
      .filter((c) => {
        const cost =
          (c as BattleCard & { energyCost?: number }).energyCost ??
          cardEnergyCost(c.role);
        return energy >= cost;
      })
      .map((c) => c.cardId);
  }, [canAct, myHand, myFront.length, maxFront, energy]);

  const myBlock = state?.block?.[factionId] ?? 0;
  const oppBlock = state?.block?.[oppId] ?? 0;
  const oppIntent = state?.intents?.[oppId] ?? null;

  const attackerCard = useMemo(() => {
    if (selectedHandId) return myHand.find((c) => c.cardId === selectedHandId);
    if (selectedFrontId) return myFront.find((c) => c.cardId === selectedFrontId);
    return null;
  }, [selectedHandId, selectedFrontId, myHand, myFront]);

  const previewFor = (defender: BattleCard | null) => {
    if (!attackerCard || !canAct) return null;
    const st = state?.statuses?.[attackerCard.cardId];
    const incoming = defender
      ? state?.statuses?.[defender.cardId]?.vulnerable
        ? 1.5
        : 1
      : 1;
    return estimateStrikePreview(attackerCard, defender, {
      atkBuff: state?.buffs?.[factionId],
      outgoingMult: st?.weak ? 0.75 : 1,
      incomingMult: incoming,
      defBuff: state?.buffs?.[oppId],
    });
  };

  const deployCard = (cardId: string) => {
    if (!canAct) return;
    void post("play_card", { cardId, mode: "deploy" });
  };

  const braceCard = (cardId: string) => {
    if (!canAct) return;
    void post("play_card", { cardId, mode: "brace" });
  };

  const focusCard = (cardId: string, targetId: string) => {
    if (!canAct) return;
    void post("play_card", { cardId, mode: "focus", targetId });
  };

  const reorderFront = (cardId: string, toIndex: number) => {
    if (!canAct) return;
    void post("reorder_front", { cardId, toIndex });
  };

  const retreatBattle = () => {
    if (resolved || busy || busyProp) return;
    if (!window.confirm("Отступить? Противник побеждает, но флот сохранится лучше.")) {
      return;
    }
    void post("retreat_card", {});
  };

  const strikeWith = (attackerId: string, targetId: string) => {
    if (!canAct || postLock.current) return;
    const fromHand = myHand.find((c) => c.cardId === attackerId);
    if (fromHand) {
      const cost =
        (fromHand as BattleCard & { energyCost?: number }).energyCost ??
        cardEnergyCost(fromHand.role);
      if (energy < cost) {
        setMsg(`Недостаточно энергии (нужно ${cost})`);
        return;
      }
      void post("play_card", {
        cardId: attackerId,
        mode: "strike",
        targetId,
      });
      return;
    }
    if (myFront.some((c) => c.cardId === attackerId)) {
      const cost = frontStrikeCost(state, factionId, attackerId);
      if (energy < cost) {
        setMsg(
          cost > 0
            ? "Недостаточно энергии для повторного удара — «Готово»"
            : "Недостаточно энергии",
        );
        return;
      }
      void post("strike_front", { cardId: attackerId, targetId });
    }
  };

  const onCardDropped = (cardId: string, zoneId: string) => {
    if (!canAct) return;
    if (zoneId === "my-front") {
      if (myHand.some((c) => c.cardId === cardId)) deployCard(cardId);
      return;
    }
    if (zoneId === "opp-base") {
      strikeWith(cardId, "base");
      return;
    }
    if (zoneId.startsWith("opp-card:")) {
      strikeWith(cardId, zoneId.slice("opp-card:".length));
    }
  };

  const strikeSelected = () => {
    if (!canAct || !target) return;
    const targetId = target.kind === "base" ? "base" : target.cardId;
    if (selectedHandId) {
      strikeWith(selectedHandId, targetId);
      return;
    }
    if (selectedFrontId) {
      strikeWith(selectedFrontId, targetId);
    }
  };

  const turnTone: "mine" | "wait" | "clash" | "done" = resolved
    ? "done"
    : clashPlaying || phase === "clash"
      ? "clash"
      : canAct
        ? "mine"
        : iReady
          ? "wait"
          : "wait";

  const readyUp = () => {
    if (iReady) return;
    void post("ready_card", {});
  };

  const stanceOrder = () => {
    if (!canAct || orderCooldown > 0) return;
    void post("stance_order", { stance: myStance || "hold" });
  };

  const drawOne = () => {
    if (!canAct || myDeck.length <= 0 || energy < 1) return;
    void post("draw_card", {});
  };

  if (!state) {
    return (
      <div className="cbt-table cbt-table--empty" role="status">
        <header className="cbt-head">
          <h2>Карточный бой</h2>
          {onClose && (
            <button type="button" className="btn ghost" onClick={onClose}>
              Закрыть
            </button>
          )}
        </header>
        <p className="hint">Колоды ещё не розданы — дождитесь подготовки боя.</p>
        {msg && <p className="hint eng-msg">{msg}</p>}
      </div>
    );
  }

  const statusLine = resolved
    ? "завершён"
    : clashPlaying
      ? "стычка…"
      : iReady && !theyReady
        ? "ждём противника…"
        : theyReady && !iReady
          ? "противник готов — ваш ход"
          : phase === "clash"
            ? "стычка…"
            : "фаза планирования";

  const turnBanner =
    turnTone === "mine"
      ? "Ваш ход"
      : turnTone === "clash"
        ? "Стычка"
        : turnTone === "done"
          ? "Бой окончен"
          : iReady && !theyReady
            ? "Ждём противника"
            : theyReady && !iReady
              ? "Противник готов — ходите"
              : "Ожидание";

  if (showResults && resolved) {
    const word = draw ? "Ничья" : iWon ? "Победа" : "Поражение";
    const tone = draw ? "warm" : iWon ? "good" : "bad";
    return (
      <div
        className="cbt-table cbt-table--results fx-spotlight"
        role="dialog"
        aria-label="Итог боя"
        {...spot.bind}
      >
        <BackgroundBeamsLite className="cbt-results-beams" />
        <div className="cbt-results">
          <p className="hint">Тактический залп · итог</p>
          <h2 className="cbt-results__title">
            <FlipWords word={word} tone={tone} />
          </h2>
          {!draw && (
            <p className="hint">
              {iWon
                ? "Ваши силы удержали поле."
                : `Победитель: ${factionNames[state.winnerFactionId || ""] || "—"}`}
            </p>
          )}

          <section className="cbt-results__block">
            <h3>Ваши потери</h3>
            {myLosses.length ? (
              <ul>
                {myLosses.map((l, i) => (
                  <li key={`${l.defId}-${i}`}>
                    {resolveShipOrUnitName(l.defId)} −{l.lost}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="hint">без потерь состава</p>
            )}
          </section>

          {trophies && iWon && (
            <section className="cbt-results__block cbt-results__trophies">
              <h3>Трофеи</h3>
              <ul>
                {trophies.metal != null && (
                  <li>Обломки · металл +{trophies.metal}</li>
                )}
                {trophies.cognitio != null && (
                  <li>
                    Разведданные · знание +{trophies.cognitio}
                    {(trophies.styleCognitio ?? 0) > 0
                      ? ` (стиль +${trophies.styleCognitio})`
                      : ""}
                  </li>
                )}
                {trophies.intelBump != null && (
                  <li>Разведка системы +{trophies.intelBump}</li>
                )}
                {(trophies.loyaltyHit ?? 0) > 0 && (
                  <li>Лояльность системы врага −{trophies.loyaltyHit}</li>
                )}
              </ul>
              {Array.isArray(trophies.styleBanners) &&
                trophies.styleBanners.length > 0 && (
                  <div className="cbt-results__styles">
                    {trophies.styleBanners.map((b: string, i: number) => (
                      <span key={`${b}-${i}`} className="cbt-style-banner">
                        {b}
                      </span>
                    ))}
                  </div>
                )}
            </section>
          )}

          <button
            type="button"
            className="btn primary cbt-results__cta"
            onClick={onClose}
          >
            На карту
          </button>
        </div>
      </div>
    );
  }

  return (
    <CardBoard>
      <div
        className={[
          "cbt-table",
          "cbt-table--skirmish",
          resolved ? "is-resolved" : "",
          `cbt-table--turn-${turnTone}`,
          canAct ? "is-my-turn" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        role="region"
        aria-label="Карточный бой"
        aria-live="polite"
      >
        <BackgroundBeamsLite className="cbt-table-beams" />
        <header className="cbt-head">
          <div>
            <h2>Тактический залп</h2>
            <p className="hint">
              Раунд {state.round} · {statusLine}
              {stanceLabel ? ` · поза: ${stanceLabel}` : ""}
            </p>
          </div>
          <div className="cbt-head-badges">
            <span
              className={`cbt-turn-pill cbt-turn-pill--${turnTone}`}
              role="status"
            >
              {turnBanner}
            </span>
            <EnergyPips current={energy} max={maxEnergy} />
            {stanceLabel && (
              <span className="cbt-stance-badge" title="Стартовый бафф от позы">
                {stanceLabel}
              </span>
            )}
            {onClose && (
              <button type="button" className="btn ghost" onClick={onClose}>
                Свернуть
              </button>
            )}
          </div>
        </header>

        <AnimatePresence>
          {commitFlash && (
            <motion.div
              key="commit"
              className="cbt-commit"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
            >
              COMMIT · стычка
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {clashPlaying && (
            <ClashCinema
              events={clashEvents}
              step={clashStep}
              factionNames={factionNames}
              nameOf={nameOf}
            />
          )}
        </AnimatePresence>

        <div className="cbt-layout">
          <div className="cbt-field">
            <DropZone
              zoneId="opp-base"
              className="cbt-drop-target cbt-drop-target--base"
              accepts={dropAccepts}
              armWhileDragging={canAct}
              highlight={target?.kind === "base"}
              onDrop={(cardId) => onCardDropped(cardId, "opp-base")}
              label={canAct ? "Бросьте сюда → удар по базе" : undefined}
            >
              <BaseBar
                label={factionNames[oppId] || "Противник"}
                hp={oppBase}
                max={oppBaseMax}
                tone="opp"
                block={oppBlock}
                selectable={canAct && !!(selectedHandId || selectedFrontId)}
                selected={target?.kind === "base"}
                onSelect={() => setTarget({ kind: "base" })}
                previewDmg={
                  target?.kind === "base" || attackerCard
                    ? previewFor(null)
                    : null
                }
              />
            </DropZone>

            <section
              className={`cbt-side cbt-side--opp${turnTone === "wait" ? " is-focus" : ""}`}
              aria-label="Противник"
            >
              <div className="cbt-side-meta">
                <strong>{factionNames[oppId] || oppId || "Противник"}</strong>
                <span className="hint">
                  рука {oppHandCount}
                  {theyReady ? " · готов" : ""}
                  {iReady && !theyReady ? " · синхр…" : ""}
                </span>
              </div>
              {oppIntent && !theyReady && (
                <p className="cbt-intent" role="status">
                  Intent: {intentLabel(oppIntent)}
                </p>
              )}
              {theyReady && (
                <p className="cbt-intent cbt-intent--ready" role="status">
                  Готов к стычке
                </p>
              )}
              <div className="cbt-opp-hand" aria-hidden>
                {Array.from({ length: Math.min(oppHandCount, 6) }).map((_, i) => (
                  <motion.div
                    key={i}
                    className="cbt-card-back"
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04, duration: 0.2 }}
                  />
                ))}
              </div>
              <div className="cbt-frontline cbt-frontline--opp">
                <AnimatePresence mode="popLayout">
                  {oppFront.map((c, idx) => {
                    const tone = hoverRole
                      ? hintTone(hoverRole, c.role)
                      : "neutral";
                    const selected =
                      target?.kind === "card" && target.cardId === c.cardId;
                    const zoneId = `opp-card:${c.cardId}`;
                    const cinemaHit =
                      cinemaEv &&
                      (cinemaEv.targetId === c.cardId ||
                        cinemaEv.splashTargetId === c.cardId ||
                        cinemaEv.cardId === c.cardId);
                    const cinemaLane =
                      cinemaEv &&
                      typeof cinemaEv.laneIndex === "number" &&
                      cinemaEv.laneIndex === idx;
                    return (
                      <DropZone
                        key={c.cardId}
                        zoneId={zoneId}
                        className={`cbt-drop-target cbt-drop-target--card cbt-target-${tone}`}
                        accepts={dropAccepts}
                        armWhileDragging={canAct}
                        highlight={selected}
                        onDrop={(cardId) => onCardDropped(cardId, zoneId)}
                      >
                        <motion.div
                          className={[
                            "cbt-front-card",
                            selected ? "is-selected" : "",
                            cinemaHit ? "is-cinema-hit" : "",
                            cinemaLane ? "is-cinema-lane" : "",
                            cinemaEv?.killedTarget &&
                            cinemaEv.targetId === c.cardId
                              ? "is-cinema-kill"
                              : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          layout
                          initial={{ opacity: 0, y: -16, scale: 0.9 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, x: 80, rotate: 12 }}
                          transition={{ duration: 0.28 }}
                          onClick={() => {
                            if (!canAct) return;
                            if (selectedHandId || selectedFrontId) {
                              setTarget({ kind: "card", cardId: c.cardId });
                            }
                          }}
                        >
                          <DragCard
                            cardId={c.cardId}
                            title={resolveShipOrUnitName(c.defId)}
                            subtitle={roleLabel(c.role)}
                            pinned
                            accent="var(--signal-attack)"
                          >
                            <CardFace
                              card={c}
                              statuses={state.statuses?.[c.cardId]}
                              previewDmg={
                                target?.kind === "card" &&
                                target.cardId === c.cardId
                                  ? previewFor(c)
                                  : attackerCard
                                    ? previewFor(c)
                                    : null
                              }
                            />
                            {canAct && (
                              <p className="cbt-drop-hint">тянуть сюда</p>
                            )}
                          </DragCard>
                        </motion.div>
                      </DropZone>
                    );
                  })}
                </AnimatePresence>
                {!oppFront.length && (
                  <span className="hint cbt-front-empty">
                    фронт пуст — тяните карту на базу
                  </span>
                )}
              </div>
            </section>

            <div className="cbt-vs" aria-hidden>
              {resolveFlash ? (
                <motion.span
                  key={resolveFlash}
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1.15, opacity: 1 }}
                  className="cbt-flash"
                >
                  {resolveFlash}
                </motion.span>
              ) : (
                <span>⚔</span>
              )}
            </div>

            <section
              className={`cbt-side cbt-side--me${turnTone === "mine" ? " is-focus" : ""}`}
              aria-label="Вы"
            >
              <DropZone
                zoneId="my-front"
                className="cbt-frontline cbt-frontline--me"
                label={`Ваш фронт (${myFront.length}/${maxFront}) · бросок = выставить`}
                accepts={handAccepts}
                armWhileDragging={canAct && myFront.length < maxFront}
                onDrop={(cardId) => onCardDropped(cardId, "my-front")}
              >
                <AnimatePresence mode="popLayout">
                  {myFront.map((c, idx) => {
                    const fCost = frontStrikeCost(state, factionId, c.cardId);
                    const canStrikeFront = canAct && energy >= fCost;
                    const freeLeft = state.reorderFreeLeft?.[factionId] ?? 0;
                    const canReorder =
                      canAct &&
                      myFront.length > 1 &&
                      (freeLeft > 0 || energy >= 1);
                    const cinemaHit =
                      cinemaEv &&
                      (cinemaEv.cardId === c.cardId ||
                        cinemaEv.targetId === c.cardId);
                    const cinemaLane =
                      cinemaEv &&
                      typeof cinemaEv.laneIndex === "number" &&
                      cinemaEv.laneIndex === idx;
                    return (
                    <motion.div
                      key={c.cardId}
                      className={[
                        "cbt-front-card",
                        "cbt-front-card--mine",
                        selectedFrontId === c.cardId ? "is-selected" : "",
                        keywordsForCard(
                          c as BattleCard & { bonusKeywords?: string[] },
                        ).includes("escort")
                          ? "is-escort"
                          : "",
                        cinemaHit ? "is-cinema-hit" : "",
                        cinemaLane ? "is-cinema-lane" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      layout
                      initial={{ opacity: 0, y: 16, scale: 0.9 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, x: -80, rotate: -12 }}
                      transition={{ duration: 0.28 }}
                    >
                      <DragCard
                        cardId={c.cardId}
                        title={
                          (c as BattleCard & { tacticLabel?: string })
                            .tacticLabel || resolveShipOrUnitName(c.defId)
                        }
                        subtitle={`${roleLabel(c.role)} · #${idx + 1}`}
                        pinned={!canStrikeFront || busy || busyProp}
                        tilt={canStrikeFront}
                        returnHome
                        accent="var(--accent)"
                        onDragEnd={() => {
                          setSelectedFrontId(c.cardId);
                          setSelectedHandId(null);
                        }}
                      >
                        <CardFace
                          card={c}
                          showHints
                          statuses={state.statuses?.[c.cardId]}
                        />
                        {canStrikeFront && (
                          <p className="cbt-drop-hint">
                            на врага → удар
                            {fCost === 0 ? " · free" : " · ⚡1"}
                          </p>
                        )}
                        {canAct && !canStrikeFront && (
                          <p className="cbt-drop-hint">нет энергии</p>
                        )}
                        {canReorder && (
                          <div className="cbt-card-actions">
                            <button
                              type="button"
                              className="btn tiny ghost"
                              disabled={idx <= 0 || busy || busyProp}
                              onClick={() => reorderFront(c.cardId, idx - 1)}
                              title="Слот левее"
                            >
                              ←
                            </button>
                            <button
                              type="button"
                              className="btn tiny ghost"
                              disabled={
                                idx >= myFront.length - 1 || busy || busyProp
                              }
                              onClick={() => reorderFront(c.cardId, idx + 1)}
                              title="Слот правее"
                            >
                              →
                            </button>
                          </div>
                        )}
                      </DragCard>
                    </motion.div>
                    );
                  })}
                </AnimatePresence>
                {!myFront.length && (
                  <span className="hint cbt-front-empty">
                    {canAct
                      ? "Тяните карту из руки сюда или сразу на врага"
                      : "пусто"}
                  </span>
                )}
              </DropZone>

              <BaseBar
                label="Ваша база"
                hp={myBase}
                max={myBaseMax}
                tone="me"
                block={myBlock}
              />

              <div className="cbt-hand-row">
                <StackPile
                  label="Колода"
                  count={myDeck.length}
                  faceDown
                  onClick={
                    canAct && myDeck.length > 0 && energy >= 1
                      ? drawOne
                      : undefined
                  }
                />
                <div
                  className={`cbt-hand${canAct ? " is-active-hand" : ""}`}
                  role="list"
                >
                  {myHand.map((c, idx) => {
                    const cost =
                      (c as BattleCard & { energyCost?: number }).energyCost ??
                      cardEnergyCost(c.role);
                    const afford = energy >= cost;
                    const title =
                      (c as BattleCard & { tacticLabel?: string }).tacticLabel ||
                      resolveShipOrUnitName(c.defId);
                    const fan = (idx - (myHand.length - 1) / 2) * 3.5;
                    return (
                      <motion.div
                        key={c.cardId}
                        className={`cbt-hand-slot${selectedHandId === c.cardId ? " is-selected" : ""}${!afford ? " is-expensive" : ""}`}
                        role="listitem"
                        style={{ "--cbt-fan": `${fan}deg` } as CSSProperties}
                        initial={{ opacity: 0, y: 28, rotate: fan }}
                        animate={{ opacity: 1, y: 0, rotate: fan }}
                        exit={{ opacity: 0, y: 20 }}
                        transition={{
                          delay: Math.min(idx * 0.04, 0.2),
                          duration: 0.28,
                        }}
                        whileHover={
                          canAct && afford
                            ? { y: -10, scale: 1.04, rotate: 0 }
                            : undefined
                        }
                      >
                        <DragCard
                          cardId={c.cardId}
                          title={title}
                          subtitle={`${roleLabel(c.role)} · ⚡${cost}`}
                          accent="var(--accent)"
                          pinned={!canAct || busy || busyProp || !afford}
                          tilt={canAct && afford}
                          returnHome
                          onDragEnd={() => {
                            setSelectedHandId(c.cardId);
                            setSelectedFrontId(null);
                          }}
                        >
                          <CardFace card={c} showHints />
                          {canAct && (
                            <div className="cbt-card-actions">
                              <button
                                type="button"
                                className="btn tiny"
                                disabled={
                                  busy ||
                                  busyProp ||
                                  !afford ||
                                  myFront.length >= maxFront
                                }
                                onClick={() => deployCard(c.cardId)}
                              >
                                На фронт
                              </button>
                              <button
                                type="button"
                                className="btn tiny ghost"
                                disabled={busy || busyProp || !afford}
                                onClick={() => braceCard(c.cardId)}
                                title="Сбросить в Block"
                              >
                                Оплот
                              </button>
                              <button
                                type="button"
                                className={`btn tiny${selectedHandId === c.cardId ? " primary" : " ghost"}`}
                                disabled={busy || busyProp || energy < 1}
                                onClick={() => {
                                  setSelectedHandId(c.cardId);
                                  setSelectedFrontId(null);
                                }}
                                title="Атака или Focus по цели"
                              >
                                Атака
                              </button>
                              {selectedHandId === c.cardId &&
                                target?.kind === "card" && (
                                  <button
                                    type="button"
                                    className="btn tiny"
                                    disabled={busy || busyProp || energy < 1}
                                    onClick={() =>
                                      focusCard(c.cardId, target.cardId)
                                    }
                                    title="Weak на цели"
                                  >
                                    Фокус
                                  </button>
                                )}
                            </div>
                          )}
                        </DragCard>
                      </motion.div>
                    );
                  })}
                  {!myHand.length && <p className="hint">Рука пуста</p>}
                </div>
                <StackPile label="Сброс" count={myDiscard.length} />
              </div>

              <div className="cbt-actions">
                {(selectedHandId || selectedFrontId) && (
                  <button
                    type="button"
                    className="btn primary"
                    disabled={!canAct || !target || resolved}
                    onClick={strikeSelected}
                  >
                    Ударить{" "}
                    {target?.kind === "base"
                      ? "по базе"
                      : target
                        ? "по цели"
                        : "(выберите цель)"}
                  </button>
                )}
                <button
                  type="button"
                  className="btn primary"
                  disabled={!canAct || resolved || iReady}
                  onClick={readyUp}
                >
                  Готово
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={!canAct || resolved || orderCooldown > 0}
                  onClick={stanceOrder}
                  title={
                    orderCooldown > 0
                      ? `Перезарядка ${orderCooldown} р.`
                      : "Усилить эффект позы"
                  }
                >
                  Приказ
                  {orderCooldown > 0 ? ` (${orderCooldown})` : ""}
                </button>
                <button
                  type="button"
                  className="btn ghost cbt-retreat"
                  disabled={resolved || busy || busyProp || clashPlaying}
                  onClick={retreatBattle}
                  title="Сдаться: противник побеждает, потери меньше"
                >
                  Отступить
                </button>
              </div>
              <p className="hint cbt-help">
                Фронт до {maxFront}, энергия {maxEnergy}/раунд, добор 2 (рука
                ≤7). Escort пал → Vulnerable. Overwhelm: волна или прорыв базы.
                Support → карта/Block. Стычка в линии одновременная.
              </p>
            </section>
          </div>

          <aside className="cbt-sidebar">
            <h3>Лог</h3>
            <LogList log={state.log || []} factionNames={factionNames} />
          </aside>
        </div>

        {msg && (
          <p className="hint eng-msg cbt-error" role="alert">
            {msg}
          </p>
        )}
      </div>
    </CardBoard>
  );
}
