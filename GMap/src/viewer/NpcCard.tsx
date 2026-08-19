import { useMemo, useState } from "react";
import type {
  FactionNpc,
  Fleet,
  InternalBloc,
  Legion,
  Quest,
  StarSystem,
  ViewerPayload,
} from "../state/types";
import { getCachedContent } from "../state/contentCatalog";
import {
  explainNpcInfluence,
  formatInfluenceLine,
  listNpcHats,
  portfolioLabelForSeat,
  resolveSeatTitle,
  stanceLabel,
  blocKindLabel,
} from "../state/courtGovernance";
import { DragCard } from "../ui/DragCard";
import { npcPostingLabel } from "../state/displayLabels";

const STATUS_LABEL: Record<string, string> = {
  active: "на месте",
  away: "в отъезде",
  busy: "занят",
  hidden: "скрыт",
  dead: "погиб",
};

function questsForNpc(quests: Quest[] | undefined, npcId: string): Quest[] {
  return (quests ?? []).filter(
    (q) => q.sourceNpcId === npcId && q.status !== "hidden",
  );
}

function arcLabel(q: Quest): string | null {
  if (!q.arc?.stages?.length) return null;
  const cur = (q.arc.currentStage ?? 0) + 1;
  const total = q.arc.stages.length;
  const stage = q.arc.stages[q.arc.currentStage ?? 0];
  return `этап ${cur}/${total}${stage?.label ? ` · ${stage.label}` : ""}`;
}

type CourtTaskDef = {
  id: string;
  label: string;
  etaTurns?: number;
  roles?: string[];
  effects?: Array<{ effect: string; args?: Record<string, unknown> }>;
};

type TraitDef = {
  id: string;
  name: string;
  description?: string;
};

export type NpcCardProps = {
  npc: FactionNpc;
  payload: ViewerPayload;
  accent?: string;
  onGiveTask?: (
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
  busy?: boolean;
  compact?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  traitCatalog?: Record<string, TraitDef>;
  courtTasks?: Record<string, CourtTaskDef>;
  ownedSystems?: StarSystem[];
  ownedFleets?: Fleet[];
  ownedLegions?: Legion[];
  blocs?: InternalBloc[];
};

/** Court NPC card — portrait, traits, posting, task progress. */
export function NpcCard({
  npc,
  payload,
  accent,
  onGiveTask,
  onAssignPosting,
  onRecallPosting,
  busy = false,
  compact = false,
  selected = false,
  onSelect,
  traitCatalog = {},
  courtTasks = {},
  ownedSystems = [],
  ownedFleets = [],
  ownedLegions = [],
  blocs = [],
}: NpcCardProps) {
  const [assignOpen, setAssignOpen] = useState(false);
  const [postOpen, setPostOpen] = useState(false);
  const [taskId, setTaskId] = useState("");
  const [taskLabel, setTaskLabel] = useState("");
  const [etaDelta, setEtaDelta] = useState(3);
  const [linkedQuestId, setLinkedQuestId] = useState("");
  const [postKind, setPostKind] = useState<"governor" | "commander" | "admiral">(
    "governor",
  );
  const [postTarget, setPostTarget] = useState("");

  const status = npc.status || "active";
  const postingKind = npc.posting?.kind || "court";
  const atCourt = postingKind === "court";
  const content = getCachedContent();
  const fac = payload.world.factions.find((f) => f.id === payload.factionId);
  const bloc = useMemo(
    () => (npc.blocId ? blocs.find((b) => b.id === npc.blocId) : null),
    [blocs, npc.blocId],
  );
  const influence = useMemo(
    () => explainNpcInfluence(npc, content, fac),
    [npc, content, fac],
  );
  const seatPortfolio = useMemo(() => {
    if (!npc.councilSeat) return null;
    return portfolioLabelForSeat(fac, npc.councilSeat, content);
  }, [npc.councilSeat, fac, content]);
  const seatTitle = useMemo(() => {
    if (!npc.councilSeat) return null;
    const seatDef = content?.council_seats?.seats?.[npc.councilSeat];
    return resolveSeatTitle(
      { id: npc.councilSeat, label: seatDef?.label || npc.councilSeat },
      fac?.council,
    );
  }, [npc.councilSeat, content, fac?.council]);
  const linked = useMemo(
    () => questsForNpc(payload.world.quests, npc.id),
    [payload.world.quests, npc.id],
  );
  const turn = payload.world.meta.turn;
  const progress = npc.currentTask?.progress ?? 0;
  const raceName = npc.raceId
    ? payload.world.races.find((r) => r.id === npc.raceId)?.name ||
      npc.raceId.replace(/^race_/, "")
    : null;

  const traits = useMemo(() => {
    return (npc.traitIds ?? [])
      .map((id) => traitCatalog[id])
      .filter(Boolean) as TraitDef[];
  }, [npc.traitIds, traitCatalog]);

  const roleTasks = useMemo(() => {
    const role = npc.role || "other";
    return Object.values(courtTasks).filter((t) => {
      if (!t?.id || !t.label) return false;
      if (!t.roles?.length) return true;
      return t.roles.includes(role);
    });
  }, [courtTasks, npc.role]);

  const postingTargetLabel = useMemo(() => {
    if (postingKind === "governor" && npc.posting?.systemId) {
      const s = payload.world.systems.find(
        (x) => x.id === npc.posting?.systemId,
      );
      return s?.name || npc.posting.systemId;
    }
    if (postingKind === "commander") {
      const id = npc.posting?.legionId || npc.posting?.forceId;
      if (!id) return null;
      const l = payload.world.legions.find((x) => x.id === id);
      return l?.name || id;
    }
    if (postingKind === "admiral") {
      const id = npc.posting?.fleetId || npc.posting?.forceId;
      if (!id) return null;
      const f = payload.world.fleets.find((x) => x.id === id);
      return f?.name || id;
    }
    return null;
  }, [npc.posting, postingKind, payload.world]);

  const hats = useMemo(
    () =>
      listNpcHats(npc, {
        blocs,
        seatLabel: seatPortfolio
          ? `${seatTitle || "Советник"} · ${seatPortfolio}`
          : seatTitle,
        postingTargetLabel,
      }),
    [npc, blocs, seatPortfolio, seatTitle, postingTargetLabel],
  );

  const canAssignTask =
    !!onGiveTask &&
    !npc.currentTask &&
    atCourt &&
    status !== "dead" &&
    status !== "hidden";

  const canPost =
    !!onAssignPosting &&
    !npc.currentTask &&
    status !== "dead" &&
    status !== "hidden";

  const canRecall =
    !!onRecallPosting && !atCourt && status !== "dead" && status !== "hidden";

  const submitTask = async () => {
    if (!onGiveTask) return;
    const catalog = taskId ? courtTasks[taskId] : null;
    const label = (catalog?.label || taskLabel).trim();
    if (!label) return;
    const eta =
      turn +
      Math.max(
        1,
        catalog?.etaTurns != null ? Number(catalog.etaTurns) : etaDelta,
      );
    const ok = await onGiveTask(npc.id, {
      taskLabel: label,
      etaTurn: eta,
      linkedQuestId: linkedQuestId || undefined,
      taskId: taskId || undefined,
    });
    if (ok === false) return;
    setTaskLabel("");
    setTaskId("");
    setLinkedQuestId("");
    setAssignOpen(false);
  };

  const submitPosting = async () => {
    if (!onAssignPosting || !postTarget) return;
    const opts: {
      kind: "governor" | "commander" | "admiral";
      systemId?: string;
      legionId?: string;
      fleetId?: string;
      forceId?: string;
    } = { kind: postKind };
    if (postKind === "governor") opts.systemId = postTarget;
    if (postKind === "commander") {
      opts.legionId = postTarget;
      opts.forceId = postTarget;
    }
    if (postKind === "admiral") {
      opts.fleetId = postTarget;
      opts.forceId = postTarget;
    }
    const ok = await onAssignPosting(npc.id, opts);
    if (ok === false) return;
    setPostOpen(false);
    setPostTarget("");
  };

  const targets =
    postKind === "governor"
      ? ownedSystems.map((s) => ({ id: s.id, label: s.name }))
      : postKind === "commander"
        ? ownedLegions.map((l) => ({ id: l.id, label: l.name }))
        : ownedFleets.map((f) => ({ id: f.id, label: f.name }));

  return (
    <DragCard
      cardId={npc.id}
      title={npc.name}
      subtitle={[
        raceName,
        seatPortfolio ? `Советник · ${seatPortfolio}` : npc.title,
        npcPostingLabel(postingKind),
        STATUS_LABEL[status] || status,
      ]
        .filter(Boolean)
        .join(" · ")}
      accent={
        accent ||
        payload.world.factions.find((f) => f.id === payload.factionId)?.color
      }
      className={`npc-card npc-card--${status}${compact ? " npc-card--compact" : ""}${
        selected ? " npc-card--selected" : ""
      }`}
      icon={
        npc.avatarUrl ? (
          <img src={npc.avatarUrl} alt="" className="npc-card-avatar" />
        ) : (
          <span className="npc-card-avatar npc-card-avatar--ph" aria-hidden>
            {(npc.name || "?").slice(0, 1).toUpperCase()}
          </span>
        )
      }
      pinned={assignOpen || postOpen || selected}
    >
      <div
        className={`npc-status-dot npc-status-dot--${status}`}
        title={STATUS_LABEL[status]}
      />

      {onSelect ? (
        <button
          type="button"
          className="btn ghost sm npc-card-select"
          onClick={onSelect}
        >
          {selected ? "Свернуть" : "Сведения"}
        </button>
      ) : null}

      {traits.length > 0 && (
        <ul className="npc-trait-chips" aria-label="Особенности">
          {traits.map((t) => (
            <li key={t.id} className="npc-trait-chip" title={t.description || t.name}>
              {t.name}
            </li>
          ))}
        </ul>
      )}

      {bloc ? (
        <p className="npc-bloc-line">
          <span
            className="npc-bloc-dot"
            style={{ background: bloc.color || "var(--accent)" }}
            aria-hidden
          />
          <strong>{bloc.name}</strong>
          <span className="hint">
            {" "}
            · {blocKindLabel(bloc.kind)} · {stanceLabel(bloc.stance)}
            {npc.isBlocLeader || bloc.leaderNpcId === npc.id
              ? " · глава"
              : ""}
          </span>
        </p>
      ) : (
        <p className="hint npc-bloc-line">Без дома · сам по себе</p>
      )}

      {hats.length > 0 ? (
        <ul className="npc-hats" aria-label="Мандаты">
          {hats.map((h, i) => (
            <li key={`${h.kind}-${i}`} className={`npc-hat npc-hat--${h.kind}`}>
              <strong>{h.label}</strong>
              {h.detail ? <span className="hint"> · {h.detail}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}

      {!atCourt && (
        <p className="npc-posting-line">
          <strong>{npcPostingLabel(postingKind)}</strong>
          {postingTargetLabel ? (
            <span className="hint"> · {postingTargetLabel}</span>
          ) : null}
        </p>
      )}

      {selected && (influence.realm.length > 0 || influence.local.length > 0) ? (
        <div className="npc-influence">
          {influence.realm.length > 0 ? (
            <div>
              <p className="dossier-kicker">Держава</p>
              <ul>
                {influence.realm.slice(0, 6).map((e, i) => (
                  <li key={`r-${i}`}>{formatInfluenceLine(e)}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {influence.local.length > 0 ? (
            <div>
              <p className="dossier-kicker">На посту</p>
              <ul>
                {influence.local.slice(0, 6).map((e, i) => (
                  <li key={`l-${i}`}>{formatInfluenceLine(e)}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {npc.publicNotes && selected ? (
        <p className="hint npc-notes">{npc.publicNotes}</p>
      ) : null}

      {npc.currentTask ? (
        <div className="npc-task">
          <span className="npc-task-label">{npc.currentTask.label}</span>
          <div
            className="npc-task-bar"
            role="progressbar"
            aria-valuenow={Math.round(progress * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <span style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <span className="hint">
            до хода {npc.currentTask.etaTurn}
            {typeof progress === "number"
              ? ` · ${Math.round(progress * 100)}%`
              : ""}
          </span>
        </div>
      ) : atCourt ? (
        <p className="hint npc-idle">Нет поручения</p>
      ) : null}

      {linked.length > 0 && (
        <ul className="npc-quest-list">
          {linked.map((q) => (
            <li key={q.id}>
              <strong>{q.name}</strong>
              <span className="hint">
                {" "}
                · поручено {npc.name}
                {arcLabel(q) ? `, ${arcLabel(q)}` : ""}
              </span>
              {canAssignTask && q.status === "active" && (
                <button
                  type="button"
                  className="btn sm block"
                  disabled={busy}
                  onClick={() =>
                    void onGiveTask?.(npc.id, {
                      taskLabel: `Займись квестом: ${q.name}`,
                      etaTurn: turn + 3,
                      linkedQuestId: q.id,
                    })
                  }
                >
                  Займись этим квестом
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="npc-card-actions">
        {canAssignTask && !assignOpen && (
          <button
            type="button"
            className="btn sm block"
            disabled={busy}
            onClick={() => {
              setAssignOpen(true);
              setPostOpen(false);
            }}
          >
            Дать поручение
          </button>
        )}
        {canPost && !postOpen && (
          <button
            type="button"
            className="btn sm ghost block"
            disabled={busy}
            onClick={() => {
              setPostOpen(true);
              setAssignOpen(false);
            }}
          >
            {atCourt ? "Назначить…" : "Сменить пост…"}
          </button>
        )}
        {canRecall && (
          <button
            type="button"
            className="btn sm ghost block"
            disabled={busy}
            onClick={() => void onRecallPosting?.(npc.id)}
          >
            Отозвать ко двору
          </button>
        )}
      </div>

      {assignOpen && (
        <div className="npc-assign">
          {roleTasks.length > 0 && (
            <label className="field">
              <span>Из каталога</span>
              <select
                value={taskId}
                onChange={(e) => {
                  const id = e.target.value;
                  setTaskId(id);
                  const def = id ? courtTasks[id] : null;
                  if (def) {
                    setTaskLabel(def.label);
                    if (def.etaTurns != null) setEtaDelta(Number(def.etaTurns));
                  }
                }}
              >
                <option value="">— своё поручение —</option>
                {roleTasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                    {t.etaTurns != null ? ` · ${t.etaTurns} х.` : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="field">
            <span>Задача</span>
            <input
              value={taskLabel}
              onChange={(e) => {
                setTaskLabel(e.target.value);
                setTaskId("");
              }}
              placeholder="Восстановление Тангара"
              maxLength={120}
            />
          </label>
          <label className="field">
            <span>Срок (ходов)</span>
            <input
              type="number"
              min={1}
              max={20}
              value={etaDelta}
              onChange={(e) => setEtaDelta(Number(e.target.value) || 1)}
            />
          </label>
          {linked.length > 0 && (
            <label className="field">
              <span>Связать с квестом</span>
              <select
                value={linkedQuestId}
                onChange={(e) => setLinkedQuestId(e.target.value)}
              >
                <option value="">— без квеста —</option>
                {linked
                  .filter((q) => q.status === "active")
                  .map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <div className="npc-assign-actions">
            <button
              type="button"
              className="btn sm primary"
              disabled={busy || !taskLabel.trim()}
              onClick={() => void submitTask()}
            >
              Поручить (1 ОД)
            </button>
            <button
              type="button"
              className="btn sm ghost"
              onClick={() => setAssignOpen(false)}
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      {postOpen && (
        <div className="npc-assign">
          <label className="field">
            <span>Должность</span>
            <select
              value={postKind}
              onChange={(e) => {
                setPostKind(
                  e.target.value as "governor" | "commander" | "admiral",
                );
                setPostTarget("");
              }}
            >
              <option value="governor">Губернатор системы</option>
              <option value="commander">Командующий легиона</option>
              <option value="admiral">Флотоводец флота</option>
            </select>
          </label>
          <label className="field">
            <span>
              {postKind === "governor"
                ? "Система"
                : postKind === "commander"
                  ? "Легион"
                  : "Флот"}
            </span>
            <select
              value={postTarget}
              onChange={(e) => setPostTarget(e.target.value)}
            >
              <option value="">— выбрать —</option>
              {targets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          {targets.length === 0 && (
            <p className="hint">Нет подходящих целей у вашей державы.</p>
          )}
          <div className="npc-assign-actions">
            <button
              type="button"
              className="btn sm primary"
              disabled={busy || !postTarget}
              onClick={() => void submitPosting()}
            >
              Назначить (1 ОД)
            </button>
            <button
              type="button"
              className="btn sm ghost"
              onClick={() => setPostOpen(false)}
            >
              Отмена
            </button>
          </div>
        </div>
      )}
    </DragCard>
  );
}
