import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Crown, UserRound } from "lucide-react";
import type {
  FactionNpc,
  InternalBloc,
  ViewerPayload,
} from "../state/types";
import { getCachedContent } from "../state/contentCatalog";
import { useViewerPanelFocusStore } from "../state/viewerPanelFocusStore";
import {
  listCouncilPortfolios,
  portfolioLabelForSeat,
  resolveSeatPortfolioId,
  resolveSeatTitle,
  systemHasGovernor,
} from "../state/courtGovernance";
import { npcPostingLabel, npcRoleLabel } from "../state/displayLabels";
import { DropZone } from "../ui/DropZone";
import { DragCard } from "../ui/DragCard";
import { useRipple, useSpotlight } from "../ui/aceternityFx";
import { NpcCard } from "./NpcCard";
import { ConfirmModal } from "./shared/ConfirmModal";
import { isInputFocused } from "./hooks/isInputFocused";
import {
  CourtAttentionStrip,
  CourtFieldView,
  CourtHousesView,
  CourtNationsView,
  CourtNavTabs,
  buildCourtAttention,
  courtTabById,
  type CourtTabId,
} from "./court";
import { courtSeatOffset } from "./court/courtSeatLayout";

export type CourtPanelProps = {
  payload: ViewerPayload;
  password: string;
  onMsg?: (m: string | null) => void;
  onGiveNpcTask?: (
    npcId: string,
    opts: {
      taskLabel: string;
      etaTurn: number;
      linkedQuestId?: string;
      taskId?: string;
    },
  ) => void | Promise<boolean | void>;
  onAssignPosting?: (
    npcId: string,
    opts: {
      kind: "governor" | "commander" | "admiral";
      systemId?: string;
      legionId?: string;
      fleetId?: string;
      forceId?: string;
    },
  ) => void | Promise<boolean | void>;
  onRecallPosting?: (npcId: string) => void | Promise<boolean | void>;
  onSeatCouncil?: (
    npcId: string,
    seatId: string,
  ) => void | Promise<boolean | void>;
  onUnseatCouncil?: (npcId: string) => void | Promise<boolean | void>;
  onSetSeatPortfolio?: (
    seatId: string,
    portfolioId: string,
  ) => void | Promise<boolean | void>;
  onAssignBlocLeader?: (
    npcId: string,
    blocId: string,
  ) => void | Promise<boolean | void>;
  onAssignRaceLeader?: (
    npcId: string,
    raceId: string,
    title?: string,
  ) => void | Promise<boolean | void>;
  factionColor?: string;
  layout?: "panel" | "fill";
  /** Phone sheet: hide decorative FX, stack columns. */
  compact?: boolean;
};

type SeatDef = {
  id: string;
  label: string;
  kind?: string;
  roles?: string[];
  angleDeg?: number;
  defaultUnlocked?: boolean;
  defaultPortfolio?: string;
  unlockHint?: string;
};

const FALLBACK_SEATS: SeatDef[] = [
  {
    id: "seat.ruler",
    label: "Правитель",
    kind: "ruler",
    roles: ["ruler"],
    angleDeg: -90,
  },
  {
    id: "seat.strategist",
    label: "Советник",
    kind: "advisor",
    defaultPortfolio: "strategy",
    angleDeg: -38,
  },
  {
    id: "seat.warlord",
    label: "Советник",
    kind: "advisor",
    defaultPortfolio: "military",
    angleDeg: 38,
  },
  {
    id: "seat.priest",
    label: "Советник",
    kind: "advisor",
    defaultPortfolio: "faith",
    angleDeg: -142,
  },
  {
    id: "seat.agent",
    label: "Советник",
    kind: "advisor",
    defaultPortfolio: "intel",
    angleDeg: 142,
  },
  {
    id: "seat.architect",
    label: "Советник",
    kind: "advisor",
    defaultPortfolio: "infrastructure",
    angleDeg: 180,
  },
  {
    id: "seat.at_large",
    label: "Советник",
    kind: "advisor",
    defaultPortfolio: "interior",
    angleDeg: 90,
  },
];

function seatStyle(angleDeg: number): CSSProperties {
  const { left, top } = courtSeatOffset(angleDeg);
  return { left: `${left}%`, top: `${top}%` };
}

function isRulerSeat(
  seat: Pick<SeatDef, "id" | "kind"> | string | null | undefined,
) {
  if (seat == null) return false;
  if (typeof seat === "string") return seat === "seat.ruler";
  return seat.kind === "ruler" || seat.id === "seat.ruler";
}

function CourtBeams({ accent }: { accent?: string }) {
  const stroke = accent || "var(--accent)";
  return (
    <div className="fx-beams-lite court-beams" aria-hidden>
      <svg
        className="fx-beams-lite__svg"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <path
          className="fx-beams-lite__path"
          d="M0 20 Q 40 10, 100 28"
          style={{ stroke, animationDuration: "9s" }}
        />
        <path
          className="fx-beams-lite__path"
          d="M0 55 Q 55 70, 100 48"
          style={{ stroke, animationDuration: "12s", opacity: 0.55 }}
        />
        <path
          className="fx-beams-lite__path"
          d="M0 82 Q 35 60, 100 78"
          style={{ stroke, animationDuration: "14s", opacity: 0.4 }}
        />
      </svg>
    </div>
  );
}

function FlipHint({ word }: { word: string }) {
  return (
    <span className="court-flip-hint flip-words" aria-hidden>
      <AnimatePresence mode="wait">
        <motion.span
          key={word}
          className="flip-words__word"
          initial={{ y: "110%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "-110%", opacity: 0 }}
          transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
        >
          {word}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function RulerToken({
  npc,
  accent,
  selected,
  onClick,
}: {
  npc: FactionNpc;
  accent?: string;
  selected?: boolean;
  onClick?: () => void;
}) {
  const spot = useSpotlight();
  return (
    <button
      type="button"
      className={`court-ruler-token fx-spotlight${selected ? " is-selected" : ""}`}
      onClick={onClick}
      title="Персонаж игрока · трон закреплён"
      {...spot.bind}
      style={
        {
          ["--seat-accent" as string]: accent || "var(--accent)",
          ["--fx-spot-color" as string]: accent || "var(--accent)",
        } as CSSProperties
      }
    >
      <span className="court-ruler-token__crown" aria-hidden>
        <Crown size={14} />
      </span>
      {npc.avatarUrl ? (
        <img src={npc.avatarUrl} alt="" className="court-seat-token__av" />
      ) : (
        <span className="court-seat-token__av court-seat-token__av--ph" aria-hidden>
          {(npc.name || "?").slice(0, 1).toUpperCase()}
        </span>
      )}
      <span className="court-ruler-token__name">{npc.name}</span>
      <span className="sr-only">Правитель (игрок)</span>
    </button>
  );
}

function NpcToken({
  npc,
  accent,
  selected,
  dimmed,
  bloc,
  onClick,
  onDoubleClick,
  onDragToZone,
}: {
  npc: FactionNpc;
  accent?: string;
  selected?: boolean;
  dimmed?: boolean;
  bloc?: InternalBloc | null;
  onClick?: () => void;
  onDoubleClick?: () => void;
  onDragToZone?: (zoneId: string) => void;
}) {
  const spot = useSpotlight();
  const rip = useRipple();
  return (
    <DragCard
      cardId={npc.id}
      title={npc.name}
      subtitle={npc.currentTask ? "в работе" : undefined}
      accent={bloc?.color || accent}
      tilt={false}
      className={`court-seat-drag${selected ? " is-selected" : ""}${
        dimmed ? " is-dimmed" : ""
      }`}
      icon={
        npc.avatarUrl ? (
          <img src={npc.avatarUrl} alt="" className="court-seat-token__av" />
        ) : (
          <span
            className="court-seat-token__av court-seat-token__av--ph"
            aria-hidden
          >
            {(npc.name || "?").slice(0, 1).toUpperCase()}
          </span>
        )
      }
      onDropZone={onDragToZone}
    >
      <button
        type="button"
        className="court-seat-token__hit fx-spotlight"
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        title="Клик — карточка · двойной клик — в пул · drag — слот/пул"
        {...spot.bind}
        {...rip.bind}
        style={
          {
            ["--seat-accent" as string]:
              bloc?.color || accent || "var(--accent)",
            ["--fx-spot-color" as string]:
              bloc?.color || accent || "var(--accent)",
          } as CSSProperties
        }
      >
        {bloc ? (
          <span
            className="court-seat-token__bloc"
            style={{ background: bloc.color || "var(--accent)" }}
            title={bloc.name}
            aria-hidden
          />
        ) : null}
        <span className="sr-only">Открыть {npc.name}</span>
      </button>
    </DragCard>
  );
}

function EmptySeatButton({
  disabled,
  onClick,
}: {
  disabled?: boolean;
  onClick: () => void;
}) {
  const rip = useRipple();
  return (
    <button
      type="button"
      className="court-seat__empty fx-moving-border"
      onClick={onClick}
      disabled={disabled}
      {...rip.bind}
    >
      <UserRound size={18} aria-hidden />
      <span>Посадить…</span>
    </button>
  );
}

/** Unified court workspace: modes share one pool + drop context. */
export function CourtPanel({
  payload,
  onGiveNpcTask,
  onAssignPosting,
  onRecallPosting,
  onSeatCouncil,
  onUnseatCouncil,
  onSetSeatPortfolio,
  onAssignBlocLeader,
  onAssignRaceLeader,
  factionColor,
  layout = "fill",
  compact = false,
}: CourtPanelProps) {
  const [taskBusy, setTaskBusy] = useState(false);
  const [selectedNpcId, setSelectedNpcId] = useState<string | null>(null);
  const [targetSeatId, setTargetSeatId] = useState<string | null>(null);
  const [fieldTarget, setFieldTarget] = useState<{
    kind: "governor" | "commander" | "admiral";
    id: string;
  } | null>(null);
  const [nationTarget, setNationTarget] = useState<string | null>(null);
  const [houseTarget, setHouseTarget] = useState<string | null>(null);
  const [pendingPost, setPendingPost] = useState<{
    npcId: string;
    opts: {
      kind: "governor" | "commander" | "admiral";
      systemId?: string;
      legionId?: string;
      fleetId?: string;
      forceId?: string;
    };
  } | null>(null);
  const [hoverSeatId, setHoverSeatId] = useState<string | null>(null);
  const [courtTab, setCourtTab] = useState<CourtTabId>("council");
  const activeTab = courtTabById(courtTab);

  const fac = payload.world.factions.find((f) => f.id === payload.factionId);
  const content = getCachedContent();
  const traitCatalog = content?.npc_traits?.traits ?? {};
  const accent = factionColor ?? fac?.color;

  const tableSpot = useSpotlight();
  const dossierSpot = useSpotlight();

  const portfolios = useMemo(
    () => listCouncilPortfolios(content),
    [content],
  );

  const seats = useMemo((): SeatDef[] => {
    const fromContent = Object.values(content?.council_seats?.seats ?? {});
    const all = (fromContent.length ? fromContent : FALLBACK_SEATS) as SeatDef[];
    const unlocked = new Set(
      fac?.council?.unlockedSeatIds?.length
        ? fac.council.unlockedSeatIds
        : all
            .filter((s) => s.defaultUnlocked !== false)
            .map((s) => s.id),
    );
    const locked = new Set(fac?.council?.lockedSeatIds ?? []);
    return all
      .filter((s) => unlocked.has(s.id) || locked.has(s.id))
      .map((s) => ({
        ...s,
        label: resolveSeatTitle(s, fac?.council),
      }));
  }, [content?.council_seats?.seats, fac?.council]);

  const lockedSeatIds = useMemo(
    () => new Set(fac?.council?.lockedSeatIds ?? []),
    [fac?.council?.lockedSeatIds],
  );

  const blocsById = useMemo(() => {
    const map = new Map<string, InternalBloc>();
    for (const b of fac?.internalBlocs ?? []) map.set(b.id, b);
    return map;
  }, [fac?.internalBlocs]);

  const npcs = useMemo(
    () =>
      (fac?.npcs ?? []).filter(
        (n) => n.status !== "hidden" && n.status !== "dead",
      ),
    [fac?.npcs],
  );

  const courtFocusNpcId = useViewerPanelFocusStore((s) => s.courtFocusNpcId);
  const setCourtFocusNpcId = useViewerPanelFocusStore(
    (s) => s.setCourtFocusNpcId,
  );
  useEffect(() => {
    if (!courtFocusNpcId) return;
    if (npcs.some((n) => n.id === courtFocusNpcId)) {
      setSelectedNpcId(courtFocusNpcId);
    }
    setCourtFocusNpcId(null);
  }, [courtFocusNpcId, npcs, setCourtFocusNpcId]);

  const rulerNpc = useMemo(() => {
    const id = fac?.rulerNpcId;
    if (id) {
      const found = npcs.find((n) => n.id === id);
      if (found) return found;
    }
    return (
      npcs.find((n) => n.isPlayerRuler) ||
      npcs.find((n) => isRulerSeat(n.councilSeat)) ||
      null
    );
  }, [fac?.rulerNpcId, npcs]);

  const bySeat = useMemo(() => {
    const map = new Map<string, FactionNpc>();
    for (const n of npcs) {
      if (n.councilSeat) map.set(n.councilSeat, n);
    }
    if (rulerNpc) {
      const rulerSeatId = seats.find((s) => isRulerSeat(s))?.id ?? "seat.ruler";
      map.set(rulerSeatId, rulerNpc);
    }
    return map;
  }, [npcs, rulerNpc, seats]);

  /** Pool: everyone except the locked player ruler (posted + unseated advisors). */
  const pool = useMemo(
    () =>
      npcs.filter((n) => {
        if (n.isPlayerRuler || n.id === fac?.rulerNpcId) return false;
        if (n.id === rulerNpc?.id) return false;
        if (isRulerSeat(n.councilSeat)) return false;
        return !n.councilSeat;
      }),
    [npcs, fac?.rulerNpcId, rulerNpc?.id],
  );

  // Exact NPC ids this board's cards can carry — replaces "*" now that
  // CardBoard is shared app-wide (a wildcard here would also accept cards
  // dragged in from unrelated panels, e.g. Diplomacy/Quests/CardBattle).
  // `npcs` already covers both seated and pooled NPCs for this faction.
  const npcCardIds = useMemo(() => npcs.map((n) => n.id), [npcs]);

  const filteredPool = useMemo(() => {
    if (courtTab !== "council" || !targetSeatId) return pool;
    const seat = seats.find((s) => s.id === targetSeatId);
    const roles = seat?.roles ?? [];
    if (!roles.length) return pool;
    const preferred = pool.filter((n) => n.role && roles.includes(n.role));
    const rest = pool.filter((n) => !n.role || !roles.includes(n.role));
    return [...preferred, ...rest];
  }, [pool, seats, targetSeatId, courtTab]);

  const stats = useMemo(() => {
    let working = 0;
    let posted = 0;
    for (const n of npcs) {
      if (n.isPlayerRuler || n.id === fac?.rulerNpcId) continue;
      const kind = n.posting?.kind || "court";
      if (kind !== "court") {
        posted++;
        continue;
      }
      if (n.currentTask || n.status === "busy") working++;
    }
    return {
      seated: Math.max(0, bySeat.size - (rulerNpc ? 1 : 0)),
      pool: pool.length,
      working,
      posted,
      total: npcs.length,
    };
  }, [npcs, bySeat.size, pool.length, fac?.rulerNpcId, rulerNpc]);

  const ownedSystems = useMemo(
    () =>
      payload.world.systems.filter(
        (s) => s.ownerFactionId === payload.factionId,
      ),
    [payload.world.systems, payload.factionId],
  );

  const ungovernedAlerts = useMemo(() => {
    return ownedSystems.filter(
      (s) =>
        (s.planets ?? []).some((p) => (p.population || 0) > 0) &&
        !systemHasGovernor(npcs, s.id),
    );
  }, [ownedSystems, npcs]);

  const vacantHouseAlerts = useMemo(() => {
    return (fac?.internalBlocs ?? []).filter((b) => {
      const needs =
        b.kind === "house" ||
        b.kind === "church" ||
        b.kind === "race_caucus";
      return needs && !b.leaderNpcId;
    });
  }, [fac?.internalBlocs]);

  const attentionItems = useMemo(
    () =>
      buildCourtAttention({
        ungovernedCount: ungovernedAlerts.length,
        vacantHouses: vacantHouseAlerts,
        seated: stats.seated,
        seatSlots: seats.filter(
          (s) => !lockedSeatIds.has(s.id) && !isRulerSeat(s),
        ).length,
        fieldPosted: stats.posted,
      }),
    [
      ungovernedAlerts.length,
      vacantHouseAlerts,
      stats.seated,
      stats.posted,
      seats,
      lockedSeatIds,
    ],
  );

  const tabBadges = useMemo(
    (): Partial<Record<CourtTabId, number>> => ({
      field: ungovernedAlerts.length,
      houses: vacantHouseAlerts.length,
    }),
    [ungovernedAlerts.length, vacantHouseAlerts.length],
  );

  const ownedFleets = useMemo(
    () => payload.world.fleets.filter((f) => f.factionId === payload.factionId),
    [payload.world.fleets, payload.factionId],
  );
  const ownedLegions = useMemo(
    () =>
      payload.world.legions.filter((l) => l.factionId === payload.factionId),
    [payload.world.legions, payload.factionId],
  );

  const selectedNpc =
    selectedNpcId != null
      ? (npcs.find((n) => n.id === selectedNpcId) ?? null)
      : null;

  const focusPoolSeat = (seatId: string | null) => {
    setCourtTab("council");
    setFieldTarget(null);
    setNationTarget(null);
    setHouseTarget(null);
    setTargetSeatId(seatId);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (isInputFocused(e.target)) return;
      if (pendingPost) return;
      if (
        targetSeatId ||
        fieldTarget ||
        nationTarget ||
        houseTarget ||
        selectedNpcId
      ) {
        e.preventDefault();
        e.stopPropagation();
        setTargetSeatId(null);
        setFieldTarget(null);
        setNationTarget(null);
        setHouseTarget(null);
        setSelectedNpcId(null);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [
    pendingPost,
    targetSeatId,
    fieldTarget,
    nationTarget,
    houseTarget,
    selectedNpcId,
  ]);

  const withBusy = async (fn: () => Promise<boolean | void>) => {
    if (taskBusy) return false;
    setTaskBusy(true);
    try {
      return await fn();
    } finally {
      setTaskBusy(false);
    }
  };

  const seatNpc = (npcId: string, seatId: string) =>
    withBusy(async () => {
      if (isRulerSeat({ id: seatId }) || !onSeatCouncil) return false;
      const npc = npcs.find((n) => n.id === npcId);
      if (npc?.isPlayerRuler || npcId === fac?.rulerNpcId) return false;
      const ok = await onSeatCouncil(npcId, seatId);
      if (ok !== false) {
        const nextEmpty = seats.find(
          (s) =>
            !isRulerSeat(s) &&
            !lockedSeatIds.has(s.id) &&
            s.id !== seatId &&
            !bySeat.has(s.id),
        );
        const poolLeft = pool.filter((n) => n.id !== npcId).length;
        if (nextEmpty && poolLeft > 0) {
          setTargetSeatId(nextEmpty.id);
        } else {
          setTargetSeatId(null);
        }
      }
      return ok;
    });

  const unseatNpc = (npcId: string) =>
    withBusy(async () => {
      if (!onUnseatCouncil) return false;
      const npc = npcs.find((n) => n.id === npcId);
      if (
        npc?.isPlayerRuler ||
        npcId === fac?.rulerNpcId ||
        isRulerSeat(npc?.councilSeat)
      ) {
        return false;
      }
      const posted = npc?.posting?.kind && npc.posting.kind !== "court";
      if (posted && onRecallPosting) {
        const ok = await onRecallPosting(npcId);
        if (ok !== false && selectedNpcId === npcId) setSelectedNpcId(null);
        return ok;
      }
      const ok = await onUnseatCouncil(npcId);
      if (ok !== false && selectedNpcId === npcId) setSelectedNpcId(null);
      return ok;
    });

  const requestPosting = (
    npcId: string,
    opts: {
      kind: "governor" | "commander" | "admiral";
      systemId?: string;
      legionId?: string;
      fleetId?: string;
      forceId?: string;
    },
  ) => {
    const npc = npcs.find((n) => n.id === npcId);
    if (
      npc?.councilSeat &&
      !isRulerSeat(npc.councilSeat) &&
      !npc.isPlayerRuler &&
      npcId !== fac?.rulerNpcId
    ) {
      setPendingPost({ npcId, opts });
      return;
    }
    void withBusy(async () => onAssignPosting?.(npcId, opts));
  };

  const onTokenDrop = (npcId: string, zoneId: string) => {
    if (zoneId === "council:pool") {
      void unseatNpc(npcId);
      return;
    }
    if (zoneId.startsWith("council:")) {
      const seatId = zoneId.slice("council:".length);
      if (isRulerSeat({ id: seatId })) return;
      void seatNpc(npcId, seatId);
      return;
    }
    if (zoneId.startsWith("field:governor:")) {
      const systemId = zoneId.slice("field:governor:".length);
      requestPosting(npcId, { kind: "governor", systemId });
      return;
    }
    if (zoneId.startsWith("field:commander:")) {
      const legionId = zoneId.slice("field:commander:".length);
      requestPosting(npcId, {
        kind: "commander",
        legionId,
        forceId: legionId,
      });
      return;
    }
    if (zoneId.startsWith("field:admiral:")) {
      const fleetId = zoneId.slice("field:admiral:".length);
      requestPosting(npcId, {
        kind: "admiral",
        fleetId,
        forceId: fleetId,
      });
      return;
    }
    if (zoneId.startsWith("house:")) {
      const blocId = zoneId.slice("house:".length);
      void withBusy(async () => onAssignBlocLeader?.(npcId, blocId));
      return;
    }
    if (zoneId.startsWith("nation:")) {
      const raceId = zoneId.slice("nation:".length);
      void withBusy(async () => onAssignRaceLeader?.(npcId, raceId));
    }
  };

  const advisorSeats = seats.filter((s) => !isRulerSeat(s));

  return (
    <div
      className={`court-panel court-panel--table court-panel--workspace court-panel--${layout} court-panel--tab-${courtTab}${
        compact ? " court-panel--compact" : ""
      }${layout === "fill" ? " court-panel--hosted" : ""}`}
      aria-label="Рабочее место двора"
      style={
        accent
          ? ({
              ["--court-accent" as string]: accent,
              ["--fx-glow-color" as string]: accent,
            } as CSSProperties)
          : undefined
      }
    >
      {!compact ? <CourtBeams accent={accent} /> : null}

      <header className="court-panel-head">
        <div className="court-panel-head__main">
          {layout === "fill" || compact ? null : (
            <>
              <p className="dossier-kicker">Держава · персонал</p>
              <h2>
                Двор <FlipHint word={activeTab.echo} />
              </h2>
            </>
          )}
          <p className="hint">
            {activeTab.hint}
            {rulerNpc ? ` · трон: ${rulerNpc.name}` : ""}
          </p>
          <CourtNavTabs
            value={courtTab}
            onChange={(id) => {
              setCourtTab(id);
              setTargetSeatId(null);
              setFieldTarget(null);
              setNationTarget(null);
              setHouseTarget(null);
            }}
            badges={tabBadges}
          />
          <CourtAttentionStrip
            items={attentionItems}
            onJump={(id) => setCourtTab(id)}
          />
          <p className="court-panel-stats hint" aria-live="polite">
            {stats.seated} советников · {stats.pool} в пуле
            {stats.working ? ` · ${stats.working} в работе` : ""}
            {stats.posted ? ` · ${stats.posted} на посту` : ""}
          </p>
        </div>
      </header>

      <>
        <div className="court-workspace">
            <div className="court-workspace__stage">
              <AnimatePresence mode="wait">
                {courtTab === "council" ? (
                  <motion.section
                    key="council"
                    className="court-table-stage court-table-stage--solo"
                    aria-label="Круглый стол"
                    role="tabpanel"
                    id="court-panel-council"
                    aria-labelledby="court-tab-council"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.22 }}
                  >
                    <div className="court-round-wrap">
                      <div
                        className={`court-round-table fx-spotlight${
                          bySeat.size > 0 ? " fx-glow" : ""
                        }`}
                        {...tableSpot.bind}
                        style={
                          {
                            ["--fx-spot-color" as string]:
                              accent || "var(--accent)",
                            ["--fx-spot-size" as string]: "280px",
                          } as CSSProperties
                        }
                      >
                        <div
                          className="court-round-table__surface fx-moving-border"
                          aria-hidden
                        >
                          <div className="court-round-table__grain" />
                          <span className="court-round-table__label">Совет</span>
                          <span className="court-round-table__orbit" />
                        </div>

                        {seats.map((seat) => {
                          const occupant = bySeat.get(seat.id);
                          const angle = seat.angleDeg ?? 0;
                          const sealed = lockedSeatIds.has(seat.id);
                          const ruler = isRulerSeat(seat);
                          const focusDim =
                            !!hoverSeatId &&
                            hoverSeatId !== seat.id &&
                            !!occupant;
                          const bloc = occupant?.blocId
                            ? blocsById.get(occupant.blocId)
                            : null;
                          const portfolioId = resolveSeatPortfolioId(
                            fac,
                            seat.id,
                            content,
                          );
                          const portfolioLabel = portfolioLabelForSeat(
                            fac,
                            seat.id,
                            content,
                          );
                          return (
                            <div
                              key={seat.id}
                              className={`court-seat${
                                occupant ? " is-filled" : " is-empty"
                              }${sealed ? " is-sealed" : ""}${
                                ruler ? " is-ruler" : ""
                              }${
                                targetSeatId === seat.id ? " is-target" : ""
                              }${
                                selectedNpc?.councilSeat === seat.id
                                  ? " is-selected"
                                  : ""
                              }${focusDim ? " is-focus-dim" : ""}`}
                              style={seatStyle(angle)}
                              onMouseEnter={() => setHoverSeatId(seat.id)}
                              onMouseLeave={() =>
                                setHoverSeatId((id) =>
                                  id === seat.id ? null : id,
                                )
                              }
                            >
                              {ruler ? (
                                <div className="court-seat__drop court-seat__ruler">
                                  <p className="court-seat__role">
                                    {seat.label}
                                  </p>
                                  <p className="court-seat__portfolio hint">
                                    игрок
                                  </p>
                                  {rulerNpc ? (
                                    <RulerToken
                                      npc={rulerNpc}
                                      accent={accent}
                                      selected={
                                        selectedNpcId === rulerNpc.id
                                      }
                                      onClick={() =>
                                        setSelectedNpcId((id) =>
                                          id === rulerNpc.id
                                            ? null
                                            : rulerNpc.id,
                                        )
                                      }
                                    />
                                  ) : (
                                    <p className="hint">
                                      Нет персонажа игрока (rulerNpcId)
                                    </p>
                                  )}
                                </div>
                              ) : sealed ? (
                                <div className="court-seat__drop court-seat__sealed">
                                  <p className="court-seat__role">
                                    {seat.label}
                                  </p>
                                  {portfolioLabel && (
                                    <p className="court-seat__portfolio">
                                      {portfolioLabel}
                                    </p>
                                  )}
                                  <p className="hint">
                                    {seat.unlockHint || "Печать снята"}
                                  </p>
                                </div>
                              ) : (
                                <DropZone
                                  zoneId={`council:${seat.id}`}
                                  accepts={npcCardIds}
                                  armWhileDragging
                                  onDrop={(cardId) => {
                                    void seatNpc(cardId, seat.id);
                                  }}
                                  className="court-seat__drop"
                                  contentLayout="stack"
                                >
                                  <p className="court-seat__role">
                                    {portfolioLabel || seat.label}
                                  </p>
                                  {onSetSeatPortfolio && (
                                    <label className="court-seat__portfolio-field">
                                      <span className="sr-only">
                                        Ведомство слота
                                      </span>
                                      <select
                                        className="court-seat__portfolio-select"
                                        value={portfolioId ?? ""}
                                        disabled={
                                          !onSetSeatPortfolio || taskBusy
                                        }
                                        title="Роль / ведомство"
                                        onClick={(e) => e.stopPropagation()}
                                        onPointerDown={(e) =>
                                          e.stopPropagation()
                                        }
                                        onChange={(e) => {
                                          e.stopPropagation();
                                          const next = e.target.value;
                                          if (!next || !onSetSeatPortfolio)
                                            return;
                                          void withBusy(async () =>
                                            onSetSeatPortfolio(seat.id, next),
                                          );
                                        }}
                                      >
                                        {!portfolioId && (
                                          <option value="" disabled>
                                            роль…
                                          </option>
                                        )}
                                        {portfolios.map((p) => (
                                          <option key={p.id} value={p.id}>
                                            {p.label}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                  )}
                                  <AnimatePresence>
                                    {occupant ? (
                                      <motion.div
                                        key={occupant.id}
                                        initial={{ scale: 0.85, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        exit={{ scale: 0.9, opacity: 0 }}
                                        transition={{
                                          type: "spring",
                                          stiffness: 380,
                                          damping: 26,
                                        }}
                                      >
                                        <NpcToken
                                          npc={occupant}
                                          accent={accent}
                                          bloc={bloc}
                                          selected={
                                            selectedNpcId === occupant.id
                                          }
                                          dimmed={focusDim}
                                          onClick={() =>
                                            setSelectedNpcId((id) =>
                                              id === occupant.id
                                                ? null
                                                : occupant.id,
                                            )
                                          }
                                          onDoubleClick={() => {
                                            if (!onUnseatCouncil || taskBusy)
                                              return;
                                            void unseatNpc(occupant.id);
                                          }}
                                          onDragToZone={(zoneId) =>
                                            onTokenDrop(occupant.id, zoneId)
                                          }
                                        />
                                      </motion.div>
                                    ) : (
                                      <EmptySeatButton
                                        disabled={!onSeatCouncil || taskBusy}
                                        onClick={() =>
                                          focusPoolSeat(seat.id)
                                        }
                                      />
                                    )}
                                  </AnimatePresence>
                                </DropZone>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    {advisorSeats.every(
                      (s) => lockedSeatIds.has(s.id) || bySeat.has(s.id),
                    ) ? null : (
                      <p className="hint court-table-hint">
                        Пустое место — кнопка «Посадить» или перетащить из
                        пула · Esc снимает цель
                      </p>
                    )}
                  </motion.section>
                ) : courtTab === "field" ? (
                  <motion.div
                    key="field"
                    className="court-tab-pane"
                    role="tabpanel"
                    id="court-panel-field"
                    aria-labelledby="court-tab-field"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.22 }}
                  >
                    <CourtFieldView
                      npcs={npcs}
                      payload={payload}
                      accent={accent}
                      selectedId={selectedNpcId}
                      targetKey={
                        fieldTarget
                          ? `${fieldTarget.kind}:${fieldTarget.id}`
                          : null
                      }
                      onSelect={setSelectedNpcId}
                      onVacantPick={(opts) => {
                        const id =
                          opts.systemId || opts.legionId || opts.fleetId || "";
                        setFieldTarget({ kind: opts.kind, id });
                        setTargetSeatId(null);
                        setNationTarget(null);
                        setHouseTarget(null);
                      }}
                      busy={taskBusy}
                      onDropAssign={(npcId, opts) => {
                        requestPosting(npcId, opts);
                      }}
                    />
                  </motion.div>
                ) : courtTab === "nations" ? (
                  <motion.div
                    key="nations"
                    className="court-tab-pane"
                    role="tabpanel"
                    id="court-panel-nations"
                    aria-labelledby="court-tab-nations"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.22 }}
                  >
                    <CourtNationsView
                      npcs={npcs}
                      blocs={fac?.internalBlocs ?? []}
                      payload={payload}
                      accent={accent}
                      selectedId={selectedNpcId}
                      targetRaceId={nationTarget}
                      onSelect={setSelectedNpcId}
                      onVacantPick={(raceId) => {
                        setNationTarget(raceId);
                        setTargetSeatId(null);
                        setFieldTarget(null);
                        setHouseTarget(null);
                      }}
                      busy={taskBusy}
                      onDropLeader={(npcId, raceId) => {
                        void withBusy(async () =>
                          onAssignRaceLeader?.(npcId, raceId),
                        );
                      }}
                    />
                  </motion.div>
                ) : (
                  <motion.div
                    key="houses"
                    className="court-tab-pane"
                    role="tabpanel"
                    id="court-panel-houses"
                    aria-labelledby="court-tab-houses"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.22 }}
                  >
                    <CourtHousesView
                      blocs={fac?.internalBlocs ?? []}
                      npcs={npcs}
                      accent={accent}
                      selectedId={selectedNpcId}
                      targetBlocId={houseTarget}
                      onSelectNpc={setSelectedNpcId}
                      onVacantPick={(blocId) => {
                        setHouseTarget(blocId);
                        setTargetSeatId(null);
                        setFieldTarget(null);
                        setNationTarget(null);
                      }}
                      busy={taskBusy}
                      onDropLeader={(npcId, blocId) => {
                        void withBusy(async () =>
                          onAssignBlocLeader?.(npcId, blocId),
                        );
                      }}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {selectedNpc ? (
                  <motion.div
                    key={`dossier-${selectedNpc.id}`}
                    className="court-dossier court-dossier--float fx-spotlight"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    transition={{ duration: 0.28 }}
                    {...dossierSpot.bind}
                  >
                    <NpcCard
                      npc={selectedNpc}
                      payload={payload}
                      accent={accent}
                      busy={taskBusy}
                      selected
                      onSelect={() => setSelectedNpcId(null)}
                      traitCatalog={traitCatalog}
                      ownedSystems={ownedSystems}
                      ownedFleets={ownedFleets}
                      ownedLegions={ownedLegions}
                      courtTasks={content?.court_tasks?.tasks}
                      blocs={fac?.internalBlocs}
                      onGiveTask={
                        onGiveNpcTask
                          ? (id, opts) =>
                              withBusy(async () => onGiveNpcTask(id, opts))
                          : undefined
                      }
                      onAssignPosting={
                        onAssignPosting &&
                        !selectedNpc.isPlayerRuler &&
                        selectedNpc.id !== fac?.rulerNpcId
                          ? (id, opts) => requestPosting(id, opts)
                          : undefined
                      }
                      onRecallPosting={
                        onRecallPosting && !selectedNpc.isPlayerRuler
                          ? (id) => withBusy(async () => onRecallPosting(id))
                          : undefined
                      }
                    />
                    {selectedNpc.councilSeat &&
                    !isRulerSeat(selectedNpc.councilSeat) &&
                    !selectedNpc.isPlayerRuler &&
                    onUnseatCouncil ? (
                      <button
                        type="button"
                        className="btn ghost sm block"
                        disabled={taskBusy}
                        onClick={() => void unseatNpc(selectedNpc.id)}
                      >
                        Убрать в пул · drag на пул
                      </button>
                    ) : null}
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>

            <aside className="court-pool-drawer court-pool-drawer--persistent" aria-label="Пул двора">
              <header className="court-pool-drawer__head">
                <div>
                  <p className="dossier-kicker">Пул</p>
                  <h3>
                    {courtTab === "council" && targetSeatId
                      ? seats.find((s) => s.id === targetSeatId)?.label ||
                        "Слот"
                      : "Лица державы"}
                  </h3>
                  <p className="hint">
                    {courtTab === "council"
                      ? "На слот — посадить · сюда — снять · Esc"
                      : courtTab === "field"
                        ? fieldTarget
                          ? "Назначить выбранным на пост"
                          : "Выберите вакансию или перетащите на пост"
                        : courtTab === "nations"
                          ? nationTarget
                            ? "Назначить лидером народа"
                            : "Выберите народ или перетащите"
                          : houseTarget
                            ? "Назначить главой дома"
                            : "Выберите дом или перетащите"}
                  </p>
                </div>
              </header>

              <DropZone
                zoneId="council:pool"
                accepts={npcCardIds}
                armWhileDragging
                onDrop={(cardId) => void unseatNpc(cardId)}
                className="court-pool-dropzone"
                contentLayout="stack"
              >
                <ul className="court-pool-list">
                  {filteredPool.length === 0 ? (
                    <li className="court-pool-empty">
                      <p>Пул пуст.</p>
                      <p className="hint">
                        Снимите советника со стола или отзовите с поста.
                      </p>
                    </li>
                  ) : (
                    filteredPool.map((n, i) => {
                      const preferred =
                        courtTab === "council" &&
                        !!targetSeatId &&
                        (seats.find((s) => s.id === targetSeatId)?.roles ?? [])
                          .length > 0 &&
                        !!n.role &&
                        (
                          seats.find((s) => s.id === targetSeatId)?.roles ?? []
                        ).includes(n.role);
                      const postingKind = n.posting?.kind || "court";
                      return (
                        <motion.li
                          key={n.id}
                          className="court-pool-item"
                          layout={false}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{
                            delay: Math.min(i, 8) * 0.03,
                            duration: 0.2,
                          }}
                        >
                          <DragCard
                            cardId={n.id}
                            title={n.name}
                            subtitle={[
                              n.title,
                              n.role ? npcRoleLabel(n.role) : null,
                              postingKind !== "court"
                                ? npcPostingLabel(postingKind)
                                : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                            accent={accent}
                            tilt={false}
                            className={`court-pool-drag fx-spotlight${
                              preferred ? " is-preferred fx-glow" : ""
                            }`}
                            icon={
                              n.avatarUrl ? (
                                <img
                                  src={n.avatarUrl}
                                  alt=""
                                  className="court-pool-row__av"
                                />
                              ) : (
                                <span
                                  className="court-pool-row__av court-pool-row__av--ph"
                                  aria-hidden
                                >
                                  {(n.name || "?").slice(0, 1).toUpperCase()}
                                </span>
                              )
                            }
                            onDropZone={(zoneId) => onTokenDrop(n.id, zoneId)}
                          >
                            <button
                              type="button"
                              className="btn sm block"
                              disabled={
                                taskBusy ||
                                (courtTab === "council" &&
                                  !!targetSeatId &&
                                  !onSeatCouncil)
                              }
                              onClick={() => {
                                if (
                                  courtTab === "council" &&
                                  targetSeatId &&
                                  !isRulerSeat({ id: targetSeatId })
                                ) {
                                  void seatNpc(n.id, targetSeatId);
                                  return;
                                }
                                if (courtTab === "field" && fieldTarget) {
                                  const t = fieldTarget;
                                  requestPosting(
                                    n.id,
                                    t.kind === "governor"
                                      ? { kind: "governor", systemId: t.id }
                                      : t.kind === "commander"
                                        ? {
                                            kind: "commander",
                                            legionId: t.id,
                                            forceId: t.id,
                                          }
                                        : {
                                            kind: "admiral",
                                            fleetId: t.id,
                                            forceId: t.id,
                                          },
                                  );
                                  return;
                                }
                                if (courtTab === "nations" && nationTarget) {
                                  void withBusy(async () =>
                                    onAssignRaceLeader?.(n.id, nationTarget),
                                  );
                                  return;
                                }
                                if (courtTab === "houses" && houseTarget) {
                                  void withBusy(async () =>
                                    onAssignBlocLeader?.(n.id, houseTarget),
                                  );
                                  return;
                                }
                                setSelectedNpcId(n.id);
                              }}
                            >
                              {courtTab === "council" && targetSeatId
                                ? preferred
                                  ? "Посадить сюда"
                                  : "Посадить"
                                : courtTab === "field" && fieldTarget
                                  ? "Назначить"
                                  : courtTab === "nations" && nationTarget
                                    ? "Лидер"
                                    : courtTab === "houses" && houseTarget
                                      ? "Глава"
                                      : "Открыть"}
                            </button>
                          </DragCard>
                        </motion.li>
                      );
                    })
                  )}
                </ul>
              </DropZone>
            </aside>
          </div>
      </>
      <ConfirmModal
        open={!!pendingPost}
        title="Снять со стола?"
        confirmLabel="Отправить на пост"
        cancelLabel="Отмена"
        busy={taskBusy}
        onClose={() => setPendingPost(null)}
        onConfirm={() => {
          const next = pendingPost;
          setPendingPost(null);
          if (!next) return;
          void withBusy(async () => onAssignPosting?.(next.npcId, next.opts));
        }}
      >
        <p>
          Этот человек сидит в Совете. Назначение
          {pendingPost
            ? ` (${npcPostingLabel(pendingPost.opts.kind)})`
            : " на пост"}{" "}
          снимет его со стола.
        </p>
      </ConfirmModal>
    </div>
  );
}
