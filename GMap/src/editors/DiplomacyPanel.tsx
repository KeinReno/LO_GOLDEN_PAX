import { useEffect, useMemo, useState } from "react";
import { useWorldStore } from "../state/worldStore";
import { DIPLOMACY_LABELS, DIPLOMACY_RELATIONS, ECONOMIC_RELATIONS } from "../state/defaults";
import type { DiplomacyEvent, DiplomacyRelation, Faction, Treaty } from "../state/types";
import { CardBoard } from "../ui/cardBoardContext";
import { DragCard } from "../ui/DragCard";
import { DropZone } from "../ui/DropZone";
import { BackgroundBeamsLite } from "../ui/BackgroundBeamsLite";
import { HoldButton } from "../ui/HoldButton";
import {
  DiploTimeline,
  DiploAttitudeLabel,
  DiploLeaderCard,
  opinionOf,
  OpinionBar,
  RelationBadge,
} from "../viewer/diploUiShared";

function getRelation(
  edges: { aId: string; bId: string; relation: DiplomacyRelation }[],
  a: string,
  b: string,
): DiplomacyRelation {
  const [x, y] = a < b ? [a, b] : [b, a];
  return edges.find((d) => d.aId === x && d.bId === y)?.relation ?? "neutral";
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

/** GM diplomacy workbench — Galactic Civilizations layout. */
export function DiplomacyPanel() {
  const world = useWorldStore((s) => s.world);
  const open = useWorldStore((s) => s.diplomacyPanelOpen);
  const gmShellMode = useWorldStore((s) => s.gmShellMode);
  const setOpen = useWorldStore((s) => s.setDiplomacyPanelOpen);
  const showDiplomacy = useWorldStore((s) => s.showDiplomacy);
  const toggleShowDiplomacy = useWorldStore((s) => s.toggleShowDiplomacy);
  const setDiplomacy = useWorldStore((s) => s.setDiplomacy);
  const setEconomicRelation = useWorldStore((s) => s.setEconomicRelation);

  const [focusId, setFocusId] = useState<string | null>(null);
  const [compareId, setCompareId] = useState<string | null>(null);
  const [giveTreaty, setGiveTreaty] = useState<DiplomacyRelation | null>(null);
  const [wantTreaty, setWantTreaty] = useState<DiplomacyRelation | null>(null);
  const [econQuote, setEconQuote] = useState("1");

  const factions = world.factions;
  const focus = factions.find((f) => f.id === focusId) ?? null;
  const compare =
    factions.find((f) => f.id === (compareId || factions.find((x) => x.id !== focusId)?.id)) ??
    null;

  // Pick a focus when the panel opens so the list isn't a dead empty state.
  useEffect(() => {
    if (!open) return;
    if (focusId && factions.some((f) => f.id === focusId)) return;
    const first = factions[0]?.id ?? null;
    setFocusId(first);
  }, [open, focusId, factions]);

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

  if (!open || gmShellMode !== "gm") return null;

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
      <div className="diplo-workbench gc-diplo">
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

        {focus && compare && (
          <header
            className="gc-diplo-faceoff gc-diplo-faceoff--beams"
            aria-label="Пара держав"
          >
            <BackgroundBeamsLite />
            <DiploLeaderCard faction={focus} align="start" />
            <div className="gc-diplo-status">
              <RelationBadge relation={relation} />
              <DiploAttitudeLabel
                opinion={opinionOf(focus, compare.id)}
              />
              <OpinionBar value={opinionOf(focus, compare.id)} />
            </div>
            <DiploLeaderCard faction={compare} align="end" />
          </header>
        )}

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
                  className={`diplo-faction-card ${selected ? "is-selected" : ""} ${hot ? "is-glow fx-glow" : ""}`}
                  style={{ "--fx-glow-color": glowColor } as React.CSSProperties}
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

                    <h4>Экономический трек</h4>
                    <p className="hint">
                      Отдельно от политического статуса. Бартер — без договора;
                      котировка замораживает курс; союз принимает пег соседа.
                    </p>
                    <label className="field">
                      <span>Курс (quote / base)</span>
                      <input
                        type="number"
                        min={0.01}
                        step={0.1}
                        value={econQuote}
                        onChange={(e) => setEconQuote(e.target.value)}
                      />
                    </label>
                    <div className="diplo-inbox__actions">
                      {ECONOMIC_RELATIONS.map((kind) => (
                        <button
                          key={kind}
                          type="button"
                          className="btn ghost"
                          onClick={() =>
                            setEconomicRelation(focus.id, compare.id, kind, {
                              unitsQuotePerBase: Number(econQuote) || 1,
                            })
                          }
                        >
                          {DIPLOMACY_LABELS[kind]}
                        </button>
                      ))}
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() =>
                          setEconomicRelation(focus.id, compare.id, "none")
                        }
                      >
                        Снять экономический
                      </button>
                    </div>

                    <h4>Стол переговоров (GM)</h4>
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
                    <div className="diplo-gm-apply diplo-inbox__actions">
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
