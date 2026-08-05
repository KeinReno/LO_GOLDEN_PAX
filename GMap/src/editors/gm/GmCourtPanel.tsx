import { useCallback, useEffect, useMemo, useState } from "react";
import { useWorldStore } from "../../state/worldStore";
import { getCachedContent } from "../../state/contentCatalog";
import { npcRoleLabel } from "../../state/displayLabels";
import { useCampaignSessionCtx, fmtTime } from "../CampaignSessionContext";
import {
  listCouncilPortfolios,
  resolveSeatPortfolioId,
  resolveSeatTitle,
  stanceLabel,
} from "../../state/courtGovernance";
import { GmEffectAudit } from "./GmEffectAudit";
import type {
  FactionCouncil,
  FactionNpc,
  InternalBloc,
  InternalBlocStance,
  NpcPosting,
  NpcPostingKind,
  NpcTask,
} from "../../state/types";

function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

type SeatDef = {
  id: string;
  label: string;
  kind?: string;
  roles?: string[];
  angleDeg?: number;
  defaultPortfolio?: string;
  custom?: boolean;
};

type CourtTab = "table" | "pool" | "blocs" | "drafts";

type CourtOp = {
  op: string;
  npc?: { id?: string; name?: string; role?: string; councilSeat?: string | null };
  npcId?: string;
  bloc?: { id?: string; name?: string; stance?: string };
  blocId?: string;
  council?: Record<string, unknown>;
};

type CourtProposal = {
  id: string;
  status: string;
  createdAt: string;
  author: string;
  factionId: string;
  summary: string;
  rationale?: string;
  confirmSetRuler?: boolean;
  ops?: CourtOp[];
  resolvedAt?: string;
};

const OP_LABELS: Record<string, string> = {
  upsert_npc: "NPC",
  remove_npc: "Удалить NPC",
  upsert_bloc: "Дом",
  remove_bloc: "Удалить дом",
  patch_council: "Совет",
  set_ruler: "Правитель",
};

function resolveNpcName(
  world: { factions: { id: string; npcs?: { id: string; name?: string }[] }[] },
  factionId: string,
  npcId: string,
): string {
  const fac = world.factions.find((f) => f.id === factionId);
  const npc = fac?.npcs?.find((n) => n.id === npcId);
  return npc?.name ?? npcId;
}

function formatCourtOp(
  op: CourtOp,
  world: { factions: { id: string; name?: string; npcs?: { id: string; name?: string }[]; internalBlocs?: { id: string; name?: string }[] }[] },
  factionId: string,
): string {
  const label = OP_LABELS[op.op] ?? op.op;
  switch (op.op) {
    case "upsert_npc": {
      const n = op.npc;
      const parts = [n?.name ?? n?.id ?? "?"];
      if (n?.role) parts.push(npcRoleLabel(n.role as FactionNpc["role"]));
      if (n?.councilSeat) parts.push(`место ${n.councilSeat}`);
      return `${label}: ${parts.join(" · ")}`;
    }
    case "remove_npc":
      return `${label}: ${resolveNpcName(world, factionId, op.npcId ?? "?")}`;
    case "upsert_bloc": {
      const b = op.bloc;
      return `${label}: ${b?.name ?? b?.id ?? "?"}`;
    }
    case "remove_bloc": {
      const fac = world.factions.find((f) => f.id === factionId);
      const bloc =
        fac?.internalBlocs?.find((b) => b.id === op.blocId)?.name ?? op.blocId;
      return `${label}: ${bloc ?? "?"}`;
    }
    case "patch_council": {
      const keys = op.council ? Object.keys(op.council) : [];
      return `${label}: ${keys.length ? keys.join(", ") : "изменения"}`;
    }
    case "set_ruler":
      return `${label}: ${resolveNpcName(world, factionId, op.npcId ?? "?")}`;
    default:
      return `${label}`;
  }
}

const NPC_ROLES: NonNullable<FactionNpc["role"]>[] = [
  "ruler",
  "priest",
  "strategist",
  "architect",
  "agent",
  "other",
];

const NPC_STATUSES: NonNullable<FactionNpc["status"]>[] = [
  "active",
  "hidden",
  "dead",
  "away",
  "busy",
];

const POSTING_KINDS: NpcPostingKind[] = [
  "court",
  "governor",
  "commander",
  "admiral",
];

const BLOC_STANCES: InternalBlocStance[] = [
  "loyal",
  "ambitious",
  "hostile",
  "neutral",
];

function resolveSeats(
  catalog: Record<string, SeatDef>,
  council: FactionCouncil | undefined,
): SeatDef[] {
  const allCatalog = Object.values(catalog);
  const unlocked = council?.unlockedSeatIds;
  const locked = new Set(council?.lockedSeatIds ?? []);
  let base =
    unlocked && unlocked.length > 0
      ? unlocked
          .map((id) => catalog[id] ?? { id, label: id })
          .filter((s) => !locked.has(s.id))
      : allCatalog.filter((s) => !locked.has(s.id));
  if (!base.length) base = allCatalog;
  const labels = council?.seatLabels ?? {};
  const withLabels = base.map((s) => ({
    ...s,
    label: resolveSeatTitle(
      { id: s.id, label: labels[s.id] || s.label, kind: s.kind },
      council,
    ),
  }));
  const extras = (council?.extraSeats ?? []).map((s) => ({
    ...s,
    kind: "advisor" as const,
    label: resolveSeatTitle(
      { id: s.id, label: labels[s.id] || s.label || "Советник", kind: "advisor" },
      council,
    ),
    custom: true as const,
  }));
  return [...withLabels, ...extras];
}

/**
 * GM Court domain — full table: seats, NPC CRUD, postings, internal blocs.
 */
export function GmCourtPanel() {
  const world = useWorldStore((s) => s.world);
  const activeFactionId = useWorldStore((s) => s.activeFactionId);
  const updateFaction = useWorldStore((s) => s.updateFaction);
  const loadWorld = useWorldStore((s) => s.loadWorld);
  const { masterToken, setSyncMsg } = useCampaignSessionCtx();
  const content = getCachedContent();

  const facId = activeFactionId ?? world.factions[0]?.id;
  const faction = world.factions.find((f) => f.id === facId) ?? null;
  const npcs = faction?.npcs ?? [];
  const blocs = faction?.internalBlocs ?? [];
  const council = faction?.council;

  const catalogSeats = useMemo(() => {
    const raw = content?.council_seats?.seats ?? {};
    const out: Record<string, SeatDef> = {};
    for (const [id, s] of Object.entries(raw)) {
      out[id] = {
        id: (s as SeatDef).id ?? id,
        label: (s as SeatDef).label ?? id,
        kind: (s as SeatDef).kind,
        roles: (s as SeatDef).roles,
        angleDeg: (s as SeatDef).angleDeg,
        defaultPortfolio: (s as SeatDef).defaultPortfolio,
      };
    }
    return out;
  }, [content]);

  const seats = useMemo(
    () => resolveSeats(catalogSeats, council),
    [catalogSeats, council],
  );
  const portfolios = useMemo(
    () => listCouncilPortfolios(content),
    [content],
  );
  const tasks = useMemo(
    () => Object.values(content?.court_tasks?.tasks ?? {}),
    [content],
  );
  const traits = useMemo(
    () => Object.values(content?.npc_traits?.traits ?? {}),
    [content],
  );

  const [tab, setTab] = useState<CourtTab>("table");
  const [taskPick, setTaskPick] = useState<Record<string, string>>({});
  const [traitPick, setTraitPick] = useState<Record<string, string>>({});
  const [editNpcId, setEditNpcId] = useState<string | null>(null);
  const [newSeatLabel, setNewSeatLabel] = useState("");
  const [drafts, setDrafts] = useState<CourtProposal[]>([]);
  const [draftsErr, setDraftsErr] = useState("");
  const [draftsBusy, setDraftsBusy] = useState<string | null>(null);
  const [expandedDraftId, setExpandedDraftId] = useState<string | null>(null);

  const refreshDrafts = useCallback(async () => {
    try {
      const res = await fetch("/api/court/proposals?status=pending", {
        headers: { "X-Master-Token": masterToken },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          (data as { error?: string }).error || res.statusText,
        );
      }
      const data = (await res.json()) as { proposals?: CourtProposal[] };
      setDrafts(data.proposals ?? []);
      setDraftsErr("");
    } catch (e) {
      setDraftsErr(e instanceof Error ? e.message : String(e));
    }
  }, [masterToken]);

  useEffect(() => {
    void refreshDrafts();
  }, [refreshDrafts, world.meta.tableRevision]);

  useEffect(() => {
    if (tab === "drafts") void refreshDrafts();
  }, [tab, refreshDrafts]);

  const reloadLiveBoard = useCallback(async () => {
    const res = await fetch("/api/table", {
      headers: { "X-Master-Token": masterToken },
    });
    if (!res.ok) return;
    const data = (await res.json()) as { world?: typeof world };
    if (data.world) loadWorld(data.world);
  }, [loadWorld, masterToken]);

  const acceptDraft = async (id: string) => {
    setDraftsBusy(id);
    try {
      const res = await fetch(`/api/court/proposals/${id}/accept`, {
        method: "POST",
        headers: { "X-Master-Token": masterToken },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      if (data.world) loadWorld(data.world);
      else await reloadLiveBoard();
      setSyncMsg(`Черновик принят: ${data.proposal?.summary ?? id}`);
      void refreshDrafts();
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setDraftsBusy(null);
    }
  };

  const rejectDraft = async (id: string) => {
    setDraftsBusy(id);
    try {
      const res = await fetch(`/api/court/proposals/${id}/reject`, {
        method: "POST",
        headers: { "X-Master-Token": masterToken },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      setSyncMsg(`Черновик отклонён: ${data.proposal?.summary ?? id}`);
      setDrafts((prev) => prev.filter((p) => p.id !== id));
      void refreshDrafts();
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setDraftsBusy(null);
    }
  };

  const pendingDraftCount = drafts.length;

  if (!faction) {
    return <p className="hint">Выберите державу в верхней панели.</p>;
  }

  const patchCouncil = (patch: Partial<FactionCouncil>) => {
    const next: FactionCouncil = {
      unlockedSeatIds:
        council?.unlockedSeatIds?.length
          ? [...council.unlockedSeatIds]
          : Object.keys(catalogSeats),
      lockedSeatIds: council?.lockedSeatIds ? [...council.lockedSeatIds] : [],
      seatLabels: { ...(council?.seatLabels ?? {}) },
      seatPortfolios: { ...(council?.seatPortfolios ?? {}) },
      extraSeats: [...(council?.extraSeats ?? [])],
      ...patch,
    };
    if (patch.seatLabels) {
      next.seatLabels = { ...(council?.seatLabels ?? {}), ...patch.seatLabels };
    }
    if (patch.seatPortfolios) {
      next.seatPortfolios = {
        ...(council?.seatPortfolios ?? {}),
        ...patch.seatPortfolios,
      };
    }
    if (patch.extraSeats) next.extraSeats = patch.extraSeats;
    updateFaction(faction.id, { council: next });
  };

  const patchNpc = (npcId: string, patch: Partial<FactionNpc>) => {
    const next = npcs.map((n) => (n.id === npcId ? { ...n, ...patch } : n));
    updateFaction(faction.id, { npcs: next });
  };

  const addNpc = () => {
    const npc: FactionNpc = {
      id: uid("npc"),
      name: "Новый советник",
      role: "other",
      status: "active",
      posting: { kind: "court", sinceTurn: world.meta.turn },
    };
    updateFaction(faction.id, { npcs: [...npcs, npc] });
    setEditNpcId(npc.id);
    setTab("pool");
  };

  const removeNpc = (npcId: string) => {
    if (!confirm("Удалить NPC из двора?")) return;
    updateFaction(faction.id, {
      npcs: npcs.filter((n) => n.id !== npcId),
    });
    if (editNpcId === npcId) setEditNpcId(null);
  };

  const seatNpc = (npc: FactionNpc, seatId: string | null) => {
    const next = npcs.map((n) => {
      if (n.id === npc.id) return { ...n, councilSeat: seatId };
      if (seatId && n.councilSeat === seatId) return { ...n, councilSeat: null };
      return n;
    });
    updateFaction(faction.id, { npcs: next });
  };

  const renameSeat = (seatId: string, label: string) => {
    patchCouncil({ seatLabels: { [seatId]: label } });
  };

  const addSeat = () => {
    const label = newSeatLabel.trim() || "Советник";
    const id = uid("seat");
    const unlocked =
      council?.unlockedSeatIds?.length
        ? [...council.unlockedSeatIds]
        : Object.keys(catalogSeats);
    patchCouncil({
      unlockedSeatIds: unlocked,
      extraSeats: [
        ...(council?.extraSeats ?? []),
        { id, label, roles: [], angleDeg: 0 },
      ],
    });
    setNewSeatLabel("");
  };

  const removeExtraSeat = (seatId: string) => {
    const extras = (council?.extraSeats ?? []).filter((s) => s.id !== seatId);
    const nextNpcs = npcs.map((n) =>
      n.councilSeat === seatId ? { ...n, councilSeat: null } : n,
    );
    updateFaction(faction.id, {
      council: {
        unlockedSeatIds:
          council?.unlockedSeatIds?.length
            ? [...council.unlockedSeatIds]
            : Object.keys(catalogSeats),
        lockedSeatIds: council?.lockedSeatIds,
        seatLabels: council?.seatLabels,
        extraSeats: extras,
      },
      npcs: nextNpcs,
    });
  };

  const lockCatalogSeat = (seatId: string) => {
    const locked = new Set(council?.lockedSeatIds ?? []);
    locked.add(seatId);
    const nextNpcs = npcs.map((n) =>
      n.councilSeat === seatId ? { ...n, councilSeat: null } : n,
    );
    updateFaction(faction.id, {
      council: {
        unlockedSeatIds:
          council?.unlockedSeatIds?.length
            ? council.unlockedSeatIds.filter((id) => id !== seatId)
            : Object.keys(catalogSeats).filter((id) => id !== seatId),
        lockedSeatIds: [...locked],
        seatLabels: council?.seatLabels,
        extraSeats: council?.extraSeats,
      },
      npcs: nextNpcs,
    });
  };

  const assignCatalogTask = (npc: FactionNpc) => {
    const taskId = taskPick[npc.id];
    const def = tasks.find((t) => t.id === taskId);
    if (!def) return;
    const task: NpcTask = {
      id: uid("task"),
      label: def.label,
      startedTurn: world.meta.turn,
      etaTurn: world.meta.turn + (def.etaTurns ?? 2),
      progress: 0,
      taskId: def.id,
      effects: def.effects as NpcTask["effects"],
    };
    patchNpc(npc.id, { currentTask: task });
  };

  const addTrait = (npc: FactionNpc) => {
    const tid = traitPick[npc.id];
    if (!tid) return;
    const cur = npc.traitIds ?? [];
    if (cur.includes(tid)) return;
    patchNpc(npc.id, { traitIds: [...cur, tid] });
  };

  const addBloc = () => {
    const bloc: InternalBloc = {
      id: uid("bloc"),
      name: "Новый дом",
      stance: "neutral",
      influence: 10,
      color: "#888888",
    };
    updateFaction(faction.id, { internalBlocs: [...blocs, bloc] });
  };

  const patchBloc = (blocId: string, patch: Partial<InternalBloc>) => {
    updateFaction(faction.id, {
      internalBlocs: blocs.map((b) =>
        b.id === blocId ? { ...b, ...patch } : b,
      ),
    });
  };

  const removeBloc = (blocId: string) => {
    if (!confirm("Удалить внутренний дом? NPC отвяжутся.")) return;
    updateFaction(faction.id, {
      internalBlocs: blocs.filter((b) => b.id !== blocId),
      npcs: npcs.map((n) =>
        n.blocId === blocId ? { ...n, blocId: null } : n,
      ),
    });
  };

  const seated = npcs.filter((n) => n.councilSeat);
  const editing = editNpcId
    ? npcs.find((n) => n.id === editNpcId) ?? null
    : null;

  const systems = world.systems.filter((s) => s.ownerFactionId === faction.id);
  const fleets = world.fleets.filter((f) => f.factionId === faction.id);
  const legions = world.legions.filter((l) => l.factionId === faction.id);

  return (
    <div className="gm-domain-body gm-court">
      <p className="hint">
        <strong>{faction.name}</strong> · NPC {npcs.length} · за столом{" "}
        {seated.length}/{seats.length || "?"} · домов {blocs.length}
      </p>

      <div className="gm-court-tabs">
        {(
          [
            ["table", "Стол"],
            ["pool", "Пул"],
            ["blocs", "Дома"],
            ["drafts", "Черновики"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`btn ghost ${tab === id ? "active" : ""}`}
            onClick={() => setTab(id)}
          >
            {label}
            {id === "drafts" && pendingDraftCount > 0 && (
              <span className="gmsys-badge gmsys-badge--warn" style={{ marginLeft: 6 }}>
                {pendingDraftCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "table" && (
        <div className="gm-domain-block">
          <div className="gmsys-row" style={{ marginBottom: 8 }}>
            <input
              className="gmsys-input"
              placeholder="Новое место…"
              value={newSeatLabel}
              onChange={(e) => setNewSeatLabel(e.target.value)}
            />
            <button type="button" className="btn primary" onClick={addSeat}>
              + Место
            </button>
          </div>
          {!seats.length && (
            <p className="hint">Нет мест — добавьте или проверьте content.</p>
          )}
          <ul className="gmsys-list">
            {seats.map((seat) => {
              const occ = npcs.find((n) => n.councilSeat === seat.id);
              const isRuler =
                seat.kind === "ruler" || seat.id === "seat.ruler";
              const portfolioId =
                resolveSeatPortfolioId(faction, seat.id, content) ?? "";
              return (
                <li key={seat.id} className="gmsys-list-row">
                  <div className="gmsys-list-main">
                    <input
                      className="gmsys-input"
                      value={seat.label}
                      onChange={(e) => renameSeat(seat.id, e.target.value)}
                      title="Переименовать место (по умолчанию Советник)"
                    />
                    {!isRuler && (
                      <select
                        className="gmsys-select-sm"
                        value={portfolioId}
                        title="Роль / ведомство"
                        onChange={(e) => {
                          const next = e.target.value;
                          if (!next) return;
                          patchCouncil({
                            seatPortfolios: { [seat.id]: next },
                          });
                          const preferred = portfolios.find(
                            (p) => p.id === next,
                          )?.roles?.[0] as FactionNpc["role"] | undefined;
                          if (occ && preferred && occ.role !== "ruler") {
                            patchNpc(occ.id, { role: preferred });
                          }
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
                    )}
                    <p className="gmsys-list-meta">
                      {occ ? (
                        <>
                          {occ.name}
                          {occ.role ? ` · ${npcRoleLabel(occ.role)}` : ""}
                        </>
                      ) : (
                        <span className="gmsys-hint">свободно</span>
                      )}
                      {seat.custom && (
                        <span className="gmsys-badge gmsys-badge--muted">
                          {" "}
                          своё
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="gmsys-row">
                    <select
                      className="gmsys-select-sm"
                      value={occ?.id ?? ""}
                      onChange={(e) => {
                        const id = e.target.value;
                        if (!id) {
                          if (occ) seatNpc(occ, null);
                          return;
                        }
                        const npc = npcs.find((n) => n.id === id);
                        if (npc) seatNpc(npc, seat.id);
                      }}
                    >
                      <option value="">— пусто —</option>
                      {npcs.map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.name}
                        </option>
                      ))}
                    </select>
                    {!occ && (
                      <button
                        type="button"
                        className="btn ghost"
                        title="Создать NPC и посадить"
                        onClick={() => {
                          const npc: FactionNpc = {
                            id: uid("npc"),
                            name: `Советник`,
                            role: "other",
                            status: "active",
                            councilSeat: seat.id,
                            posting: { kind: "court", sinceTurn: world.meta.turn },
                          };
                          updateFaction(faction.id, {
                            npcs: [
                              ...npcs.map((n) =>
                                n.councilSeat === seat.id
                                  ? { ...n, councilSeat: null }
                                  : n,
                              ),
                              npc,
                            ],
                          });
                          setEditNpcId(npc.id);
                        }}
                      >
                        +NPC
                      </button>
                    )}
                    {seat.custom ? (
                      <button
                        type="button"
                        className="btn danger"
                        onClick={() => removeExtraSeat(seat.id)}
                      >
                        ×
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn ghost"
                        title="Убрать слот из стола державы"
                        onClick={() => lockCatalogSeat(seat.id)}
                      >
                        −
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="gm-domain-block" style={{ marginTop: 12 }}>
            <GmEffectAudit compact />
          </div>
        </div>
      )}

      {tab === "pool" && (
        <div className="gm-domain-block">
          <div className="gmsys-row" style={{ marginBottom: 8 }}>
            <button type="button" className="btn primary" onClick={addNpc}>
              + NPC
            </button>
          </div>

          {editing && (
            <NpcEditCard
              npc={editing}
              turn={world.meta.turn}
              blocs={blocs}
              systems={systems.map((s) => ({ id: s.id, name: s.name }))}
              fleets={fleets.map((f) => ({ id: f.id, name: f.name }))}
              legions={legions.map((l) => ({ id: l.id, name: l.name }))}
              onPatch={(p) => patchNpc(editing.id, p)}
              onClose={() => setEditNpcId(null)}
              onDelete={() => removeNpc(editing.id)}
            />
          )}

          {!npcs.length && (
            <p className="gmsys-empty">Нет NPC — нажмите «+ NPC».</p>
          )}
          <ul className="gmsys-list">
            {npcs.map((npc) => (
              <NpcCourtRow
                key={npc.id}
                npc={npc}
                blocs={blocs}
                tasks={tasks}
                traits={traits}
                taskId={taskPick[npc.id] ?? ""}
                traitId={traitPick[npc.id] ?? ""}
                onTaskId={(v) =>
                  setTaskPick((d) => ({ ...d, [npc.id]: v }))
                }
                onTraitId={(v) =>
                  setTraitPick((d) => ({ ...d, [npc.id]: v }))
                }
                onAssignTask={() => assignCatalogTask(npc)}
                onClearTask={() =>
                  patchNpc(npc.id, { currentTask: undefined })
                }
                onAddTrait={() => addTrait(npc)}
                onRemoveTrait={(tid) =>
                  patchNpc(npc.id, {
                    traitIds: (npc.traitIds ?? []).filter((x) => x !== tid),
                  })
                }
                onUnseat={() => seatNpc(npc, null)}
                onEdit={() => setEditNpcId(npc.id)}
              />
            ))}
          </ul>
        </div>
      )}

      {tab === "blocs" && (
        <div className="gm-domain-block">
          <div className="gmsys-row" style={{ marginBottom: 8 }}>
            <button type="button" className="btn primary" onClick={addBloc}>
              + Дом / орден
            </button>
          </div>
          {!blocs.length && (
            <p className="hint">
              Внутренние фракции двора. NPC крепятся через blocId.
            </p>
          )}
          <ul className="gmsys-list">
            {blocs.map((b) => {
              const members = npcs.filter((n) => n.blocId === b.id);
              return (
                <li key={b.id} className="gmsys-list-row">
                  <div className="gmsys-list-main" style={{ flex: 1 }}>
                    <div className="gmsys-row">
                      <input
                        type="color"
                        value={b.color || "#888888"}
                        onChange={(e) =>
                          patchBloc(b.id, { color: e.target.value })
                        }
                        title="Цвет"
                        style={{ width: 36, height: 28, padding: 0 }}
                      />
                      <input
                        className="gmsys-input"
                        value={b.name}
                        onChange={(e) =>
                          patchBloc(b.id, { name: e.target.value })
                        }
                      />
                      <select
                        className="gmsys-select-sm"
                        value={b.stance}
                        onChange={(e) =>
                          patchBloc(b.id, {
                            stance: e.target.value as InternalBlocStance,
                          })
                        }
                      >
                        {BLOC_STANCES.map((s) => (
                          <option key={s} value={s}>
                            {stanceLabel(s)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <input
                      className="gmsys-input"
                      placeholder="Повестка…"
                      value={b.agenda ?? ""}
                      onChange={(e) =>
                        patchBloc(b.id, { agenda: e.target.value })
                      }
                    />
                    <p className="gmsys-list-meta">
                      влияние {b.influence} · членов {members.length}
                      {members.length > 0 &&
                        ` · ${members.map((m) => m.name).join(", ")}`}
                    </p>
                    <label className="field">
                      <span>Влияние 0–100</span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={b.influence}
                        onChange={(e) =>
                          patchBloc(b.id, {
                            influence: Number(e.target.value),
                          })
                        }
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    className="btn danger"
                    onClick={() => removeBloc(b.id)}
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {tab === "drafts" && (
        <div className="gm-domain-block">
          <div className="gmsys-row" style={{ marginBottom: 8 }}>
            <button
              type="button"
              className="btn ghost"
              disabled={!!draftsBusy}
              onClick={() => void refreshDrafts()}
            >
              Обновить
            </button>
          </div>
          {draftsErr && (
            <p className="hint" style={{ color: "var(--danger, #f08080)" }}>
              {draftsErr}
            </p>
          )}
          {!draftsErr && !drafts.length && (
            <p className="gmsys-empty">Нет черновиков двора</p>
          )}
          <ul className="gmsys-list">
            {drafts.map((p) => {
              const facName =
                world.factions.find((f) => f.id === p.factionId)?.name ??
                p.factionId;
              const expanded = expandedDraftId === p.id;
              const busy = draftsBusy === p.id;
              const ops = p.ops ?? [];
              return (
                <li key={p.id} className="gmsys-list-row">
                  <div className="gmsys-list-main" style={{ flex: 1 }}>
                    <p className="gmsys-list-title">{p.summary}</p>
                    <p className="gmsys-list-meta">
                      {p.author} · {facName} · {ops.length} оп. ·{" "}
                      {fmtTime(p.createdAt)}
                    </p>
                    {expanded && (
                      <div className="gm-domain-block" style={{ marginTop: 8 }}>
                        {p.rationale && (
                          <p className="hint" style={{ marginBottom: 6 }}>
                            {p.rationale}
                          </p>
                        )}
                        {p.confirmSetRuler && (
                          <p className="gmsys-list-meta">
                            <span className="gmsys-badge gmsys-badge--warn">
                              смена правителя
                            </span>
                          </p>
                        )}
                        <ul className="gmsys-list" style={{ marginTop: 4 }}>
                          {ops.map((op, i) => (
                            <li key={i} className="gmsys-list-meta">
                              {formatCourtOp(op, world, p.factionId)}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                  <div className="btn-col">
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() =>
                        setExpandedDraftId(expanded ? null : p.id)
                      }
                    >
                      {expanded ? "Свернуть" : "Подробнее"}
                    </button>
                    <button
                      type="button"
                      className="btn primary"
                      disabled={!!draftsBusy}
                      onClick={() => void acceptDraft(p.id)}
                    >
                      {busy ? "…" : "Принять"}
                    </button>
                    <button
                      type="button"
                      className="btn danger"
                      disabled={!!draftsBusy}
                      onClick={() => void rejectDraft(p.id)}
                    >
                      Отклонить
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function NpcEditCard({
  npc,
  turn,
  blocs,
  systems,
  fleets,
  legions,
  onPatch,
  onClose,
  onDelete,
}: {
  npc: FactionNpc;
  turn: number;
  blocs: InternalBloc[];
  systems: { id: string; name: string }[];
  fleets: { id: string; name: string }[];
  legions: { id: string; name: string }[];
  onPatch: (p: Partial<FactionNpc>) => void;
  onClose: () => void;
  onDelete: () => void;
}) {
  const posting: NpcPosting = npc.posting ?? {
    kind: "court",
    sinceTurn: turn,
  };

  const setPosting = (kind: NpcPostingKind) => {
    if (kind === "court") {
      onPatch({ posting: { kind: "court", sinceTurn: turn } });
      return;
    }
    const next: NpcPosting = { kind, sinceTurn: turn };
    if (kind === "governor") next.systemId = posting.systemId ?? systems[0]?.id;
    if (kind === "admiral") next.fleetId = posting.fleetId ?? fleets[0]?.id;
    if (kind === "commander")
      next.legionId = posting.legionId ?? legions[0]?.id;
    onPatch({ posting: next });
  };

  return (
    <div className="gm-npc-edit">
      <div className="gmsys-row" style={{ justifyContent: "space-between" }}>
        <strong>Карточка NPC</strong>
        <button type="button" className="btn ghost" onClick={onClose}>
          Свернуть
        </button>
      </div>
      <label className="field">
        <span>Имя</span>
        <input
          value={npc.name}
          onChange={(e) => onPatch({ name: e.target.value })}
        />
      </label>
      <label className="field">
        <span>Титул</span>
        <input
          value={npc.title ?? ""}
          onChange={(e) => onPatch({ title: e.target.value })}
        />
      </label>
      <div className="gmsys-row">
        <label className="field" style={{ flex: 1 }}>
          <span>Роль</span>
          <select
            value={npc.role ?? "other"}
            onChange={(e) =>
              onPatch({ role: e.target.value as FactionNpc["role"] })
            }
          >
            {NPC_ROLES.map((r) => (
              <option key={r} value={r}>
                {npcRoleLabel(r)}
              </option>
            ))}
          </select>
        </label>
        <label className="field" style={{ flex: 1 }}>
          <span>Статус</span>
          <select
            value={npc.status ?? "active"}
            onChange={(e) =>
              onPatch({ status: e.target.value as FactionNpc["status"] })
            }
          >
            {NPC_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="field">
        <span>Дом / орден</span>
        <select
          value={npc.blocId ?? ""}
          onChange={(e) =>
            onPatch({ blocId: e.target.value || null })
          }
        >
          <option value="">— без дома —</option>
          {blocs.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Постинг</span>
        <select
          value={posting.kind}
          onChange={(e) => setPosting(e.target.value as NpcPostingKind)}
        >
          {POSTING_KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </label>
      {posting.kind === "governor" && (
        <label className="field">
          <span>Система</span>
          <select
            value={posting.systemId ?? ""}
            onChange={(e) =>
              onPatch({
                posting: {
                  kind: "governor",
                  systemId: e.target.value,
                  sinceTurn: turn,
                },
              })
            }
          >
            {systems.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {posting.kind === "admiral" && (
        <label className="field">
          <span>Флот</span>
          <select
            value={posting.fleetId ?? ""}
            onChange={(e) =>
              onPatch({
                posting: {
                  kind: "admiral",
                  fleetId: e.target.value,
                  sinceTurn: turn,
                },
              })
            }
          >
            {fleets.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {posting.kind === "commander" && (
        <label className="field">
          <span>Легион</span>
          <select
            value={posting.legionId ?? ""}
            onChange={(e) =>
              onPatch({
                posting: {
                  kind: "commander",
                  legionId: e.target.value,
                  sinceTurn: turn,
                },
              })
            }
          >
            {legions.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="field">
        <span>Заметки игроку</span>
        <textarea
          rows={2}
          value={npc.publicNotes ?? ""}
          onChange={(e) => onPatch({ publicNotes: e.target.value })}
        />
      </label>
      <label className="field">
        <span>GM notes</span>
        <textarea
          rows={2}
          value={npc.gmNotes ?? ""}
          onChange={(e) => onPatch({ gmNotes: e.target.value })}
        />
      </label>
      <button type="button" className="btn danger block" onClick={onDelete}>
        Удалить NPC
      </button>
    </div>
  );
}

function NpcCourtRow({
  npc,
  blocs,
  tasks,
  traits,
  taskId,
  traitId,
  onTaskId,
  onTraitId,
  onAssignTask,
  onClearTask,
  onAddTrait,
  onRemoveTrait,
  onUnseat,
  onEdit,
}: {
  npc: FactionNpc;
  blocs: InternalBloc[];
  tasks: { id: string; label: string; etaTurns?: number; roles?: string[] }[];
  traits: { id: string; name: string }[];
  taskId: string;
  traitId: string;
  onTaskId: (v: string) => void;
  onTraitId: (v: string) => void;
  onAssignTask: () => void;
  onClearTask: () => void;
  onAddTrait: () => void;
  onRemoveTrait: (tid: string) => void;
  onUnseat: () => void;
  onEdit: () => void;
}) {
  const roleTasks = tasks.filter(
    (t) =>
      !t.roles?.length ||
      !npc.role ||
      t.roles.includes(npc.role) ||
      t.roles.includes("other"),
  );
  const bloc = blocs.find((b) => b.id === npc.blocId);

  return (
    <li className="gmsys-list-row gmsys-npc-row">
      <div className="gmsys-list-main">
        <p className="gmsys-list-title">
          {npc.name}
          {npc.councilSeat && (
            <span className="gmsys-badge">
              {" "}
              {npc.councilSeat.replace(/^seat\./, "")}
            </span>
          )}
        </p>
        <p className="gmsys-list-meta">
          {npc.title && <span>{npc.title}</span>}
          {npc.role && (
            <span className="gmsys-badge gmsys-badge--muted">
              {npcRoleLabel(npc.role)}
            </span>
          )}
          {bloc && (
            <span className="gmsys-badge" style={{ borderColor: bloc.color }}>
              {bloc.name}
            </span>
          )}
          {npc.posting && npc.posting.kind !== "court" && (
            <span className="gmsys-hint"> · {npc.posting.kind}</span>
          )}
          {npc.status && npc.status !== "active" && (
            <span className="gmsys-hint"> · {npc.status}</span>
          )}
        </p>
        {(npc.traitIds?.length ?? 0) > 0 && (
          <p className="gm-domain-chips">
            {npc.traitIds!.map((tid) => (
              <button
                key={tid}
                type="button"
                className="gm-pill gm-pill--btn"
                title="Снять трейт"
                onClick={() => onRemoveTrait(tid)}
              >
                {traits.find((t) => t.id === tid)?.name ?? tid} ×
              </button>
            ))}
          </p>
        )}
        {npc.currentTask ? (
          <div className="gmsys-task">
            <p>
              <strong>{npc.currentTask.label}</strong>
            </p>
            <p className="gmsys-hint">
              до хода {npc.currentTask.etaTurn} · {npc.currentTask.progress ?? 0}
              %
            </p>
            <button type="button" className="btn ghost" onClick={onClearTask}>
              Снять задачу
            </button>
          </div>
        ) : (
          <div className="gmsys-row">
            <select
              className="gmsys-select-sm"
              value={taskId}
              onChange={(e) => onTaskId(e.target.value)}
            >
              <option value="">задача…</option>
              {roleTasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn ghost"
              disabled={!taskId}
              onClick={onAssignTask}
            >
              Назначить
            </button>
          </div>
        )}
        <div className="gmsys-row">
          <select
            className="gmsys-select-sm"
            value={traitId}
            onChange={(e) => onTraitId(e.target.value)}
          >
            <option value="">трейт…</option>
            {traits.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn ghost"
            disabled={!traitId}
            onClick={onAddTrait}
          >
            + трейт
          </button>
        </div>
      </div>
      <div className="btn-col">
        <button type="button" className="btn ghost" onClick={onEdit}>
          Править
        </button>
        {npc.councilSeat && (
          <button type="button" className="btn ghost" onClick={onUnseat}>
            В пул
          </button>
        )}
      </div>
    </li>
  );
}
