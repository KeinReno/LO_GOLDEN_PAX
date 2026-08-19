import { useMemo, type CSSProperties, type ReactNode } from "react";
import type { FactionNpc, ViewerPayload } from "../../state/types";
import { systemHasGovernor } from "../../state/courtGovernance";
import { DropZone } from "../../ui/DropZone";
import { DragCard } from "../../ui/DragCard";
import { useSpotlight } from "../../ui/aceternityFx";

type FieldKind = "governor" | "commander" | "admiral";

function targetLabel(npc: FactionNpc, payload: ViewerPayload): string {
  const p = npc.posting;
  if (!p) return "";
  if (p.kind === "governor" && p.systemId) {
    return (
      payload.world.systems.find((x) => x.id === p.systemId)?.name || p.systemId
    );
  }
  if (p.kind === "commander") {
    const id = p.legionId || p.forceId;
    if (!id) return "";
    return payload.world.legions.find((x) => x.id === id)?.name || id;
  }
  if (p.kind === "admiral") {
    const id = p.fleetId || p.forceId;
    if (!id) return "";
    return payload.world.fleets.find((x) => x.id === id)?.name || id;
  }
  return "";
}

type FieldAssignOpts = {
  kind: FieldKind;
  systemId?: string;
  legionId?: string;
  fleetId?: string;
};

/**
 * Field workplace — vacant click then pool «Назначить», or drop onto a post.
 * Drag posted NPC back to pool (handled by parent zone council:pool).
 */
export function CourtFieldView({
  npcs,
  payload,
  accent,
  selectedId,
  targetKey,
  onSelect,
  onVacantPick,
  onDropAssign,
  busy,
}: {
  npcs: FactionNpc[];
  payload: ViewerPayload;
  accent?: string;
  selectedId?: string | null;
  targetKey?: string | null;
  onSelect: (id: string | null) => void;
  onVacantPick?: (opts: FieldAssignOpts) => void;
  onDropAssign: (npcId: string, opts: FieldAssignOpts) => void;
  busy?: boolean;
}) {
  const ownedSystems = useMemo(
    () =>
      payload.world.systems.filter(
        (s) =>
          s.ownerFactionId === payload.factionId &&
          (s.planets ?? []).some((p) => (p.population || 0) > 0),
      ),
    [payload.world.systems, payload.factionId],
  );
  const ownedLegions = useMemo(
    () =>
      payload.world.legions.filter((l) => l.factionId === payload.factionId),
    [payload.world.legions, payload.factionId],
  );
  const ownedFleets = useMemo(
    () => payload.world.fleets.filter((f) => f.factionId === payload.factionId),
    [payload.world.fleets, payload.factionId],
  );

  const bySystem = useMemo(() => {
    const m = new Map<string, FactionNpc>();
    for (const n of npcs) {
      if (n.posting?.kind === "governor" && n.posting.systemId) {
        m.set(n.posting.systemId, n);
      }
    }
    return m;
  }, [npcs]);
  const byLegion = useMemo(() => {
    const m = new Map<string, FactionNpc>();
    for (const n of npcs) {
      if (n.posting?.kind === "commander") {
        const id = n.posting.legionId || n.posting.forceId;
        if (id) m.set(id, n);
      }
    }
    return m;
  }, [npcs]);
  const byFleet = useMemo(() => {
    const m = new Map<string, FactionNpc>();
    for (const n of npcs) {
      if (n.posting?.kind === "admiral") {
        const id = n.posting.fleetId || n.posting.forceId;
        if (id) m.set(id, n);
      }
    }
    return m;
  }, [npcs]);

  const ungoverned = ownedSystems.filter((s) => !systemHasGovernor(npcs, s.id));
  // Exact NPC ids — replaces "*" now that CardBoard is shared app-wide.
  const npcCardIds = useMemo(() => npcs.map((n) => n.id), [npcs]);

  return (
    <section className="court-field" aria-label="Поле">
      <p className="hint court-field__lede">
        Клик по вакансии, затем «Назначить» в пуле — или перетащите лицо на пост.
      </p>
      {ungoverned.length > 0 ? (
        <p className="court-field__alert hint" role="status">
          Без наместника:{" "}
          {ungoverned
            .slice(0, 6)
            .map((s) => s.name || s.id)
            .join(", ")}
          {ungoverned.length > 6 ? ` (+${ungoverned.length - 6})` : ""}
        </p>
      ) : null}

      <div className="court-field-cols">
        <FieldColumn
          title="Наместники"
          empty="Нет населённых систем"
          accent={accent}
        >
          {ownedSystems.length === 0 ? (
            <p className="hint court-field-col__empty">Нет систем</p>
          ) : (
            ownedSystems.map((s) => {
              const occ = bySystem.get(s.id);
              const vacant = !occ;
              return (
                <DropZone
                  key={s.id}
                  zoneId={`field:governor:${s.id}`}
                  accepts={npcCardIds}
                  armWhileDragging
                  onDrop={(cardId) =>
                    onDropAssign(cardId, {
                      kind: "governor",
                      systemId: s.id,
                    })
                  }
                  className={`court-field-slot${vacant ? " is-vacant" : ""}${
                    targetKey === `governor:${s.id}` ? " is-target" : ""
                  }`}
                  contentLayout="stack"
                  label={s.name || s.id}
                >
                  <SlotBody
                    label={s.name || s.id}
                    vacantHint="Нужен наместник"
                    npc={occ}
                    accent={accent}
                    selected={!!occ && selectedId === occ.id}
                    busy={busy}
                    payload={payload}
                    onSelect={onSelect}
                    onVacantPick={
                      vacant
                        ? () =>
                            onVacantPick?.({
                              kind: "governor",
                              systemId: s.id,
                            })
                        : undefined
                    }
                  />
                </DropZone>
              );
            })
          )}
        </FieldColumn>

        <FieldColumn title="Командующие" empty="Нет легионов" accent={accent}>
          {ownedLegions.length === 0 ? (
            <p className="hint court-field-col__empty">Нет легионов</p>
          ) : (
            ownedLegions.map((l) => {
              const occ = byLegion.get(l.id);
              return (
                <DropZone
                  key={l.id}
                  zoneId={`field:commander:${l.id}`}
                  accepts={npcCardIds}
                  armWhileDragging
                  onDrop={(cardId) =>
                    onDropAssign(cardId, {
                      kind: "commander",
                      legionId: l.id,
                    })
                  }
                  className={`court-field-slot${!occ ? " is-vacant" : ""}${
                    targetKey === `commander:${l.id}` ? " is-target" : ""
                  }`}
                  contentLayout="stack"
                  label={l.name || l.id}
                >
                  <SlotBody
                    label={l.name || l.id}
                    vacantHint="Нужен командующий"
                    npc={occ}
                    accent={accent}
                    selected={!!occ && selectedId === occ.id}
                    busy={busy}
                    payload={payload}
                    onSelect={onSelect}
                    onVacantPick={
                      !occ
                        ? () =>
                            onVacantPick?.({
                              kind: "commander",
                              legionId: l.id,
                            })
                        : undefined
                    }
                  />
                </DropZone>
              );
            })
          )}
        </FieldColumn>

        <FieldColumn title="Флотоводцы" empty="Нет флотов" accent={accent}>
          {ownedFleets.length === 0 ? (
            <p className="hint court-field-col__empty">Нет флотов</p>
          ) : (
            ownedFleets.map((f) => {
              const occ = byFleet.get(f.id);
              return (
                <DropZone
                  key={f.id}
                  zoneId={`field:admiral:${f.id}`}
                  accepts={npcCardIds}
                  armWhileDragging
                  onDrop={(cardId) =>
                    onDropAssign(cardId, {
                      kind: "admiral",
                      fleetId: f.id,
                    })
                  }
                  className={`court-field-slot${!occ ? " is-vacant" : ""}${
                    targetKey === `admiral:${f.id}` ? " is-target" : ""
                  }`}
                  contentLayout="stack"
                  label={f.name || f.id}
                >
                  <SlotBody
                    label={f.name || f.id}
                    vacantHint="Нужен адмирал"
                    npc={occ}
                    accent={accent}
                    selected={!!occ && selectedId === occ.id}
                    busy={busy}
                    payload={payload}
                    onSelect={onSelect}
                    onVacantPick={
                      !occ
                        ? () =>
                            onVacantPick?.({
                              kind: "admiral",
                              fleetId: f.id,
                            })
                        : undefined
                    }
                  />
                </DropZone>
              );
            })
          )}
        </FieldColumn>
      </div>
    </section>
  );
}

function FieldColumn({
  title,
  children,
}: {
  title: string;
  empty?: string;
  accent?: string;
  children: ReactNode;
}) {
  return (
    <div className="court-field-col">
      <header className="court-field-col__head">
        <h3>{title}</h3>
      </header>
      <div className="court-field-col__body">{children}</div>
    </div>
  );
}

function SlotBody({
  label,
  vacantHint,
  npc,
  accent,
  selected,
  busy,
  payload,
  onSelect,
  onVacantPick,
}: {
  label: string;
  vacantHint: string;
  npc?: FactionNpc;
  accent?: string;
  selected?: boolean;
  busy?: boolean;
  payload: ViewerPayload;
  onSelect: (id: string | null) => void;
  onVacantPick?: () => void;
}) {
  const spot = useSpotlight();
  if (!npc) {
    return (
      <button
        type="button"
        className="court-field-slot__empty"
        disabled={busy}
        onClick={onVacantPick}
      >
        <strong>{label}</strong>
        <span className="hint">{vacantHint} · выбрать</span>
      </button>
    );
  }
  const where = targetLabel(npc, payload);
  return (
    <DragCard
      cardId={npc.id}
      title={npc.name}
      subtitle={where || npc.title || label}
      accent={accent}
      tilt
      className={`court-field-drag fx-spotlight${selected ? " is-selected" : ""}`}
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
        className="court-field-slot__hit"
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
        <span className="hint">{label}</span>
      </button>
    </DragCard>
  );
}
