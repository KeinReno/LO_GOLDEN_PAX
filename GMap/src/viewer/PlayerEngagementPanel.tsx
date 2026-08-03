import { useMemo } from "react";
import type { ViewerPayload } from "../state/types";

export const COMBAT_STANCES = [
  "hold",
  "assault",
  "skirmish",
  "retreat",
  "bombard",
] as const;

export type CombatStanceId = (typeof COMBAT_STANCES)[number];

export const COMBAT_STANCE_LABELS: Record<CombatStanceId, string> = {
  hold: "Удержание",
  assault: "Штурм",
  skirmish: "Перестрелка",
  retreat: "Отступление",
  bombard: "Обстрел",
};

export const COMBAT_STANCE_HINTS: Record<CombatStanceId, string> = {
  hold: "Сбалансированная оборона",
  assault: "Максимум урона, выше потери",
  skirmish: "Меньше потерь, слабее удар",
  retreat: "Минимум боя, быстрый выход",
  bombard: "Обстрел с дистанции",
};

const THEATER_LABELS: Record<string, string> = {
  space: "космос",
  ground: "наземный",
  assault: "штурм",
};

const STATUS_LABELS: Record<string, string> = {
  commit: "к бою",
  contact: "контакт",
  resolved: "завершён",
};

export type EngagementSide = {
  factionId: string;
  stance?: string;
  locked?: boolean;
};

export type ViewerEngagement = {
  id: string;
  theater: string;
  systemId: string;
  status: string;
  sides: EngagementSide[];
  result?: {
    outcome?: string;
    lossesA?: { defId: string; lost: number }[];
    lossesB?: { defId: string; lost: number }[];
  } | null;
};

function systemName(world: ViewerPayload["world"], id: string): string {
  return world.systems.find((s) => s.id === id)?.name ?? id;
}

function factionName(world: ViewerPayload["world"], id: string): string {
  return world.factions.find((f) => f.id === id)?.name ?? id;
}

function isOpenEngagement(eng: ViewerEngagement): boolean {
  return eng.status === "commit" || eng.status === "contact";
}

function lossLine(
  losses?: { defId: string; lost: number }[],
): string {
  if (!losses?.length) return "—";
  return (
    losses
      .filter((l) => l.lost > 0)
      .map((l) => `${l.defId.replace(/^(ship|unit)\./, "")}−${l.lost}`)
      .join(", ") || "без потерь"
  );
}

type StancePickerProps = {
  engagementId: string;
  currentStance: string;
  locked: boolean;
  busy: boolean;
  onSubmitStance: (engagementId: string, stance: CombatStanceId) => void;
};

function StancePicker({
  engagementId,
  currentStance,
  locked,
  busy,
  onSubmitStance,
}: StancePickerProps) {
  const stance = (COMBAT_STANCES.includes(currentStance as CombatStanceId)
    ? currentStance
    : "hold") as CombatStanceId;

  if (locked) {
    return (
      <div className="eng-stance-locked" role="status">
        <span className="eng-stance-badge">{COMBAT_STANCE_LABELS[stance]}</span>
        <span className="hint">Поза зафиксирована до конца боя</span>
      </div>
    );
  }

  return (
    <label className="field eng-stance-field">
      <span>Боевая поза (0 AP, сразу)</span>
      <select
        value={stance}
        disabled={busy}
        aria-busy={busy}
        onChange={(e) =>
          onSubmitStance(engagementId, e.target.value as CombatStanceId)
        }
      >
        {COMBAT_STANCES.map((s) => (
          <option key={s} value={s} title={COMBAT_STANCE_HINTS[s]}>
            {COMBAT_STANCE_LABELS[s]}
          </option>
        ))}
      </select>
      <span className="hint">{COMBAT_STANCE_HINTS[stance]}</span>
    </label>
  );
}

type ActiveCardProps = {
  eng: ViewerEngagement;
  payload: ViewerPayload;
  busy: boolean;
  onSubmitStance: (engagementId: string, stance: CombatStanceId) => void;
  onOpenStanceRing?: (
    engagementId: string,
    anchor: { clientX: number; clientY: number },
  ) => void;
  compact?: boolean;
};

function ActiveEngagementCard({
  eng,
  payload,
  busy,
  onSubmitStance,
  onOpenStanceRing,
  compact,
}: ActiveCardProps) {
  const sys = systemName(payload.world, eng.systemId);
  const theater = THEATER_LABELS[eng.theater] ?? eng.theater;
  const status = STATUS_LABELS[eng.status] ?? eng.status;
  const mySide = eng.sides.find((s) => s.factionId === payload.factionId);
  const opponents = eng.sides
    .filter((s) => s.factionId !== payload.factionId)
    .map((s) => factionName(payload.world, s.factionId))
    .join(", ");

  return (
    <article
      className={`order-card eng-card${compact ? " eng-card-compact" : ""}`}
      onClick={(e) => {
        if (
          mySide &&
          !mySide.locked &&
          onOpenStanceRing &&
          !(e.target instanceof HTMLSelectElement)
        ) {
          onOpenStanceRing(eng.id, { clientX: e.clientX, clientY: e.clientY });
        }
      }}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        if (mySide && !mySide.locked && onOpenStanceRing) {
          e.preventDefault();
          const rect = e.currentTarget.getBoundingClientRect();
          onOpenStanceRing(eng.id, {
            clientX: rect.left + rect.width / 2,
            clientY: rect.top + rect.height / 2,
          });
        }
      }}
      role={onOpenStanceRing && mySide && !mySide.locked ? "button" : undefined}
      tabIndex={
        onOpenStanceRing && mySide && !mySide.locked ? 0 : undefined
      }
    >
      <div className="eng-card-head">
        <strong>
          {theater} · {sys}
        </strong>
        <span className="eng-status-pill">{status}</span>
      </div>
      <p className="hint">
        Противник: {opponents || "—"}
        {!compact && (
          <>
            {" "}
            · стороны:{" "}
            {eng.sides
              .map((s) => {
                const name = factionName(payload.world, s.factionId);
                const st = s.stance
                  ? COMBAT_STANCE_LABELS[s.stance as CombatStanceId] ?? s.stance
                  : "—";
                return `${name} (${st}${s.locked ? ", зафикс." : ""})`;
              })
              .join(" · ")}
          </>
        )}
      </p>
      {mySide && (
        <div onClick={(e) => e.stopPropagation()}>
          <StancePicker
            engagementId={eng.id}
            currentStance={mySide.stance || "hold"}
            locked={!!mySide.locked}
            busy={busy}
            onSubmitStance={onSubmitStance}
          />
        </div>
      )}
    </article>
  );
}

export function PlayerEngagementPanel({
  payload,
  engagements,
  onSubmitStance,
  onOpenStanceRing,
  busy = false,
  msg,
  filterSystemId,
  showHistory = true,
  historyLimit = 6,
}: {
  payload: ViewerPayload;
  engagements: ViewerEngagement[];
  onSubmitStance: (engagementId: string, stance: CombatStanceId) => void;
  onOpenStanceRing?: (
    engagementId: string,
    anchor: { clientX: number; clientY: number },
  ) => void;
  busy?: boolean;
  msg?: string | null;
  /** When set, only show engagements in this system (map sheet). */
  filterSystemId?: string | null;
  showHistory?: boolean;
  historyLimit?: number;
}) {
  const filtered = useMemo(() => {
    if (!filterSystemId) return engagements;
    return engagements.filter((e) => e.systemId === filterSystemId);
  }, [engagements, filterSystemId]);

  const open = useMemo(
    () => filtered.filter(isOpenEngagement),
    [filtered],
  );

  const recent = useMemo(
    () =>
      filtered
        .filter((e) => e.status === "resolved")
        .slice()
        .reverse()
        .slice(0, historyLimit),
    [filtered, historyLimit],
  );

  if (!open.length && (!showHistory || !recent.length)) {
    if (filterSystemId) {
      return (
        <p className="hint">В этой системе нет активных столкновений.</p>
      );
    }
    return <p className="hint">Пока нет записей боя.</p>;
  }

  return (
    <div className="eng-panel">
      {msg && <p className="hint eng-msg">{msg}</p>}

      {open.length > 0 && (
        <div className="eng-active-block">
          {!filterSystemId && (
            <p className="hint">
              Выберите позу до тика — после фиксации изменить нельзя.
            </p>
          )}
          {open.map((eng) => (
            <ActiveEngagementCard
              key={eng.id}
              eng={eng}
              payload={payload}
              busy={busy}
              onSubmitStance={onSubmitStance}
              onOpenStanceRing={onOpenStanceRing}
              compact={!!filterSystemId}
            />
          ))}
        </div>
      )}

      {showHistory && recent.length > 0 && (
        <div className="eng-history-block">
          {!filterSystemId && (
            <h4 className="eng-history-title">Последние исходы</h4>
          )}
          {recent.map((eng) => {
            const sys = systemName(payload.world, eng.systemId);
            const theater = THEATER_LABELS[eng.theater] ?? eng.theater;
            return (
              <div key={eng.id} className="order-card eng-card eng-card-history">
                <div>
                  <strong>
                    {theater} · {sys}
                    {eng.result?.outcome ? ` · ${eng.result.outcome}` : ""}
                  </strong>
                  <br />
                  <span className="hint">
                    потери A: {lossLine(eng.result?.lossesA)} · B:{" "}
                    {lossLine(eng.result?.lossesB)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function countOpenEngagements(
  engagements: ViewerEngagement[],
  factionId: string,
): number {
  return engagements.filter(
    (e) =>
      isOpenEngagement(e) &&
      e.sides.some((s) => s.factionId === factionId),
  ).length;
}
