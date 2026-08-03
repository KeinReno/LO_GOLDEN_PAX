import { useMemo, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useWorldStore } from "../state/worldStore";
import { DIPLOMACY_LABELS, DIPLOMACY_RELATIONS } from "../state/defaults";
import type {
  DiplomacyEvent,
  DiplomacyRelation,
  Faction,
  Treaty,
} from "../state/types";
import { CardBoard } from "../ui/cardBoardContext";
import { DragCard } from "../ui/DragCard";
import { DropZone } from "../ui/DropZone";
import { HoldButton } from "../ui/HoldButton";
import { useSpotlight } from "../ui/aceternityFx";

function getRelation(
  edges: { aId: string; bId: string; relation: DiplomacyRelation }[],
  a: string,
  b: string,
): DiplomacyRelation {
  const [x, y] = a < b ? [a, b] : [b, a];
  return edges.find((d) => d.aId === x && d.bId === y)?.relation ?? "neutral";
}

function opinionOf(fac: Faction | undefined, otherId: string): number {
  return fac?.diplomacy?.opinions?.[otherId] ?? 0;
}

function OpinionBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, ((value + 100) / 200) * 100));
  const tone =
    value >= 40 ? "good" : value <= -40 ? "bad" : value >= 10 ? "warm" : "cold";
  return (
    <div
      className={`diplo-opinion-bar diplo-opinion-bar--${tone}`}
      title={`${value}`}
    >
      <div className="diplo-opinion-bar__fill" style={{ width: `${pct}%` }} />
      <span className="diplo-opinion-bar__label">
        {value > 0 ? `+${value}` : value}
      </span>
    </div>
  );
}

function AnimatedTooltip({
  open,
  children,
}: {
  open: boolean;
  children: ReactNode;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="diplo-tooltip"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.18 }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function DiploTimeline({ events }: { events: DiplomacyEvent[] }) {
  if (!events.length) {
    return <p className="hint">Нет записанных событий.</p>;
  }
  return (
    <ol className="diplo-timeline">
      {events
        .slice()
        .reverse()
        .slice(0, 12)
        .map((e, i) => (
          <li key={`${e.turn}-${e.type}-${i}`} className="diplo-timeline__item">
            <span className="diplo-timeline__turn">Ход {e.turn}</span>
            <span className="diplo-timeline__label">{e.label}</span>
            {typeof e.opinionDelta === "number" && (
              <span
                className={`diplo-timeline__delta ${
                  e.opinionDelta >= 0 ? "is-plus" : "is-minus"
                }`}
              >
                {e.opinionDelta > 0 ? `+${e.opinionDelta}` : e.opinionDelta}
              </span>
            )}
          </li>
        ))}
    </ol>
  );
}

function needsAttention(
  fac: Faction,
  focusId: string | null,
  relation: DiplomacyRelation,
): boolean {
  if (relation === "war" || relation === "embargo") return true;
  const treaties = fac.diplomacy?.treaties ?? [];
  return treaties.some(
    (t: Treaty) =>
      (!focusId || t.withFactionId === focusId) &&
      t.expiresTurn != null &&
      t.expiresTurn > 0,
  );
}

const OFFER_TREATIES: DiplomacyRelation[] = [
  "trade",
  "alliance",
  "nap",
  "research_pact",
  "migration_treaty",
  "truce",
  "embargo",
  "war",
  "neutral",
];

/** GM diplomacy workbench — faction list + focus dossier (Endless Space–style). */
export function DiplomacyPanel() {
  const world = useWorldStore((s) => s.world);
  const open = useWorldStore((s) => s.diplomacyPanelOpen);
  const setOpen = useWorldStore((s) => s.setDiplomacyPanelOpen);
  const showDiplomacy = useWorldStore((s) => s.showDiplomacy);
  const toggleShowDiplomacy = useWorldStore((s) => s.toggleShowDiplomacy);
  const setDiplomacy = useWorldStore((s) => s.setDiplomacy);

  const [focusId, setFocusId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [compareId, setCompareId] = useState<string | null>(null);
  const [giveTreaty, setGiveTreaty] = useState<DiplomacyRelation | null>(null);
  const [wantTreaty, setWantTreaty] = useState<DiplomacyRelation | null>(null);
  const cardSpot = useSpotlight();

  const factions = world.factions;
  const focus = factions.find((f) => f.id === focusId) ?? null;
  const compare =
    factions.find((f) => f.id === (compareId || factions.find((x) => x.id !== focusId)?.id)) ??
    null;

  const focusHistory = useMemo(() => {
    if (!focus || !compare) return [] as DiplomacyEvent[];
    return (focus.diplomacy?.history ?? []).filter(
      (h) => h.withFactionId === compare.id,
    );
  }, [focus, compare]);

  const focusStats = useMemo(() => {
    if (!focus) return null;
    const fleets = (world.fleets ?? []).filter((f) => f.factionId === focus.id);
    const systems = (world.systems ?? []).filter(
      (s) => s.ownerFactionId === focus.id,
    );
    let pop = 0;
    for (const s of systems) {
      for (const p of s.planets ?? []) pop += p.population ?? 0;
    }
    const wars = (world.diplomacy ?? []).filter(
      (d) =>
        d.relation === "war" &&
        (d.aId === focus.id || d.bId === focus.id),
    ).length;
    const treaties = focus.diplomacy?.treaties?.length ?? 0;
    return {
      fleets: fleets.length,
      systems: systems.length,
      pop: Math.round(pop),
      wars,
      treaties,
    };
  }, [focus, world.fleets, world.systems, world.diplomacy]);

  if (!open) return null;

  const relation =
    focus && compare
      ? getRelation(world.diplomacy, focus.id, compare.id)
      : "neutral";

  const applyProposal = () => {
    if (!focus || !compare) return;
    const next = wantTreaty || giveTreaty;
    if (!next) return;
    setDiplomacy(focus.id, compare.id, next);
    setGiveTreaty(null);
    setWantTreaty(null);
  };

  const breakCurrent = () => {
    if (!focus || !compare) return;
    setDiplomacy(focus.id, compare.id, "neutral");
  };

  return (
    <div className="diplo-overlay">
      <div className="diplo-workbench">
        <div className="diplo-head">
          <h2>Дипломатия</h2>
          <label className="check">
            <input
              type="checkbox"
              checked={showDiplomacy}
              onChange={toggleShowDiplomacy}
            />
            Линии на карте
          </label>
          <button
            type="button"
            className="btn ghost"
            onClick={() => setOpen(false)}
          >
            Закрыть
          </button>
        </div>

        <div className="diplo-workbench__body">
          <aside className="diplo-faction-list" aria-label="Державы">
            {factions.map((f) => {
              const vs = compare ?? factions.find((x) => x.id !== f.id);
              const rel = vs
                ? getRelation(world.diplomacy, f.id, vs.id)
                : "neutral";
              const op = vs ? opinionOf(f, vs.id) : 0;
              const hot = needsAttention(f, vs?.id ?? null, rel);
              const selected = f.id === focusId;
              const claims = (f.diplomacy?.treaties ?? []).length;
              const wars = (world.diplomacy ?? []).filter(
                (d) =>
                  d.relation === "war" &&
                  (d.aId === f.id || d.bId === f.id),
              ).length;
              const glowColor =
                rel === "war"
                  ? "var(--danger)"
                  : rel === "embargo"
                    ? "var(--signal-raid, #e8a04c)"
                    : "var(--signal-warning, #e8c44c)";
              return (
                <div
                  key={f.id}
                  className={`diplo-faction-card fx-spotlight ${selected ? "is-selected" : ""} ${hot ? "is-glow fx-glow" : ""}`}
                  style={{ "--fx-glow-color": glowColor } as React.CSSProperties}
                  onMouseEnter={() => setHoverId(f.id)}
                  onMouseMove={cardSpot.bind.onMouseMove}
                  onMouseLeave={(e) => { setHoverId(null); cardSpot.bind.onMouseLeave(e); }}
                >
                  <button
                    type="button"
                    className="diplo-faction-card__btn"
                    onClick={() => setFocusId(f.id)}
                  >
                    {f.emblemPath ? (
                      <img
                        className="diplo-faction-card__emblem"
                        src={f.emblemPath}
                        alt=""
                      />
                    ) : (
                      <span
                        className="diplo-faction-card__swatch"
                        style={{ background: f.color }}
                      />
                    )}
                    <span className="diplo-faction-card__meta">
                      <strong>{f.name}</strong>
                      <span className="hint">
                        {f.kind === "faction" ? "фракция" : "государство"} ·{" "}
                        {DIPLOMACY_LABELS[rel]}
                        {claims > 0 ? ` · договоров ${claims}` : ""}
                        {wars > 0 ? ` · войн ${wars}` : ""}
                      </span>
                      <OpinionBar value={op} />
                    </span>
                  </button>
                  <AnimatedTooltip open={hoverId === f.id}>
                    <p>
                      <strong>{f.name}</strong>
                    </p>
                    <p className="hint">Opinion vs {vs?.name ?? "—"}</p>
                    <OpinionBar value={op} />
                    <p className="hint">{DIPLOMACY_LABELS[rel]}</p>
                  </AnimatedTooltip>
                </div>
              );
            })}
          </aside>

          <section className="diplo-dossier">
            {!focus ? (
              <p className="hint">Выберите державу слева.</p>
            ) : (
              <>
                <header className="diplo-dossier__head">
                  {focus.emblemPath ? (
                    <img
                      src={focus.emblemPath}
                      alt=""
                      className="diplo-dossier__emblem"
                    />
                  ) : (
                    <span
                      className="diplo-dossier__swatch"
                      style={{ background: focus.color }}
                    />
                  )}
                  <div>
                    <h3>{focus.name}</h3>
                    <p className="hint">
                      {focus.kind === "faction" ? "Фракция" : "Государство"}
                      {focus.primaryRaceId ? ` · ${focus.primaryRaceId}` : ""}
                    </p>
                    {focusStats && (
                      <p className="hint diplo-dossier__stats">
                        систем {focusStats.systems} · флот {focusStats.fleets} ·
                        нас. {focusStats.pop}
                        {focusStats.wars > 0
                          ? ` · войн ${focusStats.wars}`
                          : ""}
                      </p>
                    )}
                  </div>
                  <label className="field diplo-dossier__compare">
                    <span>Относительно</span>
                    <select
                      value={compare?.id ?? ""}
                      onChange={(e) => setCompareId(e.target.value)}
                    >
                      {factions
                        .filter((f) => f.id !== focus.id)
                        .map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name}
                          </option>
                        ))}
                    </select>
                  </label>
                </header>

                {compare && (
                  <div className="diplo-dossier__relation">
                    <h4>Отношение</h4>
                    <OpinionBar value={opinionOf(focus, compare.id)} />
                    <label className="field">
                      <span>Статус (мгновенно)</span>
                      <select
                        value={relation}
                        onChange={(e) =>
                          setDiplomacy(
                            focus.id,
                            compare.id,
                            e.target.value as DiplomacyRelation,
                          )
                        }
                      >
                        {DIPLOMACY_RELATIONS.map((r) => (
                          <option key={r} value={r}>
                            {DIPLOMACY_LABELS[r]}
                          </option>
                        ))}
                      </select>
                    </label>

                    <h4>Предложение</h4>
                    <p className="hint">
                      Перетащите договор в «Даю» / «Хочу», затем примените как
                      GM-статус между {focus.name} и {compare.name}.
                    </p>
                    <CardBoard>
                      <div className="diplo-gift-row">
                        <div className="diplo-gift-hand">
                          {OFFER_TREATIES.map((t) => (
                            <DragCard
                              key={t}
                              cardId={`treaty:${t}`}
                              title={DIPLOMACY_LABELS[t]}
                              subtitle="договор"
                              accent="var(--accent)"
                              tilt
                              onDropZone={(zoneId) => {
                                if (zoneId === "give") setGiveTreaty(t);
                                if (zoneId === "want") setWantTreaty(t);
                              }}
                            />
                          ))}
                        </div>
                        <div className="diplo-offer-zones">
                          <DropZone
                            zoneId="give"
                            label="Даю"
                            className="diplo-gift-zone"
                          >
                            <p className="hint">
                              {giveTreaty
                                ? DIPLOMACY_LABELS[giveTreaty]
                                : "пусто"}
                            </p>
                          </DropZone>
                          <DropZone
                            zoneId="want"
                            label="Хочу"
                            className="diplo-gift-zone"
                          >
                            <p className="hint">
                              {wantTreaty
                                ? DIPLOMACY_LABELS[wantTreaty]
                                : "пусто"}
                            </p>
                          </DropZone>
                        </div>
                      </div>
                    </CardBoard>
                    <div className="diplo-inbox__actions" style={{ marginTop: 8 }}>
                      <button
                        type="button"
                        className="btn primary"
                        disabled={!giveTreaty && !wantTreaty}
                        onClick={applyProposal}
                      >
                        Применить предложение
                      </button>
                      {relation !== "neutral" && (
                        <HoldButton
                          className="btn ghost"
                          ms={700}
                          onConfirm={breakCurrent}
                        >
                          Разорвать договор
                        </HoldButton>
                      )}
                    </div>

                    <h4>Хроника</h4>
                    <DiploTimeline events={focusHistory} />
                    <h4>Договоры</h4>
                    {(focus.diplomacy?.treaties ?? []).filter(
                      (t) => t.withFactionId === compare.id,
                    ).length === 0 ? (
                      <p className="hint">Нет активных договоров.</p>
                    ) : (
                      <ul className="diplo-treaty-list">
                        {(focus.diplomacy?.treaties ?? [])
                          .filter((t) => t.withFactionId === compare.id)
                          .map((t) => (
                            <li key={t.id}>
                              {DIPLOMACY_LABELS[t.type] ?? t.type}
                              {t.expiresTurn != null
                                ? ` · до хода ${t.expiresTurn}`
                                : " · бессрочно"}
                              {t.effects?.length
                                ? ` · эффектов ${t.effects.length}`
                                : ""}
                            </li>
                          ))}
                      </ul>
                    )}
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
