import { useMemo, type CSSProperties } from "react";
import type { FactionNpc, InternalBloc, ViewerPayload } from "../../state/types";
import { DropZone } from "../../ui/DropZone";
import { DragCard } from "../../ui/DragCard";
import { useSpotlight } from "../../ui/aceternityFx";

type NationRow = {
  raceId: string;
  label: string;
  leader: FactionNpc | null;
  fromBloc?: InternalBloc | null;
};

function raceLabel(
  raceId: string,
  payload: ViewerPayload,
  bloc?: InternalBloc | null,
): string {
  const race = (payload.world.races ?? []).find((r) => r.id === raceId);
  if (race?.name) return race.name;
  if (bloc?.name) return bloc.name;
  return raceId.replace(/^race_/, "").replace(/_/g, " ");
}

/**
 * Nations workplace — grid of peoples with drop-to-appoint (no orbit).
 */
export function CourtNationsView({
  npcs,
  blocs,
  payload,
  accent,
  selectedId,
  onSelect,
  onDropLeader,
  busy,
}: {
  npcs: FactionNpc[];
  blocs: InternalBloc[];
  payload: ViewerPayload;
  accent?: string;
  selectedId?: string | null;
  onSelect: (id: string | null) => void;
  onDropLeader: (npcId: string, raceId: string) => void;
  busy?: boolean;
}) {
  const rows = useMemo(() => {
    const map = new Map<string, NationRow>();
    for (const b of blocs) {
      for (const rid of b.raceIds ?? []) {
        if (!map.has(rid)) {
          map.set(rid, {
            raceId: rid,
            label: raceLabel(rid, payload, b),
            leader: null,
            fromBloc: b,
          });
        }
      }
    }
    for (const n of npcs) {
      const rid = n.raceLeadership?.raceId;
      if (!rid) continue;
      const existing = map.get(rid);
      if (existing) {
        existing.leader = n;
        if (n.raceLeadership?.title) {
          existing.label = `${raceLabel(rid, payload, existing.fromBloc)}`;
        }
      } else {
        map.set(rid, {
          raceId: rid,
          label: raceLabel(rid, payload),
          leader: n,
        });
      }
    }
    return [...map.values()].sort((a, b) =>
      a.label.localeCompare(b.label, "ru"),
    );
  }, [blocs, npcs, payload]);

  if (rows.length === 0) {
    return (
      <section className="court-nations" aria-label="Народы">
        <p className="hint court-empty-state">
          Нет народов в каноне державы. Дома с raceIds появятся здесь.
        </p>
      </section>
    );
  }

  return (
    <section className="court-nations" aria-label="Народы">
      <p className="hint court-nations__lede">
        Перетащите лицо из пула на народ — назначить голос. Клик — досье.
      </p>
      <ul className="court-nations-grid">
        {rows.map((row) => {
          const vacant = !row.leader;
          const title = row.leader?.raceLeadership?.title;
          return (
            <li key={row.raceId}>
              <DropZone
                zoneId={`nation:${row.raceId}`}
                accepts={["*"]}
                armWhileDragging
                onDrop={(cardId) => onDropLeader(cardId, row.raceId)}
                className={`court-nation-slot${vacant ? " is-vacant" : ""}`}
                contentLayout="stack"
                label={row.label}
              >
                <div className="court-nation-slot__head">
                  <strong>{row.label}</strong>
                  {title ? <span className="hint">{title}</span> : null}
                  {vacant ? (
                    <span className="hint">Нет лидера — drop сюда</span>
                  ) : null}
                </div>
                {row.leader ? (
                  <LeaderChip
                    npc={row.leader}
                    accent={row.fromBloc?.color || accent}
                    selected={selectedId === row.leader.id}
                    busy={busy}
                    onSelect={onSelect}
                  />
                ) : (
                  <div className="court-nation-slot__empty" aria-hidden>
                    +
                  </div>
                )}
              </DropZone>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function LeaderChip({
  npc,
  accent,
  selected,
  busy,
  onSelect,
}: {
  npc: FactionNpc;
  accent?: string;
  selected?: boolean;
  busy?: boolean;
  onSelect: (id: string | null) => void;
}) {
  const spot = useSpotlight();
  return (
    <DragCard
      cardId={npc.id}
      title={npc.name}
      subtitle={npc.raceLeadership?.title || npc.title}
      accent={accent}
      tilt
      className={`court-nation-drag fx-spotlight${selected ? " is-selected" : ""}`}
      icon={
        npc.avatarUrl ? (
          <img src={npc.avatarUrl} alt="" className="court-field-card__av" />
        ) : (
          <span className="court-field-card__av" aria-hidden>
            {(npc.name || "?").slice(0, 1).toUpperCase()}
          </span>
        )
      }
    >
      <button
        type="button"
        className="court-nation-slot__hit"
        disabled={busy}
        style={
          {
            ["--fx-spot-color" as string]: accent || "var(--accent)",
          } as CSSProperties
        }
        onClick={() => onSelect(selected ? null : npc.id)}
        {...spot.bind}
      >
        <strong>{npc.name}</strong>
      </button>
    </DragCard>
  );
}
